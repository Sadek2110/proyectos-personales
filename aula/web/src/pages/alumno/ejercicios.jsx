import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Boton, Campo, Chip, ConDatos, Icono, Markdown, Pestanas, Tarjeta, Titulo, Vacio, useAviso } from '../../components/ui.jsx';
import { api, useApi } from '../../lib/api.js';
import { fechaCorta, fechaHora, NIVELES, nota } from '../../lib/formato.js';

const estadoVisible = (e) => e.estado || 'Pendiente';

export function Ejercicios() {
  const consulta = useApi('/alumno/ejercicios');
  const [filtro, setFiltro] = useState('Pendiente');
  return (
    <>
      <Titulo titulo="Mis ejercicios" subtitulo="Haz las prácticas de cada tema y envía tu trabajo para que el profesor lo revise." />
      <ConDatos consulta={consulta}>
        {(lista) => {
          const cuenta = (est) => lista.filter((e) => estadoVisible(e) === est).length;
          const visibles = lista.filter((e) => estadoVisible(e) === filtro);
          return (
            <>
              <Pestanas valor={filtro} cambiar={setFiltro} opciones={[
                ['Pendiente', `Pendientes (${cuenta('Pendiente')})`],
                ['Entregado', `Entregados (${cuenta('Entregado')})`],
                ['Revisado', `Corregidos (${cuenta('Revisado')})`],
              ]} />
              {visibles.length === 0 && <Vacio icono="task_alt" titulo={filtro === 'Pendiente' ? 'No tienes ejercicios pendientes' : 'Todavía no hay ejercicios aquí'} />}
              <div className="flex flex-col gap-3">
                {visibles.map((e) => (
                  <Link key={e.id} to={`/ejercicios/${e.id}`} className="rounded-2xl border border-borde bg-white p-4 shadow-sm hover:border-marca">
                    <div className="flex items-center justify-between gap-2">
                      <Chip estado={estadoVisible(e)}>{e.estado === 'Revisado' ? 'Corregido' : e.estado === 'Entregado' ? 'Entregado · en revisión' : 'Pendiente'}</Chip>
                      <span className="text-sm font-bold text-texto-2">Tema {e.tema_id.slice(1)}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-bold">{e.id} · {e.titulo.replace('Práctica: ', '')}</h2>
                    <p className="mt-1 flex items-center gap-2 text-texto-2"><Icono nombre="description" className="text-marca" />Entregar: {e.entrega}</p>
                    {e.fecha_limite && !e.estado && <p className="flex items-center gap-2 font-bold text-marca-oscuro"><Icono nombre="event_busy" />Hasta el {fechaCorta(e.fecha_limite)}</p>}
                    {e.estado === 'Revisado' && (
                      <p className="mt-2 flex items-center gap-4 border-t border-borde pt-2">
                        <span>Nota: <strong className="text-marca-oscuro">{nota(e.nota_10)} / 10</strong></span>
                        {e.nivel_autonomia && <span>Autonomía: <strong>{NIVELES[e.nivel_autonomia]}</strong></span>}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </>
          );
        }}
      </ConDatos>
    </>
  );
}

function Entregar({ ejercicio, alEntregar }) {
  const avisar = useAviso();
  const camara = useRef(null);
  const archivoRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!archivo) return;
    setEnviando(true);
    const datos = new FormData();
    datos.append('archivo', archivo);
    datos.append('mensaje', mensaje);
    try {
      await api.post(`/alumno/ejercicios/${ejercicio.id}/entregas`, datos);
      avisar('¡Entregado! El profesor lo revisará pronto.');
      setArchivo(null);
      setMensaje('');
      alEntregar();
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tarjeta>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold"><Icono nombre="upload_file" className="text-marca" />Entregar tu trabajo</h2>
      <p className="mb-4 text-texto-2">Sube el archivo de Word o Excel, o haz una foto clara de la pantalla.</p>
      <input ref={archivoRef} type="file" className="hidden" accept=".docx,.doc,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.heic,.zip,.txt,.odt,.ods" onChange={(e) => setArchivo(e.target.files[0] || null)} />
      <input ref={camara} type="file" className="hidden" accept="image/*" capture="environment" onChange={(e) => setArchivo(e.target.files[0] || null)} />
      {archivo ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border-2 border-revisado-texto/40 bg-revisado p-4">
          <Icono nombre="draft" className="text-2xl text-revisado-texto" />
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{archivo.name}</p><p className="text-sm text-texto-2">{Math.ceil(archivo.size / 1024)} KB · listo para enviar</p></div>
          <Boton variante="texto" onClick={() => setArchivo(null)}>Quitar</Boton>
        </div>
      ) : (
        <div className="mb-4 grid gap-3 rounded-xl border-2 border-dashed border-marca-borde bg-marca-suave/40 p-4 sm:grid-cols-2">
          <Boton variante="neutro" icono="folder_open" onClick={() => archivoRef.current.click()}>Buscar archivo</Boton>
          <Boton variante="neutro" icono="photo_camera" onClick={() => camara.current.click()}>Hacer una foto</Boton>
        </div>
      )}
      <Campo tipo="area" etiqueta="Mensaje para el profesor (opcional)" placeholder="Si tuviste alguna duda o dificultad, escríbela aquí." value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
      <Boton className="mt-4 w-full" icono="send" cargando={enviando} disabled={!archivo} onClick={enviar}>Enviar entrega</Boton>
    </Tarjeta>
  );
}

export function Ejercicio() {
  const { id } = useParams();
  const consulta = useApi(`/ejercicios/${id}`);
  const entregas = useApi(`/alumno/ejercicios/${id}/entregas`);

  return (
    <ConDatos consulta={consulta}>
      {(e) => {
        const ultima = entregas.datos?.[0];
        return (
          <article className="flex flex-col gap-5">
            <div>
              <Link to="/ejercicios" className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-marca-oscuro"><Icono nombre="arrow_back" />Mis ejercicios</Link>
              <p className="text-sm font-bold text-texto-2 uppercase">{e.id} · Tema {e.tema_id.slice(1)} · {e.minutos}</p>
              <h1 className="mt-1 text-3xl font-bold">{e.titulo.replace('Práctica: ', '')}</h1>
              <div className="mt-2"><Chip estado={ultima?.estado || 'Pendiente'}>{ultima?.estado === 'Revisado' ? 'Corregido' : ultima ? 'Entregado · en revisión' : 'Pendiente'}</Chip></div>
            </div>

            {ultima?.estado === 'Revisado' && (
              <Tarjeta className="border-revisado-texto/30">
                <h2 className="mb-3 text-xl font-bold">Corrección del profesor</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-fondo p-3"><p className="text-sm font-bold text-texto-2">Nota</p><p className="font-titulo text-2xl font-bold text-marca-oscuro">{nota(ultima.nota_10)} <span className="text-base text-texto-2">/ 10</span></p></div>
                  <div className="rounded-xl bg-fondo p-3"><p className="text-sm font-bold text-texto-2">Autonomía</p><p className="font-bold">{NIVELES[ultima.nivel_autonomia] || '—'}</p></div>
                </div>
                {ultima.comentario && <blockquote className="mt-3 border-l-4 border-marca pl-3 text-lg italic">«{ultima.comentario}»</blockquote>}
                <p className="mt-3 text-texto-2">Si quieres mejorarlo, puedes volver a entregarlo abajo.</p>
              </Tarjeta>
            )}

            <Tarjeta>
              <Markdown texto={e.enunciado} />
              <div className="mt-2 flex flex-wrap gap-3 border-t border-borde pt-4">
                <Boton href={`/api/ejercicios/${e.id}/descargar?formato=pdf`} variante="secundario" icono="picture_as_pdf" pequeno download>Enunciado en PDF</Boton>
                <Boton href={`/api/ejercicios/${e.id}/descargar?formato=docx`} variante="secundario" icono="description" pequeno download>Enunciado en Word</Boton>
              </div>
            </Tarjeta>

            <Entregar ejercicio={e} alEntregar={() => { entregas.recargar(); }} />

            {entregas.datos?.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-bold">Tus entregas</h2>
                <div className="flex flex-col gap-2">
                  {entregas.datos.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-xl border border-borde bg-white p-3">
                      <Icono nombre="history" className="text-texto-2" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">Intento {r.intento} · {fechaHora(r.fecha)}</p>
                        <a href={`/api/alumno/entregas/${encodeURIComponent(r.id)}/archivo`} className="block truncate text-marca-oscuro underline">{r.archivo_nombre}</a>
                      </div>
                      <Chip estado={r.estado}>{r.estado === 'Revisado' ? `${nota(r.nota_10)}/10` : 'En revisión'}</Chip>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </article>
        );
      }}
    </ConDatos>
  );
}
