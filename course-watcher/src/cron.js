'use strict';

const { formatearFechaMadrid } = require('./normalizador.js');
const { ejecutarPasadaFuente } = require('./orquestador.js');

/**
 * Comprueba si una fecha/hora en formato Europe/Madrid ('yyyy-MM-ddTHH:mm' o 'HH:mm')
 * cae dentro del rango horario indicado ('HH:mm-HH:mm', inclusive).
 *
 * @param {string} fechaHoraMadrid
 * @param {string} [rango='08:00-22:00']
 * @returns {boolean}
 */
function enVentanaCron(fechaHoraMadrid, rango = '08:00-22:00') {
  const texto = String(fechaHoraMadrid || '').trim();
  const hhmm = texto.includes('T') ? texto.slice(11, 16) : texto.slice(0, 5);
  if (!hhmm || hhmm.length < 5) return false;
  const [desde, hasta] = String(rango || '08:00-22:00')
    .split('-')
    .map(s => s.trim());
  if (!desde || !hasta) return true;
  return hhmm >= desde && hhmm <= hasta;
}

/**
 * Crea el demonio planificador de Course Watcher que ejecuta secuencialmente
 * todas las fuentes configuradas y reporta salud/latido a Life OS.
 */
function crearDemonioWatcher({
  fuentes = [],
  almacenEstado,
  clienteLifeOs,
  horario = '08:00-22:00',
  intervaloMin = 120,
  simulacro = false,
  ahora = () => new Date(),
} = {}) {
  let timer = null;

  async function ejecutarCiclo({ forzar = false } = {}) {
    const instante = ahora();
    const ms = instante instanceof Date ? instante.getTime() : new Date(instante).getTime();
    const horaMadrid = formatearFechaMadrid(Math.floor(ms / 1000)) || '';

    if (!forzar && !enVentanaCron(horaMadrid, horario)) {
      return {
        ejecutado: false,
        motivo: 'fuera_de_horario',
        resultados: [],
      };
    }

    const resultados = [];

    for (const item of fuentes) {
      if (!item) continue;
      const nombre = item.nombre || item.fuente?.nombre || 'moodle';
      const fuente = item.fuente || item;

      const res = await ejecutarPasadaFuente({
        nombreFuente: nombre,
        fuente,
        almacenEstado,
        clienteLifeOs,
        simulacro,
      });

      if (!simulacro && clienteLifeOs) {
        if (res.ok && !res.enviado) {
          try {
            await clienteLifeOs.enviarLote({
              origen: nombre,
              fuente: nombre,
              completa: false,
              items: [],
              estadoFuente: {
                ok: true,
                error: '',
                fallosSeguidos: 0,
              },
            });
          } catch {
            // No abortar el ciclo si Life OS no responde durante el latido
          }
        } else if (!res.ok) {
          try {
            await clienteLifeOs.enviarLote({
              origen: nombre,
              fuente: nombre,
              completa: false,
              items: [],
              estadoFuente: {
                ok: false,
                error: res.error || 'Error en fuente',
                fallosSeguidos: res.fallosSeguidos || 1,
              },
            });
          } catch {
            // No abortar el ciclo si Life OS está temporalmente inalcanzable
          }
        }
      }

      resultados.push({
        nombre,
        ...res,
      });
    }

    return {
      ejecutado: true,
      horaMadrid,
      resultados,
    };
  }

  function iniciar({ ejecutarInmediato = false } = {}) {
    if (timer) return timer;
    const msIntervalo = Math.max(1, Number(intervaloMin) || 120) * 60 * 1000;
    timer = setInterval(() => {
      ejecutarCiclo().catch(() => {});
    }, msIntervalo);
    if (ejecutarInmediato) {
      ejecutarCiclo().catch(() => {});
    }
    return timer;
  }

  function detener() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    ejecutarCiclo,
    iniciar,
    detener,
  };
}

module.exports = {
  enVentanaCron,
  crearDemonioWatcher,
};
