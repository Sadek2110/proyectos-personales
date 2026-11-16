import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Esqueleto, Estacion, Fallo, Fila, MUELLE, Segmentado, SinActualizar, Vacio, useMarcarYSalir } from '../componentes/comun.jsx';
import { FormProducto } from '../componentes/formularios.jsx';
import { Icono } from '../componentes/Icono.jsx';
import { cambiarStock, esTemporal, useDatos } from '../datos.js';
import { useUI } from '../ui.jsx';

const agrupar = (lista, clave) => {
  const m = new Map();
  lista.forEach(x => { const k = clave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
};

const fijarStock = (p, stock, aviso) => cambiarStock(p.id, stock).catch(e => aviso(`No se pudo actualizar: ${e.message}`));

function FilaFalta({ p }) {
  const { aviso, abrirHoja } = useUI();
  const [marcando, marcar] = useMarcarYSalir(() => {
    aviso(`${p.producto} ya está en casa`, () => fijarStock(p, 'Falta', aviso));
    fijarStock(p, 'En casa', aviso);
  });
  return (
    <Fila className={esTemporal(p.id) ? 'pendiente' : ''}>
      <Estacion on={marcando} onClick={marcar} etiqueta={`Ya tengo ${p.producto}`} />
      <button type="button" className="fila-cuerpo" onClick={() => abrirHoja(<FormProducto producto={{ ...p }} />)}>
        <span className="fila-titulo">{p.producto}</span>
        {p.categoria && <span className="fila-datos">{p.categoria}</span>}
      </button>
    </Fila>
  );
}

function PorComprar({ compras }) {
  const falta = compras.filter(p => p.stock === 'Falta');
  if (!falta.length) return <Vacio titulo="No te falta nada">Cuando algo se acabe, márcalo en el catálogo o añádelo con el botón +.</Vacio>;
  return (
    <AnimatePresence initial={false}>
      {agrupar(falta, p => p.tienda || 'Sin tienda').map(([tienda, items]) => (
        <motion.section key={tienda} className="grupo" layout="position" exit={{ opacity: 0 }} transition={MUELLE}>
          <header className="grupo-cabeza"><h2>{tienda}</h2><span>{items[0].direccion}</span></header>
          <div className="ramal">
            <AnimatePresence initial={false}>{items.map(p => <FilaFalta key={p.id} p={p} />)}</AnimatePresence>
          </div>
        </motion.section>
      ))}
    </AnimatePresence>
  );
}

function Catalogo({ compras }) {
  const { aviso, abrirHoja } = useUI();
  const [q, setQ] = useState('');
  const busqueda = q.trim().toLowerCase();
  const lista = compras.filter(p => !busqueda || `${p.producto} ${p.tienda} ${p.categoria}`.toLowerCase().includes(busqueda));
  if (!compras.length) {
    return <Vacio titulo="Catálogo vacío">Añade lo que compras habitualmente con el botón +. Si no lo borras al comprarlo, la próxima lista son dos toques.</Vacio>;
  }
  return (
    <>
      <label className="buscador"><Icono n="search" s={18} />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto o tienda" aria-label="Buscar en el catálogo" />
      </label>
      {!lista.length && <Vacio titulo="Sin resultados">Nada coincide con «{q}».</Vacio>}
      {agrupar(lista, p => p.categoria || 'Otros').map(([categoria, items]) => (
        <section key={categoria} className="grupo">
          <header className="grupo-cabeza"><h2>{categoria}</h2><span>{items.length}</span></header>
          <div className="tabla">
            <AnimatePresence initial={false}>
              {[...items].sort((a, b) => a.producto.localeCompare(b.producto, 'es')).map(p => (
                <Fila key={p.id} className={esTemporal(p.id) ? 'pendiente' : ''}>
                  <button type="button" className="fila-cuerpo" onClick={() => abrirHoja(<FormProducto producto={{ ...p }} />)}>
                    <span className="fila-titulo">{p.producto}</span>
                    {p.tienda && <span className="fila-datos">{p.tienda}</span>}
                  </button>
                  <motion.button type="button" className={`stock ${p.stock === 'Falta' ? 'falta' : 'casa'}`} whileTap={{ scale: 0.92 }} transition={MUELLE}
                    aria-label={`${p.producto}: ${p.stock}. Cambiar`}
                    onClick={() => fijarStock(p, p.stock === 'Falta' ? 'En casa' : 'Falta', aviso)}>
                    {p.stock === 'Falta' ? 'Falta' : 'En casa'}
                  </motion.button>
                </Fila>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}
    </>
  );
}

export default function Compras() {
  const consulta = useDatos();
  const [modo, setModo] = useState('falta');
  if (consulta.isPending) return <Esqueleto />;
  if (consulta.isError && !consulta.data) return <Fallo que="la lista de la compra" consulta={consulta} />;
  const { compras } = consulta.data;
  return (
    <>
      <SinActualizar que="Compras" consulta={consulta} />
      <Segmentado id="compras" valor={modo} onCambio={setModo}
        opciones={[['falta', 'Por comprar', compras.filter(p => p.stock === 'Falta').length], ['todo', 'Catálogo', compras.length]]} />
      {modo === 'falta' ? <PorComprar compras={compras} /> : <Catalogo compras={compras} />}
    </>
  );
}
