import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Boton, Chip, ConDatos, Icono, Markdown, Tarjeta, Titulo } from '../../components/ui.jsx';
import { useApi } from '../../lib/api.js';

export function Temario() {
  const consulta = useApi('/unidades');
  const progreso = useApi('/alumno/ejercicios');
  const [abierta, setAbierta] = useState(null);

  return (
    <>
      <Titulo titulo="Temario" subtitulo="Lee cada tema aquí o descárgalo en PDF o Word." />
      <ConDatos consulta={consulta}>
        {(unidades) => {
          const estados = Object.fromEntries((progreso.datos || []).map((e) => [e.tema_id, e.estado]));
          const actual = abierta ?? unidades.find((u) => u.temas.some((t) => !estados[t.id]))?.id ?? unidades[0]?.id;
          return (
            <div className="flex flex-col gap-3">
              <p className="mb-2 text-texto-2">{unidades.length} unidades · {unidades.reduce((n, u) => n + u.temas.length, 0)} temas</p>
              {unidades.map((u) => {
                const hechos = u.temas.filter((t) => estados[t.id]).length;
                const abiertaEsta = actual === u.id;
                return (
                  <section key={u.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${abiertaEsta ? 'border-marca' : 'border-borde'}`}>
                    <button type="button" onClick={() => setAbierta(abiertaEsta ? '' : u.id)} aria-expanded={abiertaEsta}
                      className="flex min-h-20 w-full items-center gap-4 p-4 text-left">
                      <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl font-titulo font-bold ${hechos === u.temas.length ? 'bg-revisado text-revisado-texto' : 'bg-marca-suave text-marca-oscuro'}`}>{u.id}</span>
                      <span className="flex-1">
                        <span className="block text-lg font-bold">{u.titulo}</span>
                        <span className="text-base text-texto-2">{hechos} de {u.temas.length} temas hechos</span>
                      </span>
                      <Icono nombre={abiertaEsta ? 'expand_less' : 'expand_more'} className="text-3xl text-texto-2" />
                    </button>
                    {abiertaEsta && (
                      <ul className="flex flex-col gap-2 border-t border-borde bg-fondo/50 p-3">
                        {u.temas.map((t) => (
                          <li key={t.id}>
                            <Link to={`/temario/${t.id}`} className="flex items-center gap-3 rounded-xl border border-borde bg-white p-4 hover:border-marca">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-texto-2">Tema {t.id.slice(1)} {t.minutos && `· ${t.minutos} min`}</p>
                                <p className="text-lg font-bold">{t.titulo}</p>
                                {estados[t.id] && <Chip estado={estados[t.id]} className="mt-1">{estados[t.id] === 'Revisado' ? 'Ejercicio corregido' : 'Ejercicio entregado'}</Chip>}
                              </div>
                              <Icono nombre="arrow_forward" className="text-marca" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          );
        }}
      </ConDatos>
    </>
  );
}

const TAMANOS = [['text-base', 'A'], ['text-lg', 'A+'], ['text-xl', 'A++']];

export function Tema({ vistaProfesor = false }) {
  const { id } = useParams();
  const consulta = useApi(`/temas/${id}`);
  const [tam, setTam] = useState(1);
  const base = vistaProfesor ? '/profesor/temario/ver' : '/temario';

  return (
    <ConDatos consulta={consulta}>
      {(t) => (
        <article>
          <Link to={vistaProfesor ? '/profesor/temario' : '/temario'} className="no-imprimir mb-4 inline-flex min-h-11 items-center gap-1 font-bold text-marca-oscuro">
            <Icono nombre="arrow_back" />Temario
          </Link>
          <p className="text-sm font-bold text-texto-2 uppercase">{t.unidad_id} {t.unidad_titulo} · Tema {t.id.slice(1)}</p>
          <h1 className="mt-1 text-3xl font-bold">{t.titulo}</h1>
          {!t.visible && <Chip estado="Pendiente" className="mt-2">Oculto para el alumnado</Chip>}

          <div className="no-imprimir mt-5 flex items-center gap-3">
            <span className="flex items-center gap-1 font-bold"><Icono nombre="format_size" />Tamaño de letra:</span>
            {TAMANOS.map(([, etiqueta], i) => (
              <button key={etiqueta} type="button" onClick={() => setTam(i)} aria-pressed={tam === i}
                className={`min-h-11 min-w-12 rounded-lg border-2 px-2 font-bold ${tam === i ? 'border-marca bg-marca text-white' : 'border-borde bg-white'}`}>{etiqueta}</button>
            ))}
          </div>

          <Tarjeta className="mt-5">
            <Markdown texto={t.contenido} className={TAMANOS[tam][0]} />
          </Tarjeta>

          <section className="no-imprimir mt-5">
            <h2 className="mb-3 text-xl font-bold">Descargar el tema</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Boton href={`/api/temas/${t.id}/descargar?formato=pdf`} variante="secundario" icono="picture_as_pdf" download>Descargar en PDF</Boton>
              <Boton href={`/api/temas/${t.id}/descargar?formato=docx`} variante="secundario" icono="description" download>Descargar en Word</Boton>
              {t.tiene_archivo && <Boton href={`/api/temas/${t.id}/descargar?formato=original`} variante="secundario" icono="attach_file" className="sm:col-span-2" download>Material del profesor: {t.archivo_nombre}</Boton>}
            </div>
          </section>

          {t.ejercicios.length > 0 && (
            <section className="no-imprimir mt-6">
              <h2 className="mb-3 text-xl font-bold">Practica lo aprendido</h2>
              {t.ejercicios.map((e) => (
                <Link key={e.id} to={vistaProfesor ? '/profesor/temario' : `/ejercicios/${e.id}`} className="mb-3 flex items-center gap-4 rounded-2xl border border-borde bg-white p-4 shadow-sm hover:border-marca">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-marca text-white"><Icono nombre="edit_document" /></span>
                  <div className="flex-1"><p className="text-sm font-bold text-texto-2">{e.id} · {e.minutos}</p><p className="text-lg font-bold">{e.titulo}</p></div>
                  <Icono nombre="arrow_forward" className="text-marca" />
                </Link>
              ))}
            </section>
          )}

          <nav className="no-imprimir mt-6 grid grid-cols-2 gap-3" aria-label="Otros temas">
            {t.anterior ? <Boton a={`${base}/${t.anterior.id}`} variante="neutro" icono="arrow_back" className="text-base">{t.anterior.id}</Boton> : <span />}
            {t.siguiente && <Boton a={`${base}/${t.siguiente.id}`} variante="neutro" iconoFinal="arrow_forward" className="text-base">{t.siguiente.id}</Boton>}
          </nav>
        </article>
      )}
    </ConDatos>
  );
}
