import { config } from '../config.js';

// Fecha y hora "de pared" en Ceuta, independientemente de la zona del servidor
function partes(fecha = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.zonaHoraria,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(f.formatToParts(fecha).map((p) => [p.type, p.value]));
}

/** YYYY-MM-DD en la zona horaria del curso */
export function hoy(fecha = new Date()) {
  const p = partes(fecha);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutos desde medianoche en la zona horaria del curso */
export function minutosDelDia(fecha = new Date()) {
  const p = partes(fecha);
  return Number(p.hour) * 60 + Number(p.minute);
}

/** "09:30" -> 570 */
export function horaAMinutos(hora) {
  if (!hora) return null;
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}
