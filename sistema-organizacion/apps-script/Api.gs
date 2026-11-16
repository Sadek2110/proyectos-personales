/**
 * Life OS — API privada para la web (desplegada en Easypanel).
 *
 * El servidor Node llama a doPost con { token, fn, args } y recibe { ok, data | error }.
 * El token se guarda en Propiedades del script -> API_TOKEN (nunca en el código).
 * Usa la misma hoja, el mismo Google Calendar y la misma sincronización con
 * Google Tasks que Codigo.gs (funciones columnas_, esVerdadero_, obtenerListaId_...).
 */

const CAMPOS_COMPRAS = {
  id: 'ID', producto: 'Producto', categoria: 'Categoria',
  tienda: 'Tienda', direccion: 'Direccion', stock: 'Stock',
};
const CAMPOS_TAREAS = {
  id: 'ID', titulo: 'Titulo', prioridad: 'Prioridad',
  fecha: 'Fecha_Limite', ubicacion: 'Ubicacion', completada: 'Completada',
};
const FORMATO_FECHA = "yyyy-MM-dd'T'HH:mm";

/** Comprobación rápida: abrir la URL /exec en el navegador debe mostrar {"ok":true}. */
function doGet() {
  return json_({ ok: true, servicio: 'Life OS API' });
}

function doPost(e) {
  const API = {
    obtenerDatos, guardarProducto, cambiarStock, borrarProducto,
    guardarTarea, marcarTarea, borrarTarea,
    obtenerEventos, crearEvento, borrarEvento, obtenerCalendarios,
    obtenerRutas, guardarRuta, recalcularRuta, borrarRuta,
    obtenerClase, marcarClase,
  };
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!token || token.length < 32 || req.token !== token) return json_({ ok: false, error: 'No autorizado' });
    const fn = API.hasOwnProperty(req.fn) ? API[req.fn] : null;
    if (!fn) return json_({ ok: false, error: 'Función no permitida' });
    return json_({ ok: true, data: fn.apply(null, Array.isArray(req.args) ? req.args : []) });
  } catch (err) {
    return json_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ================================================================ API pública

/** Carga inicial: compras y tareas con coordenadas para el mapa. */
function obtenerDatos() {
  return conLock_(() => {
    rellenarIds_(hoja_(CONFIG.HOJA_COMPRAS));
    rellenarIds_(hoja_(CONFIG.HOJA_TAREAS));
    return { compras: leerCompras_(), tareas: leerTareas_() };
  });
}

function guardarProducto(p) {
  return conLock_(() => {
    const id = guardar_(CONFIG.HOJA_COMPRAS, CAMPOS_COMPRAS, p);
    return leerCompras_().find(x => x.id === id);
  });
}

function cambiarStock(id, stock) {
  if (stock !== 'Falta' && stock !== 'En casa') throw new Error('Stock no válido');
  return conLock_(() => {
    escribirCampos_(CONFIG.HOJA_COMPRAS, id, { Stock: stock });
    return true;
  });
}

function borrarProducto(id) {
  return conLock_(() => {
    borrarFila_(CONFIG.HOJA_COMPRAS, id);
    return true;
  });
}

function guardarTarea(t) {
  t.ubicacion = coordenadasADireccion_(t.ubicacion);
  return conLock_(() => {
    const id = guardar_(CONFIG.HOJA_TAREAS, CAMPOS_TAREAS, t);
    try { sincronizarSinLock_(); } catch (e) { console.error(e); } // la envía/actualiza en Google Tasks
    return leerTareas_().find(x => x.id === id);
  });
}

/** Marca o desmarca una tarea y refleja el cambio en Google Tasks al momento. */
function marcarTarea(id, hecha) {
  return conLock_(() => {
    escribirCampos_(CONFIG.HOJA_TAREAS, id, { Completada: !!hecha });
    const syncId = valorDe_(CONFIG.HOJA_TAREAS, id, 'Sync_Tasks');
    if (syncId && syncId !== 'OK') {
      try {
        Tasks.Tasks.patch(
          hecha ? { status: 'completed' } : { status: 'needsAction', completed: null },
          obtenerListaId_(), syncId);
      } catch (e) { console.error(e); }
    } else if (!hecha) {
      try { sincronizarSinLock_(); } catch (e) { console.error(e); }
    }
    return true;
  });
}

function borrarTarea(id) {
  return conLock_(() => {
    const syncId = valorDe_(CONFIG.HOJA_TAREAS, id, 'Sync_Tasks');
    if (syncId && syncId !== 'OK') {
      try { Tasks.Tasks.remove(obtenerListaId_(), syncId); } catch (e) { console.error(e); }
    }
    borrarFila_(CONFIG.HOJA_TAREAS, id);
    return true;
  });
}

/**
 * Eventos de TODOS los calendarios que tienes marcados en Google Calendar
 * desde `desde` (yyyy-MM-dd) durante `dias` días.
 */
function obtenerEventos(desde, dias) {
  const tz = tz_();
  const ini = Utilities.parseDate(desde, tz, 'yyyy-MM-dd');
  const fin = new Date(ini.getTime() + dias * 864e5);
  const salida = [];
  calendariosVisibles_().forEach(cal => {
    try {
      cal.getEvents(ini, fin).forEach(e => salida.push(eventoJson_(e, tz, cal)));
    } catch (err) {
      console.error('Calendario ' + cal.getName() + ': ' + err);
    }
  });
  return salida;
}

/** Calendarios donde puedes crear eventos (para el selector de la app). */
function obtenerCalendarios() {
  const principal = CalendarApp.getDefaultCalendar().getId();
  return CalendarApp.getAllCalendars()
    .filter(c => !c.isHidden() && c.isOwnedByMe())
    .map(c => ({ id: c.getId(), nombre: c.getId() === principal ? 'Principal' : c.getName(), color: c.getColor(), principal: c.getId() === principal }));
}

function crearEvento(ev) {
  const tz = tz_();
  const titulo = String(ev.titulo || '').trim();
  if (!titulo) throw new Error('El evento necesita un título');
  const ini = Utilities.parseDate(ev.inicio, tz, FORMATO_FECHA);
  const fin = Utilities.parseDate(ev.fin, tz, FORMATO_FECHA);
  if (fin <= ini) throw new Error('La hora de fin debe ser posterior al inicio');
  const cal = (ev.calendario && CalendarApp.getCalendarById(ev.calendario)) || CalendarApp.getDefaultCalendar();
  const opciones = ev.lugar ? { location: String(ev.lugar) } : {};
  return eventoJson_(cal.createEvent(titulo, ini, fin, opciones), tz, cal);
}

/** `id` tiene la forma "idCalendario::idEvento" (ver eventoJson_). */
function borrarEvento(id) {
  const partes = String(id).split('::');
  const cal = (partes.length === 2 && CalendarApp.getCalendarById(partes[0])) || CalendarApp.getDefaultCalendar();
  const ev = cal.getEventById(partes[partes.length - 1]);
  if (!ev) throw new Error('Evento no encontrado');
  if (ev.isRecurringEvent()) throw new Error('Los eventos repetidos se borran desde Google Calendar');
  ev.deleteEvent();
  return true;
}

// ================================================================ Clase (progreso del curso)

const HOJA_CLASE = 'Clase';

/** Progreso del curso: { idDelElemento: true } con lo que está marcado como hecho. */
function obtenerClase() {
  return conLock_(() => {
    const mapa = {};
    hojaClase_().getDataRange().getValues().slice(1).forEach(f => {
      if (f[0] && esVerdadero_(f[1])) mapa[String(f[0])] = true;
    });
    return mapa;
  });
}

/** Marca o desmarca uno o varios elementos. Crea la fila la primera vez que se marca. */
function marcarClase(ids, hecho) {
  const lista = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
  if (lista.length > 500) throw new Error('Demasiados elementos');
  return conLock_(() => {
    const h = hojaClase_();
    const filas = {};
    h.getRange(1, 1, h.getLastRow(), 1).getValues().forEach((f, i) => { filas[String(f[0])] = i + 1; });
    const ahora = Utilities.formatDate(new Date(), tz_(), FORMATO_FECHA);
    const nuevas = [];
    lista.forEach(id => {
      if (filas[id]) h.getRange(filas[id], 2, 1, 2).setValues([[!!hecho, ahora]]);
      else if (hecho) { nuevas.push([id, true, ahora]); filas[id] = -1; }
    });
    if (nuevas.length) h.getRange(h.getLastRow() + 1, 1, nuevas.length, 3).setValues(nuevas);
    return true;
  });
}

/** Devuelve la pestaña "Clase", creándola la primera vez. */
function hojaClase_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName(HOJA_CLASE);
  if (!h) {
    h = ss.insertSheet(HOJA_CLASE);
    h.appendRow(['ID', 'Hecho', 'Actualizado']);
    h.setFrozenRows(1);
    h.getRange('A:A').setNumberFormat('@');
    h.getRange('C:C').setNumberFormat('@');
    h.getRange('1:1').setFontWeight('bold');
  }
  return h;
}

// ================================================================ Rutas guardadas (Google Maps)

const HOJA_RUTAS = 'Rutas';
const CAMPOS_RUTAS = {
  id: 'ID', nombre: 'Nombre', origen: 'Origen', destino: 'Destino', modo: 'Modo',
  salida: 'Salida', resultado: 'Resultado', actualizada: 'Actualizada',
};
const MODOS_RUTA = ['TRANSIT', 'WALKING', 'DRIVING'];
const MENSAJES_RUTA = {
  NOT_FOUND: 'No encuentro el origen o el destino. Escribe el nombre del sitio y la ciudad.',
  ZERO_RESULTS: 'Google Maps no tiene ninguna ruta con ese medio de transporte entre esos puntos.',
  OVER_QUERY_LIMIT: 'Se ha superado el límite diario de Google Maps. Prueba mañana.',
  MAX_ROUTE_LENGTH_EXCEEDED: 'La ruta es demasiado larga.',
};

function obtenerRutas() {
  hojaRutas_();
  return leer_(HOJA_RUTAS, CAMPOS_RUTAS).map(r => {
    let resultado = null;
    try { resultado = JSON.parse(r.resultado); } catch (e) { /* fila editada a mano */ }
    const hora = /(\d{2}:\d{2})$/.exec(String(r.salida));
    return Object.assign({}, r, { salida: r.salida ? (hora ? hora[1] : String(r.salida)) : '', resultado: resultado });
  });
}

/** Calcula la ruta con Google Maps y la guarda (nueva o existente). */
function guardarRuta(r) {
  const origen = String(r.origen || '').trim();
  const destino = String(r.destino || '').trim();
  if (!origen || !destino) throw new Error('Indica el origen y el destino');
  const modo = MODOS_RUTA.indexOf(r.modo) >= 0 ? r.modo : 'TRANSIT';
  const salida = /^\d{2}:\d{2}$/.test(r.salida || '') ? r.salida : '';
  const resultado = calcularRuta_(origen, destino, modo, salida);
  const obj = {
    id: r.id || '',
    nombre: String(r.nombre || '').trim() || (resultado.opciones[0].desde.dir.split(',')[0] + ' → ' + resultado.opciones[0].hasta.dir.split(',')[0]),
    origen: origen, destino: destino, modo: modo, salida: salida,
    resultado: JSON.stringify(resultado),
    actualizada: Utilities.formatDate(new Date(), tz_(), FORMATO_FECHA),
  };
  return conLock_(() => {
    hojaRutas_();
    const id = guardar_(HOJA_RUTAS, CAMPOS_RUTAS, obj);
    return obtenerRutas().find(x => x.id === id);
  });
}

/** Vuelve a pedir la ruta a Google Maps (horarios de autobús actualizados). */
function recalcularRuta(id) {
  const r = obtenerRutas().find(x => x.id === String(id));
  if (!r) throw new Error('No se encontró la ruta');
  return guardarRuta(r);
}

function borrarRuta(id) {
  return conLock_(() => {
    hojaRutas_();
    borrarFila_(HOJA_RUTAS, id);
    return true;
  });
}

/** Devuelve la pestaña "Rutas", creándola la primera vez. */
function hojaRutas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName(HOJA_RUTAS);
  if (!h) {
    h = ss.insertSheet(HOJA_RUTAS);
    h.appendRow(Object.keys(CAMPOS_RUTAS).map(k => CAMPOS_RUTAS[k]));
    h.setFrozenRows(1);
    h.getRange('A:G').setNumberFormat('@'); // texto: que Sheets no convierta horas ni coordenadas
    h.getRange('1:1').setFontWeight('bold');
  }
  return h;
}

function calcularRuta_(origen, destino, modo, salida) {
  const tz = tz_();
  const df = Maps.newDirectionFinder()
    .setOrigin(origen).setDestination(destino)
    .setMode(Maps.DirectionFinder.Mode[modo])
    .setLanguage('es').setRegion('es').setAlternatives(true);
  if (salida) df.setDepart(proximaHora_(salida, tz));
  const res = df.getDirections();
  if (res.status !== 'OK' || !res.routes || !res.routes.length) {
    throw new Error(MENSAJES_RUTA[res.status] || ('No se pudo calcular la ruta (' + res.status + ')'));
  }
  const opciones = res.routes.slice(0, 3).map(opcionRuta_);
  // Una celda admite 50.000 caracteres: si no cabe, se quitan los trazados de cada paso.
  if (JSON.stringify(opciones).length > 45000) opciones.forEach(o => o.pasos.forEach(p => { delete p.polyline; }));
  return { opciones: opciones, para: salida || 'ahora' };
}

function opcionRuta_(rt) {
  const leg = rt.legs[0];
  const txt = o => (o && o.text) || '';
  return {
    resumen: rt.summary || '',
    duracion: txt(leg.duration), distancia: txt(leg.distance),
    salida: txt(leg.departure_time), llegada: txt(leg.arrival_time),
    desde: { dir: leg.start_address, lat: leg.start_location.lat, lng: leg.start_location.lng },
    hasta: { dir: leg.end_address, lat: leg.end_location.lat, lng: leg.end_location.lng },
    tarifa: rt.fare ? rt.fare.text : '',
    avisos: rt.warnings || [],
    polyline: rt.overview_polyline ? rt.overview_polyline.points : '',
    pasos: (leg.steps || []).map(s => {
      const p = {
        modo: s.travel_mode, texto: limpiarHtml_(s.html_instructions),
        duracion: txt(s.duration), distancia: txt(s.distance),
        polyline: s.polyline ? s.polyline.points : '',
      };
      const td = s.transit_details;
      if (td) {
        const l = td.line || {};
        const v = l.vehicle || {};
        p.transporte = {
          linea: l.short_name || l.name || '', nombre: l.name || '',
          vehiculo: v.name || 'Transporte', tipo: v.type || 'BUS',
          color: l.color || '', colorTexto: l.text_color || '',
          empresa: (l.agencies && l.agencies[0] && l.agencies[0].name) || '',
          desde: td.departure_stop.name, hasta: td.arrival_stop.name,
          horaSalida: txt(td.departure_time), horaLlegada: txt(td.arrival_time),
          paradas: td.num_stops, direccion: td.headsign || '',
        };
      }
      return p;
    }),
  };
}

/** Próxima vez que el reloj marque `hhmm` (hoy o mañana). */
function proximaHora_(hhmm, tz) {
  const hoy = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const d = Utilities.parseDate(hoy + 'T' + hhmm, tz, FORMATO_FECHA);
  return d < new Date() ? new Date(d.getTime() + 864e5) : d;
}

function limpiarHtml_(html) {
  return String(html || '').replace(/<div[^>]*>/g, '. ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// ================================================================ Lectura

function leerCompras_() {
  const lista = leer_(CONFIG.HOJA_COMPRAS, CAMPOS_COMPRAS);
  geocodificar_(lista, 'direccion');
  return lista;
}

function leerTareas_() {
  const lista = leer_(CONFIG.HOJA_TAREAS, CAMPOS_TAREAS);
  lista.forEach(t => { t.completada = esVerdadero_(t.completada); });
  geocodificar_(lista, 'ubicacion');
  return lista;
}

function leer_(nombreHoja, campos) {
  const hoja = hoja_(nombreHoja);
  if (hoja.getLastRow() < 2) return [];
  const col = columnas_(hoja);
  const tz = tz_();
  const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).getValues();
  return datos
    .filter(f => String(f[col.ID]).trim() !== '')
    .map(f => {
      const o = {};
      for (const k in campos) {
        const v = f[col[campos[k]]];
        o[k] = v instanceof Date ? Utilities.formatDate(v, tz, FORMATO_FECHA)
          : (v === null || v === undefined ? '' : v);
      }
      o.id = String(o.id);
      return o;
    });
}

function valorDe_(nombreHoja, id, columna) {
  const hoja = hoja_(nombreHoja);
  const col = columnas_(hoja);
  const fila = buscarFila_(hoja, col, id);
  return fila < 0 ? '' : String(hoja.getRange(fila, col[columna] + 1).getValue()).trim();
}

// ================================================================ Escritura

/** Crea (sin id) o actualiza (con id) una fila. Devuelve el id. */
function guardar_(nombreHoja, campos, obj) {
  const hoja = hoja_(nombreHoja);
  const col = columnas_(hoja);
  const tz = tz_();
  const valores = {};
  for (const k in campos) {
    if (k === 'id' || !(k in obj)) continue;
    valores[campos[k]] = convertir_(k, obj[k], tz);
  }

  const fila = obj.id ? buscarFila_(hoja, col, obj.id) : -1;
  if (fila > 0) {
    for (const c in valores) hoja.getRange(fila, col[c] + 1).setValue(valores[c]);
    return String(obj.id);
  }
  const id = obj.id || Utilities.getUuid().slice(0, 8);
  const nueva = new Array(hoja.getLastColumn()).fill('');
  nueva[col.ID] = id;
  for (const c in valores) nueva[col[c]] = valores[c];
  hoja.appendRow(nueva);
  return id;
}

function convertir_(campo, v, tz) {
  if (campo === 'completada') return !!v;
  if (campo === 'fecha') return v ? Utilities.parseDate(String(v), tz, FORMATO_FECHA) : '';
  return String(v === null || v === undefined ? '' : v).trim();
}

function escribirCampos_(nombreHoja, id, cambios) {
  const hoja = hoja_(nombreHoja);
  const col = columnas_(hoja);
  const fila = buscarFila_(hoja, col, id);
  if (fila < 0) throw new Error('No se encontró el elemento (¿se borró en otro sitio?)');
  for (const c in cambios) hoja.getRange(fila, col[c] + 1).setValue(cambios[c]);
}

function borrarFila_(nombreHoja, id) {
  const hoja = hoja_(nombreHoja);
  const fila = buscarFila_(hoja, columnas_(hoja), id);
  if (fila > 0) hoja.deleteRow(fila);
}

function buscarFila_(hoja, col, id) {
  const n = hoja.getLastRow() - 1;
  if (n < 1) return -1;
  const ids = hoja.getRange(2, col.ID + 1, n, 1).getDisplayValues();
  for (let i = 0; i < n; i++) if (ids[i][0] === String(id)) return i + 2;
  return -1;
}

// ================================================================ Mapa

/** Añade lat/lng a cada elemento. Cachea para no repetir consultas a Google Maps. */
function geocodificar_(lista, campo) {
  const props = PropertiesService.getScriptProperties();
  const cache = props.getProperties();
  const nuevos = {};
  lista.forEach(o => {
    const dir = String(o[campo] || '').trim();
    if (!dir) return;
    const clave = ('geo:' + dir.toLowerCase()).slice(0, 250);
    let v = cache[clave] || nuevos[clave];
    if (!v) {
      try {
        const r = Maps.newGeocoder().setRegion('es').setLanguage('es').geocode(dir);
        v = r.status === 'OK' && r.results.length ? JSON.stringify(r.results[0].geometry.location) : 'null';
      } catch (e) {
        return; // cuota agotada u otro error: se reintenta la próxima vez
      }
      nuevos[clave] = v;
    }
    const loc = JSON.parse(v);
    if (loc) { o.lat = loc.lat; o.lng = loc.lng; }
  });
  if (Object.keys(nuevos).length) props.setProperties(nuevos);
}

// ================================================================ Utilidades

function calendariosVisibles_() {
  return CalendarApp.getAllCalendars().filter(c => !c.isHidden() && c.isSelected());
}

/** Si la ubicación son coordenadas ("35.88, -5.31", al tocar el mapa), la convierte en dirección. */
function coordenadasADireccion_(ubicacion) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(ubicacion || ''));
  if (!m) return ubicacion;
  const lat = Number(m[1]), lng = Number(m[2]);
  try {
    const r = Maps.newGeocoder().setLanguage('es').reverseGeocode(lat, lng);
    if (r.status !== 'OK' || !r.results.length) return ubicacion;
    const dir = r.results[0].formatted_address;
    // Guarda las coordenadas exactas del toque para que la chincheta quede donde tocaste.
    PropertiesService.getScriptProperties()
      .setProperty(('geo:' + dir.toLowerCase()).slice(0, 250), JSON.stringify({ lat: lat, lng: lng }));
    return dir;
  } catch (e) {
    return ubicacion;
  }
}

function eventoJson_(e, tz, cal) {
  const diaCompleto = e.isAllDayEvent();
  const ini = diaCompleto ? e.getAllDayStartDate() : e.getStartTime();
  const fin = diaCompleto ? e.getAllDayEndDate() : e.getEndTime();
  return {
    id: cal.getId() + '::' + e.getId(),
    calendario: cal.getName(),
    color: cal.getColor(),
    titulo: e.getTitle() || '(Sin título)',
    inicio: Utilities.formatDate(ini, tz, FORMATO_FECHA),
    fin: Utilities.formatDate(fin, tz, FORMATO_FECHA),
    diaCompleto: diaCompleto,
    lugar: e.getLocation() || '',
    recurrente: e.isRecurringEvent(),
  };
}

function conLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25 * 1000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function hoja_(nombre) {
  const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!h) throw new Error('No existe la pestaña "' + nombre + '"');
  return h;
}

function tz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}
