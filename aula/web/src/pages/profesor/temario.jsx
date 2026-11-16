import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Boton, Campo, Chip, ConDatos, Icono, Markdown, Modal, Pestanas, Tarjeta, Titulo, useAviso } from '../../components/ui.jsx';
import { api, useApi } from '../../lib/api.js';
import { fechaCorta } from '../../lib/formato.js';

const PLANTILLA_TEMA = '## Qué aprenderás\n\n\n\n## Lo que necesitas saber\n\n\n\n## Antes de practicar\n\n';
const PLANTILLA_EJERCICIO = '## Situación\n\n\n\n## Pasos\n\n1. \n2. \n3. \n\n## Qué tienes que entregar\n\n\n\n## Comprueba tu trabajo\n\n- \n- \n';

function EditorMarkdown({ etiqueta, valor, cambiar }) {
  const [vista, setVista] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-bold">{etiqueta}</span>
        <Boton variante="texto" icono={vista ? 'edit' : 'visibility'} onClick={() => setVista(!vista)}>{vista ? 'Editar' : 'Vista previa'}</Boton>
      </div>
      {vista
        ? <div className="max-h-[50vh] overflow-y-auto rounded-xl border-2 border-borde p-4"><Markdown texto={valor} /></div>
        : <textarea className="min-h-72 w-full rounded-xl border-2 border-borde p-4 font-mono text-base focus:border-marca focus:outline-none" value={valor} onChange={(e) => cambiar(e.target.value)} />}
      <p className="text-sm text-texto-2">Usa ## para los apartados, 1. para pasos numerados y - para listas.</p>
    </div>
  );
}

function FormUnidad({ unidad, cerrar, guardado }) {
  const avisar = useAviso();
  const [f, setF] = useState(unidad || { id: '', titulo: '', orden: 0 });
  async function guardar(e) {
    e.preventDefault();
    try {
      unidad ? await api.put(`/unidades/${unidad.id}`, f) : await api.post('/unidades', f);
      avisar('Unidad guardada.');
      guardado();
    } catch (err) {
      avisar(err.message, 'error');
    }
  }
  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Campo etiqueta="Código" placeholder="U08" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} required />
        <Campo etiqueta="Título" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} required />
      </div>
      <Campo etiqueta="Orden" tipo="number" value={f.orden} onChange={(e) => setF({ ...f, orden: e.target.value })} />
      <div className="flex justify-end gap-3"><Boton variante="neutro" onClick={cerrar}>Cancelar</Boton><Boton type="submit">Guardar</Boton></div>
    </form>
  );
}

function FormTema({ tema, unidades, cerrar, guardado }) {
  const avisar = useAviso();
  const archivo = useRef(null);
  const [f, setF] = useState(() => tema
    ? { ...tema, objetivo: tema.objetivo ?? '', doc_url: tema.doc_url ?? '', minutos: tema.minutos ?? '' }
    : { id: '', unidad_id: unidades[0]?.id || '', titulo: '', objetivo: '', contenido: PLANTILLA_TEMA, doc_url: '', minutos: 15, visible: true, orden: 0 });
  const [subiendo, setSubiendo] = useState(false);
  const c = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function guardar(e) {
    e.preventDefault();
    try {
      tema ? await api.put(`/temas/${tema.id}`, f) : await api.post('/temas', f);
      avisar('Tema guardado.');
      guardado();
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  async function subir(e) {
    const file = e.target.files[0];
    if (!file) return;
    setSubiendo(true);
    const datos = new FormData();
    datos.append('archivo', file);
    try {
      const r = await api.post(`/temas/${tema.id}/archivo`, datos);
      setF({ ...f, archivo_nombre: r.archivo_nombre });
      avisar('Archivo subido. El alumnado ya puede descargarlo.');
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarArchivo() {
    await api.del(`/temas/${tema.id}/archivo`);
    setF({ ...f, archivo_nombre: null });
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[110px_1fr_1fr]">
        <Campo etiqueta="Código" placeholder="T21" value={f.id} onChange={c('id')} required />
        <Campo etiqueta="Unidad" tipo="select" value={f.unidad_id} onChange={c('unidad_id')}>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.id} · {u.titulo}</option>)}
        </Campo>
        <Campo etiqueta="Minutos de lectura" tipo="number" value={f.minutos} onChange={c('minutos')} />
      </div>
      <Campo etiqueta="Título" value={f.titulo} onChange={c('titulo')} required />
      <Campo etiqueta="Qué aprenderán (resumen)" value={f.objetivo} onChange={c('objetivo')} />
      <EditorMarkdown etiqueta="Contenido del tema" valor={f.contenido} cambiar={(v) => setF({ ...f, contenido: v })} />
      <Campo etiqueta="Ficha original en Google Docs (opcional)" value={f.doc_url} onChange={c('doc_url')} />
      {tema && (
        <div className="rounded-xl border-2 border-dashed border-borde p-4">
          <p className="font-bold">Material descargable propio</p>
          <p className="mb-3 text-sm text-texto-2">Además del PDF y Word que se generan solos, puedes subir tu propio archivo (presentación, PDF…).</p>
          <input ref={archivo} type="file" className="hidden" onChange={subir} />
          {f.archivo_nombre
            ? <div className="flex flex-wrap items-center gap-3"><Chip estado="Revisado">{f.archivo_nombre}</Chip><Boton variante="texto" onClick={quitarArchivo}>Quitar</Boton></div>
            : <Boton variante="neutro" icono="upload" pequeno cargando={subiendo} onClick={() => archivo.current.click()}>Subir archivo</Boton>}
        </div>
      )}
      <label className="flex items-center gap-3 font-bold"><input type="checkbox" className="size-6 accent-marca" checked={f.visible} onChange={c('visible')} />Visible para el alumnado</label>
      <div className="flex justify-end gap-3"><Boton variante="neutro" onClick={cerrar}>Cancelar</Boton><Boton type="submit">Guardar tema</Boton></div>
    </form>
  );
}

function FormEjercicio({ ejercicio, temaId, temas, cerrar, guardado }) {
  const avisar = useAviso();
  const [f, setF] = useState(() => ejercicio
    ? { ...ejercicio, entrega: ejercicio.entrega ?? '', minutos: ejercicio.minutos ?? '', fecha_limite: ejercicio.fecha_limite ?? '', doc_url: ejercicio.doc_url ?? '' }
    : { id: `${temaId}_E0`, tema_id: temaId, titulo: '', enunciado: PLANTILLA_EJERCICIO, entrega: '', minutos: '20–35 min', fecha_limite: '', doc_url: '', visible: true });
  const c = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function guardar(e) {
    e.preventDefault();
    try {
      ejercicio ? await api.put(`/ejercicios/${ejercicio.id}`, f) : await api.post('/ejercicios', f);
      avisar('Ejercicio guardado.');
      guardado();
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Código" placeholder="T01_E02" value={f.id} onChange={c('id')} required />
        <Campo etiqueta="Tema" tipo="select" value={f.tema_id} onChange={c('tema_id')}>
          {temas.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.titulo}</option>)}
        </Campo>
      </div>
      <Campo etiqueta="Título" value={f.titulo} onChange={c('titulo')} required />
      <EditorMarkdown etiqueta="Enunciado" valor={f.enunciado} cambiar={(v) => setF({ ...f, enunciado: v })} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Qué entregan" placeholder="T01_Prueba.docx" value={f.entrega} onChange={c('entrega')} />
        <Campo etiqueta="Tiempo orientativo" value={f.minutos} onChange={c('minutos')} />
        <Campo etiqueta="Fecha límite" tipo="date" value={f.fecha_limite} onChange={c('fecha_limite')} ayuda="Aparece en el calendario." />
      </div>
      <label className="flex items-center gap-3 font-bold"><input type="checkbox" className="size-6 accent-marca" checked={f.visible} onChange={c('visible')} />Visible para el alumnado</label>
      <div className="flex justify-end gap-3"><Boton variante="neutro" onClick={cerrar}>Cancelar</Boton><Boton type="submit">Guardar ejercicio</Boton></div>
    </form>
  );
}

/** Tarjeta de una unidad: cabecera común y el contenido de cada sección */
function TarjetaUnidad({ unidad, resumen, acciones, children }) {
  return (
    <Tarjeta className="flex flex-col p-0">
      <div className="flex items-center gap-3 border-b border-borde p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-marca-suave font-titulo font-bold text-marca-oscuro">{unidad.id}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{unidad.titulo}</h2>
          <p className="text-texto-2">{resumen}</p>
        </div>
        {acciones}
      </div>
      {children}
    </Tarjeta>
  );
}

export function EditorTemario() {
  const consulta = useApi('/unidades');
  const avisar = useAviso();
  const [params, setParams] = useSearchParams();
  const seccion = params.get('seccion') === 'ejercicios' ? 'ejercicios' : 'temario';
  const [modal, setModal] = useState(null); // { tipo, datos }
  const cerrar = () => setModal(null);
  const guardado = () => { cerrar(); consulta.recargar(); };

  async function abrirTema(id) {
    try {
      setModal({ tipo: 'tema', datos: await api.get(`/temas/${id}`) });
    } catch (err) {
      avisar(err.message, 'error');
    }
  }
  async function abrirEjercicio(id) {
    try {
      setModal({ tipo: 'ejercicio', datos: await api.get(`/ejercicios/${id}`) });
    } catch (err) {
      avisar(err.message, 'error');
    }
  }
  async function borrar(ruta, que) {
    if (!confirm(`¿Borrar ${que}? No se puede deshacer.`)) return;
    try {
      await api.del(ruta);
      avisar('Borrado.');
      consulta.recargar();
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  return (
    <>
      <Titulo titulo="Temario y ejercicios" subtitulo="Edita el contenido que ve el alumnado. Lo que marques como oculto no les aparece." accion={
        seccion === 'temario' ? (
          <div className="flex gap-2">
            <Boton variante="secundario" icono="add" onClick={() => setModal({ tipo: 'unidad' })}>Añadir unidad</Boton>
            <Boton icono="add" onClick={() => setModal({ tipo: 'tema' })}>Añadir tema</Boton>
          </div>
        ) : (
          <Boton icono="add" onClick={() => setModal({ tipo: 'ejercicio', temaId: consulta.datos?.[0]?.temas[0]?.id })}>Añadir ejercicio</Boton>
        )
      } />
      <ConDatos consulta={consulta}>
        {(unidades) => {
          const temas = unidades.flatMap((u) => u.temas);
          const nEjercicios = temas.reduce((n, t) => n + t.ejercicios.length, 0);
          return (
            <>
              <Pestanas valor={seccion} cambiar={(v) => setParams(v === 'temario' ? {} : { seccion: v }, { replace: true })} opciones={[
                ['temario', `Temario (${temas.length} temas)`],
                ['ejercicios', `Ejercicios (${nEjercicios})`],
              ]} />

              {seccion === 'temario' && (
                <div className="grid gap-5 lg:grid-cols-2">
                  {unidades.map((u) => (
                    <TarjetaUnidad key={u.id} unidad={u} resumen={u.temas.length === 1 ? '1 tema' : `${u.temas.length} temas`} acciones={
                      <div className="flex">
                        <Boton variante="texto" icono="edit" onClick={() => setModal({ tipo: 'unidad', datos: u })} aria-label={`Editar ${u.id}`} title="Editar unidad" />
                        <Boton variante="texto" icono="delete" onClick={() => borrar(`/unidades/${u.id}`, `la unidad ${u.id}`)} aria-label={`Borrar ${u.id}`} title="Borrar unidad" />
                      </div>
                    }>
                      {u.temas.length === 0 ? <p className="p-4 text-texto-2">Esta unidad todavía no tiene temas.</p> : (
                        <ul className="divide-y divide-borde">
                          {u.temas.map((t) => (
                            <li key={t.id} className="flex items-center gap-3 p-4">
                              <span className="font-titulo font-bold text-marca">{t.id}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-lg font-bold">{t.titulo}</p>
                                {(!t.visible || t.archivo_nombre) && (
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    {!t.visible && <Chip estado="Pendiente">Oculto</Chip>}
                                    {t.archivo_nombre && <Chip estado="Entregado">Con archivo</Chip>}
                                  </div>
                                )}
                              </div>
                              <div className="flex shrink-0">
                                <Boton a={`/profesor/temario/ver/${t.id}`} variante="texto" icono="visibility" aria-label={`Ver ${t.id}`} title="Ver como el alumnado" />
                                <Boton variante="texto" icono="edit" onClick={() => abrirTema(t.id)} aria-label={`Editar ${t.id}`} title="Editar tema" />
                                <Boton variante="texto" icono="delete" onClick={() => borrar(`/temas/${t.id}`, `el tema ${t.id}`)} aria-label={`Borrar ${t.id}`} title="Borrar tema" />
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TarjetaUnidad>
                  ))}
                </div>
              )}

              {seccion === 'ejercicios' && (
                <div className="grid gap-5 lg:grid-cols-2">
                  {unidades.filter((u) => u.temas.length > 0).map((u) => {
                    const n = u.temas.reduce((s, t) => s + t.ejercicios.length, 0);
                    return (
                      <TarjetaUnidad key={u.id} unidad={u} resumen={n === 1 ? '1 ejercicio' : `${n} ejercicios`}>
                        <div className="divide-y divide-borde">
                          {u.temas.map((t) => (
                            <section key={t.id} className="p-4" aria-label={`Ejercicios de ${t.id}`}>
                              <h3 className="text-sm font-bold text-texto-2 uppercase">{t.id} · {t.titulo}</h3>
                              <ul className="mt-2 flex flex-col gap-2">
                                {t.ejercicios.map((e) => (
                                  <li key={e.id} className="flex items-center gap-3 rounded-xl border border-borde p-3">
                                    <Icono nombre="edit_document" className="text-marca" />
                                    <div className="min-w-0 flex-1">
                                      <p className="font-bold">{e.titulo.replace('Práctica: ', '')}</p>
                                      <p className="text-sm text-texto-2">{e.id}{e.fecha_limite && ` · hasta el ${fechaCorta(e.fecha_limite)}`}</p>
                                      {!e.visible && <Chip estado="Pendiente" className="mt-1">Oculto</Chip>}
                                    </div>
                                    <div className="flex shrink-0">
                                      <Boton variante="texto" icono="edit" onClick={() => abrirEjercicio(e.id)} aria-label={`Editar ${e.id}`} title="Editar ejercicio" />
                                      <Boton variante="texto" icono="delete" onClick={() => borrar(`/ejercicios/${e.id}`, `el ejercicio ${e.id}`)} aria-label={`Borrar ${e.id}`} title="Borrar ejercicio" />
                                    </div>
                                  </li>
                                ))}
                                <li><Boton variante="texto" icono="add" onClick={() => setModal({ tipo: 'ejercicio', temaId: t.id })}>Añadir ejercicio a {t.id}</Boton></li>
                              </ul>
                            </section>
                          ))}
                        </div>
                      </TarjetaUnidad>
                    );
                  })}
                </div>
              )}

              <Modal abierto={modal?.tipo === 'unidad'} cerrar={cerrar} titulo={modal?.datos ? 'Editar unidad' : 'Nueva unidad'}>
                <FormUnidad unidad={modal?.datos} cerrar={cerrar} guardado={guardado} />
              </Modal>
              <Modal abierto={modal?.tipo === 'tema'} cerrar={cerrar} titulo={modal?.datos ? `Editar ${modal.datos.id}` : 'Nuevo tema'} ancho="max-w-3xl">
                <FormTema key={modal?.datos?.id || 'nuevo'} tema={modal?.datos} unidades={unidades} cerrar={cerrar} guardado={guardado} />
              </Modal>
              <Modal abierto={modal?.tipo === 'ejercicio'} cerrar={cerrar} titulo={modal?.datos ? `Editar ${modal.datos.id}` : 'Nuevo ejercicio'} ancho="max-w-3xl">
                <FormEjercicio key={modal?.datos?.id || modal?.temaId} ejercicio={modal?.datos} temaId={modal?.temaId} temas={temas} cerrar={cerrar} guardado={guardado} />
              </Modal>
            </>
          );
        }}
      </ConDatos>
    </>
  );
}
