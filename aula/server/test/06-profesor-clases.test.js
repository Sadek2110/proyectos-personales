// RF-06 · El profesor organiza las clases: sesiones, asistencia, avisos del calendario,
// panel del día y seguimiento de cada alumno.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prepararEntorno } from './entorno.js';

let e;
let profesor;
let alumno;
before(async () => {
  e = await prepararEntorno();
  profesor = await e.crearUsuario('profesor');
  alumno = await e.crearUsuario('alumno', { grupo: 'Mañana' });
});
after(() => e.cerrar());

describe('RF-06.1 Sesiones', () => {
  test('crea una sesión con ID consecutivo y calcula su duración', async () => {
    const r = await profesor.post('/api/sesiones', { fecha: '2026-10-09', hora_inicio: '09:30', hora_fin: '13:30', titulo: 'Carpetas', unidad_id: 'U02', tema_id: 'T03' });
    assert.equal(r.status, 201);
    assert.equal(r.body.id, 'SES002', 'SES001 ya viene del catálogo');
    const [ev] = (await e.eventos('sesion.guardada')).filter((x) => x.payload.sesion_id === 'SES002');
    assert.equal(ev.payload.duracion_min, 240);
    assert.equal(ev.payload.estado, 'Planificada');
  });

  test('edita y lista las sesiones', async () => {
    const r = await profesor.put('/api/sesiones/SES002', { fecha: '2026-10-09', hora_inicio: '10:00', hora_fin: '13:30', titulo: 'Carpetas y archivos' });
    assert.equal(r.body.titulo, 'Carpetas y archivos');
    const lista = await profesor.get('/api/sesiones');
    assert.deepEqual(lista.body.map((s) => s.id), ['SES001', 'SES002']);
  });

  test('valida fecha y hora', async () => {
    assert.equal((await profesor.post('/api/sesiones', { fecha: '9/10/2026', titulo: 'X' })).status, 400);
    assert.equal((await profesor.post('/api/sesiones', { fecha: '2026-10-09', hora_inicio: '9h', titulo: 'X' })).status, 400);
  });
});

describe('RF-06.2 Asistencia y cierre de la clase', () => {
  test('pasa lista y la guarda con el ID SESIÓN_ALUMNO', async () => {
    const id = alumno.usuario.alumno_id;
    const r = await profesor.put('/api/sesiones/SES002/asistencia', { registros: [{ alumno_id: id, estado: 'Retraso', minutos_retraso: '15', observaciones: 'Autobús' }] });
    assert.equal(r.status, 200);
    const lista = await profesor.get('/api/sesiones/SES002/asistencia');
    const fila = lista.body.alumnos.find((a) => a.alumno_id === id);
    assert.equal(fila.estado, 'Retraso');
    assert.equal(fila.minutos_retraso, 15);
    const [ev] = await e.eventos('asistencia.actualizada');
    assert.equal(ev.payload.asistencia_id, `SES002_${id}`);
  });

  test('al volver a pasar lista actualiza el registro sin duplicarlo', async () => {
    const id = alumno.usuario.alumno_id;
    await profesor.put('/api/sesiones/SES002/asistencia', { registros: [{ alumno_id: id, estado: 'Presente', minutos_retraso: 15 }] });
    const filas = await e.query('SELECT * FROM asistencia WHERE sesion_id = $1', ['SES002']);
    assert.equal(filas.length, 1);
    assert.equal(filas[0].estado, 'Presente');
    assert.equal(filas[0].minutos_retraso, null, 'los minutos de retraso solo cuentan si llega tarde');
  });

  test('rechaza un estado de asistencia que no existe', async () => {
    const r = await profesor.put('/api/sesiones/SES002/asistencia', { registros: [{ alumno_id: alumno.usuario.alumno_id, estado: 'Tarde' }] });
    assert.equal(r.status, 400);
  });

  test('cierra la clase y envía el resumen para el diario', async () => {
    const r = await profesor.post('/api/sesiones/SES002/cerrar', { observaciones: 'Grupo atento' });
    assert.equal(r.body.estado, 'cerrada');
    const [ev] = await e.eventos('sesion.cerrada');
    assert.equal(ev.payload.estado, 'Cerrada');
    assert.deepEqual(ev.payload.asistencia, { Presente: 1 });
    assert.equal(ev.payload.observaciones, 'Grupo atento');
  });

  test('borra una sesión', async () => {
    const s = await profesor.post('/api/sesiones', { fecha: '2026-10-20', titulo: 'Para borrar' });
    assert.equal((await profesor.del(`/api/sesiones/${s.body.id}`)).status, 200);
    assert.equal((await e.eventos('sesion.borrada'))[0].payload.sesion_id, s.body.id);
  });
});

describe('RF-06.3 Avisos del calendario', () => {
  test('crea, edita y borra avisos que el alumnado ve en su calendario', async () => {
    const r = await profesor.post('/api/eventos', { fecha: '2026-10-12', titulo: 'Fiesta Nacional', tipo: 'festivo' });
    assert.equal(r.status, 201);
    assert.equal((await profesor.put(`/api/eventos/${r.body.id}`, { fecha: '2026-10-12', titulo: 'No hay clase', tipo: 'festivo' })).body.titulo, 'No hay clase');
    const cal = await alumno.get('/api/alumno/calendario?mes=2026-10');
    assert.ok(cal.body.eventos.some((x) => x.titulo === 'No hay clase'));
    assert.equal((await profesor.del(`/api/eventos/${r.body.id}`)).status, 200);
    assert.equal((await profesor.post('/api/eventos', { fecha: '2026-10-12', titulo: 'X', tipo: 'fiesta' })).status, 400);
  });
});

describe('RF-06.4 Panel y seguimiento del alumnado', () => {
  test('el panel muestra a los alumnos activos y los fichajes de hoy', async () => {
    await alumno.post('/api/alumno/fichar', { tipo: 'entrada' });
    const r = await profesor.get('/api/panel');
    assert.equal(r.status, 200);
    assert.equal(r.body.stats.alumnos, 1);
    assert.equal(r.body.stats.presentes_hoy, 1);
    assert.ok(r.body.hoy[0].fichaje.entrada);
    const fichajes = await profesor.get('/api/fichajes');
    assert.equal(fichajes.body[0].alumno_id, alumno.usuario.alumno_id);
  });

  test('edita la ficha del alumno y lo da de baja', async () => {
    const id = alumno.usuario.alumno_id;
    const r = await profesor.put(`/api/alumnos/${id}`, { nombre: 'Alumno Editado', grupo: 'Tarde', estado: 'baja', observaciones: 'Deja el curso' });
    assert.equal(r.status, 200);
    const ficha = await profesor.get(`/api/alumnos/${id}`);
    assert.equal(ficha.body.nombre, 'Alumno Editado');
    assert.equal(ficha.body.estado, 'baja');
    const [ev] = await e.eventos('alumno.actualizado');
    assert.equal(ev.payload.estado, 'Baja');
    assert.equal((await profesor.get('/api/panel')).body.stats.alumnos, 0, 'deja de contar como activo');
  });
});
