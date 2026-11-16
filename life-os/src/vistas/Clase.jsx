import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import './clase.css';
import {
  CLASE, CURSOS, calcularMediaModulo, claseTotal, conMaterial, cuentaModulo, cuentaUnidad, cursoDeModulo, esActividad, eventoDeItem, filtrarModulosPorCurso, hechoItem, idItem, novedadesNoVistas, novedadesRecientes, recorrerClase, tareaDeItem, tituloClase,
} from '../clase.mjs';
import { Estacion, Fallo, MUELLE } from '../componentes/comun.jsx';
import { FormEvento, FormTarea, VerEvento } from '../componentes/formularios.jsx';
import { Icono } from '../componentes/Icono.jsx';
import { marcarClase, marcarTarea, esTemporal, refrescarTemario, useClase, useDatos, useEventos, useTemario, lsGet, lsSet } from '../datos.js';
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
  const id = it.ext_id || idItem(m, u, it);
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
        {it.resumen_ia && <span className="pieza-nota">{it.resumen_ia}</span>}
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
  const visibles = items.filter(it => !it.archivado && !(ocultar && hechoItem(ctx, m, u, it)));
  if (!visibles.length) return null;
  return (
    <div className={`piezas ${destacado ? 'destacado' : ''}`}>
      <h4>{titulo}</h4>
      {visibles.map(it => <Pieza key={it.ext_id || it.n} ctx={ctx} m={m} u={u} it={it} />)}
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
  const pendientesActividades = (u.items || []).filter(it => esActividad(it) && !hechoItem(ctx, m, u, it)).length;
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
        {pendientesActividades > 0 && (
          <span className="pu-actividades">
            {pendientesActividades} {pendientesActividades === 1 ? 'tarea/prueba' : 'tareas/pruebas'}
          </span>
        )}
        {m.ahora === u.k && <span className="pu-ahora">En clase ahora</span>}
        <motion.span className="pu-flecha" aria-hidden="true" initial={false} animate={{ rotate: abierta ? 90 : 0 }} transition={MUELLE}><Icono n="next" s={18} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {abierta && <PanelUnidad key={u.k} ctx={ctx} m={m} u={u} {...panel} />}
      </AnimatePresence>
    </>
  );
}

function fechasPendientes(ctx, modulos = CLASE) {
  const ahora = new Date(), filas = [];
  recorrerClase((m, u, it) => {
    if (it.archivado || !it.fecha || hechoItem(ctx, m, u, it)) return;
    const pasada = aFecha(it.fecha) < ahora;
    if (pasada && it.tipo === 'Prueba') return;
    filas.push({ m, u, it, pasada });
  }, modulos);
  return filas.sort((a, b) => a.it.fecha.localeCompare(b.it.fecha));
}

function buscarEnCurso(q, modulos = CLASE) {
  const b = q.trim().toLowerCase();
  if (b.length < 2) return [];
  const res = [];
  modulos.forEach(m => m.unidades.forEach(u => {
    if (`${u.t} ${u.sum || ''}`.toLowerCase().includes(b)) res.push({ m, u, texto: `${u.k} ${u.t}` });
    u.items.forEach(it => { if (!it.archivado && it.n.toLowerCase().includes(b)) res.push({ m, u, texto: it.n }); });
  }));
  return res.slice(0, 12);
}

export default function Clase() {
  const { aviso } = useUI();
  const claseQ = useClase();
  const temarioQ = useTemario();
  const datos = useDatos();
  const eventos = useEventos();
  const [subvista, setSubvista] = useState(() => {
    try {
      const s = localStorage.getItem('lifeos_clase_subvista');
      if (s && ['temario', 'novedades', 'fechas'].includes(s)) return s;
    } catch {}
    return 'temario';
  });
  const [actualizando, setActualizando] = useState(false);

  const cambiarSubvista = nueva => {
    setSubvista(nueva);
    try { localStorage.setItem('lifeos_clase_subvista', nueva); } catch {}
    if (nueva === 'novedades') {
      try { localStorage.setItem('lifeos:novedadesVistasHasta', new Date().toISOString()); } catch {}
    }
  };

  const [cursoActivo, setCursoActivo] = useState(() => {
    try {
      const g = localStorage.getItem('lifeos_clase_curso');
      if (g && ['python', 'ciber', 'todos'].includes(g)) return g;
    } catch {}
    return 'python';
  });
  const [mostrarPasadas, setMostrarPasadas] = useState(false);
  const [abiertas, setAbiertas] = useState({});
  const [ocultar, setOcultar] = useState(false);
  const [q, setQ] = useState('');
  const [armado, setArmado] = useState(false);
  const [seccion, setSeccion] = useState('cl-fechas');
  const raiz = useRef(null);
  const nav = useRef(null);
  const anclaje = useRef(null);

  const cambiarCurso = nuevo => {
    setCursoActivo(nuevo);
    try { localStorage.setItem('lifeos_clase_curso', nuevo); } catch {}
  };

  const todosModulos = temarioQ.data?.modulos?.length ? temarioQ.data.modulos : CLASE;
  const modulos = filtrarModulosPorCurso(todosModulos, cursoActivo);
  const nPython = todosModulos.filter(m => cursoDeModulo(m) === 'python').length;
  const nCiber = todosModulos.filter(m => cursoDeModulo(m) === 'ciber').length;

  const ctx = { hecho: claseQ.data?.hecho, tareas: datos.data?.tareas, eventos: eventos.data, mapaIds: temarioQ.data?.mapaIds || {} };
  const unidadAbierta = m => (abiertas[m.id] === undefined ? m.ahora : abiertas[m.id]);
  const contenedor = () => raiz.current?.closest('.vista');
  const buscarParada = clave => raiz.current?.querySelector(`[data-unidad="${CSS.escape(clave)}"]`);

  const irA = el => {
    const c = contenedor();
    if (el && c) c.scrollTo({ top: c.scrollTop + el.getBoundingClientRect().top - c.getBoundingClientRect().top - (nav.current?.offsetHeight || 44) - 8, behavior: 'smooth' });
  };

  // Al abrir una unidad se cierra otra de encima: la parada pulsada no debe moverse bajo el dedo.
  const alternar = (m, u) => {
    const clave = `${m.id}|${u.k}`;
    const p = buscarParada(clave);
    if (p) anclaje.current = { clave, arriba: p.getBoundingClientRect().top };
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

  const verEnTemario = (modId, unidadK) => {
    const mod = todosModulos.find(m => m.id === modId || m.corto === modId);
    if (mod) {
      cambiarCurso(cursoDeModulo(mod));
      if (unidadK) setAbiertas(a => ({ ...a, [mod.id]: unidadK }));
    }
    cambiarSubvista('temario');
    setTimeout(() => {
      const el = raiz.current?.querySelector(`#cl-${modId}`);
      if (el) irA(el);
    }, 100);
  };

  const colorModulo = id => {
    const mod = todosModulos.find(m => m.id === id || m.corto === id);
    return mod?.color || 'var(--linea)';
  };

  useEffect(() => {
    const c = contenedor();
    if (!c || subvista !== 'temario') return;
    const alDesplazar = () => {
      const limite = c.getBoundingClientRect().top + (nav.current?.offsetHeight || 44) + 24;
      let actual = '';
      raiz.current?.querySelectorAll('[data-seccion]').forEach(s => { if (s.getBoundingClientRect().top <= limite) actual = s.id; });
      if (actual) setSeccion(actual);
    };
    c.addEventListener('scroll', alDesplazar, { passive: true });
    return () => c.removeEventListener('scroll', alDesplazar);
  }, [subvista]);

  useEffect(() => {
    if (subvista === 'temario') {
      nav.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [seccion, subvista]);

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

  const actualizarAhora = () => {
    setActualizando(true);
    aviso('Comprobando plataformas…');
    refrescarTemario()
      .then(data => {
        const watcher = data?.watcher;
        const resWatcher = Array.isArray(watcher?.resultados) ? watcher.resultados : [];
        let nuevosTotales = 0;
        let cambiadosTotales = 0;
        for (const r of resWatcher) {
          nuevosTotales += (r.detalle?.nuevos?.length || 0);
          cambiadosTotales += (r.detalle?.cambiados?.length || 0);
        }
        if (nuevosTotales > 0 || cambiadosTotales > 0) {
          const partes = [];
          if (nuevosTotales) partes.push(`${nuevosTotales} novedad${nuevosTotales > 1 ? 'es' : ''}`);
          if (cambiadosTotales) partes.push(`${cambiadosTotales} cambio${cambiadosTotales > 1 ? 's' : ''}`);
          aviso(`Revisión completada: ${partes.join(', ')}`);
        } else {
          aviso('Revisión completada: todo al día, sin cambios');
        }
      })
      .catch(e => aviso(`No se pudo actualizar el temario: ${e.message}`))
      .finally(() => setActualizando(false));
  };

  const total = claseTotal(ctx, modulos);
  const resultados = buscarEnCurso(q, modulos);
  const fechas = fechasPendientes(ctx, modulos);
  const fechasFuturas = fechas.filter(f => !f.pasada);
  const fechasPasadas = fechas.filter(f => f.pasada);

  const vistaHasta = (() => {
    try { return localStorage.getItem('lifeos:novedadesVistasHasta'); } catch { return null; }
  })();
  const novNoVistas = novedadesNoVistas(temarioQ.data?.novedades || [], vistaHasta, 7);
  const novNoVistasCount = novNoVistas.length;

  useEffect(() => {
    if (subvista === 'novedades') {
      try { localStorage.setItem('lifeos:novedadesVistasHasta', new Date().toISOString()); } catch {}
    }
  }, [subvista, temarioQ.data?.novedades]);

  const novedades = novedadesRecientes(temarioQ.data?.novedades || [], 7).filter(nov => {
    if (cursoActivo === 'todos') return true;
    const mod = todosModulos.find(m => m.id === nov.modulo || m.corto === nov.moduloCorto);
    return !mod || cursoDeModulo(mod) === cursoActivo;
  });

  const etiquetaCurso = cursoActivo === 'python' ? 'Python' : cursoActivo === 'ciber' ? 'Ciberseguridad' : '';

  const selectorCursos = (
    <div className="cl-cursos-bar" role="tablist" aria-label="Seleccionar curso">
      <button
        type="button"
        role="tab"
        aria-selected={cursoActivo === 'python'}
        className={`cl-curso-btn ${cursoActivo === 'python' ? 'activo' : ''}`}
        onClick={() => cambiarCurso('python')}
      >
        <span className="cl-curso-tag">🐍 Python</span>
        <span className="cl-curso-num">{nPython} módulos</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={cursoActivo === 'ciber'}
        className={`cl-curso-btn ${cursoActivo === 'ciber' ? 'activo' : ''}`}
        onClick={() => cambiarCurso('ciber')}
      >
        <span className="cl-curso-tag">🛡️ Ciberseguridad</span>
        <span className="cl-curso-num">{nCiber} módulos</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={cursoActivo === 'todos'}
        className={`cl-curso-btn ${cursoActivo === 'todos' ? 'activo' : ''}`}
        onClick={() => cambiarCurso('todos')}
      >
        <span className="cl-curso-tag">📚 Todos</span>
        <span className="cl-curso-num">{todosModulos.length}</span>
      </button>
    </div>
  );

  const pieComun = (
    <div className="cl-pie">
      <span>
        {claseQ.data?.modo === 'hoja' && 'Progreso guardado en tu hoja de Google, en la pestaña Clase.'}
        {claseQ.data?.modo === 'local' && 'Progreso guardado solo en este dispositivo. Actualiza Apps Script para sincronizarlo con la hoja.'}
        {!claseQ.data && 'Comprobando el progreso guardado en tu hoja…'}
        {temarioQ.data?.actualizado && ` · Temario actualizado: ${fechaCorta(temarioQ.data.actualizado.slice(0, 16))}`}
      </span>
      {Object.entries(temarioQ.data?.fuentes || {})
        .filter(([, info]) => info && info.ok === false)
        .map(([origen, info]) => (
          <span key={origen} className="pieza-nota alerta">
            ⚠️ Fuente {origen} con fallos{info.error ? `: ${info.error}` : ''}
          </span>
        ))}
      <button type="button" onClick={actualizarAhora} disabled={actualizando}>
        {actualizando ? 'Comprobando…' : 'Actualizar ahora'}
      </button>
      {subvista === 'temario' && (
        <button type="button" onClick={borrarProgreso} disabled={!claseQ.data}>
          {armado ? 'Pulsa otra vez para borrarlo todo' : 'Borrar mi progreso'}
        </button>
      )}
    </div>
  );

  return (
    <div ref={raiz} className="cl-contenedor-principal">
      <div className="cl-subvistas-bar" role="tablist" aria-label="Secciones de clase">
        <button
          type="button"
          role="tab"
          aria-selected={subvista === 'temario'}
          className={`cl-subvista-btn ${subvista === 'temario' ? 'activo' : ''}`}
          onClick={() => cambiarSubvista('temario')}
        >
          <Icono n="book" s={16} />
          <span>Temario</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subvista === 'novedades'}
          className={`cl-subvista-btn ${subvista === 'novedades' ? 'activo' : ''}`}
          onClick={() => cambiarSubvista('novedades')}
        >
          <Icono n="spark" s={16} />
          <span>Novedades</span>
          {novNoVistasCount > 0 && <span className="cl-insignia-nov">{novNoVistasCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subvista === 'fechas'}
          className={`cl-subvista-btn ${subvista === 'fechas' ? 'activo' : ''}`}
          onClick={() => cambiarSubvista('fechas')}
        >
          <Icono n="cal" s={16} />
          <span>Próximas fechas</span>
          {fechasFuturas.length > 0 && <span className="cl-insignia-fechas">{fechasFuturas.length}</span>}
        </button>
      </div>

      {subvista === 'novedades' && (
        <div className="cl-novedades-pantalla">
          {selectorCursos}
          <div className="cl-novedades-estado">
            <div className="cl-ne-info">
              <span className="cl-ne-titulo">
                <Icono n="spark" s={16} />
                {temarioQ.data?.actualizado
                  ? `Última revisión: ${fechaCorta(temarioQ.data.actualizado.slice(0, 16))}`
                  : 'Revisión periódica activa (cada 2 h)'}
              </span>
              <div className="cl-ne-fuentes">
                {Object.entries(temarioQ.data?.fuentes || {}).map(([f, info]) => (
                  <span key={f} className={`cl-fuente-tag ${info?.ok !== false ? 'ok' : 'fallo'}`}>
                    {info?.ok !== false ? '✓' : '⚠️'} {f.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="cl-btn-refrescar-nov"
              onClick={actualizarAhora}
              disabled={actualizando}
            >
              <Icono n="sync" s={14} />
              {actualizando ? 'Comprobando plataformas…' : 'Actualizar ahora'}
            </button>
          </div>

          <section className="cl-novedades" id="cl-novedades" data-seccion>
            <header className="grupo-cabeza">
              <h2>Novedades (últimos 7 días) {etiquetaCurso ? `(${etiquetaCurso})` : ''}</h2>
            </header>

            {!novedades.length && (
              <div className="cl-vacio-novedades">
                <div className="cl-vacio-icono"><Icono n="check" s={32} /></div>
                <h3>Todo al día</h3>
                <p>No se han detectado novedades en {etiquetaCurso ? `el curso de ${etiquetaCurso}` : 'los cursos'} durante los últimos 7 días.</p>
                <button type="button" className="cl-btn-vacio-actualizar" onClick={actualizarAhora} disabled={actualizando}>
                  {actualizando ? 'Comprobando plataformas…' : 'Comprobar ahora'}
                </button>
              </div>
            )}

            {novedades.length > 0 && (
              <div className="cl-novedades-lista">
                {novedades.map((nov, idx) => {
                  const mod = todosModulos.find(m => m.id === nov.modulo || m.corto === nov.moduloCorto);
                  const color = mod?.color || 'var(--linea)';
                  return (
                    <div key={`${nov.ext_id || nov.n}-${idx}`} className="cl-novedad-tarjeta" style={{ '--cl': color }}>
                      <div className="cl-nt-cabeza">
                        <span className="cl-nt-modulo" style={{ background: color }}>{nov.moduloCorto || nov.modulo}</span>
                        <span className="pieza-tipo">{nov.tipo || nov.evento}</span>
                        {nov.fecha && <span className="cl-nt-cuando">{fechaCorta(nov.fecha.slice(0, 16))}</span>}
                      </div>
                      <h3 className="cl-nt-titulo">{nov.n}</h3>
                      {nov.fechaItem && (
                        <div className="cl-nt-meta">
                          <span className="cuando">Plazo: {fechaCorta(nov.fechaItem)} ({textoDias(diasHasta(nov.fechaItem))})</span>
                        </div>
                      )}
                      {nov.calificacion !== undefined && nov.calificacion !== null && (
                        <div className="cl-nt-meta">
                          <span className="pieza-nota">Calificación: {nov.calificacion}</span>
                        </div>
                      )}
                      {nov.resumen_ia && (
                        <div className="cl-nt-resumen">
                          <p className="cl-nt-resumen-tit"><Icono n="spark" s={13} /> Resumen clave:</p>
                          <p>{nov.resumen_ia}</p>
                        </div>
                      )}
                      <div className="cl-nt-acciones">
                        {nov.url && (
                          <a className="pieza-abrir" href={nov.url} target="_blank" rel="noopener">
                            Abrir <Icono n="ext" s={13} />
                          </a>
                        )}
                        {nov.apunte_url && (
                          <a className="pieza-abrir" href={nov.apunte_url} target="_blank" rel="noopener">
                            Ver en Drive <Icono n="ext" s={13} />
                          </a>
                        )}
                        <button type="button" className="cl-nt-btn-temario" onClick={() => verEnTemario(nov.modulo, nov.unidad)}>
                          <Icono n="book" s={13} /> Ver en Temario
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          {pieComun}
        </div>
      )}

      {subvista === 'fechas' && (
        <div className="cl-fechas-pantalla">
          {selectorCursos}
          <section className="cl-fechas" id="cl-fechas" data-seccion>
            <header className="grupo-cabeza">
              <h2>Próximas fechas {etiquetaCurso ? `(${etiquetaCurso})` : ''}</h2>
            </header>
            {!fechasFuturas.length && <p className="fila-datos">No queda ninguna fecha pendiente en este curso.</p>}
            {fechasFuturas.map(({ m, u, it, pasada }) => {
              const n = diasHasta(it.fecha);
              return (
                <button key={`${m.id}${it.ext_id || it.n}`} type="button" className="cl-fecha" style={{ '--cl': m.color }} onClick={() => verEnTemario(m.id, u.k)}>
                  <span className="cuando">{fechaCorta(it.fecha)}</span>
                  <span className={`prioridad ${pasada ? 'p-Alta' : n <= 2 ? 'p-Alta' : n <= 7 ? 'p-Media' : 'p-Baja'}`}>{pasada ? 'vencida, ' : ''}{textoDias(n)}</span>
                  <b>{it.n}</b>
                  <small>{it.tipo} de {m.nombre}</small>
                </button>
              );
            })}

            {fechasPasadas.length > 0 && (
              <div className="cl-pasadas-wrap">
                <button type="button" className="cl-pasadas-toggle" onClick={() => setMostrarPasadas(v => !v)}>
                  <Icono n={mostrarPasadas ? 'back' : 'next'} s={14} />
                  <span>{mostrarPasadas ? 'Ocultar' : 'Ver'} {fechasPasadas.length} entrega{fechasPasadas.length > 1 ? 's' : ''} pasadas / anteriores</span>
                </button>
                {mostrarPasadas && (
                  <div className="cl-pasadas-lista">
                    {fechasPasadas.map(({ m, u, it }) => (
                      <button key={`${m.id}${it.ext_id || it.n}`} type="button" className="cl-fecha cl-fecha-pasada" style={{ '--cl': m.color }} onClick={() => verEnTemario(m.id, u.k)}>
                        <span className="cuando">{fechaCorta(it.fecha)}</span>
                        <span className="prioridad pasada">vencida ({fechaCorta(it.fecha)})</span>
                        <b>{it.n}</b>
                        <small>{it.tipo} de {m.nombre}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
          {pieComun}
        </div>
      )}

      {subvista === 'temario' && (
        <div className="cl-temario-pantalla">
          <div className="cl-intro">
            {selectorCursos}
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
            {modulos.map(m => (
              <button key={m.id} type="button" style={{ '--cl': m.color }} className={seccion === `cl-${m.id}` ? 'on' : ''} onClick={() => irA(raiz.current.querySelector(`#cl-${m.id}`))}>
                <i />{m.corto}
              </button>
            ))}
          </nav>

          {modulos.map(m => {
            const c = cuentaModulo(ctx, m);
            const media = calcularMediaModulo(m);
            return (
              <section key={m.id} className="cl-modulo" id={`cl-${m.id}`} data-seccion style={{ '--cl': m.color }}>
                <div className="cl-cabeza">
                  <div className="cl-cabeza-fila"><h2>{m.nombre}</h2><span>{c.hechos} de {c.total}{media !== null ? ` · Nota media: ${media} / 10` : ''}</span></div>
                  <p>{m.meta}</p>
                  <Barra className="cl-mbarra" valor={c.hechos} total={c.total} />
                  {m.calificaciones?.length > 0 && (
                    <div className="cl-calificaciones">
                      {m.calificaciones.map((cal, idx) => (
                        <span key={cal.ext_id || idx} className="pieza-nota">
                          {cal.nombre || cal.itemname}: {cal.nota ?? cal.graderaw} / {cal.max ?? cal.grademax ?? 10}
                          {cal.comentario ? ` (${cal.comentario})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
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

          {pieComun}
        </div>
      )}
    </div>
  );
}
