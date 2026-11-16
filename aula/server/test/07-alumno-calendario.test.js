// RF-07 · El alumno tiene un calendario con lo pendiente: clases, avisos, fechas límite
// de los ejercicios y sus fichajes.
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
  await profesor.post('/api/eventos', { fecha: '2026-10-20', titulo: 'Examen de la unidad 1', tipo: 'examen' });
  await e.query(`UPDATE ejercicios SET fecha_limite = '2026-10-15' WHERE id IN ('T01_E01', 'T02_E01')`);
  await e.query(`UPDATE ejercicios SET fecha_limite = '2026-11-03' WHERE id = 'T03_E01'`);
});
after(() => e.cerrar());

describe('RF-07 Calendario del alumno', () => {
  test('muestra las clases, avisos y fechas límite del mes', async () => {
    const r = await alumno.get('/api/alumno/calendario?mes=2026-10');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.sesiones.map((s) => [s.id, s.fecha]), [['SES001', '2026-10-08']]);
    assert.equal(r.body.sesiones[0].tema_titulo, 'Escritorio y ventanas');
    assert.deepEqual(r.body.eventos.map((x) => x.titulo), ['Examen de la unidad 1']);
    assert.deepEqual(r.body.limites.map((l) => l.id).sort(), ['T01_E01', 'T02_E01']);
  });

  test('no mezcla meses: noviembre solo trae lo suyo', async () => {
    const r = await alumno.get('/api/alumno/calendario?mes=2026-11');
    assert.deepEqual(r.body.sesiones, []);
    assert.deepEqual(r.body.limites.map((l) => l.id), ['T03_E01']);
  });

  test('marca como hecho lo que ya ha entregado', async () => {
    await alumno.subir('/api/alumno/ejercicios/T01_E01/entregas', 'archivo', 'T01.docx', 'x');
    const r = await alumno.get('/api/alumno/calendario?mes=2026-10');
    const porId = Object.fromEntries(r.body.limites.map((l) => [l.id, l.entregado]));
    assert.deepEqual(porId, { T01_E01: true, T02_E01: false });
  });

  test('no muestra fechas límite de ejercicios ocultos', async () => {
    await e.query(`UPDATE ejercicios SET visible = false WHERE id = 'T02_E01'`);
    const r = await alumno.get('/api/alumno/calendario?mes=2026-10');
    assert.deepEqual(r.body.limites.map((l) => l.id), ['T01_E01']);
  });

  test('incluye sus propios fichajes y no los de otros', async () => {
    const otro = await e.crearUsuario('alumno');
    await e.query(`INSERT INTO fichajes (usuario_id, fecha, entrada) VALUES ($1, '2026-10-08', '2026-10-08 09:25+02'), ($2, '2026-10-08', '2026-10-08 09:40+02')`,
      [alumno.usuario.id, otro.usuario.id]);
    const r = await alumno.get('/api/alumno/calendario?mes=2026-10');
    assert.equal(r.body.fichajes.length, 1);
    assert.equal(r.body.fichajes[0].fecha, '2026-10-08');
  });

  test('la pantalla de inicio indica la próxima clase y lo pendiente', async () => {
    const r = await alumno.get('/api/alumno/inicio');
    assert.equal(r.status, 200);
    assert.equal(r.body.progreso.total, 20);
    assert.ok(r.body.pendientes.length > 0);
    assert.ok(r.body.pendientes.every((p) => !p.estado));
  });

  test('rechaza un mes con formato incorrecto', async () => {
    assert.equal((await alumno.get('/api/alumno/calendario?mes=octubre')).status, 400);
  });
});
