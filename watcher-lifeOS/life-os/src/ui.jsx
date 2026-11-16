import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { lsGet, lsSet } from './datos.js';
import { hoy } from './fechas.js';

export const TABS = [
  { id: 'compras', label: 'Compras', icon: 'cart' },
  { id: 'tareas', label: 'Tareas', icon: 'tasks' },
  { id: 'mapa', label: 'Rutas', icon: 'map' },
  { id: 'horario', label: 'Horario', icon: 'cal' },
  { id: 'clase', label: 'Clase', icon: 'book' },
  { id: 'agente', label: 'Agente', icon: 'spark' },
];

export const VISTAS_CAL = [['mes', 'Mes'], ['semana', 'Semana'], ['dia', 'Día'], ['lista', 'Lista']];

const UI = createContext(null);
export const useUI = () => useContext(UI);

const tabInicial = () => [new URLSearchParams(location.search).get('tab'), lsGet('tab')].find(v => TABS.some(t => t.id === v)) || 'compras';

export function UIProvider({ children }) {
  const [tab, setTab] = useState(tabInicial);
  const [dia, setDia] = useState(hoy);
  const [vistaCal, setVistaCalBase] = useState(() => (VISTAS_CAL.some(([v]) => v === lsGet('vistaCal')) ? lsGet('vistaCal') : 'mes'));
  const [modoMapa, setModoMapaBase] = useState(() => (lsGet('modoMapa') === 'rutas' ? 'rutas' : 'paradas'));
  const [rutaSel, setRutaSel] = useState(null);
  const [hoja, setHoja] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const nHoja = useRef(0);
  const nMensaje = useRef(0);

  const irA = useCallback(id => { setTab(id); lsSet('tab', id); }, []);
  const setVistaCal = useCallback(v => { setVistaCalBase(v); lsSet('vistaCal', v); }, []);
  const setModoMapa = useCallback(m => { setModoMapaBase(m); setRutaSel(null); lsSet('modoMapa', m); }, []);
  const abrirHoja = useCallback(elemento => { nHoja.current++; setHoja({ id: nHoja.current, elemento }); }, []);
  const cerrarHoja = useCallback(() => setHoja(null), []);
  const aviso = useCallback((texto, deshacer) => { nMensaje.current++; setMensaje({ id: nMensaje.current, texto, deshacer }); }, []);
  const cerrarAviso = useCallback(() => setMensaje(null), []);

  const valor = useMemo(() => ({
    tab, irA, dia, setDia, vistaCal, setVistaCal, modoMapa, setModoMapa, rutaSel, setRutaSel,
    hoja, abrirHoja, cerrarHoja, mensaje, aviso, cerrarAviso,
  }), [tab, irA, dia, vistaCal, setVistaCal, modoMapa, setModoMapa, rutaSel, hoja, abrirHoja, cerrarHoja, mensaje, aviso, cerrarAviso]);

  return <UI.Provider value={valor}>{children}</UI.Provider>;
}
