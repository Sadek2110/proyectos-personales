import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FormEvento, FormTarea, VerEvento } from '../componentes/formularios.jsx';
import { esTemporal } from '../datos.js';
import { DIAS, MESES, aFecha, cap, difDias, diasDesde, hoy, inicioSemana, isoDia, nombreDia, pad, sumarDias } from '../fechas.js';
import { useUI } from '../ui.jsx';
import './calendario.css';

const HORA_PX = 48;
const ALTO_NUMERO = 26; // lo que ocupa el número del día en cada semana del Mes
const mesCorto = d => MESES[d.getMonth()].slice(0, 3);
const minutosDe = s => +s.slice(11, 13) * 60 + +s.slice(14, 16);
const topAhora = d => (d.getHours() * 60 + d.getMinutes()) / 60 * HORA_PX;
const claveEvento = e => `${e.id}|${e.inicio}`; // las repeticiones de un evento comparten id

export function rangoVisible(vista, dia) {
  if (vista === 'mes') {
    const [y, m] = dia.split('-').map(Number);
    return [inicioSemana(`${y}-${pad(m)}-01`), sumarDias(inicioSemana(isoDia(new Date(y, m, 0))), 6)];
  }
  if (vista === 'semana') { const ini = inicioSemana(dia); return [ini, sumarDias(ini, 6)]; }
  if (vista === 'dia') return [dia, dia];
  const h = hoy(), fin = sumarDias(h, 13);
  return [dia < h ? dia : h, dia > fin ? dia : fin];
}

export function tituloCal(vista, dia) {
  const d = aFecha(dia);
  if (vista === 'dia') return `${cap(DIAS[d.getDay()])} ${d.getDate()} ${mesCorto(d)} ${d.getFullYear()}`;
  if (vista === 'semana') {
    const [a, b] = rangoVisible(vista, dia).map(aFecha);
    if (a.getFullYear() !== b.getFullYear()) return `${a.getDate()} ${mesCorto(a)} ${a.getFullYear()} – ${b.getDate()} ${mesCorto(b)} ${b.getFullYear()}`;
    return `${a.getDate()}${a.getMonth() !== b.getMonth() ? ` ${mesCorto(a)}` : ''} – ${b.getDate()} ${mesCorto(b)} ${b.getFullYear()}`;
  }
  return `${cap(MESES[d.getMonth()])} ${d.getFullYear()}`;
}

export function moverDia(vista, dia, n) {
  if (vista !== 'mes') return sumarDias(dia, vista === 'semana' ? n * 7 : n);
  const [y, m, d] = dia.split('-').map(Number);
  return isoDia(new Date(y, m - 1 + n, Math.min(d, new Date(y, m + n, 0).getDate())));
}

/** Días que ocupa un evento. No cuenta el día final de uno de día completo ni el de uno que acaba a medianoche. */
function diasEvento(e) {
  const ini = e.inicio.slice(0, 10);
  let fin = e.fin.slice(0, 10);
  if (fin > ini && (e.diaCompleto || e.fin.slice(11, 16) === '00:00')) fin = sumarDias(fin, -1);
  return [ini, fin > ini ? fin : ini];
}

function crearTiras(eventos, tareas) {
  return [
    ...eventos.map(e => {
      const [ini, fin] = diasEvento(e);
      return { clave: claveEvento(e), e, ini, fin, barra: e.diaCompleto || ini !== fin, orden: e.diaCompleto ? '' : e.inicio };
    }),
    ...tareas.filter(t => !t.completada && t.fecha).map(t => {
      const dia = t.fecha.slice(0, 10);
      return { clave: `t|${t.id}`, t, ini: dia, fin: dia, barra: false, orden: t.fecha };
    }),
  ];
}

/**
 * Coloca las tiras de una fila de días en carriles sin solapes, como las barras de Google Calendar.
 * Si un día no da abasto, su último carril se reserva para el «+N más».
 */
function colocarCarriles(tiras, dias, max) {
  const a = dias[0], b = dias[dias.length - 1];
  const fila = tiras.filter(x => x.ini <= b && x.fin >= a).map(x => {
    const col = Math.max(0, difDias(a, x.ini));
    return { ...x, col, span: Math.min(dias.length - 1, difDias(a, x.fin)) - col + 1, corteI: x.ini < a, corteD: x.fin > b };
  }).sort((x, y) => x.col - y.col || y.barra - x.barra || y.span - x.span || (x.orden < y.orden ? -1 : 1));

  const ocupado = [], total = dias.map(() => 0);
  const enSusDias = (x, fn) => { for (let d = x.col; d < x.col + x.span; d++) if (fn(d)) return true; return false; };
  fila.forEach(x => {
    let c = 0;
    while (enSusDias(x, d => ocupado[c]?.[d])) c++;
    ocupado[c] ||= [];
    enSusDias(x, d => { ocupado[c][d] = true; total[d]++; });
    x.carril = c;
  });

  const ocultos = dias.map(() => 0), visibles = new Set(fila);
  for (let cambio = true; cambio;) {
    cambio = false;
    visibles.forEach(x => {
      if (x.carril < max - 1 || (x.carril === max - 1 && !enSusDias(x, d => total[d] > max || ocultos[d] > 0))) return;
      visibles.delete(x);
      cambio = true;
      enSusDias(x, d => { ocultos[d]++; });
    });
  }
  return { visibles: [...visibles], ocultos, hayAlgo: fila.length > 0 };
}

/** Reparte en columnas los eventos de un día que se solapan. */
function colocarSolapes(lista) {
  const orden = lista.slice().sort((a, b) => a.ini - b.ini || b.fin - a.fin);
  let grupo = [], finGrupo = -1;
  const cerrar = () => { const n = Math.max(0, ...grupo.map(x => x.col + 1)); grupo.forEach(x => { x.cols = n; }); grupo = []; };
  orden.forEach(x => {
    if (x.ini >= finGrupo) { cerrar(); finGrupo = -1; }
    let col = 0;
    while (grupo.some(o => o.col === col && o.finVisible > x.ini)) col++;
    x.col = col;
    grupo.push(x);
    finGrupo = Math.max(finGrupo, x.finVisible);
  });
  cerrar();
  return orden;
}

function useVerDia() {
  const { setDia, setVistaCal } = useUI();
  return iso => { setDia(iso); setVistaCal('dia'); };
}

function Tira({ x }) {
  const { abrirHoja } = useUI();
  const posicion = { gridColumn: `${x.col + 1} / span ${x.span}`, gridRow: x.carril + 1 };
  if (x.t) {
    const hora = x.t.fecha.slice(11, 16);
    return (
      <button type="button" className={`ct ct-tarea ${esTemporal(x.t.id) ? 'pendiente' : ''}`} title={`Tarea: ${x.t.titulo}`}
        style={{ ...posicion, '--c': x.t.prioridad === 'Alta' ? 'var(--peligro)' : 'var(--texto-suave)' }}
        onClick={() => abrirHoja(<FormTarea tarea={{ ...x.t }} />)}>
        <i />{hora && hora !== '00:00' && <span className="ct-hora">{hora}</span>}<span>{x.t.titulo}</span>
      </button>
    );
  }
  const e = x.e;
  const comun = {
    type: 'button', title: e.titulo, style: { ...posicion, '--c': e.color || 'var(--linea)' },
    onClick: () => abrirHoja(<VerEvento evento={e} />),
  };
  const pendiente = esTemporal(e.id) ? 'pendiente' : '';
  if (x.barra) return <button {...comun} className={`ct ct-barra ${pendiente} ${x.corteI ? 'corte-i' : ''} ${x.corteD ? 'corte-d' : ''}`}><span>{e.titulo}</span></button>;
  return <button {...comun} className={`ct ${pendiente}`}><i /><span className="ct-hora">{e.inicio.slice(11, 16)}</span><span>{e.titulo}</span></button>;
}

function Carriles({ colocadas, dias, max }) {
  const verDia = useVerDia();
  return (
    <>
      {colocadas.visibles.map(x => <Tira key={x.clave} x={x} />)}
      {colocadas.ocultos.map((n, i) => n > 0 && (
        <button key={dias[i]} type="button" className="ct-mas" style={{ gridColumn: i + 1, gridRow: max }} onClick={() => verDia(dias[i])}>+{n} más</button>
      ))}
    </>
  );
}

export function Mes({ eventos, tareas }) {
  const { dia, setDia, abrirHoja } = useUI();
  const verDia = useVerDia();
  const filas = useRef(null);
  const [max, setMax] = useState(3);
  const [ini, fin] = rangoVisible('mes', dia);
  const h = hoy(), mes = dia.slice(0, 7), tiras = crearTiras(eventos, tareas);
  const semanas = Array.from({ length: (difDias(ini, fin) + 1) / 7 }, (_, i) => diasDesde(sumarDias(ini, i * 7), 7));

  // Cuántas tiras caben depende del alto real de cada semana, que solo se sabe ya pintado.
  useLayoutEffect(() => {
    const medir = () => {
      const fila = filas.current.firstElementChild;
      if (!fila.clientHeight) return;
      const altoTira = parseFloat(getComputedStyle(fila.querySelector('.cm-tiras')).gridAutoRows) + 2;
      setMax(Math.max(1, Math.floor((fila.clientHeight - ALTO_NUMERO) / altoTira)));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(filas.current);
    return () => observador.disconnect();
  }, [semanas.length]);

  // Con ratón, un clic en el hueco crea un evento; en el móvil abre el día, como la app de Google.
  const alTocarDia = iso => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return verDia(iso);
    setDia(iso);
    abrirHoja(<FormEvento fecha={iso} />);
  };

  return (
    <div className="cm">
      <div className="cm-cab">{semanas[0].map(iso => <span key={iso}>{DIAS[aFecha(iso).getDay()].slice(0, 3)}</span>)}</div>
      <div className="cm-filas" ref={filas}>
        {semanas.map(dias => (
          <div className="cm-sem" key={dias[0]}>
            <div className="cm-fondo">
              {dias.map(iso => (
                <div key={iso} className={`cm-dia ${iso === h ? 'hoy' : ''} ${iso.slice(0, 7) !== mes ? 'fuera' : ''} ${aFecha(iso).getDay() % 6 === 0 ? 'finde' : ''}`} onClick={() => alTocarDia(iso)}>
                  <button type="button" className="cm-num" aria-label={`Ver ${nombreDia(iso, true)}`} onClick={ev => { ev.stopPropagation(); verDia(iso); }}>{aFecha(iso).getDate()}</button>
                </div>
              ))}
            </div>
            <div className="cm-tiras"><Carriles colocadas={colocarCarriles(tiras, dias, max)} dias={dias} max={max} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventoRejilla({ x }) {
  const { abrirHoja } = useUI();
  const alto = Math.max((x.fin - x.ini) / 60 * HORA_PX, 20), corto = alto < 36;
  return (
    <button type="button" className={`ce ${corto ? 'ce-corto' : ''} ${esTemporal(x.e.id) ? 'pendiente' : ''}`} title={x.e.titulo}
      style={{
        '--c': x.e.color || 'var(--linea)', top: x.ini / 60 * HORA_PX, height: alto - 1,
        left: `${x.col / x.cols * 100}%`, width: `calc(${100 / x.cols}% - 3px)`,
      }}
      onClick={ev => { ev.stopPropagation(); abrirHoja(<VerEvento evento={x.e} />); }}>
      <b>{x.e.titulo}</b>
      {!corto && <span>{x.e.inicio.slice(11, 16)} – {x.e.fin.slice(11, 16)}</span>}
      {alto >= 66 && x.e.lugar && <span>{x.e.lugar}</span>}
    </button>
  );
}

const HORAS = Array.from({ length: 23 }, (_, i) => i + 1);

/** Semana y Día: el mismo cuerpo con siete columnas o con una. */
export function Rejilla({ eventos, tareas, dias, scroll }) {
  const { setDia, abrirHoja } = useUI();
  const verDia = useVerDia();
  const cuerpo = useRef(null);
  const [ahora, setAhora] = useState(() => new Date());
  const h = hoy(), tiras = crearTiras(eventos, tareas);
  const maxArriba = dias.length === 1 ? 8 : 3;
  const arriba = colocarCarriles(tiras.filter(x => x.barra || x.t), dias, maxArriba);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60e3);
    return () => clearInterval(t);
  }, []);

  useLayoutEffect(() => {
    const horaInicial = dias.includes(h) ? Math.max(new Date().getHours() - 1, 0) : 7;
    cuerpo.current.scrollTop = scroll.current ?? horaInicial * HORA_PX;
  }, []);

  const alTocarHueco = (iso, ev) => {
    const min = Math.floor((ev.clientY - ev.currentTarget.getBoundingClientRect().top) / HORA_PX * 2) * 30;
    setDia(iso);
    abrirHoja(<FormEvento fecha={iso} hora={`${pad(Math.floor(min / 60))}:${pad(min % 60)}`} />);
  };

  return (
    <div className={`cs ${dias.length === 7 ? 'cs-7' : ''}`} style={{ '--n': dias.length, '--hora': `${HORA_PX}px` }}>
      <div className="cs-cab">
        <div />
        <div className="cs-dias">
          {dias.map(iso => {
            const d = aFecha(iso);
            return (
              <button key={iso} type="button" className={`cs-dh ${iso === h ? 'hoy' : ''}`} onClick={() => verDia(iso)}>
                <span>{DIAS[d.getDay()].slice(0, 3)}</span><b>{d.getDate()}</b>
              </button>
            );
          })}
        </div>
      </div>
      {arriba.hayAlgo && (
        <div className="cs-todo">
          <div className="cs-tl">Todo<br />el día</div>
          <div className="cs-tiras"><Carriles colocadas={arriba} dias={dias} max={maxArriba} /></div>
        </div>
      )}
      <div className="cg-cuerpo" ref={cuerpo} onScroll={ev => { scroll.current = ev.currentTarget.scrollTop; }}>
        <div className="cs-grid">
          <div className="cs-horas">{HORAS.map(n => <span key={n} className="cs-hl" style={{ top: n * HORA_PX }}>{pad(n)}:00</span>)}</div>
          <div className="cs-cols">
            {dias.map(iso => {
              const delDia = colocarSolapes(tiras.filter(x => x.e && !x.barra && x.ini === iso).map(x => {
                const ini = minutosDe(x.e.inicio);
                const fin = x.e.fin.slice(0, 10) > iso ? 1440 : minutosDe(x.e.fin);
                // Un evento corto se dibuja con un alto mínimo: también debe contar así al detectar solapes.
                return { clave: x.clave, e: x.e, ini, fin, finVisible: Math.max(fin, ini + 25) };
              }));
              return (
                <div key={iso} className={`cs-col ${iso === h ? 'hoy' : ''}`} onClick={ev => alTocarHueco(iso, ev)}>
                  {delDia.map(x => <EventoRejilla key={x.clave} x={x} />)}
                  {iso === h && <div className="cs-ahora" style={{ top: topAhora(ahora) }} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
