export const pad = n => String(n).padStart(2, '0');
export const isoDia = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoy = () => isoDia(new Date());

export const sumarDias = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDia(new Date(y, m - 1, d + n));
};

export const aFecha = s => {
  const [f, h = '00:00'] = s.split('T');
  const [y, m, d] = f.split('-').map(Number);
  const [hh, mm] = h.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

export const difDias = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 864e5);
export const inicioSemana = iso => sumarDias(iso, -((aFecha(iso).getDay() + 6) % 7));
export const diasDesde = (ini, n) => Array.from({ length: n }, (_, i) => sumarDias(ini, i));

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function nombreDia(iso, largo) {
  const h = hoy();
  if (iso === h) return 'Hoy';
  if (iso === sumarDias(h, 1)) return 'Mañana';
  if (iso === sumarDias(h, -1)) return 'Ayer';
  const d = aFecha(iso);
  return largo
    ? `${cap(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]}`
    : `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

export function fechaCorta(s) {
  if (!s) return '';
  const hora = s.slice(11, 16);
  return nombreDia(s.slice(0, 10)) + (hora && hora !== '00:00' ? `, ${hora}` : '');
}

export const diasHasta = iso => Math.round((aFecha(iso.slice(0, 10)) - aFecha(hoy())) / 864e5);

export function textoDias(n) {
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}
