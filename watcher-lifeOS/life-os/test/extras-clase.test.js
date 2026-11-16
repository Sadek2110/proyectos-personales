'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, test } = require('node:test');

const { crearHerramientas } = require('../agente/herramientas.js');
const { crearAlmacenTemario } = require('../agente/temario.js');

describe('Fase 8 — Extras de Clase (Novedades, Calificaciones, Herramientas MCP y Resúmenes IA)', () => {
  let dirTmp;

  beforeEach(() => {
    dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-fase8-'));
  });

  afterEach(() => {
    if (dirTmp && fs.existsSync(dirTmp)) {
      fs.rmSync(dirTmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  test('CA-8.1a: calcularMediaModulo calcula la media sobre 10 con { nota, max } y { graderaw, grademax } y devuelve null sin notas válidas', async () => {
    const { calcularMediaModulo } = await import('../src/clase.mjs');

    assert.equal(typeof calcularMediaModulo, 'function');

    // { nota: 8, max: 10 } -> 8/10 = 8.0; { graderaw: 4.5, grademax: 5 } -> 4.5/5 * 10 = 9.0 -> media = 8.5
    const moduloConNotas = {
      id: 'poo',
      calificaciones: [
        { ext_id: 'g1', nombre: 'Práctica 1', nota: 8, max: 10 },
        { ext_id: 'g2', itemname: 'Cuestionario T1', graderaw: 4.5, grademax: 5 },
        { ext_id: 'g3', nombre: 'Sin calificar aún', nota: null, max: 10 },
      ],
    };

    assert.equal(calcularMediaModulo(moduloConNotas), 8.5);

    // Módulo sin calificaciones o con calificaciones vacías / no numéricas devuelve null
    assert.equal(calcularMediaModulo({ id: 'ana', calificaciones: [] }), null);
    assert.equal(
      calcularMediaModulo({
        id: 'est',
        calificaciones: [{ nombre: 'Pendiente', nota: null, graderaw: undefined }],
      }),
      null
    );
    assert.equal(calcularMediaModulo(null), null);
  });

  test('CA-8.1b: novedadesRecientes filtra dentro de los últimos N días y ordena de más reciente a más antigua', async () => {
    const { novedadesRecientes } = await import('../src/clase.mjs');

    assert.equal(typeof novedadesRecientes, 'function');

    const ahoraRef = new Date('2026-11-15T18:00:00Z');
    const listaNovedades = [
      { ext_id: 'n1', modulo: 'poo', n: 'Tema antiguo hace 12 días', evento: 'nuevo', fecha: '2026-11-03T10:00:00' },
      { ext_id: 'n2', modulo: 'est', n: 'Tema hace 5 días', evento: 'nuevo', fecha: '2026-11-10T09:00:00' },
      { ext_id: 'n3', modulo: 'poo', n: 'Nota publicada hoy', evento: 'nota', fecha: '2026-11-15T12:30:00' },
      { ext_id: 'n4', modulo: 'ent', n: 'Cambio de fecha hace 2 días', evento: 'cambio_fecha', fecha: '2026-11-13T16:00:00' },
    ];

    const ultimos7 = novedadesRecientes(listaNovedades, 7, ahoraRef);
    assert.deepEqual(
      ultimos7.map(n => n.ext_id),
      ['n3', 'n4', 'n2'],
      'Debe incluir solo los últimos 7 días ordenados de más reciente a más antigua'
    );

    const ultimos3 = novedadesRecientes(listaNovedades, 3, ahoraRef);
    assert.deepEqual(ultimos3.map(n => n.ext_id), ['n3', 'n4']);
  });

  test('CA-8.1c: novedadesNoVistas filtra novedades no vistas según marca temporal', async () => {
    const { novedadesNoVistas } = await import('../src/clase.mjs');
    assert.equal(typeof novedadesNoVistas, 'function');

    const ahoraRef = new Date('2026-11-15T18:00:00Z');
    const lista = [
      { ext_id: 'n1', fecha: '2026-11-10T09:00:00' },
      { ext_id: 'n2', fecha: '2026-11-13T16:00:00' },
      { ext_id: 'n3', fecha: '2026-11-15T12:30:00' },
    ];

    // Sin marca de vista, devuelve todas las recientes dentro de la ventana de 7 días
    assert.deepEqual(novedadesNoVistas(lista, null, 7, ahoraRef).map(n => n.ext_id), ['n3', 'n2', 'n1']);

    // Con marca intermedia
    assert.deepEqual(novedadesNoVistas(lista, '2026-11-13T16:00:00', 7, ahoraRef).map(n => n.ext_id), ['n3']);

    // Con marca posterior a todas
    assert.deepEqual(novedadesNoVistas(lista, '2026-11-16T00:00:00', 7, ahoraRef).map(n => n.ext_id), []);
  });

  test('CA-8.3b: Clase.jsx incluye sub-pestañas Temario, Novedades y Próximas fechas, e insignia en App.jsx', () => {
    const raiz = path.join(__dirname, '..');
    const codigoClase = fs.readFileSync(path.join(raiz, 'src', 'vistas', 'Clase.jsx'), 'utf8');
    const codigoApp = fs.readFileSync(path.join(raiz, 'src', 'App.jsx'), 'utf8');

    assert.ok(codigoClase.includes('cl-subvistas-bar'), 'Clase.jsx debe tener la barra de sub-pestañas');
    assert.ok(codigoClase.includes('subvista === \'novedades\''), 'Clase.jsx debe tener la subvista de novedades');
    assert.ok(codigoClase.includes('subvista === \'fechas\''), 'Clase.jsx debe tener la subvista de fechas');
    assert.ok(codigoClase.includes('cl-novedades-estado'), 'Clase.jsx debe mostrar la tarjeta de estado de revisión');
    assert.ok(codigoApp.includes('novedadesNoVistas'), 'App.jsx debe calcular novedades no vistas para la insignia');
  });

  test('CA-8.2a: herramienta obtenerNovedadesClase devuelve novedades recientes y filtra por módulo y días', async () => {
    const almacen = crearAlmacenTemario(dirTmp);

    almacen.ingestar({
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2475:cm:801',
          modulo: 'poo',
          unidad: 'T1',
          n: 'Apuntes nuevos de Polimorfismo',
          tipo: 'PDF',
        },
        {
          ext_id: 'moodle:2005:cm:802',
          modulo: 'est',
          unidad: 'UD3',
          n: 'Ejercicios de bucles anidados',
          tipo: 'Notebook',
        },
      ],
    });

    const hs = crearHerramientas({
      llamarGoogle: async () => ({ compras: [], tareas: [] }),
      tz: 'Europe/Madrid',
      ahora: () => new Date(),
      almacenTemario: almacen,
      directorio: dirTmp,
    });

    const hNov = hs.buscar('obtenerNovedadesClase');
    assert.ok(hNov, 'La herramienta obtenerNovedadesClase debe estar registrada');
    assert.equal(hNov.tipo, 'lectura');

    const todas = await hs.ejecutar(hNov, { dias: 7 });
    assert.equal(todas.dias, 7);
    assert.equal(todas.total, 2);
    assert.equal(todas.novedades.length, 2);

    // Filtrado por ID en minúsculas ('poo') y por nombre corto en mayúsculas ('POO')
    const soloPooMinus = await hs.ejecutar(hNov, { dias: 7, modulo: 'poo' });
    assert.equal(soloPooMinus.total, 1);
    assert.equal(soloPooMinus.novedades[0].modulo, 'poo');
    assert.equal(soloPooMinus.novedades[0].n, 'Apuntes nuevos de Polimorfismo');

    const soloPooMayus = await hs.ejecutar(hNov, { dias: 7, modulo: 'POO' });
    assert.equal(soloPooMayus.total, 1);
    assert.equal(soloPooMayus.novedades[0].modulo, 'poo');
  });

  test('CA-8.2b: herramienta obtenerCalificacionesClase devuelve calificaciones, media sobre 10 y entregas/pruebas pendientes', async () => {
    const almacen = crearAlmacenTemario(dirTmp);

    almacen.ingestar({
      origen: 'moodle',
      completa: false,
      calificaciones: [
        {
          ext_id: 'moodle:poo:grade:1',
          modulo: 'poo',
          nombre: 'Tarea 1: Almacén',
          nota: 9,
          max: 10,
          comentario: 'Muy buen diseño de clases',
        },
        {
          ext_id: 'moodle:poo:grade:2',
          modulo: 'poo',
          itemname: 'Test rápido T1',
          graderaw: 4,
          grademax: 5,
        },
      ],
    });

    const hs = crearHerramientas({
      llamarGoogle: async fn => {
        if (fn === 'obtenerClase') return {};
        if (fn === 'obtenerDatos') return { compras: [], tareas: [] };
        return [];
      },
      tz: 'Europe/Madrid',
      ahora: () => new Date('2026-11-15T12:00:00Z'),
      almacenTemario: almacen,
      directorio: dirTmp,
    });

    const hCal = hs.buscar('obtenerCalificacionesClase');
    assert.ok(hCal, 'La herramienta obtenerCalificacionesClase debe estar registrada');
    assert.equal(hCal.tipo, 'lectura');

    const resPoo = await hs.ejecutar(hCal, { modulo: 'POO' });
    assert.ok(Array.isArray(resPoo.modulos));
    assert.equal(resPoo.modulos.length, 1);

    const modPoo = resPoo.modulos[0];
    assert.equal(modPoo.id, 'poo');
    assert.equal(modPoo.corto, 'POO');
    assert.equal(modPoo.calificaciones.length, 2);
    // Media entre 9/10 (9.0) y 4/5 (8.0) = 8.5
    assert.equal(modPoo.media, 8.5);
    assert.ok(Array.isArray(modPoo.pendientes));
    assert.ok(
      modPoo.pendientes.some(p => p.nombre.includes('Tarea')),
      'Debe incluir las entregas pendientes del módulo POO'
    );
  });

  test('CA-8.4: almacenTemario.ingestar persiste resumen_ia y apunte_url en los ítems y soporta calificaciones con { nota, max, nombre } y { graderaw, grademax, itemname }', () => {
    const almacen = crearAlmacenTemario(dirTmp);

    const resIngesta = almacen.ingestar({
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2475:cm:910',
          modulo: 'poo',
          unidad: 'T1',
          n: 'Guía de Herencia y Polimorfismo',
          tipo: 'PDF',
          url: 'https://moodle.local/mod/resource/view.php?id=910',
          resumen_ia: '- **Herencia**: reutilización y especialización de clases.\n- **Polimorfismo**: redefinición de métodos.',
          apunte_url: 'https://drive.google.com/file/d/abc123apunte/view',
        },
      ],
      calificaciones: [
        {
          ext_id: 'moodle:poo:grade:91',
          modulo: 'poo',
          nombre: 'Práctica Herencia',
          nota: 9.2,
          max: 10,
          comentario: 'Excelente uso de super()',
        },
        {
          ext_id: 'moodle:poo:grade:92',
          modulo: 'poo',
          itemname: 'Cuestionario Polimorfismo',
          graderaw: 4.5,
          grademax: 5,
        },
      ],
    });

    assert.equal(resIngesta.nuevos, 3);

    const temario = almacen.obtener();
    const modPoo = temario.modulos.find(m => m.id === 'poo');
    const unidadT1 = modPoo.unidades.find(u => u.k === 'T1');
    const item = unidadT1.items.find(i => i.ext_id === 'moodle:2475:cm:910');

    assert.ok(item, 'El ítem nuevo debe haberse guardado en POO/T1');
    assert.equal(
      item.resumen_ia,
      '- **Herencia**: reutilización y especialización de clases.\n- **Polimorfismo**: redefinición de métodos.'
    );
    assert.equal(item.apunte_url, 'https://drive.google.com/file/d/abc123apunte/view');

    assert.ok(Array.isArray(modPoo.calificaciones));
    assert.equal(modPoo.calificaciones.length, 2);

    const cal1 = modPoo.calificaciones.find(c => c.ext_id === 'moodle:poo:grade:91');
    const cal2 = modPoo.calificaciones.find(c => c.ext_id === 'moodle:poo:grade:92');
    assert.ok(cal1, 'Debe persistir calificación con formato { nota, max, nombre }');
    assert.equal(cal1.nota ?? cal1.graderaw, 9.2);
    assert.ok(cal2, 'Debe persistir calificación con formato { graderaw, grademax, itemname }');
    assert.equal(cal2.graderaw ?? cal2.nota, 4.5);
  });

  test('CA-8.3: POST /api/clase/refrescar exige sesión válida, llama al watcher con Bearer INGESTA_TOKEN y Clase.jsx incluye Novedades, calificaciones y Actualizar ahora', async () => {
    const tokenTest = 'token-refrescar-fase8';
    let cabecerasWatcher = null;
    let rutaWatcher = null;

    const watcherMock = http.createServer((req, res) => {
      rutaWatcher = req.url;
      cabecerasWatcher = req.headers;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ejecutado: true }));
    });

    await new Promise(resolve => watcherMock.listen(0, '127.0.0.1', resolve));
    const puertoWatcher = watcherMock.address().port;
    const puertoLifeOs = 3988;
    const baseLifeOs = `http://127.0.0.1:${puertoLifeOs}`;
    const raiz = path.join(__dirname, '..');

    const proc = spawn(process.execPath, ['server.js'], {
      cwd: raiz,
      env: {
        ...process.env,
        DEMO: 'true',
        PORT: String(puertoLifeOs),
        APP_PASSWORD: 'demo',
        SESSION_SECRET: 'y'.repeat(32),
        COOKIE_SECURE: 'false',
        DATA_DIR: dirTmp,
        GEMINI_API_KEY: '',
        APP_URL: 'https://lifeos.example',
        INGESTA_TOKEN: tokenTest,
        WATCHER_URL: `http://127.0.0.1:${puertoWatcher}`,
      },
      stdio: 'ignore',
    });

    try {
      for (let i = 0; i < 50; i++) {
        try {
          if ((await fetch(`${baseLifeOs}/healthz`)).ok) break;
        } catch { /* arrancando */ }
        await new Promise(ok => setTimeout(ok, 100));
      }

      // 1. Sin sesión debe responder 401
      const resSinSesion = await fetch(`${baseLifeOs}/api/clase/refrescar`, { method: 'POST' });
      assert.equal(resSinSesion.status, 401);

      // 2. Con sesión válida dispara POST /ejecutar en el watcher con Bearer INGESTA_TOKEN
      const login = await fetch(`${baseLifeOs}/login`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'password=demo',
      });
      const cookie = login.headers.get('set-cookie').split(';')[0];

      const resConSesion = await fetch(`${baseLifeOs}/api/clase/refrescar`, {
        method: 'POST',
        headers: { cookie },
      });
      assert.equal(resConSesion.status, 200);
      const cuerpo = await resConSesion.json();
      assert.equal(cuerpo.ok, true);
      assert.equal(cuerpo.data.disparado, true);
      assert.deepEqual(cuerpo.data.watcher, { ok: true, ejecutado: true });
      assert.ok(Array.isArray(cuerpo.data.temario.modulos));
      assert.equal(rutaWatcher, '/ejecutar');
      assert.equal(cabecerasWatcher.authorization, `Bearer ${tokenTest}`);

      // 3. Verificación de elementos en Clase.jsx
      const codigoClase = fs.readFileSync(path.join(raiz, 'src', 'vistas', 'Clase.jsx'), 'utf8');
      assert.ok(codigoClase.includes('Novedades (últimos 7 días)'), 'Clase.jsx debe mostrar la sección Novedades (últimos 7 días)');
      assert.ok(codigoClase.includes('calcularMediaModulo'), 'Clase.jsx debe calcular y mostrar la nota media del módulo');
      assert.ok(codigoClase.includes('Actualizar ahora'), 'Clase.jsx debe incluir el botón Actualizar ahora');
    } finally {
      proc.kill();
      await new Promise(resolve => watcherMock.close(resolve));
    }
  });
});
