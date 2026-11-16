'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, describe, test } = require('node:test');
const { crearHerramientas } = require('../agente/herramientas.js');

const PUERTO = 3918;
const BASE = `http://127.0.0.1:${PUERTO}`;
const TOKEN_INGESTA = 'ingesta-token-secreto-fase1-test';
const raiz = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-temario-'));
process.env.DATA_DIR = dir;

let proceso;
let cookie;

async function arrancar() {
  proceso = spawn(process.execPath, ['server.js'], {
    cwd: raiz,
    env: {
      ...process.env,
      DEMO: 'true',
      PORT: String(PUERTO),
      APP_PASSWORD: 'demo',
      SESSION_SECRET: 'x'.repeat(32),
      COOKIE_SECURE: 'false',
      DATA_DIR: dir,
      GEMINI_API_KEY: '',
      APP_URL: 'https://lifeos.example',
      INGESTA_TOKEN: TOKEN_INGESTA,
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch { /* aún arrancando */ }
    await new Promise(ok => setTimeout(ok, 100));
  }
  throw new Error('El servidor no arrancó');
}

async function obtenerTemario(cabeceras = { cookie }) {
  const r = await fetch(`${BASE}/api/clase/temario`, { headers: cabeceras });
  return { status: r.status, cuerpo: await r.json() };
}

async function enviarIngesta(lote, cabeceras = { Authorization: `Bearer ${TOKEN_INGESTA}` }) {
  const r = await fetch(`${BASE}/api/ingesta/clase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(lote),
  });
  return { status: r.status, cuerpo: await r.json() };
}

describe('Fase 1 — El Temario como Dato (/data/temario.json y API de ingesta)', () => {
  before(async () => {
    await arrancar();
    const r = await fetch(`${BASE}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=demo',
    });
    cookie = r.headers.get('set-cookie').split(';')[0];
  });

  after(() => {
    if (proceso) proceso.kill();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  test('CA-1.1: inicializa semilla desde src/clase.mjs cuando temario.json no existe y sirve GET /api/clase/temario', async () => {
    const { CLASE } = await import('../src/clase.mjs');
    const { status, cuerpo } = await obtenerTemario();
    assert.equal(status, 200);
    assert.equal(cuerpo.ok, true);
    assert.equal(cuerpo.data.version, 1);
    assert.ok(Array.isArray(cuerpo.data.modulos));
    assert.deepEqual(
      cuerpo.data.modulos.map(m => m.id),
      CLASE.map(m => m.id),
      'Debe contener los 4 módulos de la semilla (ent, est, poo, ana)',
    );
    assert.equal(typeof cuerpo.data.fuentes, 'object');
    assert.equal(typeof cuerpo.data.mapaIds, 'object');
    assert.ok(Array.isArray(cuerpo.data.novedades));

    const archivoTemario = path.join(dir, 'temario.json');
    assert.ok(fs.existsSync(archivoTemario), 'Debe persistir temario.json en DATA_DIR');
    const enDisco = JSON.parse(fs.readFileSync(archivoTemario, 'utf8'));
    assert.equal(enDisco.modulos.length, 4);
  });

  test('CA-1.2: seguridad en GET /api/clase/temario (401 sin sesión) y POST /api/ingesta/clase (401 sin Bearer o erróneo)', async () => {
    const sinSesion = await obtenerTemario({});
    assert.equal(sinSesion.status, 401);
    assert.equal(sinSesion.cuerpo.ok, false);

    const loteVacio = { origen: 'moodle', completa: false, items: [] };
    const sinToken = await enviarIngesta(loteVacio, {});
    assert.equal(sinToken.status, 401);
    assert.equal(sinToken.cuerpo.ok, false);

    const tokenMalo = await enviarIngesta(loteVacio, { Authorization: 'Bearer token-incorrecto' });
    assert.equal(tokenMalo.status, 401);
    assert.equal(tokenMalo.cuerpo.ok, false);

    const conTokenValido = await enviarIngesta(loteVacio);
    assert.equal(conTokenValido.status, 200);
    assert.equal(conTokenValido.cuerpo.ok, true);
  });

  test('CA-1.3: idempotencia estricta al enviar el mismo lote dos veces a POST /api/ingesta/clase', async () => {
    const lote = {
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2005:cm:99901',
          origen: 'moodle',
          modulo: 'est',
          unidad: 'UD2',
          unidad_titulo: 'Sentencias condicionales',
          n: 'Soluciones de ejercicios UD2',
          tipo: 'PDF',
          url: 'https://educacionadistancia.juntadeandalucia.es/centros/malaga/mod/resource/view.php?id=99901',
          publicado: '2026-11-09T12:00',
          hash: 'a1b2c3d499901',
        },
      ],
      estadoFuente: { ok: true, error: '' },
    };

    const primera = await enviarIngesta(lote);
    assert.equal(primera.status, 200);
    assert.deepEqual(primera.cuerpo.data, { nuevos: 1, cambiados: 0, archivados: 0 });

    const segunda = await enviarIngesta(lote);
    assert.equal(segunda.status, 200);
    assert.deepEqual(segunda.cuerpo.data, { nuevos: 0, cambiados: 0, archivados: 0 });
  });

  test('CA-1.4: preservación de campos manuales (nota, alerta y metadatos de módulo) al vincular y actualizar un item de semilla', async () => {
    const notaEsperada = 'Entrega el .ipynb o un .py. El profesor pide no usar un LLM para hacerla, solo para dudas puntuales.';
    const loteActualizacion = {
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2005:cm:48213',
          origen: 'moodle',
          modulo: 'est',
          unidad: 'UD2',
          unidad_titulo: 'Sentencias condicionales',
          n: 'Proyecto U2: calculadora de precio final',
          tipo: 'Entrega',
          fecha: '2026-11-08T23:59',
          url: 'https://educacionadistancia.juntadeandalucia.es/centros/malaga/mod/assign/view.php?id=48213',
          publicado: '2026-10-20T10:00',
          hash: 'f00baa48213',
        },
      ],
      estadoFuente: { ok: true, error: '' },
    };

    const r = await enviarIngesta(loteActualizacion);
    assert.equal(r.status, 200);
    assert.ok(r.cuerpo.data.cambiados >= 1 || r.cuerpo.data.nuevos >= 1);

    const { cuerpo } = await obtenerTemario();
    const modEst = cuerpo.data.modulos.find(m => m.id === 'est');
    assert.equal(modEst.ahora, 'UD3');
    assert.equal(modEst.color, 'var(--l-compras)');
    assert.equal(modEst.meta, '80 h');
    assert.equal(modEst.corto, 'Estructuras');

    const ud2 = modEst.unidades.find(u => u.k === 'UD2');
    const item = ud2.items.find(i => i.ext_id === 'moodle:2005:cm:48213');
    assert.ok(item, 'El item existente de semilla debe haberse vinculado con ext_id');
    assert.equal(item.fecha, '2026-11-08T23:59');
    assert.equal(item.url, 'https://educacionadistancia.juntadeandalucia.es/centros/malaga/mod/assign/view.php?id=48213');
    assert.equal(item.nota, notaEsperada, 'La nota manual jamás debe sobrescribirse');
    assert.equal(cuerpo.data.mapaIds['est/UD2/Proyecto U2: calculadora de precio final'], 'moodle:2005:cm:48213');
  });

  test('CA-1.5: migración de IDs y renombrado sin pérdida de progreso en hechoItem y marcarClase', async () => {
    const { hechoItem } = await import('../src/clase.mjs');

    // El profesor renombra el item en Moodle manteniendo el mismo ext_id
    const loteRenombrado = {
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2005:cm:48213',
          origen: 'moodle',
          modulo: 'est',
          unidad: 'UD2',
          unidad_titulo: 'Sentencias condicionales',
          n: 'Proyecto U2 (actualizado): calculadora',
          tipo: 'Entrega',
          fecha: '2026-11-08T23:59',
          url: 'https://educacionadistancia.juntadeandalucia.es/centros/malaga/mod/assign/view.php?id=48213',
          publicado: '2026-10-20T10:00',
          hash: 'f00baa48213-v2',
        },
      ],
      estadoFuente: { ok: true, error: '' },
    };

    const r = await enviarIngesta(loteRenombrado);
    assert.equal(r.status, 200);
    assert.equal(r.cuerpo.data.cambiados, 1);

    const { cuerpo } = await obtenerTemario();
    const modEst = cuerpo.data.modulos.find(m => m.id === 'est');
    const ud2 = modEst.unidades.find(u => u.k === 'UD2');
    const item = ud2.items.find(i => i.ext_id === 'moodle:2005:cm:48213');
    assert.equal(item.n, 'Proyecto U2 (actualizado): calculadora');
    assert.equal(item.id_antiguo, 'est/UD2/Proyecto U2: calculadora de precio final');

    // Progreso guardado en Google Sheets con el ID antiguo sigue contando como hecho
    const ctxAntiguo = {
      hecho: { 'est/UD2/Proyecto U2: calculadora de precio final': true },
      tareas: [],
      mapaIds: cuerpo.data.mapaIds,
    };
    assert.equal(hechoItem(ctxAntiguo, modEst, ud2, item), true, 'Debe conservar el hecho con ID antiguo tras renombrado');

    // Progreso guardado con ext_id también cuenta como hecho
    const ctxExtId = {
      hecho: { 'moodle:2005:cm:48213': true },
      tareas: [],
      mapaIds: cuerpo.data.mapaIds,
    };
    assert.equal(hechoItem(ctxExtId, modEst, ud2, item), true, 'Debe reconocer el hecho por ext_id');

    // marcarClase acepta tanto el ID antiguo como el ext_id y el nuevo ID
    const marcados = [];
    const hs = crearHerramientas({
      llamarGoogle: async (fn, args) => {
        if (fn === 'marcarClase') marcados.push(args);
        return true;
      },
      tz: 'Europe/Madrid',
      directorio: dir,
    });
    const usarMarcar = ids => hs.ejecutar(hs.buscar('marcarClase'), { ids, hecho: true });

    await usarMarcar(['est/UD2/Proyecto U2: calculadora de precio final']);
    await usarMarcar(['moodle:2005:cm:48213']);
    await usarMarcar(['est/UD2/Proyecto U2 (actualizado): calculadora']);
    assert.equal(marcados.length, 3);

    await assert.rejects(usarMarcar(['est/UD2/Item totalmente inexistente']), /No existe/);
  });

  test('CA-1.6: archivado sin borrado cuando llega una ingesta con completa: true y desaparece un item con ext_id', async () => {
    // Enviamos ingesta completa del módulo 'est' para origen 'moodle' solo con 48213 (sin 99901)
    const loteCompleto = {
      origen: 'moodle',
      completa: true,
      modulo: 'est',
      items: [
        {
          ext_id: 'moodle:2005:cm:48213',
          origen: 'moodle',
          modulo: 'est',
          unidad: 'UD2',
          unidad_titulo: 'Sentencias condicionales',
          n: 'Proyecto U2 (actualizado): calculadora',
          tipo: 'Entrega',
          fecha: '2026-11-08T23:59',
          url: 'https://educacionadistancia.juntadeandalucia.es/centros/malaga/mod/assign/view.php?id=48213',
          publicado: '2026-10-20T10:00',
          hash: 'f00baa48213-v2',
        },
      ],
      estadoFuente: { ok: true, error: '' },
    };

    const r = await enviarIngesta(loteCompleto);
    assert.equal(r.status, 200);
    assert.equal(r.cuerpo.data.archivados, 1);

    const { cuerpo } = await obtenerTemario();
    const modEst = cuerpo.data.modulos.find(m => m.id === 'est');
    const ud2 = modEst.unidades.find(u => u.k === 'UD2');

    const itemArchivado = ud2.items.find(i => i.ext_id === 'moodle:2005:cm:99901');
    assert.ok(itemArchivado, 'El item desaparecido no debe borrarse de la lista');
    assert.equal(itemArchivado.archivado, true, 'El item desaparecido debe marcarse con archivado: true');

    const itemActivo = ud2.items.find(i => i.ext_id === 'moodle:2005:cm:48213');
    assert.ok(!itemActivo.archivado, 'El item presente en el lote sigue activo');

    const itemSemillaSinExt = ud2.items.find(i => i.n === 'U2-01 Introducción a Tkinter (I)');
    assert.ok(itemSemillaSinExt && !itemSemillaSinExt.archivado, 'Los items de semilla sin ext_id no se archivan');

    // Repetir el mismo lote completo no vuelve a contar archivados
    const r2 = await enviarIngesta(loteCompleto);
    assert.deepEqual(r2.cuerpo.data, { nuevos: 0, cambiados: 0, archivados: 0 });
  });
});
