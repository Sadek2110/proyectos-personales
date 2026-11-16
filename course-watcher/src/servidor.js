'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

function igual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function responderJson(res, status, payload) {
  const cuerpo = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

/**
 * Crea el servidor HTTP ligero de observabilidad y control para Course Watcher.
 *
 * - GET /healthz -> 200 { ok: true, actualizado, fuentes }
 * - POST /ejecutar -> verifica Authorization: Bearer <ingestaToken> y ejecuta ciclo forzado
 */
function crearServidorWatcher({ demonio, almacenEstado, ingestaToken } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const metodo = (req.method || 'GET').toUpperCase();

      if (metodo === 'GET' && url.pathname === '/healthz') {
        const estado = almacenEstado ? almacenEstado.leer() : { actualizado: null, fuentes: {} };
        return responderJson(res, 200, {
          ok: true,
          actualizado: estado.actualizado || null,
          fuentes: estado.fuentes || {},
        });
      }

      if (metodo === 'GET' && url.pathname === '/descarga/teoria') {
        const authHeader = String(req.headers?.authorization || '');
        const tokenRecibido = authHeader.startsWith('Bearer ')
          ? authHeader.slice('Bearer '.length).trim()
          : '';

        if (!ingestaToken || !tokenRecibido || !igual(tokenRecibido, ingestaToken)) {
          return responderJson(res, 401, { ok: false, error: 'No autorizado' });
        }
        const fsMod = require('node:fs');
        const rutaArchivo = fsMod.existsSync('/data/teoria_docs.tar.gz')
          ? '/data/teoria_docs.tar.gz'
          : '/tmp/teoria_docs.tar.gz';
        if (!fsMod.existsSync(rutaArchivo)) {
          return responderJson(res, 404, { ok: false, error: 'Archivo de teoria no disponible' });
        }
        res.writeHead(200, {
          'Content-Type': 'application/gzip',
          'Content-Disposition': 'attachment; filename="teoria_completa.tar.gz"',
        });
        fsMod.createReadStream(rutaArchivo).pipe(res);
        return;
      }

      if (metodo === 'POST' && url.pathname === '/ejecutar') {
        const authHeader = String(req.headers?.authorization || '');
        const tokenRecibido = authHeader.startsWith('Bearer ')
          ? authHeader.slice('Bearer '.length).trim()
          : '';

        if (!ingestaToken || !tokenRecibido || !igual(tokenRecibido, ingestaToken)) {
          return responderJson(res, 401, {
            ok: false,
            error: 'No autorizado',
          });
        }

        const data = demonio
          ? await demonio.ejecutarCiclo({ forzar: true })
          : { ejecutado: false, resultados: [] };
        return responderJson(res, 200, {
          ok: true,
          data,
        });
      }

      return responderJson(res, 404, {
        ok: false,
        error: 'No encontrado',
      });
    } catch (err) {
      return responderJson(res, 500, {
        ok: false,
        error: err?.message || 'Error interno del servidor',
      });
    }
  });
}

module.exports = {
  crearServidorWatcher,
};
