// RF-09 · El alumno accede a los ejercicios y entrega sus trabajos.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prepararEntorno } from './entorno.js';

let e;
let alumno;
let otro;
before(async () => {
  e = await prepararEntorno();
  alumno = await e.crearUsuario('alumno');
  otro = await e.crearUsuario('alumno');
});
after(() => e.cerrar());

describe('RF-09 Ejercicios y entregas', () => {
  test('lista los ejercicios visibles, todos pendientes al empezar', async () => {
    const r = await alumno.get('/api/alumno/ejercicios');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 20);
    assert.ok(r.body.every((x) => x.estado === null));
  });

  test('entrega un archivo y queda registrado como intento 1', async () => {
    const id = alumno.usuario.alumno_id;
    const r = await alumno.subir('/api/alumno/ejercicios/T02_E01/entregas', 'archivo', 'T02_Aviso.docx', 'mi aviso', { mensaje: 'Hecho en clase' });
    assert.equal(r.status, 201);
    assert.equal(r.body.id, `${id}_T02_E01_I01`);
    assert.equal(r.body.intento, 1);
    assert.equal(r.body.estado, 'Entregado');
    assert.equal(r.body.mensaje, 'Hecho en clase');
    assert.equal(r.body.archivo, undefined);
    const lista = await alumno.get('/api/alumno/ejercicios');
    assert.equal(lista.body.find((x) => x.id === 'T02_E01').estado, 'Entregado');
  });

  test('puede volver a entregar: se guarda como intento 2 sin borrar el primero', async () => {
    const r = await alumno.subir('/api/alumno/ejercicios/T02_E01/entregas', 'archivo', 'T02_Aviso_v2.docx', 'segunda versión');
    assert.equal(r.body.intento, 2);
    assert.match(r.body.id, /_I02$/);
    const historial = await alumno.get('/api/alumno/ejercicios/T02_E01/entregas');
    assert.deepEqual(historial.body.map((x) => x.intento), [2, 1]);
  });

  test('conserva las tildes del nombre del archivo', async () => {
    const r = await alumno.subir('/api/alumno/ejercicios/T03_E01/entregas', 'archivo', 'Organización carpetas.pdf', 'pdf');
    assert.equal(r.body.archivo_nombre, 'Organización carpetas.pdf');
  });

  test('descarga lo que ha entregado, pero no lo de otros alumnos', async () => {
    const id = `${alumno.usuario.alumno_id}_T02_E01_I01`;
    const r = await alumno.get(`/api/alumno/entregas/${id}/archivo`);
    assert.equal(r.status, 200);
    assert.equal(r.body.toString(), 'mi aviso');
    assert.equal((await otro.get(`/api/alumno/entregas/${id}/archivo`)).status, 404);
  });

  test('rechaza entregas sin archivo o con tipos no permitidos', async () => {
    assert.equal((await alumno.pedir('POST', '/api/alumno/ejercicios/T04_E01/entregas', { form: new FormData() })).status, 400);
    assert.equal((await alumno.subir('/api/alumno/ejercicios/T04_E01/entregas', 'archivo', 'virus.exe', 'x')).status, 400);
    assert.equal((await alumno.get('/api/alumno/ejercicios/T04_E01/entregas')).body.length, 0);
  });

  test('no puede entregar un ejercicio oculto o inexistente', async () => {
    await e.query(`UPDATE ejercicios SET visible = false WHERE id = 'T05_E01'`);
    assert.equal((await alumno.subir('/api/alumno/ejercicios/T05_E01/entregas', 'archivo', 'a.pdf', 'x')).status, 404);
    assert.equal((await alumno.subir('/api/alumno/ejercicios/T99_E01/entregas', 'archivo', 'a.pdf', 'x')).status, 404);
  });

  test('cada entrega avisa a n8n con el enlace para descargar el archivo', async () => {
    const eventos = await e.eventos('entrega.creada');
    assert.equal(eventos.length, 3);
    const [primera] = eventos;
    assert.equal(primera.payload.resultado_id, `${alumno.usuario.alumno_id}_T02_E01_I01`);
    assert.equal(primera.payload.archivo_nombre, `${alumno.usuario.alumno_id}_T02_Aviso.docx`, 'el nombre en Drive lleva el ID del alumno');
    assert.equal(primera.payload.archivo_url, `http://aula.test/api/integraciones/entregas/${primera.payload.resultado_id}/archivo`);
  });
});
