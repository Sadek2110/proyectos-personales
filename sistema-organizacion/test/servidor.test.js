'use strict';
// Arranca el servidor real en modo demo, sin Google ni Gemini.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, describe, test } = require('node:test');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const PUERTO = 3917;
const BASE = `http://127.0.0.1:${PUERTO}`;
const raiz = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-srv-'));
let proceso;
let cookie;

async function arrancar() {
  proceso = spawn(process.execPath, ['server.js'], {
    cwd: raiz,
    env: { ...process.env, DEMO: 'true', PORT: String(PUERTO), APP_PASSWORD: 'demo', SESSION_SECRET: 'x'.repeat(32), COOKIE_SECURE: 'false', DATA_DIR: dir, GEMINI_API_KEY: '', APP_URL: 'https://lifeos.example' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* aún arrancando */ }
    await new Promise(ok => setTimeout(ok, 100));
  }
  throw new Error('El servidor no arrancó');
}

async function agente(fn, args = []) {
  const r = await fetch(`${BASE}/api/agente/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ args }),
  });
  return { status: r.status, cuerpo: await r.json() };
}

const mcpPost = (cabeceras = {}) => fetch(`${BASE}/mcp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...cabeceras },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});

async function herramientaMcp(name, args) {
  const { token } = (await agente('mcp')).cuerpo.data;
  const cliente = new Client({ name: 'prueba', version: '1.0.0' });
  await cliente.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  try {
    return (await cliente.callTool({ name, arguments: args })).content[0].text;
  } finally {
    await cliente.close();
  }
}

describe('servidor', () => {
  before(async () => {
    await arrancar();
    const r = await fetch(`${BASE}/login`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=demo' });
    cookie = r.headers.get('set-cookie').split(';')[0];
  });
  after(() => {
    proceso.kill();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  test('el agente exige sesión', async () => {
    const r = await fetch(`${BASE}/api/agente/estado`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 401);
  });

  test('una función desconocida da 404 y no alcanza propiedades heredadas', async () => {
    assert.equal((await agente('noExiste')).status, 404);
    assert.equal((await agente('constructor')).status, 404);
  });

  test('el estado no expone el token MCP ni la clave privada', async () => {
    const { cuerpo } = await agente('estado');
    assert.equal(cuerpo.ok, true);
    const { token } = (await agente('mcp')).cuerpo.data;
    const texto = JSON.stringify(cuerpo);
    assert.ok(!texto.includes(token));
    assert.ok(!texto.includes('privateKey'));
    assert.ok(cuerpo.data.clavePublica);
  });

  test('flujo de chat: crea directo, y el borrado espera a la confirmación', async () => {
    const creada = (await agente('chat', ['crea una tarea'])).cuerpo.data;
    assert.deepEqual(creada.cambios, ['datos']);

    const pedido = (await agente('chat', ['borra la tarea'])).cuerpo.data;
    assert.deepEqual(pedido.cambios, []);
    assert.equal(pedido.estado.pendientes.length, 1);
    assert.match(pedido.estado.pendientes[0].descripcion, /Contratar internet/);

    const hecho = (await agente('confirmar', [pedido.estado.pendientes[0].id, true])).cuerpo.data;
    assert.deepEqual(hecho.cambios, ['datos']);
    assert.equal(hecho.estado.pendientes.length, 0);
  });

  test('pedir otra vez el borrado de algo ya borrado no genera confirmación', async () => {
    await agente('chat', ['borra la tarea']); // en demo siempre es t3, borrada en el test anterior
    assert.equal((await agente('estado')).cuerpo.data.pendientes.length, 0);
  });

  test('confirmar con un valor que no es true no borra', async () => {
    const almacenado = path.join(dir, 'agente.json');
    proceso.kill();
    await new Promise(ok => proceso.once('exit', ok));
    const estado = JSON.parse(fs.readFileSync(almacenado, 'utf8'));
    estado.pendientes.push({ id: 'pend-1', herramienta: 'borrarProducto', args: { id: 'a1' }, descripcion: 'Borrar de Compras: «Leche»', fecha: new Date().toISOString() });
    fs.writeFileSync(almacenado, JSON.stringify(estado));
    await arrancar();
    const r = (await agente('confirmar', ['pend-1', 'true'])).cuerpo.data;
    assert.deepEqual(r.cambios, []);
    assert.match(r.estado.chat.at(-1).texto, /Cancelado/);
    const { compras } = JSON.parse(await herramientaMcp('obtenerDatos', {}));
    assert.ok(compras.some(p => p.id === 'a1'), 'Leche sigue en la lista');
  });

  test('los ajustes descartan valores no válidos', async () => {
    const ajustes = (await agente('prefs', [{ horaResumen: 'nope', minutosEvento: 9999, eventos: false, inventado: 1 }])).cuerpo.data.prefs;
    assert.equal(ajustes.eventos, false);
    assert.equal(ajustes.horaResumen, '08:00');
    assert.equal(ajustes.minutosEvento, 15);
    assert.ok(!('inventado' in ajustes));
  });

  test('el micrófono está permitido solo para la propia web y la cámara sigue bloqueada', async () => {
    const politica = (await fetch(`${BASE}/healthz`)).headers.get('permissions-policy');
    assert.match(politica, /microphone=\(self\)/);
    assert.match(politica, /camera=\(\)/);
  });

  test('el audio exige sesión, admite 2 min de voz y el resto de funciones mantiene su límite', async () => {
    const sinSesion = await fetch(`${BASE}/api/agente/transcribir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(sinSesion.status, 401);
    const dosMinutos = 'A'.repeat(640 * 1024);
    const r = await agente('transcribir', [dosMinutos, 'audio/webm']);
    assert.equal(r.status, 200);
    assert.ok(r.cuerpo.data.texto);
    const grande = await agente('chat', ['x'.repeat(200 * 1024)]).catch(() => null);
    assert.notEqual(grande?.status, 200);
  });

  test('limpiar vacía la conversación y las confirmaciones', async () => {
    await agente('chat', ['hola']);
    const { data } = (await agente('vaciar')).cuerpo;
    assert.deepEqual([data.chat.length, data.pendientes.length], [0, 0]);
  });

  test('los iconos nuevos son públicos', async () => {
    for (const f of ['badge.png', 'icon-maskable-512.png']) {
      // Sin sesión, lo privado redirige al login. Un 404 aquí solo significaría que dist/ no está compilado.
      assert.notEqual((await fetch(`${BASE}/${f}`, { redirect: 'manual' })).status, 303, f);
    }
  });

  test('una suscripción no válida se rechaza', async () => {
    assert.equal((await agente('suscribir', [{ endpoint: 'http://inseguro.example', keys: { p256dh: 'a', auth: 'b' } }])).status, 424);
    assert.equal((await agente('suscribir', [{ endpoint: 'https://ok.example' }])).status, 424);
  });

  test('/mcp rechaza sin token, con token malo y con otro origen', async () => {
    const { token } = (await agente('mcp')).cuerpo.data;
    assert.equal((await mcpPost()).status, 401);
    assert.equal((await mcpPost({ Authorization: 'Bearer malo' })).status, 401);
    assert.equal((await mcpPost({ Authorization: `Bearer ${token}`, Origin: 'https://malicioso.example' })).status, 403);
    assert.equal((await fetch(`${BASE}/mcp`, { headers: { Authorization: `Bearer ${token}` } })).status, 405);
  });

  test('un cliente MCP real lista y usa las herramientas', async () => {
    const { token } = (await agente('mcp')).cuerpo.data;
    const cliente = new Client({ name: 'prueba', version: '1.0.0' });
    await cliente.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    try {
      const { tools } = await cliente.listTools();
      const nombres = tools.map(t => t.name);
      assert.ok(nombres.includes('obtenerDatos') && nombres.includes('borrarTarea'));
      assert.equal(tools.find(t => t.name === 'borrarTarea').annotations.destructiveHint, true);
      assert.equal(tools.find(t => t.name === 'obtenerDatos').annotations.readOnlyHint, true);

      const lectura = await cliente.callTool({ name: 'obtenerDatos', arguments: {} });
      const datos = JSON.parse(lectura.content[0].text);
      assert.ok(datos.compras.length > 0);
      assert.ok(!('lat' in datos.compras[0]));

      const error = await cliente.callTool({ name: 'guardarTarea', arguments: { id: 'inventado', titulo: 'X' } });
      assert.equal(error.isError, true);
    } finally {
      await cliente.close();
    }
  });

  test('las claves sobreviven a un reinicio', async () => {
    const antes = (await agente('mcp')).cuerpo.data.token;
    const publica = (await agente('estado')).cuerpo.data.clavePublica;
    proceso.kill();
    await new Promise(ok => proceso.once('exit', ok));
    await arrancar();
    assert.equal((await agente('mcp')).cuerpo.data.token, antes);
    assert.equal((await agente('estado')).cuerpo.data.clavePublica, publica);
  });
});
