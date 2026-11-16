'use strict';

const TIPOS_RESUMIBLES = new Set(['PDF', 'Notebook', 'Vídeo', 'Enlace']);

/**
 * Determina si un ítem del temario es candidato a resumen con IA.
 * @param {object} item
 * @returns {boolean}
 */
function esMaterialResumible(item) {
  return Boolean(
    item &&
      !item.archivado &&
      !item.resumen_ia &&
      TIPOS_RESUMIBLES.has(item.tipo)
  );
}

/**
 * Construye el prompt en español para resumir un tema con Gemini.
 * @param {object} item
 * @param {string} [textoExtra='']
 * @returns {string}
 */
function construirPromptResumen(item, textoExtra = '') {
  const unidad = item?.unidad_titulo || item?.unidad || '';
  const lineas = [
    'Eres un asistente académico experto.',
    'Resume en español y en formato Markdown (máximo 6 viñetas concisas) los conceptos clave, definiciones importantes y posibles puntos o preguntas de examen del siguiente material de clase:',
    `- Título: ${item?.n || 'Sin título'}`,
    `- Tipo: ${item?.tipo || 'Material'}`,
  ];
  if (unidad) {
    lineas.push(`- Unidad: ${unidad}`);
  }
  if (item?.modulo) {
    lineas.push(`- Módulo: ${item.modulo}`);
  }
  if (textoExtra && String(textoExtra).trim()) {
    lineas.push('', 'Contenido o contexto adicional del tema:', String(textoExtra).trim());
  }
  return lineas.join('\n');
}

/**
 * Crea un resumidor de temas nuevos usando la API de Gemini con fallback de modelo.
 */
function crearResumidorTemas({
  apiKey = process.env.GEMINI_API_KEY || '',
  modelo = process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  modeloReserva = process.env.GEMINI_MODEL_RESERVA || 'gemini-3.5-flash-lite',
  fetchFn = globalThis.fetch,
  maxPorPasada = 5,
} = {}) {
  async function invocarModelo(modeloActual, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modeloActual
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const respuesta = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    return respuesta;
  }

  async function resumirItem(item, textoExtra = '') {
    if (!apiKey || !item || typeof fetchFn !== 'function') {
      return null;
    }

    const prompt = construirPromptResumen(item, textoExtra);

    try {
      let respuesta = await invocarModelo(modelo, prompt);

      if (
        !respuesta.ok &&
        (respuesta.status === 429 || respuesta.status === 503) &&
        modeloReserva &&
        modeloReserva !== modelo
      ) {
        respuesta = await invocarModelo(modeloReserva, prompt);
      }

      if (!respuesta.ok) {
        return null;
      }

      const data = await respuesta.json();
      const texto = data?.candidates?.[0]?.content?.parts
        ?.map(p => p?.text || '')
        .join('')
        .trim();

      return texto || null;
    } catch {
      return null;
    }
  }

  async function enriquecerLoteConResumenes(lote, idsNuevos = []) {
    if (!lote || typeof lote !== 'object') {
      return { resumidos: 0, lote };
    }

    const listaIds =
      idsNuevos instanceof Set
        ? Array.from(idsNuevos)
        : Array.isArray(idsNuevos)
          ? idsNuevos
          : [];

    const conjuntoNuevos = new Set(
      listaIds.map(x => (typeof x === 'string' ? x : x?.ext_id)).filter(Boolean)
    );
    const filtrarPorNuevos = conjuntoNuevos.size > 0;

    const candidatos = [];

    if (Array.isArray(lote.items)) {
      for (const it of lote.items) {
        if (it) candidatos.push(it);
      }
    }

    if (Array.isArray(lote.modulos)) {
      for (const mod of lote.modulos) {
        if (!mod || !Array.isArray(mod.unidades)) continue;
        for (const uni of mod.unidades) {
          if (!uni || !Array.isArray(uni.items)) continue;
          for (const it of uni.items) {
            if (it) candidatos.push(it);
          }
        }
      }
    }

    let resumidos = 0;
    const limite = Math.max(0, Number(maxPorPasada ?? 5));

    for (const it of candidatos) {
      if (resumidos >= limite) break;
      if (filtrarPorNuevos && !conjuntoNuevos.has(it.ext_id)) continue;
      if (!esMaterialResumible(it)) continue;

      const resumen = await resumirItem(it);
      if (resumen) {
        it.resumen_ia = resumen;
        resumidos++;
      }
    }

    return { resumidos, lote };
  }

  return {
    resumirItem,
    enriquecerLoteConResumenes,
  };
}

module.exports = {
  esMaterialResumible,
  crearResumidorTemas,
};
