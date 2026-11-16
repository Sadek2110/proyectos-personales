import { Fragment, useEffect, useRef, useState } from 'react';
import { api, qc } from '../api.js';
import { Esqueleto, Fallo, Segmentado, Vacio } from '../componentes/comun.jsx';
import { Icono } from '../componentes/Icono.jsx';
import { CLAVE, recargar, useAgente } from '../datos.js';
import { activarAvisos, desactivarAvisos, estadoAvisos } from '../notificaciones.js';
import { useUI } from '../ui.jsx';
import { aBase64, puedeGrabar, puedeLeer, useGrabadora, useLectura } from '../voz.js';
import './agente.css';

const OPCIONES_ANTELACION = [5, 10, 15, 30, 60];

function Confirmacion({ pendiente }) {
  const { aviso } = useUI();
  const [ocupado, setOcupado] = useState(false);
  const decidir = async aceptar => {
    setOcupado(true);
    try {
      const r = await api('agente/confirmar', [pendiente.id, aceptar]);
      qc.setQueryData(CLAVE.agente, r.estado);
      recargar(r.cambios);
    } catch (e) {
      aviso(e.message);
      recargar(['agente']);
    }
    setOcupado(false);
  };
  return (
    <div className="confirmacion" role="group" aria-label="Confirmar borrado">
      <p>{pendiente.descripcion}</p>
      <div>
        <button type="button" className="btn btn-peq btn-peligro" disabled={ocupado} onClick={() => decidir(true)}>Borrar</button>
        <button type="button" className="btn btn-peq btn-suave" disabled={ocupado} onClick={() => decidir(false)}>Cancelar</button>
      </div>
    </div>
  );
}

function Limpiar({ alLimpiar }) {
  const { aviso } = useUI();
  const [preguntando, setPreguntando] = useState(false);
  const limpiar = async () => {
    alLimpiar();
    try {
      qc.setQueryData(CLAVE.agente, await api('agente/vaciar'));
    } catch (e) {
      aviso(`No se pudo limpiar: ${e.message}`);
    }
    setPreguntando(false);
  };
  return (
    <div className="chat-limpiar">
      {preguntando ? <>
        <span>¿Borrar toda la conversación?</span>
        <button type="button" className="btn btn-peq btn-peligro" onClick={limpiar}>Borrar</button>
        <button type="button" className="btn btn-peq btn-suave" onClick={() => setPreguntando(false)}>Cancelar</button>
      </> : (
        <button type="button" className="enlace-suave" onClick={() => setPreguntando(true)}><Icono n="trash" s={16} /> Limpiar conversación</button>
      )}
    </div>
  );
}

const minutos = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function Chat({ estado, visible }) {
  const { aviso } = useUI();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(null);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const fin = useRef(null);
  const lectura = useLectura();

  const transcribir = async audio => {
    setTranscribiendo(true);
    try {
      const r = await api('agente/transcribir', [await aBase64(audio), audio.type]);
      // Al cuadro y no directo al agente: una palabra mal entendida podría cambiar tus datos.
      setTexto(t => (t.trim() ? `${t.trim()} ${r.texto}` : r.texto));
    } catch (e) {
      aviso(e.message);
    }
    setTranscribiendo(false);
  };
  const grabadora = useGrabadora({ alTerminar: transcribir, alFallar: aviso });
  const { cancelar, grabando } = grabadora;
  const { parar: pararLectura } = lectura;

  useEffect(() => {
    if (visible) fin.current?.scrollIntoView({ block: 'end' });
    else { cancelar(); pararLectura(); } // al cambiar de sección no sigue grabando ni hablando
  }, [visible, cancelar, pararLectura, estado.chat.length, estado.pendientes.length, enviando]);

  const enviar = async () => {
    const mensaje = texto.trim();
    if (!mensaje || enviando) return;
    setEnviando(mensaje);
    setTexto('');
    try {
      const r = await api('agente/chat', [mensaje]);
      qc.setQueryData(CLAVE.agente, r.estado);
      recargar(r.cambios);
    } catch (e) {
      aviso(e.message);
      setTexto(mensaje);
    }
    setEnviando(null);
  };

  const alTeclear = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  };

  const hayAlgo = estado.chat.length > 0 || enviando;
  return (
    <>
      {estado.chat.length > 0 && <Limpiar alLimpiar={pararLectura} />}
      <div className="chat-lista" aria-live="polite">
        {!hayAlgo && (
          <Vacio titulo="¿En qué te ayudo?">
            {estado.configurado
              ? 'Prueba con "¿qué tengo mañana?" o "añade leche a la compra".'
              : 'Falta la clave de Gemini en el servidor (GEMINI_API_KEY). Los avisos de eventos y tareas funcionan igual.'}
          </Vacio>
        )}
        {estado.chat.map(m => (
          <Fragment key={m.id}>
            <p className={`mensaje de-${m.rol} ${m.error ? 'con-error' : ''}`}>{m.texto}</p>
            {m.rol === 'agente' && !m.error && puedeLeer() && (
              <button type="button" className="enlace-suave escuchar" aria-pressed={lectura.leyendo === m.id} onClick={() => lectura.alternar(m.id, m.texto)}>
                <Icono n={lectura.leyendo === m.id ? 'stop' : 'sound'} s={16} /> {lectura.leyendo === m.id ? 'Parar' : 'Escuchar'}
              </button>
            )}
          </Fragment>
        ))}
        {enviando && <p className="mensaje de-usuario">{enviando}</p>}
        {enviando && <p className="mensaje de-agente pensando">Pensando…</p>}
        {estado.pendientes.map(p => <Confirmacion key={p.id} pendiente={p} />)}
        <div ref={fin} />
      </div>
      <form className="chat-caja" onSubmit={e => { e.preventDefault(); enviar(); }}>
        {grabando ? (
          <div className="chat-grabando" role="status">
            <i /> <span>Grabando {minutos(grabadora.segundos)}</span>
            <button type="button" className="enlace-suave" onClick={cancelar}>Cancelar</button>
          </div>
        ) : (
          <textarea rows={1} value={texto} maxLength={4000} aria-label="Mensaje para el agente"
            placeholder={transcribiendo ? 'Transcribiendo…' : 'Escribe al agente'}
            disabled={!estado.configurado || transcribiendo} onChange={e => setTexto(e.target.value)} onKeyDown={alTeclear} />
        )}
        {estado.configurado && puedeGrabar() && (
          <button type="button" className={`chat-microfono ${grabando ? 'activo' : ''}`} aria-label={grabando ? 'Terminar de grabar' : 'Dictar con el micrófono'}
            disabled={transcribiendo} onClick={grabando ? grabadora.parar : grabadora.empezar}>
            <Icono n={grabando ? 'stop' : 'mic'} s={20} />
          </button>
        )}
        {!grabando && <button type="submit" className="chat-enviar" aria-label="Enviar" disabled={!texto.trim() || !!enviando || transcribiendo}><Icono n="send" s={20} /></button>}
      </form>
    </>
  );
}

const TEXTO_AVISOS = {
  ios: 'En iPhone los avisos solo funcionan con la app instalada: Compartir → Añadir a pantalla de inicio, y ábrela desde ese icono.',
  'no-soportado': 'Este navegador no admite avisos.',
  denegado: 'El navegador tiene bloqueados los avisos de esta web. Actívalos en los permisos del sitio y vuelve aquí.',
  inactivo: 'Actívalos en cada móvil o PC donde quieras recibirlos.',
  activo: 'Activos en este dispositivo.',
};

function BloqueAvisos({ clavePublica }) {
  const { aviso } = useUI();
  const [situacion, setSituacion] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    estadoAvisos(clavePublica).then(setSituacion, () => setSituacion('no-soportado'));
  }, [clavePublica]);

  const ejecutar = async accion => {
    setOcupado(true);
    try { await accion(); } catch (e) { aviso(`No se pudo: ${e.message}`); }
    setOcupado(false);
  };

  return (
    <section className="ajuste-bloque">
      <h2>Avisos</h2>
      <p>{situacion ? TEXTO_AVISOS[situacion] : 'Comprobando…'}</p>
      <div className="ajuste-botones">
        {situacion === 'inactivo' && (
          <button type="button" className="btn btn-peq btn-linea" disabled={ocupado} onClick={() => ejecutar(async () => setSituacion(await activarAvisos(clavePublica)))}>Activar avisos</button>
        )}
        {situacion === 'activo' && <>
          <button type="button" className="btn btn-peq btn-linea" disabled={ocupado} onClick={() => ejecutar(async () => { await api('agente/probar'); aviso('Aviso de prueba enviado'); })}>Enviar prueba</button>
          <button type="button" className="btn btn-peq btn-suave" disabled={ocupado} onClick={() => ejecutar(async () => setSituacion(await desactivarAvisos()))}>Desactivar</button>
        </>}
      </div>
    </section>
  );
}

function Interruptor({ titulo, ayuda, activo, onCambio, children }) {
  return (
    <div className="interruptor">
      <label>
        <input type="checkbox" checked={activo} onChange={e => onCambio(e.target.checked)} />
        <span><b>{titulo}</b><small>{ayuda}</small></span>
      </label>
      {activo && children}
    </div>
  );
}

function BloqueMcp() {
  const { aviso } = useUI();
  const [datos, setDatos] = useState(null);
  const comando = datos && `claude mcp add --transport http life-os ${datos.url} --header "Authorization: Bearer ${datos.token}"`;
  return (
    <section className="ajuste-bloque">
      <h2>Conexión MCP</h2>
      <p>Para usar tus datos desde otros clientes de IA. Quien tenga el token puede leer, cambiar y borrar tus datos, y la confirmación de borrados depende de ese cliente.</p>
      {!datos && <div className="ajuste-botones"><button type="button" className="btn btn-peq btn-suave" onClick={() => api('agente/mcp').then(setDatos, e => aviso(e.message))}>Mostrar datos de conexión</button></div>}
      {datos && <>
        <code className="codigo">{comando}</code>
        <div className="ajuste-botones">
          <button type="button" className="btn btn-peq btn-suave"
            onClick={() => navigator.clipboard.writeText(comando).then(() => aviso('Comando copiado'), () => aviso('No se pudo copiar'))}>Copiar</button>
          <button type="button" className="btn btn-peq btn-suave" onClick={() => setDatos(null)}>Ocultar</button>
        </div>
      </>}
    </section>
  );
}

function Ajustes({ estado }) {
  const { aviso } = useUI();
  const { prefs } = estado;
  const cambiar = async cambio => {
    try {
      qc.setQueryData(CLAVE.agente, await api('agente/prefs', [cambio]));
    } catch (e) {
      aviso(`No se pudo guardar: ${e.message}`);
    }
  };
  return (
    <div className="agente-ajustes">
      <BloqueAvisos clavePublica={estado.clavePublica} />
      <section className="ajuste-bloque">
        <h2>Qué quieres recibir</h2>
        <Interruptor titulo="Resumen de la mañana" ayuda="La agenda, lo urgente y lo vencido, una vez al día." activo={prefs.resumen} onCambio={v => cambiar({ resumen: v })}>
          <label className="ajuste-valor">Hora
            <input type="time" value={prefs.horaResumen} onChange={e => e.target.value && cambiar({ horaResumen: e.target.value })} />
          </label>
        </Interruptor>
        <Interruptor titulo="Antes de cada evento" ayuda="Eventos con hora de tu calendario." activo={prefs.eventos} onCambio={v => cambiar({ eventos: v })}>
          <label className="ajuste-valor">Antelación
            <select value={prefs.minutosEvento} onChange={e => cambiar({ minutosEvento: Number(e.target.value) })}>
              {OPCIONES_ANTELACION.map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        </Interruptor>
        <Interruptor titulo="Tareas y entregas" ayuda="Tareas 1 h antes; entregas y pruebas 3 días, 1 día y 3 h antes." activo={prefs.tareas} onCambio={v => cambiar({ tareas: v })} />
        <Interruptor titulo="Sugerencias del agente" ayuda="Hasta 2 al día, solo si ve algo que merezca la pena." activo={prefs.sugerencias} onCambio={v => cambiar({ sugerencias: v })} />
      </section>
      <BloqueMcp />
    </div>
  );
}

export default function Agente({ activa }) {
  const consulta = useAgente();
  const [modo, setModo] = useState('chat');
  if (!consulta.data) return consulta.isError ? <Fallo que="el agente" consulta={consulta} /> : <Esqueleto />;
  return (
    <>
      <Segmentado id="agente" valor={modo} opciones={[['chat', 'Chat'], ['ajustes', 'Ajustes']]} onCambio={setModo} />
      {modo === 'chat' ? <Chat estado={consulta.data} visible={activa} /> : <Ajustes estado={consulta.data} />}
    </>
  );
}
