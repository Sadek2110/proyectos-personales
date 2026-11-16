import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { iniciales } from '../lib/formato.js';

export function Icono({ nombre, relleno = false, className = '' }) {
  return <span aria-hidden="true" className={`icono ${relleno ? 'relleno' : ''} ${className}`}>{nombre}</span>;
}

const VARIANTES = {
  primario: 'bg-marca text-white hover:bg-marca-oscuro shadow-sm',
  fichar: 'bg-amarillo text-negro border-2 border-amarillo-borde hover:brightness-95 shadow-sm',
  secundario: 'bg-white text-marca-oscuro border-2 border-marca-borde hover:bg-marca-suave',
  suave: 'bg-marca-suave text-marca-oscuro hover:bg-marca-borde/50',
  neutro: 'bg-white text-texto border-2 border-borde hover:bg-fondo',
  peligro: 'bg-white text-marca-oscuro border-2 border-marca hover:bg-marca-suave',
  texto: 'text-marca-oscuro underline underline-offset-4 hover:text-marca',
};

/** Botón grande (56px) o enlace con aspecto de botón */
export function Boton({ variante = 'primario', icono, iconoFinal, a, href, cargando, children, className = '', pequeno, ...props }) {
  const base = `inline-flex items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
    variante === 'texto' ? 'min-h-11 px-2' : pequeno ? 'min-h-11 px-4 text-base' : 'min-h-14 px-5 text-lg'
  } ${VARIANTES[variante]} ${className}`;
  const contenido = (
    <>
      {cargando ? <Icono nombre="progress_activity" className="animate-spin" /> : icono && <Icono nombre={icono} />}
      {children}
      {iconoFinal && <Icono nombre={iconoFinal} />}
    </>
  );
  if (a) return <Link to={a} className={base} {...props}>{contenido}</Link>;
  if (href) return <a href={href} className={base} {...props}>{contenido}</a>;
  return <button type="button" className={base} disabled={cargando || props.disabled} {...props}>{contenido}</button>;
}

export function Tarjeta({ children, className = '', ...props }) {
  return <section className={`rounded-2xl border border-borde bg-white p-5 shadow-sm ${className}`} {...props}>{children}</section>;
}

const ESTADOS = {
  Pendiente: 'bg-pendiente text-pendiente-texto',
  Entregado: 'bg-entregado text-entregado-texto',
  Revisado: 'bg-revisado text-revisado-texto',
  Presente: 'bg-revisado text-revisado-texto',
  Retraso: 'bg-pendiente text-pendiente-texto',
  Ausente: 'bg-marca-suave text-marca-oscuro',
  Justificada: 'bg-entregado text-entregado-texto',
  Hoy: 'bg-entregado text-entregado-texto',
  Planificada: 'bg-fondo text-texto-2',
  Cerrada: 'bg-revisado text-revisado-texto',
};

export function Chip({ estado, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold ${ESTADOS[estado] || 'bg-fondo text-texto-2'} ${className}`}>
      <span className="size-2 rounded-full bg-current" aria-hidden="true" />
      {children ?? estado}
    </span>
  );
}

export function Avatar({ nombre, className = '' }) {
  return (
    <span aria-hidden="true" className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-marca font-titulo text-base font-bold text-white ${className}`}>
      {iniciales(nombre)}
    </span>
  );
}

export function Campo({ etiqueta, ayuda, error, tipo = 'text', className = '', ...props }) {
  const id = useId();
  const comunes = `w-full rounded-xl border-2 bg-white px-4 text-lg text-texto placeholder:text-texto-2/60 focus:border-marca focus:outline-none ${
    error ? 'border-marca' : 'border-borde'
  }`;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {etiqueta && <label htmlFor={id} className="font-bold">{etiqueta}</label>}
      {tipo === 'area' ? (
        <textarea id={id} className={`${comunes} min-h-28 py-3`} {...props} />
      ) : tipo === 'select' ? (
        <select id={id} className={`${comunes} min-h-14`} {...props} />
      ) : (
        <input id={id} type={tipo} className={`${comunes} min-h-14`} {...props} />
      )}
      {ayuda && !error && <p className="text-base text-texto-2">{ayuda}</p>}
      {error && <p className="flex items-center gap-1 text-base font-bold text-marca-oscuro"><Icono nombre="error" />{error}</p>}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-texto-2" role="status">
      <Icono nombre="progress_activity" className="animate-spin text-3xl text-marca" />
      <span>{texto}</span>
    </div>
  );
}

export function ErrorCaja({ error, reintentar }) {
  return (
    <div className="rounded-2xl border-2 border-marca-borde bg-marca-suave p-5" role="alert">
      <p className="flex items-start gap-2 font-bold text-marca-oscuro"><Icono nombre="error" />{error?.message || String(error)}</p>
      {reintentar && <Boton variante="secundario" icono="refresh" className="mt-4" onClick={reintentar} pequeno>Volver a intentarlo</Boton>}
    </div>
  );
}

export function Vacio({ icono = 'inbox', titulo, children }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-borde bg-white px-6 py-10 text-center">
      <Icono nombre={icono} className="text-4xl text-texto-2" />
      <p className="font-titulo text-lg font-bold">{titulo}</p>
      {children && <div className="text-texto-2">{children}</div>}
    </div>
  );
}

/** Carga con useApi y pinta estados de carga/error */
export function ConDatos({ consulta, children }) {
  if (consulta.cargando && !consulta.datos) return <Cargando />;
  if (consulta.error) return <ErrorCaja error={consulta.error} reintentar={consulta.recargar} />;
  return children(consulta.datos);
}

export function Markdown({ texto, className = '' }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(texto || '')), [texto]);
  return <div className={`prosa ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Modal({ abierto, cerrar, titulo, children, ancho = 'max-w-lg' }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      onClose={cerrar}
      onClick={(e) => e.target === ref.current && cerrar()}
      className={`m-auto w-[calc(100%-2rem)] ${ancho} rounded-2xl p-0 shadow-xl backdrop:bg-negro/50`}
    >
      {abierto && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-2xl font-bold">{titulo}</h2>
            <button type="button" onClick={cerrar} className="-m-2 flex size-11 items-center justify-center rounded-lg text-texto-2 hover:bg-fondo" aria-label="Cerrar">
              <Icono nombre="close" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// ---------- Avisos breves (toasts) ----------

const AvisosCtx = createContext(() => {});
export const useAviso = () => useContext(AvisosCtx);

export function ProveedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);
  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <AvisosCtx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-5 py-4 font-bold text-white shadow-lg ${a.tipo === 'error' ? 'bg-marca-oscuro' : 'bg-negro'}`}>
            <Icono nombre={a.tipo === 'error' ? 'error' : 'check_circle'} className={a.tipo === 'error' ? '' : 'text-amarillo'} />
            {a.texto}
          </div>
        ))}
      </div>
    </AvisosCtx.Provider>
  );
}

export function Titulo({ titulo, subtitulo, accion }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-texto-2">{subtitulo}</p>}
      </div>
      {accion}
    </header>
  );
}

export function Pestanas({ opciones, valor, cambiar }) {
  return (
    <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
      {opciones.map(([v, etiqueta]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={valor === v}
          onClick={() => cambiar(v)}
          className={`min-h-12 shrink-0 rounded-xl border-2 px-4 font-bold ${valor === v ? 'border-marca bg-marca text-white' : 'border-borde bg-white text-texto hover:bg-fondo'}`}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}
