import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { hayEscrituras, cerrarSesion } from './api.js';
import { claseTotal, entregasUrgentes, novedadesNoVistas } from './clase.mjs';
import { Contador, Esqueleto, MUELLE } from './componentes/comun.jsx';
import { FormEvento, FormProducto, FormRuta, FormTarea } from './componentes/formularios.jsx';
import { Icono } from './componentes/Icono.jsx';
import { lsGet, precargar, recargar, useAgente, useClase, useDatos, useEventos, useTemario } from './datos.js';
import { DIAS, MESES, cap, hoy } from './fechas.js';
import { TABS, useUI } from './ui.jsx';
import Compras from './vistas/Compras.jsx';
import Horario from './vistas/Horario.jsx';
import Tareas from './vistas/Tareas.jsx';

const cargarMapa = () => import('./vistas/Mapa.jsx');
const cargarClase = () => import('./vistas/Clase.jsx');
const Mapa = lazy(cargarMapa);
const Clase = lazy(cargarClase);
const cargarAgente = () => import('./vistas/Agente.jsx');
const Agente = lazy(cargarAgente);

const CONSULTAS_DE = {
  compras: ['datos'], tareas: ['datos'], mapa: ['datos', 'rutas'], horario: ['eventos', 'datos', 'calendarios'], clase: ['clase', 'datos', 'eventos', 'temario'], agente: ['agente'],
};
const TEXTO_NUEVO = { compras: 'Añadir producto', tareas: 'Añadir tarea', mapa: 'Añadir parada', horario: 'Añadir evento' };

function useSubtitulo(tab, modoMapa) {
  const datos = useDatos().data;
  const clase = useClase().data;
  const eventos = useEventos().data;
  if (tab === 'agente') return 'Pídele lo que necesites';
  if (tab === 'horario') { const d = new Date(); return `${cap(DIAS[d.getDay()])}, ${d.getDate()} de ${MESES[d.getMonth()]}`; }
  if (tab === 'mapa') return modoMapa === 'rutas' ? 'Cómo llegar en bus, a pie o en coche' : 'Recados y tiendas donde te falta algo';
  if (tab === 'clase') {
    const c = claseTotal({ hecho: clase?.hecho, tareas: datos?.tareas, eventos });
    return clase ? `${c.hechos} de ${c.total} completados` : 'Cargando tu progreso…';
  }
  if (!datos) return 'Cargando…';
  if (tab === 'compras') {
    const falta = datos.compras.filter(p => p.stock === 'Falta');
    if (!falta.length) return 'Todo en casa';
    const tiendas = new Set(falta.map(p => p.tienda).filter(Boolean)).size;
    return `${falta.length} por comprar${tiendas > 1 ? ` en ${tiendas} tiendas` : ''}`;
  }
  const pendientes = datos.tareas.filter(t => !t.completada);
  if (!pendientes.length) return 'Nada pendiente';
  const vencidas = pendientes.filter(t => t.fecha && t.fecha.slice(0, 10) < hoy()).length;
  return `${pendientes.length} pendientes${vencidas ? `, ${vencidas} vencidas` : ''}`;
}

function RedDeSecciones() {
  const { tab, irA } = useUI();
  const datos = useDatos().data;
  const clase = useClase().data;
  const temario = useTemario().data;
  const eventos = useEventos().data;
  const agente = useAgente().data;
  const vistaHasta = lsGet('novedadesVistasHasta');
  const novNoVistas = novedadesNoVistas(temario?.novedades || [], vistaHasta, 7).length;
  const urgentes = clase ? entregasUrgentes({ hecho: clase.hecho, tareas: datos?.tareas, eventos }, hoy()) : 0;
  const insignias = {
    agente: agente?.pendientes.length,
    compras: datos?.compras.filter(p => p.stock === 'Falta').length,
    tareas: datos?.tareas.filter(t => !t.completada && t.fecha && t.fecha.slice(0, 10) <= hoy()).length,
    clase: urgentes + novNoVistas,
  };
  return (
    <nav className="red" aria-label="Secciones">
      <div className="marca">Life OS</div>
      <ol>
        {TABS.map(t => (
          <li key={t.id} style={{ '--propia': `var(--l-${t.id})` }}>
            <button type="button" className={t.id === tab ? 'on' : ''} aria-current={t.id === tab ? 'page' : undefined} onClick={() => irA(t.id)}>
              <span className="nudo-red">
                <i />
                {t.id === tab && <motion.span layoutId="nudo-activo" className="nudo-activo" transition={MUELLE}><Icono n={t.icon} s={20} /></motion.span>}
                {insignias[t.id] > 0 && <span className="insignia"><Contador n={insignias[t.id]} /></span>}
              </span>
              <span className="rotulo">{t.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="salir" onClick={cerrarSesion}><Icono n="logout" s={20} /> Cerrar sesión</button>
    </nav>
  );
}

function Cabecera() {
  const { tab, modoMapa } = useUI();
  const subtitulo = useSubtitulo(tab, modoMapa);
  const claves = CONSULTAS_DE[tab];
  const cargando = useIsFetching({ predicate: q => claves.includes(q.queryKey[0]) }) > 0;
  const titulo = TABS.find(t => t.id === tab).label;
  return (
    <header className="cabecera">
      <div>
        <h1>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={titulo} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '-100%' }} transition={MUELLE}>{titulo}</motion.span>
          </AnimatePresence>
        </h1>
        <p>{subtitulo}</p>
      </div>
      <button type="button" className={`boton-icono ${cargando ? 'girando' : ''}`} aria-label="Actualizar" aria-busy={cargando}
        onClick={() => { if (!hayEscrituras()) recargar(claves); }}>
        <Icono n="refresh" s={20} />
      </button>
    </header>
  );
}

function BotonNuevo() {
  const { tab, modoMapa, abrirHoja } = useUI();
  const hayDatos = !!useDatos().data;
  const visible = tab !== 'clase' && tab !== 'agente' && !(tab === 'mapa' && modoMapa === 'rutas');
  const nuevo = () => {
    if (!hayDatos) return;
    if (tab === 'compras') abrirHoja(<FormProducto />);
    if (tab === 'tareas') abrirHoja(<FormTarea />);
    if (tab === 'horario') abrirHoja(<FormEvento />);
    if (tab === 'mapa') abrirHoja(modoMapa === 'rutas' ? <FormRuta /> : <FormTarea titulo="Nueva parada" desdeMapa />);
  };
  useEffect(() => {
    // Atajo de escritorio: "n" crea un elemento nuevo en la sección actual.
    const alTeclear = e => {
      if (e.key !== 'n' || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      if (document.querySelector('[role=dialog]') || tab === 'clase' || tab === 'agente') return;
      e.preventDefault();
      nuevo();
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  });
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.button key="nuevo" type="button" className={`nuevo ${tab === 'mapa' ? 'sobre-mapa' : ''}`} aria-label={TEXTO_NUEVO[tab]} disabled={!hayDatos} onClick={nuevo}
          initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} whileTap={{ scale: 0.9 }} transition={MUELLE}>
          <Icono n="plus" s={26} /><span>{TEXTO_NUEVO[tab]}</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function Aviso() {
  const { mensaje, cerrarAviso } = useUI();
  const duracion = mensaje?.deshacer ? 5000 : 3500;
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(cerrarAviso, duracion);
    return () => clearTimeout(t);
  }, [mensaje, duracion, cerrarAviso]);
  return (
    <div className="zona-aviso" role="status">
      <AnimatePresence mode="popLayout">
        {mensaje && (
          <motion.div key={mensaje.id} className="aviso" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={MUELLE}>
            <span>{mensaje.texto}</span>
            {mensaje.deshacer && (
              <button type="button" onClick={() => { cerrarAviso(); mensaje.deshacer(); }}>Deshacer</button>
            )}
            {mensaje.deshacer && <i style={{ animationDuration: `${duracion}ms` }} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Las secciones visitadas siguen montadas: conservan su scroll y el mapa no se reconstruye. */
function Vista({ id, indice, activa, anterior, children }) {
  const nodo = useRef(null);
  useLayoutEffect(() => {
    if (!activa || anterior.current === id || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const desde = anterior.current != null && TABS.findIndex(t => t.id === anterior.current) > indice ? -18 : 18;
    nodo.current.animate(
      [{ opacity: 0, transform: `translateX(${desde}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }, [activa]);
  return <section ref={nodo} className={`vista vista-${id}`} hidden={!activa}>{children}</section>;
}

export default function App() {
  const { tab, hoja, cerrarHoja } = useUI();
  const [visitadas, setVisitadas] = useState(() => new Set([tab]));
  const anterior = useRef(tab);

  useEffect(() => {
    setVisitadas(v => (v.has(tab) ? v : new Set(v).add(tab)));
    anterior.current = tab;
  }, [tab]);

  useEffect(() => {
    const preparar = () => { precargar(); cargarMapa(); cargarClase(); cargarAgente(); };
    if ('requestIdleCallback' in window) { const id = requestIdleCallback(preparar, { timeout: 3000 }); return () => cancelIdleCallback(id); }
    const t = setTimeout(preparar, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const alTeclear = e => { if (e.key === 'Escape') cerrarHoja(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [cerrarHoja]);

  const vistaDe = id => {
    if (id === 'compras') return <Compras />;
    if (id === 'tareas') return <Tareas />;
    if (id === 'horario') return <Horario />;
    if (id === 'mapa') return <Mapa activa={tab === 'mapa'} />;
    if (id === 'agente') return <Agente activa={tab === 'agente'} />;
    return <Clase />;
  };

  return (
    <div className="raiz" data-tab={tab}>
      <div className="app" inert={!!hoja}>
        <RedDeSecciones />
        <Cabecera />
        <main className={tab === 'mapa' ? 'lleno' : ''}>
          {TABS.filter(t => visitadas.has(t.id)).map(t => (
            <Vista key={t.id} id={t.id} indice={TABS.indexOf(t)} activa={t.id === tab} anterior={anterior}>
              <Suspense fallback={<Esqueleto />}>{vistaDe(t.id)}</Suspense>
            </Vista>
          ))}
        </main>
        <BotonNuevo />
      </div>
      <AnimatePresence>{hoja && <motion.div key={hoja.id} exit={{ opacity: 1 }} transition={{ duration: 0.25 }}>{hoja.elemento}</motion.div>}</AnimatePresence>
      <Aviso />
    </div>
  );
}
