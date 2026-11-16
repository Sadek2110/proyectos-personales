import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Esqueleto, Fallo, FilaTarea, MUELLE, Segmentado, SinActualizar, Vacio } from '../componentes/comun.jsx';
import { useDatos } from '../datos.js';
import { hoy, sumarDias } from '../fechas.js';

const TRAMOS = ['Vencidas', 'Hoy', 'Mañana', 'Próximos 7 días', 'Más adelante', 'Sin fecha'];
const PRIORIDADES = ['Alta', 'Media', 'Baja'];

function tramo(t) {
  if (!t.fecha) return 'Sin fecha';
  const d = t.fecha.slice(0, 10), h = hoy();
  if (d < h) return 'Vencidas';
  if (d === h) return 'Hoy';
  if (d === sumarDias(h, 1)) return 'Mañana';
  if (d <= sumarDias(h, 7)) return 'Próximos 7 días';
  return 'Más adelante';
}

export function ordenTareas(a, b) {
  if (!!a.fecha !== !!b.fecha) return a.fecha ? -1 : 1;
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  return PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad);
}

export default function Tareas() {
  const consulta = useDatos();
  const [modo, setModo] = useState('pend');
  if (consulta.isPending) return <Esqueleto />;
  if (consulta.isError && !consulta.data) return <Fallo que="las tareas" consulta={consulta} />;

  const { tareas } = consulta.data;
  const pendientes = tareas.filter(t => !t.completada).sort(ordenTareas);
  const hechas = tareas.filter(t => t.completada).sort((a, b) => ordenTareas(b, a));
  const tramos = TRAMOS.map(n => [n, pendientes.filter(t => tramo(t) === n)]).filter(([, items]) => items.length);

  return (
    <>
      <SinActualizar que="Tareas" consulta={consulta} />
      <Segmentado id="tareas" valor={modo} onCambio={setModo} opciones={[['pend', 'Pendientes', pendientes.length], ['hechas', 'Hechas', hechas.length]]} />
      {modo === 'pend' && !pendientes.length && <Vacio titulo="Todo hecho">No tienes tareas pendientes. Añade una con el botón +.</Vacio>}
      {modo === 'pend' && (
        <AnimatePresence initial={false}>
          {tramos.map(([nombre, items]) => (
            <motion.section key={nombre} className={`grupo ${nombre === 'Vencidas' ? 'alerta' : ''}`} layout="position" exit={{ opacity: 0 }} transition={MUELLE}>
              <header className="grupo-cabeza"><h2>{nombre}</h2><span>{items.length}</span></header>
              <div className="ramal">
                <AnimatePresence initial={false}>{items.map(t => <FilaTarea key={t.id} t={t} />)}</AnimatePresence>
              </div>
            </motion.section>
          ))}
        </AnimatePresence>
      )}
      {modo === 'hechas' && !hechas.length && <Vacio titulo="Aún nada">Las tareas que completes aparecerán aquí.</Vacio>}
      {modo === 'hechas' && (
        <div className="ramal">
          <AnimatePresence initial={false}>{hechas.map(t => <FilaTarea key={t.id} t={t} />)}</AnimatePresence>
        </div>
      )}
    </>
  );
}
