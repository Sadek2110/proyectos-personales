import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Avatar, Boton, Campo, Chip, ConDatos, Icono, Modal, Tarjeta, Titulo, Vacio, useAviso } from '../../components/ui.jsx';
import { api, useApi } from '../../lib/api.js';
import { fechaLarga, hora, horario, hoyISO } from '../../lib/formato.js';

// Horario habitual de las clases: de 09:30 a 13:30
const VACIA = { fecha: '', hora_inicio: '09:30', hora_fin: '13:30', titulo: '', unidad_id: '', tema_id: '', lugar: 'Aula de la Cámara de Comercio de Ceuta', observaciones: '' };

export function FormSesion({ sesion, cerrar, guardado }) {
  const avisar = useAviso();
  const unidades = useApi('/unidades');
  const [f, setF] = useState(() => (sesion ? { ...VACIA, ...Object.fromEntries(Object.entries(sesion).map(([k, v]) => [k, v ?? ''])) } : { ...VACIA, fecha: hoyISO() }));
  const [enviando, setEnviando] = useState(false);
  const temas = (unidades.datos || []).flatMap((u) => u.temas);
  const c = (k) => (e) => {
    const valor = e.target.value;
    setF((x) => {
      const n = { ...x, [k]: valor };
      // Al elegir tema se rellenan la unidad y el título si están vacíos
      if (k === 'tema_id') {
        const t = temas.find((y) => y.id === valor);
        if (t) {
          n.unidad_id = t.unidad_id;
          if (!x.titulo) n.titulo = t.titulo;
        }
      }
      return n;
    });
  };

  async function guardar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = sesion ? await api.put(`/sesiones/${sesion.id}`, f) : await api.post('/sesiones', f);
      avisar(sesion ? 'Sesión guardada.' : `Sesión ${r.id} creada.`);
      guardado(r);
    } catch (err) {
      avisar(err.message, 'error');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      <Campo etiqueta="Fecha" tipo="date" value={f.fecha} onChange={c('fecha')} required />
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Empieza" tipo="time" value={f.hora_inicio} onChange={c('hora_inicio')} />
        <Campo etiqueta="Termina" tipo="time" value={f.hora_fin} onChange={c('hora_fin')} />
      </div>
      <Campo etiqueta="Tema que se trabaja" tipo="select" value={f.tema_id} onChange={c('tema_id')}>
        <option value="">Sin tema concreto</option>
        {temas.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.titulo}</option>)}
      </Campo>
      <Campo etiqueta="Título de la clase" value={f.titulo} onChange={c('titulo')} required />
      <Campo etiqueta="Lugar" value={f.lugar} onChange={c('lugar')} />
      <Campo etiqueta="Observaciones" tipo="area" value={f.observaciones} onChange={c('observaciones')} />
      <div className="flex justify-end gap-3">
        <Boton variante="neutro" onClick={cerrar}>Cancelar</Boton>
        <Boton type="submit" cargando={enviando}>Guardar</Boton>
      </div>
    </form>
  );
}

export function Sesiones() {
  const consulta = useApi('/sesiones');
  const [modal, setModal] = useState(null);
  const navegar = useNavigate();
  const hoy = hoyISO();
  return (
    <>
      <Titulo titulo="Sesiones y asistencia" subtitulo="Programa las clases y pasa lista. Los alumnos que fichan quedan marcados automáticamente." accion={<Boton icono="add" onClick={() => setModal('nueva')}>Nueva sesión</Boton>} />
      <ConDatos consulta={consulta}>
        {(lista) => lista.length === 0 ? <Vacio icono="event" titulo="No hay sesiones">Crea la primera clase.</Vacio> : (
          <div className="flex flex-col gap-3">
            {lista.map((s) => (
              <Link key={s.id} to={`/profesor/sesiones/${s.id}`} className={`flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm hover:border-marca ${s.fecha === hoy ? 'border-marca' : 'border-borde'}`}>
                <div className="flex w-20 flex-col items-center rounded-xl bg-fondo py-2">
                  <span className="text-sm font-bold text-texto-2 uppercase">{new Date(`${s.fecha}T12:00`).toLocaleDateString('es-ES', { month: 'short' })}</span>
                  <span className="font-titulo text-2xl font-bold">{Number(s.fecha.slice(8))}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-texto-2">{s.id} · {horario(s)}</p>
                  <p className="text-lg font-bold">{s.titulo}</p>
                  {s.tema_id && <p className="text-texto-2">{s.tema_id} · {s.tema_titulo}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {s.registrados > 0 && <span className="text-texto-2">{s.presentes}/{s.registrados} presentes</span>}
                  {s.fecha === hoy && <Chip estado="Hoy" />}
                  <Chip estado={s.estado === 'cerrada' ? 'Cerrada' : 'Planificada'} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </ConDatos>
      <Modal abierto={modal === 'nueva'} cerrar={() => setModal(null)} titulo="Nueva sesión">
        <FormSesion cerrar={() => setModal(null)} guardado={(s) => navegar(`/profesor/sesiones/${s.id}`)} />
      </Modal>
    </>
  );
}

const ESTADOS = [['Presente', 'check_circle'], ['Retraso', 'schedule'], ['Ausente', 'cancel'], ['Justificada', 'description']];

export function PasarLista() {
  const { id } = useParams();
  const consulta = useApi(`/sesiones/${id}/asistencia`);
  const avisar = useAviso();
  const navegar = useNavigate();
  const [lista, setLista] = useState([]);
  const [editar, setEditar] = useState(false);
  const [cierre, setCierre] = useState(false);
  const [obs, setObs] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (consulta.datos) setLista(consulta.datos.alumnos.map((a) => ({ ...a, estado: a.estado || (a.entrada ? 'Presente' : null) })));
  }, [consulta.datos]);

  const marcar = (alumnoId, campo, valor) => setLista((l) => l.map((a) => (a.alumno_id === alumnoId ? { ...a, [campo]: valor } : a)));

  async function guardar() {
    const registros = lista.filter((a) => a.estado).map(({ alumno_id, estado, minutos_retraso, observaciones }) => ({ alumno_id, estado, minutos_retraso, observaciones }));
    if (!registros.length) return avisar('Marca al menos a un alumno.', 'error');
    setGuardando(true);
    try {
      await api.put(`/sesiones/${id}/asistencia`, { registros });
      avisar('Asistencia guardada.');
      consulta.recargar();
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function cerrarSesion() {
    try {
      await api.post(`/sesiones/${id}/cerrar`, { observaciones: obs });
      avisar('Sesión cerrada. El resumen se ha enviado al diario.');
      setCierre(false);
      consulta.recargar();
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  async function borrar() {
    if (!confirm('¿Borrar esta sesión y su asistencia? No se puede deshacer.')) return;
    try {
      await api.del(`/sesiones/${id}`);
      avisar('Sesión borrada.');
      navegar('/profesor/sesiones');
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  return (
    <ConDatos consulta={consulta}>
      {({ sesion }) => {
        const marcados = lista.filter((a) => a.estado).length;
        return (
          <>
            <Link to="/profesor/sesiones" className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-marca-oscuro"><Icono nombre="arrow_back" />Sesiones</Link>
            <Tarjeta className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-texto-2">{sesion.id} · {fechaLarga(sesion.fecha)} · {horario(sesion)}</p>
                <h1 className="mt-1 text-3xl font-bold">{sesion.titulo}</h1>
                {sesion.tema_id && <p className="text-texto-2">{sesion.tema_id} · {sesion.tema_titulo}</p>}
                <div className="mt-2"><Chip estado={sesion.estado === 'cerrada' ? 'Cerrada' : 'Planificada'} /></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Boton variante="neutro" icono="edit" pequeno onClick={() => setEditar(true)}>Editar</Boton>
                <Boton variante="neutro" icono="delete" pequeno onClick={borrar}>Borrar</Boton>
                {sesion.estado !== 'cerrada' && <Boton variante="secundario" icono="lock" pequeno onClick={() => setCierre(true)}>Cerrar sesión de clase</Boton>}
              </div>
            </Tarjeta>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">Pasar lista <span className="text-lg font-normal text-texto-2">({marcados} de {lista.length})</span></h2>
              <Boton variante="texto" icono="done_all" onClick={() => setLista((l) => l.map((a) => ({ ...a, estado: a.estado || 'Presente' })))}>Marcar el resto como presentes</Boton>
            </div>

            {lista.length === 0 ? <Vacio icono="group_add" titulo="No hay alumnos activos" /> : (
              <div className="flex flex-col gap-3">
                {lista.map((a) => (
                  <Tarjeta key={a.alumno_id} className="p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <Avatar nombre={a.nombre} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{a.nombre}</p>
                        <p className="text-sm text-texto-2">{a.alumno_id} · {a.entrada ? `fichó a las ${hora(a.entrada)}${a.salida ? `, salió a las ${hora(a.salida)}` : ''}` : 'no ha fichado'}{a.origen === 'fichaje' ? ' · marcado por fichaje' : ''}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {ESTADOS.map(([estado, icono]) => (
                        <button key={estado} type="button" onClick={() => marcar(a.alumno_id, 'estado', estado)} aria-pressed={a.estado === estado}
                          className={`flex min-h-13 items-center justify-center gap-1.5 rounded-xl border-2 font-bold ${a.estado === estado
                            ? estado === 'Ausente' ? 'border-marca bg-marca text-white' : estado === 'Presente' ? 'border-revisado-texto bg-revisado-texto text-white' : estado === 'Retraso' ? 'border-amarillo-borde bg-amarillo text-negro' : 'border-entregado-texto bg-entregado-texto text-white'
                            : 'border-borde bg-white hover:bg-fondo'}`}>
                          <Icono nombre={icono} />{estado}
                        </button>
                      ))}
                    </div>
                    {a.estado === 'Retraso' && <Campo className="mt-3" etiqueta="Minutos de retraso" tipo="number" min="0" value={a.minutos_retraso ?? ''} onChange={(e) => marcar(a.alumno_id, 'minutos_retraso', e.target.value)} />}
                    {(a.estado === 'Justificada' || a.observaciones) && <Campo className="mt-3" etiqueta="Observaciones" value={a.observaciones ?? ''} onChange={(e) => marcar(a.alumno_id, 'observaciones', e.target.value)} />}
                  </Tarjeta>
                ))}
              </div>
            )}
            <div className="sticky bottom-4 mt-5">
              <Boton className="w-full shadow-lg" icono="save" cargando={guardando} onClick={guardar}>Guardar asistencia</Boton>
            </div>

            <Modal abierto={editar} cerrar={() => setEditar(false)} titulo={`Editar ${sesion.id}`}>
              <FormSesion sesion={sesion} cerrar={() => setEditar(false)} guardado={() => { setEditar(false); consulta.recargar(); }} />
            </Modal>
            <Modal abierto={cierre} cerrar={() => setCierre(false)} titulo="Cerrar la sesión de clase">
              <p className="mb-4 text-texto-2">Se marcará como cerrada y n8n enviará el resumen (asistencia y dificultades) al diario del profesor en Notion.</p>
              <Campo tipo="area" etiqueta="Observaciones de la clase" placeholder="Qué ha ido bien, qué hay que repasar la próxima vez…" value={obs} onChange={(e) => setObs(e.target.value)} />
              <div className="mt-4 flex justify-end gap-3">
                <Boton variante="neutro" onClick={() => setCierre(false)}>Cancelar</Boton>
                <Boton icono="lock" onClick={cerrarSesion}>Cerrar sesión</Boton>
              </div>
            </Modal>
          </>
        );
      }}
    </ConDatos>
  );
}
