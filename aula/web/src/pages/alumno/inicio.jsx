import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, Boton, Chip, ConDatos, Icono, Tarjeta, useAviso } from '../../components/ui.jsx';
import { api, useApi } from '../../lib/api.js';
import { fechaLarga, hora, horario, nota } from '../../lib/formato.js';
import { useSesion } from '../../lib/sesion.jsx';

function Fichaje({ fichaje, recargar }) {
  const avisar = useAviso();
  const [enviando, setEnviando] = useState(false);
  const tipo = !fichaje ? 'entrada' : !fichaje.salida ? 'salida' : null;

  async function fichar() {
    setEnviando(true);
    try {
      await api.post('/alumno/fichar', { tipo });
      avisar(tipo === 'entrada' ? 'Entrada fichada. ¡Buena clase!' : 'Salida fichada. ¡Hasta la próxima!');
      await recargar();
    } catch (err) {
      avisar(err.message, 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tarjeta>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-xl bg-pendiente text-pendiente-texto"><Icono nombre="schedule" /></span>
        <div>
          <h2 className="text-xl font-bold">Fichaje de hoy</h2>
          <p className="text-texto-2">{!fichaje ? 'Pulsa el botón al llegar a clase.' : !fichaje.salida ? 'Pulsa el botón al terminar la clase.' : 'Ya has fichado la entrada y la salida.'}</p>
        </div>
      </div>
      {tipo ? (
        <Boton variante="fichar" icono={tipo === 'entrada' ? 'login' : 'logout'} className="min-h-[72px] w-full text-xl" cargando={enviando} onClick={fichar}>
          {tipo === 'entrada' ? 'Fichar entrada' : 'Fichar salida'}
        </Boton>
      ) : (
        <p className="flex min-h-[72px] items-center justify-center gap-2 rounded-xl border-2 border-revisado-texto/30 bg-revisado text-xl font-bold text-revisado-texto">
          <Icono nombre="check_circle" relleno />Jornada fichada
        </p>
      )}
      <dl className="mt-4 flex justify-between border-t border-borde pt-3 text-base">
        <div className="flex gap-1.5"><dt className="text-texto-2">Entrada:</dt><dd className="font-bold">{fichaje ? hora(fichaje.entrada) : 'pendiente'}</dd></div>
        <div className="flex gap-1.5"><dt className="text-texto-2">Salida:</dt><dd className="font-bold">{fichaje?.salida ? hora(fichaje.salida) : 'pendiente'}</dd></div>
      </dl>
    </Tarjeta>
  );
}

function ClaseDeHoy({ sesion, fecha }) {
  if (!sesion) return null;
  const esHoy = sesion.fecha === fecha;
  return (
    <section className="relative overflow-hidden rounded-2xl bg-negro p-6 text-white shadow-sm">
      <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-bold tracking-wide uppercase">
        <span className="size-2.5 rounded-full bg-amarillo" />{esHoy ? 'Clase de hoy' : `Próxima clase · ${fechaLarga(sesion.fecha)}`}
      </p>
      <h2 className="text-2xl font-bold text-white">{sesion.titulo}</h2>
      <ul className="mt-4 space-y-2 text-white/90">
        <li className="flex items-center gap-2"><Icono nombre="schedule" className="text-amarillo" />{horario(sesion)}</li>
        {sesion.lugar && <li className="flex items-center gap-2"><Icono nombre="location_on" className="text-amarillo" />{sesion.lugar}</li>}
        {sesion.tema_id && <li className="flex items-center gap-2"><Icono nombre="menu_book" className="text-amarillo" />{sesion.tema_id} · {sesion.tema_titulo}</li>}
      </ul>
      {sesion.tema_id && <Boton a={`/temario/${sesion.tema_id}`} variante="neutro" iconoFinal="arrow_forward" className="mt-5 w-full border-0 text-marca-oscuro">Ver el tema de la clase</Boton>}
    </section>
  );
}

export function Inicio() {
  const { usuario } = useSesion();
  const consulta = useApi('/alumno/inicio');
  return (
    <ConDatos consulta={consulta}>
      {(d) => (
        <div className="flex flex-col gap-5">
          <Tarjeta className="flex items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-texto-2"><Icono nombre="calendar_today" className="text-marca" />{fechaLarga(d.fecha)}</p>
              <h1 className="mt-1 text-3xl font-bold">Hola, {usuario.nombre.split(' ')[0]}</h1>
              {usuario.grupo && <p className="text-texto-2">Grupo {usuario.grupo}</p>}
            </div>
            <Avatar nombre={usuario.nombre} className="size-16 text-2xl" />
          </Tarjeta>

          <Fichaje fichaje={d.fichaje} recargar={consulta.recargar} />
          <ClaseDeHoy sesion={d.sesion} fecha={d.fecha} />

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Tienes pendiente</h2>
              <Link to="/ejercicios" className="min-h-11 content-center font-bold text-marca-oscuro underline underline-offset-4">Ver todo</Link>
            </div>
            {d.pendientes.length === 0 ? (
              <Tarjeta className="flex items-center gap-3"><Icono nombre="task_alt" className="text-3xl text-revisado-texto" />No tienes ejercicios pendientes. ¡Muy bien!</Tarjeta>
            ) : (
              <div className="flex flex-col gap-3">
                {d.pendientes.map((e) => (
                  <Link key={e.id} to={`/ejercicios/${e.id}`} className="flex items-center gap-4 rounded-2xl border border-borde bg-white p-4 shadow-sm hover:border-marca">
                    <div className="min-w-0 flex-1">
                      <Chip estado="Pendiente" />
                      <h3 className="mt-2 text-lg font-bold">{e.titulo.replace('Práctica: ', '')}</h3>
                      <p className="text-texto-2">{e.id} · Entregar {e.entrega}</p>
                    </div>
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-marca-suave text-marca"><Icono nombre="arrow_forward" /></span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {d.corregidos.length > 0 && (
            <section>
              <h2 className="mb-3 text-2xl font-bold">Últimas correcciones</h2>
              <div className="flex flex-col gap-3">
                {d.corregidos.map((e) => (
                  <Link key={e.id} to={`/ejercicios/${e.id}`} className="rounded-2xl border border-borde bg-white p-4 shadow-sm hover:border-marca">
                    <div className="flex items-center justify-between gap-3">
                      <Chip estado="Revisado">Corregido</Chip>
                      <span className="font-titulo text-xl font-bold text-marca-oscuro">{nota(e.nota_10)} <span className="text-base font-normal text-texto-2">/ 10</span></span>
                    </div>
                    <h3 className="mt-2 text-lg font-bold">{e.titulo.replace('Práctica: ', '')}</h3>
                    {e.comentario && <p className="mt-1 border-l-2 border-marca pl-3 text-texto-2 italic">«{e.comentario}»</p>}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-2xl font-bold">Sigue con el temario</h2>
            <Tarjeta>
              {d.siguiente && (
                <>
                  <p className="inline-block rounded-full bg-marca-suave px-3 py-0.5 text-sm font-bold text-marca-oscuro uppercase">{d.siguiente.unidad_id}</p>
                  <h3 className="mt-2 text-xl font-bold">{d.siguiente.tema_id} · {d.siguiente.tema_titulo}</h3>
                </>
              )}
              <div className="mt-4">
                <div className="mb-2 flex justify-between font-bold">
                  <span>Progreso del curso</span>
                  <span className="text-marca-oscuro">{d.progreso.hechos} de {d.progreso.total} temas</span>
                </div>
                <div className="h-3.5 overflow-hidden rounded-full bg-fondo" role="progressbar" aria-valuenow={d.progreso.hechos} aria-valuemax={d.progreso.total}>
                  <div className="h-full rounded-full bg-marca" style={{ width: `${Math.max(3, (d.progreso.hechos / Math.max(1, d.progreso.total)) * 100)}%` }} />
                </div>
              </div>
              <Boton a={d.siguiente ? `/temario/${d.siguiente.tema_id}` : '/temario'} className="mt-5 w-full" iconoFinal="arrow_forward">
                {d.siguiente ? 'Continuar tema' : 'Ver el temario'}
              </Boton>
            </Tarjeta>
          </section>
        </div>
      )}
    </ConDatos>
  );
}
