// Lista única de herramientas: la usan el agente con Gemini y el servidor MCP.
'use strict';
const { ahoraLocal, sumarDias } = require('./hora.js');
const { crearAlmacenTemario } = require('./temario.js');
const { CLASE, calcularMediaModulo, esActividad, hechoItem, novedadesRecientes } = require('../src/clase.mjs');

const FECHA_HORA = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$', description: 'Hora local, formato yyyy-MM-ddTHH:mm' };
const SOLO_ID = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] };
const SIN_ARGUMENTOS = { type: 'object', properties: {} };

const cargarTemario = () => import('../src/clase.mjs');

/** Comprueba lo que manda el modelo o el cliente MCP, y descarta los campos desconocidos. */
function validar(esquema, args) {
  const entrada = args && typeof args === 'object' ? args : {};
  for (const campo of esquema.required || []) {
    if (entrada[campo] === undefined || entrada[campo] === '') throw new Error(`Falta el campo "${campo}"`);
  }
  const limpio = {};
  for (const [campo, regla] of Object.entries(esquema.properties || {})) {
    const v = entrada[campo];
    if (v === undefined) continue;
    const tipo = Array.isArray(v) ? 'array' : typeof v;
    const esperado = String(regla.type || '').toLowerCase() === 'integer' ? 'number' : String(regla.type || '').toLowerCase();
    if (tipo !== esperado) throw new Error(`El campo "${campo}" debe ser de tipo ${regla.type}`);
    if (regla.enum && !regla.enum.includes(v)) throw new Error(`El campo "${campo}" debe ser uno de: ${regla.enum.join(', ')}`);
    if (regla.pattern && v !== '' && !new RegExp(regla.pattern).test(v)) throw new Error(`El campo "${campo}" no tiene el formato correcto: ${regla.description || regla.pattern}`);
    if (regla.items && v.some(x => typeof x !== regla.items.type)) throw new Error(`El campo "${campo}" contiene valores no válidos`);
    limpio[campo] = v;
  }
  return limpio;
}

/** Entregas y pruebas sin hacer, con fecha. También las usan los avisos. */
function actividadesPendientes(temario, hecho, tareas, modulos = temario.CLASE, mapaIds = {}) {
  const salida = [];
  temario.recorrerClase((m, u, it) => {
    if (!it.archivado && temario.esActividad(it) && it.fecha && !temario.hechoItem({ hecho, tareas, mapaIds }, m, u, it)) {
      salida.push({ id: it.ext_id || temario.idItem(m, u, it), modulo: m.corto, unidad: u.k, nombre: it.n, tipo: it.tipo, fecha: it.fecha, nota: it.nota || '' });
    }
  }, modulos);
  return salida;
}

const sinCoordenadas = ({ lat, lng, ...resto }) => resto;
const eventoLimpio = ({ color, ...resto }) => resto;

function rutaLimpia(r) {
  return {
    id: r.id, nombre: r.nombre, origen: r.origen, destino: r.destino, modo: r.modo, salida: r.salida, actualizada: r.actualizada,
    opciones: (r.resultado?.opciones || []).map(o => ({
      duracion: o.duracion, distancia: o.distancia, salida: o.salida, llegada: o.llegada, tarifa: o.tarifa, avisos: o.avisos,
      pasos: (o.pasos || []).map(p => ({
        modo: p.modo, texto: p.texto, duracion: p.duracion,
        ...(p.transporte ? { linea: p.transporte.linea, desde: p.transporte.desde, hasta: p.transporte.hasta, horaSalida: p.transporte.horaSalida } : {}),
      })),
    })),
  };
}

function crearHerramientas({ llamarGoogle, tz, ahora = () => new Date(), almacenTemario, directorio }) {
  const hoy = () => ahoraLocal(ahora(), tz).slice(0, 10);
  const dirTemario = directorio || process.env.DATA_DIR;
  const storeTemario = almacenTemario || (dirTemario ? crearAlmacenTemario(dirTemario) : null);

  // guardar_ de Apps Script crea una fila nueva si el id no existe, y guardarTarea vacía la ubicación
  // si no llega: al editar hay que partir siempre del elemento real.
  async function existente(lista, id, que) {
    const encontrado = lista.find(x => x.id === id);
    if (!encontrado) throw new Error(`No existe ${que} con id "${id}". Consulta primero la lista.`);
    return encontrado;
  }
  const datos = () => llamarGoogle('obtenerDatos', []);

  const lista = [
    {
      nombre: 'obtenerDatos', tipo: 'lectura',
      descripcion: 'Lista de compras (stock: Falta / En casa) y tareas (prioridad, fecha límite, ubicación, si está completada).',
      parametros: SIN_ARGUMENTOS,
      async ejecutar() {
        const d = await datos();
        return { compras: d.compras.map(sinCoordenadas), tareas: d.tareas.map(sinCoordenadas) };
      },
    },
    {
      nombre: 'obtenerEventos', tipo: 'lectura',
      descripcion: 'Eventos del calendario en un intervalo de días. Sin argumentos devuelve los próximos 7 días.',
      parametros: { type: 'object', properties: {
        desde: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Primer día, formato yyyy-MM-dd' },
        dias: { type: 'number', description: 'Número de días, máximo 90' },
      } },
      async ejecutar({ desde = hoy(), dias = 7 }) {
        const eventos = await llamarGoogle('obtenerEventos', [desde, Math.min(Math.max(Math.round(dias), 1), 90)]);
        return eventos.map(eventoLimpio);
      },
    },
    {
      nombre: 'obtenerCalendarios', tipo: 'lectura',
      descripcion: 'Calendarios donde se pueden crear eventos, con su id.',
      parametros: SIN_ARGUMENTOS,
      async ejecutar() {
        return (await llamarGoogle('obtenerCalendarios', [])).map(({ color, ...c }) => c);
      },
    },
    {
      nombre: 'obtenerRutas', tipo: 'lectura',
      descripcion: 'Rutas guardadas con sus opciones de transporte y duración.',
      parametros: SIN_ARGUMENTOS,
      async ejecutar() {
        return (await llamarGoogle('obtenerRutas', [])).map(rutaLimpia);
      },
    },
    {
      nombre: 'obtenerClase', tipo: 'lectura',
      descripcion: 'Curso de Python: progreso por módulo y entregas y pruebas pendientes. Con todo=true incluye cada material del temario con su id y si está hecho.',
      parametros: { type: 'object', properties: { todo: { type: 'boolean', description: 'Incluir todo el temario' } } },
      async ejecutar({ todo = false }) {
        const [temario, hecho, d] = await Promise.all([cargarTemario(), llamarGoogle('obtenerClase', []), datos()]);
        const actual = storeTemario ? storeTemario.obtener() : null;
        const modulos = actual?.modulos || temario.CLASE;
        const mapaIds = actual?.mapaIds || {};
        const ctx = { hecho, tareas: d.tareas, mapaIds };
        const salida = {
          modulos: modulos.map(m => ({ modulo: m.corto, nombre: m.nombre, ...temario.cuentaModulo(ctx, m) })),
          pendientes: actividadesPendientes(temario, hecho, d.tareas, modulos, mapaIds),
        };
        if (todo) {
          salida.temario = [];
          temario.recorrerClase((m, u, it) => {
            if (!it.archivado) salida.temario.push({ id: it.ext_id || temario.idItem(m, u, it), nombre: it.n, tipo: it.tipo, hecho: temario.hechoItem(ctx, m, u, it) });
          }, modulos);
        }
        return salida;
      },
    },
    {
      nombre: 'obtenerNovedadesClase', tipo: 'lectura', confirmar: false,
      descripcion: 'Novedades detectadas por Course Watcher en los módulos de clase (nuevos temas, entregas, cambios de fecha, anuncios o notas publicadas) durante los últimos días.',
      parametros: { type: 'object', properties: {
        dias: { type: 'number', description: 'Número de días hacia atrás a consultar (por defecto 7)' },
        modulo: { type: 'string', description: 'ID o nombre corto del módulo para filtrar (ej. poo, est)' },
      } },
      async ejecutar({ dias = 7, modulo } = {}) {
        const d = Number(dias) > 0 ? Number(dias) : 7;
        const actual = storeTemario ? storeTemario.obtener() : { novedades: [] };
        let listaNov = novedadesRecientes(actual?.novedades || [], d, ahora());
        if (modulo) {
          const f = String(modulo).trim().toLowerCase();
          listaNov = listaNov.filter(
            nov => String(nov.modulo || '').toLowerCase() === f || String(nov.moduloCorto || '').toLowerCase() === f,
          );
        }
        return { dias: d, total: listaNov.length, novedades: listaNov };
      },
    },
    {
      nombre: 'obtenerCalificacionesClase', tipo: 'lectura', confirmar: false,
      descripcion: 'Calificaciones publicadas, nota media sobre 10 y entregas o pruebas pendientes por módulo de clase.',
      parametros: { type: 'object', properties: {
        modulo: { type: 'string', description: 'ID o nombre corto del módulo para filtrar (ej. poo, est)' },
      } },
      async ejecutar({ modulo } = {}) {
        const actual = storeTemario ? storeTemario.obtener() : null;
        const modulosBase = actual?.modulos || CLASE;
        const mapaIds = actual?.mapaIds || {};
        let hecho = {};
        let tareas = [];
        try {
          hecho = (await llamarGoogle('obtenerClase', [])) || {};
        } catch {
          hecho = {};
        }
        try {
          const d = await datos();
          tareas = d?.tareas || [];
        } catch {
          tareas = [];
        }
        const ctx = { hecho, tareas, mapaIds };
        let filtrados = modulosBase;
        if (modulo) {
          const f = String(modulo).trim().toLowerCase();
          filtrados = modulosBase.filter(
            m =>
              String(m.id || '').toLowerCase() === f ||
              String(m.corto || '').toLowerCase() === f ||
              String(m.nombre || '').toLowerCase().includes(f),
          );
        }
        const modulos = filtrados.map(m => {
          const pendientes = [];
          for (const u of m.unidades || []) {
            for (const it of u.items || []) {
              if (!it.archivado && (esActividad(it) || Boolean(it.fecha)) && !hechoItem(ctx, m, u, it)) {
                pendientes.push({
                  unidad: u.k,
                  nombre: it.n,
                  tipo: it.tipo,
                  fecha: it.fecha || null,
                });
              }
            }
          }
          return {
            id: m.id,
            corto: m.corto,
            nombre: m.nombre,
            media: calcularMediaModulo(m),
            calificaciones: m.calificaciones || [],
            pendientes,
          };
        });
        return { modulos };
      },
    },

    {
      nombre: 'guardarProducto', tipo: 'escritura', cambios: ['datos'],
      descripcion: 'Crea un producto de la lista de compras, o lo edita si se indica su id. Al editar basta con enviar los campos que cambian.',
      parametros: { type: 'object', properties: {
        id: { type: 'string' }, producto: { type: 'string' }, categoria: { type: 'string' }, tienda: { type: 'string' },
        direccion: { type: 'string', description: 'Nombre del sitio y ciudad, o la calle' },
        stock: { type: 'string', enum: ['Falta', 'En casa'] },
      } },
      async ejecutar(args) {
        if (args.id) {
          const actual = await existente((await datos()).compras, args.id, 'ningún producto');
          return sinCoordenadas(await llamarGoogle('guardarProducto', [{ ...sinCoordenadas(actual), ...args }]));
        }
        if (!args.producto?.trim()) throw new Error('Falta el nombre del producto');
        return sinCoordenadas(await llamarGoogle('guardarProducto', [{ stock: 'Falta', categoria: '', tienda: '', direccion: '', ...args, id: '' }]));
      },
    },
    {
      nombre: 'cambiarStock', tipo: 'escritura', cambios: ['datos'],
      descripcion: 'Marca un producto como "Falta" o "En casa".',
      parametros: { type: 'object', properties: { id: { type: 'string' }, stock: { type: 'string', enum: ['Falta', 'En casa'] } }, required: ['id', 'stock'] },
      ejecutar: ({ id, stock }) => llamarGoogle('cambiarStock', [id, stock]),
    },
    {
      nombre: 'guardarTarea', tipo: 'escritura', cambios: ['datos'],
      descripcion: 'Crea una tarea, o la edita si se indica su id. Al editar basta con enviar los campos que cambian. Para completarla usa marcarTarea.',
      parametros: { type: 'object', properties: {
        id: { type: 'string' }, titulo: { type: 'string' },
        prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
        fecha: { ...FECHA_HORA, description: 'Fecha límite, formato yyyy-MM-ddTHH:mm. Usa T00:00 si no hay hora concreta. Vacío para quitarla.' },
        ubicacion: { type: 'string', description: 'Nombre del sitio y ciudad, solo si hay que desplazarse' },
      } },
      async ejecutar(args) {
        if (args.id) {
          const actual = await existente((await datos()).tareas, args.id, 'ninguna tarea');
          return sinCoordenadas(await llamarGoogle('guardarTarea', [{ ...sinCoordenadas(actual), ...args }]));
        }
        if (!args.titulo?.trim()) throw new Error('Falta el título de la tarea');
        return sinCoordenadas(await llamarGoogle('guardarTarea', [{ prioridad: 'Media', fecha: '', ubicacion: '', completada: false, ...args, id: '' }]));
      },
    },
    {
      nombre: 'marcarTarea', tipo: 'escritura', cambios: ['datos', 'clase'],
      descripcion: 'Marca una tarea como completada o la vuelve a abrir.',
      parametros: { type: 'object', properties: { id: { type: 'string' }, hecha: { type: 'boolean' } }, required: ['id', 'hecha'] },
      ejecutar: ({ id, hecha }) => llamarGoogle('marcarTarea', [id, hecha]),
    },
    {
      nombre: 'crearEvento', tipo: 'escritura', cambios: ['eventos'],
      descripcion: 'Crea un evento en el calendario. Sin calendario usa el principal.',
      parametros: { type: 'object', properties: {
        titulo: { type: 'string' }, inicio: FECHA_HORA, fin: FECHA_HORA, lugar: { type: 'string' },
        calendario: { type: 'string', description: 'id que devuelve obtenerCalendarios' },
      }, required: ['titulo', 'inicio', 'fin'] },
      async ejecutar(args) {
        // Con un id desconocido, Apps Script lo crearía sin avisar en el calendario principal.
        if (args.calendario) await existente(await llamarGoogle('obtenerCalendarios', []), args.calendario, 'ningún calendario');
        return eventoLimpio(await llamarGoogle('crearEvento', [args]));
      },
    },
    {
      nombre: 'guardarRuta', tipo: 'escritura', cambios: ['rutas'],
      descripcion: 'Calcula y guarda una ruta con Google Maps, o la edita si se indica su id.',
      parametros: { type: 'object', properties: {
        id: { type: 'string' }, nombre: { type: 'string' }, origen: { type: 'string' }, destino: { type: 'string' },
        modo: { type: 'string', enum: ['TRANSIT', 'WALKING', 'DRIVING'] },
        salida: { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: 'Hora de salida HH:mm; vacío para salir ahora' },
      } },
      async ejecutar(args) {
        let base = { modo: 'TRANSIT', salida: '', id: '' };
        if (args.id) {
          const { resultado, actualizada, ...actual } = await existente(await llamarGoogle('obtenerRutas', []), args.id, 'ninguna ruta');
          base = actual;
        }
        return rutaLimpia(await llamarGoogle('guardarRuta', [{ ...base, ...args }]));
      },
    },
    {
      nombre: 'marcarClase', tipo: 'escritura', cambios: ['clase'],
      descripcion: 'Marca o desmarca como hechos elementos del curso, usando los id de obtenerClase con todo=true.',
      parametros: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, hecho: { type: 'boolean' } }, required: ['ids', 'hecho'] },
      async ejecutar({ ids, hecho }) {
        const temario = await cargarTemario();
        const validos = storeTemario ? storeTemario.idsValidos() : new Set();
        temario.recorrerClase((m, u, it) => {
          validos.add(temario.idItem(m, u, it));
          if (it.ext_id) validos.add(it.ext_id);
          if (it.id_antiguo) validos.add(it.id_antiguo);
        });
        const desconocido = ids.find(id => !validos.has(id));
        if (desconocido) throw new Error(`No existe en el temario: "${desconocido}"`);
        return llamarGoogle('marcarClase', [ids, hecho]);
      },
    },

    {
      nombre: 'borrarProducto', tipo: 'destructiva', cambios: ['datos'],
      descripcion: 'Borra un producto de la lista de compras.',
      parametros: SOLO_ID,
      ejecutar: ({ id }) => llamarGoogle('borrarProducto', [id]),
      async describir({ id }) {
        return `Borrar de Compras: «${(await existente((await datos()).compras, id, 'ningún producto')).producto}»`;
      },
    },
    {
      nombre: 'borrarTarea', tipo: 'destructiva', cambios: ['datos'],
      descripcion: 'Borra una tarea, también de Google Tasks.',
      parametros: SOLO_ID,
      ejecutar: ({ id }) => llamarGoogle('borrarTarea', [id]),
      async describir({ id }) {
        return `Borrar de Tareas: «${(await existente((await datos()).tareas, id, 'ninguna tarea')).titulo}»`;
      },
    },
    {
      nombre: 'borrarEvento', tipo: 'destructiva', cambios: ['eventos'],
      descripcion: 'Borra un evento del calendario. Los eventos repetidos no se pueden borrar desde aquí.',
      parametros: SOLO_ID,
      ejecutar: ({ id }) => llamarGoogle('borrarEvento', [id]),
      async describir({ id }) {
        const eventos = await llamarGoogle('obtenerEventos', [sumarDias(hoy(), -30), 400]);
        const e = await existente(eventos, id, 'ningún evento');
        if (e.recurrente) throw new Error('Los eventos repetidos se borran desde Google Calendar');
        return `Borrar del calendario: «${e.titulo}» (${e.inicio.replace('T', ' ')})`;
      },
    },
    {
      nombre: 'borrarRuta', tipo: 'destructiva', cambios: ['rutas'],
      descripcion: 'Borra una ruta guardada.',
      parametros: SOLO_ID,
      ejecutar: ({ id }) => llamarGoogle('borrarRuta', [id]),
      async describir({ id }) {
        return `Borrar de Rutas: «${(await existente(await llamarGoogle('obtenerRutas', []), id, 'ninguna ruta')).nombre}»`;
      },
    },
  ];

  const porNombre = new Map(lista.map(h => [h.nombre, h]));
  return {
    lista,
    buscar: nombre => porNombre.get(nombre),
    /** Sin confirmaciones: el chat las gestiona antes y en MCP las decide el cliente. */
    ejecutar: async (h, args) => h.ejecutar(validar(h.parametros, args)),
    describir: async (h, args) => h.describir(validar(h.parametros, args)),
  };
}

module.exports = { crearHerramientas, actividadesPendientes, cargarTemario };
