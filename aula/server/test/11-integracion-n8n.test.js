// RF-11 · Automatización con n8n: la app avisa de cada cambio (entregas a Drive, datos al
// Sheet de seguimiento) y ofrece una API para que n8n descargue archivos y resincronice.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { API_KEY, SECRETO, prepararEntorno } from './entorno.js';

let e;
let n8n;
let alumno;
let entrega;
before(async () => {
  e = await prepararEntorno();
  n8n = await import('../src/lib/n8n.js');
  alumno = await e.crearUsuario('alumno', { nombre: 'Ana Pérez', grupo: 'Mañana' });
  entrega = (await alumno.subir('/api/alumno/ejercicios/T01_E01/entregas', 'archivo', 'T01_Prueba.docx', 'archivo para drive')).body;
});
after(() => e.cerrar());

const conClave = { headers: { 'x-api-key': API_KEY } };

describe('RF-11.1 Cola de eventos hacia n8n', () => {
  test('el alta de un alumno se encola con los datos del Sheet', async () => {
    const [ev] = await e.eventos('alumno.alta');
    assert.deepEqual(
      Object.keys(ev.payload).sort(),
      ['alumno_id', 'email', 'estado', 'fecha_alta', 'grupo', 'nombre', 'observaciones'],
    );
    assert.equal(ev.payload.nombre, 'Ana Pérez');
    assert.equal(ev.payload.estado, 'Activo');
  });

  test('si el cambio falla, tampoco se guarda el evento (misma transacción)', async () => {
    const antes = (await e.eventos()).length;
    await assert.rejects(e.transaccion(async (c) => {
      await n8n.emitir('alumno.alta', { alumno_id: 'ALU999' }, c);
      throw new Error('fallo a mitad');
    }));
    assert.equal((await e.eventos()).length, antes);
  });

  test('envía los pendientes al webhook con el secreto y los marca como enviados', async () => {
    e.n8n.estado = 200;
    await n8n.procesarPendientes();
    const enviados = e.n8n.recibidos;
    assert.ok(enviados.length >= 2);
    assert.ok(enviados.every((r) => r.headers['x-webhook-secret'] === SECRETO));
    const pedido = enviados.find((r) => r.body.evento === 'entrega.creada');
    assert.equal(pedido.body.curso_id, 'CCD2026');
    assert.equal(typeof pedido.body.id_evento, 'number');
    assert.equal(pedido.body.datos.resultado_id, entrega.id);
    const pendientes = await e.query(`SELECT * FROM eventos_n8n WHERE estado <> 'enviado'`);
    assert.equal(pendientes.length, 0);
  });

  test('respeta el orden en que ocurrieron los cambios', async () => {
    const ids = e.n8n.recibidos.map((r) => r.body.id_evento);
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
  });

  test('si n8n rechaza el aviso, guarda el error y lo reintenta más tarde', async () => {
    e.n8n.estado = 403;
    await alumno.post('/api/alumno/fichar', { tipo: 'entrada' });
    await n8n.procesarPendientes();
    const [ev] = await e.eventos('fichaje.entrada');
    assert.equal(ev.estado, 'pendiente');
    assert.equal(ev.intentos, 1);
    assert.equal(ev.ultimo_error, 'n8n respondió 403');
    assert.ok(new Date(ev.proximo_intento) > new Date(), 'espera antes de reintentar');

    await n8n.procesarPendientes();
    assert.equal((await e.eventos('fichaje.entrada'))[0].intentos, 1, 'no reintenta antes de tiempo');
  });

  test('al reintentar a mano con n8n ya funcionando, se envía', async () => {
    e.n8n.estado = 200;
    const [ev] = await e.eventos('fichaje.entrada');
    const adm = await e.admin();
    assert.equal((await adm.post(`/api/admin/integraciones/${ev.id}/reintentar`, {})).status, 200);
    await n8n.procesarPendientes();
    const [despues] = await e.eventos('fichaje.entrada');
    assert.equal(despues.estado, 'enviado');
    assert.equal(despues.ultimo_error, null);
  });

  test('tras 10 intentos fallidos queda marcado como error', async () => {
    e.n8n.estado = 500;
    await n8n.emitir('prueba', { mensaje: 'x' });
    await e.query(`UPDATE eventos_n8n SET intentos = 9 WHERE evento = 'prueba'`);
    await n8n.procesarPendientes();
    const [ev] = await e.eventos('prueba');
    assert.equal(ev.estado, 'error');
    assert.equal(ev.intentos, 10);
    e.n8n.estado = 200;
  });

  test('el admin ve el estado de la integración y puede mandar un evento de prueba', async () => {
    const adm = await e.admin();
    const r = await adm.get('/api/admin/integraciones');
    assert.deepEqual(r.body.configuracion, { webhook: true, secreto: true, api_key: true, app_url: 'http://aula.test' });
    assert.equal(r.body.resumen.error, 1);
    assert.equal((await adm.post('/api/admin/integraciones/prueba', {})).status, 200);
    assert.equal((await adm.get('/api/admin/integraciones?estado=pendiente')).body.eventos[0].evento, 'prueba');
  });
});

describe('RF-11.2 API para n8n', () => {
  test('exige la clave de integración', async () => {
    const cli = e.cliente();
    assert.equal((await cli.get('/api/integraciones/estado')).status, 401);
    assert.equal((await cli.get('/api/integraciones/estado', { headers: { 'x-api-key': 'mala' } })).status, 401);
    const r = await cli.get('/api/integraciones/estado', conClave);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.tablas, ['alumnos', 'sesiones', 'asistencia', 'resultados', 'fichajes', 'catalogo']);
  });

  test('una sesión de usuario no sirve en lugar de la clave', async () => {
    const adm = await e.admin();
    assert.equal((await adm.get('/api/integraciones/estado')).status, 401);
  });

  test('n8n descarga el archivo de la entrega para subirlo a Drive', async () => {
    const r = await e.cliente().get(`/api/integraciones/entregas/${entrega.id}/archivo`, conClave);
    assert.equal(r.status, 200);
    assert.equal(r.body.toString(), 'archivo para drive');
    assert.match(r.headers.get('content-disposition'), new RegExp(`${alumno.usuario.alumno_id}_T01_Prueba\\.docx`));
  });

  test('n8n guarda el enlace de Drive en la entrega', async () => {
    const url = 'https://drive.google.com/file/d/abc/view';
    const r = await e.cliente().patch(`/api/integraciones/entregas/${entrega.id}`, { entrega_url: url }, conClave);
    assert.equal(r.status, 200);
    assert.equal((await e.one('SELECT entrega_url FROM resultados WHERE id = $1', [entrega.id])).entrega_url, url);
    assert.equal((await e.cliente().patch('/api/integraciones/entregas/NO_EXISTE', { entrega_url: url }, conClave)).status, 404);
  });

  test('exporta cada tabla con las mismas columnas que el Sheet de seguimiento', async () => {
    const columnas = {
      alumnos: ['alumno_id', 'nombre', 'grupo', 'estado', 'fecha_alta', 'observaciones', 'email'],
      sesiones: ['sesion_id', 'fecha', 'unidad_id', 'tema_id', 'duracion_min', 'estado', 'observaciones'],
      resultados: ['resultado_id', 'alumno_id', 'ejercicio_id', 'intento', 'fecha', 'estado', 'nivel_autonomia', 'nota_10', 'entrega_url', 'dificultad', 'accion_refuerzo'],
      fichajes: ['fichaje_id', 'alumno_id', 'nombre', 'fecha', 'entrada', 'salida'],
      catalogo: ['curso_id', 'unidad_id', 'tema_id', 'tema', 'ejercicio_id', 'objetivo', 'entrega', 'teoria_url', 'ejercicio_url'],
    };
    for (const [tabla, cols] of Object.entries(columnas)) {
      const r = await e.cliente().get(`/api/integraciones/export/${tabla}`, conClave);
      assert.equal(r.status, 200, tabla);
      assert.ok(r.body.length > 0, `${tabla} tiene filas`);
      assert.deepEqual(Object.keys(r.body[0]), cols, tabla);
    }
    const alumnos = (await e.cliente().get('/api/integraciones/export/alumnos', conClave)).body;
    assert.equal(alumnos[0].estado, 'Activo');
    const catalogo = (await e.cliente().get('/api/integraciones/export/catalogo', conClave)).body;
    assert.equal(catalogo.length, 20);
    assert.equal((await e.cliente().get('/api/integraciones/export/usuarios', conClave)).status, 404);
  });
});
