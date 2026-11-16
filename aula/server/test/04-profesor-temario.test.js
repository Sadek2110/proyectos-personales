// RF-04 · El profesor añade y edita el temario y los ejercicios.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prepararEntorno } from './entorno.js';

let e;
let profesor;
let alumno;
before(async () => {
  e = await prepararEntorno();
  profesor = await e.crearUsuario('profesor');
  alumno = await e.crearUsuario('alumno');
});
after(() => e.cerrar());

describe('RF-04.1 Temario', () => {
  test('el curso arranca con sus 7 unidades y 20 temas', async () => {
    const r = await profesor.get('/api/unidades');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 7);
    assert.equal(r.body.flatMap((u) => u.temas).length, 20);
  });

  test('crea una unidad y un tema oculto que el alumnado todavía no ve', async () => {
    assert.equal((await profesor.post('/api/unidades', { id: 'u08', titulo: 'Repaso final', orden: 8 })).status, 201);
    const t = await profesor.post('/api/temas', {
      id: 'T21', unidad_id: 'U08', titulo: 'Repaso general', objetivo: 'Repasar', contenido: '## Repaso\n\nTexto del tema.', visible: false, orden: 21,
    });
    assert.equal(t.status, 201);
    assert.equal(t.body.id, 'T21', 'normaliza el ID a mayúsculas');

    const vistaProfesor = (await profesor.get('/api/unidades')).body.find((u) => u.id === 'U08');
    assert.equal(vistaProfesor.temas[0].id, 'T21');
    assert.equal((await alumno.get('/api/unidades')).body.find((u) => u.id === 'U08'), undefined);
    assert.equal((await alumno.get('/api/temas/T21')).status, 404);
  });

  test('al publicar el tema el alumnado ya lo ve', async () => {
    const r = await profesor.put('/api/temas/T21', { id: 'T21', unidad_id: 'U08', titulo: 'Repaso general', contenido: '## Repaso\n\nTexto del tema.', visible: true, orden: 21 });
    assert.equal(r.status, 200);
    const t = await alumno.get('/api/temas/T21');
    assert.equal(t.status, 200);
    assert.match(t.body.contenido, /Texto del tema/);
  });

  test('sube su propio archivo para el tema y el alumnado lo descarga tal cual', async () => {
    const contenido = 'Apuntes del profesor';
    const r = await profesor.subir('/api/temas/T21/archivo', 'archivo', 'Apuntes T21.pdf', contenido);
    assert.equal(r.status, 200);
    const d = await alumno.get('/api/temas/T21/descargar?formato=original');
    assert.equal(d.status, 200);
    assert.equal(d.body.toString(), contenido);
    assert.equal((await profesor.del('/api/temas/T21/archivo')).status, 200);
    assert.equal((await alumno.get('/api/temas/T21/descargar?formato=original')).status, 404);
  });

  test('valida el formato de los IDs', async () => {
    assert.equal((await profesor.post('/api/temas', { id: 'TEMA', unidad_id: 'U08', titulo: 'X' })).status, 400);
    assert.equal((await profesor.post('/api/unidades', { id: '8', titulo: 'X' })).status, 400);
  });
});

describe('RF-04.2 Ejercicios', () => {
  test('crea un ejercicio con fecha límite y el alumnado lo ve en su lista', async () => {
    const r = await profesor.post('/api/ejercicios', {
      id: 'T21_E01', tema_id: 'T21', titulo: 'Repaso práctico', enunciado: '## Pasos\n\n1. Hazlo', entrega: 'T21_Repaso.docx', fecha_limite: '2026-10-30',
    });
    assert.equal(r.status, 201);
    const lista = (await alumno.get('/api/alumno/ejercicios')).body;
    assert.ok(lista.some((x) => x.id === 'T21_E01'));
  });

  test('edita y oculta un ejercicio', async () => {
    const r = await profesor.put('/api/ejercicios/T21_E01', { id: 'T21_E01', tema_id: 'T21', titulo: 'Repaso práctico (v2)', visible: false });
    assert.equal(r.body.titulo, 'Repaso práctico (v2)');
    assert.equal((await alumno.get('/api/ejercicios/T21_E01')).status, 404);
    assert.equal((await profesor.get('/api/ejercicios/T21_E01')).status, 200);
  });

  test('rechaza una fecha límite con formato incorrecto', async () => {
    assert.equal((await profesor.post('/api/ejercicios', { id: 'T21_E02', tema_id: 'T21', titulo: 'X', fecha_limite: '30/10/2026' })).status, 400);
  });

  test('borra el ejercicio, el tema y la unidad', async () => {
    assert.equal((await profesor.del('/api/ejercicios/T21_E01')).status, 200);
    assert.equal((await profesor.del('/api/temas/T21')).status, 200);
    assert.equal((await profesor.del('/api/unidades/U08')).status, 200);
    assert.equal((await profesor.del('/api/unidades/U08')).status, 404);
  });

  test('el alumnado no puede editar el temario', async () => {
    assert.equal((await alumno.post('/api/temas', { id: 'T30', unidad_id: 'U01', titulo: 'X' })).status, 403);
    assert.equal((await alumno.del('/api/ejercicios/T01_E01')).status, 403);
  });
});
