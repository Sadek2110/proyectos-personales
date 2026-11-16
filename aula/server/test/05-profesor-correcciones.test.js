// RF-05 · El profesor revisa las entregas y da correcciones que el alumnado ve.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prepararEntorno } from './entorno.js';

let e;
let profesor;
let alumno;
let entrega;
before(async () => {
  e = await prepararEntorno();
  profesor = await e.crearUsuario('profesor');
  alumno = await e.crearUsuario('alumno');
  entrega = (await alumno.subir('/api/alumno/ejercicios/T01_E01/entregas', 'archivo', 'T01_Prueba.docx', 'contenido del alumno')).body;
});
after(() => e.cerrar());

describe('RF-05 Correcciones', () => {
  test('el profesor ve las entregas pendientes de corregir', async () => {
    const r = await profesor.get('/api/entregas?estado=Entregado');
    assert.equal(r.status, 200);
    const fila = r.body.find((x) => x.id === entrega.id);
    assert.equal(fila.alumno_id, alumno.usuario.alumno_id);
    assert.equal(fila.ejercicio_titulo, 'Práctica: Escritorio y ventanas');
    const panel = await profesor.get('/api/panel');
    assert.equal(panel.body.stats.por_corregir, 1);
  });

  test('abre la entrega con el enunciado y descarga el archivo del alumno', async () => {
    const r = await profesor.get(`/api/entregas/${entrega.id}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.enunciado.length > 0);
    assert.equal(r.body.archivo, undefined, 'no expone la ruta interna del archivo');
    const d = await profesor.get(`/api/entregas/${entrega.id}/archivo`);
    assert.equal(d.status, 200);
    assert.equal(d.body.toString(), 'contenido del alumno');
  });

  test('valida la nota (0–10) y el nivel de autonomía (1–4)', async () => {
    assert.equal((await profesor.put(`/api/entregas/${entrega.id}/correccion`, { nota_10: 11, nivel_autonomia: '' })).status, 400);
    assert.equal((await profesor.put(`/api/entregas/${entrega.id}/correccion`, { nota_10: '', nivel_autonomia: 5 })).status, 400);
  });

  test('guarda la corrección y marca la entrega como revisada', async () => {
    const r = await profesor.put(`/api/entregas/${entrega.id}/correccion`, {
      nota_10: 7.5, nivel_autonomia: 3, dificultad: 'Guardar archivo', accion_refuerzo: 'Repetir T04', comentario: 'Buen trabajo, revisa dónde guardas.',
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.estado, 'Revisado');
    const panel = await profesor.get('/api/panel');
    assert.equal(panel.body.stats.por_corregir, 0);
    assert.equal(Number(panel.body.stats.media_nota), 7.5);
  });

  test('el alumno ve su nota y el comentario', async () => {
    const r = await alumno.get('/api/alumno/ejercicios/T01_E01/entregas');
    assert.equal(r.body[0].estado, 'Revisado');
    assert.equal(Number(r.body[0].nota_10), 7.5);
    assert.equal(r.body[0].comentario, 'Buen trabajo, revisa dónde guardas.');
    const inicio = await alumno.get('/api/alumno/inicio');
    assert.ok(inicio.body.corregidos.some((c) => c.id === 'T01_E01'));
  });

  test('la corrección se envía a n8n para el Sheet de seguimiento', async () => {
    const [ev] = await e.eventos('resultado.revisado');
    assert.equal(ev.payload.resultado_id, entrega.id);
    assert.equal(ev.payload.estado, 'Revisado');
    assert.equal(Number(ev.payload.nota_10), 7.5);
    assert.equal(ev.payload.nivel_autonomia, 3);
    assert.equal(ev.payload.dificultad, 'Guardar archivo');
  });

  test('aparece en la ficha del alumno', async () => {
    const r = await profesor.get(`/api/alumnos/${alumno.usuario.alumno_id}`);
    assert.equal(r.body.resultados[0].estado, 'Revisado');
    const lista = await profesor.get('/api/alumnos');
    const a = lista.body.find((x) => x.alumno_id === alumno.usuario.alumno_id);
    assert.equal(a.ejercicios_revisados, 1);
    assert.equal(Number(a.media_nota_10), 7.5);
  });

  test('corregir una entrega que no existe da 404', async () => {
    const formulario = { nota_10: 5, nivel_autonomia: '', dificultad: '', accion_refuerzo: '', comentario: '' };
    assert.equal((await profesor.put('/api/entregas/ALU999_T01_E01_I01/correccion', formulario)).status, 404);
  });
});
