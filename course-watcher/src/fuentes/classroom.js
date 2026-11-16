'use strict';

const {
  formatearFechaMadrid,
  calcularHashItem,
} = require('../normalizador.js');

const MESES_ES = {
  ene: '01',
  enero: '01',
  feb: '02',
  febrero: '02',
  mar: '03',
  marzo: '03',
  abr: '04',
  abril: '04',
  may: '05',
  mayo: '05',
  jun: '06',
  junio: '06',
  jul: '07',
  julio: '07',
  ago: '08',
  agosto: '08',
  sep: '09',
  sept: '09',
  set: '09',
  septiembre: '09',
  oct: '10',
  octubre: '10',
  nov: '11',
  noviembre: '11',
  dic: '12',
  diciembre: '12',
};

function limpiarComillas(texto) {
  return String(texto || '')
    .trim()
    .replace(/^["“”'«»]+|["“”'«»]+$/g, '')
    .trim();
}

function quitarExtensionConocida(nombre) {
  return String(nombre || '').trim();
}

function extraerFechaEntregaTexto(texto) {
  if (!texto) return undefined;
  const lineaMatch = /(?:Fecha de entrega|Fecha l[ií]mite|Due date)\s*:\s*([^\r\n]+)/i.exec(texto);
  const candidato = lineaMatch ? lineaMatch[1].trim() : '';
  if (!candidato) return undefined;

  // Formato ISO: 2026-11-25 23:59 o 2026-11-25T23:59
  const isoMatch = /(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2}))?/.exec(candidato);
  if (isoMatch) {
    const [, yyyy, mm, dd, hh = '23', min = '59'] = isoMatch;
    return `${yyyy}-${mm}-${dd}T${String(hh).padStart(2, '0')}:${min}`;
  }

  // Formato español: 25 nov 2026 23:59 o 25 de noviembre de 2026, 23:59
  const esMatch =
    /(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\.?\s+(?:de\s+)?(\d{4})(?:[\s,]+(\d{1,2}):(\d{2}))?/i.exec(
      candidato
    );
  if (esMatch) {
    const [, d, mesRaw, yyyy, hh = '23', min = '59'] = esMatch;
    const claveMes = mesRaw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const mm = MESES_ES[claveMes];
    if (mm) {
      return `${yyyy}-${mm}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${min}`;
    }
  }

  return undefined;
}

function inferirUnidadClassroom(texto, titulo = '') {
  const combinado = `${titulo}\n${texto || ''}`;

  // Tema explícito en el cuerpo: "Tema: U3 · Colecciones"
  const temaLinea = /Tema\s*:\s*([^\r\n]+)/i.exec(texto || '');
  if (temaLinea) {
    const uTema = mapearTopicClassroom({ name: temaLinea[1].trim() });
    if (uTema && uTema.k) return uTema.k;
  }

  // Prefijo numérico en título: "3.1 ...", "2.3c ...", "2_3c..."
  const prefijoNum = /^\s*([1-9])(?:\.\d+[a-z0-9]*|_\d+[a-z0-9]*)\b/i.exec(titulo || '');
  if (prefijoNum) {
    return `U${prefijoNum[1]}`;
  }

  // Mención explícita U1..U9, UD1..UD9, Unidad 1..9, Tema 1..9
  const uExplicita = /\b(?:u|ud|unidad|tema)\s*0*([1-9])\b/i.exec(combinado);
  if (uExplicita) {
    return `U${uExplicita[1]}`;
  }

  if (/\b(?:presentaci[oó]n|introducci[oó]n al m[oó]dulo)\b/i.test(combinado)) {
    return 'Inicio';
  }

  return 'General';
}

function inferirTipoMaterialPorTexto(titulo = '', cuerpo = '') {
  const texto = `${titulo} ${cuerpo}`.toLowerCase();
  if (
    texto.includes('.ipynb') ||
    texto.includes('notebook') ||
    texto.includes('cuaderno') ||
    texto.includes('colab')
  ) {
    return 'Notebook';
  }
  if (texto.includes('.zip') || texto.includes('.rar') || texto.includes('.7z')) {
    return 'ZIP';
  }
  if (texto.includes('.pdf')) {
    return 'PDF';
  }
  if (
    texto.includes('youtube.com') ||
    texto.includes('youtu.be') ||
    texto.includes('.mp4') ||
    texto.includes('vídeo') ||
    texto.includes('video')
  ) {
    return 'Vídeo';
  }
  return 'PDF';
}

function extraerTextoAnuncioDeCuerpo(body = '', subject = '') {
  const lineas = String(body || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  for (const linea of lineas) {
    if (/^nuevo anuncio\b/i.test(linea)) continue;
    if (/ha publicado\b/i.test(linea)) continue;
    if (/^abrir(?:\s+en\s+classroom)?\s*:/i.test(linea)) continue;
    if (/^https?:\/\//i.test(linea)) continue;
    return limpiarComillas(linea);
  }

  return limpiarComillas(subject) || 'Anuncio';
}

/**
 * Parsea un correo de notificación de Google Classroom (Opción B).
 */
function parsearCorreoClassroom(correo = {}, { idModulo = 'ent' } = {}) {
  const subject = String(correo.subject || '').trim();
  const body = String(correo.body || '').trim();

  // Extraer enlaces de Classroom y Google Drive
  const matchClassroomUrl = /(https?:\/\/classroom\.google\.com\/[^\s"<>]+)/i.exec(body);
  const classroomUrl = matchClassroomUrl ? matchClassroomUrl[1] : '';

  const matchDriveUrl = /(https?:\/\/drive\.google\.com\/[^\s"<>]+)/i.exec(body);
  const driveUrl = matchDriveUrl ? matchDriveUrl[1] : undefined;

  let extId = `classroom:${idModulo}:msg:${correo.id || 'sin_id'}`;
  if (classroomUrl) {
    const matchRecurso = /\/(a|m|p)\/([A-Za-z0-9_-]+)(?:\/details)?/i.exec(classroomUrl);
    if (matchRecurso) {
      const [, tipoRuta, idRecurso] = matchRecurso;
      const prefijo =
        tipoRuta.toLowerCase() === 'a'
          ? 'cw'
          : tipoRuta.toLowerCase() === 'm'
            ? 'cwm'
            : 'ann';
      extId = `classroom:${idModulo}:${prefijo}:${idRecurso}`;
    }
  }

  let tipo = 'Tema';
  let n = subject;
  let calificacion;

  const matchTarea = /^(?:Nueva tarea|New assignment)\s*:\s*(.+)$/i.exec(subject);
  const matchPregunta =
    /^(?:Nueva pregunta|Nuevo cuestionario|New question|New quiz)\s*:\s*(.+)$/i.exec(subject);
  const matchMaterial = /^(?:Nuevo material|New material)\s*:\s*(.+)$/i.exec(subject);
  const matchAnuncio = /^(?:Nuevo anuncio|Nueva publicaci[oó]n|New announcement)\b/i.exec(subject);
  const matchCalif =
    /^(?:Calificaci[oó]n publicada|Con calificaci[oó]n|Graded)\s*:\s*(.+)$/i.exec(subject);

  if (matchTarea) {
    tipo = 'Entrega';
    n = limpiarComillas(matchTarea[1]);
  } else if (matchPregunta) {
    tipo = 'Prueba';
    n = limpiarComillas(matchPregunta[1]);
  } else if (matchMaterial) {
    n = quitarExtensionConocida(limpiarComillas(matchMaterial[1]));
    tipo = inferirTipoMaterialPorTexto(n, body);
  } else if (matchCalif) {
    tipo = 'Nota';
    n = limpiarComillas(matchCalif[1]);
    const matchNotaNum =
      /(?:Calificaci[oó]n|Nota|Grade)\s*:\s*(\d+(?:[.,]\d+)?)(?:\s*\/\s*\d+(?:[.,]\d+)?)?/i.exec(
        body
      ) || /(\d+(?:[.,]\d+)?)\s*\/\s*\d+/.exec(body);
    if (matchNotaNum) {
      calificacion = Number(matchNotaNum[1].replace(',', '.'));
    }
  } else if (matchAnuncio) {
    tipo = 'Anuncio';
    n = extraerTextoAnuncioDeCuerpo(body, subject);
  } else {
    n = limpiarComillas(subject);
  }

  const unidad =
    tipo === 'Anuncio'
      ? inferirUnidadClassroom(body, '') === 'General'
        ? 'Inicio'
        : inferirUnidadClassroom(body, '')
      : inferirUnidadClassroom(body, n);

  const fecha = extraerFechaEntregaTexto(body);
  const url = classroomUrl || driveUrl || '';

  const resultado = {
    ext_id: extId,
    origen: 'classroom',
    n,
    tipo,
    unidad,
    url,
    hash: calcularHashItem({ n, tipo, fecha, url }),
  };

  if (fecha) {
    resultado.fecha = fecha;
  }
  if (driveUrl) {
    resultado.drive_url = driveUrl;
  }
  if (calificacion !== undefined && !Number.isNaN(calificacion)) {
    resultado.calificacion = calificacion;
  }

  return resultado;
}

function mapearTopicClassroom(topic = {}) {
  const nombreOriginal = String(topic.name || '').trim();
  if (!nombreOriginal) {
    return { k: 'General', t: 'General' };
  }

  if (/^(?:presentaci[oó]n|inicio)$/i.test(nombreOriginal)) {
    return { k: 'Inicio', t: nombreOriginal };
  }

  const matchU = /^(U\d+)\s*[·:\-–—]\s*(.+)$/i.exec(nombreOriginal);
  if (matchU) {
    return { k: matchU[1].toUpperCase(), t: matchU[2].trim() };
  }

  const matchUnidad = /^(?:U|UD|Unidad|Tema)\s*0*(\d+)\b\s*[·:\-–—]?\s*(.*)$/i.exec(nombreOriginal);
  if (matchUnidad) {
    const k = `U${matchUnidad[1]}`;
    const t = matchUnidad[2].trim() || nombreOriginal;
    return { k, t };
  }

  return { k: nombreOriginal, t: nombreOriginal };
}

function convertirDueClassroomAMadrid(dueDate, dueTime) {
  if (!dueDate || !dueDate.year || !dueDate.month || !dueDate.day) {
    return undefined;
  }
  const hours = dueTime?.hours ?? 23;
  const minutes = dueTime?.minutes ?? 59;
  const seconds = dueTime?.seconds ?? 0;
  const msUtc = Date.UTC(
    Number(dueDate.year),
    Number(dueDate.month) - 1,
    Number(dueDate.day),
    Number(hours),
    Number(minutes),
    Number(seconds)
  );
  return formatearFechaMadrid(Math.floor(msUtc / 1000));
}

function clasificarMaterialesClassroom(materials = [], titulo = '') {
  let driveUrl;
  const archivos = [];
  let tipoDetectado = null;

  for (const mat of materials || []) {
    const df = mat?.driveFile?.driveFile || mat?.driveFile;
    if (df) {
      const fTitle = String(df.title || '');
      const fLink = df.alternateLink || '';
      if (!driveUrl && fLink) {
        driveUrl = fLink;
      }
      archivos.push({
        id: df.id || '',
        filename: fTitle,
        fileurl: fLink,
      });
      const lower = fTitle.toLowerCase();
      if (lower.endsWith('.ipynb')) tipoDetectado = 'Notebook';
      else if (lower.endsWith('.pdf') && !tipoDetectado) tipoDetectado = 'PDF';
      else if (
        (lower.endsWith('.zip') || lower.endsWith('.rar') || lower.endsWith('.7z')) &&
        !tipoDetectado
      ) {
        tipoDetectado = 'ZIP';
      } else if (
        (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.mkv')) &&
        !tipoDetectado
      ) {
        tipoDetectado = 'Vídeo';
      }
    } else if (mat?.youtubeVideo && !tipoDetectado) {
      tipoDetectado = 'Vídeo';
    } else if (mat?.link && !tipoDetectado) {
      tipoDetectado = 'Enlace';
    }
  }

  if (!tipoDetectado) {
    const lowerTitulo = String(titulo || '').toLowerCase();
    if (lowerTitulo.endsWith('.ipynb')) tipoDetectado = 'Notebook';
    else if (lowerTitulo.endsWith('.pdf')) tipoDetectado = 'PDF';
    else if (lowerTitulo.endsWith('.zip')) tipoDetectado = 'ZIP';
    else tipoDetectado = 'Tema';
  }

  return {
    tipo: tipoDetectado,
    drive_url: driveUrl,
    archivos,
  };
}

/**
 * Normaliza la estructura JSON de Google Classroom al formato de módulo de Life OS.
 */
function normalizarEstructuraClassroom(
  datos = {},
  { idModulo = 'ent', nombreModulo = 'Entornos y Sintaxis en Python' } = {}
) {
  const courseId =
    datos?.courses?.[0]?.id ||
    datos?.topics?.[0]?.courseId ||
    datos?.courseWork?.[0]?.courseId ||
    datos?.courseWorkMaterials?.[0]?.courseId ||
    datos?.announcements?.[0]?.courseId ||
    idModulo;

  const unidades = [];
  const mapaPorTopicId = new Map();
  const mapaPorClave = new Map();

  function obtenerOCrearUnidadPorClave(k, t = k) {
    let u = mapaPorClave.get(k);
    if (!u) {
      u = { k, t, items: [] };
      mapaPorClave.set(k, u);
      unidades.push(u);
    }
    return u;
  }

  for (const topic of datos.topics || []) {
    if (!topic) continue;
    const { k, t } = mapearTopicClassroom(topic);
    const unidad = obtenerOCrearUnidadPorClave(k, t);
    if (topic.topicId) {
      mapaPorTopicId.set(topic.topicId, unidad);
    }
  }

  function resolverUnidadItem(topicId, textoFallback = '') {
    if (topicId && mapaPorTopicId.has(topicId)) {
      return mapaPorTopicId.get(topicId);
    }
    const kInferida = inferirUnidadClassroom(textoFallback, textoFallback);
    if (kInferida !== 'General' && mapaPorClave.has(kInferida)) {
      return mapaPorClave.get(kInferida);
    }
    if (mapaPorClave.has('Inicio')) {
      return mapaPorClave.get('Inicio');
    }
    return obtenerOCrearUnidadPorClave('General', 'General');
  }

  for (const cw of datos.courseWork || []) {
    if (!cw || (cw.state && cw.state !== 'PUBLISHED')) continue;
    const cId = cw.courseId || courseId;
    const n = String(cw.title || '').trim();
    const workType = String(cw.workType || 'ASSIGNMENT').toUpperCase();
    const tipo =
      workType === 'QUIZ' ||
      workType === 'SHORT_ANSWER_QUESTION' ||
      workType === 'MULTIPLE_CHOICE_QUESTION'
        ? 'Prueba'
        : 'Entrega';
    const fecha = convertirDueClassroomAMadrid(cw.dueDate, cw.dueTime);
    const url = cw.alternateLink || '';
    const infoMat = clasificarMaterialesClassroom(cw.materials, n);

    const item = {
      ext_id: `classroom:${cId}:cw:${cw.id}`,
      origen: 'classroom',
      n,
      tipo,
      url,
      archivos: infoMat.archivos,
      hash: calcularHashItem({ n, tipo, fecha, url }),
    };
    if (fecha) item.fecha = fecha;
    if (infoMat.drive_url) item.drive_url = infoMat.drive_url;

    const unidad = resolverUnidadItem(cw.topicId, n);
    unidad.items.push(item);
  }

  for (const cwm of datos.courseWorkMaterials || []) {
    if (!cwm || (cwm.state && cwm.state !== 'PUBLISHED')) continue;
    const cId = cwm.courseId || courseId;
    const n = String(cwm.title || '').trim();
    const infoMat = clasificarMaterialesClassroom(cwm.materials, n);
    const url = cwm.alternateLink || infoMat.drive_url || '';

    const item = {
      ext_id: `classroom:${cId}:cwm:${cwm.id}`,
      origen: 'classroom',
      n,
      tipo: infoMat.tipo,
      url,
      archivos: infoMat.archivos,
      hash: calcularHashItem({ n, tipo: infoMat.tipo, fecha: undefined, url }),
    };
    if (infoMat.drive_url) {
      item.drive_url = infoMat.drive_url;
    }

    const unidad = resolverUnidadItem(cwm.topicId, n);
    unidad.items.push(item);
  }

  for (const ann of datos.announcements || []) {
    if (!ann || (ann.state && ann.state !== 'PUBLISHED')) continue;
    const cId = ann.courseId || courseId;
    const primeraLinea = String(ann.text || '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .find(Boolean);
    const n = (primeraLinea || 'Anuncio').slice(0, 120);
    const tipo = 'Anuncio';
    const url = ann.alternateLink || '';

    const item = {
      ext_id: `classroom:${cId}:ann:${ann.id}`,
      origen: 'classroom',
      n,
      tipo,
      url,
      archivos: [],
      hash: calcularHashItem({ n, tipo, fecha: undefined, url }),
    };

    const unidad = resolverUnidadItem(ann.topicId, '');
    unidad.items.push(item);
  }

  return {
    id: idModulo,
    nombre: nombreModulo,
    unidades,
    calificaciones: [],
  };
}

/**
 * Crea el conector de Google Classroom (soporta Opción B por correos y modo estructura JSON).
 */
function crearFuenteClassroom({
  idModulo = 'ent',
  nombreModulo = 'Entornos y Sintaxis en Python',
  leerCorreos,
  leerEstructura,
  gasUrl,
  gasToken,
  fetchFn = global.fetch,
} = {}) {
  async function obtenerLoteDesdeCorreos() {
    const listaCorreos = (await leerCorreos()) || [];
    const mapaUnidades = new Map();
    const unidades = [];
    const calificaciones = [];

    function obtenerUnidad(k) {
      const clave = k || 'General';
      let u = mapaUnidades.get(clave);
      if (!u) {
        u = { k: clave, t: clave, items: [] };
        mapaUnidades.set(clave, u);
        unidades.push(u);
      }
      return u;
    }

    for (const correo of listaCorreos) {
      if (!correo) continue;
      const parsed = parsearCorreoClassroom(correo, { idModulo });
      if (!parsed) continue;

      if (parsed.calificacion !== undefined && parsed.calificacion !== null) {
        const extIdGrade = parsed.ext_id.replace(/:(?:cw|cwm|ann|item|msg):/, ':grade:');
        calificaciones.push({
          ext_id: extIdGrade,
          id: correo.id || parsed.ext_id,
          itemname: parsed.n,
          graderaw: parsed.calificacion,
          calificacion: parsed.calificacion,
          grademin: 0,
          grademax: 10,
        });

        const unidad = obtenerUnidad(parsed.unidad);
        const tipoItem = parsed.tipo === 'Nota' ? 'Entrega' : parsed.tipo;
        const itemCalificado = {
          ext_id: parsed.ext_id,
          origen: 'classroom',
          n: parsed.n,
          tipo: tipoItem,
          url: parsed.url || '',
          calificacion: parsed.calificacion,
          hash: calcularHashItem({
            n: parsed.n,
            tipo: tipoItem,
            fecha: parsed.fecha,
            url: parsed.url || '',
          }),
        };
        if (parsed.fecha) itemCalificado.fecha = parsed.fecha;
        if (parsed.drive_url) itemCalificado.drive_url = parsed.drive_url;
        unidad.items.push(itemCalificado);
        continue;
      }

      const unidad = obtenerUnidad(parsed.unidad);
      const { unidad: _u, ...itemLimpio } = parsed;
      unidad.items.push(itemLimpio);
    }

    return {
      fuente: 'classroom',
      completa: false,
      modulos: [
        {
          id: idModulo,
          nombre: nombreModulo,
          unidades,
          calificaciones,
        },
      ],
    };
  }

  async function obtenerLoteDesdeEstructura() {
    let datos;
    if (typeof leerEstructura === 'function') {
      datos = await leerEstructura();
    } else if (gasUrl) {
      const headers = {};
      if (gasToken) {
        headers.Authorization = `Bearer ${gasToken}`;
      }
      const r = await fetchFn(gasUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(30000),
      });
      if (!r || !r.ok) {
        throw new Error(`Error al obtener estructura Classroom desde gasUrl (${r?.status || 'sin estado'})`);
      }
      datos = await r.json();
    } else {
      datos = {};
    }

    const modulo = normalizarEstructuraClassroom(datos, { idModulo, nombreModulo });
    return {
      fuente: 'classroom',
      completa: true,
      modulos: [modulo],
    };
  }

  async function obtenerLote() {
    if (typeof leerCorreos === 'function') {
      return obtenerLoteDesdeCorreos();
    }
    return obtenerLoteDesdeEstructura();
  }

  return {
    obtenerLote,
  };
}

module.exports = {
  parsearCorreoClassroom,
  normalizarEstructuraClassroom,
  crearFuenteClassroom,
};
