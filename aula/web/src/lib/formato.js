const ZONA = 'Europe/Madrid';

/** "2026-10-08" -> Date a mediodía para evitar saltos de día por la zona horaria */
export const aFecha = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00`);

export const fechaLarga = (iso) =>
  aFecha(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase());

export const fechaCorta = (iso) => aFecha(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export const fechaHora = (ts) =>
  new Date(ts).toLocaleString('es-ES', { timeZone: ZONA, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' }) : '—');

export const horario = (s) => (s?.hora_inicio ? `${s.hora_inicio}${s.hora_fin ? ` a ${s.hora_fin}` : ''}` : 'Horario por confirmar');

export function hace(ts) {
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

export const iniciales = (nombre = '') =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export const nota = (n) => (n === null || n === undefined ? '—' : String(n).replace('.', ','));

export const NIVELES = {
  1: 'Necesita mucha ayuda',
  2: 'Con ayuda',
  3: 'Casi autónomo',
  4: 'Autónomo',
};

export const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
