// RF-02 · Administración: CRUD completo de todos los datos de la web.
// Los formularios del admin envían siempre todas las columnas (las vacías como '').
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prepararEntorno } from './entorno.js';

let e;
let adm;
before(async () => {
  e = await prepararEntorno();
  adm = await e.admin();
});
after(() => e.cerrar());

const TABLAS = ['usuarios', 'unidades', 'temas', 'ejercicios', 'sesiones', 'eventos', 'fichajes', 'asistencia', 'resultados', 'invitaciones'];

describe('RF-02.1 Acceso a todas las tablas', () => {
  test('lista todas las tablas de la aplicación con sus columnas', async () => {
    const r = await adm.get('/api/admin/tablas');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((t) => t.nombre).sort(), [...TABLAS].sort());
    assert.ok(r.body.every((t) => Object.keys(t.columnas).length > 0));
  });

  test('puede leer cada tabla', async () => {
    for (const t of TABLAS) {
      const r = await adm.get(`/api/admin/tablas/${t}`);
      assert.equal(r.status, 200, t);
      assert.ok(Array.isArray(r.body.filas), t);
    }
    const temas = await adm.get('/api/admin/tablas/temas');
    assert.equal(temas.body.total, 20, 'el temario del curso viene cargado');
  });

  test('busca dentro de una tabla', async () => {
    const r = await adm.get('/api/admin/tablas/temas?buscar=carpetas');
    assert.deepEqual(r.body.filas.map((t) => t.id), ['T03']);
  });

  test('una tabla que no existe da 404', async () => {
    assert.equal((await adm.get('/api/admin/tablas/contrasenas')).status, 404);
  });
});

describe('RF-02.2 Crear, editar y borrar', () => {
  test('usuarios: alta de alumno con ID automático, edición y borrado', async () => {
    const alta = await adm.post('/api/admin/tablas/usuarios', { nombre: 'Luis Gómez', email: 'LUIS@aula.test', rol: 'alumno', password: 'Clave-luis-1' });
    assert.equal(alta.status, 201);
    assert.match(alta.body.alumno_id, /^ALU\d{3}$/);
    assert.equal(alta.body.email, 'luis@aula.test');
    assert.equal(alta.body.password_hash, undefined);
    assert.equal((await e.cliente().post('/api/auth/login', { email: 'luis@aula.test', password: 'Clave-luis-1' })).status, 200);

    const edicion = await adm.put(`/api/admin/tablas/usuarios/${alta.body.id}`, { nombre: 'Luis Gómez Ruiz', grupo: 'Tarde' });
    assert.equal(edicion.status, 200);
    assert.equal(edicion.body.nombre, 'Luis Gómez Ruiz');

    assert.equal((await adm.del(`/api/admin/tablas/usuarios/${alta.body.id}`)).status, 200);
    assert.equal(await e.one('SELECT id FROM usuarios WHERE id = $1', [alta.body.id]), null);
  });

  test('cambia la contraseña de un usuario', async () => {
    const alu = await e.crearUsuario('alumno');
    await adm.put(`/api/admin/tablas/usuarios/${alu.usuario.id}`, { password: 'Puesta-por-admin' });
    assert.equal((await e.cliente().post('/api/auth/login', { email: alu.email, password: 'Puesta-por-admin' })).status, 200);
  });

  test('unidades, temas y ejercicios', async () => {
    assert.equal((await adm.post('/api/admin/tablas/unidades', { id: 'U90', titulo: 'Unidad de prueba', orden: 90 })).status, 201);
    assert.equal((await adm.post('/api/admin/tablas/temas', { id: 'T90', unidad_id: 'U90', titulo: 'Tema de prueba', visible: false })).status, 201);
    assert.equal((await adm.post('/api/admin/tablas/ejercicios', { id: 'T90_E01', tema_id: 'T90', titulo: 'Ejercicio de prueba' })).status, 201);

    const tema = await adm.put('/api/admin/tablas/temas/T90', { titulo: 'Tema editado', visible: 'true', minutos: '20' });
    assert.equal(tema.body.titulo, 'Tema editado');
    assert.equal(tema.body.visible, true);
    assert.equal(tema.body.minutos, 20);

    assert.equal((await adm.del('/api/admin/tablas/ejercicios/T90_E01')).status, 200);
    assert.equal((await adm.del('/api/admin/tablas/temas/T90')).status, 200);
    assert.equal((await adm.del('/api/admin/tablas/unidades/U90')).status, 200);
  });

  test('sesiones, eventos del calendario e invitaciones', async () => {
    const s = await adm.post('/api/admin/tablas/sesiones', { id: 'SES090', fecha: '2026-11-02', titulo: 'Sesión de prueba', hora_inicio: '09:30' });
    assert.equal(s.status, 201);
    assert.equal((await adm.put('/api/admin/tablas/sesiones/SES090', { estado: 'cerrada' })).body.estado, 'cerrada');

    const ev = await adm.post('/api/admin/tablas/eventos', { fecha: '2026-12-08', titulo: 'Festivo', tipo: 'festivo' });
    assert.equal(ev.status, 201);
    assert.equal((await adm.del(`/api/admin/tablas/eventos/${ev.body.id}`)).status, 200);

    const inv = await adm.post('/api/admin/tablas/invitaciones', { email: 'admin-inv@aula.test', expira_en: '2026-12-31T00:00:00Z' });
    assert.equal(inv.status, 201);
    assert.ok(inv.body.token.length > 20, 'genera el token');
    assert.equal((await adm.del(`/api/admin/tablas/invitaciones/${inv.body.token}`)).status, 200);
    assert.equal((await adm.del('/api/admin/tablas/sesiones/SES090')).status, 200);
  });

  test('asistencia, fichajes y resultados', async () => {
    const alu = await e.crearUsuario('alumno');
    const id = alu.usuario.alumno_id;
    assert.equal((await adm.post('/api/admin/tablas/asistencia', { id: `SES001_${id}`, sesion_id: 'SES001', alumno_id: id, estado: 'Justificada' })).status, 201);
    assert.equal((await adm.put(`/api/admin/tablas/asistencia/SES001_${id}`, { estado: 'Presente' })).body.estado, 'Presente');

    const f = await adm.post('/api/admin/tablas/fichajes', { usuario_id: alu.usuario.id, fecha: '2026-10-08', entrada: '2026-10-08 09:05' });
    assert.equal(f.status, 201);
    assert.equal((await adm.put(`/api/admin/tablas/fichajes/${f.body.id}`, { salida: '2026-10-08 13:30' })).status, 200);

    const rid = `${id}_T01_E01_I01`;
    assert.equal((await adm.post('/api/admin/tablas/resultados', { id: rid, alumno_id: id, ejercicio_id: 'T01_E01', intento: 1, nota_10: '7,5' })).status, 201);
    assert.equal(Number((await e.one('SELECT nota_10 FROM resultados WHERE id = $1', [rid])).nota_10), 7.5, 'acepta la coma decimal');

    for (const [t, pk] of [['asistencia', `SES001_${id}`], ['fichajes', f.body.id], ['resultados', rid]]) {
      assert.equal((await adm.del(`/api/admin/tablas/${t}/${pk}`)).status, 200, t);
    }
  });
});

describe('RF-02.3 Validaciones y protecciones', () => {
  test('rechaza campos obligatorios vacíos, valores no permitidos y duplicados', async () => {
    assert.equal((await adm.post('/api/admin/tablas/unidades', { id: '', titulo: 'Sin ID', orden: '' })).status, 400);
    assert.equal((await adm.post('/api/admin/tablas/usuarios', { nombre: 'X', email: 'x@aula.test', rol: 'jefe' })).status, 400);
    assert.equal((await adm.post('/api/admin/tablas/temas', { id: 'T01', unidad_id: 'U01', titulo: 'Repetido' })).status, 409);
    assert.equal((await adm.post('/api/admin/tablas/temas', { id: 'T91', unidad_id: 'U99', titulo: 'Unidad inexistente' })).status, 409);
  });

  test('no se puede borrar, degradar ni dar de baja a sí mismo', async () => {
    const yo = (await adm.get('/api/auth/yo')).body.usuario;
    assert.equal((await adm.del(`/api/admin/tablas/usuarios/${yo.id}`)).status, 400);
    assert.equal((await adm.put(`/api/admin/tablas/usuarios/${yo.id}`, { rol: 'profesor' })).status, 400);
    assert.equal((await adm.put(`/api/admin/tablas/usuarios/${yo.id}`, { estado: 'baja' })).status, 400);
  });

  test('borrar algo que no existe da 404', async () => {
    assert.equal((await adm.del('/api/admin/tablas/unidades/U77')).status, 404);
  });

  test('el profesor no puede usar el CRUD del admin', async () => {
    const prof = await e.crearUsuario('profesor');
    assert.equal((await prof.get('/api/admin/tablas/usuarios')).status, 403);
    assert.equal((await prof.post('/api/admin/tablas/unidades', { id: 'U80', titulo: 'X' })).status, 403);
  });
});
