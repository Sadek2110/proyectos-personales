import { useRef, useState } from 'react';
import { Campo, ConLista, Hoja, Opciones } from './Hoja.jsx';
import { Icono } from './Icono.jsx';
import {
  borrarEvento, borrarProducto, borrarRuta, borrarTarea, crearEvento, esTemporal, guardarProducto, guardarRuta, guardarTarea,
  lsGet, lsSet, marcarTarea, useCalendarios, useDatos,
} from '../datos.js';
import { hoy, nombreDia, pad } from '../fechas.js';
import { useUI } from '../ui.jsx';

const unicos = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const CATEGORIAS_BASE = ['Supermercado', 'Ferretería', 'IKEA', 'Limpieza'];
const PRIORIDADES = ['Alta', 'Media', 'Baja'].map(p => [p, p]);
const COORDENADAS = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
export const MODOS_RUTA = { TRANSIT: 'Transporte público', WALKING: 'A pie', DRIVING: 'Coche' };

export function FormProducto({ producto = { stock: 'Falta' } }) {
  const { aviso } = useUI();
  const compras = useDatos().data?.compras ?? [];
  const nuevo = !producto.id;
  const direccion = useRef(null);
  // Al elegir una tienda conocida, rellena su dirección.
  const alCambiarTienda = e => {
    const conocida = compras.find(x => x.tienda === e.target.value && x.direccion);
    if (conocida && direccion.current && !direccion.current.value) direccion.current.value = conocida.direccion;
  };
  return (
    <Hoja titulo={nuevo ? 'Nuevo producto' : 'Editar producto'} foco={nuevo ? 'producto' : null}
      onGuardar={d => {
        if (!d.producto.trim()) return 'Escribe el nombre del producto.';
        guardarProducto({ ...producto, ...d, producto: d.producto.trim() }).catch(e => aviso(`No se pudo guardar: ${e.message}`));
      }}
      onBorrar={nuevo ? null : () => borrarProducto(producto.id).then(
        () => aviso(`${producto.producto} eliminado`), e => aviso(`No se pudo eliminar: ${e.message}`))}>
      <Campo label="Producto"><input name="producto" defaultValue={producto.producto} placeholder="Leche" /></Campo>
      <Campo label="Categoría">
        <ConLista name="categoria" valor={producto.categoria} opciones={unicos([...CATEGORIAS_BASE, ...compras.map(x => x.categoria)])} ph="Supermercado" />
      </Campo>
      <div className="dos-columnas">
        <Campo label="Tienda"><ConLista name="tienda" valor={producto.tienda} opciones={unicos(compras.map(x => x.tienda))} ph="Lidl" onChange={alCambiarTienda} /></Campo>
        <Campo label="Estado"><Opciones name="stock" opciones={[['Falta', 'Falta'], ['En casa', 'En casa']]} valor={producto.stock} /></Campo>
      </div>
      <Campo label="Dirección" ayuda="Nombre del sitio y ciudad, o la calle. Si no la sabes, déjala vacía.">
        <input ref={direccion} name="direccion" defaultValue={producto.direccion} placeholder="Lidl, Málaga" />
      </Campo>
    </Hoja>
  );
}

export function FormTarea({ tarea = { prioridad: 'Media', completada: false }, titulo, desdeMapa }) {
  const { aviso, abrirHoja, cerrarHoja, dia } = useUI();
  const nuevo = !tarea.id;
  const enCoordenadas = COORDENADAS.test(tarea.ubicacion || '');
  return (
    <Hoja titulo={titulo || (nuevo ? 'Nueva tarea' : 'Editar tarea')} foco={nuevo ? (desdeMapa && !tarea.ubicacion ? 'ubicacion' : 'titulo') : null}
      onGuardar={d => {
        if (!d.titulo.trim()) return 'Escribe qué hay que hacer.';
        if (desdeMapa && !d.ubicacion.trim()) return 'Indica dónde es, o toca un punto del mapa.';
        // Con coordenadas, la chincheta aparece al instante mientras el servidor busca la dirección.
        const m = COORDENADAS.exec(d.ubicacion);
        guardarTarea({ ...tarea, ...d, titulo: d.titulo.trim(), ubicacion: d.ubicacion.trim(), ...(m ? { lat: +m[1], lng: +m[2] } : {}) })
          .catch(e => aviso(`No se pudo guardar: ${e.message}`));
      }}
      onBorrar={nuevo ? null : () => borrarTarea(tarea.id).then(() => aviso('Tarea eliminada'), e => aviso(`No se pudo eliminar: ${e.message}`))}>
      <Campo label="Qué hay que hacer"><input name="titulo" defaultValue={tarea.titulo} placeholder={desdeMapa ? 'Recoger paquete' : 'Empadronarme'} /></Campo>
      <Campo label="Ubicación" ayuda={enCoordenadas ? 'Punto marcado en el mapa: se convertirá en dirección al guardar.' : 'Nombre del sitio y ciudad, o la calle. Aparecerá en el mapa de rutas.'}>
        <input name="ubicacion" defaultValue={tarea.ubicacion} placeholder={desdeMapa ? 'Correos, Málaga' : 'Solo si hay que desplazarse'} />
      </Campo>
      <Campo label="Prioridad"><Opciones name="prioridad" opciones={PRIORIDADES} valor={tarea.prioridad} /></Campo>
      <Campo label="Fecha límite"><input name="fecha" type="datetime-local" defaultValue={tarea.fecha} /></Campo>
      {!nuevo && (
        <button type="button" className="enlace" onClick={() => {
          const hora = tarea.fecha && tarea.fecha.slice(11, 16) !== '00:00' ? tarea.fecha.slice(11, 16) : null;
          abrirHoja(<FormEvento titulo={tarea.titulo} lugar={tarea.ubicacion} fecha={tarea.fecha ? tarea.fecha.slice(0, 10) : dia} hora={hora} />);
        }}><Icono n="cal" s={16} /> Reservar un hueco en el calendario</button>
      )}
      {!nuevo && !tarea.completada && (
        <button type="button" className="enlace" onClick={() => {
          cerrarHoja();
          aviso('Tarea completada', () => marcarTarea(tarea.id, false));
          marcarTarea(tarea.id, true).catch(e => aviso(`No se pudo actualizar: ${e.message}`));
        }}><Icono n="check" s={16} /> Marcar como hecha</button>
      )}
    </Hoja>
  );
}

function calendarioPorDefecto(calendarios) {
  const guardado = lsGet('cal');
  if (calendarios.some(c => c.id === guardado)) return guardado;
  return (calendarios.find(c => c.principal) || calendarios[0])?.id;
}

export function FormEvento({ titulo, lugar, fecha, hora }) {
  const { aviso, dia, setDia, irA } = useUI();
  const calendarios = useCalendarios().data ?? [];
  const elDia = fecha || dia;
  const ini = hora || (elDia === hoy() ? `${pad(Math.min(new Date().getHours() + 1, 23))}:00` : '10:00');
  const [hh, mm] = ini.split(':').map(Number);
  const fin = `${pad(Math.min(hh + 1, 23))}:${pad(hh >= 23 ? 59 : mm)}`;
  return (
    <Hoja titulo="Nuevo evento" textoOk="Añadir al calendario" foco={titulo ? null : 'titulo'}
      onGuardar={d => {
        if (!d.titulo.trim()) return 'Ponle un título.';
        if (!d.fecha || !d.inicio || !d.fin) return 'Indica el día y las horas.';
        if (d.fin <= d.inicio) return 'La hora de fin debe ser posterior a la de inicio.';
        if (d.calendario) lsSet('cal', d.calendario);
        setDia(d.fecha);
        irA('horario');
        crearEvento({ titulo: d.titulo.trim(), inicio: `${d.fecha}T${d.inicio}`, fin: `${d.fecha}T${d.fin}`, lugar: d.lugar.trim(), calendario: d.calendario || '' })
          .then(() => aviso('Añadido a tu calendario'), e => aviso(`No se pudo crear: ${e.message}`));
      }}>
      <Campo label="Título"><input name="titulo" defaultValue={titulo} placeholder="Ir al Lidl" /></Campo>
      <Campo label="Día"><input name="fecha" type="date" defaultValue={elDia} /></Campo>
      <div className="dos-columnas">
        <Campo label="Empieza"><input name="inicio" type="time" defaultValue={ini} /></Campo>
        <Campo label="Termina"><input name="fin" type="time" defaultValue={fin} /></Campo>
      </div>
      <Campo label="Lugar"><input name="lugar" defaultValue={lugar} placeholder="Opcional" /></Campo>
      {calendarios.length > 1 && (
        <Campo label="Calendario">
          <select name="calendario" defaultValue={calendarioPorDefecto(calendarios)}>
            {calendarios.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
      )}
    </Hoja>
  );
}

export function VerEvento({ evento: e }) {
  const { aviso } = useUI();
  const [y, m, d] = e.inicio.slice(0, 10).split('-');
  const hora = e.diaCompleto ? 'Todo el día' : `${e.inicio.slice(11, 16)} a ${e.fin.slice(11, 16)}`;
  return (
    <Hoja titulo={e.titulo} onBorrar={e.recurrente || esTemporal(e.id) ? null : () => borrarEvento(e.id).then(
      () => aviso('Evento eliminado'), err => aviso(`No se pudo eliminar: ${err.message}`))}>
      <div className="detalle"><Icono n="clock" s={18} /><div>{nombreDia(e.inicio.slice(0, 10), true)}<br />{hora}</div></div>
      {e.calendario && <div className="detalle"><Icono n="cal" s={18} /><div>{e.calendario}</div></div>}
      {e.lugar && (
        <div className="detalle"><Icono n="pin" s={18} />
          <a target="_blank" rel="noopener" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.lugar)}`}>{e.lugar}</a>
        </div>
      )}
      {e.recurrente && <div className="detalle"><Icono n="refresh" s={18} /><div>Este evento se repite. Edítalo en Google Calendar.</div></div>}
      <a className="enlace" target="_blank" rel="noopener" href={`https://calendar.google.com/calendar/r/day/${y}/${+m}/${+d}`}><Icono n="ext" s={16} /> Abrir en Google Calendar</a>
    </Hoja>
  );
}

function BotonUbicacion({ destino }) {
  const { aviso } = useUI();
  const [texto, setTexto] = useState('Usar mi ubicación actual');
  const pedir = () => {
    if (!navigator.geolocation) return aviso('Tu navegador no permite usar la ubicación');
    setTexto('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      p => { destino.current.value = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`; setTexto('Ubicación actual añadida'); },
      () => { setTexto('Usar mi ubicación actual'); aviso('No se pudo obtener tu ubicación. Revisa el permiso del navegador.'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  return <button type="button" className="enlace" onClick={pedir}><Icono n="pin" s={16} /> {texto}</button>;
}

/** Guarda fuera del formulario para que «Actualizar horarios» reutilice lo mismo. */
export function calcularRuta(ruta, { aviso, setModoMapa, setRutaSel }) {
  aviso('Calculando la ruta con Google Maps…');
  return guardarRuta(ruta).then(r => {
    setModoMapa('rutas');
    setRutaSel(r.id);
    aviso('Ruta guardada');
  }, e => aviso(e.message));
}

export function FormRuta({ ruta = { modo: 'TRANSIT' } }) {
  const ui = useUI();
  const nueva = !ruta.id;
  const origen = useRef(null);
  return (
    <Hoja titulo={nueva ? 'Nueva ruta' : 'Editar ruta'} textoOk={nueva ? 'Calcular y guardar' : 'Recalcular y guardar'} foco={nueva && !ruta.destino ? 'origen' : null}
      onGuardar={d => {
        if (!d.origen.trim() || !d.destino.trim()) return 'Indica desde dónde y hasta dónde.';
        calcularRuta({ ...ruta, ...d, origen: d.origen.trim(), destino: d.destino.trim(), nombre: d.nombre.trim() }, ui);
      }}
      onBorrar={nueva ? null : () => {
        ui.setRutaSel(null);
        borrarRuta(ruta.id).then(() => ui.aviso('Ruta eliminada'), e => ui.aviso(`No se pudo eliminar: ${e.message}`));
      }}>
      <Campo label="Nombre" ayuda="Opcional. Si lo dejas vacío se usa el origen y el destino.">
        <input name="nombre" defaultValue={ruta.nombre} placeholder="Casa al trabajo" />
      </Campo>
      <Campo label="Desde"><input ref={origen} name="origen" defaultValue={ruta.origen} placeholder="Calle Larios 5, Málaga" /></Campo>
      <BotonUbicacion destino={origen} />
      <Campo label="Hasta"><input name="destino" defaultValue={ruta.destino} placeholder="Estación María Zambrano, Málaga" /></Campo>
      <Campo label="Cómo"><Opciones name="modo" opciones={Object.entries(MODOS_RUTA)} valor={ruta.modo || 'TRANSIT'} /></Campo>
      <Campo label="Hora de salida" ayuda="Vacío para salir en el momento de calcular. Con hora, verás los autobuses de esa hora.">
        <input name="salida" type="time" defaultValue={ruta.salida} />
      </Campo>
    </Hoja>
  );
}
