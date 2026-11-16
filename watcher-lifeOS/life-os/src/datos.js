import { useQuery } from '@tanstack/react-query';
import { api, escribir, hayEscrituras, qc } from './api.js';
import { CLASE } from './clase.mjs';
import { difDias, hoy, sumarDias } from './fechas.js';

export const CLAVE = {
  datos: ['datos'], eventos: ['eventos'], calendarios: ['calendarios'], rutas: ['rutas'], clase: ['clase'], temario: ['temario'], agente: ['agente'],
};

export const lsGet = k => { try { return localStorage.getItem(`lifeos:${k}`); } catch { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(`lifeos:${k}`, v); } catch { /* modo privado */ } };

const sinApiClase = e => /no permitida|desconocida/i.test(e?.message || '');
const progresoLocal = () => { try { return JSON.parse(lsGet('clase')) || {}; } catch { return {}; } };

/** Sube una sola vez lo marcado en este dispositivo antes de que existiera la pestaña Clase. */
function migrarProgresoLocal(hoja) {
  if (lsGet('claseSubida')) return hoja;
  lsSet('claseSubida', '1');
  const pendientes = Object.keys(progresoLocal()).filter(k => !hoja[k]);
  if (!pendientes.length) return hoja;
  api('marcarClase', [pendientes, true]).catch(() => lsSet('claseSubida', ''));
  return { ...hoja, ...Object.fromEntries(pendientes.map(k => [k, true])) };
}

async function leerClase({ signal }) {
  try {
    return { hecho: migrarProgresoLocal(await api('obtenerClase', [], signal) || {}), modo: 'hoja' };
  } catch (e) {
    if (sinApiClase(e)) return { hecho: progresoLocal(), modo: 'local' };
    throw e;
  }
}

// Los eventos se piden como un único intervalo que solo crece mientras la app está abierta.
const MARGEN_EVENTOS = 35;
let rangoEventos = { desde: hoy(), hasta: sumarDias(hoy(), 21) };

/** Amplía lo descargado si lo que se va a ver queda fuera, con margen para que pasar de mes sea inmediato. */
export function cubrirEventos(ini, fin) {
  const { desde, hasta } = rangoEventos;
  if ((desde <= ini && fin <= hasta) || hayEscrituras()) return;
  const nuevoDesde = sumarDias(ini, -MARGEN_EVENTOS), nuevoHasta = sumarDias(fin, MARGEN_EVENTOS);
  rangoEventos = { desde: nuevoDesde < desde ? nuevoDesde : desde, hasta: nuevoHasta > hasta ? nuevoHasta : hasta };
  qc.invalidateQueries({ queryKey: CLAVE.eventos });
}

// Un día de más cubre el último día completo cuando hay cambio de hora en el rango.
const leerEventos = ({ signal }) => api('obtenerEventos', [rangoEventos.desde, difDias(rangoEventos.desde, rangoEventos.hasta) + 2], signal);

const LECTURAS = {
  datos: ({ signal }) => api('obtenerDatos', [], signal),
  eventos: leerEventos,
  calendarios: ({ signal }) => api('obtenerCalendarios', [], signal),
  rutas: ({ signal }) => api('obtenerRutas', [], signal),
  clase: leerClase,
  temario: async ({ signal }) => {
    try {
      const r = await fetch('/api/clase/temario', { credentials: 'same-origin', signal });
      if (!r.ok) return { modulos: CLASE, mapaIds: {}, fuentes: {}, novedades: [] };
      const cuerpo = await r.json();
      return cuerpo?.ok && Array.isArray(cuerpo.data?.modulos)
        ? cuerpo.data
        : { modulos: CLASE, mapaIds: {}, fuentes: {}, novedades: [] };
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return { modulos: CLASE, mapaIds: {}, fuentes: {}, novedades: [] };
    }
  },
  agente: ({ signal }) => api('agente/estado', [], signal),
};

const lectura = nombre => ({ queryKey: CLAVE[nombre], queryFn: LECTURAS[nombre] });
export const useDatos = () => useQuery(lectura('datos'));
export const useEventos = () => useQuery(lectura('eventos'));
export const useCalendarios = () => useQuery(lectura('calendarios'));
export const useRutas = () => useQuery(lectura('rutas'));
export const useClase = () => useQuery(lectura('clase'));
export const useTemario = () => useQuery(lectura('temario'));
export const useAgente = () => useQuery(lectura('agente'));

/** Lo que no se ve aún se pide con la app ya en reposo, para que cambiar de sección sea inmediato. */
export const precargar = () => Object.keys(LECTURAS).forEach(n => qc.prefetchQuery(lectura(n)));
export const recargar = nombres => nombres.forEach(n => qc.invalidateQueries({ queryKey: CLAVE[n] }));

export const esTemporal = id => String(id).startsWith('tmp-');
const idTemporal = () => `tmp-${Date.now()}`;

// ----- Listas: cada una vive en una consulta, sola o como campo de "datos"
const enCampo = campo => fn => d => d && { ...d, [campo]: fn(d[campo]) };
const entera = fn => d => d && fn(d);
const quitar = id => l => l.filter(x => x.id !== id);
const sustituir = (id, nuevo) => l => l.map(x => (x.id === id ? nuevo : x));
const fusionar = (id, cambio) => l => l.map(x => (x.id === id ? { ...x, ...cambio } : x));

const COMPRAS = { clave: CLAVE.datos, en: enCampo('compras'), leer: () => qc.getQueryData(CLAVE.datos)?.compras };
const TAREAS = { clave: CLAVE.datos, en: enCampo('tareas'), leer: () => qc.getQueryData(CLAVE.datos)?.tareas };
const EVENTOS = { clave: CLAVE.eventos, en: entera, leer: () => qc.getQueryData(CLAVE.eventos) };
const RUTAS = { clave: CLAVE.rutas, en: entera, leer: () => qc.getQueryData(CLAVE.rutas) };

async function guardarEn(lista, fn, obj) {
  const nuevo = !obj.id;
  const id = nuevo ? idTemporal() : obj.id;
  const previo = nuevo ? null : lista.leer()?.find(x => x.id === id);
  const { lat, lng, ...enviar } = obj;
  const r = await escribir(lista.clave, {
    aplicar: lista.en(l => (nuevo ? [...l, { ...obj, id }] : fusionar(id, obj)(l))),
    revertir: lista.en(nuevo ? quitar(id) : sustituir(id, previo)),
    llamada: () => api(fn, [nuevo ? { ...enviar, id: '' } : enviar]),
  });
  qc.setQueryData(lista.clave, lista.en(sustituir(id, r)));
  return r;
}

function borrarDe(lista, fn, id) {
  const previo = lista.leer()?.find(x => x.id === id);
  return escribir(lista.clave, {
    aplicar: lista.en(quitar(id)),
    revertir: lista.en(l => [...l, previo]),
    llamada: () => api(fn, [id]),
  });
}

function cambiarEn(lista, id, campo, valor, llamada) {
  const previo = lista.leer()?.find(x => x.id === id)?.[campo];
  return escribir(lista.clave, {
    aplicar: lista.en(fusionar(id, { [campo]: valor })),
    revertir: lista.en(fusionar(id, { [campo]: previo })),
    llamada,
  });
}

export const guardarProducto = p => guardarEn(COMPRAS, 'guardarProducto', p);
export const borrarProducto = id => borrarDe(COMPRAS, 'borrarProducto', id);
export const cambiarStock = (id, stock) => cambiarEn(COMPRAS, id, 'stock', stock, () => api('cambiarStock', [id, stock]));

export const guardarTarea = t => guardarEn(TAREAS, 'guardarTarea', t);
export const borrarTarea = id => borrarDe(TAREAS, 'borrarTarea', id);
export const marcarTarea = (id, hecha) => cambiarEn(TAREAS, id, 'completada', hecha, () => api('marcarTarea', [id, hecha]));

export const borrarEvento = id => borrarDe(EVENTOS, 'borrarEvento', id);
export async function crearEvento(ev) {
  const cal = qc.getQueryData(CLAVE.calendarios)?.find(c => c.id === ev.calendario);
  const id = idTemporal();
  const r = await escribir(CLAVE.eventos, {
    aplicar: entera(l => [...l, { ...ev, id, diaCompleto: false, recurrente: false, color: cal?.color, calendario: cal?.nombre }]),
    revertir: entera(quitar(id)),
    llamada: () => api('crearEvento', [ev]),
  });
  qc.setQueryData(CLAVE.eventos, entera(sustituir(id, r)));
  return r;
}

export const borrarRuta = id => borrarDe(RUTAS, 'borrarRuta', id);
export async function guardarRuta({ resultado, actualizada, ...ruta }) {
  const nueva = !ruta.id;
  const id = nueva ? idTemporal() : ruta.id;
  const r = await escribir(CLAVE.rutas, {
    aplicar: entera(l => (nueva ? [...l, { ...ruta, id, resultado: null }] : l)),
    revertir: entera(l => (nueva ? quitar(id)(l) : l)),
    llamada: () => api('guardarRuta', [nueva ? { ...ruta, id: '' } : ruta]),
  });
  qc.setQueryData(CLAVE.rutas, entera(sustituir(id, r)));
  return r;
}

/** Marca o desmarca piezas del curso. Sin la API en Apps Script, se queda en este dispositivo. */
export async function marcarClase(ids, hecho) {
  if (!ids.length) return;
  const poner = valor => c => {
    if (!c) return c;
    const siguiente = { ...c.hecho };
    ids.forEach(k => { if (valor) siguiente[k] = true; else delete siguiente[k]; });
    return { ...c, hecho: siguiente };
  };
  const guardarLocal = () => lsSet('clase', JSON.stringify(qc.getQueryData(CLAVE.clase)?.hecho || {}));
  const antes = qc.getQueryData(CLAVE.clase);
  if (antes?.modo === 'local') {
    qc.setQueryData(CLAVE.clase, poner(hecho));
    guardarLocal();
    return;
  }
  try {
    await escribir(CLAVE.clase, {
      aplicar: poner(hecho),
      revertir: poner(!hecho),
      llamada: () => api('marcarClase', [ids, hecho]),
    });
  } catch (e) {
    if (!sinApiClase(e)) throw e;
    qc.setQueryData(CLAVE.clase, c => poner(hecho)({ ...c, modo: 'local' }));
    guardarLocal();
  }
}

export async function refrescarTemario() {
  const r = await fetch('/api/clase/refrescar', { method: 'POST', credentials: 'same-origin' });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || !cuerpo?.ok) throw new Error(cuerpo?.error || `Error ${r.status} al actualizar el temario`);
  await qc.invalidateQueries({ queryKey: CLAVE.temario });
  return cuerpo.data;
}

