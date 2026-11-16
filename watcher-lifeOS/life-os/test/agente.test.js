'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, test } = require('node:test');
const { crearAlmacen } = require('../agente/almacen.js');
const { crearChat } = require('../agente/chat.js');
const { crearModelo } = require('../agente/gemini.js');
const { crearHerramientas } = require('../agente/herramientas.js');
const { ahoraLocal } = require('../agente/hora.js');
const { crearPlanificador, enSilencio, evaluar } = require('../agente/planificador.js');

const TZ = 'Europe/Madrid';
const carpeta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-'));

function googleFalso() {
  const llamadas = [];
  const db = {
    compras: [{ id: 'p1', producto: 'Leche', categoria: 'Super', tienda: 'Lidl', direccion: 'Lidl, Málaga', stock: 'Falta', lat: 1, lng: 2 }],
    tareas: [{ id: 't1', titulo: 'Banco', prioridad: 'Alta', fecha: '2026-11-05T10:00', ubicacion: 'Calle Larios', completada: false, lat: 1, lng: 2 }],
    eventos: [
      { id: 'c::e1', titulo: 'Dentista', inicio: '2026-11-05T10:00', fin: '2026-11-05T11:00', diaCompleto: false, lugar: '', recurrente: false, color: '#000' },
      { id: 'c::e2', titulo: 'Trabajo', inicio: '2026-11-05T09:00', fin: '2026-11-05T14:00', diaCompleto: false, lugar: '', recurrente: true, color: '#000' },
    ],
    calendarios: [{ id: 'c', nombre: 'Principal', color: '#000', principal: true }],
  };
  const fn = async (nombre, args) => {
    llamadas.push({ nombre, args });
    switch (nombre) {
      case 'obtenerDatos': return { compras: db.compras, tareas: db.tareas };
      case 'obtenerEventos': return db.eventos;
      case 'obtenerCalendarios': return db.calendarios;
      case 'obtenerRutas': return [];
      case 'obtenerClase': return {};
      default: return nombre.startsWith('guardar') || nombre === 'crearEvento' ? args[0] : true;
    }
  };
  fn.llamadas = llamadas;
  fn.escrituras = () => llamadas.filter(l => !l.nombre.startsWith('obtener'));
  return fn;
}

const herramientasDe = google => crearHerramientas({ llamarGoogle: google, tz: TZ, ahora: () => new Date('2026-11-04T12:00:00Z') });
const usar = (hs, nombre, args) => hs.ejecutar(hs.buscar(nombre), args);

describe('herramientas', () => {
  test('editar con un id inventado se rechaza y no escribe nada', async () => {
    const google = googleFalso();
    const hs = herramientasDe(google);
    await assert.rejects(usar(hs, 'guardarTarea', { id: 'inventado', titulo: 'X' }), /No existe/);
    await assert.rejects(usar(hs, 'guardarProducto', { id: 'inventado', stock: 'Falta' }), /No existe/);
    assert.equal(google.escrituras().length, 0);
  });

  test('una edición parcial conserva el resto de campos', async () => {
    const google = googleFalso();
    await usar(herramientasDe(google), 'guardarTarea', { id: 't1', prioridad: 'Baja' });
    const [enviado] = google.escrituras()[0].args;
    assert.equal(enviado.ubicacion, 'Calle Larios');
    assert.equal(enviado.titulo, 'Banco');
    assert.equal(enviado.prioridad, 'Baja');
    assert.ok(!('lat' in enviado), 'las coordenadas no se reenvían');
  });

  test('valida formato y valores, y descarta campos desconocidos', async () => {
    const google = googleFalso();
    const hs = herramientasDe(google);
    await assert.rejects(usar(hs, 'guardarTarea', { titulo: 'X', fecha: 'mañana' }), /formato/);
    await assert.rejects(usar(hs, 'cambiarStock', { id: 'p1', stock: 'Quizá' }), /uno de/);
    await assert.rejects(usar(hs, 'crearEvento', { titulo: 'X', inicio: '2026-11-05T10:00' }), /Falta el campo "fin"/);
    await usar(hs, 'guardarTarea', { titulo: 'X', otro: 'campo' });
    assert.ok(!('otro' in google.escrituras()[0].args[0]));
  });

  test('un calendario desconocido se rechaza en vez de usar el principal', async () => {
    const google = googleFalso();
    await assert.rejects(usar(herramientasDe(google), 'crearEvento', { titulo: 'X', inicio: '2026-11-05T10:00', fin: '2026-11-05T11:00', calendario: 'Vida' }), /No existe/);
    assert.equal(google.escrituras().length, 0);
  });

  test('marcarClase rechaza ids fuera del temario', async () => {
    const google = googleFalso();
    await assert.rejects(usar(herramientasDe(google), 'marcarClase', { ids: ['no/existe'], hecho: true }), /No existe/);
    assert.equal(google.escrituras().length, 0);
  });

  test('las lecturas no envían coordenadas al modelo', async () => {
    const r = await usar(herramientasDe(googleFalso()), 'obtenerDatos', {});
    assert.ok(!('lat' in r.tareas[0]) && !('lng' in r.compras[0]));
  });
});

/** Modelo guionizado: cada elemento es una ronda (array de llamadas) o el texto final. */
function modeloFalso(guion) {
  const peticiones = [];
  return {
    peticiones,
    async generar(p) {
      peticiones.push(structuredClone({ contents: p.contents, system: p.system, conHerramientas: !!p.tools }));
      const paso = guion.shift();
      if (paso instanceof Error) throw paso;
      if (typeof paso === 'string') return { content: { role: 'model', parts: [{ text: paso }] }, llamadas: [], texto: paso };
      return { content: { role: 'model', parts: paso.map(functionCall => ({ functionCall })) }, llamadas: paso, texto: '' };
    },
  };
}

function montarChat(guion, google = googleFalso()) {
  const almacen = crearAlmacen(carpeta());
  const modelo = modeloFalso(guion);
  return { chat: crearChat({ almacen, herramientas: herramientasDe(google), modelo, tz: TZ }), google, modelo, almacen };
}

describe('chat y confirmación de borrados', () => {
  test('pedir un borrado no borra: queda pendiente con el texto de los datos reales', async () => {
    const { chat, google } = montarChat([[{ name: 'borrarTarea', args: { id: 't1' } }], 'Pendiente de que confirmes.']);
    await chat.enviar('borra la del banco');
    assert.equal(google.escrituras().length, 0);
    const { pendientes } = chat.estado();
    assert.equal(pendientes.length, 1);
    assert.match(pendientes[0].descripcion, /Banco/);
  });

  test('confirmar ejecuta una sola vez; repetir la confirmación falla', async () => {
    const { chat, google } = montarChat([[{ name: 'borrarTarea', args: { id: 't1' } }], 'ok']);
    await chat.enviar('borra');
    const { id } = chat.estado().pendientes[0];
    assert.deepEqual((await chat.confirmar(id, true)).cambios, ['datos']);
    await assert.rejects(chat.confirmar(id, true), /ya no está disponible/);
    assert.deepEqual(google.escrituras().map(e => e.nombre), ['borrarTarea']);
  });

  test('cancelar no ejecuta nada', async () => {
    const { chat, google } = montarChat([[{ name: 'borrarTarea', args: { id: 't1' } }], 'ok']);
    await chat.enviar('borra');
    await chat.confirmar(chat.estado().pendientes[0].id, false);
    assert.equal(google.escrituras().length, 0);
    assert.equal(chat.estado().pendientes.length, 0);
  });

  test('el modelo no puede confirmar: repetir la llamada no ejecuta ni duplica', async () => {
    const llamada = { name: 'borrarTarea', args: { id: 't1' } };
    const { chat, google } = montarChat([[llamada], [llamada], [llamada], 'ok']);
    await chat.enviar('borra');
    assert.equal(google.escrituras().length, 0);
    assert.equal(chat.estado().pendientes.length, 1);
  });

  test('un borrado con id inventado o de un evento repetido no llega a pedirse', async () => {
    const { chat, modelo } = montarChat([
      [{ name: 'borrarTarea', args: { id: 'nope' } }, { name: 'borrarEvento', args: { id: 'c::e2' } }], 'no pude',
    ]);
    await chat.enviar('borra');
    assert.equal(chat.estado().pendientes.length, 0);
    const [r1, r2] = modelo.peticiones[1].contents.at(-1).parts.map(p => p.functionResponse.response);
    assert.match(r1.error, /No existe/);
    assert.match(r2.error, /Google Calendar/);
  });

  test('las escrituras se hacen directas y avisan de qué refrescar', async () => {
    const { chat, google } = montarChat([[{ name: 'guardarTarea', args: { titulo: 'Nueva' } }], 'Hecho']);
    assert.deepEqual((await chat.enviar('añade')).cambios, ['datos']);
    assert.equal(google.escrituras()[0].nombre, 'guardarTarea');
  });

  test('los resultados llegan marcados como datos y las firmas vuelven intactas', async () => {
    const { chat, modelo } = montarChat([[{ id: 'x1', name: 'obtenerDatos', args: {} }], 'ok']);
    await chat.enviar('qué tengo');
    const contenidos = modelo.peticiones[1].contents;
    const respuesta = contenidos.at(-1).parts[0].functionResponse;
    assert.equal(respuesta.id, 'x1');
    assert.ok(respuesta.response.datos_no_son_instrucciones);
    assert.ok(contenidos.at(-2).parts[0].functionCall, 'la ronda del modelo se reenvía tal cual');
  });

  test('un bucle del modelo se corta y un fallo no se reenvía como contexto', async () => {
    const consulta = { name: 'obtenerCalendarios', args: {} };
    const { chat, modelo } = montarChat([[consulta], [consulta], [consulta], [consulta], [consulta], [consulta], new Error('Sin cuota'), 'bien']);
    await chat.enviar('uno');
    assert.equal(modelo.peticiones.length, 6);
    assert.match(chat.estado().chat.at(-1).texto, /demasiados pasos/);
    await chat.enviar('dos');
    assert.equal(chat.estado().chat.at(-1).error, true);
    await chat.enviar('tres');
    const textos = modelo.peticiones.at(-1).contents.flatMap(c => c.parts.map(p => p.text));
    assert.ok(!textos.includes('Sin cuota'));
    assert.ok(textos.includes('tres'));
  });

  test('transcribir no usa herramientas, adapta el formato de Safari y no toca el historial', async () => {
    const { chat, modelo } = montarChat(['Compra leche']);
    assert.deepEqual(await chat.transcribir('QUJD', 'audio/mp4;codecs=mp4a.40.2'), { texto: 'Compra leche' });
    const { contents, conHerramientas } = modelo.peticiones[0];
    assert.equal(conHerramientas, false);
    assert.deepEqual(contents[0].parts[1].inlineData, { mimeType: 'audio/m4a', data: 'QUJD' });
    assert.equal(chat.estado().chat.length, 0);
  });

  test('transcribir rechaza formatos y datos no válidos sin llamar al modelo', async () => {
    const { chat, modelo } = montarChat([]);
    await assert.rejects(chat.transcribir('QUJD', 'video/mp4'), /formato/);
    await assert.rejects(chat.transcribir('no es base64!', 'audio/webm'), /no válido/);
    await assert.rejects(chat.transcribir(123, 'audio/webm'), /no válido/);
    assert.equal(modelo.peticiones.length, 0);
  });

  test('si no se oye voz lo dice en vez de escribir el código interno', async () => {
    const { chat } = montarChat(['SIN_VOZ']);
    await assert.rejects(chat.transcribir('QUJD', 'audio/webm'), /No he oído/);
  });

  test('sin clave de Gemini, el chat lo dice', async () => {
    const chat = crearChat({ almacen: crearAlmacen(carpeta()), herramientas: herramientasDe(googleFalso()), modelo: null, tz: TZ });
    assert.equal(chat.estado().configurado, false);
    await assert.rejects(chat.enviar('hola'), /GEMINI_API_KEY/);
  });

  test('el historial y las confirmaciones sobreviven a un reinicio', async () => {
    const dir = carpeta();
    const google = googleFalso();
    const uno = crearChat({ almacen: crearAlmacen(dir), herramientas: herramientasDe(google), modelo: modeloFalso([[{ name: 'borrarTarea', args: { id: 't1' } }], 'ok']), tz: TZ });
    await uno.enviar('borra');
    const dos = crearChat({ almacen: crearAlmacen(dir), herramientas: herramientasDe(google), modelo: null, tz: TZ });
    assert.equal(dos.estado().chat.length, 2);
    await dos.confirmar(dos.estado().pendientes[0].id, true);
    assert.deepEqual(google.escrituras().map(e => e.nombre), ['borrarTarea']);
  });
});

describe('gemini', () => {
  const peticion = { system: 's', contents: [], tools: [{ nombre: 'n', descripcion: 'd', parametros: {} }] };
  const errorHttp = (status, message = 'x') => Object.assign(new Error(message), { status });

  test('sin cuota pasa al modelo de reserva', async () => {
    const usados = [];
    const cliente = { models: { generateContent: async ({ model }) => {
      usados.push(model);
      if (model === 'a') throw errorHttp(429);
      return { candidates: [{ content: { role: 'model', parts: [{ text: 'hola' }] } }] };
    } } };
    const r = await crearModelo({ modelo: 'a', reserva: 'b', cliente }).generar(peticion);
    assert.deepEqual(usados, ['a', 'b']);
    assert.equal(r.texto, 'hola');
  });

  for (const status of [503, 504]) {
    test(`con un ${status} pasa al modelo de reserva`, async () => {
      const usados = [];
      const cliente = { models: { generateContent: async ({ model }) => {
        usados.push(model);
        if (model === 'a') throw errorHttp(status);
        return { candidates: [{ content: { role: 'model', parts: [{ text: 'hola' }] } }] };
      } } };
      const r = await crearModelo({ modelo: 'a', reserva: 'b', cliente }).generar(peticion);
      assert.deepEqual(usados, ['a', 'b']);
      assert.equal(r.texto, 'hola');
    });
  }

  test('si tampoco responde la reserva, dice que está saturado', async () => {
    const cliente = { models: { generateContent: async () => { throw errorHttp(504); } } };
    await assert.rejects(crearModelo({ modelo: 'a', reserva: 'b', cliente }).generar(peticion), /saturado/);
  });

  test('un error desconocido indica su código', async () => {
    const cliente = { models: { generateContent: async () => { throw errorHttp(400); } } };
    await assert.rejects(crearModelo({ modelo: 'a', reserva: 'b', cliente }).generar(peticion), /error 400/);
  });

  test('una clave rechazada no prueba la reserva y da un mensaje claro', async () => {
    const usados = [];
    const cliente = { models: { generateContent: async ({ model }) => { usados.push(model); throw errorHttp(403); } } };
    await assert.rejects(crearModelo({ modelo: 'a', reserva: 'b', cliente }).generar(peticion), /GEMINI_API_KEY/);
    assert.deepEqual(usados, ['a']);
  });

  test('separa llamadas, ignora razonamientos y devuelve el contenido intacto', async () => {
    const content = { role: 'model', parts: [{ text: 'pensando', thought: true }, { text: 'ok' }, { functionCall: { name: 'f', args: {} }, thoughtSignature: 'firma' }] };
    const cliente = { models: { generateContent: async () => ({ candidates: [{ content }] }) } };
    const r = await crearModelo({ modelo: 'a', cliente }).generar(peticion);
    assert.equal(r.texto, 'ok');
    assert.equal(r.llamadas[0].name, 'f');
    assert.equal(r.content.parts[2].thoughtSignature, 'firma');
  });

  test('una respuesta bloqueada no rompe', async () => {
    const cliente = { models: { generateContent: async () => ({ candidates: [] }) } };
    const r = await crearModelo({ modelo: 'a', cliente }).generar(peticion);
    assert.deepEqual([r.texto, r.llamadas], ['', []]);
  });
});

describe('push', () => {
  const webpush = require('web-push');
  const { crearPush } = require('../agente/push.js');

  function suscripcionReal(endpoint) {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    return { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
  }

  test('con claves reales genera una petición cifrada y firmada', () => {
    const almacen = crearAlmacen(carpeta());
    crearPush({ almacen, asunto: 'https://lifeos.dksaa.com' });
    const { publicKey, privateKey } = almacen.estado.claves.vapid;
    const peticion = webpush.generateRequestDetails(suscripcionReal('https://push.example/abc'), 'texto secreto', {
      vapidDetails: { subject: 'https://lifeos.dksaa.com', publicKey, privateKey }, TTL: 60,
    });
    assert.equal(peticion.headers['Content-Encoding'], 'aes128gcm');
    assert.match(peticion.headers.Authorization, /^vapid t=.+, k=.+/);
    assert.ok(!peticion.body.includes('texto secreto'));
  });

  test('quita las suscripciones caducadas y reintenta solo los fallos temporales', async t => {
    const almacen = crearAlmacen(carpeta());
    const push = crearPush({ almacen, asunto: 'https://lifeos.dksaa.com' });
    const estados = { 'https://a.example/ok': 201, 'https://a.example/caducada': 410, 'https://a.example/temporal': 503 };
    Object.keys(estados).forEach(e => push.suscribir(suscripcionReal(e)));
    const cargas = [];
    t.mock.method(webpush, 'sendNotification', async (s, carga) => {
      cargas.push(carga);
      if (estados[s.endpoint] >= 400) throw Object.assign(new Error('x'), { statusCode: estados[s.endpoint] });
    });
    const r = await push.enviar({ clave: 'c', titulo: 'T', cuerpo: 'x'.repeat(5000), tab: 'tareas' });
    assert.deepEqual(r, { entregados: 1, reintentar: true });
    assert.deepEqual(almacen.estado.suscripciones.map(s => s.endpoint).sort(), ['https://a.example/ok', 'https://a.example/temporal']);
    assert.ok(JSON.parse(cargas[0]).cuerpo.length <= 1000);
  });

  test('volver a suscribir el mismo dispositivo no lo duplica', () => {
    const almacen = crearAlmacen(carpeta());
    const push = crearPush({ almacen, asunto: 'https://lifeos.dksaa.com' });
    push.suscribir(suscripcionReal('https://a.example/1'));
    push.suscribir(suscripcionReal('https://a.example/1'));
    assert.equal(almacen.estado.suscripciones.length, 1);
  });
});

const PREFS = { resumen: true, horaResumen: '08:00', eventos: true, minutosEvento: 15, tareas: true, sugerencias: true };
const COPIA_VACIA = { eventos: [], tareas: [], compras: [], actividades: [] };
const decidir = (ahora, copia = {}, prefs = {}, enviados = {}) => evaluar({ ahora, copia: { ...COPIA_VACIA, ...copia }, prefs: { ...PREFS, ...prefs }, enviados });
const claves = avisos => avisos.map(a => a.clave);

describe('reglas de avisos', () => {
  const evento = { id: 'e1', titulo: 'Dentista', inicio: '2026-11-04T17:00', diaCompleto: false, lugar: 'Centro' };

  test('un evento avisa dentro de la antelación elegida, no antes ni después', () => {
    assert.deepEqual(claves(decidir('2026-11-04T16:44', { eventos: [evento] })), []);
    assert.deepEqual(claves(decidir('2026-11-04T16:45', { eventos: [evento] })), ['ev:e1:2026-11-04T17:00']);
    assert.deepEqual(claves(decidir('2026-11-04T17:00', { eventos: [evento] })), []);
    assert.deepEqual(claves(decidir('2026-11-04T16:30', { eventos: [evento] }, { minutosEvento: 30 })), ['ev:e1:2026-11-04T17:00']);
  });

  test('los eventos de día completo y los apagados no avisan', () => {
    assert.deepEqual(claves(decidir('2026-11-04T16:50', { eventos: [{ ...evento, diaCompleto: true }] })), []);
    assert.deepEqual(claves(decidir('2026-11-04T16:50', { eventos: [evento] }, { eventos: false })), []);
  });

  test('lo ya enviado no se repite', () => {
    assert.deepEqual(claves(decidir('2026-11-04T16:50', { eventos: [evento] }, {}, { 'ev:e1:2026-11-04T17:00': 'x' })), []);
  });

  test('las tareas avisan 1 h antes, salvo sin hora o completadas', () => {
    const t = { id: 't1', titulo: 'Banco', fecha: '2026-11-04T18:00', completada: false };
    assert.deepEqual(claves(decidir('2026-11-04T16:59', { tareas: [t] })), []);
    assert.deepEqual(claves(decidir('2026-11-04T17:00', { tareas: [t] })), ['ta:t1:2026-11-04T18:00']);
    assert.deepEqual(claves(decidir('2026-11-04T17:00', { tareas: [{ ...t, completada: true }] })), []);
    assert.deepEqual(claves(decidir('2026-11-03T23:30', { tareas: [{ ...t, fecha: '2026-11-04T00:00' }] }, { sugerencias: false })), []);
  });

  test('una entrega avisa solo del hito más cercano', () => {
    const a = { id: 'x', modulo: 'POO', nombre: 'Tarea', tipo: 'Entrega', fecha: '2026-11-10T23:59' };
    const hito = ahora => claves(decidir(ahora, { actividades: [a] }, { sugerencias: false, resumen: false }));
    assert.deepEqual(hito('2026-11-07T23:58'), []);
    assert.deepEqual(hito('2026-11-07T23:59'), [`cl:x:${3 * 24 * 60}`]);
    assert.deepEqual(hito('2026-11-10T20:59'), ['cl:x:180']);
    assert.deepEqual(hito('2026-11-11T00:00'), []);
  });

  test('el resumen sale una vez al día y hay margen si el servidor estaba caído', () => {
    const resumen = (ahora, enviados) => claves(decidir(ahora, {}, { sugerencias: false }, enviados));
    assert.deepEqual(resumen('2026-11-04T07:59'), []);
    assert.deepEqual(resumen('2026-11-04T08:00'), ['re:2026-11-04']);
    assert.deepEqual(resumen('2026-11-04T10:59'), ['re:2026-11-04']);
    assert.deepEqual(resumen('2026-11-04T11:00'), []);
    assert.deepEqual(resumen('2026-11-04T08:01', { 're:2026-11-04': 'x' }), []);
  });

  test('con el resumen apagado, las vencidas se avisan aparte', () => {
    const t = { id: 't', titulo: 'Vieja', fecha: '2026-11-01T10:00', completada: false };
    assert.deepEqual(claves(decidir('2026-11-04T08:00', { tareas: [t] }, { resumen: false, sugerencias: false })), ['ve:2026-11-04']);
    assert.deepEqual(claves(decidir('2026-11-04T08:00', { tareas: [t] }, { resumen: false, tareas: false, sugerencias: false })), []);
  });

  test('las horas de silencio cubren la noche y retienen las sugerencias', () => {
    assert.equal(enSilencio('23:00'), true);
    assert.equal(enSilencio('03:00'), true);
    assert.equal(enSilencio('07:29'), true);
    assert.equal(enSilencio('07:30'), false);
    assert.equal(enSilencio('22:59'), false);
    assert.deepEqual(claves(decidir('2026-11-04T13:30', {}, { resumen: false })), ['su:2026-11-04:13:30']);
    assert.deepEqual(claves(decidir('2026-11-04T13:30', {}, { resumen: false, sugerencias: false })), []);
  });

  test('un evento nocturno avisa aunque sea hora de silencio', () => {
    const noche = { ...evento, inicio: '2026-11-04T23:30' };
    assert.equal(claves(decidir('2026-11-04T23:20', { eventos: [noche] })).length, 1);
  });

  test('la hora local respeta el cambio de hora de Madrid', () => {
    assert.equal(ahoraLocal(new Date('2026-07-01T10:00:00Z'), TZ), '2026-07-01T12:00');
    assert.equal(ahoraLocal(new Date('2026-12-01T10:00:00Z'), TZ), '2026-12-01T11:00');
    assert.equal(ahoraLocal(new Date('2026-03-29T00:59:00Z'), TZ), '2026-03-29T01:59');
    assert.equal(ahoraLocal(new Date('2026-03-29T01:00:00Z'), TZ), '2026-03-29T03:00');
    assert.equal(ahoraLocal(new Date('2026-10-25T00:59:00Z'), TZ), '2026-10-25T02:59');
    assert.equal(ahoraLocal(new Date('2026-10-25T01:00:00Z'), TZ), '2026-10-25T02:00');
    assert.equal(ahoraLocal(new Date('2026-11-04T23:30:00Z'), TZ), '2026-11-05T00:30');
  });
});

describe('planificador', () => {
  const pushFalso = (respuesta = { entregados: 1, reintentar: false }) => {
    const enviados = [];
    return { enviados, hayDispositivos: () => true, enviar: async a => { enviados.push(a); return typeof respuesta === 'function' ? respuesta(a) : respuesta; } };
  };
  function montar({ modelo = null, push = pushFalso(), dir = carpeta(), hora = '2026-11-04T09:00:00Z', google = googleFalso() } = {}) {
    const reloj = { fecha: new Date(hora) };
    const almacen = crearAlmacen(dir);
    const plan = crearPlanificador({ almacen, llamarGoogle: google, modelo, push, tz: TZ, ahora: () => reloj.fecha });
    return { plan, push, almacen, reloj, google, dir };
  }

  test('sin dispositivos no gasta llamadas a Google', async () => {
    const google = googleFalso();
    const { plan } = montar({ google, push: { hayDispositivos: () => false } });
    await plan.revisar();
    assert.equal(google.llamadas.length, 0);
  });

  test('tras reiniciar no repite avisos', async () => {
    const dir = carpeta();
    const uno = montar({ dir });
    await uno.plan.revisar();
    assert.ok(uno.push.enviados.some(a => a.tipo === 'resumen'));
    const dos = montar({ dir });
    await dos.plan.revisar();
    assert.deepEqual(dos.push.enviados.filter(a => a.tipo === 'resumen'), []);
  });

  test('si Gemini falla, el resumen sale como lista simple', async () => {
    const { plan, push } = montar({ modelo: modeloFalso([new Error('Sin cuota')]) });
    await plan.revisar();
    const resumen = push.enviados.find(a => a.tipo === 'resumen');
    assert.match(resumen.cuerpo, /Tareas para hoy|Agenda|Por comprar|Vencidas|Entregas/);
  });

  test('si el envío falla reintenta sin volver a gastar en Gemini', async () => {
    let intento = 0;
    // Solo falla el resumen: el temario real también genera avisos de entregas.
    const push = pushFalso(a => (a.tipo === 'resumen' && ++intento === 1 ? { entregados: 0, reintentar: true } : { entregados: 1, reintentar: false }));
    const modelo = modeloFalso(['Hoy toca banco.']);
    const { plan, reloj, almacen } = montar({ modelo, push, hora: '2026-11-04T07:00:00Z' });
    await plan.revisar();
    const resumenes = () => push.enviados.filter(a => a.tipo === 'resumen');
    assert.equal(resumenes().length, 1);
    assert.equal(almacen.estado.enviados['re:2026-11-04'], undefined);
    reloj.fecha = new Date('2026-11-04T07:01:00Z');
    await plan.revisar();
    assert.equal(resumenes().length, 2);
    assert.equal(resumenes()[1].cuerpo, 'Hoy toca banco.');
    assert.equal(modelo.peticiones.length, 1);
    assert.ok(almacen.estado.enviados['re:2026-11-04']);
  });

  test('la sugerencia se genera sin herramientas; NADA no notifica y sin cambios no se repite', async () => {
    const modelo = modeloFalso(['NADA']);
    const { plan, push, reloj, almacen } = montar({ modelo, hora: '2026-11-04T12:30:00Z' }); // 13:30 en Madrid
    almacen.estado.prefs.resumen = false;
    await plan.revisar();
    assert.equal(modelo.peticiones.length, 1);
    assert.equal(modelo.peticiones[0].conHerramientas, false);
    assert.deepEqual(push.enviados.filter(a => a.tipo === 'sugerencia'), []);
    reloj.fecha = new Date('2026-11-04T19:00:00Z'); // 20:00, mismos datos
    await plan.revisar();
    assert.equal(modelo.peticiones.length, 1);
  });

  test('si Google falla y la copia es vieja, calla en vez de avisar mal', async () => {
    let falla = false;
    const base = googleFalso();
    const google = async (...a) => { if (falla) throw new Error('caído'); return base(...a); };
    const { plan, push, reloj } = montar({ google, hora: '2026-11-04T09:00:00Z' });
    await plan.revisar();
    const antes = push.enviados.length;
    falla = true;
    reloj.fecha = new Date('2026-11-05T07:30:00Z'); // al día siguiente tocaría otro resumen
    await plan.revisar();
    assert.equal(push.enviados.length, antes);
  });
});
