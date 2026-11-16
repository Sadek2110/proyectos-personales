'use strict';

const { calcularDiffLote } = require('./diff.js');

/**
 * Ejecuta una pasada completa de obtención, cálculo de diff, envío condicional a Life OS
 * y persistencia transaccional del estado de la fuente.
 *
 * @param {object} opciones
 * @param {string} [opciones.nombreFuente] - Identificador de la fuente en el almacén de estado
 * @param {object} opciones.fuente - Conector con método async obtenerLote()
 * @param {object} [opciones.almacenEstado] - Instancia de crearAlmacenEstadoWatcher
 * @param {object} [opciones.clienteLifeOs] - Instancia de crearClienteLifeOs
 * @param {object} [opciones.resumidor] - Instancia opcional de crearResumidorTemas
 * @param {boolean} [opciones.simulacro=false] - Si es true, no envía a Life OS ni altera el estado
 * @param {boolean} [opciones.forzarEnvio=false] - Si es true, envía a Life OS aunque no haya cambios
 */
async function ejecutarPasadaFuente({
  nombreFuente,
  fuente,
  almacenEstado,
  clienteLifeOs,
  resumidor,
  simulacro = false,
  forzarEnvio = false,
} = {}) {
  try {
    const lote = await fuente.obtenerLote();
    const nombre = nombreFuente || lote?.fuente || 'moodle';
    const estadoPrevio = almacenEstado ? almacenEstado.obtenerEstadoFuente(nombre) : {};
    const diff = calcularDiffLote(estadoPrevio, lote);

    if (simulacro === true) {
      return {
        ok: true,
        simulacro: true,
        hayCambios: diff.hayCambios,
        resumen: diff.resumen,
        detalle: diff.detalle,
        enviado: false,
      };
    }

    if (diff.hayCambios || forzarEnvio) {
      const loteEnvio = { ...lote, novedades: diff.detalle };
      if (resumidor && typeof resumidor.enriquecerLoteConResumenes === 'function') {
        const idsNuevos = (diff.detalle?.nuevos || [])
          .map(it => (typeof it === 'string' ? it : it?.ext_id))
          .filter(Boolean);
        if (idsNuevos.length > 0) {
          await resumidor.enriquecerLoteConResumenes(loteEnvio, idsNuevos);
        }
      }
      const resEnvio = await clienteLifeOs.enviarLote(loteEnvio, { simulacro: false });
      almacenEstado?.registrarExitoFuente(nombre, diff.nuevoEstadoFuente, diff.resumen);
      return {
        ok: true,
        simulacro: false,
        hayCambios: diff.hayCambios,
        resumen: diff.resumen,
        detalle: diff.detalle,
        enviado: true,
        respuestaLifeOs: resEnvio.respuesta,
      };
    }

    almacenEstado?.registrarExitoFuente(nombre, diff.nuevoEstadoFuente, diff.resumen);
    return {
      ok: true,
      simulacro: false,
      hayCambios: false,
      resumen: diff.resumen,
      detalle: diff.detalle,
      enviado: false,
    };
  } catch (err) {
    const infoFallo = almacenEstado
      ? almacenEstado.registrarFalloFuente(nombreFuente || 'moodle', err)
      : null;
    return {
      ok: false,
      error: err?.message || String(err),
      codigo: err?.codigo || null,
      fallosSeguidos: infoFallo?.fallosSeguidos || 1,
      debeAlertar: Boolean(infoFallo?.debeAlertar),
    };
  }
}

module.exports = {
  ejecutarPasadaFuente,
};
