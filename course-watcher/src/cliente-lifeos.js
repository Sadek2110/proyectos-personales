'use strict';

/**
 * Crea un cliente HTTP autenticado para enviar lotes de temario a Life OS.
 *
 * @param {object} opciones
 * @param {string} opciones.lifeosUrl - URL base del servidor de Life OS
 * @param {string} opciones.ingestaToken - Token Bearer para autenticar la ingesta
 * @param {Function} [opciones.fetchFn=global.fetch] - Función fetch inyectable para tests
 */
function crearClienteLifeOs({ lifeosUrl, ingestaToken, fetchFn = global.fetch } = {}) {
  async function enviarLote(lote, { simulacro = false } = {}) {
    if (simulacro === true) {
      return { simulacro: true, enviado: false, respuesta: null };
    }

    if (!lifeosUrl || !ingestaToken) {
      throw new Error('Faltan lifeosUrl o ingestaToken para enviar a Life OS');
    }

    const urlDestino = `${String(lifeosUrl).replace(/\/+$/, '')}/api/ingesta/clase`;
    const resp = await fetchFn(urlDestino, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ingestaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lote),
    });

    const status = resp?.status ?? 0;
    const esOk = resp?.ok !== undefined ? Boolean(resp.ok) : status >= 200 && status < 300;

    if (!esOk) {
      let detalleError = '';
      if (typeof resp?.text === 'function') {
        try {
          detalleError = await resp.text();
        } catch {
          detalleError = '';
        }
      } else if (typeof resp?.json === 'function') {
        try {
          const cuerpoErr = await resp.json();
          detalleError = cuerpoErr?.error || JSON.stringify(cuerpoErr);
        } catch {
          detalleError = '';
        }
      }
      throw new Error(
        `Error al enviar lote a Life OS (HTTP ${status})${detalleError ? `: ${detalleError}` : ''}`
      );
    }

    const respuesta = typeof resp.json === 'function' ? await resp.json() : null;
    return {
      simulacro: false,
      enviado: true,
      respuesta,
    };
  }

  return {
    enviarLote,
  };
}

module.exports = {
  crearClienteLifeOs,
};
