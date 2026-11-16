import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './mapa.css';
import { AnimatePresence, motion } from 'motion/react';
import { Esqueleto, Fallo, MUELLE, Segmentado } from '../componentes/comun.jsx';
import { FormRuta, FormTarea, MODOS_RUTA, calcularRuta } from '../componentes/formularios.jsx';
import { Icono, iconoHtml } from '../componentes/Icono.jsx';
import { esTemporal, useDatos, useRutas } from '../datos.js';
import { fechaCorta, nombreDia } from '../fechas.js';
import { useUI } from '../ui.jsx';
import { ordenTareas } from './Tareas.jsx';

const CENTRO_MALAGA = [36.7213, -4.4214];
const MODO_GMAPS = { TRANSIT: 'transit', WALKING: 'walking', DRIVING: 'driving' };
const color = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const quietoPorPreferencia = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Decodifica el formato "encoded polyline" de Google en [[lat, lng], ...]. */
function decodificar(str) {
  const out = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, s = 0, r = 0;
      do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32);
      const d = r & 1 ? ~(r >> 1) : r >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

/** Ordena los puntos por cercanía (vecino más próximo) y crea el enlace de Google Maps. */
function urlRecorrido(puntos) {
  if (!puntos.length) return undefined;
  const resto = puntos.slice(1), ruta = [puntos[0]];
  while (resto.length) {
    const [la, ln] = ruta[ruta.length - 1];
    let mejor = 0;
    resto.forEach((p, i) => { if ((p[0] - la) ** 2 + (p[1] - ln) ** 2 < (resto[mejor][0] - la) ** 2 + (resto[mejor][1] - ln) ** 2) mejor = i; });
    ruta.push(resto.splice(mejor, 1)[0]);
  }
  const f = p => p.join(',');
  const destino = ruta.pop();
  const paradas = ruta.slice(0, 9).map(f).join('|');
  return `https://www.google.com/maps/dir/?api=1&destination=${f(destino)}${paradas ? `&waypoints=${encodeURIComponent(paradas)}` : ''}`;
}

const pin = (clase, txt) => L.divIcon({ className: '', html: `<div class="pin ${clase}"><b>${txt}</b></div>`, iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] });

/** Deja sitio al panel: abajo en móvil, a la izquierda en PC. */
function margenPanel() {
  return matchMedia('(min-width: 900px)').matches
    ? { paddingTopLeft: [440, 40], paddingBottomRight: [40, 40], maxZoom: 16 }
    : { paddingTopLeft: [30, 70], paddingBottomRight: [30, Math.round(innerHeight * 0.5)], maxZoom: 16 };
}

function tiendasConFaltas(compras) {
  const tiendas = new Map();
  compras.filter(p => p.stock === 'Falta' && p.direccion).forEach(p => {
    const k = p.lat != null ? `${p.lat},${p.lng}` : `x:${p.direccion}`;
    if (!tiendas.has(k)) tiendas.set(k, { nombre: p.tienda || p.direccion, lat: p.lat, lng: p.lng, items: [] });
    tiendas.get(k).items.push(p.producto);
  });
  return [...tiendas.values()];
}

function ChipLinea({ t }) {
  return (
    <span className="chip-linea" style={{ background: t.color || 'var(--l-rutas)', color: t.colorTexto || '#fff' }}>
      <Icono n={t.tipo === 'BUS' || !t.tipo ? 'bus' : 'train'} s={13} />{t.linea || t.vehiculo}
    </span>
  );
}

/** Resumen de una opción: a pie, línea 3, a pie. */
function ResumenOpcion({ o }) {
  const partes = [];
  o.pasos.forEach(p => {
    if (p.modo === 'TRANSIT' && p.transporte) partes.push({ linea: p.transporte });
    else if (p.modo === 'WALKING' && partes.at(-1)?.icono !== 'walk') partes.push({ icono: 'walk' });
    else if (p.modo === 'DRIVING' && partes.at(-1)?.icono !== 'car') partes.push({ icono: 'car' });
  });
  return (
    <span className="resumen">
      {partes.map((p, i) => (
        <span key={i} className="resumen-parte">
          {i > 0 && <Icono n="next" s={12} />}
          {p.linea ? <ChipLinea t={p.linea} /> : <Icono n={p.icono} s={16} />}
        </span>
      ))}
    </span>
  );
}

function ListaRutas({ rutas }) {
  const { abrirHoja, setRutaSel } = useUI();
  return (
    <>
      <div className="panel-cabeza">
        <div><h3>Mis rutas</h3><p>Trayectos guardados con horarios de Google Maps</p></div>
        <button type="button" className="btn btn-linea btn-peq" onClick={() => abrirHoja(<FormRuta />)}><Icono n="plus" s={18} /> Nueva</button>
      </div>
      {!rutas.length && <p className="panel-vacio">Guarda un trayecto como «Casa al trabajo» y verás qué autobús coger, dónde subir y bajar, y a qué hora pasa.</p>}
      {rutas.map(x => {
        const o = x.resultado?.opciones?.[0];
        return (
          <button key={x.id} type="button" className={`ruta ${esTemporal(x.id) ? 'pendiente' : ''}`} onClick={() => setRutaSel(x.id)}>
            <span className="ruta-cuerpo">
              <span className="fila-titulo">{x.nombre}</span>
              {o ? <ResumenOpcion o={o} /> : <span className="fila-datos">{MODOS_RUTA[x.modo]}</span>}
            </span>
            <span className="ruta-dur">{o && <b>{o.duracion}</b>}<span>{x.salida ? `sale ${x.salida}` : MODOS_RUTA[x.modo]}</span></span>
          </button>
        );
      })}
    </>
  );
}

function Paso({ p }) {
  if (p.modo === 'TRANSIT' && p.transporte) {
    const t = p.transporte;
    return (
      <li className="paso transporte" style={{ '--lc': t.color || 'var(--l-rutas)' }}>
        <i className="nudo"><Icono n="bus" s={16} /></i>
        <div>
          <ChipLinea t={t} /> <span className="fila-datos en-linea">{t.direccion ? `dirección ${t.direccion}` : t.nombre}</span>
          <div className="parada-hora"><b>{t.horaSalida}</b> Sube en <b>{t.desde}</b></div>
          <div className="fila-datos">{t.paradas} parada{t.paradas === 1 ? '' : 's'}, {p.duracion}{t.empresa ? `, ${t.empresa}` : ''}</div>
          <div className="parada-hora"><b>{t.horaLlegada}</b> Baja en <b>{t.hasta}</b></div>
        </div>
      </li>
    );
  }
  return (
    <li className={`paso ${p.modo === 'DRIVING' ? 'coche' : 'a-pie'}`}>
      <i className="nudo"><Icono n={p.modo === 'DRIVING' ? 'car' : 'walk'} s={16} /></i>
      <div>
        <span>{p.texto || (p.modo === 'WALKING' ? 'Camina' : 'Conduce')}</span>
        <div className="fila-datos">{p.duracion}, {p.distancia}</div>
      </div>
    </li>
  );
}

function DetalleRuta({ r, opcion, setOpcion }) {
  const ui = useUI();
  const opciones = r.resultado?.opciones || [];
  const i = Math.min(opcion, Math.max(opciones.length - 1, 0));
  const o = opciones[i];
  const gmaps = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(r.origen)}&destination=${encodeURIComponent(r.destino)}&travelmode=${MODO_GMAPS[r.modo] || 'transit'}`;
  const calculada = r.actualizada ? `${nombreDia(r.actualizada.slice(0, 10))} a las ${r.actualizada.slice(11, 16)}` : '';
  const salir = r.resultado?.para === 'ahora' || !r.resultado ? 'para salir en ese momento' : `para salir a las ${r.resultado.para}`;
  return (
    <>
      <div className="panel-cabeza">
        <button type="button" className="boton-icono" aria-label="Volver a mis rutas" onClick={() => ui.setRutaSel(null)}><Icono n="back" /></button>
        <div><h3>{r.nombre}</h3><p>{MODOS_RUTA[r.modo]}{r.salida ? `, salida ${r.salida}` : ''}</p></div>
        <button type="button" className="boton-icono" aria-label="Editar ruta" onClick={() => ui.abrirHoja(<FormRuta ruta={{ ...r }} />)}><Icono n="edit" s={20} /></button>
      </div>
      {opciones.length > 1 && (
        <div className="alternativas">
          {opciones.map((x, k) => (
            <button key={k} type="button" className={k === i ? 'on' : ''} aria-pressed={k === i} onClick={() => setOpcion(k)}>
              {k === i && <motion.span layoutId="alternativa" className="alt-marco" transition={MUELLE} />}
              <b>{x.duracion}</b><ResumenOpcion o={x} />
            </button>
          ))}
        </div>
      )}
      {o ? (
        <>
          <div className="ruta-resumen"><b>{o.duracion}</b><span>{o.salida ? `${o.salida} a ${o.llegada}, ` : ''}{o.distancia}{o.tarifa ? `, ${o.tarifa}` : ''}</span></div>
          <ol className="pasos">
            <li className="paso extremo"><i className="nudo a">A</i><div><b>{o.desde.dir}</b></div></li>
            {o.pasos.map((p, k) => <Paso key={k} p={p} />)}
            <li className="paso extremo"><i className="nudo b">B</i><div><b>{o.hasta.dir}</b></div></li>
          </ol>
          {o.avisos.length > 0 && <p className="nota-aviso">{o.avisos.map((a, k) => <span key={k}>{a}<br /></span>)}</p>}
        </>
      ) : <p className="nota-aviso">Esta ruta no tiene datos. Pulsa «Actualizar horarios».</p>}
      <p className="fila-datos nota-calculo">Calculada {calculada} {salir}. Los horarios cambian: actualiza antes de salir.</p>
      <div className="panel-acciones">
        <button type="button" className="btn btn-linea" onClick={() => calcularRuta({ ...r }, ui)}><Icono n="refresh" s={18} /> Actualizar horarios</button>
        <a className="btn btn-suave" href={gmaps} target="_blank" rel="noopener"><Icono n="ext" s={18} /> Google Maps</a>
      </div>
    </>
  );
}

export default function Mapa({ activa }) {
  const ui = useUI();
  const { abrirHoja, modoMapa, setModoMapa, rutaSel, setRutaSel } = ui;
  const datos = useDatos();
  const rutasQ = useRutas();
  const rutas = rutasQ.data ?? [];
  const [capas, setCapas] = useState({ t: true, s: true });
  const [opcion, setOpcion] = useState(0);
  const nodo = useRef(null);
  const mapa = useRef(null);
  const encuadre = useRef('');

  const tareas = useMemo(() => (datos.data?.tareas ?? []).filter(t => !t.completada && t.ubicacion), [datos.data]);
  const tiendas = useMemo(() => tiendasConFaltas(datos.data?.compras ?? []), [datos.data]);
  const sinUbicar = tareas.filter(t => t.lat == null).length + tiendas.filter(s => s.lat == null).length;
  const puntos = useMemo(() => [
    ...(capas.t ? tareas.filter(t => t.lat != null).map(t => [t.lat, t.lng]) : []),
    ...(capas.s ? tiendas.filter(s => s.lat != null).map(s => [s.lat, s.lng]) : []),
  ], [capas, tareas, tiendas]);
  const ruta = rutas.find(x => x.id === rutaSel);

  // Los globos son HTML de Leaflet: sus botones llegan aquí por delegación.
  const acciones = useRef({});
  acciones.current = {
    crearRuta: coords => { mapa.current.m.closePopup(); abrirHoja(<FormRuta ruta={{ modo: 'TRANSIT', destino: coords }} />); },
    crearParada: coords => {
      mapa.current.m.closePopup();
      abrirHoja(<FormTarea tarea={{ prioridad: 'Media', completada: false, ubicacion: coords }} titulo="Nueva parada" desdeMapa />);
    },
    llegar: id => {
      const t = datos.data?.tareas.find(x => x.id === id);
      if (!t) return;
      mapa.current.m.closePopup();
      setModoMapa('rutas');
      abrirHoja(<FormRuta ruta={{ modo: 'TRANSIT', destino: t.ubicacion, nombre: t.titulo }} />);
    },
    editar: id => {
      const t = datos.data?.tareas.find(x => x.id === id);
      if (t) abrirHoja(<FormTarea tarea={{ ...t }} />);
    },
  };
  const modoActual = useRef(modoMapa);
  modoActual.current = modoMapa;
  const seleccionActual = useRef(rutaSel);
  seleccionActual.current = rutaSel;

  useEffect(() => {
    const m = L.map(nodo.current, { zoomControl: false, attributionControl: false }).setView(CENTRO_MALAGA, 13);
    // Arriba a la derecha: abajo la taparía el panel de rutas.
    L.control.attribution({ position: 'topright' }).addTo(m);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(m);
    const paradas = L.layerGroup().addTo(m);
    const trazado = L.layerGroup().addTo(m);
    mapa.current = { m, paradas, trazado };

    m.on('click', ev => {
      if (modoActual.current === 'rutas' && seleccionActual.current) return;
      const coords = `${ev.latlng.lat.toFixed(6)}, ${ev.latlng.lng.toFixed(6)}`;
      L.popup().setLatLng(ev.latlng).setContent(modoActual.current === 'rutas'
        ? `<h4>¿Cómo llegar aquí?</h4><span>Calcula y guarda la ruta en bus, a pie o en coche.</span>
           <button class="btn btn-linea" data-accion="crearRuta" data-id="${coords}">${iconoHtml('route')} Crear ruta</button>`
        : `<h4>¿Añadir una parada aquí?</h4><span>Se guardará como recado en Tareas.</span>
           <button class="btn btn-linea" data-accion="crearParada" data-id="${coords}">${iconoHtml('plus')} Añadir parada</button>`)
        .openOn(m);
    });
    const alPulsar = e => {
      const b = e.target.closest('[data-accion]');
      if (b) acciones.current[b.dataset.accion](b.dataset.id);
    };
    const contenedor = m.getContainer();
    contenedor.addEventListener('click', alPulsar);
    return () => { contenedor.removeEventListener('click', alPulsar); m.remove(); };
  }, []);

  useEffect(() => { if (activa) mapa.current.m.invalidateSize(); }, [activa]);

  // Solo reencuadra si cambia lo que se ve; marcar una tarea no debe mover el mapa.
  const encuadrar = (pts, opciones) => {
    const firma = JSON.stringify(pts);
    if (!pts.length || firma === encuadre.current) return;
    encuadre.current = firma;
    mapa.current.m.flyToBounds(pts, { ...opciones, duration: 0.7, animate: !quietoPorPreferencia() });
  };

  useEffect(() => {
    if (!activa) return;
    const { paradas, trazado } = mapa.current;
    paradas.clearLayers();
    trazado.clearLayers();
    if (modoMapa === 'paradas') {
      if (capas.t) [...tareas].filter(t => t.lat != null).sort(ordenTareas).forEach(t => {
        L.marker([t.lat, t.lng], { icon: pin('pin-tarea', '') }).addTo(paradas).bindPopup(`
          <h4>${esc(t.titulo)}</h4>${t.fecha ? `${esc(fechaCorta(t.fecha))}<br>` : ''}<span>${esc(t.ubicacion)}</span>
          ${esTemporal(t.id) ? '' : `<button class="btn btn-linea" data-accion="llegar" data-id="${esc(t.id)}">${iconoHtml('route', 16)} Cómo llegar</button>
          <button class="btn btn-suave" data-accion="editar" data-id="${esc(t.id)}">Editar o completar</button>`}`);
      });
      if (capas.s) tiendas.filter(s => s.lat != null).forEach(s => {
        L.marker([s.lat, s.lng], { icon: pin('pin-tienda', s.items.length) }).addTo(paradas)
          .bindPopup(`<h4>${esc(s.nombre)}</h4><ul>${s.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`);
      });
      encuadrar(puntos, { padding: [50, 50], maxZoom: 15 });
      return;
    }
    const azul = color('--l-rutas');
    if (!ruta) {
      const pts = [];
      rutas.forEach(x => {
        const o = x.resultado?.opciones?.[0];
        if (!o) return;
        pts.push([o.desde.lat, o.desde.lng], [o.hasta.lat, o.hasta.lng]);
        L.polyline(decodificar(o.polyline || ''), { color: azul, weight: 3, opacity: 0.5 }).addTo(trazado);
      });
      encuadrar(pts, margenPanel());
      return;
    }
    const opciones = ruta.resultado?.opciones || [];
    const o = opciones[Math.min(opcion, Math.max(opciones.length - 1, 0))];
    if (!o) return;
    const pts = [];
    if (o.pasos.every(p => p.polyline)) {
      o.pasos.forEach(p => {
        const linea = decodificar(p.polyline);
        pts.push(...linea);
        if (p.modo === 'TRANSIT') {
          const c = p.transporte?.color || azul;
          L.polyline(linea, { color: '#fff', weight: 9, opacity: 0.9 }).addTo(trazado);
          L.polyline(linea, { color: c, weight: 6 }).addTo(trazado);
          L.circleMarker(linea[0], { radius: 6, color: '#fff', weight: 2, fillColor: c, fillOpacity: 1 }).addTo(trazado)
            .bindPopup(`<h4>${esc(p.transporte?.desde)}</h4>${esc(p.transporte?.horaSalida)}, línea ${esc(p.transporte?.linea)}`);
        } else {
          L.polyline(linea, { color: p.modo === 'DRIVING' ? azul : color('--texto-suave'), weight: 4, dashArray: p.modo === 'WALKING' ? '2 8' : null, lineCap: 'round' }).addTo(trazado);
        }
      });
    } else {
      const l = decodificar(o.polyline || '');
      pts.push(...l);
      L.polyline(l, { color: azul, weight: 5 }).addTo(trazado);
    }
    L.marker([o.desde.lat, o.desde.lng], { icon: pin('pin-tienda', 'A') }).addTo(trazado);
    L.marker([o.hasta.lat, o.hasta.lng], { icon: pin('pin-tarea', 'B') }).addTo(trazado);
    encuadrar(pts, margenPanel());
  }, [activa, modoMapa, capas, tareas, tiendas, puntos, rutas, ruta, opcion]);

  useEffect(() => { setOpcion(0); }, [rutaSel]);
  useEffect(() => { if (rutaSel && rutasQ.data && !ruta) setRutaSel(null); }, [rutaSel, rutasQ.data, ruta, setRutaSel]);

  const url = urlRecorrido(puntos);
  return (
    <div className="mapa-vista">
      <div ref={nodo} className="lienzo" />
      <div className="mapa-arriba">
        <Segmentado id="mapa" valor={modoMapa} onCambio={setModoMapa} opciones={[['paradas', 'Paradas'], ['rutas', 'Mis rutas', rutas.length || null]]} />
        {modoMapa === 'paradas' && (
          <div className="capas">
            <button type="button" className={capas.t ? '' : 'off'} aria-pressed={capas.t} onClick={() => setCapas(c => ({ ...c, t: !c.t }))}><i className="capa-tarea" />Recados {tareas.length}</button>
            <button type="button" className={capas.s ? '' : 'off'} aria-pressed={capas.s} onClick={() => setCapas(c => ({ ...c, s: !c.s }))}><i className="capa-tienda" />Tiendas {tiendas.length}</button>
          </div>
        )}
      </div>

      {modoMapa === 'paradas' && (
        <>
          {datos.isError && !datos.data && <div className="mapa-centro"><Fallo que="las paradas" consulta={datos} /></div>}
          {datos.data && !puntos.length && (
            <div className="mapa-centro nota-mapa"><b>Aún no hay paradas</b><span>Toca un punto del mapa para añadir un recado. Las tiendas donde te falta algo aparecen solas.</span></div>
          )}
          <div className="mapa-abajo">
            {sinUbicar > 0 && <span className="nota-ubicar">{sinUbicar} sin ubicar: revisa la dirección</span>}
            <a className={`btn btn-linea ${url ? '' : 'inactivo'}`} href={url} aria-disabled={!url} target="_blank" rel="noopener"><Icono n="route" s={20} /> Ruta en Google Maps</a>
          </div>
        </>
      )}

      <AnimatePresence initial={false}>
        {modoMapa === 'rutas' && (
          <motion.aside key="panel" className="panel-rutas" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={MUELLE}>
            {rutasQ.isPending && <Esqueleto filas={2} />}
            {rutasQ.isError && !rutasQ.data && <Fallo que="tus rutas" consulta={rutasQ} />}
            {rutasQ.data && (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={ruta ? ruta.id : 'lista'} initial={{ opacity: 0, x: ruta ? 18 : -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: ruta ? -12 : 12 }} transition={{ duration: 0.14 }}>
                  {ruta ? <DetalleRuta r={ruta} opcion={opcion} setOpcion={setOpcion} /> : <ListaRutas rutas={rutas} />}
                </motion.div>
              </AnimatePresence>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
