// RF-08 · El alumno lee cada tema en la web y puede descargarlo.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prepararEntorno } from './entorno.js';

let e;
let alumno;
before(async () => {
  e = await prepararEntorno();
  alumno = await e.crearUsuario('alumno');
});
after(() => e.cerrar());

describe('RF-08 Temario del alumno', () => {
  test('ve el índice de unidades con sus temas y ejercicios', async () => {
    const r = await alumno.get('/api/unidades');
    assert.equal(r.status, 200);
    assert.equal(r.body[0].id, 'U01');
    assert.equal(r.body[0].temas[0].id, 'T01');
    assert.equal(r.body[0].temas[0].ejercicios[0].id, 'T01_E01');
  });

  test('lee un tema en la web con su contenido y navegación', async () => {
    const r = await alumno.get('/api/temas/T02');
    assert.equal(r.status, 200);
    assert.equal(r.body.titulo, 'Ratón, teclado y edición');
    assert.match(r.body.contenido, /## Qué aprenderás/);
    assert.equal(r.body.anterior.id, 'T01');
    assert.equal(r.body.siguiente.id, 'T03');
    assert.equal(r.body.ejercicios[0].id, 'T02_E01');
  });

  test('descarga el tema en PDF', async () => {
    const r = await alumno.get('/api/temas/T02/descargar?formato=pdf');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.match(r.headers.get('content-disposition'), /attachment; filename=.*T02.*\.pdf/);
    assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
  });

  test('descarga el tema en Word', async () => {
    const r = await alumno.get('/api/temas/T02/descargar?formato=docx');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /wordprocessingml/);
    assert.equal(r.body.subarray(0, 2).toString(), 'PK', 'un .docx es un ZIP');
  });

  test('lee y descarga el enunciado de un ejercicio', async () => {
    const r = await alumno.get('/api/ejercicios/T02_E01');
    assert.equal(r.status, 200);
    assert.match(r.body.enunciado, /## Qué tienes que entregar/);
    const pdf = await alumno.get('/api/ejercicios/T02_E01/descargar?formato=pdf');
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  });

  test('no ve temas ocultos ni puede descargarlos', async () => {
    await e.query(`UPDATE temas SET visible = false WHERE id = 'T20'`);
    assert.equal((await alumno.get('/api/temas/T20')).status, 404);
    assert.equal((await alumno.get('/api/temas/T20/descargar?formato=pdf')).status, 404);
    assert.equal((await alumno.get('/api/ejercicios/T20_E01')).status, 404, 'tampoco el ejercicio de un tema oculto');
    assert.equal((await alumno.get('/api/temas/T19')).body.siguiente, null, 'la navegación lo salta');
  });

  test('rechaza un formato de descarga desconocido', async () => {
    assert.equal((await alumno.get('/api/temas/T01/descargar?formato=exe')).status, 400);
  });
});
