'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  formatearFechaMadrid,
  calcularHashItem,
  inferirUnidadMoodle,
  inferirTipoMoodle,
  normalizarCursoMoodle,
} = require('../src/normalizador.js');

const {
  crearSincronizadorDrive,
} = require('../src/drive.js');

const {
  ErrorCaptchaDetectado,
  crearFuenteMoodle,
} = require('../src/fuentes/moodle.js');

const RUTA_FIXTURES_MOODLE = path.join(__dirname, 'fixtures', 'moodle');
const RUTA_FIXTURES_CIBER = path.join(__dirname, 'fixtures', 'ciber');

function leerFixtureMoodle(nombre) {
  return JSON.parse(fs.readFileSync(path.join(RUTA_FIXTURES_MOODLE, nombre), 'utf8'));
}

function leerFixtureCiber(nombre) {
  return JSON.parse(fs.readFileSync(path.join(RUTA_FIXTURES_CIBER, nombre), 'utf8'));
}

function crearRespuestaSimulada({ status = 200, jsonBody = null, textBody = '', headers = {}, bufferBody = null }) {
  const mapaHeaders = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const texto = textBody || (jsonBody !== null ? JSON.stringify(jsonBody) : '');
  const buf = bufferBody || Buffer.from(texto, 'utf8');

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(nombre) {
        const val = mapaHeaders.get(String(nombre).toLowerCase());
        if (Array.isArray(val)) return val.join(', ');
        return val ?? null;
      },
      getSetCookie() {
        const val = mapaHeaders.get('set-cookie');
        if (!val) return [];
        return Array.isArray(val) ? val : [val];
      },
    },
    async text() {
      return texto;
    },
    async json() {
      return jsonBody !== null ? jsonBody : JSON.parse(texto);
    },
    async arrayBuffer() {
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  };
}

describe('Fase 2 — Conector MoodleApiSource, Normalizador y Google Drive', () => {
  it('CA-2.1: normaliza los 3 módulos de Python (est=2005, poo=2475, ana=2006) desde fixtures reales anonimizadas', () => {
    const sec2005 = leerFixtureMoodle('course_2005_contents.json');
    const sec2475 = leerFixtureMoodle('course_2475_contents.json');
    const sec2006 = leerFixtureMoodle('course_2006_contents.json');
    const assignmentsData = leerFixtureMoodle('assignments.json');
    const quizzesData = leerFixtureMoodle('quizzes.json');
    const grades2005 = leerFixtureMoodle('grades_2005.json');
    const grades2475 = leerFixtureMoodle('grades_2475.json');
    const grades2006 = leerFixtureMoodle('grades_2006.json');

    const assignments2005 = assignmentsData.courses.find(c => c.id === 2005)?.assignments || [];
    const assignments2475 = assignmentsData.courses.find(c => c.id === 2475)?.assignments || [];
    const assignments2006 = assignmentsData.courses.find(c => c.id === 2006)?.assignments || [];

    const modEst = normalizarCursoMoodle({
      courseId: 2005,
      idModulo: 'est',
      nombreModulo: 'Estructuras de control en Python',
      secciones: sec2005,
      assignments: assignments2005,
      quizzes: quizzesData.quizzes || [],
      grades: grades2005.usergrades?.[0]?.gradeitems || [],
    });

    const modPoo = normalizarCursoMoodle({
      courseId: 2475,
      idModulo: 'poo',
      nombreModulo: 'Programación orientada a objetos',
      secciones: sec2475,
      assignments: assignments2475,
      quizzes: quizzesData.quizzes || [],
      grades: grades2475.usergrades?.[0]?.gradeitems || [],
    });

    const modAna = normalizarCursoMoodle({
      courseId: 2006,
      idModulo: 'ana',
      nombreModulo: 'Análisis de datos en Python',
      secciones: sec2006,
      assignments: assignments2006,
      quizzes: quizzesData.quizzes || [],
      grades: grades2006.usergrades?.[0]?.gradeitems || [],
    });

    // Verificación de estructura base de los 3 módulos
    assert.equal(modEst.id, 'est');
    assert.equal(modPoo.id, 'poo');
    assert.equal(modAna.id, 'ana');

    // Unidades esperadas en est: General, Inicio, UD1..UD5
    const clavesEst = modEst.unidades.map(u => u.k);
    for (const uEsperada of ['General', 'Inicio', 'UD1', 'UD2', 'UD3', 'UD4', 'UD5']) {
      assert.ok(clavesEst.includes(uEsperada), `Falta unidad ${uEsperada} en est (obtenidas: ${clavesEst.join(', ')})`);
    }

    // Unidades esperadas en poo: General, T1, Vídeos
    const clavesPoo = modPoo.unidades.map(u => u.k);
    for (const uEsperada of ['General', 'T1', 'Vídeos']) {
      assert.ok(clavesPoo.includes(uEsperada), `Falta unidad ${uEsperada} en poo (obtenidas: ${clavesPoo.join(', ')})`);
    }

    // Unidades esperadas en ana: General, Inicio (y UD1..UD4 si conserva secciones vacías o con contenido)
    const clavesAna = modAna.unidades.map(u => u.k);
    assert.ok(clavesAna.includes('General'), 'Falta unidad General en ana');
    assert.ok(clavesAna.includes('Inicio'), 'Falta unidad Inicio en ana');
    assert.deepEqual(inferirUnidadMoodle('ana', { section: 2, name: 'Acceso a datos' }).k, 'UD1');
    assert.deepEqual(inferirUnidadMoodle('ana', { section: 3, name: 'Manipulación, limpieza y estandarización de datos' }).k, 'UD2');
    assert.deepEqual(inferirUnidadMoodle('ana', { section: 4, name: 'Análisis exploratorio de datos' }).k, 'UD3');
    assert.deepEqual(inferirUnidadMoodle('ana', { section: 5, name: 'Modelado estadístico de datos' }).k, 'UD4');

    // Recopilar todos los ítems de los 3 módulos
    const todosItems = [
      ...modEst.unidades.flatMap(u => u.items),
      ...modPoo.unidades.flatMap(u => u.items),
      ...modAna.unidades.flatMap(u => u.items),
    ];
    assert.ok(todosItems.length >= 50, `Se esperaban al menos 50 ítems entre los 3 módulos, obtenidos: ${todosItems.length}`);

    // Verificar formato ext_id, origen, hash de 16 hex y ausencia de labels
    for (const item of todosItems) {
      assert.match(item.ext_id, /^moodle:(2005|2475|2006):cm:\d+$/);
      assert.equal(item.origen, 'moodle');
      assert.ok(item.n && item.n.length > 0, `Ítem ${item.ext_id} sin nombre`);
      assert.match(item.hash, /^[0-9a-f]{16}$/);
      assert.equal(
        item.hash,
        calcularHashItem({ n: item.n, tipo: item.tipo, fecha: item.fecha, url: item.url })
      );
    }

    // Comprobar todos los tipos requeridos: PDF, Notebook, Entrega, Prueba, Enlace, Vídeo, ZIP, Anuncio
    const tiposPresentes = new Set(todosItems.map(i => i.tipo));
    for (const tipoEsperado of ['PDF', 'Notebook', 'Entrega', 'Prueba', 'Enlace', 'Vídeo', 'ZIP', 'Anuncio']) {
      assert.ok(
        tiposPresentes.has(tipoEsperado),
        `Falta el tipo '${tipoEsperado}' en los ítems normalizados (presentes: ${[...tiposPresentes].join(', ')})`
      );
    }

    // Verificar que modname === 'label' se ignora
    assert.equal(inferirTipoMoodle({ id: 999999, modname: 'label', name: 'Separador' }, 'UD1'), null);
    const secConLabel = [
      {
        id: 1,
        section: 1,
        name: 'Sentencias condicionales',
        modules: [
          { id: 1001, modname: 'label', name: 'Etiqueta decorativa' },
          { id: 1002, modname: 'assign', name: 'Entrega de prueba', url: 'https://moodle.local/mod/assign/view.php?id=1002' },
        ],
      },
    ];
    const modConLabel = normalizarCursoMoodle({
      courseId: 2005,
      idModulo: 'est',
      nombreModulo: 'Test Label',
      secciones: secConLabel,
      assignments: [],
      quizzes: [],
      grades: [],
    });
    const itemsFiltrados = modConLabel.unidades.flatMap(u => u.items);
    assert.equal(itemsFiltrados.length, 1);
    assert.equal(itemsFiltrados[0].ext_id, 'moodle:2005:cm:1002');

    // Verificar extracción de calificaciones con graderaw !== null en est (hay 5 publicadas en grades_2005.json)
    assert.ok(Array.isArray(modEst.calificaciones), 'modEst.calificaciones debe ser un array');
    assert.equal(modEst.calificaciones.length, 5);
    for (const cal of modEst.calificaciones) {
      assert.notEqual(cal.graderaw, null);
      assert.equal(cal.graderaw, 10);
    }
    assert.equal(modPoo.calificaciones.length, 0);
    assert.equal(modAna.calificaciones.length, 0);
  });

  it('CA-2.2: convierte timestamps a Europe/Madrid (CET invierno y CEST verano) y cruza fechas de entregas', () => {
    // Valores nulos, 0 o negativos devuelven undefined
    assert.equal(formatearFechaMadrid(0), undefined);
    assert.equal(formatearFechaMadrid(null), undefined);
    assert.equal(formatearFechaMadrid(undefined), undefined);
    assert.equal(formatearFechaMadrid(-100), undefined);

    // Horario de invierno (CET, UTC+1): 1793746500 -> 2026-11-03 22:55 UTC -> 2026-11-03T23:55 Madrid
    assert.equal(formatearFechaMadrid(1793746500), '2026-11-03T23:55');
    // 1793833140 -> 2026-11-04 22:59 UTC -> 2026-11-04T23:59 Madrid
    assert.equal(formatearFechaMadrid(1793833140), '2026-11-04T23:59');

    // Horario de verano (CEST, UTC+2):
    // Junio: 1781523000 -> 2026-06-15 11:30 UTC -> 2026-06-15T13:30 Madrid
    assert.equal(formatearFechaMadrid(1781523000), '2026-06-15T13:30');
    // Octubre antes del cambio de hora: 1792101540 -> 2026-10-15 21:59 UTC -> 2026-10-15T23:59 Madrid
    assert.equal(formatearFechaMadrid(1792101540), '2026-10-15T23:59');

    // Cruce de fechas en normalizarCursoMoodle:
    // 1) Tarea con duedate > 0 en assignments.json (ej. cmid 348828 en POO -> 1793833140 -> 2026-11-04T23:59)
    // 2) Tarea que no está en assignments.json o tiene duedate=0 pero sí tiene cm.dates con dataid='duedate' (ej. cmid 346273 en EST -> 1793128500 -> 2026-10-27T20:15)
    // 3) Tarea con duedate=0 en ambos sitios (ej. cmid 346258 en EST -> undefined o '')
    const sec2005 = leerFixtureMoodle('course_2005_contents.json');
    const sec2475 = leerFixtureMoodle('course_2475_contents.json');
    const assignmentsData = leerFixtureMoodle('assignments.json');

    const modEst = normalizarCursoMoodle({
      courseId: 2005,
      idModulo: 'est',
      nombreModulo: 'Estructuras de control en Python',
      secciones: sec2005,
      assignments: assignmentsData.courses.find(c => c.id === 2005).assignments,
      quizzes: [],
      grades: [],
    });
    const modPoo = normalizarCursoMoodle({
      courseId: 2475,
      idModulo: 'poo',
      nombreModulo: 'Programación orientada a objetos',
      secciones: sec2475,
      assignments: assignmentsData.courses.find(c => c.id === 2475).assignments,
      quizzes: [],
      grades: [],
    });

    const itemsEst = modEst.unidades.flatMap(u => u.items);
    const itemsPoo = modPoo.unidades.flatMap(u => u.items);

    const tareaPoo1 = itemsPoo.find(i => i.ext_id === 'moodle:2475:cm:348828');
    assert.ok(tareaPoo1, 'Debe existir la Tarea 1 de POO (cm 348828)');
    assert.equal(tareaPoo1.tipo, 'Entrega');
    assert.equal(tareaPoo1.fecha, '2026-11-04T23:59');

    const tareaEstDates = itemsEst.find(i => i.ext_id === 'moodle:2005:cm:346273');
    assert.ok(tareaEstDates, 'Debe existir Prueba práctica U1 - 02 (cm 346273) con fecha en cm.dates');
    assert.equal(tareaEstDates.tipo, 'Entrega');
    assert.equal(tareaEstDates.fecha, '2026-10-27T20:15');

    const tareaSinFecha = itemsEst.find(i => i.ext_id === 'moodle:2005:cm:346258');
    assert.ok(tareaSinFecha, 'Debe existir Prueba práctica U1 ejercicio 1 (cm 346258)');
    assert.ok(!tareaSinFecha.fecha, 'Tarea con duedate=0 no debe tener fecha definida');
  });

  it('CA-2.3: reutiliza el wstoken existente sin hacer login y lo renueva automáticamente ante invalidtoken', async () => {
    const llamadas = [];
    const tokensGuardados = [];
    let intentoServer = 0;

    const fetchSimulado = async (url, opts = {}) => {
      const urlStr = String(url);
      llamadas.push({ url: urlStr, method: opts.method || 'GET', body: opts.body });

      if (urlStr.includes('/webservice/rest/server.php')) {
        intentoServer += 1;
        // En la primera llamada con el token caducado, forzamos invalidtoken en la segunda prueba
        if (String(opts.body).includes('wstoken=TOKEN_CADUCADO')) {
          return crearRespuestaSimulada({
            jsonBody: {
              exception: 'moodle_exception',
              errorcode: 'invalidtoken',
              message: 'Valor de token no válido',
            },
          });
        }
        return crearRespuestaSimulada({
          jsonBody: { sitename: 'Moodle Centros Málaga', userid: 99999, functions: [] },
        });
      }

      if (urlStr.includes('/login/token.php')) {
        return crearRespuestaSimulada({
          jsonBody: { token: 'TOKEN_RENOVADO_1234567890abcdef' },
        });
      }

      throw new Error(`URL inesperada en test CA-2.3: ${urlStr}`);
    };

    // Caso A: Reutiliza token devuelto por leerToken() sin llamar a login
    const fuenteReuso = crearFuenteMoodle({
      baseUrl: 'https://moodle.ejemplo.es',
      modoAuth: 'directo',
      user: 'alumno',
      pass: 'secreto',
      cursos: [],
      fetchFn: fetchSimulado,
      leerToken: () => 'TOKEN_VALIDO_EXISTENTE',
      guardarToken: t => tokensGuardados.push(t),
    });

    const info1 = await fuenteReuso.llamarWs('core_webservice_get_site_info');
    assert.equal(info1.userid, 99999);
    assert.equal(llamadas.length, 1);
    assert.ok(llamadas[0].url.includes('/webservice/rest/server.php'));
    assert.equal(tokensGuardados.length, 0, 'No debe guardar token si reutilizó el existente');

    // Caso B: El token inicial está caducado -> recibe invalidtoken -> pide nuevo token 1 vez -> guarda -> reintenta WS con éxito
    llamadas.length = 0;
    const fuenteRenovacion = crearFuenteMoodle({
      baseUrl: 'https://moodle.ejemplo.es',
      modoAuth: 'directo',
      user: 'alumno',
      pass: 'secreto',
      tokenInicial: 'TOKEN_CADUCADO',
      cursos: [],
      fetchFn: fetchSimulado,
      guardarToken: t => tokensGuardados.push(t),
    });

    const info2 = await fuenteRenovacion.llamarWs('core_webservice_get_site_info');
    assert.equal(info2.userid, 99999);
    assert.equal(tokensGuardados.length, 1);
    assert.equal(tokensGuardados[0], 'TOKEN_RENOVADO_1234567890abcdef');

    const llamadasLogin = llamadas.filter(l => l.url.includes('/login/token.php'));
    const llamadasWs = llamadas.filter(l => l.url.includes('/webservice/rest/server.php'));
    assert.equal(llamadasLogin.length, 1, 'Debe solicitar token nuevo exactamente una vez');
    assert.equal(llamadasWs.length, 2, 'Debe hacer la llamada inicial fallida y 1 reintento exitoso');
  });

  it('CA-2.4: detecta CAPTCHA (g-recaptcha, cf-turnstile, hcaptcha) en el login y lanza ErrorCaptchaDetectado sin reintentar', async () => {
    for (const marcadorCaptcha of ['g-recaptcha', 'cf-turnstile', 'hcaptcha']) {
      let contadorPeticiones = 0;
      const fetchConCaptcha = async () => {
        contadorPeticiones += 1;
        return crearRespuestaSimulada({
          status: 200,
          textBody: `<html><body><form action="/cas/login"><div class="${marcadorCaptcha}" data-sitekey="123"></div></form></body></html>`,
        });
      };

      const fuenteCas = crearFuenteMoodle({
        baseUrl: 'https://educacionadistancia.juntadeandalucia.es/centros/malaga',
        modoAuth: 'cas',
        user: 'alumno',
        pass: 'secreto',
        cursos: [{ id: 2005, codigo: 'est', nombre: 'Estructuras' }],
        fetchFn: fetchConCaptcha,
      });

      await assert.rejects(
        () => fuenteCas.obtenerToken(true),
        err => {
          assert.ok(
            err instanceof ErrorCaptchaDetectado || err.name === 'ErrorCaptchaDetectado',
            `Se esperaba ErrorCaptchaDetectado para ${marcadorCaptcha}, recibido: ${err}`
          );
          return true;
        }
      );
      assert.equal(
        contadorPeticiones,
        1,
        `Ante ${marcadorCaptcha} debe abortar en la primera respuesta sin reintentar`
      );
    }
  });

  it('CA-2.5: sincroniza archivos con Google Drive de forma idempotente y jamás expone el wstoken en los ítems', async () => {
    const sec2005 = leerFixtureMoodle('course_2005_contents.json');
    const modEst = normalizarCursoMoodle({
      courseId: 2005,
      idModulo: 'est',
      nombreModulo: 'Estructuras de control en Python',
      secciones: sec2005,
      assignments: [],
      quizzes: [],
      grades: [],
    });

    // Tomamos solo las unidades Inicio y UD1 para acotar el test manteniendo PDFs y Notebooks reales
    const modulosPrueba = [
      {
        ...modEst,
        unidades: modEst.unidades.filter(u => u.k === 'Inicio' || u.k === 'UD1'),
      },
    ];

    const WSTOKEN_SECRETO = 'WSTOKEN_SUPER_SECRETO_99887766';
    const descargasRealizadas = [];
    const subidasRealizadas = [];
    const estadoDrive = {};

    const fetchDescarga = async url => {
      const urlStr = String(url);
      descargasRealizadas.push(urlStr);
      return crearRespuestaSimulada({
        status: 200,
        bufferBody: Buffer.from('contenido-binario-simulado'),
      });
    };

    const subirArchivoSimulado = async info => {
      subidasRealizadas.push(info);
      return {
        file_id: `drive_id_${subidasRealizadas.length}`,
        drive_url: `https://drive.google.com/file/d/drive_id_${subidasRealizadas.length}/view`,
      };
    };

    const sincronizador = crearSincronizadorDrive({
      subirArchivo: subirArchivoSimulado,
      fetchFn: fetchDescarga,
      estadoDrive,
    });

    // 1.ª pasada: descarga archivos nuevos y los sube a Drive
    const res1 = await sincronizador.sincronizarModulos(
      modulosPrueba,
      WSTOKEN_SECRETO,
      'FP Especialización Python'
    );

    assert.ok(res1.descargados > 0, 'En la primera pasada debe descargar los PDFs y Notebooks');
    assert.equal(descargasRealizadas.length, res1.descargados);
    assert.equal(subidasRealizadas.length, res1.descargados);

    // Todas las URLs de descarga invocadas por fetch deben llevar token=<wstoken>
    for (const urlDescarga of descargasRealizadas) {
      assert.ok(
        urlDescarga.includes(`token=${WSTOKEN_SECRETO}`),
        `La URL de descarga debe incluir token=<wstoken>: ${urlDescarga}`
      );
    }

    // Verificar que los ítems con archivos adjuntos tienen drive_url y que ningún campo expone el wstoken
    const itemsTrasPasada1 = modulosPrueba[0].unidades.flatMap(u => u.items);
    const itemsConDrive = itemsTrasPasada1.filter(i => i.drive_url);
    assert.ok(itemsConDrive.length > 0, 'Los ítems con PDF/Notebook deben recibir drive_url');

    const jsonSerializado = JSON.stringify(modulosPrueba);
    assert.ok(
      !jsonSerializado.includes(WSTOKEN_SECRETO),
      'Ningún ítem ni propiedad del módulo puede contener el wstoken secreto'
    );

    // 2.ª pasada con el mismo estadoDrive y mismo timemodified -> 0 descargas y 0 subidas
    descargasRealizadas.length = 0;
    subidasRealizadas.length = 0;

    const res2 = await sincronizador.sincronizarModulos(
      modulosPrueba,
      WSTOKEN_SECRETO,
      'FP Especialización Python'
    );

    assert.equal(res2.descargados, 0, 'En la segunda pasada idempotente descargados debe ser 0');
    assert.equal(descargasRealizadas.length, 0, 'No debe invocar fetchFn en la segunda pasada');
    assert.equal(subidasRealizadas.length, 0, 'No debe invocar subirArchivo en la segunda pasada');
  });

  it('CA-2.6: soporta modoAuth directo (/login/token.php) y normaliza course_311_contents.json de Ciberseguridad (brs)', async () => {
    const sec311 = leerFixtureCiber('course_311_contents.json');
    const assignmentsCiber = leerFixtureCiber('assignments.json');
    const siteInfoCiber = leerFixtureCiber('site_info.json');

    const peticiones = [];
    const fetchCiber = async (url, opts = {}) => {
      const urlStr = String(url);
      const bodyStr = String(opts.body || '');
      peticiones.push({ url: urlStr, body: bodyStr });

      if (urlStr.includes('/login/token.php')) {
        assert.ok(
          urlStr.includes('service=moodle_mobile_app') || bodyStr.includes('service=moodle_mobile_app'),
          'El login directo debe solicitar el servicio moodle_mobile_app'
        );
        return crearRespuestaSimulada({
          jsonBody: { token: 'TOKEN_DIRECTO_CIBER_311' },
        });
      }

      if (urlStr.includes('/webservice/rest/server.php')) {
        if (bodyStr.includes('core_webservice_get_site_info')) {
          return crearRespuestaSimulada({ jsonBody: siteInfoCiber });
        }
        if (bodyStr.includes('core_course_get_contents')) {
          return crearRespuestaSimulada({ jsonBody: sec311 });
        }
        if (bodyStr.includes('mod_assign_get_assignments')) {
          return crearRespuestaSimulada({ jsonBody: assignmentsCiber });
        }
        if (bodyStr.includes('mod_quiz_get_quizzes_by_courses')) {
          return crearRespuestaSimulada({ jsonBody: { quizzes: [] } });
        }
        if (bodyStr.includes('gradereport_user_get_grade_items')) {
          return crearRespuestaSimulada({ jsonBody: { usergrades: [{ gradeitems: [] }] } });
        }
      }

      throw new Error(`Petición inesperada en CA-2.6: ${urlStr} (${bodyStr})`);
    };

    const fuenteCiber = crearFuenteMoodle({
      baseUrl: 'https://www.mecd.es/aulavirtualfpceuta',
      modoAuth: 'directo',
      user: 'ciber_alumno',
      pass: 'ciber_pass',
      cursos: [{ id: 311, codigo: 'brs', nombre: 'Bastionado de redes y sistemas' }],
      nombreCurso: 'FP Especialización Ciberseguridad',
      fetchFn: fetchCiber,
    });

    const lote = await fuenteCiber.obtenerLote();
    assert.ok(lote && Array.isArray(lote.modulos), 'obtenerLote() debe devolver { modulos }');
    assert.equal(lote.modulos.length, 1);

    const modBrs = lote.modulos[0];
    assert.equal(modBrs.id, 'brs');

    // Verificar mapeo de secciones TEMA 1 -> T1, TEMA 2 -> T2, TEMA 3 -> T3
    const clavesUnidades = modBrs.unidades.map(u => u.k);
    assert.ok(clavesUnidades.includes('General'), `Debe incluir General (obtenidas: ${clavesUnidades.join(', ')})`);
    assert.ok(clavesUnidades.includes('T1'), `Debe mapear TEMA 1 a T1 (obtenidas: ${clavesUnidades.join(', ')})`);
    assert.ok(clavesUnidades.includes('T2'), `Debe mapear TEMA 2 a T2 (obtenidas: ${clavesUnidades.join(', ')})`);
    assert.ok(clavesUnidades.includes('T3'), `Debe mapear TEMA 3 a T3 (obtenidas: ${clavesUnidades.join(', ')})`);

    // Verificar que se han omitido todos los módulos con modname === 'label' (Orientaciones, Contenidos, Recursos, Evaluación)
    const itemsBrs = modBrs.unidades.flatMap(u => u.items);
    assert.ok(itemsBrs.length >= 20, `Se esperaban al menos 20 ítems reales en brs, obtenidos: ${itemsBrs.length}`);

    const nombresLabels = new Set(['Orientaciones', 'Contenidos', 'Recursos', 'Evaluación']);
    for (const item of itemsBrs) {
      assert.match(item.ext_id, /^moodle:311:cm:\d+$/);
      assert.ok(!nombresLabels.has(item.n), `No debe incluir etiquetas label como ítem: ${item.n}`);
    }
  });
});
