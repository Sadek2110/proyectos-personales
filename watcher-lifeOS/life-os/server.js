/**
 * Life OS — servidor web (Node >= 20).
 *
 * - Sirve la app ya compilada (dist/, sale de "npm run build") solo tras iniciar sesión.
 * - /api/:fn reenvía la llamada a la API de Google Apps Script (apps-script/Api.gs)
 *   añadiendo el token secreto, que nunca llega al navegador.
 * - /api/agente/:fn y /mcp son el agente con Gemini, los avisos y el servidor MCP (agente/).
 *
 * Variables de entorno:
 *   APP_PASSWORD       contraseña para entrar en la app (obligatoria)
 *   SESSION_SECRET     secreto para firmar la cookie de sesión (obligatoria, >= 32 caracteres)
 *   APPS_SCRIPT_URL    URL /exec de la implementación de Apps Script
 *   APPS_SCRIPT_TOKEN  mismo valor que la propiedad API_TOKEN del script
 *   COOKIE_SECURE      "false" solo para pruebas en http://localhost (por defecto true)
 *   DEMO               "true" para servir datos de ejemplo sin Google (pruebas locales)
 *   PORT               puerto (por defecto 3000)
 *   GEMINI_API_KEY     clave de Google AI Studio; sin ella el chat no responde y el resumen es una lista simple
 *   GEMINI_MODEL       modelo principal (por defecto gemini-3.8-flash)
 *   GEMINI_MODEL_RESERVA  modelo si el principal se queda sin cuota (por defecto gemini-3.5-flash-lite)
 *   DATA_DIR           carpeta del estado del agente (por defecto .data; en Docker, el volumen /data)
 *   APP_URL            dirección pública (por defecto https://lifeos.dksaa.com)
 */
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { crearAgente, crearModelo } = require('./agente/index.js');

const ENV = {
  port: Number(process.env.PORT) || 3000,
  password: process.env.APP_PASSWORD || '',
  secret: process.env.SESSION_SECRET || '',
  gasUrl: process.env.APPS_SCRIPT_URL || '',
  gasToken: process.env.APPS_SCRIPT_TOKEN || '',
  cookieSecure: process.env.COOKIE_SECURE !== 'false',
  demo: process.env.DEMO === 'true',
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModelo: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  geminiReserva: process.env.GEMINI_MODEL_RESERVA || 'gemini-3.5-flash-lite',
  dataDir: process.env.DATA_DIR || path.join(__dirname, '.data'),
  appUrl: process.env.APP_URL || 'https://lifeos.dksaa.com',
  ingestaToken: process.env.INGESTA_TOKEN || '',
  watcherUrl: process.env.WATCHER_URL || '',
};
if (!ENV.password || ENV.secret.length < 32) {
  console.error('Faltan APP_PASSWORD y/o SESSION_SECRET (>= 32 caracteres).');
  process.exit(1);
}

const PUBLIC_DIR = path.join(__dirname, 'dist');
const COOKIE = 'lifeos_session';
const SESSION_DAYS = 180;
const MAX_AUDIO = 2 * 1024 * 1024; // 2 min de voz a 32 kbps, en base64, con margen
const API_FNS = new Set([
  'obtenerDatos', 'guardarProducto', 'cambiarStock', 'borrarProducto',
  'guardarTarea', 'marcarTarea', 'borrarTarea',
  'obtenerEventos', 'crearEvento', 'borrarEvento', 'obtenerCalendarios',
  'obtenerRutas', 'guardarRuta', 'recalcularRuta', 'borrarRuta',
  'obtenerClase', 'marcarClase',
]);
// Archivos accesibles sin sesión (los pide el navegador sin cookies o antes de entrar).
const PUBLIC_FILES = new Set([
  '/login.html', '/manifest.webmanifest', '/sw.js',
  '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png', '/badge.png',
]);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.woff2': 'font/woff2',
};

// ------------------------------------------------------------------ Sesión

function firmar(valor) {
  return crypto.createHmac('sha256', ENV.secret).update(valor).digest('base64url');
}
function crearSesion() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return `${exp}.${firmar(exp)}`;
}
function sesionValida(req) {
  const m = /(?:^|;\s*)lifeos_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, firma] = m[1].split('.');
  if (!exp || !firma || Number(exp) < Date.now()) return false;
  return igual(firma, firmar(exp));
}
function igual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function cookie(valor, maxAge) {
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${ENV.cookieSecure ? '; Secure' : ''}`;
}

// Límite de intentos de login por IP: 10 cada 15 minutos.
const intentos = new Map();
function bloqueado(ip) {
  const ahora = Date.now();
  const r = intentos.get(ip);
  if (!r || ahora > r.hasta) { intentos.set(ip, { n: 1, hasta: ahora + 15 * 60e3 }); return false; }
  r.n++;
  return r.n > 10;
}
setInterval(() => { const a = Date.now(); for (const [k, v] of intentos) if (a > v.hasta) intentos.delete(k); }, 60e3).unref();

// ------------------------------------------------------------------ Utilidades HTTP

const SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(self)',
};
function enviar(res, status, cuerpo, cabeceras = {}) {
  res.writeHead(status, { ...SEGURIDAD, ...cabeceras });
  res.end(cuerpo);
}
const aceptaGzip = res => (res.req.headers['accept-encoding'] || '').includes('gzip');
function json(res, status, obj) {
  const cabeceras = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const cuerpo = JSON.stringify(obj);
  if (cuerpo.length < 1024 || !aceptaGzip(res)) return enviar(res, status, cuerpo, cabeceras);
  zlib.gzip(cuerpo, (err, comprimido) => {
    if (err) return enviar(res, status, cuerpo, cabeceras);
    enviar(res, status, comprimido, { ...cabeceras, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
  });
}
function redirigir(res, destino, cabeceras = {}) {
  enviar(res, 303, '', { Location: destino, ...cabeceras });
}
function leerCuerpo(req, max = 100 * 1024) {
  return new Promise((ok, ko) => {
    let datos = '';
    req.setEncoding('utf8');
    req.on('data', c => { datos += c; if (datos.length > max) { ko(new Error('Petición demasiado grande')); req.destroy(); } });
    req.on('end', () => ok(datos));
    req.on('error', ko);
  });
}
function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}
const COMPRIMIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);
const gzipEnMemoria = new Map(); // dist/ no cambia mientras el contenedor vive
function cacheDe(ruta, ext) {
  if (ruta.startsWith('/assets/')) return 'private, max-age=31536000, immutable'; // llevan hash en el nombre
  if (ruta.startsWith('/fonts/')) return 'public, max-age=2592000';
  return ext === '.png' || ext === '.svg' ? 'public, max-age=604800' : 'no-cache';
}
function servirArchivo(res, ruta) {
  const archivo = path.join(PUBLIC_DIR, ruta);
  if (!archivo.startsWith(PUBLIC_DIR + path.sep)) return enviar(res, 404, 'No encontrado');
  fs.readFile(archivo, (err, datos) => {
    if (err) return enviar(res, 404, 'No encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
    const ext = path.extname(archivo);
    const cabeceras = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cacheDe(ruta, ext) };
    if (!COMPRIMIBLE.has(ext) || !aceptaGzip(res)) return enviar(res, 200, datos, cabeceras);
    if (!gzipEnMemoria.has(archivo)) gzipEnMemoria.set(archivo, zlib.gzipSync(datos, { level: 9 }));
    enviar(res, 200, gzipEnMemoria.get(archivo), { ...cabeceras, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
  });
}

// ------------------------------------------------------------------ API -> Google Apps Script

async function llamarGoogle(fn, args) {
  if (ENV.demo) return require('./demo.js')(fn, args);
  if (!ENV.gasUrl || !ENV.gasToken) throw new Error('El servidor aún no está conectado a Google (faltan APPS_SCRIPT_URL / APPS_SCRIPT_TOKEN).');
  // Apps Script responde con un 302 a googleusercontent.com; fetch lo sigue con GET, que es lo esperado.
  const r = await fetch(ENV.gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: ENV.gasToken, fn, args }),
    redirect: 'follow',
    signal: AbortSignal.timeout(60e3),
  });
  const texto = await r.text();
  let cuerpo;
  try { cuerpo = JSON.parse(texto); } catch {
    throw new Error('Google no devolvió JSON. ¿La implementación tiene acceso "Cualquier usuario"?');
  }
  if (!cuerpo.ok) throw new Error(cuerpo.error || 'Error en Google Apps Script');
  return cuerpo.data;
}

// ------------------------------------------------------------------ Agente

function modeloDisponible() {
  if (ENV.geminiKey) return crearModelo({ apiKey: ENV.geminiKey, modelo: ENV.geminiModelo, reserva: ENV.geminiReserva });
  return ENV.demo ? require('./demo.js').modelo : null;
}

const agente = crearAgente({
  llamarGoogle, modelo: modeloDisponible(), directorio: ENV.dataDir, urlApp: ENV.appUrl, tz: 'Europe/Madrid', igual, leerCuerpo, json,
});

// ------------------------------------------------------------------ Rutas

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const ruta = decodeURIComponent(url.pathname);
    if (ruta === '/healthz') return enviar(res, 200, 'ok', { 'Content-Type': 'text/plain' });

    if (ruta === '/login' && req.method === 'POST') {
      if (bloqueado(ipDe(req))) return redirigir(res, '/login.html?e=bloqueado');
      const pass = new URLSearchParams(await leerCuerpo(req, 4096)).get('password') || '';
      if (!igual(pass, ENV.password)) return redirigir(res, '/login.html?e=1');
      intentos.delete(ipDe(req));
      return redirigir(res, '/', { 'Set-Cookie': cookie(crearSesion(), SESSION_DAYS * 86400) });
    }
    if (ruta === '/logout' && req.method === 'POST') {
      return redirigir(res, '/login.html', { 'Set-Cookie': cookie('', 0) });
    }
    if (ruta === '/login') return redirigir(res, '/login.html');
    if (req.method === 'GET' && (PUBLIC_FILES.has(ruta) || ruta.startsWith('/fonts/'))) return servirArchivo(res, ruta);
    if (ruta === '/mcp') return await agente.mcp(req, res); // se autentica con su propio token, no con la cookie

    if (ruta === '/api/ingesta/clase' && req.method === 'POST') {
      const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
      if (!ENV.ingestaToken || !m || !igual(m[1].trim(), ENV.ingestaToken)) {
        return json(res, 401, { ok: false, error: 'No autorizado' });
      }
      const cuerpo = JSON.parse((await leerCuerpo(req, 10 * 1024 * 1024)) || '{}');
      const resultado = agente.ingestarClase(cuerpo);
      if (typeof agente.revisarPlanificador === 'function') {
        agente.revisarPlanificador().catch(() => {});
      }
      return json(res, 200, { ok: true, data: resultado });
    }

    if (ruta === '/api/descarga/teoria' && req.method === 'GET') {
      const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
      const esTokenValido = (ENV.ingestaToken && m && igual(m[1].trim(), ENV.ingestaToken));
      const autenticado = sesionValida(req);
      if (!esTokenValido && !autenticado) {
        return json(res, 401, { ok: false, error: 'No autorizado' });
      }
      try {
        const urlWatcher = `${(ENV.watcherUrl || 'http://paginas_sencillas_course-watcher:3001').replace(/\/+$/, '')}/descarga/teoria`;
        const r = await fetch(urlWatcher, {
          headers: ENV.ingestaToken ? { Authorization: `Bearer ${ENV.ingestaToken}` } : {},
        });
        if (!r.ok) return json(res, r.status, { ok: false, error: 'Error al obtener teoria del watcher' });
        const { Readable } = require('node:stream');
        res.writeHead(200, {
          'Content-Type': 'application/gzip',
          'Content-Disposition': 'attachment; filename="teoria_completa.tar.gz"',
        });
        Readable.fromWeb(r.body).pipe(res);
        return;
      } catch (e) {
        return json(res, 500, { ok: false, error: e.message });
      }
    }

    const autenticado = sesionValida(req);

    if (ruta === '/api/clase/temario' && (req.method === 'GET' || req.method === 'POST')) {
      if (!autenticado) return json(res, 401, { ok: false, error: 'Sesión caducada' });
      return json(res, 200, { ok: true, data: agente.temario() });
    }

    if (ruta === '/api/clase/refrescar' && req.method === 'POST') {
      if (!autenticado) return json(res, 401, { ok: false, error: 'Sesión caducada' });
      let datosWatcher = null;
      if (ENV.watcherUrl) {
        try {
          const r = await fetch(`${ENV.watcherUrl.replace(/\/+$/, '')}/ejecutar`, {
            method: 'POST',
            headers: ENV.ingestaToken ? { Authorization: `Bearer ${ENV.ingestaToken}` } : {},
          });
          const texto = await r.text();
          try {
            datosWatcher = texto ? JSON.parse(texto) : null;
          } catch {
            datosWatcher = { raw: texto };
          }
          if (!r.ok) {
            throw new Error(datosWatcher?.error || `Error ${r.status} en Course Watcher`);
          }
        } catch (e) {
          return json(res, 424, { ok: false, error: e.message });
        }
      }
      return json(res, 200, {
        ok: true,
        data: {
          disparado: Boolean(ENV.watcherUrl),
          watcher: datosWatcher,
          temario: agente.temario(),
        },
      });
    }

    if (ruta.startsWith('/api/')) {
      if (!autenticado) return json(res, 401, { ok: false, error: 'Sesión caducada' });
      if (req.method !== 'POST' || !String(req.headers['content-type']).startsWith('application/json')) {
        return json(res, 405, { ok: false, error: 'Método no permitido' });
      }
      const fn = ruta.slice(5);
      const fnAgente = fn.startsWith('agente/') && agente.tiene(fn.slice(7)) ? fn.slice(7) : null;
      if (!fnAgente && !API_FNS.has(fn)) return json(res, 404, { ok: false, error: 'Función desconocida' });
      const { args = [] } = JSON.parse((await leerCuerpo(req, fnAgente === 'transcribir' ? MAX_AUDIO : undefined)) || '{}');
      const lista = Array.isArray(args) ? args : [];
      try {
        return json(res, 200, { ok: true, data: await (fnAgente ? agente.llamar(fnAgente, lista) : llamarGoogle(fn, lista)) });
      } catch (e) {
        console.error(`[api] ${fn}:`, e.message);
        // 424 y no 502: el proxy de Easypanel sustituye los 502 por su propia página de error.
        return json(res, 424, { ok: false, error: e.message });
      }
    }

    if (req.method !== 'GET') return enviar(res, 405, 'Método no permitido');
    if (!autenticado) return redirigir(res, '/login.html');
    return servirArchivo(res, ruta === '/' ? '/index.html' : ruta);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { ok: false, error: 'Error interno' });
  }
});

servidor.listen(ENV.port, () => {
  console.log(`Life OS escuchando en :${ENV.port}${ENV.demo ? ' (DEMO)' : ''}`);
  agente.iniciar();
});
