// RF-01 · Autenticación: el alumnado se registra con una invitación, entra con su cuenta
// y cada rol solo accede a su parte.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ADMIN, prepararEntorno } from './entorno.js';

let e;
let profesor;
before(async () => {
  e = await prepararEntorno();
  profesor = await e.crearUsuario('profesor');
});
after(() => e.cerrar());

const tokenDe = (enlace) => enlace.split('/invitacion/')[1];

describe('RF-01.1 Inicio y cierre de sesión', () => {
  test('entra con correo y contraseña correctos y la sesión queda abierta', async () => {
    const cli = e.cliente();
    const r = await cli.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password });
    assert.equal(r.status, 200);
    assert.equal(r.body.usuario.rol, 'admin');
    assert.equal(r.body.usuario.password_hash, undefined, 'nunca devuelve el hash de la contraseña');
    const yo = await cli.get('/api/auth/yo');
    assert.equal(yo.body.usuario.email, ADMIN.email);
  });

  test('el correo no distingue mayúsculas ni espacios', async () => {
    const r = await e.cliente().post('/api/auth/login', { email: `  ${ADMIN.email.toUpperCase()} `, password: ADMIN.password });
    assert.equal(r.status, 200);
  });

  test('rechaza una contraseña incorrecta o un correo que no existe', async () => {
    assert.equal((await e.cliente().post('/api/auth/login', { email: ADMIN.email, password: 'mala' })).status, 401);
    assert.equal((await e.cliente().post('/api/auth/login', { email: 'nadie@aula.test', password: 'x' })).status, 401);
  });

  test('bloquea tras 10 intentos fallidos seguidos', async () => {
    const cli = e.cliente();
    for (let i = 0; i < 10; i++) await cli.post('/api/auth/login', { email: 'fuerza@aula.test', password: `x${i}` });
    const r = await cli.post('/api/auth/login', { email: 'fuerza@aula.test', password: 'otra' });
    assert.equal(r.status, 429);
  });

  test('al cerrar sesión deja de estar identificado', async () => {
    const cli = await e.admin();
    assert.equal((await cli.post('/api/auth/logout', {})).status, 200);
    assert.equal((await cli.get('/api/auth/yo')).body.usuario, null);
    assert.equal((await cli.get('/api/unidades')).status, 401);
  });
});

describe('RF-01.2 Registro del alumnado con invitación', () => {
  let token;
  before(async () => {
    const r = await profesor.post('/api/invitaciones', { emails: ['nueva@aula.test'], grupo: 'Mañana' });
    token = tokenDe(r.body.creadas[0].enlace);
  });

  test('la invitación muestra el correo invitado', async () => {
    const r = await e.cliente().get(`/api/auth/invitacion/${token}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.email, 'nueva@aula.test');
    assert.equal(r.body.rol, 'alumno');
  });

  test('exige aceptar el uso de los datos y una contraseña de 8 caracteres', async () => {
    const sinConsentimiento = await e.cliente().post(`/api/auth/invitacion/${token}`, { nombre: 'Ana Pérez', password: 'Clave-segura' });
    assert.equal(sinConsentimiento.status, 400);
    const corta = await e.cliente().post(`/api/auth/invitacion/${token}`, { nombre: 'Ana Pérez', password: 'corta', consentimiento: true });
    assert.equal(corta.status, 400);
  });

  test('crea la cuenta con ID de alumno, del grupo invitado, y entra directamente', async () => {
    const cli = e.cliente();
    const r = await cli.post(`/api/auth/invitacion/${token}`, { nombre: 'Ana Pérez', password: 'Clave-segura', consentimiento: true });
    assert.equal(r.status, 200);
    assert.match(r.body.usuario.alumno_id, /^ALU\d{3}$/);
    assert.equal(r.body.usuario.grupo, 'Mañana');
    assert.equal((await cli.get('/api/alumno/inicio')).status, 200);
    assert.equal((await e.cliente().post('/api/auth/login', { email: 'nueva@aula.test', password: 'Clave-segura' })).status, 200);
  });

  test('el enlace solo se puede usar una vez', async () => {
    assert.equal((await e.cliente().get(`/api/auth/invitacion/${token}`)).status, 410);
    const r = await e.cliente().post(`/api/auth/invitacion/${token}`, { nombre: 'Otra', password: 'Clave-segura', consentimiento: true });
    assert.equal(r.status, 410);
  });

  test('un enlace caducado o inventado no sirve', async () => {
    const r = await profesor.post('/api/invitaciones', { emails: ['caducada@aula.test'] });
    const caducado = tokenDe(r.body.creadas[0].enlace);
    await e.query(`UPDATE invitaciones SET expira_en = now() - interval '1 day' WHERE token = $1`, [caducado]);
    assert.equal((await e.cliente().get(`/api/auth/invitacion/${caducado}`)).status, 410);
    assert.equal((await e.cliente().get('/api/auth/invitacion/inventado')).status, 404);
  });
});

describe('RF-01.3 Contraseñas', () => {
  test('el usuario cambia su contraseña si conoce la actual', async () => {
    const alu = await e.crearUsuario('alumno');
    assert.equal((await alu.post('/api/auth/password', { actual: 'mala', nueva: 'Nueva-clave-1' })).status, 400);
    assert.equal((await alu.post('/api/auth/password', { actual: alu.password, nueva: 'corta' })).status, 400);
    assert.equal((await alu.post('/api/auth/password', { actual: alu.password, nueva: 'Nueva-clave-1' })).status, 200);
    assert.equal((await e.cliente().post('/api/auth/login', { email: alu.email, password: 'Nueva-clave-1' })).status, 200);
  });

  test('el profesor genera un enlace para poner una contraseña nueva', async () => {
    const alu = await e.crearUsuario('alumno');
    const r = await profesor.post(`/api/alumnos/${alu.usuario.alumno_id}/reset`, {});
    assert.equal(r.status, 200);
    const token = tokenDe(r.body.enlace);
    assert.equal((await e.cliente().post(`/api/auth/invitacion/${token}`, { password: 'Recuperada-1' })).status, 200);
    assert.equal((await e.cliente().post('/api/auth/login', { email: alu.email, password: 'Recuperada-1' })).status, 200);
  });

  test('un alumno dado de baja no puede entrar', async () => {
    const alu = await e.crearUsuario('alumno');
    await profesor.put(`/api/alumnos/${alu.usuario.alumno_id}`, { nombre: 'Baja', estado: 'baja' });
    assert.equal((await e.cliente().post('/api/auth/login', { email: alu.email, password: alu.password })).status, 401);
    assert.equal((await alu.get('/api/alumno/inicio')).status, 401, 'su sesión abierta deja de valer');
  });
});

describe('RF-01.4 Permisos por rol', () => {
  test('sin sesión no se accede a nada', async () => {
    const cli = e.cliente();
    for (const ruta of ['/api/alumno/inicio', '/api/unidades', '/api/panel', '/api/admin/tablas']) {
      assert.equal((await cli.get(ruta)).status, 401, ruta);
    }
  });

  test('el alumno no entra en la parte del profesor ni en la del admin', async () => {
    const alu = await e.crearUsuario('alumno');
    assert.equal((await alu.get('/api/panel')).status, 403);
    assert.equal((await alu.get('/api/entregas')).status, 403);
    assert.equal((await alu.post('/api/invitaciones', { emails: ['x@aula.test'] })).status, 403);
    assert.equal((await alu.get('/api/admin/tablas')).status, 403);
  });

  test('el profesor no entra en la administración ni en la parte del alumno', async () => {
    assert.equal((await profesor.get('/api/admin/tablas')).status, 403);
    assert.equal((await profesor.get('/api/alumno/inicio')).status, 403);
  });

  test('el admin puede usar las funciones del profesor', async () => {
    const adm = await e.admin();
    assert.equal((await adm.get('/api/panel')).status, 200);
  });
});
