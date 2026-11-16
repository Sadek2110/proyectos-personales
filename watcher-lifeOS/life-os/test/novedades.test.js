'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, describe, test } = require('node:test');
const { crearAlmacen } = require('../agente/almacen.js');
const { actividadesPendientes, cargarTemario } = require('../agente/herramientas.js');
const { crearPlanificador, evaluar } = require('../agente/planificador.js');
const { crearAlmacenTemario } = require('../agente/temario.js');

const TZ = 'Europe/Madrid';
const PREFS = { resumen: false, horaResumen: '08:00', eventos: true, minutosEvento: 15, tareas: true, sugerencias: false };
const COPIA_VACIA = { eventos: [], tareas: [], compras: [], actividades: [], novedades: [] };

const temporales = [];
function crearCarpetaTemp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-novedades-'));
  temporales.push(dir);
  return dir;
}

afterEach(() => {
  while (temporales.length) {
    const dir = temporales.pop();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

function googleFalso() {
  return async nombre => {
    switch (nombre) {
      case 'obtenerDatos': return { compras: [], tareas: [] };
      case 'obtenerEventos': return [];
      case 'obtenerCalendarios': return [];
      case 'obtenerRutas': return [];
      case 'obtenerClase': return {};
      default: return true;
    }
  };
}

function pushFalso() {
  const enviados = [];
  return {
    enviados,
    hayDispositivos: () => true,
    enviar: async a => {
      enviados.push(a);
      return { entregados: 1, reintentar: false };
    },
  };
}

describe('Fase 4 — Avisos Web Push de Novedad en Life OS', () => {
  test('CA-4.1: entrega y prueba nuevas generan aviso de novedad y entran en los hitos de clase (3d / 24h / 3h)', async () => {
    const dir = crearCarpetaTemp();
    const almacenTemario = crearAlmacenTemario(dir);
    const temarioMjs = await cargarTemario();

    const r = almacenTemario.ingestar({
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2005:cm:60001',
          modulo: 'est',
          unidad: 'UD3',
          unidad_titulo: 'Sentencias iterativas',
          n: 'Entrega extraordinaria UD3',
          tipo: 'Entrega',
          fecha: '2026-11-06T23:59',
        },
        {
          ext_id: 'moodle:2005:cm:60002',
          modulo: 'est',
          unidad: 'UD3',
          unidad_titulo: 'Sentencias iterativas',
          n: 'Cuestionario evaluable UD3',
          tipo: 'Prueba',
          fecha: '2026-11-05T10:00',
        },
      ],
    });
    assert.equal(r.nuevos, 2);

    const estadoTemario = almacenTemario.obtener();
    const actividades = actividadesPendientes(temarioMjs, {}, [], estadoTemario.modulos, estadoTemario.mapaIds);
    const avisos = evaluar({
      ahora: '2026-11-04T10:00',
      copia: { ...COPIA_VACIA, actividades, novedades: estadoTemario.novedades },
      prefs: PREFS,
      enviados: {},
    });

    const avisoEntrega = avisos.find(a => a.clave === 'nov:act:moodle:2005:cm:60001');
    assert.ok(avisoEntrega, 'Debe emitir aviso de novedad para la nueva entrega');
    assert.equal(avisoEntrega.tipo, 'novedad');
    assert.equal(avisoEntrega.tab, 'clase');
    assert.match(avisoEntrega.titulo, /^📌 Nueva entrega: Entrega extraordinaria UD3/);
    assert.match(avisoEntrega.cuerpo, /Estructuras/);

    const avisoPrueba = avisos.find(a => a.clave === 'nov:act:moodle:2005:cm:60002');
    assert.ok(avisoPrueba, 'Debe emitir aviso de novedad para la nueva prueba');
    assert.equal(avisoPrueba.tipo, 'novedad');
    assert.equal(avisoPrueba.tab, 'clase');
    assert.match(avisoPrueba.titulo, /^📌 Nueva prueba: Cuestionario evaluable UD3/);

    const hitoEntrega3d = avisos.find(a => a.clave === `cl:moodle:2005:cm:60001:${3 * 24 * 60}`);
    assert.ok(hitoEntrega3d, 'La nueva entrega debe entrar automáticamente en el hito de 3 días');
    assert.equal(hitoEntrega3d.tipo, 'clase');

    const hitoPrueba24h = avisos.find(a => a.clave === `cl:moodle:2005:cm:60002:${24 * 60}`);
    assert.ok(hitoPrueba24h, 'La nueva prueba a 24h debe entrar automáticamente en el hito de 24h');
  });

  test('CA-4.2: cambio de fecha de una entrega existente registra evento cambio_fecha y emite aviso ⚠️ Cambio de fecha', () => {
    const dir = crearCarpetaTemp();
    const almacenTemario = crearAlmacenTemario(dir);

    almacenTemario.ingestar({
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2005:cm:48213',
          modulo: 'est',
          unidad: 'UD2',
          n: 'Proyecto U2: calculadora de precio final',
          tipo: 'Entrega',
          fecha: '2026-11-06T23:59',
        },
      ],
    });

    almacenTemario.ingestar({
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2005:cm:48213',
          modulo: 'est',
          unidad: 'UD2',
          n: 'Proyecto U2: calculadora de precio final',
          tipo: 'Entrega',
          fecha: '2026-11-08T23:59',
        },
      ],
    });

    const estadoTemario = almacenTemario.obtener();
    const evCambio = estadoTemario.novedades.find(
      n => n.ext_id === 'moodle:2005:cm:48213' && n.evento === 'cambio_fecha',
    );
    assert.ok(evCambio, 'Debe registrar un evento cambio_fecha en novedades');
    assert.equal(evCambio.fechaAnterior, '2026-11-06T23:59');
    assert.equal(evCambio.fechaItem, '2026-11-08T23:59');

    const avisos = evaluar({
      ahora: '2026-11-04T11:00',
      copia: { ...COPIA_VACIA, novedades: estadoTemario.novedades },
      prefs: PREFS,
      enviados: {},
    });

    const avisoCambio = avisos.find(a => a.clave === 'nov:fec:moodle:2005:cm:48213:2026-11-08T23:59');
    assert.ok(avisoCambio, 'Debe generar aviso con clave nov:fec:<ext_id>:<nuevaFecha>');
    assert.equal(avisoCambio.tipo, 'novedad');
    assert.equal(avisoCambio.tab, 'clase');
    assert.match(avisoCambio.titulo, /^⚠️ Cambio de fecha: Proyecto U2: calculadora de precio final/);
    assert.match(avisoCambio.cuerpo, /08\/11 a las 23:59/);
  });

  test('CA-4.3: 3 materiales nuevos (PDF, Notebook, Vídeo) en poo emiten un único aviso agrupado "3 novedades en POO"', () => {
    const dir = crearCarpetaTemp();
    const almacenTemario = crearAlmacenTemario(dir);

    almacenTemario.ingestar({
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2475:cm:70001',
          modulo: 'poo',
          unidad: 'T2',
          unidad_titulo: 'Herencia y polimorfismo',
          n: 'Apuntes de Herencia en Python',
          tipo: 'PDF',
        },
        {
          ext_id: 'moodle:2475:cm:70002',
          modulo: 'poo',
          unidad: 'T2',
          unidad_titulo: 'Herencia y polimorfismo',
          n: 'Ejercicios prácticos T2',
          tipo: 'Notebook',
        },
        {
          ext_id: 'moodle:2475:cm:70003',
          modulo: 'poo',
          unidad: 'Vídeos',
          unidad_titulo: 'Clases grabadas',
          n: 'Clase grabada: polimorfismo (4 nov)',
          tipo: 'Vídeo',
        },
      ],
    });

    const avisos = evaluar({
      ahora: '2026-11-04T12:00',
      copia: { ...COPIA_VACIA, novedades: almacenTemario.obtener().novedades },
      prefs: PREFS,
      enviados: {},
    });

    const avisosNovedad = avisos.filter(a => a.tipo === 'novedad');
    assert.equal(avisosNovedad.length, 1, 'Debe agrupar los 3 materiales del mismo módulo en un único aviso');
    const grupo = avisosNovedad[0];
    assert.equal(grupo.titulo, '3 novedades en POO');
    assert.equal(grupo.tab, 'clase');
    assert.match(grupo.cuerpo, /Apuntes de Herencia en Python/);
    assert.match(grupo.cuerpo, /Ejercicios prácticos T2/);
    assert.match(grupo.cuerpo, /Clase grabada: polimorfismo \(4 nov\)/);
  });

  test('CA-4.4: anuncio nuevo genera "📢 Anuncio en ..." y calificación publicada genera "🎓 Nota publicada en ..."', () => {
    const dir = crearCarpetaTemp();
    const almacenTemario = crearAlmacenTemario(dir);

    // 1) Anuncio e ítem con calificación directa
    almacenTemario.ingestar({
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2475:cm:80001',
          modulo: 'poo',
          unidad: 'General',
          n: 'Cambio de aula para el examen parcial',
          tipo: 'Anuncio',
        },
        {
          ext_id: 'moodle:2475:cm:80002',
          modulo: 'poo',
          unidad: 'T1',
          n: 'Tarea 1: clases y objetos',
          tipo: 'Entrega',
          calificacion: 9.5,
        },
      ],
    });

    // 2) Calificación vía modulos[].calificaciones (formato jerárquico de course-watcher)
    almacenTemario.ingestar({
      origen: 'moodle',
      completa: false,
      modulos: [
        {
          id: 'est',
          unidades: [],
          calificaciones: [
            {
              ext_id: 'moodle:2005:grade:141499',
              itemname: 'Prueba U2',
              graderaw: 10,
            },
          ],
        },
      ],
    });

    const avisos = evaluar({
      ahora: '2026-11-04T12:30',
      copia: { ...COPIA_VACIA, novedades: almacenTemario.obtener().novedades },
      prefs: PREFS,
      enviados: {},
    });

    const avisoAnuncio = avisos.find(a => a.clave === 'nov:anu:moodle:2475:cm:80001');
    assert.ok(avisoAnuncio, 'Debe generar aviso con clave nov:anu:<ext_id>');
    assert.equal(avisoAnuncio.tipo, 'novedad');
    assert.match(avisoAnuncio.titulo, /^📢 Anuncio en POO/);
    assert.equal(avisoAnuncio.cuerpo, 'Cambio de aula para el examen parcial');

    const avisoNotaItem = avisos.find(a => a.clave === 'nov:not:moodle:2475:cm:80002:9.5');
    assert.ok(avisoNotaItem, 'Debe generar aviso de nota cuando un item trae calificacion');
    assert.match(avisoNotaItem.titulo, /^🎓 Nota publicada en POO/);

    const avisoNotaModulo = avisos.find(a => a.clave === 'nov:not:moodle:2005:grade:141499:10');
    assert.ok(avisoNotaModulo, 'Debe generar aviso con clave nov:not:moodle:2005:grade:141499:10');
    assert.equal(avisoNotaModulo.tipo, 'novedad');
    assert.match(avisoNotaModulo.titulo, /^🎓 Nota publicada en Estructuras/);
    assert.match(avisoNotaModulo.cuerpo, /Prueba U2.*10/);
  });

  test('CA-4.5: horario de silencio (23:00-07:30), agrupación matutina y no repetición en planificador.revisar()', async () => {
    const dir = crearCarpetaTemp();
    const almacen = crearAlmacen(dir);
    almacen.estado.prefs.resumen = false;
    almacen.estado.prefs.sugerencias = false;

    const almacenTemario = crearAlmacenTemario(dir);
    const push = pushFalso();
    const reloj = { fecha: new Date('2026-11-04T00:00:00Z') }; // 01:00 en Madrid (en silencio)

    const planificador = crearPlanificador({
      almacen,
      almacenTemario,
      directorio: dir,
      llamarGoogle: googleFalso(),
      modelo: null,
      push,
      tz: TZ,
      ahora: () => reloj.fecha,
    });

    // A las 01:00 (Madrid) llega 1 PDF en poo
    almacenTemario.ingestar({
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2475:cm:90001',
          modulo: 'poo',
          unidad: 'T2',
          n: 'Guía de estilo PEP8',
          tipo: 'PDF',
        },
      ],
    });
    await planificador.revisar();
    assert.deepEqual(
      push.enviados.filter(a => a.tipo === 'novedad'),
      [],
      'A las 01:00 (horario de silencio) no debe enviar ningún push de novedad',
    );

    // A las 04:00 (Madrid = 03:00Z) llegan 2 Notebooks en poo
    reloj.fecha = new Date('2026-11-04T03:00:00Z');
    almacenTemario.ingestar({
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2475:cm:90002',
          modulo: 'poo',
          unidad: 'T2',
          n: 'Notebook 1: Clases abstractas',
          tipo: 'Notebook',
        },
        {
          ext_id: 'moodle:2475:cm:90003',
          modulo: 'poo',
          unidad: 'T2',
          n: 'Notebook 2: Interfaces y protocolos',
          tipo: 'Notebook',
        },
      ],
    });
    await planificador.revisar();
    assert.deepEqual(
      push.enviados.filter(a => a.tipo === 'novedad'),
      [],
      'A las 04:00 (horario de silencio) sigue sin enviar ningún push de novedad',
    );

    // A las 08:00 (Madrid = 07:00Z) termina el silencio y se agrupa todo lo nocturno
    reloj.fecha = new Date('2026-11-04T07:00:00Z');
    await planificador.revisar();
    const enviadosManana = push.enviados.filter(a => a.tipo === 'novedad');
    assert.equal(enviadosManana.length, 1, 'A las 08:00 debe enviar un único push agrupado');
    assert.equal(enviadosManana[0].titulo, '3 novedades en POO');
    assert.match(enviadosManana[0].cuerpo, /Guía de estilo PEP8/);
    assert.match(enviadosManana[0].cuerpo, /Notebook 1: Clases abstractas/);
    assert.match(enviadosManana[0].cuerpo, /Notebook 2: Interfaces y protocolos/);

    // A las 08:05 (Madrid = 07:05Z) no repite ningún aviso de novedad
    reloj.fecha = new Date('2026-11-04T07:05:00Z');
    await planificador.revisar();
    assert.equal(
      push.enviados.filter(a => a.tipo === 'novedad').length,
      1,
      'A las 08:05 no debe repetir ningún aviso ya enviado',
    );

    // A las 10:00 (Madrid = 09:00Z) llega un 4.º material nuevo en poo
    reloj.fecha = new Date('2026-11-04T09:00:00Z');
    almacenTemario.ingestar({
      origen: 'moodle',
      completa: false,
      items: [
        {
          ext_id: 'moodle:2475:cm:90004',
          modulo: 'poo',
          unidad: 'T2',
          n: 'Vídeo: resolución de dudas T2',
          tipo: 'Vídeo',
        },
      ],
    });
    await planificador.revisar();
    const todosNovedad = push.enviados.filter(a => a.tipo === 'novedad');
    assert.equal(todosNovedad.length, 2, 'A las 10:00 debe enviar un nuevo aviso solo para el 4.º material');
    assert.equal(todosNovedad[1].titulo, '1 novedad en POO');
    assert.equal(todosNovedad[1].cuerpo, 'Vídeo: resolución de dudas T2');
  });
});
