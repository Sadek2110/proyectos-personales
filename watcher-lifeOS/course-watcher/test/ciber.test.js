'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { formatearFechaMadrid } = require('../src/normalizador.js');
const {
  CURSOS_PYTHON_MOODLE,
  CURSOS_CIBER_MOODLE,
  crearFuenteCiberseguridad,
} = require('../src/fuentes/moodle.js');
const indiceWatcher = require('../src/index.js');
const { MODULOS_CIBER } = require('../../life-os/src/clase.mjs');
const { crearAlmacenTemario } = require('../../life-os/agente/temario.js');

const RUTA_FIXTURES_CIBER = path.join(__dirname, 'fixtures', 'ciber');

function leerFixtureCiber(nombre) {
  return JSON.parse(fs.readFileSync(path.join(RUTA_FIXTURES_CIBER, nombre), 'utf8'));
}

function crearRespuestaSimulada({ status = 200, jsonBody = null, textBody = '' }) {
  const texto = textBody || (jsonBody !== null ? JSON.stringify(jsonBody) : '');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get() {
        return null;
      },
      getSetCookie() {
        return [];
      },
    },
    async text() {
      return texto;
    },
    async json() {
      return jsonBody !== null ? jsonBody : JSON.parse(texto);
    },
  };
}

function crearFetchFixturesCiber() {
  const siteInfo = leerFixtureCiber('site_info.json');
  const assignments = leerFixtureCiber('assignments.json');
  const contenidosPorCurso = new Map([
    [311, leerFixtureCiber('course_311_contents.json')],
    [177, leerFixtureCiber('course_177_contents.json')],
    [175, leerFixtureCiber('course_175_contents.json')],
    [174, leerFixtureCiber('course_174_contents.json')],
    [173, leerFixtureCiber('course_173_contents.json')],
    [172, leerFixtureCiber('course_172_contents.json')],
  ]);

  return async (url, opts = {}) => {
    const urlStr = String(url);
    const bodyStr = String(opts.body || '');

    if (urlStr.includes('/login/token.php')) {
      return crearRespuestaSimulada({
        jsonBody: { token: 'TOKEN_SIMULADO_CIBER_CEUTA' },
      });
    }

    if (urlStr.includes('/webservice/rest/server.php')) {
      const params = new URLSearchParams(bodyStr);
      const wsfunction = params.get('wsfunction');

      if (wsfunction === 'core_webservice_get_site_info') {
        return crearRespuestaSimulada({ jsonBody: siteInfo });
      }
      if (wsfunction === 'mod_assign_get_assignments') {
        return crearRespuestaSimulada({ jsonBody: assignments });
      }
      if (wsfunction === 'mod_quiz_get_quizzes_by_courses') {
        return crearRespuestaSimulada({ jsonBody: { quizzes: [] } });
      }
      if (wsfunction === 'gradereport_user_get_grade_items') {
        return crearRespuestaSimulada({ jsonBody: { usergrades: [{ gradeitems: [] }] } });
      }
      if (wsfunction === 'core_course_get_contents') {
        const courseId = Number(params.get('courseid'));
        const secciones = contenidosPorCurso.get(courseId);
        if (!secciones) {
          throw new Error(`Curso inesperado en fixture Ciber: ${courseId}`);
        }
        return crearRespuestaSimulada({ jsonBody: secciones });
      }
    }

    throw new Error(`Petición no contemplada en fixture Ciber: ${urlStr} (${bodyStr})`);
  };
}

describe('Fase 6 — Curso 2: Especialización en Ciberseguridad (Aula Virtual FP Ceuta)', () => {
  it('CA-6.1: normaliza los 6 módulos de Ciberseguridad desde las fixtures reales de Ceuta', async () => {
    // Verificar catálogos exportados en moodle.js e index.js
    assert.ok(Array.isArray(CURSOS_PYTHON_MOODLE), 'CURSOS_PYTHON_MOODLE debe ser un array');
    assert.equal(CURSOS_PYTHON_MOODLE.length, 3);
    assert.equal(indiceWatcher.CURSOS_PYTHON_MOODLE, CURSOS_PYTHON_MOODLE);
    assert.equal(indiceWatcher.CURSOS_CIBER_MOODLE, CURSOS_CIBER_MOODLE);
    assert.equal(indiceWatcher.crearFuenteCiberseguridad, crearFuenteCiberseguridad);

    assert.ok(Array.isArray(CURSOS_CIBER_MOODLE), 'CURSOS_CIBER_MOODLE debe ser un array');
    assert.equal(CURSOS_CIBER_MOODLE.length, 6);
    const mapaEsperado = [
      [311, 'brs'],
      [177, 'afi'],
      [175, 'pps'],
      [174, 'nc'],
      [173, 'ic'],
      [172, 'he'],
    ];
    assert.deepEqual(
      CURSOS_CIBER_MOODLE.map(c => [c.id, c.codigo]),
      mapaEsperado
    );

    const fuenteCiber = crearFuenteCiberseguridad({
      user: 'alumno_ciber',
      pass: 'secreto_ciber',
      fetchFn: crearFetchFixturesCiber(),
    });

    const lote = await fuenteCiber.obtenerLote();
    assert.equal(lote.fuente, 'ciber');
    assert.equal(lote.origen, 'ciber');
    assert.equal(lote.completa, true);
    assert.equal(lote.modulos.length, 6);
    assert.deepEqual(
      lote.modulos.map(m => m.id),
      ['brs', 'afi', 'pps', 'nc', 'ic', 'he']
    );

    const todosItems = lote.modulos.flatMap(m => m.unidades.flatMap(u => u.items));
    assert.ok(
      todosItems.length > 150,
      `Se esperaban más de 150 ítems reales entre los 6 módulos, obtenidos: ${todosItems.length}`
    );

    const nombresSeparadoresLabel = new Set([
      'Orientaciones',
      'Contenidos',
      'Recursos',
      'Evaluación',
    ]);

    for (const item of todosItems) {
      assert.equal(item.origen, 'ciber', `El ítem ${item.ext_id} debe tener origen 'ciber'`);
      assert.match(item.ext_id, /^moodle:(311|177|175|174|173|172):cm:\d+$/);
      assert.ok(
        !nombresSeparadoresLabel.has(item.n),
        `No debe incluir separadores label como ítem: ${item.n}`
      );
    }

    // Verificar mapeo de unidades por módulo
    const porId = Object.fromEntries(lote.modulos.map(m => [m.id, m]));

    const unidadesBrs = porId.brs.unidades.map(u => u.k);
    for (const u of ['General', 'T1', 'T2', 'T3', 'Inicio']) {
      assert.ok(unidadesBrs.includes(u), `Falta unidad ${u} en brs (obtenidas: ${unidadesBrs.join(', ')})`);
    }

    const unidadesAfi = porId.afi.unidades.map(u => u.k);
    for (const u of ['General', 'Inicio', 'UT1', 'UT2']) {
      assert.ok(unidadesAfi.includes(u), `Falta unidad ${u} en afi (obtenidas: ${unidadesAfi.join(', ')})`);
    }

    const unidadesPps = porId.pps.unidades.map(u => u.k);
    for (const u of ['General', 'UT1']) {
      assert.ok(unidadesPps.includes(u), `Falta unidad ${u} en pps (obtenidas: ${unidadesPps.join(', ')})`);
    }

    const unidadesNc = porId.nc.unidades.map(u => u.k);
    for (const u of ['General', 'UT1']) {
      assert.ok(unidadesNc.includes(u), `Falta unidad ${u} en nc (obtenidas: ${unidadesNc.join(', ')})`);
    }

    const unidadesIc = porId.ic.unidades.map(u => u.k);
    for (const u of ['General', 'UD1', 'UD2', 'UD3', 'UD4', 'UD5', 'UD6', 'UD7', 'Exámenes']) {
      assert.ok(unidadesIc.includes(u), `Falta unidad ${u} en ic (obtenidas: ${unidadesIc.join(', ')})`);
    }

    const unidadesHe = porId.he.unidades.map(u => u.k);
    for (const u of ['General', 'UT1', 'UT2', 'UT3', 'UT4', 'UT5']) {
      assert.ok(unidadesHe.includes(u), `Falta unidad ${u} en he (obtenidas: ${unidadesHe.join(', ')})`);
    }

    // Verificar las 19 entregas de assignments.json con tipo 'Entrega' y fecha en Europe/Madrid
    const assignmentsRaw = leerFixtureCiber('assignments.json');
    const listaAssignments = assignmentsRaw.courses.flatMap(c => c.assignments);
    assert.equal(listaAssignments.length, 19);

    for (const assign of listaAssignments) {
      const extIdEsperado = `moodle:${assign.course}:cm:${assign.cmid}`;
      const itemEntrega = todosItems.find(i => i.ext_id === extIdEsperado);
      assert.ok(itemEntrega, `Debe existir la entrega normalizada ${extIdEsperado} (${assign.name})`);
      assert.equal(itemEntrega.tipo, 'Entrega');
      assert.equal(itemEntrega.fecha, formatearFechaMadrid(assign.duedate));
      assert.match(itemEntrega.fecha, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    }
  });

  it('CA-6.2: ingiere los 6 módulos de Ciberseguridad en life-os junto a los 4 de Python sin archivar otras fuentes', async () => {
    const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-ciber-ca62-'));
    try {
      assert.ok(Array.isArray(MODULOS_CIBER), 'MODULOS_CIBER debe exportarse en src/clase.mjs');
      assert.equal(MODULOS_CIBER.length, 6);

      const almacen = crearAlmacenTemario(dirTemp);
      assert.deepEqual(
        almacen.obtener().modulos.map(m => m.id),
        ['ent', 'est', 'poo', 'ana']
      );

      // Ingerimos previamente un ítem de Moodle Python para verificar aislamiento de archivado
      almacen.ingestar({
        origen: 'moodle',
        completa: false,
        items: [
          {
            ext_id: 'moodle:2005:cm:999999',
            origen: 'moodle',
            modulo: 'est',
            unidad: 'UD1',
            n: 'Recurso previo de Python Moodle',
            tipo: 'PDF',
          },
        ],
      });

      const fuenteCiber = crearFuenteCiberseguridad({
        user: 'alumno_ciber',
        pass: 'secreto_ciber',
        fetchFn: crearFetchFixturesCiber(),
      });
      const loteCiber = await fuenteCiber.obtenerLote();

      const resultado = almacen.ingestar(loteCiber);
      assert.ok(resultado.nuevos > 150, `Debe registrar > 150 ítems nuevos de Ciber, obtenidos: ${resultado.nuevos}`);
      assert.equal(resultado.archivados, 0, 'No debe archivar ningún ítem de Python al ingerir Ciber');

      const estado = almacen.obtener();
      assert.equal(estado.modulos.length, 10);
      assert.deepEqual(
        estado.modulos.map(m => m.id),
        ['ent', 'est', 'poo', 'ana', 'brs', 'afi', 'pps', 'nc', 'ic', 'he']
      );

      const idsPorCodigoCiber = {
        brs: 311,
        afi: 177,
        pps: 175,
        nc: 174,
        ic: 173,
        he: 172,
      };

      for (const [codigo, courseId] of Object.entries(idsPorCodigoCiber)) {
        const mod = estado.modulos.find(m => m.id === codigo);
        assert.ok(mod, `Falta el módulo ${codigo} en temario.json`);
        assert.ok(mod.corto && mod.corto.length > 0, `El módulo ${codigo} debe tener corto`);
        assert.ok(mod.nombre && mod.nombre.length > 0, `El módulo ${codigo} debe tener nombre`);
        assert.ok(mod.color && mod.color.startsWith('var(--l-'), `El módulo ${codigo} debe tener color CSS`);
        assert.equal(mod.curso, 'ciber');
        assert.equal(
          mod.aula?.url,
          `https://www.mecd.es/aulavirtualfpceuta/course/view.php?id=${courseId}`
        );
      }

      // Comprobar que ningún ítem de los módulos de Python (ent, est, poo, ana) ha sido archivado
      for (const idPy of ['ent', 'est', 'poo', 'ana']) {
        const modPy = estado.modulos.find(m => m.id === idPy);
        const itemsPy = modPy.unidades.flatMap(u => u.items);
        assert.ok(itemsPy.length > 0);
        for (const it of itemsPy) {
          assert.ok(!it.archivado, `El ítem ${it.n} de ${idPy} no debe archivarse por una ingesta de ciber`);
        }
      }
    } finally {
      fs.rmSync(dirTemp, { recursive: true, force: true });
    }
  });

  it('CA-6.3: preserva campos manuales (nota, alerta, ahora) y es idempotente en segunda pasada de ciber', async () => {
    const dirTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-ciber-ca63-'));
    try {
      const almacen = crearAlmacenTemario(dirTemp);
      const fuenteCiber = crearFuenteCiberseguridad({
        user: 'alumno_ciber',
        pass: 'secreto_ciber',
        fetchFn: crearFetchFixturesCiber(),
      });
      const loteCiber = await fuenteCiber.obtenerLote();

      // Primera ingesta
      const res1 = almacen.ingestar(loteCiber);
      assert.ok(res1.nuevos > 150);

      // Personalizar campos manuales en brs y en uno de sus ítems
      const estado1 = almacen.obtener();
      const modBrs = estado1.modulos.find(m => m.id === 'brs');
      assert.ok(modBrs, 'Debe existir el módulo brs tras la primera ingesta');
      modBrs.ahora = 'T2';

      const unidadT1 = modBrs.unidades.find(u => u.k === 'T1');
      assert.ok(unidadT1 && unidadT1.items.length > 0, 'brs debe tener ítems en T1');
      const itemObjetivo = unidadT1.items[0];
      const extIdObjetivo = itemObjetivo.ext_id;
      itemObjetivo.nota = 'Repasar cortafuegos antes del laboratorio';
      itemObjetivo.alerta = true;
      almacen.guardar();

      // Segunda ingesta con el mismo lote de ciber
      const res2 = almacen.ingestar(loteCiber);
      assert.deepEqual(res2, { nuevos: 0, cambiados: 0, archivados: 0 });

      const estado2 = almacen.obtener();
      const modBrs2 = estado2.modulos.find(m => m.id === 'brs');
      assert.equal(modBrs2.ahora, 'T2');

      const itemTrasSegunda = modBrs2.unidades
        .flatMap(u => u.items)
        .find(i => i.ext_id === extIdObjetivo);
      assert.ok(itemTrasSegunda, 'El ítem personalizado debe seguir existiendo');
      assert.equal(itemTrasSegunda.nota, 'Repasar cortafuegos antes del laboratorio');
      assert.equal(itemTrasSegunda.alerta, true);
    } finally {
      fs.rmSync(dirTemp, { recursive: true, force: true });
    }
  });
});
