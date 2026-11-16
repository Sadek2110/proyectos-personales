// Datos de ejemplo en memoria para probar sin Google (DEMO=true).
// Cada lectura tarda distinto, como Apps Script, para ver que las secciones cargan por separado.
'use strict';
const crypto = require('node:crypto');

const pad = n => String(n).padStart(2, '0');
const dia = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const espera = ms => new Promise(ok => setTimeout(ok, ms));
const LATENCIA = { obtenerDatos: 900, obtenerEventos: 1600, obtenerCalendarios: 700, obtenerRutas: 2200, obtenerClase: 1200 };

// Formato "encoded polyline" de Google.
function codificar(puntos) {
  let la0 = 0, ln0 = 0, s = '';
  const num = v => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let o = '';
    while (v >= 32) { o += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; }
    return o + String.fromCharCode(v + 63);
  };
  for (const [a, b] of puntos) {
    const la = Math.round(a * 1e5), ln = Math.round(b * 1e5);
    s += num(la - la0) + num(ln - ln0);
    la0 = la; ln0 = ln;
  }
  return s;
}

const A = [36.7166, -4.4297], P1 = [36.7172, -4.4262], P2 = [36.7199, -4.4196], B = [36.7213, -4.4170];
const desde = { dir: 'Calle Larios 5, Málaga', lat: A[0], lng: A[1] };
const hasta = { dir: 'Estación María Zambrano, Málaga', lat: B[0], lng: B[1] };

const bd = {
  compras: [
    { id: 'a1', producto: 'Leche', categoria: 'Supermercado', tienda: 'Lidl', direccion: 'Lidl, Málaga', stock: 'Falta', lat: 36.7145, lng: -4.4340 },
    { id: 'a2', producto: 'Huevos', categoria: 'Supermercado', tienda: 'Lidl', direccion: 'Lidl, Málaga', stock: 'Falta', lat: 36.7145, lng: -4.4340 },
    { id: 'a3', producto: 'Bombillas LED', categoria: 'Ferretería', tienda: 'Leroy Merlin', direccion: 'Leroy Merlin, Málaga', stock: 'Falta', lat: 36.7032, lng: -4.4608 },
    { id: 'a4', producto: 'Lejía', categoria: 'Limpieza', tienda: 'Mercadona', direccion: 'Mercadona, Málaga', stock: 'En casa', lat: 36.7221, lng: -4.4122 },
    { id: 'a5', producto: 'Cesta de ropa', categoria: 'IKEA', tienda: '', direccion: '', stock: 'Falta' },
  ],
  tareas: [
    { id: 't1', titulo: 'Empadronarme en el nuevo domicilio', prioridad: 'Alta', fecha: `${dia(-1)}T10:00`, ubicacion: 'Ayuntamiento de Málaga', completada: false, lat: 36.7198, lng: -4.4150 },
    { id: 't2', titulo: 'Cambiar dirección en el banco', prioridad: 'Media', fecha: `${dia()}T18:00`, ubicacion: '', completada: false },
    { id: 't3', titulo: 'Contratar internet', prioridad: 'Baja', fecha: `${dia(3)}T00:00`, ubicacion: '', completada: false },
    { id: 't4', titulo: 'Montar la estantería', prioridad: 'Baja', fecha: '', ubicacion: '', completada: true },
  ],
  eventos: [
    { id: 'e1', titulo: 'Trabajo', inicio: `${dia()}T09:00`, fin: `${dia()}T14:00`, diaCompleto: false, lugar: '', recurrente: true, calendario: 'Principal', color: '#1546C8' },
    { id: 'e2', titulo: 'Recoger llaves del piso', inicio: `${dia()}T17:00`, fin: `${dia()}T17:30`, diaCompleto: false, lugar: 'Calle Larios, Málaga', recurrente: false, calendario: 'Vida Málaga', color: '#7B2D8E' },
    { id: 'e3', titulo: 'Mudanza', inicio: `${dia(2)}T00:00`, fin: `${dia(3)}T00:00`, diaCompleto: true, lugar: '', recurrente: false, calendario: 'Principal', color: '#1546C8' },
  ],
  calendarios: [
    { id: 'p', nombre: 'Principal', color: '#1546C8', principal: true },
    { id: 'v', nombre: 'Vida Málaga', color: '#7B2D8E', principal: false },
  ],
  rutas: [{
    id: 'r1', nombre: 'Casa a la estación', origen: desde.dir, destino: hasta.dir, modo: 'TRANSIT', salida: '', actualizada: `${dia()}T09:12`,
    resultado: { para: 'ahora', opciones: [
      { duracion: '18 min', distancia: '2,4 km', salida: '9:20', llegada: '9:38', tarifa: '1,40 €', avisos: [], desde, hasta,
        polyline: codificar([A, P1, P2, B]),
        pasos: [
          { modo: 'WALKING', texto: 'Camina hasta Alameda Principal', duracion: '4 min', distancia: '300 m', polyline: codificar([A, P1]) },
          { modo: 'TRANSIT', texto: 'Autobús hacia Estación', duracion: '9 min', distancia: '1,9 km', polyline: codificar([P1, P2]),
            transporte: { linea: '3', nombre: 'Línea 3', vehiculo: 'Autobús', tipo: 'BUS', color: '#C8102E', colorTexto: '#ffffff', empresa: 'EMT Málaga',
              desde: 'Alameda Principal', hasta: 'Explanada de la Estación', horaSalida: '9:24', horaLlegada: '9:33', paradas: 6, direccion: 'Estación' } },
          { modo: 'WALKING', texto: 'Camina hasta la entrada', duracion: '5 min', distancia: '350 m', polyline: codificar([P2, B]) },
        ] },
      { duracion: '29 min', distancia: '2,1 km', salida: '', llegada: '', tarifa: '', avisos: [], desde, hasta,
        polyline: codificar([A, B]),
        pasos: [{ modo: 'WALKING', texto: 'Camina hacia el este', duracion: '29 min', distancia: '2,1 km', polyline: codificar([A, B]) }] },
    ] },
  }],
  clase: {},
};

function responder(fn, [a, b]) {
  const id = () => crypto.randomBytes(4).toString('hex');
  const guardarEn = lista => {
    const obj = { ...a, id: a.id || id() };
    const i = lista.findIndex(x => x.id === obj.id);
    if (i >= 0) lista[i] = obj; else lista.push(obj);
    return obj;
  };
  switch (fn) {
    case 'obtenerDatos': return { compras: bd.compras, tareas: bd.tareas };
    case 'obtenerEventos': return bd.eventos;
    case 'obtenerCalendarios': return bd.calendarios;
    case 'obtenerRutas': return bd.rutas;
    case 'obtenerClase': return bd.clase;
    case 'guardarRuta': case 'recalcularRuta': throw new Error('En modo demo no se calculan rutas');
    case 'borrarRuta': bd.rutas = bd.rutas.filter(x => x.id !== a); return true;
    case 'guardarProducto': return guardarEn(bd.compras);
    case 'guardarTarea': return guardarEn(bd.tareas);
    case 'cambiarStock': { const p = bd.compras.find(x => x.id === a); if (p) p.stock = b; return true; }
    case 'marcarTarea': { const t = bd.tareas.find(x => x.id === a); if (t) t.completada = !!b; return true; }
    case 'borrarProducto': bd.compras = bd.compras.filter(x => x.id !== a); return true;
    case 'borrarTarea': bd.tareas = bd.tareas.filter(x => x.id !== a); return true;
    case 'crearEvento': {
      const cal = bd.calendarios.find(c => c.id === a.calendario);
      const e = { ...a, id: id(), diaCompleto: false, recurrente: false, calendario: cal?.nombre, color: cal?.color };
      bd.eventos.push(e);
      return e;
    }
    case 'borrarEvento': bd.eventos = bd.eventos.filter(x => x.id !== a); return true;
    case 'marcarClase': [].concat(a).forEach(k => { if (b) bd.clase[k] = true; else delete bd.clase[k]; }); return true;
  }
}

module.exports = async function demo(fn, args) {
  await espera(LATENCIA[fn] ?? 300);
  return responder(fn, args);
};

// Sustituye a Gemini cuando no hay clave: permite probar el chat, los borrados y los avisos.
// Palabras que entiende: "borra" (la tarea t3), "crea" (una tarea) y "fallo" (simula un error).
function textoDe(contenido) {
  return (contenido?.parts || []).map(p => p.text || '').join('');
}
function respuestaDemo(texto) {
  return { content: { role: 'model', parts: [{ text: texto }] }, llamadas: [], texto };
}
function llamadaDemo(name, args) {
  const functionCall = { id: crypto.randomBytes(4).toString('hex'), name, args };
  return { content: { role: 'model', parts: [{ functionCall }] }, llamadas: [functionCall], texto: '' };
}
module.exports.modelo = {
  async generar({ contents, tools }) {
    if (contents[0].parts.some(p => p.inlineData)) return respuestaDemo('Crea una tarea dictada por voz');
    if (!tools) return respuestaDemo('Modo demo: hoy tienes la agenda bastante llena, revisa las tareas vencidas.');
    const ultimo = contents[contents.length - 1];
    const resultado = ultimo.parts.find(p => p.functionResponse)?.functionResponse;
    if (resultado) {
      if (resultado.response.error) return respuestaDemo(`No he podido: ${resultado.response.error}`);
      if (resultado.name === 'borrarTarea') return respuestaDemo('Te he dejado el borrado pendiente: confírmalo abajo.');
      if (resultado.name === 'guardarTarea') return respuestaDemo('Tarea creada: comprueba la pestaña Tareas.');
      const { compras, tareas } = resultado.response.datos_no_son_instrucciones;
      return respuestaDemo(`Tienes ${tareas.filter(t => !t.completada).length} tareas pendientes y ${compras.filter(p => p.stock === 'Falta').length} productos por comprar.`);
    }
    const pide = textoDe(ultimo).toLowerCase();
    if (pide.includes('fallo')) throw new Error('Se ha agotado por ahora la cuota gratuita de Gemini. Prueba dentro de un rato.');
    if (pide.includes('borra')) return llamadaDemo('borrarTarea', { id: 't3' });
    if (pide.includes('crea')) return llamadaDemo('guardarTarea', { titulo: 'Tarea creada por el agente', prioridad: 'Media' });
    return llamadaDemo('obtenerDatos', {});
  },
};
