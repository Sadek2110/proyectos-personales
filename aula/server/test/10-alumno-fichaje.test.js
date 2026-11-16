// RF-10 · El alumno ficha la entrada y la salida; si hay clase ese día, el fichaje
// marca su asistencia (Presente o Retraso).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prepararEntorno } from './entorno.js';

let e;
let fechas;
before(async () => {
  e = await prepararEntorno();
  fechas = await import('../src/lib/fechas.js');
});
after(() => e.cerrar());

const asistenciaDe = (alumnoId) => e.one('SELECT * FROM asistencia WHERE alumno_id = $1', [alumnoId]);

describe('RF-10.1 Entrada y salida', () => {
  let alumno;
  before(async () => { alumno = await e.crearUsuario('alumno'); });

  test('ficha la entrada y la pantalla de inicio lo refleja', async () => {
    const r = await alumno.post('/api/alumno/fichar', { tipo: 'entrada' });
    assert.equal(r.status, 200);
    assert.equal(r.body.fichaje.fecha, fechas.hoy());
    assert.ok(r.body.fichaje.entrada);
    assert.equal(r.body.fichaje.salida, null);
    const inicio = await alumno.get('/api/alumno/inicio');
    assert.equal(inicio.body.fichaje.id, r.body.fichaje.id);
  });

  test('no puede fichar la entrada dos veces el mismo día', async () => {
    assert.equal((await alumno.post('/api/alumno/fichar', { tipo: 'entrada' })).status, 409);
  });

  test('ficha la salida en el mismo registro', async () => {
    const r = await alumno.post('/api/alumno/fichar', { tipo: 'salida' });
    assert.equal(r.status, 200);
    assert.ok(r.body.fichaje.salida);
    assert.ok(new Date(r.body.fichaje.salida) >= new Date(r.body.fichaje.entrada));
    assert.equal((await e.query('SELECT * FROM fichajes WHERE usuario_id = $1', [alumno.usuario.id])).length, 1);
    assert.equal((await alumno.post('/api/alumno/fichar', { tipo: 'salida' })).status, 409, 'y solo una vez');
  });

  test('sin clase hoy, fichar no crea asistencia', async () => {
    assert.equal(await asistenciaDe(alumno.usuario.alumno_id), null);
  });

  test('envía la entrada y la salida a n8n', async () => {
    const [entrada] = await e.eventos('fichaje.entrada');
    const [salida] = await e.eventos('fichaje.salida');
    assert.equal(entrada.payload.alumno_id, alumno.usuario.alumno_id);
    assert.equal(entrada.payload.salida, null);
    assert.equal(salida.payload.fichaje_id, entrada.payload.fichaje_id);
    assert.ok(salida.payload.salida);
  });

  test('no puede fichar la salida sin haber fichado la entrada', async () => {
    const otro = await e.crearUsuario('alumno');
    assert.equal((await otro.post('/api/alumno/fichar', { tipo: 'salida' })).status, 409);
  });

  test('valida el tipo de fichaje y que sea un alumno', async () => {
    const otro = await e.crearUsuario('alumno');
    assert.equal((await otro.post('/api/alumno/fichar', { tipo: 'descanso' })).status, 400);
    const prof = await e.crearUsuario('profesor');
    assert.equal((await prof.post('/api/alumno/fichar', { tipo: 'entrada' })).status, 403);
  });
});

describe('RF-10.2 El fichaje marca la asistencia cuando hay clase', () => {
  before(async () => {
    await e.query(`INSERT INTO sesiones (id, fecha, titulo) VALUES ('SES050', $1, 'Clase de hoy')`, [fechas.hoy()]);
  });

  test('sin hora de inicio, cuenta como Presente', async () => {
    const alumno = await e.crearUsuario('alumno');
    await alumno.post('/api/alumno/fichar', { tipo: 'entrada' });
    const a = await asistenciaDe(alumno.usuario.alumno_id);
    assert.equal(a.id, `SES050_${alumno.usuario.alumno_id}`);
    assert.equal(a.estado, 'Presente');
    assert.equal(a.origen, 'fichaje');
    const [ev] = (await e.eventos('asistencia.actualizada')).filter((x) => x.payload.alumno_id === alumno.usuario.alumno_id);
    assert.equal(ev.payload.estado, 'Presente');
    const [fichaje] = (await e.eventos('fichaje.entrada')).filter((x) => x.payload.alumno_id === alumno.usuario.alumno_id);
    assert.equal(fichaje.payload.sesion_id, 'SES050');
  });

  test('si llega más tarde de la tolerancia (10 min), cuenta como Retraso con los minutos', async (t) => {
    const ahora = fechas.minutosDelDia();
    if (ahora < 30) return t.skip('a menos de media hora de la medianoche no se puede simular un retraso');
    await e.query(`UPDATE sesiones SET hora_inicio = '00:00' WHERE id = 'SES050'`);
    const alumno = await e.crearUsuario('alumno');
    await alumno.post('/api/alumno/fichar', { tipo: 'entrada' });
    const a = await asistenciaDe(alumno.usuario.alumno_id);
    assert.equal(a.estado, 'Retraso');
    assert.ok(Math.abs(a.minutos_retraso - ahora) <= 1);
  });

  test('si llega dentro de la tolerancia, cuenta como Presente', async (t) => {
    const ahora = fechas.minutosDelDia();
    if (ahora < 5) return t.skip('a menos de 5 minutos de la medianoche');
    const inicio = ahora - 5;
    await e.query(`UPDATE sesiones SET hora_inicio = $1 WHERE id = 'SES050'`, [`${String(Math.floor(inicio / 60)).padStart(2, '0')}:${String(inicio % 60).padStart(2, '0')}`]);
    const alumno = await e.crearUsuario('alumno');
    await alumno.post('/api/alumno/fichar', { tipo: 'entrada' });
    assert.equal((await asistenciaDe(alumno.usuario.alumno_id)).estado, 'Presente');
  });

  test('no pisa la asistencia que ya haya puesto el profesor', async () => {
    const alumno = await e.crearUsuario('alumno');
    const prof = await e.crearUsuario('profesor');
    await prof.put('/api/sesiones/SES050/asistencia', { registros: [{ alumno_id: alumno.usuario.alumno_id, estado: 'Justificada' }] });
    await alumno.post('/api/alumno/fichar', { tipo: 'entrada' });
    const a = await asistenciaDe(alumno.usuario.alumno_id);
    assert.equal(a.estado, 'Justificada');
    assert.equal(a.origen, 'profesor');
  });
});
