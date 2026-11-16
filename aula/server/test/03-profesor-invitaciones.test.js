// RF-03 · El profesor invita al alumnado por correo (Gmail a través de n8n).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { prepararEntorno } from './entorno.js';

let e;
let profesor;
before(async () => {
  e = await prepararEntorno();
  profesor = await e.crearUsuario('profesor', { nombre: 'Sadek' });
});
after(() => e.cerrar());

describe('RF-03 Invitaciones', () => {
  test('invita a varios correos a la vez y devuelve un enlace para cada uno', async () => {
    const r = await profesor.post('/api/invitaciones', { emails: ['uno@aula.test', 'DOS@aula.test'], grupo: 'Mañana' });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.creadas.map((c) => c.email), ['uno@aula.test', 'dos@aula.test']);
    for (const c of r.body.creadas) assert.match(c.enlace, /^http:\/\/aula\.test\/invitacion\/[\w-]{20,}$/);
  });

  test('cada invitación deja preparado el correo para que n8n lo envíe por Gmail', async () => {
    const [ev] = (await e.eventos('invitacion.creada')).filter((x) => x.payload.email === 'uno@aula.test');
    assert.ok(ev, 'se ha encolado el evento invitacion.creada');
    assert.equal(ev.payload.tipo, 'alta');
    assert.equal(ev.payload.grupo, 'Mañana');
    assert.match(ev.payload.asunto, /Competencias Digitales/);
    assert.ok(ev.payload.texto.includes(ev.payload.enlace), 'el texto incluye el enlace');
    assert.ok(ev.payload.texto.includes('Sadek'), 'firma el profesor');
  });

  test('no invita a quien ya tiene cuenta', async () => {
    const alu = await e.crearUsuario('alumno');
    const r = await profesor.post('/api/invitaciones', { emails: [alu.email, 'tres@aula.test'] });
    assert.deepEqual(r.body.omitidas, [alu.email]);
    assert.deepEqual(r.body.creadas.map((c) => c.email), ['tres@aula.test']);
  });

  test('rechaza correos mal escritos o una lista vacía', async () => {
    assert.equal((await profesor.post('/api/invitaciones', { emails: ['no-es-un-correo'] })).status, 400);
    assert.equal((await profesor.post('/api/invitaciones', { emails: [] })).status, 400);
  });

  test('lista las invitaciones con su enlace y puede anular una pendiente', async () => {
    const r = await profesor.get('/api/invitaciones');
    assert.equal(r.status, 200);
    const inv = r.body.invitaciones.find((i) => i.email === 'tres@aula.test');
    assert.ok(inv.enlace.endsWith(inv.token));
    assert.equal(r.body.n8n, true, 'indica que n8n está conectado');
    assert.equal((await profesor.del(`/api/invitaciones/${inv.token}`)).status, 200);
    assert.equal((await e.cliente().get(`/api/auth/invitacion/${inv.token}`)).status, 404);
  });

  test('solo el admin puede invitar a otros profesores', async () => {
    assert.equal((await profesor.post('/api/invitaciones', { emails: ['prof2@aula.test'], rol: 'profesor' })).status, 403);
    const adm = await e.admin();
    const r = await adm.post('/api/invitaciones', { emails: ['prof2@aula.test'], rol: 'profesor' });
    assert.equal(r.status, 201);
    const token = r.body.creadas[0].enlace.split('/invitacion/')[1];
    const alta = await e.cliente().post(`/api/auth/invitacion/${token}`, { nombre: 'Profe Dos', password: 'Clave-prof-2' });
    assert.equal(alta.status, 200);
    assert.equal(alta.body.usuario.rol, 'profesor');
    assert.equal(alta.body.usuario.alumno_id, null);
  });
});
