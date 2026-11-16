'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  formatearFechaMadrid,
  calcularHashItem,
  inferirUnidadMoodle,
  inferirTipoMoodle,
  normalizarCursoMoodle,
} = require('./normalizador.js');

const {
  crearSincronizadorDrive,
} = require('./drive.js');

const {
  CURSOS_PYTHON_MOODLE,
  CURSOS_CIBER_MOODLE,
  ErrorCaptchaDetectado,
  detectarCaptchaO2FA,
  obtenerTokenCas,
  obtenerTokenDirecto,
  crearFuenteMoodle,
  crearFuenteCiberseguridad,
} = require('./fuentes/moodle.js');

const {
  calcularDiffLote,
  crearAlmacenEstadoWatcher,
} = require('./diff.js');

const {
  crearClienteLifeOs,
} = require('./cliente-lifeos.js');

const {
  ejecutarPasadaFuente,
} = require('./orquestador.js');

const {
  parsearCorreoClassroom,
  normalizarEstructuraClassroom,
  crearFuenteClassroom,
} = require('./fuentes/classroom.js');

const {
  enVentanaCron,
  crearDemonioWatcher,
} = require('./cron.js');

const {
  crearServidorWatcher,
} = require('./servidor.js');

const {
  esMaterialResumible,
  crearResumidorTemas,
} = require('./resumen-ia.js');

function cargarArchivoEnv(rutaEnv = path.join(process.cwd(), '.env')) {
  if (!fs.existsSync(rutaEnv)) return;
  try {
    const contenido = fs.readFileSync(rutaEnv, 'utf8');
    for (const linea of contenido.split(/\r?\n/)) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith('#')) continue;
      const idx = limpia.indexOf('=');
      if (idx <= 0) continue;
      const clave = limpia.slice(0, idx).trim();
      const valor = limpia.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (clave && process.env[clave] === undefined) {
        process.env[clave] = valor;
      }
    }
  } catch {
    // Ignorar errores de lectura de .env
  }
}

if (require.main === module) {
  cargarArchivoEnv();

  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), '.data');
  const archivoEstado = path.join(dataDir, 'watcher-estado.json');
  const almacenEstado = crearAlmacenEstadoWatcher({ archivo: archivoEstado });

  const clienteLifeOs = crearClienteLifeOs({
    lifeosUrl: process.env.LIFEOS_URL || 'https://lifeos.dksaa.com',
    ingestaToken: process.env.INGESTA_TOKEN || '',
  });

  const fuentesActivas = [];

  if (process.env.MOODLE_TOKEN || (process.env.MOODLE_USER && process.env.MOODLE_PASS)) {
    fuentesActivas.push({
      nombre: 'moodle',
      fuente: crearFuenteMoodle({
        baseUrl: process.env.MOODLE_URL || 'https://educacionadistancia.juntadeandalucia.es/centros/malaga',
        modoAuth: 'cas',
        user: process.env.MOODLE_USER,
        pass: process.env.MOODLE_PASS,
        cursos: CURSOS_PYTHON_MOODLE,
        tokenInicial: process.env.MOODLE_TOKEN,
        leerToken: () => almacenEstado.leerToken('moodle'),
        guardarToken: token => almacenEstado.guardarToken('moodle', token),
      }),
    });
  }

  if (process.env.CIBER_USER && process.env.CIBER_PASS) {
    fuentesActivas.push({
      nombre: 'ciber',
      fuente: crearFuenteCiberseguridad({
        baseUrl: process.env.CIBER_URL || 'https://www.mecd.es/aulavirtualfpceuta',
        user: process.env.CIBER_USER,
        pass: process.env.CIBER_PASS,
        leerToken: () => almacenEstado.leerToken('ciber'),
        guardarToken: token => almacenEstado.guardarToken('ciber', token),
      }),
    });
  }

  if (process.env.CLASSROOM_GAS_URL) {
    fuentesActivas.push({
      nombre: 'classroom',
      fuente: crearFuenteClassroom({
        gasUrl: process.env.CLASSROOM_GAS_URL,
        gasToken: process.env.CLASSROOM_GAS_TOKEN,
      }),
    });
  }

  const demonio = crearDemonioWatcher({
    fuentes: fuentesActivas,
    almacenEstado,
    clienteLifeOs,
    horario: process.env.CRON_HORARIO || '08:00-22:00',
    intervaloMin: Number(process.env.CRON_INTERVALO_MIN || 120),
    simulacro: String(process.env.MODO_SIMULACRO).toLowerCase() === 'true',
  });

  demonio.iniciar({ ejecutarInmediato: true });

  const puerto = Number(process.env.PORT || 3001);
  const servidor = crearServidorWatcher({
    demonio,
    almacenEstado,
    ingestaToken: process.env.INGESTA_TOKEN || '',
  });

  servidor.listen(puerto, () => {
    console.log(
      `[Course Watcher] Escuchando en puerto ${puerto} (${fuentesActivas.length} fuentes configuradas)`
    );
  });
}

module.exports = {
  CURSOS_PYTHON_MOODLE,
  CURSOS_CIBER_MOODLE,
  crearFuenteMoodle,
  crearFuenteCiberseguridad,
  ErrorCaptchaDetectado,
  detectarCaptchaO2FA,
  obtenerTokenCas,
  obtenerTokenDirecto,
  crearSincronizadorDrive,
  normalizarCursoMoodle,
  inferirUnidadMoodle,
  inferirTipoMoodle,
  formatearFechaMadrid,
  calcularHashItem,
  calcularDiffLote,
  crearAlmacenEstadoWatcher,
  crearClienteLifeOs,
  ejecutarPasadaFuente,
  parsearCorreoClassroom,
  normalizarEstructuraClassroom,
  crearFuenteClassroom,
  enVentanaCron,
  crearDemonioWatcher,
  crearServidorWatcher,
  esMaterialResumible,
  crearResumidorTemas,
};
