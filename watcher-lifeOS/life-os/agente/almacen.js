// Estado del agente en un único JSON. Hay un solo proceso y un solo usuario: no hace falta más.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PREFS_INICIALES = { resumen: true, horaResumen: '08:00', eventos: true, minutosEvento: 15, tareas: true, sugerencias: true };

function crearAlmacen(dir) {
  const archivo = path.join(dir, 'agente.json');
  let estado = {};
  try {
    fs.mkdirSync(dir, { recursive: true });
    estado = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // No se pisa el archivo dañado: contiene las claves con las que están suscritos los dispositivos.
      console.error(`[almacen] No se pudo leer ${archivo}: ${e.message}`);
      try { fs.renameSync(archivo, `${archivo}.danado-${Date.now()}`); } catch { /* quizá ni existe */ }
    }
  }
  estado = {
    chat: [], pendientes: [], suscripciones: [], enviados: {}, huellaSugerencia: '', claves: {},
    ...estado,
    prefs: { ...PREFS_INICIALES, ...estado.prefs },
  };

  function guardar() {
    const temporal = `${archivo}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporal, JSON.stringify(estado), { mode: 0o600 });
      fs.renameSync(temporal, archivo); // atómico: un corte a medias no deja el archivo roto
    } catch (e) {
      console.error(`[almacen] No se pudo guardar: ${e.message}`);
    }
  }

  if (!estado.claves.mcp) {
    estado.claves.mcp = crypto.randomBytes(32).toString('base64url');
    guardar();
  }
  return { estado, guardar };
}

module.exports = { crearAlmacen };
