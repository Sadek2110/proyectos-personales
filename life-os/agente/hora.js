// La hoja y el calendario dan horas locales sin zona ("2026-11-04T17:00"), así que se compara
// contra la hora de pared de Madrid: el cambio de hora ya viene resuelto por Intl.
'use strict';

function ahoraLocal(fecha, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const aMinutos = s => Date.parse(`${s.slice(0, 16)}:00Z`) / 6e4;
const minutosEntre = (desde, hasta) => aMinutos(hasta) - aMinutos(desde);

function sumarDias(dia, n) {
  return new Date(Date.parse(`${dia.slice(0, 10)}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}

function fechaLarga(fecha, tz) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(fecha);
}

module.exports = { ahoraLocal, minutosEntre, sumarDias, fechaLarga };
