import { useEffect, useState } from 'react';
import { Boton, Campo, ConDatos, Icono, Modal, Titulo, useAviso } from '../../components/ui.jsx';
import { api, useApi } from '../../lib/api.js';

function valorCelda(v) {
  if (v === null || v === undefined || v === '') return <span className="text-texto-2">—</span>;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function Formulario({ def, fila, cerrar, guardado }) {
  const avisar = useAviso();
  const creando = !fila;
  const [f, setF] = useState(() => Object.fromEntries(Object.entries(def.columnas).map(([k, c]) => [k, fila?.[k] ?? (c.tipo === 'bool' ? true : '')])));
  const [enviando, setEnviando] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      const id = fila?.[def.pk];
      creando ? await api.post(`/admin/tablas/${def.nombre}`, f) : await api.put(`/admin/tablas/${def.nombre}/${encodeURIComponent(id)}`, f);
      avisar('Guardado.');
      guardado();
    } catch (err) {
      avisar(err.message, 'error');
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      {Object.entries(def.columnas).map(([k, c]) => {
        if (c.tipo === 'soloLectura') {
          return creando ? null : <Campo key={k} etiqueta={k} value={fila[k] ?? ''} disabled readOnly />;
        }
        if (k === def.pk && !creando && !def.pkEditable) return null;
        const props = { etiqueta: `${k}${c.requerido ? ' *' : ''}`, ayuda: c.ayuda, value: f[k] ?? '', onChange: (e) => setF({ ...f, [k]: e.target.value }) };
        if (c.tipo === 'bool') {
          return <label key={k} className="flex items-center gap-3 font-bold"><input type="checkbox" className="size-6 accent-marca" checked={Boolean(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{k}</label>;
        }
        if (c.tipo === 'opcion') return <Campo key={k} {...props} tipo="select"><option value="">—</option>{c.opciones.map((o) => <option key={o} value={o}>{o}</option>)}</Campo>;
        if (c.tipo === 'largo') return <Campo key={k} {...props} tipo="area" />;
        if (c.tipo === 'fecha') return <Campo key={k} {...props} tipo="date" />;
        if (c.tipo === 'hora') return <Campo key={k} {...props} tipo="time" />;
        if (c.tipo === 'numero') return <Campo key={k} {...props} inputMode="decimal" />;
        if (c.tipo === 'password') return <Campo key={k} {...props} tipo="password" autoComplete="new-password" />;
        return <Campo key={k} {...props} />;
      })}
      <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-3 border-t border-borde bg-white p-4">
        <Boton variante="neutro" onClick={cerrar}>Cancelar</Boton>
        <Boton type="submit" cargando={enviando}>{creando ? 'Crear' : 'Guardar cambios'}</Boton>
      </div>
    </form>
  );
}

export function Datos() {
  const tablas = useApi('/admin/tablas');
  const [tabla, setTabla] = useState('usuarios');
  const [buscar, setBuscar] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const filas = useApi(`/admin/tablas/${tabla}?buscar=${encodeURIComponent(busqueda)}&pagina=${pagina}`);
  const [editando, setEditando] = useState(null); // 'nuevo' | fila
  const avisar = useAviso();

  useEffect(() => {
    const t = setTimeout(() => { setBusqueda(buscar); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [buscar]);

  async function borrar(def, fila) {
    const id = fila[def.pk];
    if (!confirm(`¿Borrar el registro ${id} de ${def.titulo}? Si tiene datos relacionados puede que no se pueda.`)) return;
    try {
      await api.del(`/admin/tablas/${def.nombre}/${encodeURIComponent(id)}`);
      avisar('Registro borrado.');
      filas.recargar();
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  return (
    <ConDatos consulta={tablas}>
      {(lista) => {
        const def = lista.find((t) => t.nombre === tabla);
        const columnas = Object.keys(def.columnas).filter((c) => def.columnas[c].tipo !== 'password' && def.columnas[c].tipo !== 'largo').slice(0, 7);
        return (
          <>
            <Titulo titulo="Gestión de datos" subtitulo="Acceso completo a todos los registros. Los cambios se aplican al momento." accion={<Boton icono="add" onClick={() => setEditando('nuevo')}>Nuevo registro</Boton>} />
            <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
              {lista.map((t) => (
                <button key={t.nombre} type="button" onClick={() => { setTabla(t.nombre); setPagina(1); setBuscar(''); }}
                  className={`min-h-11 shrink-0 rounded-xl border-2 px-4 font-bold ${tabla === t.nombre ? 'border-marca bg-marca text-white' : 'border-borde bg-white hover:bg-fondo'}`}>{t.titulo}</button>
              ))}
            </div>
            <Campo className="mb-4" placeholder="Buscar…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            <ConDatos consulta={filas}>
              {(d) => (
                <>
                  <div className="overflow-x-auto rounded-2xl border border-borde bg-white shadow-sm">
                    <table className="w-full text-left text-base">
                      <thead className="border-b border-borde bg-fondo text-sm text-texto-2">
                        <tr>{columnas.map((c) => <th key={c} className="px-3 py-3 whitespace-nowrap">{c}</th>)}<th className="px-3 py-3 text-right">Acciones</th></tr>
                      </thead>
                      <tbody>
                        {d.filas.map((fila) => (
                          <tr key={fila[def.pk]} className="border-b border-borde last:border-0 hover:bg-fondo/60">
                            {columnas.map((c) => <td key={c} className="px-3 py-2.5 whitespace-nowrap">{valorCelda(fila[c])}</td>)}
                            <td className="px-3 py-1.5 text-right whitespace-nowrap">
                              <button type="button" onClick={() => setEditando(fila)} className="inline-flex size-11 items-center justify-center rounded-lg text-marca-oscuro hover:bg-marca-suave" aria-label="Editar"><Icono nombre="edit" /></button>
                              <button type="button" onClick={() => borrar(def, fila)} className="inline-flex size-11 items-center justify-center rounded-lg text-marca-oscuro hover:bg-marca-suave" aria-label="Borrar"><Icono nombre="delete" /></button>
                            </td>
                          </tr>
                        ))}
                        {d.filas.length === 0 && <tr><td colSpan={columnas.length + 1} className="p-6 text-center text-texto-2">No hay registros.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-texto-2">
                    <span>{d.total} registros</span>
                    <div className="flex items-center gap-2">
                      <Boton variante="neutro" pequeno icono="chevron_left" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)} aria-label="Anterior" />
                      <span>Página {pagina} de {Math.max(1, Math.ceil(d.total / d.porPagina))}</span>
                      <Boton variante="neutro" pequeno icono="chevron_right" disabled={pagina * d.porPagina >= d.total} onClick={() => setPagina(pagina + 1)} aria-label="Siguiente" />
                    </div>
                  </div>
                </>
              )}
            </ConDatos>
            <Modal abierto={Boolean(editando)} cerrar={() => setEditando(null)} titulo={editando === 'nuevo' ? `Nuevo en ${def.titulo}` : `Editar ${def.titulo.toLowerCase()}`} ancho="max-w-2xl">
              {editando && <Formulario def={def} fila={editando === 'nuevo' ? null : editando} cerrar={() => setEditando(null)} guardado={() => { setEditando(null); filas.recargar(); }} />}
            </Modal>
          </>
        );
      }}
    </ConDatos>
  );
}
