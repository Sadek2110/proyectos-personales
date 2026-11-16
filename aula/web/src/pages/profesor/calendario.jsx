import { useState } from 'react';
import { Boton, Campo, ConDatos, Icono, Modal, Tarjeta, Titulo, Vacio, useAviso } from '../../components/ui.jsx';
import { api, useApi } from '../../lib/api.js';
import { fechaLarga, hoyISO } from '../../lib/formato.js';

const TIPOS = { aviso: ['campaign', 'Aviso'], festivo: ['beach_access', 'Día sin clase'], examen: ['quiz', 'Examen'] };

export function AvisosCalendario() {
  const consulta = useApi('/eventos');
  const avisar = useAviso();
  const [form, setForm] = useState(null);

  async function guardar(e) {
    e.preventDefault();
    try {
      form.id ? await api.put(`/eventos/${form.id}`, form) : await api.post('/eventos', form);
      avisar('Guardado. Ya aparece en el calendario del alumnado.');
      setForm(null);
      consulta.recargar();
    } catch (err) {
      avisar(err.message, 'error');
    }
  }

  async function borrar(id) {
    if (!confirm('¿Borrar este aviso?')) return;
    await api.del(`/eventos/${id}`).catch((err) => avisar(err.message, 'error'));
    consulta.recargar();
  }

  return (
    <>
      <Titulo titulo="Avisos del calendario" subtitulo="Las clases y las fechas de entrega salen solas en el calendario. Aquí añades avisos, días sin clase o exámenes."
        accion={<Boton icono="add" onClick={() => setForm({ fecha: hoyISO(), titulo: '', detalle: '', tipo: 'aviso' })}>Nuevo aviso</Boton>} />
      <ConDatos consulta={consulta}>
        {(lista) => lista.length === 0 ? <Vacio icono="event_note" titulo="No hay avisos" /> : (
          <div className="flex flex-col gap-3">
            {lista.map((ev) => (
              <Tarjeta key={ev.id} className="flex flex-wrap items-center gap-4 p-4">
                <Icono nombre={TIPOS[ev.tipo][0]} className="text-3xl text-marca" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-texto-2">{fechaLarga(ev.fecha)} · {TIPOS[ev.tipo][1]}</p>
                  <p className="text-lg font-bold">{ev.titulo}</p>
                  {ev.detalle && <p className="text-texto-2">{ev.detalle}</p>}
                </div>
                <Boton variante="texto" icono="edit" onClick={() => setForm({ ...ev, detalle: ev.detalle ?? '' })}>Editar</Boton>
                <Boton variante="texto" icono="delete" onClick={() => borrar(ev.id)} aria-label="Borrar" />
              </Tarjeta>
            ))}
          </div>
        )}
      </ConDatos>
      <Modal abierto={Boolean(form)} cerrar={() => setForm(null)} titulo={form?.id ? 'Editar aviso' : 'Nuevo aviso'}>
        {form && (
          <form onSubmit={guardar} className="flex flex-col gap-4">
            <Campo etiqueta="Fecha" tipo="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            <Campo etiqueta="Tipo" tipo="select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {Object.entries(TIPOS).map(([k, [, t]]) => <option key={k} value={k}>{t}</option>)}
            </Campo>
            <Campo etiqueta="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
            <Campo etiqueta="Detalle" tipo="area" value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} />
            <div className="flex justify-end gap-3"><Boton variante="neutro" onClick={() => setForm(null)}>Cancelar</Boton><Boton type="submit">Guardar</Boton></div>
          </form>
        )}
      </Modal>
    </>
  );
}
