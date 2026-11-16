import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import './clase.css';
import {
  CLASE, claseTotal, conMaterial, cuentaModulo, cuentaUnidad, esActividad, eventoDeItem, hechoItem, idItem, recorrerClase, tareaDeItem, tituloClase,
} from '../clase.mjs';
import { Estacion, Fallo, MUELLE } from '../componentes/comun.jsx';
import { FormEvento, FormTarea, VerEvento } from '../componentes/formularios.jsx';
import { Icono } from '../componentes/Icono.jsx';
import { marcarClase, marcarTarea, esTemporal, useClase, useDatos, useEventos } from '../datos.js';
import { aFecha, diasHasta, fechaCorta, textoDias } from '../fechas.js';
import { useUI } from '../ui.jsx';

const PLIEGUE = { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] };

function Barra({ valor, total, className }) {
  return (
    <div className={className} aria-hidden="true">
      <motion.i initial={false} animate={{ width: `${total ? (valor / total) * 100 : 0}%` }} transition={PLIEGUE} />
    </div>
  );
}

function Pieza({ ctx, m, u, it }) {
  const { abrirHoja, aviso } = useUI();
  const id = idItem(m, u, it);
  const hecho = hechoItem(ctx, m, u, it);
  const tarea = tareaDeItem(ctx.tareas, m, it);
  const evento = eventoDeItem(ctx.eventos, m, it);
  const marcar = () => {
    const nuevo = !hecho;
    marcarClase([id], nuevo).catch(e => aviso(`No se pudo guardar en la hoja: ${e.message}`));
    if (tarea && !esTemporal(tarea.id) && tarea.completada !== nuevo) marcarTarea(tarea.id, nuevo).catch(e => aviso(`No se pudo actualizar: ${e.message}`));
  };
  const aTareas = () => abrirHoja(<FormTarea tarea={tarea ? { ...tarea } : { titulo: tituloClase(m, it), prioridad: 'Alta', fecha: it.fecha, completada: hecho }} />);
  const aHorario = () => {
    if (evento) return abrirHoja(<VerEvento evento={evento} />);
    // Una entrega a las 23:59 no deja hueco de una hora: el evento acaba justo al vencer.
    const hora = it.fecha.slice(11, 16);
    abrirHoja(<FormEvento titulo={tituloClase(m, it)} fecha={it.fecha.slice(0, 10)} hora={hora === '23:59' ? '23:00' : hora} />);
  };
  const conEnlaces = it.fecha && (aFecha(it.fecha) >= new Date() || tarea || evento);
  return (
    <div className={`pieza ${hecho ? 'hecha' : ''}`}>
      <Estacion on={hecho} onClick={marcar} etiqueta={`${hecho ? 'Desmarcar' : 'Marcar como hecho'}: ${it.n}`} />
      <div className="pieza-cuerpo">
        <span className="pieza-nombre"><span className="pieza-tipo">{it.tipo}</span>{it.n}</span>
        {it.fecha && <span className="pieza-nota">{fechaCorta(it.fecha)}{Math.abs(diasHasta(it.fecha)) > 1 && ` (${textoDias(diasHasta(it.fecha))})`}</span>}
        {it.nota && <span className={`pieza-nota ${it.alerta ? 'alerta' : ''}`}>{it.nota}</span>}
        {conEnlaces && (
          <div className="pieza-enlaces">
            <button type="button" className={tarea ? 'on' : ''} onClick={aTareas}><Icono n={tarea ? 'check' : 'tasks'} s={14} />{tarea ? 'En Tareas' : 'Añadir a Tareas'}</button>
            <button type="button" className={evento ? 'on' : ''} onClick={aHorario}><Icono n={evento ? 'check' : 'cal'} s={14} />{evento ? 'En Horario' : 'Añadir al Horario'}</button>
          </div>
        )}
      </div>
      {it.url && <a className="pieza-abrir" href={it.url} target="_blank" rel="noopener">Abrir</a>}
    </div>
  );
}

function GrupoPiezas({ ctx, m, u, titulo, items, ocultar, destacado }) {
  const visibles = items.filter(it => !(ocultar && hechoItem(ctx, m, u, it)));
  if (!visibles.length) return null;
  return (
    <div className={`piezas ${destacado ? 'destacado' : ''}`}>
      <h4>{titulo}</h4>
      {visibles.map(it => <Pieza key={it.n} ctx={ctx} m={m} u={u} it={it} />)}
    </div>
  );
}

function PanelUnidad({ ctx, m, u, ocultar, irUnidad }) {
  const c = cuentaUnidad(ctx, m, u);
  const i = m.unidades.indexOf(u), anterior = m.unidades[i - 1], siguiente = m.unidades[i + 1];
  const ubicacion = [u.k, u.tri?.replace('T', 'trimestre '), u.h ? `${u.h} h` : ''].filter(Boolean).join(', ');
  const actividades = u.items.filter(esActividad), material = u.items.filter(x => !esActividad(x));
  const nadaVisible = ocultar && u.items.length > 0 && u.items.every(it => hechoItem(ctx, m, u, it));
  return (
    <motion.div className="unidad-pliegue" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0, transition: { duration: 0 } }} transition={PLIEGUE}>
      <div className={`unidad-panel ${i === 0 ? 'p-ini' : ''} ${siguiente ? '' : 'p-fin'}`}>
        <div className="unidad-cabeza">
          <div><span>{ubicacion}</span>{c.total > 0 && <span>{c.hechos} de {c.total} completados</span>}</div>
          <h3>{u.t}</h3>
        </div>
        {u.sum && <p>{u.sum}</p>}
        {!conMaterial(u) && <p>Todavía no hay material publicado en esta unidad.</p>}
        {conMaterial(u) && nadaVisible && <p>Todo completado en esta unidad.</p>}
        <GrupoPiezas ctx={ctx} m={m} u={u} titulo="Entregas y pruebas" items={actividades} ocultar={ocultar} destacado />
        <GrupoPiezas ctx={ctx} m={m} u={u} titulo="Material" items={material} ocultar={ocultar} />
        <div className="unidad-nav">
          {anterior && <button type="button" onClick={() => irUnidad(m, anterior)}><Icono n="back" s={14} />{anterior.t}</button>}
          {siguiente && <button type="button" className="sig" onClick={() => irUnidad(m, siguiente)}>{siguiente.t}<Icono n="next" s={14} /></button>}
        </div>
      </div>
    </motion.div>
  );
}

function ParadaUnidad({ ctx, m, u, i, abierta, alPulsar, ...panel }) {
  const c = cuentaUnidad(ctx, m, u);
  const llena = c.total > 0 && c.hechos === c.total;
  const pct = c.total ? (c.hechos / c.total) * 100 : 0;
  const vacia = !conMaterial(u);
  const resumen = [u.tri, u.h ? `${u.h} h` : '', vacia ? 'Sin material' : `${c.hechos} de ${c.total}`].filter(Boolean).join(', ');
  return (
    <>
      <button type="button" data-unidad={`${m.id}|${u.k}`} style={{ '--i': i + 1 }} aria-expanded={abierta} onClick={() => alPulsar(m, u)}
        className={`parada-unidad ${vacia ? 'vacia' : ''} ${llena ? 'llena' : ''} ${i === 0 ? 'primera' : ''} ${i === m.unidades.length - 1 ? 'ultima' : ''}`}>
        <span className="pu-nudo" style={!llena && pct ? { background: `linear-gradient(90deg, var(--cl) ${pct}%, var(--superficie) ${pct}%)` } : undefined}>
          {llena && <Icono n="check" s={12} />}
        </span>
        <span className="pu-codigo">{u.k}</span>
        <span className="pu-nombre">{u.t}</span>
        <span className="pu-info">{resumen}</span>
        {m.ahora === u.k && <span className="pu-ahora">En clase ahora</span>}
        <motion.span className="pu-flecha" aria-hidden="true" initial={false} animate={{ rotate: abierta ? 90 : 0 }} transition={MUELLE}><Icono n="next" s={18} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {abierta && <PanelUnidad key={u.k} ctx={ctx} m={m} u={u} {...panel} />}
      </AnimatePresence>
    </>
  );
}

function fechasPendientes(ctx) {
  const ahora = new Date(), filas = [];
  recorrerClase((m, u, it) => {
    if (!it.fecha || hechoItem(ctx, m, u, it)) return;
    const pasada = aFecha(it.fecha) < ahora;
    if (pasada && it.tipo === 'Prueba') return;
    filas.push({ m, u, it, pasada });
  });
  return filas.sort((a, b) => a.it.fecha.localeCompare(b.it.fecha));
}

function buscarEnCurso(q) {
  const b = q.trim().toLowerCase();
  if (b.length < 2) return [];
  const res = [];
  CLASE.forEach(m => m.unidades.forEach(u => {
    if (`${u.t} ${u.sum || ''}`.toLowerCase().includes(b)) res.push({ m, u, texto: `${u.k} ${u.t}` });
    u.items.forEach(it => { if (it.n.toLowerCase().includes(b)) res.push({ m, u, texto: it.n }); });
  }));
  return res.slice(0, 12);
}

export default function Clase() {
  const { aviso } = useUI();
  const claseQ = useClase();
  const datos = useDatos();
  const eventos = useEventos();
  const [abiertas, setAbiertas] = useState({});
  const [ocultar, setOcultar] = useState(false);
  const [q, setQ] = useState('');
  const [armado, setArmado] = useState(false);
  const [seccion, setSeccion] = useState('cl-fechas');
  const raiz = useRef(null);
  const nav = useRef(null);
  const anclaje = useRef(null);

  const ctx = { hecho: claseQ.data?.hecho, tareas: datos.data?.tareas, eventos: eventos.data };
  const unidadAbierta = m => (abiertas[m.id] === undefined ? m.ahora : abiertas[m.id]);
  const contenedor = () => raiz.current?.closest('.vista');
  const buscarParada = clave => raiz.current?.querySelector(`[data-unidad="${CSS.escape(clave)}"]`);

  const irA = el => {
    const c = contenedor();
    if (el && c) c.scrollTo({ top: c.scrollTop + el.getBoundingClientRect().top - c.getBoundingClientRect().top - nav.current.offsetHeight - 8, behavior: 'smooth' });
  };

  // Al abrir una unidad se cierra otra de encima: la parada pulsada no debe moverse bajo el dedo.
  const alternar = (m, u) => {
    const clave = `${m.id}|${u.k}`;
    anclaje.current = { clave, arriba: buscarParada(clave).getBoundingClientRect().top };
    setAbiertas(a => ({ ...a, [m.id]: unidadAbierta(m) === u.k ? '' : u.k }));
  };
  useLayoutEffect(() => {
    if (!anclaje.current) return;
    const { clave, arriba } = anclaje.current;
    anclaje.current = null;
    const el = buscarParada(clave);
    if (el) contenedor().scrollTop += el.getBoundingClientRect().top - arriba;
  }, [abiertas]);

  const pendienteDeIr = useRef(null);
  const irUnidad = (m, u) => {
    pendienteDeIr.current = `${m.id}|${u.k}`;
    setAbiertas(a => ({ ...a, [m.id]: u.k }));
  };
  useEffect(() => {
    if (!pendienteDeIr.current) return;
    irA(buscarParada(pendienteDeIr.current));
    pendienteDeIr.current = null;
  });

  useEffect(() => {
    const c = contenedor();
    const alDesplazar = () => {
      const limite = c.getBoundingClientRect().top + nav.current.offsetHeight + 24;
      let actual = 'cl-fechas';
      raiz.current.querySelectorAll('[data-seccion]').forEach(s => { if (s.getBoundingClientRect().top <= limite) actual = s.id; });
      setSeccion(actual);
    };
    c.addEventListener('scroll', alDesplazar, { passive: true });
    return () => c.removeEventListener('scroll', alDesplazar);
  }, []);

  useEffect(() => {
    nav.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [seccion]);

  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 5000);
    return () => clearTimeout(t);
  }, [armado]);

  const borrarProgreso = () => {
    if (!armado) return setArmado(true);
    setArmado(false);
    marcarClase(Object.keys(ctx.hecho || {}), false).then(() => aviso('Progreso de Clase borrado'), e => aviso(`No se pudo guardar en la hoja: ${e.message}`));
  };

  const total = claseTotal(ctx);
  const resultados = buscarEnCurso(q);
  const fechas = fechasPendientes(ctx);

  return (
    <div ref={raiz}>
      <div className="cl-intro">
        <Barra className="cl-barra" valor={total.hechos} total={total.total} />
        {claseQ.isError && !claseQ.data && <Fallo que="tu progreso" consulta={claseQ} />}
        <div className="cl-herramientas">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Busca un tema o archivo: Tkinter, JSON, slicing…" aria-label="Buscar en el curso" />
          <button type="button" className={`cl-ocultar ${ocultar ? 'on' : ''}`} aria-pressed={ocultar} onClick={() => setOcultar(v => !v)}>
            <span className="marca-ocultar"><Icono n="check" s={14} /></span>Ocultar lo completado
          </button>
        </div>
        {q.trim().length >= 2 && (
          <div className="cl-resultados">
            {!resultados.length && <p>Nada coincide con esa búsqueda.</p>}
            {resultados.map((r, i) => (
              <button key={i} type="button" onClick={() => irUnidad(r.m, r.u)}>{r.texto} <small>{r.m.corto}, {r.u.k}</small></button>
            ))}
          </div>
        )}
      </div>

      <nav ref={nav} className="cl-nav" aria-label="Secciones de Clase">
        <button type="button" className={seccion === 'cl-fechas' ? 'on' : ''} onClick={() => irA(raiz.current.querySelector('#cl-fechas'))}>Fechas</button>
        {CLASE.map(m => (
          <button key={m.id} type="button" style={{ '--cl': m.color }} className={seccion === `cl-${m.id}` ? 'on' : ''} onClick={() => irA(raiz.current.querySelector(`#cl-${m.id}`))}>
            <i />{m.corto}
          </button>
        ))}
      </nav>

      <section className="cl-fechas" id="cl-fechas" data-seccion>
        <header className="grupo-cabeza"><h2>Próximas fechas</h2></header>
        {!fechas.length && <p className="fila-datos">No queda ninguna fecha pendiente.</p>}
        {fechas.map(({ m, u, it, pasada }) => {
          const n = diasHasta(it.fecha);
          return (
            <button key={`${m.id}${it.n}`} type="button" className="cl-fecha" style={{ '--cl': m.color }} onClick={() => irUnidad(m, u)}>
              <span className="cuando">{fechaCorta(it.fecha)}</span>
              <span className={`prioridad ${pasada ? 'p-Alta' : n <= 2 ? 'p-Media' : 'p-Baja'}`}>{pasada ? 'vencida, ' : ''}{textoDias(n)}</span>
              <b>{it.n}</b>
              <small>{it.tipo} de {m.nombre}</small>
            </button>
          );
        })}
      </section>

      {CLASE.map(m => {
        const c = cuentaModulo(ctx, m);
        return (
          <section key={m.id} className="cl-modulo" id={`cl-${m.id}`} data-seccion style={{ '--cl': m.color }}>
            <div className="cl-cabeza">
              <div className="cl-cabeza-fila"><h2>{m.nombre}</h2><span>{c.hechos} de {c.total}</span></div>
              <p>{m.meta}</p>
              <Barra className="cl-mbarra" valor={c.hechos} total={c.total} />
              <a href={m.aula.url} target="_blank" rel="noopener">{m.aula.texto} <Icono n="ext" s={14} /></a>
            </div>
            <div className="cl-linea" style={{ '--n': m.unidades.length }}>
              {m.unidades.map((u, i) => (
                <ParadaUnidad key={u.k} ctx={ctx} m={m} u={u} i={i} abierta={unidadAbierta(m) === u.k} alPulsar={alternar} ocultar={ocultar} irUnidad={irUnidad} />
              ))}
            </div>
          </section>
        );
      })}

      <div className="cl-pie">
        <span>
          {claseQ.data?.modo === 'hoja' && 'Progreso guardado en tu hoja de Google, en la pestaña Clase.'}
          {claseQ.data?.modo === 'local' && 'Progreso guardado solo en este dispositivo. Actualiza Apps Script para sincronizarlo con la hoja.'}
          {!claseQ.data && 'Comprobando el progreso guardado en tu hoja…'}
        </span>
        <button type="button" onClick={borrarProgreso} disabled={!claseQ.data}>{armado ? 'Pulsa otra vez para borrarlo todo' : 'Borrar mi progreso'}</button>
      </div>
    </div>
  );
}
