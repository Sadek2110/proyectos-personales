import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Boton, Campo, Chip, ConDatos, Icono, Markdown, Pestanas, Tarjeta, Titulo, Vacio, useAviso } from '../../components/ui.jsx';
import { api, useApi } from '../../lib/api.js';
import { fechaHora, hace, NIVELES, nota } from '../../lib/formato.js';

export function Correcciones() {
  const [estado, setEstado] = useState('Entregado');
  const consulta = useApi(`/entregas?estado=${estado}`);
  return (
    <>
      <Titulo titulo="Correcciones" subtitulo="Revisa las entregas, pon nota, nivel de autonomía y un comentario para el alumno." />
      <Pestanas valor={estado} cambiar={setEstado} opciones={[['Entregado', 'Por corregir'], ['Revisado', 'Corregidas']]} />
      <ConDatos consulta={consulta}>
        {(lista) => lista.length === 0 ? <Vacio icono="task_alt" titulo={estado === 'Entregado' ? 'No hay entregas por corregir' : 'Aún no has corregido nada'} /> : (
          <div className="flex flex-col gap-3">
            {lista.map((r) => (
              <Link key={r.id} to={`/profesor/correcciones/${encodeURIComponent(r.id)}`} className="flex flex-wrap items-center gap-4 rounded-2xl border border-borde bg-white p-4 shadow-sm hover:border-marca">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-texto-2">{r.id}</p>
                  <p className="text-lg font-bold">{r.nombre} · {r.ejercicio_titulo.replace('Práctica: ', '')}</p>
                  <p className="text-texto-2">Intento {r.intento} · {hace(r.fecha)} · {r.archivo_nombre}</p>
                </div>
                {r.estado === 'Revisado'
                  ? <span className="font-titulo text-2xl font-bold text-marca-oscuro">{nota(r.nota_10)}</span>
                  : <span className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-marca-suave px-4 font-bold text-marca-oscuro"><Icono nombre="rate_review" />Corregir</span>}
              </Link>
            ))}
          </div>
        )}
      </ConDatos>
    </>
  );
}

export function Correccion() {
  const { id } = useParams();
  const consulta = useApi(`/entregas/${encodeURIComponent(id)}`);
  const pendientes = useApi('/entregas?estado=Entregado');
  const avisar = useAviso();
  const navegar = useNavigate();
  const [f, setF] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const r = consulta.datos;
    if (r) setF({ nota_10: r.nota_10 ?? '', nivel_autonomia: r.nivel_autonomia ?? '', dificultad: r.dificultad ?? '', accion_refuerzo: r.accion_refuerzo ?? '', comentario: r.comentario ?? '' });
  }, [consulta.datos]);

  async function guardar() {
    setGuardando(true);
    try {
      await api.put(`/entregas/${encodeURIComponent(id)}/correccion`, f);
      avisar('Corrección guardada. El alumno ya puede verla.');
      const siguiente = (pendientes.datos || []).find((r) => r.id !== id);
      navegar(siguiente ? `/profesor/correcciones/${encodeURIComponent(siguiente.id)}` : '/profesor/correcciones');
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ConDatos consulta={consulta}>
      {(r) => f && (
        <>
          <Link to="/profesor/correcciones" className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-marca-oscuro"><Icono nombre="arrow_back" />Correcciones</Link>
          <div className="mb-5">
            <p className="text-sm font-bold text-texto-2">{r.id}</p>
            <h1 className="text-3xl font-bold">{r.nombre} · {r.ejercicio_titulo.replace('Práctica: ', '')}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip estado={r.estado}>{r.estado === 'Revisado' ? 'Corregido' : 'Por corregir'}</Chip>
              <Chip estado="Entregado">Intento {r.intento} · {fechaHora(r.fecha)}</Chip>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
            <div className="flex flex-col gap-5">
              <Tarjeta>
                <h2 className="mb-3 text-xl font-bold">Archivo entregado</h2>
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-fondo p-4">
                  <Icono nombre="draft" className="text-3xl text-marca" />
                  <div className="min-w-0 flex-1"><p className="truncate font-bold">{r.archivo_nombre}</p><p className="text-sm text-texto-2">Se esperaba: {r.entrega_esperada}</p></div>
                  {r.tiene_archivo && <Boton href={`/api/entregas/${encodeURIComponent(r.id)}/archivo`} variante="secundario" icono="download" pequeno>Descargar</Boton>}
                  {r.entrega_url && <Boton href={r.entrega_url} target="_blank" rel="noreferrer" variante="secundario" icono="open_in_new" pequeno>Abrir en Drive</Boton>}
                </div>
                {r.archivo_tipo?.startsWith('image/') && r.tiene_archivo && (
                  <img src={`/api/entregas/${encodeURIComponent(r.id)}/archivo`} alt={`Foto entregada por ${r.nombre}`} className="mt-4 max-h-[480px] rounded-xl border border-borde" />
                )}
                {r.mensaje && <blockquote className="mt-4 border-l-4 border-amarillo bg-pendiente p-3"><p className="text-sm font-bold">Mensaje del alumno</p>{r.mensaje}</blockquote>}
              </Tarjeta>
              <details className="rounded-2xl border border-borde bg-white p-5 shadow-sm">
                <summary className="cursor-pointer text-xl font-bold">Enunciado del ejercicio</summary>
                <Markdown texto={r.enunciado} className="mt-3" />
              </details>
              {r.anteriores.length > 0 && (
                <Tarjeta>
                  <h2 className="mb-3 text-xl font-bold">Otros intentos</h2>
                  <ul className="divide-y divide-borde">
                    {r.anteriores.map((x) => (
                      <li key={x.id}><Link to={`/profesor/correcciones/${encodeURIComponent(x.id)}`} className="flex justify-between py-2 hover:underline"><span>Intento {x.intento} · {fechaHora(x.fecha)}</span><strong>{x.estado === 'Revisado' ? nota(x.nota_10) : 'Sin corregir'}</strong></Link></li>
                    ))}
                  </ul>
                </Tarjeta>
              )}
            </div>

            <Tarjeta className="h-fit xl:sticky xl:top-6">
              <h2 className="mb-4 text-xl font-bold">Calificación</h2>
              <div className="flex flex-col gap-4">
                <Campo etiqueta="Nota (0 a 10)" tipo="number" min="0" max="10" step="0.5" inputMode="decimal" value={f.nota_10} onChange={(e) => setF({ ...f, nota_10: e.target.value })} ayuda="Déjala vacía si no se evalúa con nota." />
                <fieldset>
                  <legend className="mb-1.5 font-bold">Nivel de autonomía</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2, 3, 4].map((n) => (
                      <button key={n} type="button" aria-pressed={Number(f.nivel_autonomia) === n} onClick={() => setF({ ...f, nivel_autonomia: n })}
                        className={`min-h-14 rounded-xl border-2 px-2 text-left text-base font-bold ${Number(f.nivel_autonomia) === n ? 'border-marca bg-marca-suave text-marca-oscuro' : 'border-borde bg-white'}`}>
                        {n} · {NIVELES[n]}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <Campo etiqueta="Dificultad detectada" placeholder="Ej. confunde minimizar y cerrar" value={f.dificultad} onChange={(e) => setF({ ...f, dificultad: e.target.value })} ayuda="Si se repite en varios alumnos, aparecerá como necesidad del grupo al cerrar la sesión." />
                <Campo etiqueta="Acción de refuerzo" value={f.accion_refuerzo} onChange={(e) => setF({ ...f, accion_refuerzo: e.target.value })} />
                <Campo tipo="area" etiqueta="Comentario para el alumno" placeholder="Lo verá en su móvil." value={f.comentario} onChange={(e) => setF({ ...f, comentario: e.target.value })} />
                <Boton icono="check" cargando={guardando} onClick={guardar}>Guardar corrección</Boton>
              </div>
            </Tarjeta>
          </div>
        </>
      )}
    </ConDatos>
  );
}
