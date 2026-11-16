import { useEffect, useRef, useState } from 'react';
import { motion, useDragControls } from 'motion/react';
import { Icono } from './Icono.jsx';
import { useUI } from '../ui.jsx';

const esEscritorio = () => matchMedia('(min-width: 900px)').matches;
const MUELLE_HOJA = { type: 'spring', stiffness: 420, damping: 40 };

/**
 * Hoja inferior en el móvil (se cierra arrastrándola hacia abajo) y ventana centrada en el PC.
 * onGuardar recibe los campos y devuelve un texto si hay algo que corregir.
 */
export function Hoja({ titulo, children, onGuardar, onBorrar, textoOk = 'Guardar', foco }) {
  const { cerrarHoja } = useUI();
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const form = useRef(null);
  const arrastre = useDragControls();
  const [escritorio] = useState(esEscritorio);

  useEffect(() => {
    const anterior = document.activeElement;
    if (foco) form.current?.querySelector(`[name="${foco}"]`)?.focus({ preventScroll: true });
    else form.current?.closest('[role=dialog]')?.focus({ preventScroll: true });
    return () => anterior?.focus?.({ preventScroll: true });
  }, [foco]);

  const enviar = e => {
    e.preventDefault();
    const problema = onGuardar(Object.fromEntries(new FormData(form.current)));
    if (typeof problema === 'string') setError(problema);
    else cerrarHoja();
  };

  const borrar = () => {
    if (!confirmando) return setConfirmando(true);
    onBorrar();
    cerrarHoja();
  };

  const estados = escritorio
    ? { initial: { opacity: 0, y: 14, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 8, scale: 0.98 } }
    : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } };

  return (
    <motion.div className="fondo-hoja" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      onMouseDown={e => { if (e.target === e.currentTarget) cerrarHoja(); }}>
      <motion.div className="hoja" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} {...estados} transition={MUELLE_HOJA}
        drag={escritorio ? false : 'y'} dragControls={arrastre} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.9 }}
        onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) cerrarHoja(); }}>
        <div className="agarre" onPointerDown={e => arrastre.start(e)}><i /></div>
        <div className="hoja-cabeza">
          <h2>{titulo}</h2>
          <button type="button" className="boton-icono" aria-label="Cerrar" onClick={cerrarHoja}><Icono n="x" s={20} /></button>
        </div>
        <form ref={form} onSubmit={enviar} autoComplete="off" noValidate>
          {children}
          {error && <p className="hoja-error" role="alert">{error}</p>}
          {(onBorrar || onGuardar) && (
            <div className="hoja-acciones">
              {onBorrar && <button type="button" className="btn btn-peligro" onClick={borrar}>{confirmando ? 'Confirmar' : 'Eliminar'}</button>}
              {onGuardar && <button type="submit" className="btn btn-linea">{textoOk}</button>}
            </div>
          )}
        </form>
      </motion.div>
    </motion.div>
  );
}

export function Campo({ label, ayuda, children }) {
  return (
    <label className="campo">
      <span>{label}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

export function ConLista({ name, valor, opciones, ph, onChange }) {
  return (
    <>
      <input name={name} defaultValue={valor} list={`dl-${name}`} placeholder={ph} autoComplete="off" onChange={onChange} />
      <datalist id={`dl-${name}`}>{opciones.map(o => <option key={o} value={o} />)}</datalist>
    </>
  );
}

export function Opciones({ name, opciones, valor }) {
  return (
    <div className="opciones">
      {opciones.map(([v, texto]) => (
        <label key={v} className="opcion">
          <input type="radio" name={name} value={v} defaultChecked={v === valor} />
          <span>{texto}</span>
        </label>
      ))}
    </div>
  );
}
