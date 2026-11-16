import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Chip, ConDatos, Icono, Tarjeta, Titulo } from '../../components/ui.jsx';
import { useApi } from '../../lib/api.js';
import { fechaLarga, hora, horario, hoyISO } from '../../lib/formato.js';

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function diasDelMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const primero = new Date(a, m - 1, 1);
  const hueco = (primero.getDay() + 6) % 7; // lunes = 0
  const total = new Date(a, m, 0).getDate();
  return [...Array(hueco).fill(null), ...Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)];
}

function moverMes(mes, delta) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Calendario() {
  const hoy = hoyISO();
  // El curso empieza el 8 de octubre: antes de esa fecha se muestra octubre
  const [mes, setMes] = useState(hoy < '2026-10-01' ? '2026-10' : hoy.slice(0, 7));
  const [dia, setDia] = useState(hoy);
  const consulta = useApi(`/alumno/calendario?mes=${mes}`);

  const nombreMes = new Date(`${mes}-15T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <>
      <Titulo titulo="Calendario" subtitulo="Tus clases, las fechas de entrega y tus fichajes." />
      <ConDatos consulta={consulta}>
        {(d) => <Mes d={d} mes={mes} dia={dia} setDia={setDia} hoy={hoy} nombreMes={nombreMes} setMes={setMes} />}
      </ConDatos>
    </>
  );
}

function Mes({ d, mes, dia, setDia, hoy, nombreMes, setMes }) {
  const porDia = useMemo(() => {
    const m = {};
    const add = (fecha, item) => (m[fecha] ||= []).push(item);
    d.sesiones.forEach((s) => add(s.fecha, { tipo: 'clase', ...s }));
    d.limites.forEach((l) => add(l.fecha, { tipo: 'limite', ...l }));
    d.eventos.forEach((e) => add(e.fecha, { tipo: 'evento', ...e }));
    return m;
  }, [d]);
  const fichajeDia = d.fichajes.find((f) => f.fecha === dia);
  const items = porDia[dia] || [];

  return (
    <div className="flex flex-col gap-5">
      <Tarjeta>
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={() => setMes(moverMes(mes, -1))} className="flex size-12 items-center justify-center rounded-xl border-2 border-borde" aria-label="Mes anterior"><Icono nombre="chevron_left" /></button>
          <h2 className="text-xl font-bold first-letter:uppercase">{nombreMes}</h2>
          <button type="button" onClick={() => setMes(moverMes(mes, 1))} className="flex size-12 items-center justify-center rounded-xl border-2 border-borde" aria-label="Mes siguiente"><Icono nombre="chevron_right" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {DIAS.map((x) => <div key={x} className="py-1 text-sm font-bold text-texto-2">{x}</div>)}
          {diasDelMes(mes).map((f, i) => {
            if (!f) return <div key={`h${i}`} />;
            const marcas = porDia[f] || [];
            const seleccionado = f === dia;
            return (
              <button key={f} type="button" onClick={() => setDia(f)} aria-pressed={seleccionado} aria-label={fechaLarga(f)}
                className={`flex h-14 flex-col items-center justify-center rounded-xl text-lg ${seleccionado ? 'bg-marca font-bold text-white' : f === hoy ? 'bg-marca-suave font-bold text-marca-oscuro' : 'hover:bg-fondo'}`}>
                {Number(f.slice(8))}
                <span className="flex h-2 gap-0.5">
                  {marcas.some((x) => x.tipo === 'clase') && <span className={`size-2 rounded-full ${seleccionado ? 'bg-white' : 'bg-marca'}`} />}
                  {marcas.some((x) => x.tipo === 'limite') && <span className="size-2 rounded-full bg-amarillo-borde" />}
                  {marcas.some((x) => x.tipo === 'evento') && <span className="size-2 rounded-full bg-entregado-texto" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-borde pt-3 text-sm text-texto-2">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-marca" />Clase</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-amarillo-borde" />Fecha de entrega</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-entregado-texto" />Aviso</span>
        </div>
      </Tarjeta>

      <section>
        <h2 className="mb-3 flex items-center gap-3 text-2xl font-bold">{fechaLarga(dia)} {dia === hoy && <Chip estado="Hoy" />}</h2>
        <div className="flex flex-col gap-3">
          {items.length === 0 && <Tarjeta className="text-texto-2">No hay nada programado este día.</Tarjeta>}
          {items.map((x) => x.tipo === 'clase' ? (
            <section key={`c${x.id}`} className="rounded-2xl bg-negro p-5 text-white">
              <p className="text-sm font-bold text-amarillo uppercase">Clase presencial · {x.id}</p>
              <h3 className="mt-1 text-xl font-bold text-white">{x.titulo}</h3>
              <p className="mt-2 flex items-center gap-2 text-white/90"><Icono nombre="schedule" className="text-amarillo" />{horario(x)}</p>
              {x.lugar && <p className="flex items-center gap-2 text-white/90"><Icono nombre="location_on" className="text-amarillo" />{x.lugar}</p>}
              {x.tema_id && <Link to={`/temario/${x.tema_id}`} className="mt-3 inline-flex min-h-11 items-center gap-1 font-bold text-amarillo underline underline-offset-4">Ver tema {x.tema_id}<Icono nombre="arrow_forward" /></Link>}
            </section>
          ) : x.tipo === 'limite' ? (
            <Link key={`l${x.id}`} to={`/ejercicios/${x.id}`} className="flex items-center gap-3 rounded-2xl border border-borde bg-white p-4 hover:border-marca">
              <Icono nombre="event_busy" className="text-2xl text-pendiente-texto" />
              <div className="flex-1"><p className="text-sm font-bold text-texto-2">Último día de entrega</p><p className="font-bold">{x.titulo}</p></div>
              <Chip estado={x.entregado ? 'Entregado' : 'Pendiente'} />
            </Link>
          ) : (
            <Tarjeta key={`e${x.id}`} className="flex items-start gap-3">
              <Icono nombre={x.tipo === 'festivo' ? 'beach_access' : 'campaign'} className="text-2xl text-entregado-texto" />
              <div><p className="font-bold">{x.titulo}</p>{x.detalle && <p className="text-texto-2">{x.detalle}</p>}</div>
            </Tarjeta>
          ))}
          {fichajeDia && (
            <Tarjeta className="flex items-center gap-3">
              <Icono nombre="badge" className="text-2xl text-revisado-texto" />
              <p>Fichaste a las <strong>{hora(fichajeDia.entrada)}</strong>{fichajeDia.salida && <> y saliste a las <strong>{hora(fichajeDia.salida)}</strong></>}.</p>
            </Tarjeta>
          )}
        </div>
      </section>
    </div>
  );
}
