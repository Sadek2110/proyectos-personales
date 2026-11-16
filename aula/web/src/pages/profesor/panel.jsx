import { Link } from 'react-router';
import { Avatar, Boton, Chip, ConDatos, Icono, Tarjeta, Vacio } from '../../components/ui.jsx';
import { useApi } from '../../lib/api.js';
import { fechaLarga, hace, hora, horario, nota } from '../../lib/formato.js';

function Dato({ icono, etiqueta, valor, detalle, a }) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-texto-2">{etiqueta}</p>
        <span className="flex size-10 items-center justify-center rounded-lg bg-marca-suave text-marca"><Icono nombre={icono} /></span>
      </div>
      <p className="mt-2 font-titulo text-3xl font-bold">{valor}</p>
      {detalle && <p className="mt-1 text-sm text-texto-2">{detalle}</p>}
    </>
  );
  return a
    ? <Link to={a} className="rounded-2xl border border-borde bg-white p-5 shadow-sm hover:border-marca">{contenido}</Link>
    : <div className="rounded-2xl border border-borde bg-white p-5 shadow-sm">{contenido}</div>;
}

export function Panel() {
  const consulta = useApi('/panel');
  return (
    <ConDatos consulta={consulta}>
      {(d) => {
        const esHoy = d.sesion?.fecha === d.fecha;
        return (
          <div className="flex flex-col gap-6">
            <Tarjeta className="flex flex-wrap items-center justify-between gap-4">
              {d.sesion ? (
                <div>
                  <p className="inline-flex items-center gap-2 rounded-lg bg-fondo px-3 py-1 text-sm font-bold">
                    <span className={`size-2.5 rounded-full ${esHoy ? 'bg-marca' : 'bg-texto-2'}`} />
                    {esHoy ? 'Sesión de hoy' : 'Próxima sesión'} · {d.sesion.id} · {fechaLarga(d.sesion.fecha)}
                  </p>
                  <h1 className="mt-2 text-3xl font-bold">{d.sesion.titulo}</h1>
                  <p className="text-texto-2">{[d.sesion.tema_id && `${d.sesion.tema_id} ${d.sesion.tema_titulo}`, horario(d.sesion), d.sesion.lugar].filter(Boolean).join(' · ')}</p>
                </div>
              ) : (
                <div><h1 className="text-3xl font-bold">Panel</h1><p className="text-texto-2">No hay sesiones programadas. Crea la próxima clase.</p></div>
              )}
              <div className="flex flex-wrap gap-3">
                {d.sesion && <Boton a={`/profesor/sesiones/${d.sesion.id}`} variante="secundario" icono="fact_check">Pasar lista</Boton>}
                <Boton a="/profesor/sesiones" icono="add">Nueva sesión</Boton>
              </div>
            </Tarjeta>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Dato icono="how_to_reg" etiqueta="Han fichado hoy" valor={`${d.stats.presentes_hoy} / ${d.stats.alumnos}`} detalle="alumnos activos" />
              <Dato icono="rate_review" etiqueta="Entregas por corregir" valor={d.stats.por_corregir} detalle="Ir a correcciones" a="/profesor/correcciones" />
              <Dato icono="event_available" etiqueta="Asistencia del curso" valor={d.stats.asistencia_pct === null ? '—' : `${d.stats.asistencia_pct} %`} detalle="Presente y retraso cuentan" />
              <Dato icono="grade" etiqueta="Nota media" valor={nota(d.stats.media_nota)} detalle="Primer intento corregido" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
              <Tarjeta className="p-0">
                <div className="flex items-center justify-between p-5">
                  <div><h2 className="text-xl font-bold">Fichajes de hoy</h2><p className="text-texto-2">Entrada y salida de cada alumno</p></div>
                  <Boton variante="neutro" icono="refresh" pequeno onClick={consulta.recargar}>Actualizar</Boton>
                </div>
                {d.hoy.length === 0 ? <div className="p-5 pt-0"><Vacio icono="group_add" titulo="Aún no hay alumnos">Invítalos desde «Alumnos e invitaciones».</Vacio></div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="border-y border-borde bg-fondo text-sm text-texto-2 uppercase">
                        <tr><th className="px-5 py-3">Alumno</th><th className="px-3 py-3">Entrada</th><th className="px-3 py-3">Salida</th><th className="px-5 py-3 text-right">Estado</th></tr>
                      </thead>
                      <tbody>
                        {d.hoy.map((a) => (
                          <tr key={a.alumno_id} className="border-b border-borde last:border-0">
                            <td className="px-5 py-3"><Link to={`/profesor/alumnos/${a.alumno_id}`} className="flex items-center gap-3"><Avatar nombre={a.nombre} className="size-9 text-sm" /><span><span className="block font-bold">{a.nombre}</span><span className="text-sm text-texto-2">{a.alumno_id}</span></span></Link></td>
                            <td className="px-3 py-3 font-bold">{a.fichaje ? hora(a.fichaje.entrada) : '—'}</td>
                            <td className="px-3 py-3">{a.fichaje?.salida ? hora(a.fichaje.salida) : '—'}</td>
                            <td className="px-5 py-3 text-right">
                              {a.asistencia ? <Chip estado={a.asistencia.estado}>{a.asistencia.estado}{a.asistencia.minutos_retraso ? ` (+${a.asistencia.minutos_retraso} min)` : ''}</Chip>
                                : a.fichaje ? <Chip estado="Presente">Ha fichado</Chip> : <span className="text-texto-2">Sin fichar</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Tarjeta>

              <Tarjeta>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold">Por corregir</h2>
                  <Chip estado="Pendiente">{d.stats.por_corregir}</Chip>
                </div>
                {d.por_corregir.length === 0 ? <p className="text-texto-2">No hay entregas pendientes.</p> : (
                  <ul className="flex flex-col divide-y divide-borde">
                    {d.por_corregir.map((r) => (
                      <li key={r.id} className="py-3">
                        <p className="font-bold">{r.ejercicio_id} · {r.ejercicio_titulo.replace('Práctica: ', '')}</p>
                        <p className="text-sm text-texto-2">{r.nombre} · intento {r.intento} · {hace(r.fecha)}</p>
                        <Boton a={`/profesor/correcciones/${encodeURIComponent(r.id)}`} variante="suave" icono="rate_review" pequeno className="mt-2 w-full">Corregir</Boton>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            </div>
          </div>
        );
      }}
    </ConDatos>
  );
}
