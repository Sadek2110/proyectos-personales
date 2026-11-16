/**
 * Life OS — servidor web (Node >= 20, sin dependencias).
 *
 * - Sirve la app (public/) solo tras iniciar sesión con contraseña.
 * - /api/:fn reenvía la llamada a la API de Google Apps Script (apps-script/Api.gs)
 *   añadiendo el token secreto, que nunca llega al navegador.
 *
 * Variables de entorno:
 *   APP_PASSWORD       contraseña para entrar en la app (obligatoria)
 *   SESSION_SECRET     secreto para firmar la cookie de sesión (obligatoria, >= 32 caracteres)
 *   APPS_SCRIPT_URL    URL /exec de la implementación de Apps Script
 *   APPS_SCRIPT_TOKEN  mismo valor que la propiedad API_TOKEN del script
 *   COOKIE_SECURE      "false" solo para pruebas en http://localhost (por defecto true)
 *   DEMO               "true" para servir datos de ejemplo sin Google (pruebas locales)
 *   PORT               puerto (por defecto 3000)
 */
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ENV = {
  port: Number(process.env.PORT) || 3000,
  password: process.env.APP_PASSWORD || '',
  secret: process.env.SESSION_SECRET || '',
  gasUrl: process.env.APPS_SCRIPT_URL || '',
  gasToken: process.env.APPS_SCRIPT_TOKEN || '',
  cookieSecure: process.env.COOKIE_SECURE !== 'false',
  demo: process.env.DEMO === 'true',
};
if (!ENV.password || ENV.secret.length < 32) {
  console.error('Faltan APP_PASSWORD y/o SESSION_SECRET (>= 32 caracteres).');
  process.exit(1);
}

const PUBLIC_DIR = path.join(__dirname, 'public');
const COOKIE = 'lifeos_session';
const SESSION_DAYS = 180;
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
  '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
]);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
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
  'Permissions-Policy': 'camera=(), microphone=()',
};
function enviar(res, status, cuerpo, cabeceras = {}) {
  res.writeHead(status, { ...SEGURIDAD, ...cabeceras });
  res.end(cuerpo);
}
function json(res, status, obj) {
  enviar(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
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
function servirArchivo(res, ruta) {
  const archivo = path.join(PUBLIC_DIR, ruta);
  if (!archivo.startsWith(PUBLIC_DIR + path.sep)) return enviar(res, 404, 'No encontrado');
  fs.readFile(archivo, (err, datos) => {
    if (err) return enviar(res, 404, 'No encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
    const ext = path.extname(archivo);
    const cache = ext === '.png' || ext === '.svg' ? 'public, max-age=604800' : 'no-cache';
    enviar(res, 200, datos, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
  });
}

// ------------------------------------------------------------------ API -> Google Apps Script

async function llamarGoogle(fn, args) {
  if (ENV.demo) return demo(fn, args);
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

// Datos de ejemplo en memoria para probar sin Google (DEMO=true).
const DEMO_DATOS = { compras: [], tareas: [], eventos: [], clase: {} };
function demo(fn, args) {
  const id = () => crypto.randomBytes(4).toString('hex');
  const [a, b] = args;
  switch (fn) {
    case 'obtenerDatos': return { compras: DEMO_DATOS.compras, tareas: DEMO_DATOS.tareas };
    case 'obtenerEventos': return DEMO_DATOS.eventos;
    case 'obtenerRutas': return [];
    case 'guardarRuta': case 'recalcularRuta': throw new Error('En modo demo no se calculan rutas');
    case 'borrarRuta': return true;
    case 'obtenerCalendarios': return [{ id: 'demo', nombre: 'Principal', color: '#2F6B4F', principal: true }];
    case 'guardarProducto': case 'guardarTarea': {
      const lista = fn === 'guardarProducto' ? DEMO_DATOS.compras : DEMO_DATOS.tareas;
      const obj = { ...a, id: a.id || id() };
      const i = lista.findIndex(x => x.id === obj.id);
      if (i >= 0) lista[i] = obj; else lista.push(obj);
      return obj;
    }
    case 'cambiarStock': { const p = DEMO_DATOS.compras.find(x => x.id === a); if (p) p.stock = b; return true; }
    case 'marcarTarea': { const t = DEMO_DATOS.tareas.find(x => x.id === a); if (t) t.completada = !!b; return true; }
    case 'borrarProducto': DEMO_DATOS.compras = DEMO_DATOS.compras.filter(x => x.id !== a); return true;
    case 'borrarTarea': DEMO_DATOS.tareas = DEMO_DATOS.tareas.filter(x => x.id !== a); return true;
    case 'crearEvento': { const e = { ...a, id: id(), diaCompleto: false, recurrente: false }; DEMO_DATOS.eventos.push(e); return e; }
    case 'borrarEvento': DEMO_DATOS.eventos = DEMO_DATOS.eventos.filter(x => x.id !== a); return true;
    case 'obtenerClase': return DEMO_DATOS.clase;
    case 'marcarClase': [].concat(a).forEach(k => { if (b) DEMO_DATOS.clase[k] = true; else delete DEMO_DATOS.clase[k]; }); return true;
  }
}

// ------------------------------------------------------------------ Rutas

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ruta = decodeURIComponent(url.pathname);

  try {
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
    if (req.method === 'GET' && PUBLIC_FILES.has(ruta)) return servirArchivo(res, ruta);

    const autenticado = sesionValida(req);

    if (ruta.startsWith('/api/')) {
      if (!autenticado) return json(res, 401, { ok: false, error: 'Sesión caducada' });
      if (req.method !== 'POST' || !String(req.headers['content-type']).startsWith('application/json')) {
        return json(res, 405, { ok: false, error: 'Método no permitido' });
      }
      const fn = ruta.slice(5);
      if (!API_FNS.has(fn)) return json(res, 404, { ok: false, error: 'Función desconocida' });
      const { args = [] } = JSON.parse((await leerCuerpo(req)) || '{}');
      try {
        return json(res, 200, { ok: true, data: await llamarGoogle(fn, Array.isArray(args) ? args : []) });
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
});
