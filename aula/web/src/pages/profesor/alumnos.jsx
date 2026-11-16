import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Avatar, Boton, Campo, Chip, ConDatos, Icono, Modal, Pestanas, Tarjeta, Titulo, Vacio, useAviso } from '../../components/ui.jsx';
import { api, useApi } from '../../lib/api.js';
import { fechaCorta, fechaHora, hora, NIVELES, nota } from '../../lib/formato.js';
import { useSesion } from '../../lib/sesion.jsx';

function Copiar({ texto }) {
  const avisar = useAviso();
  return (
    <Boton variante="suave" icono="content_copy" pequeno onClick={async () => {
      await navigator.clipboard.writeText(texto);
      avisar('Enlace copiado.');
    }}>Copiar enlace</Boton>
  );
}

function Invitar({ cerrar, alInvitar }) {
  const avisar = useAviso();
  const { usuario } = useSesion();
  const [emails, setEmails] = useState('');
  const [grupo, setGrupo] = useState('');
  const [rol, setRol] = useState('alumno');
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const lista = emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

  async function enviar() {
    setEnviando(true);
    try {
      const r = await api.post('/invitaciones', { emails: lista, grupo, rol });
      setResultado(r);
      alInvitar();
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 rounded-xl bg-revisado p-4 text-revisado-texto"><Icono nombre="check_circle" />
          {resultado.creadas.length} invitación(es) creadas. n8n enviará el correo por Gmail. Si quieres, también puedes copiar cada enlace y mandarlo por WhatsApp.</p>
        {resultado.omitidas.length > 0 && <p className="rounded-xl bg-pendiente p-4 text-pendiente-texto">Ya tienen cuenta: {resultado.omitidas.join(', ')}</p>}
        <ul className="flex flex-col gap-2">
          {resultado.creadas.map((c) => (
            <li key={c.email} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-borde p-3">
              <span className="font-bold break-all">{c.email}</span><Copiar texto={c.enlace} />
            </li>
          ))}
        </ul>
        <Boton onClick={cerrar}>Hecho</Boton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-texto-2">El alumno recibe un enlace para crear su cuenta. Caduca en 7 días.</p>
      <Campo tipo="area" etiqueta="Correos electrónicos (uno por línea)" placeholder={'carmen.ruiz@gmail.com\njose.martin@gmail.com'} value={emails} onChange={(e) => setEmails(e.target.value)} ayuda={lista.length ? `${lista.length} correo(s)` : undefined} />
      <Campo etiqueta="Grupo (opcional)" placeholder="Mañanas" value={grupo} onChange={(e) => setGrupo(e.target.value)} />
      {usuario.rol === 'admin' && (
        <Campo etiqueta="Invitar como" tipo="select" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="alumno">Alumno</option><option value="profesor">Profesor</option>
        </Campo>
      )}
      <div className="flex justify-end gap-3">
        <Boton variante="neutro" onClick={cerrar}>Cancelar</Boton>
        <Boton icono="send" cargando={enviando} disabled={!lista.length} onClick={enviar}>Enviar invitaciones</Boton>
      </div>
    </div>
  );
}

export function Alumnos() {
  const consulta = useApi('/alumnos');
  const invitaciones = useApi('/invitaciones');
  const avisar = useAviso();
  const [vista, setVista] = useState('alumnos');
  const [invitar, setInvitar] = useState(false);
  const [buscar, setBuscar] = useState('');

  async function anular(token) {
    if (!confirm('¿Anular esta invitación?')) return;
    try {
      await api.del(`/invitaciones/${token}`);
      invitaciones.recargar();
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  const pendientes = (invitaciones.datos?.invitaciones || []).filter((i) => !i.usada_en && new Date(i.expira_en) > new Date());

  return (
    <>
      <Titulo titulo="Alumnos e invitaciones" subtitulo="Invita al alumnado por correo y consulta cómo va cada uno." accion={<Boton icono="person_add" onClick={() => setInvitar(true)}>Invitar por Gmail</Boton>} />
      <Pestanas valor={vista} cambiar={setVista} opciones={[['alumnos', `Matriculados (${consulta.datos?.length ?? '…'})`], ['invitaciones', `Invitaciones pendientes (${pendientes.length})`]]} />

      {vista === 'alumnos' ? (
        <ConDatos consulta={consulta}>
          {(lista) => {
            const filtrados = lista.filter((a) => `${a.nombre} ${a.email} ${a.alumno_id}`.toLowerCase().includes(buscar.toLowerCase()));
            return lista.length === 0 ? <Vacio icono="group_add" titulo="Todavía no hay alumnos">Pulsa «Invitar por Gmail» para enviar las invitaciones.</Vacio> : (
              <>
                <Campo className="mb-4" placeholder="Buscar por nombre, correo o ID" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
                <div className="overflow-x-auto rounded-2xl border border-borde bg-white shadow-sm">
                  <table className="w-full min-w-[720px] text-left">
                    <thead className="border-b border-borde bg-fondo text-sm text-texto-2 uppercase">
                      <tr><th className="px-4 py-3">Alumno</th><th className="px-3 py-3">Grupo</th><th className="px-3 py-3">Asistencia</th><th className="px-3 py-3">Entregados</th><th className="px-3 py-3">Nota media</th><th className="px-4 py-3">Estado</th></tr>
                    </thead>
                    <tbody>
                      {filtrados.map((a) => (
                        <tr key={a.alumno_id} className="border-b border-borde last:border-0 hover:bg-fondo/60">
                          <td className="px-4 py-3"><Link to={`/profesor/alumnos/${a.alumno_id}`} className="flex items-center gap-3"><Avatar nombre={a.nombre} className="size-9 text-sm" /><span><span className="block font-bold text-marca-oscuro underline-offset-4 hover:underline">{a.nombre}</span><span className="text-sm text-texto-2">{a.alumno_id} · {a.email}</span></span></Link></td>
                          <td className="px-3 py-3">{a.grupo || '—'}</td>
                          <td className="px-3 py-3">{a.sesiones_registradas ? `${Math.round((a.asistencias / a.sesiones_registradas) * 100)} % (${a.asistencias}/${a.sesiones_registradas})` : '—'}</td>
                          <td className="px-3 py-3">{a.ejercicios_entregados}</td>
                          <td className="px-3 py-3 font-bold">{nota(a.media_nota_10)}</td>
                          <td className="px-4 py-3"><Chip estado={a.estado === 'activo' ? 'Presente' : 'Ausente'}>{a.estado === 'activo' ? 'Activo' : 'Baja'}</Chip></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          }}
        </ConDatos>
      ) : (
        <ConDatos consulta={invitaciones}>
          {(d) => (
            <>
              {!d.n8n && !d.smtp && (
                <p className="mb-4 flex items-start gap-2 rounded-xl bg-pendiente p-4 text-pendiente-texto"><Icono nombre="warning" />
                  Todavía no hay n8n ni SMTP conectados, así que los correos no salen solos. Copia cada enlace y envíalo tú.</p>
              )}
              {pendientes.length === 0 ? <Vacio icono="mark_email_read" titulo="No hay invitaciones pendientes" /> : (
                <div className="flex flex-col gap-2">
                  {pendientes.map((i) => (
                    <Tarjeta key={i.token} className="flex flex-wrap items-center gap-3 p-4">
                      <Icono nombre={i.tipo === 'reset' ? 'lock_reset' : 'mail'} className="text-2xl text-marca" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold break-all">{i.email}</p>
                        <p className="text-sm text-texto-2">{i.tipo === 'reset' ? 'Cambio de contraseña' : `Alta de ${i.rol}`}{i.grupo ? ` · ${i.grupo}` : ''} · caduca el {fechaCorta(i.expira_en)}</p>
                      </div>
                      <Copiar texto={i.enlace} />
                      <Boton variante="texto" onClick={() => anular(i.token)}>Anular</Boton>
                    </Tarjeta>
                  ))}
                </div>
              )}
            </>
          )}
        </ConDatos>
      )}

      <Modal abierto={invitar} cerrar={() => setInvitar(false)} titulo="Invitar por Gmail">
        <Invitar cerrar={() => setInvitar(false)} alInvitar={() => invitaciones.recargar()} />
      </Modal>
    </>
  );
}

export function FichaAlumno() {
  const { alumnoId } = useParams();
  const consulta = useApi(`/alumnos/${alumnoId}`);
  const avisar = useAviso();
  const [editar, setEditar] = useState(null);
  const [enlace, setEnlace] = useState(null);

  async function guardar(e) {
    e.preventDefault();
    try {
      await api.put(`/alumnos/${alumnoId}`, editar);
      avisar('Datos guardados.');
      setEditar(null);
      consulta.recargar();
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  async function reset() {
    try {
      const r = await api.post(`/alumnos/${alumnoId}/reset`);
      setEnlace(r.enlace);
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  return (
    <ConDatos consulta={consulta}>
      {(a) => (
        <>
          <Link to="/profesor/alumnos" className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-marca-oscuro"><Icono nombre="arrow_back" />Alumnos</Link>
          <Tarjeta className="mb-5 flex flex-wrap items-center gap-4">
            <Avatar nombre={a.nombre} className="size-16 text-2xl" />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold">{a.nombre}</h1>
              <p className="text-texto-2">{a.alumno_id} · {a.email}{a.grupo ? ` · Grupo ${a.grupo}` : ''}</p>
              {a.observaciones && <p className="mt-1">{a.observaciones}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Boton variante="neutro" icono="edit" pequeno onClick={() => setEditar({ nombre: a.nombre, grupo: a.grupo || '', estado: a.estado, observaciones: a.observaciones || '' })}>Editar</Boton>
              <Boton variante="neutro" icono="lock_reset" pequeno onClick={reset}>Enlace de contraseña</Boton>
            </div>
          </Tarjeta>
          {enlace && (
            <p className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-revisado p-4 text-revisado-texto">
              <Icono nombre="check_circle" />Enlace creado (caduca en 7 días). También se envía por correo si n8n está conectado.<Copiar texto={enlace} />
            </p>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <Tarjeta>
              <h2 className="mb-3 text-xl font-bold">Ejercicios</h2>
              {a.resultados.length === 0 ? <p className="text-texto-2">Todavía no ha entregado nada.</p> : (
                <ul className="divide-y divide-borde">
                  {a.resultados.map((r) => (
                    <li key={r.id}>
                      <Link to={`/profesor/correcciones/${encodeURIComponent(r.id)}`} className="flex items-center gap-3 py-3 hover:bg-fondo/60">
                        <div className="flex-1"><p className="font-bold">{r.ejercicio_id} · intento {r.intento}</p><p className="text-sm text-texto-2">{fechaHora(r.fecha)}{r.dificultad ? ` · ${r.dificultad}` : ''}</p></div>
                        {r.estado === 'Revisado' ? <span className="text-right"><strong className="text-marca-oscuro">{nota(r.nota_10)}</strong><span className="block text-sm text-texto-2">{NIVELES[r.nivel_autonomia] || ''}</span></span> : <Chip estado="Pendiente">Por corregir</Chip>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
            <div className="flex flex-col gap-5">
              <Tarjeta>
                <h2 className="mb-3 text-xl font-bold">Asistencia</h2>
                {a.asistencia.length === 0 ? <p className="text-texto-2">Sin registros.</p> : (
                  <ul className="divide-y divide-borde">
                    {a.asistencia.map((s) => <li key={s.id} className="flex items-center justify-between gap-3 py-2"><span><strong>{s.sesion_id}</strong> · {fechaCorta(s.fecha)}</span><Chip estado={s.estado} /></li>)}
                  </ul>
                )}
              </Tarjeta>
              <Tarjeta>
                <h2 className="mb-3 text-xl font-bold">Fichajes</h2>
                {a.fichajes.length === 0 ? <p className="text-texto-2">Sin fichajes.</p> : (
                  <ul className="divide-y divide-borde">
                    {a.fichajes.map((f) => <li key={f.fecha} className="flex justify-between py-2"><span>{fechaCorta(f.fecha)}</span><span>{hora(f.entrada)} – {f.salida ? hora(f.salida) : '…'}</span></li>)}
                  </ul>
                )}
              </Tarjeta>
            </div>
          </div>

          <Modal abierto={Boolean(editar)} cerrar={() => setEditar(null)} titulo="Editar alumno">
            {editar && (
              <form onSubmit={guardar} className="flex flex-col gap-4">
                <Campo etiqueta="Nombre y apellidos" value={editar.nombre} onChange={(e) => setEditar({ ...editar, nombre: e.target.value })} required />
                <Campo etiqueta="Grupo" value={editar.grupo} onChange={(e) => setEditar({ ...editar, grupo: e.target.value })} />
                <Campo etiqueta="Estado" tipo="select" value={editar.estado} onChange={(e) => setEditar({ ...editar, estado: e.target.value })}>
                  <option value="activo">Activo</option><option value="baja">Baja (no puede entrar)</option>
                </Campo>
                <Campo etiqueta="Observaciones (privadas)" tipo="area" value={editar.observaciones} onChange={(e) => setEditar({ ...editar, observaciones: e.target.value })} />
                <div className="flex justify-end gap-3"><Boton variante="neutro" onClick={() => setEditar(null)}>Cancelar</Boton><Boton type="submit">Guardar</Boton></div>
              </form>
            )}
          </Modal>
        </>
      )}
    </ConDatos>
  );
}
