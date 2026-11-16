import { useEffect, useRef } from 'react';
import { useIsRestoring } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Dato, Esqueleto, Fallo, FilaTarea, MUELLE, Segmentado, SinActualizar, Vacio } from '../componentes/comun.jsx';
import { VerEvento } from '../componentes/formularios.jsx';
import { Icono } from '../componentes/Icono.jsx';
import { cubrirEventos, esTemporal, useCalendarios, useDatos, useEventos } from '../datos.js';
import { DIAS, aFecha, diasDesde, hoy, inicioSemana, nombreDia, sumarDias } from '../fechas.js';
import { VISTAS_CAL, useUI } from '../ui.jsx';
import { Mes, Rejilla, moverDia, rangoVisible, tituloCal } from './Calendario.jsx';
import { ordenTareas } from './Tareas.jsx';

const DIAS_VISIBLES = 14;

function Dias({ eventos, tareas }) {
  const { dia, setDia } = useUI();
  const h = hoy();
  const inicio = dia >= h && dia <= sumarDias(h, DIAS_VISIBLES - 1) ? h : dia;
  const conAlgo = new Set((eventos ?? []).map(e => e.inicio.slice(0, 10)));
  (tareas ?? []).forEach(t => { if (!t.completada && t.fecha) conAlgo.add(t.fecha.slice(0, 10)); });
  return (
    <div className="dias">
      {Array.from({ length: DIAS_VISIBLES }, (_, i) => {
        const iso = sumarDias(inicio, i), d = aFecha(iso);
        return (
          <button key={iso} type="button" className={`dia ${iso === dia ? 'on' : ''}`} aria-pressed={iso === dia} onClick={() => setDia(iso)}>
            {iso === dia && <motion.span layoutId="dia-activo" className="dia-fondo" transition={MUELLE} />}
            <span className="dia-sem">{DIAS[d.getDay()].slice(0, 3)}</span>
            <span className="dia-num">{d.getDate()}</span>
            <i className={conAlgo.has(iso) ? 'hay' : ''} />
          </button>
        );
      })}
    </div>
  );
}

function FilaEvento({ e, varios }) {
  const { abrirHoja } = useUI();
  const ahora = new Date();
  const enCurso = aFecha(e.inicio) <= ahora && ahora < aFecha(e.fin);
  return (
    <button type="button" className={`evento ${enCurso ? 'ahora' : ''} ${esTemporal(e.id) ? 'pendiente' : ''}`} onClick={() => abrirHoja(<VerEvento evento={e} />)}>
      <span className="ev-hora"><b>{e.inicio.slice(11, 16)}</b><span>{e.fin.slice(11, 16)}</span></span>
      <span className="ev-nudo" style={e.color ? { '--ev': e.color } : undefined}><i /></span>
      <span className="ev-cuerpo">
        <span className="fila-titulo">{e.titulo}</span>
        <span className="fila-datos">
          {enCurso && <span className="ev-ahora">Ahora</span>}
          {e.lugar && <Dato icono="pin">{e.lugar}</Dato>}
          {e.calendario && varios && <span>{e.calendario}</span>}
        </span>
      </span>
    </button>
  );
}

function Eventos({ dia, eventos, varios }) {
  const { abrirHoja } = useUI();
  const delDia = eventos.filter(e => (e.diaCompleto ? e.inicio.slice(0, 10) <= dia && e.fin.slice(0, 10) > dia : e.inicio.slice(0, 10) === dia));
  const todoElDia = delDia.filter(e => e.diaCompleto);
  const conHora = delDia.filter(e => !e.diaCompleto).sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  return (
    <>
      {todoElDia.length > 0 && (
        <div className="todo-el-dia">
          {todoElDia.map(e => (
            <button key={e.id} type="button" style={e.color ? { '--ev': e.color } : undefined} onClick={() => abrirHoja(<VerEvento evento={e} />)}>{e.titulo}</button>
          ))}
        </div>
      )}
      {conHora.length > 0 && <div className="eventos">{conHora.map(e => <FilaEvento key={e.id} e={e} varios={varios} />)}</div>}
    </>
  );
}

function Lista({ eventos, datos, calendarios }) {
  const { dia } = useUI();
  const delDia = (eventos.data ?? []).some(e => (e.diaCompleto ? e.inicio.slice(0, 10) <= dia && e.fin.slice(0, 10) > dia : e.inicio.slice(0, 10) === dia));
  const tareasDia = (datos.data?.tareas ?? []).filter(t => !t.completada && t.fecha?.slice(0, 10) === dia).sort(ordenTareas);
  const todoCargado = eventos.data && datos.data;
  const [y, m, d] = dia.split('-');

  return (
    <>
      <Dias eventos={eventos.data} tareas={datos.data?.tareas} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={dia} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.14 }}>
          <h2 className="dia-titulo">{nombreDia(dia, true)}</h2>
          {eventos.isPending && <Esqueleto filas={2} />}
          {eventos.isError && !eventos.data && <Fallo que="el calendario" consulta={eventos} />}
          {eventos.data && <Eventos dia={dia} eventos={eventos.data} varios={(calendarios.data?.length ?? 0) > 1} />}
          {datos.isPending && <Esqueleto filas={1} />}
          {tareasDia.length > 0 && (
            <section className="grupo">
              <header className="grupo-cabeza"><h2>Tareas que vencen este día</h2></header>
              <div className="ramal"><AnimatePresence initial={false}>{tareasDia.map(t => <FilaTarea key={t.id} t={t} />)}</AnimatePresence></div>
            </section>
          )}
          {todoCargado && !delDia && !tareasDia.length && <Vacio titulo="Día libre">No hay nada en el calendario. Reserva un hueco con el botón +.</Vacio>}
          <a className="enlace" href={`https://calendar.google.com/calendar/r/day/${y}/${+m}/${+d}`} target="_blank" rel="noopener"><Icono n="ext" s={16} /> Abrir en Google Calendar</a>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function Barra() {
  const { dia, setDia, vistaCal, setVistaCal } = useUI();
  return (
    <div className="cal-bar">
      <div className="cal-nav">
        <button type="button" className="cal-hoy" onClick={() => setDia(hoy())}>Hoy</button>
        <button type="button" className="boton-icono" aria-label="Anterior" onClick={() => setDia(moverDia(vistaCal, dia, -1))}><Icono n="back" s={20} /></button>
        <button type="button" className="boton-icono" aria-label="Siguiente" onClick={() => setDia(moverDia(vistaCal, dia, 1))}><Icono n="next" s={20} /></button>
        <h2 className="cal-tit">{tituloCal(vistaCal, dia)}</h2>
      </div>
      <div className="cal-vistas"><Segmentado id="cal" valor={vistaCal} opciones={VISTAS_CAL} onCambio={setVistaCal} /></div>
    </div>
  );
}

export default function Horario() {
  const { tab, dia, setDia, vistaCal } = useUI();
  const eventos = useEventos();
  const datos = useDatos();
  const calendarios = useCalendarios();
  const restaurando = useIsRestoring();
  const scrollRejilla = useRef(null);
  const toque = useRef(null);
  const [ini, fin] = rangoVisible(vistaCal, dia);

  useEffect(() => {
    if (tab === 'horario' && !restaurando) cubrirEventos(ini, fin);
  }, [tab, restaurando, ini, fin, eventos.dataUpdatedAt]);

  // Deslizar en horizontal cambia de mes, semana o día.
  const gestos = {
    onTouchStart: ev => {
      toque.current = ev.touches.length === 1 && !ev.target.closest('.dias') ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY } : null;
    },
    onTouchEnd: ev => {
      if (!toque.current) return;
      const dx = ev.changedTouches[0].clientX - toque.current.x, dy = ev.changedTouches[0].clientY - toque.current.y;
      toque.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) setDia(moverDia(vistaCal, dia, dx < 0 ? 1 : -1));
    },
  };

  if (vistaCal === 'lista') {
    return (
      <div {...gestos}>
        <Barra />
        <SinActualizar que="Calendario" consulta={eventos} />
        <Lista eventos={eventos} datos={datos} calendarios={calendarios} />
      </div>
    );
  }

  const lista = eventos.data ?? [], tareas = datos.data?.tareas ?? [];
  return (
    <div className="cal-lleno" {...gestos}>
      <Barra />
      <SinActualizar que="Calendario" consulta={eventos} />
      {eventos.isError && !eventos.data && <Fallo que="el calendario" consulta={eventos} />}
      {vistaCal === 'mes'
        ? <Mes eventos={lista} tareas={tareas} />
        : <Rejilla eventos={lista} tareas={tareas} dias={vistaCal === 'dia' ? [dia] : diasDesde(inicioSemana(dia), 7)} scroll={scrollRejilla} />}
    </div>
  );
}
