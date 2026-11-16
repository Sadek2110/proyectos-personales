'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { calcularHashItem } = require('./normalizador.js');

function crearEstadoInicial() {
  return {
    version: 1,
    actualizado: null,
    tokens: {},
    archivosDrive: {},
    fuentes: {},
  };
}

function normalizarEstadoLeido(raw) {
  const base = crearEstadoInicial();
  if (!raw || typeof raw !== 'object') return base;
  return {
    version: raw.version || 1,
    actualizado: raw.actualizado || null,
    tokens: raw.tokens && typeof raw.tokens === 'object' ? { ...raw.tokens } : {},
    archivosDrive:
      raw.archivosDrive && typeof raw.archivosDrive === 'object' ? { ...raw.archivosDrive } : {},
    fuentes: raw.fuentes && typeof raw.fuentes === 'object' ? { ...raw.fuentes } : {},
  };
}

/**
 * Calcula las diferencias entre el estado previo de una fuente y el lote actual.
 */
function calcularDiffLote(estadoFuentePrevio = {}, loteActual = {}) {
  const prevItems = estadoFuentePrevio?.itemsPorExtId || {};
  const prevNotas = estadoFuentePrevio?.notasPorExtId || {};

  const nuevos = [];
  const cambiados = [];
  const archivados = [];
  const notasNuevas = [];

  const nuevoItemsPorExtId = {};
  const nuevoNotasPorExtId = { ...prevNotas };
  const vistos = new Set();

  const modulos = Array.isArray(loteActual?.modulos) ? loteActual.modulos : [];

  for (const m of modulos) {
    if (!m) continue;
    const unidades = Array.isArray(m.unidades) ? m.unidades : [];
    for (const u of unidades) {
      if (!u) continue;
      const items = Array.isArray(u.items) ? u.items : [];
      for (const it of items) {
        if (!it || !it.ext_id) continue;

        vistos.add(it.ext_id);
        const hashActual = it.hash || calcularHashItem(it);
        const prev = prevItems[it.ext_id];

        if (!prev || prev.archivado === true) {
          nuevos.push({
            ...it,
            modulo: m.id,
            unidad: u.k,
          });
        } else {
          const fechaPrev = prev.fecha || '';
          const fechaActual = it.fecha || '';
          const cambioFecha = fechaPrev !== fechaActual;
          const cambioDriveUrl = Boolean(it.drive_url && prev.drive_url !== it.drive_url);
          const haCambiado =
            prev.hash !== hashActual ||
            prev.unidad !== u.k ||
            cambioDriveUrl ||
            cambioFecha;

          if (haCambiado) {
            cambiados.push({
              ...it,
              modulo: m.id,
              unidad: u.k,
              cambioFecha,
              fechaAnterior: prev.fecha || null,
            });
          }
        }

        nuevoItemsPorExtId[it.ext_id] = {
          ext_id: it.ext_id,
          modulo: m.id,
          unidad: u.k,
          n: it.n,
          tipo: it.tipo,
          fecha: it.fecha || null,
          url: it.url || '',
          drive_url: it.drive_url || null,
          hash: hashActual,
          archivado: false,
        };
      }
    }

    const calificaciones = Array.isArray(m.calificaciones) ? m.calificaciones : [];
    for (const cal of calificaciones) {
      if (!cal) continue;
      const extIdNota = cal.ext_id || `moodle:${m.id}:grade:${cal.id}`;
      if (cal.graderaw !== null && cal.graderaw !== undefined) {
        const prevNota = prevNotas[extIdNota];
        if (!prevNota || prevNota.graderaw !== cal.graderaw) {
          notasNuevas.push({
            ...cal,
            ext_id: extIdNota,
            modulo: m.id,
          });
        }
        nuevoNotasPorExtId[extIdNota] = {
          ...cal,
          ext_id: extIdNota,
          modulo: m.id,
        };
      }
    }
  }

  if (loteActual?.completa === true) {
    const idsModulosLote = new Set(modulos.filter(Boolean).map(m => m.id));
    for (const [extId, prev] of Object.entries(prevItems)) {
      if (!vistos.has(extId)) {
        if (!prev.modulo || idsModulosLote.has(prev.modulo)) {
          if (!prev.archivado) {
            archivados.push({
              ...prev,
              archivado: true,
            });
          }
          nuevoItemsPorExtId[extId] = {
            ...prev,
            archivado: true,
          };
        } else {
          nuevoItemsPorExtId[extId] = prev;
        }
      }
    }
  } else {
    for (const [extId, prev] of Object.entries(prevItems)) {
      if (!vistos.has(extId)) {
        nuevoItemsPorExtId[extId] = prev;
      }
    }
  }

  const hayCambios =
    nuevos.length > 0 ||
    cambiados.length > 0 ||
    archivados.length > 0 ||
    notasNuevas.length > 0;

  return {
    hayCambios,
    resumen: {
      nuevos: nuevos.length,
      cambiados: cambiados.length,
      archivados: archivados.length,
      notasNuevas: notasNuevas.length,
    },
    detalle: {
      nuevos,
      cambiados,
      archivados,
      notasNuevas,
    },
    nuevoEstadoFuente: {
      itemsPorExtId: nuevoItemsPorExtId,
      notasPorExtId: nuevoNotasPorExtId,
    },
  };
}

/**
 * Crea un almacén de estado persistente y atómico en disco para Course Watcher.
 */
function crearAlmacenEstadoWatcher({ archivo, ahora = () => new Date() } = {}) {
  const rutaArchivo = archivo || path.join(process.cwd(), '.data', 'watcher-estado.json');

  function obtenerIsoAhora() {
    const d = ahora();
    return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
  }

  function leer() {
    if (!fs.existsSync(rutaArchivo)) {
      return crearEstadoInicial();
    }
    try {
      const contenido = fs.readFileSync(rutaArchivo, 'utf8');
      if (!contenido.trim()) return crearEstadoInicial();
      return normalizarEstadoLeido(JSON.parse(contenido));
    } catch {
      return crearEstadoInicial();
    }
  }

  function escribirAtomico(estado) {
    const dir = path.dirname(rutaArchivo);
    fs.mkdirSync(dir, { recursive: true });
    const aGuardar = {
      ...normalizarEstadoLeido(estado),
      actualizado: obtenerIsoAhora(),
    };
    const archivoTmp = `${rutaArchivo}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(archivoTmp, JSON.stringify(aGuardar, null, 2), 'utf8');
    fs.renameSync(archivoTmp, rutaArchivo);
    return aGuardar;
  }

  function obtenerEstadoFuente(fuente) {
    const estado = leer();
    const existente = estado.fuentes[fuente];
    if (!existente || typeof existente !== 'object') {
      return {
        itemsPorExtId: {},
        notasPorExtId: {},
        fallosSeguidos: 0,
        ultimoError: null,
        ultimaPasadaOk: null,
        ultimoIntento: null,
        ultimoResumen: null,
      };
    }
    return {
      itemsPorExtId: existente.itemsPorExtId ? { ...existente.itemsPorExtId } : {},
      notasPorExtId: existente.notasPorExtId ? { ...existente.notasPorExtId } : {},
      fallosSeguidos: Number(existente.fallosSeguidos || 0),
      ultimoError: existente.ultimoError ?? null,
      ultimaPasadaOk: existente.ultimaPasadaOk ?? null,
      ultimoIntento: existente.ultimoIntento ?? null,
      ultimoResumen: existente.ultimoResumen ?? null,
    };
  }

  function registrarExitoFuente(fuente, nuevoEstadoFuente = {}, resumenDiff = null) {
    const estado = leer();
    const previo = obtenerEstadoFuente(fuente);
    const iso = obtenerIsoAhora();

    const actualizadoFuente = {
      ...previo,
      itemsPorExtId: nuevoEstadoFuente.itemsPorExtId || previo.itemsPorExtId || {},
      notasPorExtId: nuevoEstadoFuente.notasPorExtId || previo.notasPorExtId || {},
      fallosSeguidos: 0,
      ultimoError: null,
      ultimaPasadaOk: iso,
      ultimoIntento: iso,
      ultimoResumen: resumenDiff ?? previo.ultimoResumen ?? null,
    };

    estado.fuentes[fuente] = actualizadoFuente;
    escribirAtomico(estado);
    return actualizadoFuente;
  }

  function registrarFalloFuente(fuente, error) {
    const estado = leer();
    const previo = obtenerEstadoFuente(fuente);
    const iso = obtenerIsoAhora();
    const fallosSeguidos = Number(previo.fallosSeguidos || 0) + 1;
    const mensajeError = error?.message || String(error || 'Error desconocido');

    const actualizadoFuente = {
      ...previo,
      fallosSeguidos,
      ultimoError: mensajeError,
      ultimoIntento: iso,
    };

    estado.fuentes[fuente] = actualizadoFuente;
    escribirAtomico(estado);

    return {
      fallosSeguidos,
      debeAlertar: fallosSeguidos >= 2,
      ultimoError: mensajeError,
    };
  }

  function leerToken(fuente) {
    const estado = leer();
    return estado.tokens[fuente] ?? null;
  }

  function guardarToken(fuente, token) {
    const estado = leer();
    estado.tokens[fuente] = token;
    escribirAtomico(estado);
    return token;
  }

  function obtenerEstadoDrive() {
    const estado = leer();
    return { ...(estado.archivosDrive || {}) };
  }

  function guardarEstadoDrive(estadoDrive = {}) {
    const estado = leer();
    estado.archivosDrive = { ...estadoDrive };
    escribirAtomico(estado);
    return estado.archivosDrive;
  }

  return {
    leer,
    obtenerEstadoFuente,
    registrarExitoFuente,
    registrarFalloFuente,
    leerToken,
    guardarToken,
    obtenerEstadoDrive,
    guardarEstadoDrive,
  };
}

module.exports = {
  calcularDiffLote,
  crearAlmacenEstadoWatcher,
};
