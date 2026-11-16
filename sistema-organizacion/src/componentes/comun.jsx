import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icono } from './Icono.jsx';
import { esTemporal, marcarTarea } from '../datos.js';
import { fechaCorta, hoy } from '../fechas.js';
import { useUI } from '../ui.jsx';
import { FormTarea } from './formularios.jsx';

export const MUELLE = { type: 'spring', stiffness: 520, damping: 38 };
const PAUSA_ANTES_DE_SALIR = 240; // deja ver la estación llenándose

/** Cifra que cambia pasando como una tablilla de horarios. */
export function Contador({ n }) {
  return (
    <span className="contador">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={n} initial={{ y: '-90%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '90%', opacity: 0 }} transition={MUELLE}>
          {n}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function Segmentado({ id, valor, opciones, onCambio }) {
  return (
    <div className="segmentado" role="group">
      {opciones.map(([v, texto, n]) => (
        <button key={v} type="button" className={valor === v ? 'on' : ''} aria-pressed={valor === v} onClick={() => onCambio(v)}>
          {valor === v && <motion.span layoutId={`seg-${id}`} className="seg-fondo" transition={MUELLE} />}
          <span className="seg-texto">{texto}{n != null && <b><Contador n={n} /></b>}</span>
        </button>
      ))}
    </div>
  );
}

export function Vacio({ titulo, children }) {
  return (
    <div className="vacio">
      <h3>{titulo}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Esqueleto({ filas = 4 }) {
  return (
    <div className="esqueleto" role="status" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="esq-fila"><i /><div><b style={{ width: `${72 - i * 11}%` }} /><b /></div></div>
      ))}
    </div>
  );
}

/** Error de una sola sección: el resto de la app sigue funcionando. */
export function Fallo({ que, consulta }) {
  return (
    <div className="fallo" role="alert">
      <p><b>No se pudo cargar {que}.</b> {consulta.error?.message}</p>
      <button type="button" className="btn btn-suave btn-peq" onClick={() => consulta.refetch()}>Reintentar</button>
    </div>
  );
}

/** Con datos guardados a la vista, un fallo al actualizar es solo un aviso discreto. */
export function SinActualizar({ que, consulta }) {
  if (!consulta.isRefetchError) return null;
  return (
    <p className="sin-actualizar">
      {que} sin actualizar: {consulta.error?.message}.{' '}
      <button type="button" onClick={() => consulta.refetch()}>Reintentar</button>
    </p>
  );
}

export function Estacion({ on, peligro, etiqueta, onClick, deshabilitada }) {
  return (
    <motion.button type="button" className={`estacion ${on ? 'on' : ''} ${peligro ? 'peligro' : ''}`}
      whileTap={{ scale: 0.82 }} transition={MUELLE} aria-pressed={!!on} aria-label={etiqueta} onClick={onClick} disabled={deshabilitada}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <motion.path d="m5 12.5 4.5 4.5L19 7.5" initial={false} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={{ duration: 0.2 }} />
      </svg>
    </motion.button>
  );
}

/** Fila de una lista: entra y sale plegándose, y las demás ocupan su sitio. */
export function Fila({ children, className = '' }) {
  return (
    <motion.div className={`fila ${className}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0, x: 28 }} transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}>
      <div className="fila-dentro">{children}</div>
    </motion.div>
  );
}

/** Marca en la estación y, tras un instante, ejecuta la acción que saca la fila de la lista. */
export function useMarcarYSalir(accion) {
  const [marcando, setMarcando] = useState(false);
  return [marcando, () => {
    setMarcando(true);
    setTimeout(accion, PAUSA_ANTES_DE_SALIR);
  }];
}

export function Dato({ icono, tarde, children }) {
  return <span className={`dato ${tarde ? 'tarde' : ''}`}><Icono n={icono} s={14} /><span>{children}</span></span>;
}

export function FilaTarea({ t }) {
  const { aviso, abrirHoja } = useUI();
  const cambiar = () => {
    const hecha = !t.completada;
    aviso(hecha ? 'Tarea completada' : 'Tarea reabierta', () => cambiarTarea(t.id, !hecha, aviso));
    cambiarTarea(t.id, hecha, aviso);
  };
  const [marcando, marcar] = useMarcarYSalir(cambiar);
  const tarde = !t.completada && t.fecha && t.fecha.slice(0, 10) < hoy();
  return (
    <Fila className={`${t.completada ? 'hecha' : ''} ${esTemporal(t.id) ? 'pendiente' : ''}`}>
      <Estacion on={t.completada !== marcando} peligro={t.prioridad === 'Alta' && !t.completada} onClick={marcar}
        etiqueta={`${t.completada ? 'Reabrir' : 'Completar'}: ${t.titulo}`} />
      <button type="button" className="fila-cuerpo" onClick={() => abrirHoja(<FormTarea tarea={{ ...t }} />)}>
        <span className="fila-titulo">{t.titulo}</span>
        <span className="fila-datos">
          {t.prioridad && !t.completada && <span className={`prioridad p-${t.prioridad}`}>{t.prioridad}</span>}
          {t.fecha && <Dato icono="clock" tarde={tarde}>{fechaCorta(t.fecha)}</Dato>}
          {t.ubicacion && <Dato icono="pin">{t.ubicacion}</Dato>}
        </span>
      </button>
    </Fila>
  );
}

export const cambiarTarea = (id, hecha, aviso) => marcarTarea(id, hecha).catch(e => aviso(`No se pudo actualizar: ${e.message}`));
