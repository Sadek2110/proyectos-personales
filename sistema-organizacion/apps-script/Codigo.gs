/**
 * Life OS — Middleware Google Sheets <-> Google Tasks
 *
 * Qué hace:
 *  1. Rellena IDs vacíos en las hojas "Compras" y "Tareas".
 *  2. Envía a Google Tasks cada tarea nueva no completada y guarda en
 *     "Sync_Tasks" el ID de la tarea creada (no un simple "OK").
 *  3. Sincronización BIDIRECCIONAL del estado "completada":
 *       - Marcas la tarea en la app/hoja  -> se completa en Google Tasks.
 *       - La completas en Google Tasks     -> se marca Completada = TRUE en la hoja.
 *  4. Si cambias el título, la fecha o la ubicación en la hoja, se actualiza
 *     la tarea en Google Tasks.
 *
 * Requisitos: servicio avanzado "Tasks API" activado (ver appsscript.json).
 * Instalación: ejecuta una vez `instalarActivadores` desde el editor.
 */

// ---------------------------------------------------------------- Config
const CONFIG = {
  HOJA_TAREAS: 'Tareas',
  HOJA_COMPRAS: 'Compras',
  // '@default' = tu lista principal de Google Tasks ("Mis tareas").
  // Pon aquí un nombre (p. ej. 'Life OS') para usar/crear una lista propia.
  LISTA_TASKS: '@default',
  MINUTOS_ENTRE_SYNC: 5,
};

// ---------------------------------------------------------------- Entrada

/** Función principal: la llaman los activadores y el menú. */
function sincronizarTodo() {
  const lock = LockService.getScriptLock();
  // Evita que dos ejecuciones simultáneas creen tareas duplicadas.
  if (!lock.tryLock(30 * 1000)) return;
  try {
    sincronizarSinLock_();
  } finally {
    lock.releaseLock();
  }
}

/** Igual que sincronizarTodo, para quien ya tiene el lock (la web app). */
function sincronizarSinLock_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  rellenarIds_(ss.getSheetByName(CONFIG.HOJA_COMPRAS));
  rellenarIds_(ss.getSheetByName(CONFIG.HOJA_TAREAS));
  sincronizarTareas_(ss.getSheetByName(CONFIG.HOJA_TAREAS));
}

/**
 * Crea los activadores. Ejecútala UNA vez a mano.
 * - "Al producirse un cambio": reacciona al instante cuando editas la hoja.
 * - Cada N minutos: necesario porque los cambios hechos desde AppSheet (vía API)
 *   y los cambios en Google Tasks NO disparan los activadores de la hoja.
 */
function instalarActivadores() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sincronizarTodo')
    .forEach(t => ScriptApp.deleteTrigger(t));

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('sincronizarTodo').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('sincronizarTodo').timeBased()
    .everyMinutes(CONFIG.MINUTOS_ENTRE_SYNC).create();

  sincronizarTodo();
}

/** Menú "Life OS" en la hoja de cálculo. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Life OS')
    .addItem('Sincronizar ahora', 'sincronizarTodo')
    .addItem('Instalar activadores', 'instalarActivadores')
    .addToUi();
}

// ---------------------------------------------------------------- IDs

function rellenarIds_(hoja) {
  if (!hoja || hoja.getLastRow() < 2) return;
  const col = columnas_(hoja);
  if (col.ID === undefined) return;

  const rango = hoja.getRange(2, col.ID + 1, hoja.getLastRow() - 1, 1);
  const ids = rango.getValues();
  // Solo genera ID en filas que tengan algún contenido además del ID.
  const filas = hoja.getRange(2, 1, ids.length, hoja.getLastColumn()).getValues();
  let cambiado = false;
  ids.forEach((fila, i) => {
    const tieneDatos = filas[i].some((v, c) => c !== col.ID && v !== '' && v !== false);
    if (!fila[0] && tieneDatos) {
      fila[0] = Utilities.getUuid().slice(0, 8);
      cambiado = true;
    }
  });
  if (cambiado) rango.setValues(ids);
}

// ---------------------------------------------------------------- Tareas

function sincronizarTareas_(hoja) {
  if (!hoja || hoja.getLastRow() < 2) return;
  const col = columnas_(hoja);
  ['Titulo', 'Fecha_Limite', 'Ubicacion', 'Completada', 'Sync_Tasks'].forEach(n => {
    if (col[n] === undefined) throw new Error('Falta la columna "' + n + '" en la hoja Tareas');
  });

  const listaId = obtenerListaId_();
  const remotas = tareasRemotas_(listaId); // { id: tarea }
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();

  const n = hoja.getLastRow() - 1;
  const datos = hoja.getRange(2, 1, n, hoja.getLastColumn()).getValues();
  const colCompletada = datos.map(f => [f[col.Completada]]);
  const colSync = datos.map(f => [f[col.Sync_Tasks]]);
  let tocaEscribir = false;

  datos.forEach((fila, i) => {
    const titulo = String(fila[col.Titulo] || '').trim();
    if (!titulo) return;

    const completadaHoja = esVerdadero_(fila[col.Completada]);
    const syncId = String(fila[col.Sync_Tasks] || '').trim();
    const recurso = construirRecurso_(titulo, fila[col.Fecha_Limite], fila[col.Ubicacion], tz);

    // Fila antigua marcada solo con "OK" (versión anterior del script): no hay ID que seguir.
    if (syncId === 'OK') return;

    // 1) Tarea nueva -> crear en Google Tasks
    if (!syncId) {
      if (completadaHoja) return;
      const creada = Tasks.Tasks.insert(recurso, listaId);
      colSync[i][0] = creada.id;
      tocaEscribir = true;
      return;
    }

    const remota = remotas[syncId];
    if (!remota) return; // borrada en Google Tasks: no la recreamos.
    const completadaRemota = remota.status === 'completed';

    // 2) Completada en Google Tasks -> marcar en la hoja
    if (completadaRemota && !completadaHoja) {
      colCompletada[i][0] = true;
      tocaEscribir = true;
      return;
    }

    // 3) Completada en la hoja -> completar en Google Tasks
    if (completadaHoja && !completadaRemota) {
      Tasks.Tasks.patch({ status: 'completed' }, listaId, syncId);
      return;
    }

    // 4) Cambios de título / fecha / ubicación en la hoja -> actualizar
    if (!completadaHoja && haCambiado_(remota, recurso)) {
      Tasks.Tasks.patch(recurso, listaId, syncId);
    }
  });

  if (tocaEscribir) {
    hoja.getRange(2, col.Completada + 1, n, 1).setValues(colCompletada);
    hoja.getRange(2, col.Sync_Tasks + 1, n, 1).setValues(colSync);
  }
}

function construirRecurso_(titulo, fecha, ubicacion, tz) {
  const recurso = { title: titulo, notes: '' };
  if (fecha instanceof Date && !isNaN(fecha)) {
    // Google Tasks solo guarda el DÍA. Se envía a medianoche UTC del día local
    // para que no se desplace al día anterior por la zona horaria.
    recurso.due = Utilities.formatDate(fecha, tz, 'yyyy-MM-dd') + 'T00:00:00.000Z';
    recurso.notes = 'Hora: ' + Utilities.formatDate(fecha, tz, 'HH:mm');
  }
  const ubic = String(ubicacion || '').trim();
  if (ubic) {
    recurso.notes += (recurso.notes ? '\n' : '') + '📍 ' + ubic + '\n' +
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ubic);
  }
  return recurso;
}

function haCambiado_(remota, recurso) {
  const dueRemota = remota.due ? remota.due.slice(0, 10) : '';
  const dueLocal = recurso.due ? recurso.due.slice(0, 10) : '';
  return remota.title !== recurso.title ||
    dueRemota !== dueLocal ||
    (remota.notes || '') !== recurso.notes;
}

// ---------------------------------------------------------------- Google Tasks

function obtenerListaId_() {
  if (CONFIG.LISTA_TASKS === '@default') return '@default';
  const listas = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
  const existente = listas.find(l => l.title === CONFIG.LISTA_TASKS);
  if (existente) return existente.id;
  return Tasks.Tasklists.insert({ title: CONFIG.LISTA_TASKS }).id;
}

/** Descarga todas las tareas de la lista (incluidas completadas) en un mapa por ID. */
function tareasRemotas_(listaId) {
  const mapa = {};
  let pageToken;
  do {
    const resp = Tasks.Tasks.list(listaId, {
      showCompleted: true,
      showHidden: true,
      maxResults: 100,
      pageToken: pageToken,
    });
    (resp.items || []).forEach(t => { mapa[t.id] = t; });
    pageToken = resp.nextPageToken;
  } while (pageToken);
  return mapa;
}

// ---------------------------------------------------------------- Utilidades

/** Devuelve { nombreColumna: índice0 } leyendo la fila 1. */
function columnas_(hoja) {
  const cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const mapa = {};
  cab.forEach((nombre, i) => { if (nombre) mapa[String(nombre).trim()] = i; });
  return mapa;
}

/** AppSheet puede escribir TRUE, "TRUE", "Y", "Sí"... */
function esVerdadero_(v) {
  if (v === true) return true;
  const s = String(v).trim().toUpperCase();
  return ['TRUE', 'Y', 'YES', 'SI', 'SÍ', '1', 'VERDADERO'].indexOf(s) !== -1;
}
