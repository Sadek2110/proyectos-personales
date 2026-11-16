'use strict';

const crypto = require('node:crypto');

const formateadorMadrid = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function limpiarTokenDeUrl(urlStr) {
  if (!urlStr) return '';
  return String(urlStr)
    .replace(/([?&])(ws)?token=[^&#]+(&?)/gi, (_m, sep, _ws, tail) => {
      if (sep === '?' && tail === '&') return '?';
      if (sep === '&' && tail === '&') return '&';
      return '';
    })
    .replace(/[?&]$/, '');
}

/**
 * Convierte segundos Unix a 'yyyy-MM-ddTHH:mm' en zona horaria Europe/Madrid.
 * Si !timestampSegundos o <= 0, devuelve undefined.
 */
function formatearFechaMadrid(timestampSegundos) {
  if (timestampSegundos === null || timestampSegundos === undefined) return undefined;
  const ts = Number(timestampSegundos);
  if (!ts || ts <= 0 || Number.isNaN(ts)) return undefined;

  const partes = {};
  for (const parte of formateadorMadrid.formatToParts(new Date(ts * 1000))) {
    if (parte.type !== 'literal') {
      partes[parte.type] = parte.value;
    }
  }
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

/**
 * Calcula los primeros 16 caracteres hexadecimales del SHA-256 sobre
 * JSON.stringify({ n, tipo, fecha, url }).
 */
function calcularHashItem({ n, tipo, fecha, url } = {}) {
  const payload = JSON.stringify({
    n: n || '',
    tipo: tipo || '',
    fecha: fecha || '',
    url: url || '',
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Mapea una sección de Moodle ({ section, name }) al par { k, t }.
 */
function inferirUnidadMoodle(idModulo, seccion = {}) {
  const nombreOriginal = String(seccion.name || '').trim();
  const norm = normalizarTexto(nombreOriginal);
  const numSeccion = seccion.section ?? 0;

  if (numSeccion === 0 || norm === 'general') {
    return { k: 'General', t: nombreOriginal || 'General' };
  }

  if (
    norm.startsWith('inicio de curso') ||
    norm === 'inicio' ||
    norm.includes('criterios de evaluacion') ||
    norm.startsWith('calendario')
  ) {
    return { k: 'Inicio', t: nombreOriginal || 'Inicio de curso' };
  }

  if (norm === 'examenes') {
    return { k: 'Exámenes', t: nombreOriginal };
  }

  if (norm.includes('clases grabadas') || norm === 'videos') {
    return { k: 'Vídeos', t: nombreOriginal || 'Clases grabadas' };
  }

  const mod = String(idModulo || '').toLowerCase();

  if (mod === 'est') {
    if (norm.includes('introduccion a las estructuras de control')) {
      return { k: 'UD1', t: nombreOriginal };
    }
    if (norm.includes('sentencias condicionales')) {
      return { k: 'UD2', t: nombreOriginal };
    }
    if (norm.includes('sentencias iterativas')) {
      return { k: 'UD3', t: nombreOriginal };
    }
    if (norm === 'funciones' || norm.startsWith('funciones')) {
      return { k: 'UD4', t: nombreOriginal };
    }
    if (norm.includes('programacion de codigo eficiente') || norm.includes('codigo eficiente y robusto')) {
      return { k: 'UD5', t: nombreOriginal };
    }
  }

  if (mod === 'ana') {
    if (norm.includes('acceso a datos')) {
      return { k: 'UD1', t: nombreOriginal };
    }
    if (norm.includes('manipulacion, limpieza') || norm.includes('manipulacion y limpieza')) {
      return { k: 'UD2', t: nombreOriginal };
    }
    if (norm.includes('analisis exploratorio')) {
      return { k: 'UD3', t: nombreOriginal };
    }
    if (norm.includes('modelado estadistico')) {
      return { k: 'UD4', t: nombreOriginal };
    }
  }

  // Patrones generales: UT01, UT1
  const matchUt = norm.match(/^ut\s*0*(\d+)\b/);
  if (matchUt) {
    return { k: `UT${matchUt[1]}`, t: nombreOriginal };
  }

  // Patrones generales: TEMA 1, Tema 1, T1
  const matchTema = norm.match(/^(?:tema|t)\s*0*(\d+)\b/);
  if (matchTema) {
    return { k: `T${matchTema[1]}`, t: nombreOriginal };
  }

  // Patrones generales: UD01, UD1, Unidad 1
  const matchUd = norm.match(/^u(?:d|nidad)\s*0*(\d+)\b/);
  if (matchUd) {
    return { k: `UD${matchUd[1]}`, t: nombreOriginal };
  }

  // Patrones generales: "1. Desarrollo..."
  const matchNum = norm.match(/^0*(\d+)\.\s+/);
  if (matchNum) {
    return { k: `UD${matchNum[1]}`, t: nombreOriginal };
  }

  return {
    k: `S${numSeccion}`,
    t: nombreOriginal || `Sección ${numSeccion}`,
  };
}

/**
 * Infiere el tipo de ítem de Life OS a partir de un course module (cm) de Moodle.
 * Devuelve null si cm.modname === 'label'.
 */
function inferirTipoMoodle(cm, unidadK) {
  if (!cm || cm.modname === 'label') return null;

  const modname = String(cm.modname || '').toLowerCase();
  const nombreNorm = normalizarTexto(cm.name);
  const contents = Array.isArray(cm.contents) ? cm.contents : [];

  if (modname === 'assign') return 'Entrega';
  if (modname === 'quiz' || modname === 'questionnaire') return 'Prueba';

  if (modname === 'forum') {
    if (
      nombreNorm.includes('aviso') ||
      nombreNorm.includes('notificacion') ||
      nombreNorm.includes('informacion')
    ) {
      return 'Anuncio';
    }
    return 'Enlace';
  }

  if (modname === 'folder') {
    const nombresArchivos = contents.map(c => String(c.filename || '').toLowerCase());
    if (nombresArchivos.some(f => f.endsWith('.zip') || f.endsWith('.rar') || f.endsWith('.7z'))) {
      return 'ZIP';
    }
    if (
      nombresArchivos.some(f => f.endsWith('.pdf')) ||
      contents.some(c => String(c.mimetype || '').toLowerCase() === 'application/pdf')
    ) {
      return 'PDF';
    }
    return 'Tema';
  }

  if (modname === 'url') {
    const urlDestino = String(contents[0]?.fileurl || cm.url || '').toLowerCase();
    const unidadNorm = normalizarTexto(unidadK);
    if (
      unidadNorm === 'videos' ||
      nombreNorm.includes('video') ||
      nombreNorm.includes('videollamada') ||
      nombreNorm.includes('clase grabada') ||
      urlDestino.includes('drive.google.com/file') ||
      urlDestino.includes('youtube.com') ||
      urlDestino.includes('youtu.be') ||
      urlDestino.includes('vimeo.com')
    ) {
      return 'Vídeo';
    }
    return 'Enlace';
  }

  if (modname === 'resource' || modname === 'page' || modname === 'book') {
    const principal = contents[0];
    if (principal) {
      const fname = String(principal.filename || '').toLowerCase();
      const mime = String(principal.mimetype || '').toLowerCase();

      if (fname.endsWith('.ipynb')) return 'Notebook';
      if (fname.endsWith('.pdf') || mime === 'application/pdf') return 'PDF';
      if (fname.endsWith('.zip') || fname.endsWith('.rar') || fname.endsWith('.7z')) return 'ZIP';
      if (
        fname.endsWith('.txt') ||
        fname.endsWith('.json') ||
        fname.endsWith('.csv') ||
        fname.endsWith('.xml')
      ) {
        return 'Datos';
      }
    }
    return 'Tema';
  }

  return 'Tema';
}

function extraerTimestampModulo(cm, tipo, mapaAssignments, mapaQuizzes) {
  const dates = Array.isArray(cm.dates) ? cm.dates : [];

  if (tipo === 'Entrega') {
    const assign = mapaAssignments.get(cm.id);
    if (assign && Number(assign.duedate) > 0) {
      return Number(assign.duedate);
    }
    const dateDue = dates.find(d => d.dataid === 'duedate' && Number(d.timestamp) > 0);
    if (dateDue) return Number(dateDue.timestamp);
  }

  if (tipo === 'Prueba') {
    const quiz = mapaQuizzes.get(cm.id);
    if (quiz) {
      if (Number(quiz.timeclose) > 0) return Number(quiz.timeclose);
      if (Number(quiz.timeopen) > 0) return Number(quiz.timeopen);
    }
    const dateClose = dates.find(d => d.dataid === 'timeclose' && Number(d.timestamp) > 0);
    if (dateClose) return Number(dateClose.timestamp);
    const dateOpen = dates.find(d => d.dataid === 'timeopen' && Number(d.timestamp) > 0);
    if (dateOpen) return Number(dateOpen.timestamp);
  }

  const dateCualquiera = dates.find(
    d => (d.dataid === 'duedate' || d.dataid === 'timeclose' || d.dataid === 'timeopen') && Number(d.timestamp) > 0
  );
  return dateCualquiera ? Number(dateCualquiera.timestamp) : 0;
}

/**
 * Normaliza un curso completo de Moodle al formato de módulo de Life OS.
 */
function normalizarCursoMoodle({
  courseId,
  idModulo,
  nombreModulo,
  origen = 'moodle',
  secciones = [],
  assignments = [],
  quizzes = [],
  grades = [],
}) {
  const mapaAssignments = new Map();
  for (const a of assignments || []) {
    if (a && a.cmid !== undefined) {
      mapaAssignments.set(Number(a.cmid), a);
    }
  }

  const mapaQuizzes = new Map();
  for (const q of quizzes || []) {
    const cmid = q?.coursemodule ?? q?.cmid;
    if (cmid !== undefined) {
      mapaQuizzes.set(Number(cmid), q);
    }
  }

  const mapaUnidades = new Map();
  const unidades = [];

  for (const sec of secciones || []) {
    const infoUnidad = inferirUnidadMoodle(idModulo, sec);
    let unidad = mapaUnidades.get(infoUnidad.k);
    if (!unidad) {
      unidad = { k: infoUnidad.k, t: infoUnidad.t, items: [] };
      mapaUnidades.set(infoUnidad.k, unidad);
      unidades.push(unidad);
    }

    const modulosSec = Array.isArray(sec.modules) ? sec.modules : [];
    for (const cm of modulosSec) {
      const tipo = inferirTipoMoodle(cm, infoUnidad.k);
      if (!tipo) continue;

      const n = String(cm.name || '').trim();
      const ts = extraerTimestampModulo(cm, tipo, mapaAssignments, mapaQuizzes);
      const fecha = formatearFechaMadrid(ts);

      const contents = Array.isArray(cm.contents) ? cm.contents : [];
      const modname = String(cm.modname || '').toLowerCase();
      const rawUrl =
        modname === 'url'
          ? contents[0]?.fileurl || cm.url || ''
          : cm.url || contents[0]?.fileurl || '';
      const url = limpiarTokenDeUrl(rawUrl);

      const archivos = contents
        .filter(c => c && c.type === 'file' && c.fileurl)
        .map(c => ({
          filename: c.filename || '',
          fileurl: limpiarTokenDeUrl(c.fileurl),
          filesize: c.filesize ?? 0,
          mimetype: c.mimetype || '',
          timemodified: c.timemodified || 0,
        }));

      const item = {
        ext_id: `moodle:${courseId}:cm:${cm.id}`,
        origen,
        n,
        tipo,
        url,
        archivos,
        hash: calcularHashItem({ n, tipo, fecha, url }),
      };

      if (fecha) {
        item.fecha = fecha;
      }

      unidad.items.push(item);
    }
  }

  const calificaciones = (grades || [])
    .filter(g => g && g.itemtype === 'mod' && g.graderaw !== null && g.graderaw !== undefined)
    .map(g => ({
      ext_id: `moodle:${courseId}:grade:${g.id}`,
      id: g.id,
      cmid: g.cmid,
      itemname: String(g.itemname || '').trim(),
      graderaw: g.graderaw,
      grademin: g.grademin ?? 0,
      grademax: g.grademax ?? 10,
      gradeformatted: g.gradeformatted || '',
      feedback: g.feedback || '',
      gradedategraded: g.gradedategraded || null,
    }));

  return {
    id: idModulo,
    nombre: nombreModulo,
    unidades,
    calificaciones,
  };
}

module.exports = {
  formatearFechaMadrid,
  calcularHashItem,
  inferirUnidadMoodle,
  inferirTipoMoodle,
  normalizarCursoMoodle,
};
