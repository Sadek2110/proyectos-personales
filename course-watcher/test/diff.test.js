'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  calcularHashItem,
  normalizarCursoMoodle,
} = require('../src/normalizador.js');

const {
  calcularDiffLote,
  crearAlmacenEstadoWatcher,
} = require('../src/diff.js');

const {
  crearClienteLifeOs,
} = require('../src/cliente-lifeos.js');

const {
  ejecutarPasadaFuente,
} = require('../src/orquestador.js');

const {
  crearAlmacenTemario,
} = require('../../life-os/agente/temario.js');

const RUTA_FIXTURES_MOODLE = path.join(__dirname, 'fixtures', 'moodle');

function leerFixtureMoodle(nombre) {
  return JSON.parse(fs.readFileSync(path.join(RUTA_FIXTURES_MOODLE, nombre), 'utf8'));
}

function construirItemPrueba({ ext_id, n, tipo, fecha, url, drive_url }) {
  const item = {
    ext_id,
    origen: 'moodle',
    n,
    tipo,
    url: url || '',
    archivos: [],
    hash: calcularHashItem({ n, tipo, fecha, url }),
  };
  if (fecha) item.fecha = fecha;
  if (drive_url) item.drive_url = drive_url;
  return item;
}

function construirLoteA() {
  const item1 = construirItemPrueba({
    ext_id: 'moodle:2005:cm:346001',
    n: 'Apuntes: algoritmos y programación',
    tipo: 'PDF',
    url: 'https://moodle.local/mod/resource/view.php?id=346001',
  });
  const item2 = construirItemPrueba({
    ext_id: 'moodle:2005:cm:346002',
    n: 'U1-01 Elementos de un programa informático',
    tipo: 'Notebook',
    url: 'https://moodle.local/mod/resource/view.php?id=346002',
  });
  const item3 = construirItemPrueba({
    ext_id: 'moodle:2005:cm:347772',
    n: 'Proyecto U2: calculadora de precio final',
    tipo: 'Entrega',
    fecha: '2026-11-06T23:59',
    url: 'https://moodle.local/mod/assign/view.php?id=347772',
  });

  return {
    fuente: 'moodle',
    completa: true,
    modulos: [
      {
        id: 'est',
        nombre: 'Estructuras de control en Python',
        unidades: [
          {
            k: 'UD1',
            t: 'Introducción a las estructuras de control',
            items: [item1, item2],
          },
          {
            k: 'UD2',
            t: 'Sentencias condicionales',
            items: [item3],
          },
        ],
        calificaciones: [
          {
            ext_id: 'moodle:2005:grade:7001',
            id: 7001,
            cmid: 346010,
            itemname: 'Prueba UT1 (alumnado nuevo)',
            graderaw: 9.5,
          },
        ],
      },
    ],
  };
}

function construirLoteB() {
  const item1 = construirItemPrueba({
    ext_id: 'moodle:2005:cm:346001',
    n: 'Apuntes: algoritmos y programación',
    tipo: 'PDF',
    url: 'https://moodle.local/mod/resource/view.php?id=346001',
  });
  // item2 (moodle:2005:cm:346002) desaparece en el lote B -> archivado
  // item3 cambia su fecha de entrega de 2026-11-06T23:59 a 2026-11-08T23:59
  const item3Modificado = construirItemPrueba({
    ext_id: 'moodle:2005:cm:347772',
    n: 'Proyecto U2: calculadora de precio final',
    tipo: 'Entrega',
    fecha: '2026-11-08T23:59',
    url: 'https://moodle.local/mod/assign/view.php?id=347772',
  });
  // item4 se añade como nuevo en UD2
  const item4Nuevo = construirItemPrueba({
    ext_id: 'moodle:2005:cm:347999',
    n: 'U2-08 Ejercicios adicionales de condicionales',
    tipo: 'Notebook',
    url: 'https://moodle.local/mod/resource/view.php?id=347999',
  });

  return {
    fuente: 'moodle',
    completa: true,
    modulos: [
      {
        id: 'est',
        nombre: 'Estructuras de control en Python',
        unidades: [
          {
            k: 'UD1',
            t: 'Introducción a las estructuras de control',
            items: [item1],
          },
          {
            k: 'UD2',
            t: 'Sentencias condicionales',
            items: [item3Modificado, item4Nuevo],
          },
        ],
        calificaciones: [
          {
            ext_id: 'moodle:2005:grade:7001',
            id: 7001,
            cmid: 346010,
            itemname: 'Prueba UT1 (alumnado nuevo)',
            graderaw: 9.5,
          },
          {
            ext_id: 'moodle:2005:grade:7002',
            id: 7002,
            cmid: 347772,
            itemname: 'Proyecto U2: calculadora de precio final',
            graderaw: 10,
          },
        ],
      },
    ],
  };
}

function aplanarModulosParaTemarioLifeOs(cuerpo) {
  if (Array.isArray(cuerpo.items) && cuerpo.items.length > 0) {
    return cuerpo;
  }
  const items = [];
  for (const mod of cuerpo.modulos || []) {
    const mapaGradesPorCmid = new Map();
    for (const cal of mod.calificaciones || []) {
      if (cal && cal.cmid !== undefined && cal.graderaw !== undefined && cal.graderaw !== null) {
        mapaGradesPorCmid.set(Number(cal.cmid), cal.graderaw);
      }
    }
    for (const u of mod.unidades || []) {
      for (const it of u.items || []) {
        const cmidMatch = String(it.ext_id || '').match(/:cm:(\d+)$/);
        const cmid = cmidMatch ? Number(cmidMatch[1]) : null;
        const itemPlano = {
          ...it,
          origen: it.origen || cuerpo.fuente || cuerpo.origen || 'moodle',
          modulo: mod.id,
          unidad: u.k,
          unidad_titulo: u.t,
        };
        if (cmid !== null && mapaGradesPorCmid.has(cmid)) {
          itemPlano.calificacion = mapaGradesPorCmid.get(cmid);
        }
        items.push(itemPlano);
      }
    }
  }
  return {
    ...cuerpo,
    origen: cuerpo.origen || cuerpo.fuente || 'moodle',
    completa: Boolean(cuerpo.completa),
    items,
  };
}

describe('Fase 3 — Motor de Diff, Estado Persistente y Envío a Life OS', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-fase3-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('CA-3.1: Transición Estado A -> Estado B detecta nuevos, cambiados (con cambioFecha y fechaAnterior), archivados y notasNuevas', () => {
    const loteA = construirLoteA();

    // 1.ª pasada desde estado vacío {}
    const diffA = calcularDiffLote({}, loteA);
    assert.equal(diffA.hayCambios, true);
    assert.deepEqual(diffA.resumen, {
      nuevos: 3,
      cambiados: 0,
      archivados: 0,
      notasNuevas: 1,
    });
    assert.equal(diffA.detalle.nuevos.length, 3);
    assert.equal(diffA.detalle.cambiados.length, 0);
    assert.equal(diffA.detalle.archivados.length, 0);
    assert.equal(diffA.detalle.notasNuevas.length, 1);
    assert.equal(diffA.detalle.notasNuevas[0].ext_id, 'moodle:2005:grade:7001');

    // 2.ª pasada: transición Estado A -> Estado B (1 nuevo, 1 cambio de fecha, 1 archivado, 1 nota nueva)
    const loteB = construirLoteB();
    const diffB = calcularDiffLote(diffA.nuevoEstadoFuente, loteB);

    assert.equal(diffB.hayCambios, true);
    assert.deepEqual(diffB.resumen, {
      nuevos: 1,
      cambiados: 1,
      archivados: 1,
      notasNuevas: 1,
    });

    // Verificar detalle de nuevo
    assert.equal(diffB.detalle.nuevos.length, 1);
    assert.equal(diffB.detalle.nuevos[0].ext_id, 'moodle:2005:cm:347999');
    assert.equal(diffB.detalle.nuevos[0].modulo, 'est');
    assert.equal(diffB.detalle.nuevos[0].unidad, 'UD2');

    // Verificar detalle de cambiado con cambioFecha y fechaAnterior
    assert.equal(diffB.detalle.cambiados.length, 1);
    const cambiado = diffB.detalle.cambiados[0];
    assert.equal(cambiado.ext_id, 'moodle:2005:cm:347772');
    assert.equal(cambiado.cambioFecha, true);
    assert.equal(cambiado.fechaAnterior, '2026-11-06T23:59');
    assert.equal(cambiado.fecha, '2026-11-08T23:59');

    // Verificar detalle de archivado y conservación con archivado: true en nuevoEstadoFuente
    assert.equal(diffB.detalle.archivados.length, 1);
    assert.equal(diffB.detalle.archivados[0].ext_id, 'moodle:2005:cm:346002');
    assert.equal(
      diffB.nuevoEstadoFuente.itemsPorExtId['moodle:2005:cm:346002']?.archivado,
      true,
      'El ítem desaparecido debe conservarse con archivado: true en nuevoEstadoFuente'
    );

    // Verificar detalle de nota nueva
    assert.equal(diffB.detalle.notasNuevas.length, 1);
    assert.equal(diffB.detalle.notasNuevas[0].ext_id, 'moodle:2005:grade:7002');
    assert.equal(diffB.detalle.notasNuevas[0].graderaw, 10);
  });

  it('CA-3.2: Idempotencia en segunda pasada (calcularDiffLote y ejecutarPasadaFuente producen 0 cambios y 0 llamadas HTTP en la 2.ª pasada)', async () => {
    const loteB = construirLoteB();
    const diff1 = calcularDiffLote({}, loteB);
    assert.equal(diff1.hayCambios, true);

    // Segunda llamada a calcularDiffLote con el mismo loteB sobre el estado resultante
    const diff2 = calcularDiffLote(diff1.nuevoEstadoFuente, loteB);
    assert.equal(diff2.hayCambios, false);
    assert.deepEqual(diff2.resumen, {
      nuevos: 0,
      cambiados: 0,
      archivados: 0,
      notasNuevas: 0,
    });

    // Verificación con ejecutarPasadaFuente y clienteLifeOs
    const archivoEstado = path.join(tmpDir, 'watcher-estado.json');
    const almacenEstado = crearAlmacenEstadoWatcher({
      archivo: archivoEstado,
      ahora: () => new Date('2026-11-10T10:00:00Z'),
    });

    const llamadasHttp = [];
    const fetchSimulado = async (url, opts = {}) => {
      llamadasHttp.push({
        url: String(url),
        method: opts.method,
        headers: opts.headers,
        body: opts.body ? JSON.parse(opts.body) : null,
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, data: { nuevos: 3, cambiados: 0, archivados: 0 } };
        },
        async text() {
          return JSON.stringify({ ok: true });
        },
      };
    };

    const clienteLifeOs = crearClienteLifeOs({
      lifeosUrl: 'http://127.0.0.1:3000',
      ingestaToken: 'token-ingesta-test-32',
      fetchFn: fetchSimulado,
    });

    const fuenteSimulada = {
      async obtenerLote() {
        return structuredClone(loteB);
      },
    };

    // 1.ª pasada: detecta cambios y hace POST /api/ingesta/clase
    const pasada1 = await ejecutarPasadaFuente({
      nombreFuente: 'moodle',
      fuente: fuenteSimulada,
      almacenEstado,
      clienteLifeOs,
    });

    assert.equal(pasada1.ok, true);
    assert.equal(pasada1.hayCambios, true);
    assert.equal(pasada1.enviado, true);
    assert.equal(llamadasHttp.length, 1);
    assert.equal(llamadasHttp[0].url, 'http://127.0.0.1:3000/api/ingesta/clase');
    assert.equal(llamadasHttp[0].method, 'POST');
    assert.equal(
      llamadasHttp[0].headers?.Authorization || llamadasHttp[0].headers?.authorization,
      'Bearer token-ingesta-test-32'
    );

    // 2.ª pasada seguida con el mismo lote: 0 cambios y 0 peticiones HTTP a Life OS
    llamadasHttp.length = 0;
    const pasada2 = await ejecutarPasadaFuente({
      nombreFuente: 'moodle',
      fuente: fuenteSimulada,
      almacenEstado,
      clienteLifeOs,
    });

    assert.equal(pasada2.ok, true);
    assert.equal(pasada2.hayCambios, false);
    assert.equal(pasada2.enviado, false);
    assert.deepEqual(pasada2.resumen, {
      nuevos: 0,
      cambiados: 0,
      archivados: 0,
      notasNuevas: 0,
    });
    assert.equal(llamadasHttp.length, 0, 'No debe realizar ninguna petición HTTP en la segunda pasada sin cambios');
  });

  it('CA-3.3: Modo Simulacro (simulacro: true) devuelve resumen y detalle completos sin invocar fetchFn ni persistir los ítems nuevos', async () => {
    const loteA = construirLoteA();
    const archivoEstado = path.join(tmpDir, 'watcher-estado-simulacro.json');
    const almacenEstado = crearAlmacenEstadoWatcher({
      archivo: archivoEstado,
      ahora: () => new Date('2026-11-10T11:00:00Z'),
    });

    const llamadasHttp = [];
    const fetchSimulado = async url => {
      llamadasHttp.push(String(url));
      throw new Error('fetchFn no debería invocarse en modo simulacro');
    };

    const clienteLifeOs = crearClienteLifeOs({
      lifeosUrl: 'http://127.0.0.1:3000',
      ingestaToken: 'token-simulacro',
      fetchFn: fetchSimulado,
    });

    const fuenteSimulada = {
      async obtenerLote() {
        return structuredClone(loteA);
      },
    };

    const resSimulacro = await ejecutarPasadaFuente({
      nombreFuente: 'moodle',
      fuente: fuenteSimulada,
      almacenEstado,
      clienteLifeOs,
      simulacro: true,
    });

    assert.equal(resSimulacro.ok, true);
    assert.equal(resSimulacro.simulacro, true);
    assert.equal(resSimulacro.enviado, false);
    assert.equal(resSimulacro.hayCambios, true);
    assert.deepEqual(resSimulacro.resumen, {
      nuevos: 3,
      cambiados: 0,
      archivados: 0,
      notasNuevas: 1,
    });
    assert.equal(resSimulacro.detalle.nuevos.length, 3);
    assert.equal(resSimulacro.detalle.notasNuevas.length, 1);

    // No se hizo ninguna llamada HTTP a Life OS
    assert.equal(llamadasHttp.length, 0);

    // El almacén de estado permanece sin los ítems nuevos
    const estadoFuente = almacenEstado.obtenerEstadoFuente('moodle');
    assert.deepEqual(estadoFuente.itemsPorExtId, {});
    if (fs.existsSync(archivoEstado)) {
      const enDisco = JSON.parse(fs.readFileSync(archivoEstado, 'utf8'));
      const itemsEnDisco = enDisco?.fuentes?.moodle?.itemsPorExtId || {};
      assert.deepEqual(itemsEnDisco, {});
    }
  });

  it('CA-3.4: Transaccionalidad ante fallo de envío y contador de fallosSeguidos (alerta al 2.º fallo y recuperación a 0)', async () => {
    const loteA = construirLoteA();
    const archivoEstado = path.join(tmpDir, 'watcher-estado-fallos.json');
    const almacenEstado = crearAlmacenEstadoWatcher({
      archivo: archivoEstado,
      ahora: () => new Date('2026-11-10T12:00:00Z'),
    });

    let simularFalloHttp = true;
    const fetchSimulado = async () => {
      if (simularFalloHttp) {
        return {
          ok: false,
          status: 500,
          async json() {
            return { ok: false, error: 'Error interno simulado HTTP 500' };
          },
          async text() {
            return 'Error interno simulado HTTP 500';
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, data: { nuevos: 3, cambiados: 0, archivados: 0 } };
        },
        async text() {
          return JSON.stringify({ ok: true });
        },
      };
    };

    const clienteLifeOs = crearClienteLifeOs({
      lifeosUrl: 'http://127.0.0.1:3000',
      ingestaToken: 'token-fallos',
      fetchFn: fetchSimulado,
    });

    const fuenteSimulada = {
      async obtenerLote() {
        return structuredClone(loteA);
      },
    };

    async function invocarPasadaCapturando() {
      try {
        return await ejecutarPasadaFuente({
          nombreFuente: 'moodle',
          fuente: fuenteSimulada,
          almacenEstado,
          clienteLifeOs,
        });
      } catch (err) {
        const est = almacenEstado.obtenerEstadoFuente('moodle');
        return {
          ok: false,
          error: err.message,
          fallosSeguidos: err.fallosSeguidos ?? est.fallosSeguidos,
          debeAlertar: err.debeAlertar ?? est.fallosSeguidos >= 2,
        };
      }
    }

    // 1.er intento fallido (HTTP 500) -> fallosSeguidos: 1, debeAlertar: false, itemsPorExtId vacío
    const fallo1 = await invocarPasadaCapturando();
    assert.equal(fallo1.ok, false);
    assert.equal(fallo1.fallosSeguidos, 1);
    assert.equal(fallo1.debeAlertar, false);

    const estadoTrasFallo1 = almacenEstado.obtenerEstadoFuente('moodle');
    assert.deepEqual(
      estadoTrasFallo1.itemsPorExtId,
      {},
      'No debe consolidar itemsPorExtId si el POST a Life OS falla'
    );
    assert.equal(estadoTrasFallo1.fallosSeguidos, 1);
    assert.ok(estadoTrasFallo1.ultimoError, 'Debe registrar el mensaje de ultimoError');

    // 2.º intento fallido consecutivo (HTTP 500) -> fallosSeguidos: 2, debeAlertar: true, itemsPorExtId sigue vacío
    const fallo2 = await invocarPasadaCapturando();
    assert.equal(fallo2.ok, false);
    assert.equal(fallo2.fallosSeguidos, 2);
    assert.equal(fallo2.debeAlertar, true);

    const estadoTrasFallo2 = almacenEstado.obtenerEstadoFuente('moodle');
    assert.deepEqual(estadoTrasFallo2.itemsPorExtId, {});
    assert.equal(estadoTrasFallo2.fallosSeguidos, 2);

    // 3.er intento: Life OS responde 200 OK -> vuelve a detectar los 3 ítems nuevos, los envía y resetea fallosSeguidos a 0
    simularFalloHttp = false;
    const exito3 = await ejecutarPasadaFuente({
      nombreFuente: 'moodle',
      fuente: fuenteSimulada,
      almacenEstado,
      clienteLifeOs,
    });

    assert.equal(exito3.ok, true);
    assert.equal(exito3.enviado, true);
    assert.deepEqual(exito3.resumen, {
      nuevos: 3,
      cambiados: 0,
      archivados: 0,
      notasNuevas: 1,
    });

    const estadoTrasExito = almacenEstado.obtenerEstadoFuente('moodle');
    assert.equal(estadoTrasExito.fallosSeguidos, 0);
    assert.equal(estadoTrasExito.ultimoError, null);
    assert.equal(Object.keys(estadoTrasExito.itemsPorExtId).length, 3);
  });

  it('CA-3.5: Integración End-to-End Watcher -> crearAlmacenTemario de life-os preservando campos manuales e idempotencia', async () => {
    const dirLifeOs = path.join(tmpDir, 'lifeos-data');
    const archivoWatcher = path.join(tmpDir, 'watcher-data', 'watcher-estado.json');

    const almacenTemario = crearAlmacenTemario(dirLifeOs);
    const almacenEstado = crearAlmacenEstadoWatcher({
      archivo: archivoWatcher,
      ahora: () => new Date('2026-11-10T15:00:00Z'),
    });

    // Pre-condición: añadir una nota manual y alerta a un ítem de la semilla de POO que se vinculará por nombre
    // ('Python en consola y VSCode: entornos virtuales' coincide con 'Python en consola y VSCode - Entornos virtuales' cm 315827)
    const temarioInicial = almacenTemario.obtener();
    const modPooInicial = temarioInicial.modulos.find(m => m.id === 'poo');
    const unidadT1Inicial = modPooInicial.unidades.find(u => u.k === 'T1');
    const itemSemillaVinculable = unidadT1Inicial.items.find(
      it => it.n === 'Python en consola y VSCode: entornos virtuales'
    );
    assert.ok(itemSemillaVinculable, 'Debe existir el ítem de semilla en POO/T1');
    itemSemillaVinculable.nota = 'Nota manual de prueba para verificar preservación al vincular';
    itemSemillaVinculable.alerta = true;
    almacenTemario.guardar();

    // Preparar el módulo POO normalizado desde las fixtures reales de Moodle
    const sec2475 = leerFixtureMoodle('course_2475_contents.json');
    const assignmentsData = leerFixtureMoodle('assignments.json');
    const assignments2475 = assignmentsData.courses.find(c => c.id === 2475)?.assignments || [];

    const modPooNormalizado = normalizarCursoMoodle({
      courseId: 2475,
      idModulo: 'poo',
      nombreModulo: 'Programación orientada a objetos',
      secciones: sec2475,
      assignments: assignments2475,
      quizzes: [],
      grades: [],
    });

    const resultadosIngestaLifeOs = [];
    const fetchConectadoALifeOs = async (url, opts = {}) => {
      assert.equal(String(url), 'http://lifeos.interno/api/ingesta/clase');
      assert.equal(opts.method, 'POST');

      const bodyRecibido = JSON.parse(opts.body);
      const loteAdaptado = aplanarModulosParaTemarioLifeOs(bodyRecibido);
      const resultadoIngesta = almacenTemario.ingestar(loteAdaptado);
      resultadosIngestaLifeOs.push(resultadoIngesta);

      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, data: resultadoIngesta };
        },
        async text() {
          return JSON.stringify({ ok: true, data: resultadoIngesta });
        },
      };
    };

    const clienteLifeOs = crearClienteLifeOs({
      lifeosUrl: 'http://lifeos.interno',
      ingestaToken: 'token-e2e-lifeos',
      fetchFn: fetchConectadoALifeOs,
    });

    const fuentePoo = {
      async obtenerLote() {
        return {
          fuente: 'moodle',
          completa: true,
          modulos: [structuredClone(modPooNormalizado)],
        };
      },
    };

    // 1.ª pasada End-to-End: el watcher detecta los ítems de POO y los ingesta en Life OS
    const pasada1 = await ejecutarPasadaFuente({
      nombreFuente: 'moodle_poo',
      fuente: fuentePoo,
      almacenEstado,
      clienteLifeOs,
    });

    assert.equal(pasada1.ok, true);
    assert.equal(pasada1.hayCambios, true);
    assert.equal(pasada1.enviado, true);
    assert.ok(pasada1.resumen.nuevos > 0);
    assert.equal(resultadosIngestaLifeOs.length, 1);
    assert.ok(
      resultadosIngestaLifeOs[0].nuevos > 0 || resultadosIngestaLifeOs[0].cambiados > 0,
      'La primera ingesta en Life OS debe registrar ítems nuevos o vinculados'
    );

    // Verificar que en Life OS se preservan intactos los campos manuales del módulo y de la semilla
    const temarioTrasPasada1 = almacenTemario.obtener();
    const modPooActualizado = temarioTrasPasada1.modulos.find(m => m.id === 'poo');
    assert.equal(modPooActualizado.corto, 'POO');
    assert.equal(modPooActualizado.color, 'var(--l-rutas)');
    assert.equal(modPooActualizado.ahora, 'T1');
    assert.equal(
      modPooActualizado.meta,
      'Javier Caselli Fernández. Sin programación disponible: faltan las horas y los temas siguientes.'
    );

    const unidadT1 = modPooActualizado.unidades.find(u => u.k === 'T1');
    // Ítem vinculado por nombre (cm 315827) conserva nota y alerta manuales
    const itemVinculado = unidadT1.items.find(it => it.ext_id === 'moodle:2475:cm:315827');
    assert.ok(itemVinculado, 'El ítem cm 315827 debe haberse vinculado en T1');
    assert.equal(
      itemVinculado.nota,
      'Nota manual de prueba para verificar preservación al vincular'
    );
    assert.equal(itemVinculado.alerta, true);

    // Ítem de semilla con nota y alerta preexistentes en src/clase.mjs las conserva intactas
    const itemSemillaAlmacen = unidadT1.items.find(
      it => it.n === 'Tarea: un almacén y un centro de talleres'
    );
    assert.ok(itemSemillaAlmacen);
    assert.equal(itemSemillaAlmacen.alerta, true);
    assert.equal(
      itemSemillaAlmacen.nota,
      'Entrega almacen.py, centro.py y los dos JSON. Tus soluciones e01 a e20 son del cuaderno, no de esta práctica.'
    );

    // 2.ª pasada End-to-End: tanto el diff del watcher como la ingesta en Life OS dan 0 cambios
    const pasada2 = await ejecutarPasadaFuente({
      nombreFuente: 'moodle_poo',
      fuente: fuentePoo,
      almacenEstado,
      clienteLifeOs,
    });

    assert.equal(pasada2.ok, true);
    assert.equal(pasada2.hayCambios, false);
    assert.equal(pasada2.enviado, false);
    assert.deepEqual(pasada2.resumen, {
      nuevos: 0,
      cambiados: 0,
      archivados: 0,
      notasNuevas: 0,
    });
    assert.equal(resultadosIngestaLifeOs.length, 1, 'El watcher no reenvía tráfico en la 2.ª pasada');

    // Incluso forzando el envío a Life OS con el mismo lote, la ingesta en Life OS es idempotente (0 cambios)
    const pasadaForzada = await ejecutarPasadaFuente({
      nombreFuente: 'moodle_poo',
      fuente: fuentePoo,
      almacenEstado,
      clienteLifeOs,
      forzarEnvio: true,
    });
    assert.equal(pasadaForzada.ok, true);
    assert.equal(pasadaForzada.enviado, true);
    assert.equal(resultadosIngestaLifeOs.length, 2);
    assert.deepEqual(resultadosIngestaLifeOs[1], {
      nuevos: 0,
      cambiados: 0,
      archivados: 0,
    });
  });
});
