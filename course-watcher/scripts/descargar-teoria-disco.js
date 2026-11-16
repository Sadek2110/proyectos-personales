'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { crearFuenteMoodle, crearFuenteCiberseguridad } = require('../src/fuentes/moodle.js');

const EXT_VALIDAS = ['.pdf', '.ipynb', '.zip', '.elp', '.csv', '.txt'];

function sanitizarNombre(nombre) {
  return String(nombre || '')
    .replace(/[/\\?%*:|"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function descargar() {
  const baseDir = '/data/teoria';
  fs.mkdirSync(baseDir, { recursive: true });

  console.log('[teoria] Conectando con Moodle Centros (Python)...');
  const fM = crearFuenteMoodle({
    baseUrl: process.env.MOODLE_URL,
    user: process.env.MOODLE_USER,
    pass: process.env.MOODLE_PASS,
  });
  const tokenM = await fM.obtenerToken();
  const loteM = await fM.obtenerLote();
  console.log('[teoria] Moodle Centros obtenido con', loteM.modulos.length, 'modulos.');

  console.log('[teoria] Conectando con Moodle FP Ceuta (Ciberseguridad)...');
  const fC = crearFuenteCiberseguridad({
    baseUrl: process.env.CIBER_URL,
    user: process.env.CIBER_USER,
    pass: process.env.CIBER_PASS,
  });
  const tokenC = await fC.obtenerToken();
  const loteC = await fC.obtenerLote();
  console.log('[teoria] Moodle FP Ceuta obtenido con', loteC.modulos.length, 'modulos.');

  const archivos = [];

  function extraer(lote, nombreCurso, token) {
    for (const m of lote.modulos) {
      for (const u of m.unidades) {
        for (const it of u.items || []) {
          for (const a of it.archivos || []) {
            const ext = (a.filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
            if (EXT_VALIDAS.includes(ext)) {
              const sep = a.fileurl.includes('?') ? '&' : '?';
              archivos.push({
                curso: nombreCurso,
                modulo: sanitizarNombre(m.nombre || m.id),
                unidad: sanitizarNombre(`${u.k} - ${u.t}`),
                filename: sanitizarNombre(a.filename),
                url: `${a.fileurl}${sep}token=${encodeURIComponent(token)}`,
              });
            }
          }
        }
      }
    }
  }

  extraer(loteM, '01 - Especialización en Python', tokenM);
  extraer(loteC, '02 - Especialización en Ciberseguridad', tokenC);

  console.log(`[teoria] Total de archivos de teoría encontrados: ${archivos.length}`);

  let descargados = 0;
  let omitidos = 0;
  let errores = 0;

  for (let i = 0; i < archivos.length; i++) {
    const a = archivos[i];
    const carpetaUnidad = path.join(baseDir, a.curso, a.modulo, a.unidad);
    fs.mkdirSync(carpetaUnidad, { recursive: true });
    const rutaDestino = path.join(carpetaUnidad, a.filename);

    if (fs.existsSync(rutaDestino) && fs.statSync(rutaDestino).size > 0) {
      omitidos++;
      continue;
    }

    try {
      const res = await fetch(a.url);
      if (!res.ok) {
        console.error(`[teoria] Error HTTP ${res.status} en ${a.filename}`);
        errores++;
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(rutaDestino, buffer);
      descargados++;
      if (descargados % 10 === 0) {
        console.log(`[teoria] Progreso: ${descargados + omitidos}/${archivos.length} archivos procesados...`);
      }
    } catch (e) {
      console.error(`[teoria] Error descargando ${a.filename}: ${e.message}`);
      errores++;
    }
  }

  console.log(`[teoria] Descarga terminada. Nuevos: ${descargados}, Ya existentes: ${omitidos}, Errores: ${errores}`);
  console.log('[teoria] Empaquetando /data/teoria_docs.tar.gz...');
  try {
    execSync(`tar -czf /data/teoria_docs.tar.gz -C ${baseDir} .`);
    console.log('[teoria] Paquete /data/teoria_docs.tar.gz creado con éxito:', fs.statSync('/data/teoria_docs.tar.gz').size, 'bytes');
  } catch (e) {
    console.error('[teoria] Error empaquetando tar.gz:', e.message);
  }

  console.log('FINALIZADO_CON_EXITO');
}

descargar().catch(err => {
  console.error('[teoria] ERROR FATAL:', err);
  process.exit(1);
});
