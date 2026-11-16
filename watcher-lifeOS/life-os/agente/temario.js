// Almacén del temario dinámico en /data/temario.json con semilla inicial desde src/clase.mjs.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { CLASE, MODULOS_CIBER, idItem } = require('../src/clase.mjs');

function normalizarTexto(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function semillaInicial() {
  return {
    version: 1,
    actualizado: new Date().toISOString().slice(0, 19),
    fuentes: {},
    modulos: structuredClone(CLASE),
    mapaIds: {},
    novedades: [],
  };
}

function crearAlmacenTemario(dir) {
  const carpeta = dir || process.env.DATA_DIR || path.join(__dirname, '..', '.data');
  const archivo = path.join(carpeta, 'temario.json');
  let estado = null;

  function guardar() {
    fs.mkdirSync(carpeta, { recursive: true });
    const temporal = `${archivo}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporal, JSON.stringify(estado, null, 2), { mode: 0o600 });
      fs.renameSync(temporal, archivo);
    } catch (e) {
      console.error(`[temario] No se pudo guardar ${archivo}: ${e.message}`);
    }
  }

  function cargar() {
    fs.mkdirSync(carpeta, { recursive: true });
    if (fs.existsSync(archivo)) {
      try {
        const leido = JSON.parse(fs.readFileSync(archivo, 'utf8'));
        estado = {
          version: 1,
          actualizado: leido.actualizado || new Date().toISOString().slice(0, 19),
          fuentes: leido.fuentes && typeof leido.fuentes === 'object' ? leido.fuentes : {},
          modulos: Array.isArray(leido.modulos) && leido.modulos.length ? leido.modulos : structuredClone(CLASE),
          mapaIds: leido.mapaIds && typeof leido.mapaIds === 'object' ? leido.mapaIds : {},
          novedades: Array.isArray(leido.novedades) ? leido.novedades : [],
        };
        return estado;
      } catch (e) {
        console.error(`[temario] No se pudo leer ${archivo}: ${e.message}`);
      }
    }
    estado = semillaInicial();
    guardar();
    return estado;
  }

  cargar();

  function obtener() {
    return cargar();
  }

  function asegurarModulo(idModulo, info = {}) {
    let mod = estado.modulos.find(m => m.id === idModulo);
    if (mod) return mod;
    const plantilla = Array.isArray(MODULOS_CIBER)
      ? MODULOS_CIBER.find(m => m.id === idModulo)
      : null;
    if (plantilla) {
      mod = structuredClone(plantilla);
    } else {
      mod = {
        id: idModulo,
        corto: info.corto || idModulo.toUpperCase(),
        nombre: info.nombre || idModulo,
        color: 'var(--l-clase)',
        ahora: 'General',
        aula: { texto: 'Abrir aula', url: '#' },
        meta: '',
        unidades: [],
      };
    }
    estado.modulos.push(mod);
    return mod;
  }

  function ingestar(lote = {}) {
    cargar();
    const ahora = new Date().toISOString().slice(0, 19);
    const origen = lote.origen || lote.fuente || 'moodle';
    const completa = Boolean(lote.completa);
    const items = Array.isArray(lote.items) ? [...lote.items] : [];
    const calificacionesPorModulo = new Map();

    if (Array.isArray(lote.modulos)) {
      for (const m of lote.modulos) {
        if (!m || !m.id) continue;
        asegurarModulo(m.id, { corto: m.corto, nombre: m.nombre });
        if (Array.isArray(m.unidades)) {
          for (const u of m.unidades) {
            if (!u || !Array.isArray(u.items)) continue;
            for (const it of u.items) {
              if (!it) continue;
              items.push({
                modulo: m.id,
                moduloCorto: m.corto,
                moduloNombre: m.nombre,
                unidad: u.k,
                unidad_titulo: u.t,
                ...it,
              });
            }
          }
        }
        if (Array.isArray(m.calificaciones)) {
          calificacionesPorModulo.set(m.id, m.calificaciones);
        }
      }
    }

    if (Array.isArray(lote.calificaciones)) {
      for (const cal of lote.calificaciones) {
        const modId = cal?.modulo || lote.modulo;
        if (!modId) continue;
        if (!calificacionesPorModulo.has(modId)) calificacionesPorModulo.set(modId, []);
        calificacionesPorModulo.get(modId).push(cal);
      }
    }

    if (lote.estadoFuente || lote.origen || lote.fuente) {
      const ok = lote.estadoFuente?.ok !== false;
      const previo = estado.fuentes[origen] || { fallosSeguidos: 0 };
      const fallosSeguidos = ok
        ? 0
        : lote.estadoFuente?.fallosSeguidos !== undefined
          ? Number(lote.estadoFuente.fallosSeguidos)
          : (previo.fallosSeguidos || 0) + 1;
      estado.fuentes[origen] = {
        ultimaPasada: ahora,
        ok,
        fallosSeguidos,
        error: lote.estadoFuente?.error || '',
      };
    }

    let nuevos = 0;
    let cambiados = 0;
    let archivados = 0;
    const extIdsContados = new Set();

    for (const raw of items) {
      if (!raw || !raw.ext_id || !raw.modulo) continue;
      const mod = asegurarModulo(raw.modulo, {
        corto: raw.moduloCorto,
        nombre: raw.moduloNombre,
      });
      const moduloCorto = mod.corto || mod.nombre || mod.id;
      extIdsContados.add(raw.ext_id);

      let unidad = mod.unidades.find(u => u.k === raw.unidad);
      if (!unidad) {
        unidad = {
          k: raw.unidad || 'General',
          t: raw.unidad_titulo || raw.unidad || 'General',
          items: [],
        };
        mod.unidades.push(unidad);
      }

      // 1. Buscar primero por ext_id en el módulo
      let existente = null;
      for (const u of mod.unidades) {
        const hallado = u.items.find(it => it.ext_id === raw.ext_id);
        if (hallado) {
          existente = hallado;
          break;
        }
      }

      if (existente) {
        const fechaPrev = existente.fecha || null;
        const califPrev = existente.calificacion ?? null;
        const cambioNombre = raw.n !== undefined && raw.n !== existente.n;
        const cambioTipo = raw.tipo !== undefined && raw.tipo !== existente.tipo;
        const cambioFecha = (raw.fecha || undefined) !== (existente.fecha || undefined);
        const cambioUrl = (raw.url || undefined) !== (existente.url || undefined);
        const cambioCalif = (raw.calificacion ?? null) !== califPrev;
        const estabaArchivado = Boolean(existente.archivado);

        if (raw.n !== undefined) existente.n = raw.n;
        if (raw.tipo !== undefined) existente.tipo = raw.tipo;
        if (raw.fecha !== undefined) existente.fecha = raw.fecha;
        if (raw.url !== undefined) existente.url = raw.url;
        if (raw.publicado !== undefined) existente.publicado = raw.publicado;
        if (raw.hash !== undefined) existente.hash = raw.hash;
        if (raw.calificacion !== undefined) existente.calificacion = raw.calificacion;
        if (raw.resumen_ia !== undefined) existente.resumen_ia = raw.resumen_ia;
        if (raw.apunte_url !== undefined) existente.apunte_url = raw.apunte_url;
        existente.origen = raw.origen || origen;
        if (existente.archivado) delete existente.archivado;

        if (cambioNombre || cambioTipo || cambioFecha || cambioUrl || cambioCalif || estabaArchivado) {
          cambiados++;
          const esFechaNotificable =
            cambioFecha &&
            Boolean(raw.fecha) &&
            (existente.tipo === 'Entrega' || existente.tipo === 'Prueba' || Boolean(existente.fecha));
          const esCalifNotificable =
            cambioCalif && raw.calificacion !== undefined && raw.calificacion !== null;

          if (esFechaNotificable) {
            const yaExiste = estado.novedades.some(
              nov =>
                nov.evento === 'cambio_fecha' &&
                nov.ext_id === raw.ext_id &&
                nov.fechaItem === existente.fecha,
            );
            if (!yaExiste) {
              estado.novedades.push({
                ext_id: raw.ext_id,
                modulo: mod.id,
                moduloCorto,
                unidad: unidad.k,
                n: existente.n,
                tipo: existente.tipo,
                fechaAnterior: fechaPrev,
                fechaItem: existente.fecha,
                evento: 'cambio_fecha',
                fecha: ahora,
              });
            }
          }

          if (esCalifNotificable) {
            const yaExiste = estado.novedades.some(
              nov =>
                nov.evento === 'nota' &&
                nov.ext_id === raw.ext_id &&
                nov.calificacion === raw.calificacion,
            );
            if (!yaExiste) {
              estado.novedades.push({
                ext_id: raw.ext_id,
                modulo: mod.id,
                moduloCorto,
                unidad: unidad.k,
                n: existente.n,
                tipo: 'Nota',
                calificacion: raw.calificacion,
                evento: 'nota',
                fecha: ahora,
              });
            }
          }

          if (!esFechaNotificable && !esCalifNotificable) {
            estado.novedades.push({
              ext_id: raw.ext_id,
              modulo: mod.id,
              moduloCorto,
              unidad: unidad.k,
              n: existente.n,
              tipo: existente.tipo,
              evento: 'cambiado',
              fecha: ahora,
            });
          }
        }
        continue;
      }

      // 2. Buscar coincidencia con semilla sin ext_id en la misma unidad (o módulo)
      const nombreNorm = normalizarTexto(raw.n);
      let semilla = unidad.items.find(it => !it.ext_id && normalizarTexto(it.n) === nombreNorm);
      let unidadSemilla = unidad;
      if (!semilla) {
        for (const u of mod.unidades) {
          const hallado = u.items.find(it => !it.ext_id && normalizarTexto(it.n) === nombreNorm);
          if (hallado) {
            semilla = hallado;
            unidadSemilla = u;
            break;
          }
        }
      }

      if (semilla) {
        const fechaSemilla = semilla.fecha || null;
        const idAntiguo = semilla.id_antiguo || idItem(mod, unidadSemilla, semilla);
        semilla.id_antiguo = idAntiguo;
        semilla.ext_id = raw.ext_id;
        semilla.origen = raw.origen || origen;
        estado.mapaIds[idAntiguo] = raw.ext_id;

        if (raw.n !== undefined) semilla.n = raw.n;
        if (raw.tipo !== undefined) semilla.tipo = raw.tipo;
        if (raw.fecha !== undefined) semilla.fecha = raw.fecha;
        if (raw.url !== undefined) semilla.url = raw.url;
        if (raw.publicado !== undefined) semilla.publicado = raw.publicado;
        if (raw.hash !== undefined) semilla.hash = raw.hash;
        if (raw.calificacion !== undefined) semilla.calificacion = raw.calificacion;
        if (raw.resumen_ia !== undefined) semilla.resumen_ia = raw.resumen_ia;
        if (raw.apunte_url !== undefined) semilla.apunte_url = raw.apunte_url;
        if (semilla.archivado) delete semilla.archivado;

        if (raw.fecha && fechaSemilla && raw.fecha !== fechaSemilla) {
          const yaExiste = estado.novedades.some(
            nov =>
              nov.evento === 'cambio_fecha' &&
              nov.ext_id === raw.ext_id &&
              nov.fechaItem === semilla.fecha,
          );
          if (!yaExiste) {
            estado.novedades.push({
              ext_id: raw.ext_id,
              modulo: mod.id,
              moduloCorto,
              unidad: unidadSemilla.k,
              n: semilla.n,
              tipo: semilla.tipo,
              fechaAnterior: fechaSemilla,
              fechaItem: semilla.fecha,
              evento: 'cambio_fecha',
              fecha: ahora,
            });
          }
        }

        cambiados++;
        continue;
      }

      // 3. Item nuevo
      const nuevo = {
        ext_id: raw.ext_id,
        origen: raw.origen || origen,
        n: raw.n,
        tipo: raw.tipo || 'Recurso',
      };
      if (raw.fecha !== undefined) nuevo.fecha = raw.fecha;
      if (raw.url !== undefined) nuevo.url = raw.url;
      if (raw.publicado !== undefined) nuevo.publicado = raw.publicado;
      if (raw.hash !== undefined) nuevo.hash = raw.hash;
      if (raw.calificacion !== undefined) nuevo.calificacion = raw.calificacion;
      if (raw.resumen_ia !== undefined) nuevo.resumen_ia = raw.resumen_ia;
      if (raw.apunte_url !== undefined) nuevo.apunte_url = raw.apunte_url;

      unidad.items.push(nuevo);
      nuevos++;

      if (nuevo.tipo === 'Nota' || (nuevo.calificacion !== undefined && nuevo.calificacion !== null)) {
        estado.novedades.push({
          ext_id: raw.ext_id,
          modulo: mod.id,
          moduloCorto,
          unidad: unidad.k,
          n: nuevo.n,
          tipo: 'Nota',
          calificacion: nuevo.calificacion,
          evento: 'nota',
          fecha: ahora,
        });
      } else {
        estado.novedades.push({
          ext_id: raw.ext_id,
          modulo: mod.id,
          moduloCorto,
          unidad: unidad.k,
          n: nuevo.n,
          tipo: nuevo.tipo,
          fechaItem: nuevo.fecha || null,
          evento: 'nuevo',
          fecha: ahora,
        });
      }
    }

    // Procesamiento de calificaciones de módulo
    for (const [modId, listaCal] of calificacionesPorModulo.entries()) {
      const mod = estado.modulos.find(m => m.id === modId);
      if (!mod) continue;
      const moduloCorto = mod.corto || mod.nombre || mod.id;
      mod.calificaciones = Array.isArray(mod.calificaciones) ? mod.calificaciones : [];

      for (const cal of listaCal) {
        const valorNota = cal?.nota ?? cal?.graderaw;
        if (!cal || valorNota === null || valorNota === undefined) continue;
        const extIdNota = cal.ext_id || `moodle:${mod.id}:grade:${cal.id}`;
        const existenteCal = mod.calificaciones.find(c => c.ext_id === extIdNota);
        const notaExistente = existenteCal ? (existenteCal.nota ?? existenteCal.graderaw) : undefined;

        if (!existenteCal || notaExistente !== valorNota) {
          if (!existenteCal) {
            mod.calificaciones.push({ ...cal, ext_id: extIdNota });
            if (!extIdsContados.has(extIdNota)) nuevos++;
          } else {
            Object.assign(existenteCal, cal, { ext_id: extIdNota });
            if (!extIdsContados.has(extIdNota)) cambiados++;
          }

          const yaExiste = estado.novedades.some(
            nov =>
              nov.evento === 'nota' &&
              nov.ext_id === extIdNota &&
              nov.calificacion === valorNota,
          );
          if (!yaExiste) {
            estado.novedades.push({
              ext_id: extIdNota,
              modulo: mod.id,
              moduloCorto,
              unidad: 'General',
              n: cal.nombre || cal.itemname || cal.n || 'Calificación',
              tipo: 'Nota',
              calificacion: valorNota,
              evento: 'nota',
              fecha: ahora,
            });
          }
        }
      }
    }

    // 4. Archivado sin borrado cuando completa: true
    if (completa) {
      const modulosAfectados = new Set(
        lote.modulo
          ? [lote.modulo]
          : [
              ...items.map(i => i.modulo).filter(Boolean),
              ...(Array.isArray(lote.modulos) ? lote.modulos.map(m => m?.id).filter(Boolean) : []),
            ],
      );
      const extIdsEnLote = new Set(items.map(i => i.ext_id).filter(Boolean));
      for (const mod of estado.modulos) {
        if (!modulosAfectados.has(mod.id)) continue;
        for (const u of mod.unidades) {
          for (const it of u.items) {
            if (it.ext_id && (it.origen || 'moodle') === origen && !extIdsEnLote.has(it.ext_id) && !it.archivado) {
              it.archivado = true;
              archivados++;
            }
          }
        }
      }
    }

    estado.actualizado = ahora;
    guardar();
    return { nuevos, cambiados, archivados };
  }

  function idsValidos() {
    cargar();
    const validos = new Set();
    for (const m of estado.modulos) {
      for (const u of m.unidades) {
        for (const it of u.items) {
          validos.add(idItem(m, u, it));
          if (it.ext_id) validos.add(it.ext_id);
          if (it.id_antiguo) validos.add(it.id_antiguo);
        }
      }
    }
    for (const [antiguo, ext] of Object.entries(estado.mapaIds || {})) {
      validos.add(antiguo);
      validos.add(ext);
    }
    return validos;
  }

  return { obtener, ingestar, idsValidos, guardar };
}

module.exports = { crearAlmacenTemario, normalizarTexto };
