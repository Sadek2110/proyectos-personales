'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  enVentanaCron,
  crearDemonioWatcher,
} = require('../src/cron.js');

const {
  crearServidorWatcher,
} = require('../src/servidor.js');

const {
  crearAlmacenEstadoWatcher,
} = require('../src/diff.js');

const {
  crearClienteLifeOs,
} = require('../src/cliente-lifeos.js');

const {
  crearAlmacenTemario,
} = require('../../life-os/agente/temario.js');

const {
  crearAlmacen,
} = require('../../life-os/agente/almacen.js');

const {
  evaluar,
  crearPlanificador,
} = require('../../life-os/agente/planificador.js');

const PREFS_PRUEBA = {
  resumen: false,
  horaResumen: '08:00',
  eventos: true,
  minutosEvento: 15,
  tareas: true,
  sugerencias: false,
};

const COPIA_VACIA = {
  eventos: [],
  tareas: [],
  compras: [],
  actividades: [],
  novedades: [],
  fuentes: {},
};

function googleFalso() {
  return async nombre => {
    switch (nombre) {
      case 'obtenerDatos':
        return { compras: [], tareas: [] };
      case 'obtenerEventos':
        return [];
      case 'obtenerCalendarios':
        return [];
      case 'obtenerRutas':
        return [];
      case 'obtenerClase':
        return {};
      default:
        return true;
    }
  };
}

function pushFalso() {
  const enviados = [];
  return {
    enviados,
    hayDispositivos: () => true,
    enviar: async aviso => {
      enviados.push(aviso);
      return { entregados: 1, reintentar: false };
    },
  };
}

function escucharPuertoEfimero(servidor) {
  return new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const addr = servidor.address();
      resolve(addr.port);
    });
  });
}

function cerrarServidor(servidor) {
  return new Promise(resolve => {
    if (!servidor || !servidor.listening) return resolve();
    servidor.close(() => resolve());
  });
}

describe('Fase 7 — Cron, Salud de Fuentes, Alertas y Servidor de Observabilidad', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-fase7-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('CA-7.1: Ventana horaria 08:00-22:00 en enVentanaCron y ejecución condicional/forzada en crearDemonioWatcher', async () => {
    // 1. Verificar límites exactos de enVentanaCron con rango '08:00-22:00'
    assert.equal(enVentanaCron('2026-11-15T08:00', '08:00-22:00'), true);
    assert.equal(enVentanaCron('2026-11-15T14:30', '08:00-22:00'), true);
    assert.equal(enVentanaCron('2026-11-15T22:00', '08:00-22:00'), true);
    assert.equal(enVentanaCron('2026-11-15T07:59', '08:00-22:00'), false);
    assert.equal(enVentanaCron('2026-11-15T22:01', '08:00-22:00'), false);

    // 2. Verificar crearDemonioWatcher fuera de horario (23:30 en Europe/Madrid -> 2026-11-15T22:30:00Z en CET)
    const archivoEstado = path.join(tmpDir, 'watcher-estado-71.json');
    const almacenEstado = crearAlmacenEstadoWatcher({
      archivo: archivoEstado,
      ahora: () => new Date('2026-11-15T22:30:00Z'),
    });

    let llamadasFuente = 0;
    const fuenteSimulada = {
      async obtenerLote() {
        llamadasFuente++;
        return {
          fuente: 'moodle',
          completa: false,
          modulos: [],
        };
      },
    };

    const lotesEnviados = [];
    const clienteLifeOs = crearClienteLifeOs({
      lifeosUrl: 'http://127.0.0.1:3000',
      ingestaToken: 'token-test-71',
      fetchFn: async (_url, opts) => {
        lotesEnviados.push(JSON.parse(opts.body));
        return {
          ok: true,
          status: 200,
          async json() {
            return { ok: true, data: { nuevos: 0, cambiados: 0, archivados: 0 } };
          },
        };
      },
    });

    const demonio = crearDemonioWatcher({
      fuentes: [{ nombre: 'moodle', fuente: fuenteSimulada }],
      almacenEstado,
      clienteLifeOs,
      horario: '08:00-22:00',
      intervaloMin: 120,
      simulacro: false,
      ahora: () => new Date('2026-11-15T22:30:00Z'),
    });

    const cicloFueraHorario = await demonio.ejecutarCiclo();
    assert.deepEqual(cicloFueraHorario, {
      ejecutado: false,
      motivo: 'fuera_de_horario',
      resultados: [],
    });
    assert.equal(
      llamadasFuente,
      0,
      'No debe invocar fuente.obtenerLote() cuando está fuera de la ventana horaria'
    );
    assert.equal(lotesEnviados.length, 0);

    // 3. Con { forzar: true } sí ejecuta las fuentes aunque sean las 23:30 en Madrid
    const cicloForzado = await demonio.ejecutarCiclo({ forzar: true });
    assert.equal(cicloForzado.ejecutado, true);
    assert.equal(llamadasFuente, 1, 'Con forzar: true debe consultar la fuente');
    assert.equal(Array.isArray(cicloForzado.resultados), true);
    assert.equal(cicloForzado.resultados.length, 1);
  });

  it('CA-7.2: Reporte de latido y propagación de 2 fallos consecutivos de fuente hacia Life OS (/data/temario.json)', async () => {
    const dirLifeOs = path.join(tmpDir, 'lifeos-data-72');
    const archivoWatcher = path.join(tmpDir, 'watcher-data-72', 'watcher-estado.json');

    const almacenTemario = crearAlmacenTemario(dirLifeOs);
    const almacenEstado = crearAlmacenEstadoWatcher({
      archivo: archivoWatcher,
      ahora: () => new Date('2026-11-15T10:00:00Z'),
    });

    const clienteLifeOs = crearClienteLifeOs({
      lifeosUrl: 'http://lifeos.local',
      ingestaToken: 'token-test-72',
      fetchFn: async (_url, opts) => {
        const body = JSON.parse(opts.body);
        const res = almacenTemario.ingestar(body);
        return {
          ok: true,
          status: 200,
          async json() {
            return { ok: true, data: res };
          },
        };
      },
    });

    let intentosMoodle = 0;
    const fuenteMoodleConFallo = {
      async obtenerLote() {
        intentosMoodle++;
        throw new Error('Moodle Centros no responde (HTTP 503)');
      },
    };

    const demonio = crearDemonioWatcher({
      fuentes: [{ nombre: 'moodle', fuente: fuenteMoodleConFallo }],
      almacenEstado,
      clienteLifeOs,
      horario: '08:00-22:00',
      intervaloMin: 120,
      simulacro: false,
      ahora: () => new Date('2026-11-15T10:00:00Z'), // 11:00 en Madrid
    });

    // 1.er ciclo con fallo en moodle
    const ciclo1 = await demonio.ejecutarCiclo();
    assert.equal(ciclo1.ejecutado, true);
    assert.equal(intentosMoodle, 1);
    assert.equal(almacenEstado.obtenerEstadoFuente('moodle').fallosSeguidos, 1);

    const estadoTemario1 = almacenTemario.obtener();
    assert.equal(estadoTemario1.fuentes.moodle?.ok, false);
    assert.equal(estadoTemario1.fuentes.moodle?.fallosSeguidos, 1);
    assert.match(estadoTemario1.fuentes.moodle?.error || '', /HTTP 503/);

    // 2.º ciclo consecutivo con fallo en moodle
    const ciclo2 = await demonio.ejecutarCiclo();
    assert.equal(ciclo2.ejecutado, true);
    assert.equal(intentosMoodle, 2);

    const estadoWatcherMoodle = almacenEstado.obtenerEstadoFuente('moodle');
    assert.equal(estadoWatcherMoodle.fallosSeguidos, 2);
    assert.match(estadoWatcherMoodle.ultimoError || '', /Moodle Centros no responde \(HTTP 503\)/);

    const estadoTemario2 = almacenTemario.obtener();
    assert.ok(estadoTemario2.fuentes.moodle, 'Debe existir la entrada fuentes.moodle en temario.json');
    assert.equal(estadoTemario2.fuentes.moodle.ok, false);
    assert.equal(estadoTemario2.fuentes.moodle.fallosSeguidos, 2);
    assert.match(
      estadoTemario2.fuentes.moodle.error,
      /Moodle Centros no responde \(HTTP 503\)/
    );
  });

  it('CA-7.3: Alerta Web Push tras 2 fallos seguidos en evaluar y crearPlanificador (respetando silencio y sin repetir el mismo día)', async () => {
    // 1. Con fallosSeguidos: 1 (ok: false), evaluar NO genera aviso err:fuente:...
    const avisosConUnFallo = evaluar({
      ahora: '2026-11-15T09:00',
      copia: {
        ...COPIA_VACIA,
        fuentes: {
          moodle: {
            ultimaPasada: '2026-11-15T08:55:00',
            ok: false,
            fallosSeguidos: 1,
            error: 'Timeout puntual',
          },
        },
      },
      prefs: PREFS_PRUEBA,
      enviados: {},
    });
    assert.equal(
      avisosConUnFallo.find(a => a.clave.startsWith('err:fuente:')),
      undefined,
      'Con 1 solo fallo no debe emitir alerta de fuente'
    );

    // 2. Con fallosSeguidos: 2 (ok: false), durante horario de silencio (02:00 Madrid) NO genera aviso
    const copiaDosFallos = {
      ...COPIA_VACIA,
      fuentes: {
        moodle: {
          ultimaPasada: '2026-11-15T01:55:00',
          ok: false,
          fallosSeguidos: 2,
          error: 'Token inválido o Moodle caído',
        },
      },
    };

    const avisosEnSilencio = evaluar({
      ahora: '2026-11-15T02:00',
      copia: copiaDosFallos,
      prefs: PREFS_PRUEBA,
      enviados: {},
    });
    assert.equal(
      avisosEnSilencio.find(a => a.clave.startsWith('err:fuente:')),
      undefined,
      'Durante el horario de silencio (02:00) no debe emitir la alerta de fuente'
    );

    // 3. Fuera de silencio (09:00 Madrid) con fallosSeguidos: 2 genera el aviso esperado
    const avisosManana = evaluar({
      ahora: '2026-11-15T09:00',
      copia: copiaDosFallos,
      prefs: PREFS_PRUEBA,
      enviados: {},
    });

    const alertaMoodle = avisosManana.find(a => a.clave === 'err:fuente:moodle:2026-11-15');
    assert.ok(alertaMoodle, 'Fuera de silencio debe generar el aviso err:fuente:moodle:2026-11-15');
    assert.equal(alertaMoodle.tipo, 'alerta_fuente');
    assert.equal(alertaMoodle.tab, 'clase');
    assert.equal(alertaMoodle.titulo, '⚠️ Fuente con fallos: moodle');
    assert.match(alertaMoodle.cuerpo, /2 fallos seguidos/);
    assert.match(alertaMoodle.cuerpo, /Token inválido o Moodle caído/);

    // 4. Integración con crearPlanificador.revisar(): envía el push una vez y no lo repite en el mismo día
    const dirPlan = path.join(tmpDir, 'lifeos-plan-73');
    const almacen = crearAlmacen(dirPlan);
    almacen.estado.prefs.resumen = false;
    almacen.estado.prefs.sugerencias = false;

    const almacenTemario = crearAlmacenTemario(dirPlan);
    almacenTemario.ingestar({
      origen: 'moodle',
      completa: false,
      items: [],
      estadoFuente: {
        ok: false,
        fallosSeguidos: 2,
        error: 'Token inválido o Moodle caído',
      },
    });

    const push = pushFalso();
    const reloj = { fecha: new Date('2026-11-15T08:00:00Z') }; // 09:00 en Europe/Madrid (CET)

    const planificador = crearPlanificador({
      almacen,
      almacenTemario,
      directorio: dirPlan,
      llamarGoogle: googleFalso(),
      modelo: null,
      push,
      tz: 'Europe/Madrid',
      ahora: () => reloj.fecha,
    });

    await planificador.revisar();
    const alertasEnviadas1 = push.enviados.filter(a => a.tipo === 'alerta_fuente');
    assert.equal(alertasEnviadas1.length, 1, 'Debe enviar 1 notificación push de alerta_fuente');
    assert.equal(alertasEnviadas1[0].clave, 'err:fuente:moodle:2026-11-15');
    assert.equal(alertasEnviadas1[0].titulo, '⚠️ Fuente con fallos: moodle');

    // Segunda revisión 10 minutos después en el mismo día: no repite el envío
    reloj.fecha = new Date('2026-11-15T08:10:00Z');
    await planificador.revisar();
    const alertasEnviadas2 = push.enviados.filter(a => a.tipo === 'alerta_fuente');
    assert.equal(
      alertasEnviadas2.length,
      1,
      'No debe repetir el aviso err:fuente:moodle:2026-11-15 en el mismo día'
    );
  });

  it('CA-7.4: Servidor HTTP (/healthz y POST /ejecutar autenticado con Bearer token)', async () => {
    const archivoEstado = path.join(tmpDir, 'watcher-estado-74.json');
    const almacenEstado = crearAlmacenEstadoWatcher({
      archivo: archivoEstado,
      ahora: () => new Date('2026-11-15T12:00:00Z'),
    });

    almacenEstado.registrarExitoFuente('moodle', {}, { nuevos: 2, cambiados: 0, archivados: 0, notasNuevas: 0 });

    const llamadasEjecutarCiclo = [];
    const demonioFalso = {
      async ejecutarCiclo(opciones = {}) {
        llamadasEjecutarCiclo.push(opciones);
        return {
          ejecutado: true,
          horaMadrid: '2026-11-15T23:45',
          resultados: [{ nombre: 'moodle', ok: true, enviados: 0 }],
        };
      },
    };

    const servidor = crearServidorWatcher({
      demonio: demonioFalso,
      almacenEstado,
      ingestaToken: 'secreto-test-7',
    });

    const port = await escucharPuertoEfimero(servidor);
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. GET /healthz devuelve 200 con { ok: true, fuentes: ... }
      const respHealth = await fetch(`${baseUrl}/healthz`);
      assert.equal(respHealth.status, 200);
      const bodyHealth = await respHealth.json();
      assert.equal(bodyHealth.ok, true);
      assert.ok(bodyHealth.fuentes && typeof bodyHealth.fuentes === 'object');
      assert.equal(bodyHealth.fuentes.moodle?.fallosSeguidos, 0);

      // 2. POST /ejecutar sin token devuelve 401
      const respSinToken = await fetch(`${baseUrl}/ejecutar`, {
        method: 'POST',
      });
      assert.equal(respSinToken.status, 401);
      assert.equal(llamadasEjecutarCiclo.length, 0);

      // 3. POST /ejecutar con token incorrecto devuelve 401
      const respTokenMalo = await fetch(`${baseUrl}/ejecutar`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-incorrecto',
        },
      });
      assert.equal(respTokenMalo.status, 401);
      assert.equal(llamadasEjecutarCiclo.length, 0);

      // 4. POST /ejecutar con Authorization: Bearer secreto-test-7 ejecuta demonio.ejecutarCiclo({ forzar: true }) y devuelve 200
      const respOk = await fetch(`${baseUrl}/ejecutar`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer secreto-test-7',
        },
      });
      assert.equal(respOk.status, 200);
      const bodyOk = await respOk.json();
      assert.equal(bodyOk.ok, true);
      assert.equal(bodyOk.data?.ejecutado, true);
      assert.equal(llamadasEjecutarCiclo.length, 1);
      assert.deepEqual(llamadasEjecutarCiclo[0], { forzar: true });
    } finally {
      await cerrarServidor(servidor);
    }
  });
});
