'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parsearCorreoClassroom,
  normalizarEstructuraClassroom,
  crearFuenteClassroom,
} = require('../src/fuentes/classroom.js');

const {
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

const RUTA_FIXTURES_CLASSROOM = path.join(__dirname, 'fixtures', 'classroom');

function leerFixtureClassroom(nombre) {
  return JSON.parse(fs.readFileSync(path.join(RUTA_FIXTURES_CLASSROOM, nombre), 'utf8'));
}

describe('Fase 5 — Conector Google Classroom (ClassroomSource — Opción B y Estructura JSON)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-fase5-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('CA-5.1: Normalización de estructura Classroom desde classroom_sample.json y conversión UTC -> Europe/Madrid', () => {
    const datos = leerFixtureClassroom('classroom_sample.json');
    const modulo = normalizarEstructuraClassroom(datos, {
      idModulo: 'ent',
      nombreModulo: 'Entornos y Sintaxis en Python',
    });

    assert.equal(modulo.id, 'ent');
    assert.equal(modulo.nombre, 'Entornos y Sintaxis en Python');
    assert.ok(Array.isArray(modulo.unidades), 'Debe devolver un array de unidades');
    assert.ok(Array.isArray(modulo.calificaciones), 'Debe devolver un array de calificaciones');

    const clavesUnidades = modulo.unidades.map(u => u.k);
    assert.deepEqual(clavesUnidades, ['Inicio', 'U1', 'U2', 'U3', 'U4']);

    const uInicio = modulo.unidades.find(u => u.k === 'Inicio');
    const u1 = modulo.unidades.find(u => u.k === 'U1');
    const u2 = modulo.unidades.find(u => u.k === 'U2');

    // Tarea cw_8001 en U1: dueDate 2026-10-13 + dueTime 21:59 UTC -> 2026-10-13T23:59 Europe/Madrid (CEST)
    const tareaDiagrama = u1.items.find(it => it.ext_id === 'classroom:591028374610:cw:cw_8001');
    assert.ok(tareaDiagrama, 'Debe existir la tarea cw_8001 en U1');
    assert.equal(tareaDiagrama.n, 'Práctica: diagrama de flujo');
    assert.equal(tareaDiagrama.tipo, 'Entrega');
    assert.equal(tareaDiagrama.fecha, '2026-10-13T23:59');

    // Materiales PDF en Inicio (Presentacion.pdf) y U1 (U1_Introduccion.pdf)
    const matPresentacion = uInicio.items.find(it => it.ext_id === 'classroom:591028374610:cwm:cwm_9001');
    assert.ok(matPresentacion, 'Debe existir el material cwm_9001 en Inicio');
    assert.equal(matPresentacion.tipo, 'PDF');
    assert.equal(matPresentacion.drive_url, 'https://drive.google.com/file/d/df_1/view');

    const matIntroU1 = u1.items.find(it => it.ext_id === 'classroom:591028374610:cwm:cwm_9002');
    assert.ok(matIntroU1, 'Debe existir el material cwm_9002 en U1');
    assert.equal(matIntroU1.tipo, 'PDF');
    assert.equal(matIntroU1.drive_url, 'https://drive.google.com/file/d/df_2/view');

    // Material Notebook en U2: 2.3c Operadores lógicos y de bits (2_3c_operadores_logicos.ipynb)
    const matNotebook = u2.items.find(it => it.ext_id === 'classroom:591028374610:cwm:cwm_9003');
    assert.ok(matNotebook, 'Debe existir el material cwm_9003 en U2');
    assert.equal(matNotebook.n, '2.3c Operadores lógicos y de bits');
    assert.equal(matNotebook.tipo, 'Notebook');
    assert.equal(matNotebook.drive_url, 'https://drive.google.com/file/d/df_3/view');

    // Anuncio ann_7001 normalizado con tipo 'Anuncio'
    const todosLosItems = modulo.unidades.flatMap(u => u.items);
    const anuncio = todosLosItems.find(it => it.ext_id === 'classroom:591028374610:ann:ann_7001');
    assert.ok(anuncio, 'Debe existir el anuncio ann_7001');
    assert.equal(anuncio.tipo, 'Anuncio');
    assert.ok(
      anuncio.n.includes('Recordad traer Spyder instalado'),
      'El nombre del anuncio debe contener el texto del anuncio'
    );
  });

  it('CA-5.2: Opción B — Parseo de correos de notificación de Google Classroom desde correos_sample.json', async () => {
    const correos = leerFixtureClassroom('correos_sample.json');
    assert.equal(correos.length, 4);

    // 1. Correo 1 (msg_ent_001): Nueva tarea
    const parsed1 = parsearCorreoClassroom(correos[0], { idModulo: 'ent' });
    assert.equal(parsed1.tipo, 'Entrega');
    assert.equal(parsed1.n, 'Práctica U3: Diccionarios y conjuntos');
    assert.equal(parsed1.unidad, 'U3');
    assert.equal(parsed1.fecha, '2026-11-25T23:59');
    assert.ok(
      parsed1.ext_id === 'classroom:ent:cw:cw_8002' || parsed1.ext_id === 'classroom:ent:item:cw_8002',
      `ext_id inesperado: ${parsed1.ext_id}`
    );

    // 2. Correo 2 (msg_ent_002): Nuevo material (.ipynb en U3 con enlace de Drive)
    const parsed2 = parsearCorreoClassroom(correos[1], { idModulo: 'ent' });
    assert.equal(parsed2.tipo, 'Notebook');
    assert.equal(parsed2.unidad, 'U3');
    assert.equal(parsed2.drive_url, 'https://drive.google.com/file/d/df_u3_1/view');

    // 3. Correo 3 (msg_ent_003): Nuevo anuncio
    const parsed3 = parsearCorreoClassroom(correos[2], { idModulo: 'ent' });
    assert.equal(parsed3.tipo, 'Anuncio');
    assert.ok(
      parsed3.n.includes('El martes que viene resolveremos dudas de colecciones en clase'),
      `Texto de anuncio inesperado: ${parsed3.n}`
    );

    // 4. Correo 4 (msg_ent_004): Con calificación (9,5 / 10 -> 9.5)
    const parsed4 = parsearCorreoClassroom(correos[3], { idModulo: 'ent' });
    assert.equal(parsed4.calificacion, 9.5);
    assert.ok(
      parsed4.n.includes('Práctica: diagrama de flujo'),
      `Nombre de tarea calificada inesperado: ${parsed4.n}`
    );

    // Verificar también a través de crearFuenteClassroom({ leerCorreos })
    const fuente = crearFuenteClassroom({
      idModulo: 'ent',
      nombreModulo: 'Entornos y Sintaxis en Python',
      leerCorreos: async () => correos,
    });
    const lote = await fuente.obtenerLote();
    assert.equal(lote.fuente, 'classroom');
    assert.equal(lote.completa, false);
    assert.equal(lote.modulos.length, 1);

    const modEnt = lote.modulos[0];
    assert.equal(modEnt.id, 'ent');
    const itemsLote = modEnt.unidades.flatMap(u => u.items.map(it => ({ ...it, unidad: u.k })));

    const itemTarea = itemsLote.find(it => it.n === 'Práctica U3: Diccionarios y conjuntos');
    assert.ok(itemTarea, 'El lote debe incluir la nueva entrega de U3');
    assert.equal(itemTarea.tipo, 'Entrega');
    assert.equal(itemTarea.unidad, 'U3');
    assert.equal(itemTarea.fecha, '2026-11-25T23:59');

    const itemNotebook = itemsLote.find(it => it.drive_url === 'https://drive.google.com/file/d/df_u3_1/view');
    assert.ok(itemNotebook, 'El lote debe incluir el nuevo Notebook en U3');
    assert.equal(itemNotebook.tipo, 'Notebook');
    assert.equal(itemNotebook.unidad, 'U3');

    const itemAnuncio = itemsLote.find(it => it.tipo === 'Anuncio');
    assert.ok(itemAnuncio, 'El lote debe incluir el anuncio');
    assert.ok(itemAnuncio.n.includes('El martes que viene resolveremos dudas de colecciones en clase'));

    const tieneCalificacionEnModulo =
      Array.isArray(modEnt.calificaciones) &&
      modEnt.calificaciones.some(c => (c.graderaw === 9.5 || c.calificacion === 9.5));
    const tieneItemCalificado = itemsLote.some(
      it => it.n.includes('Práctica: diagrama de flujo') && it.calificacion === 9.5
    );
    assert.ok(
      tieneCalificacionEnModulo || tieneItemCalificado,
      'El lote debe registrar la calificación 9.5 en calificaciones del módulo o en el ítem de Práctica: diagrama de flujo'
    );
  });

  it('CA-5.3: Lote incremental completa: false en modo correos añade ítems a ent, preserva la nota manual de Práctica: diagrama de flujo y NO archiva ítems existentes', async () => {
    const correos = leerFixtureClassroom('correos_sample.json');
    const dirLifeOs = path.join(tmpDir, 'lifeos-temario');
    const almacenTemario = crearAlmacenTemario(dirLifeOs);

    // Pre-condición: verificar estado inicial de ent en la semilla de Life OS
    const inicial = almacenTemario.obtener();
    const modEntInicial = inicial.modulos.find(m => m.id === 'ent');
    assert.ok(modEntInicial, 'Debe existir el módulo ent en el temario inicial');

    // Simulamos también que un ítem previo de ent ya tenía ext_id de classroom para comprobar que completa: false no lo archiva
    const u2Inicial = modEntInicial.unidades.find(u => u.k === 'U2');
    const itemPrevioConExtId = u2Inicial.items.find(it => it.n === '2.1 Mi primer programa');
    itemPrevioConExtId.ext_id = 'classroom:ent:cwm:previo_2_1';
    itemPrevioConExtId.origen = 'classroom';
    almacenTemario.guardar();

    const fuente = crearFuenteClassroom({
      idModulo: 'ent',
      nombreModulo: 'Entornos y Sintaxis en Python',
      leerCorreos: async () => correos,
    });

    const lote = await fuente.obtenerLote();
    assert.equal(lote.fuente, 'classroom');
    assert.equal(lote.completa, false);

    const resIngesta = almacenTemario.ingestar({
      ...lote,
      origen: lote.fuente,
    });

    assert.equal(resIngesta.archivados, 0, 'Un lote incremental (completa: false) jamás debe archivar ítems');
    assert.ok(resIngesta.nuevos >= 3, 'Debe añadir al menos los 3 ítems nuevos de los correos');

    const actualizado = almacenTemario.obtener();
    const modEnt = actualizado.modulos.find(m => m.id === 'ent');

    // Verificar que los ítems nuevos están en U3
    const u3 = modEnt.unidades.find(u => u.k === 'U3');
    assert.ok(
      u3.items.some(it => it.n === 'Práctica U3: Diccionarios y conjuntos' && it.tipo === 'Entrega'),
      'U3 debe contener la nueva entrega Práctica U3: Diccionarios y conjuntos'
    );
    assert.ok(
      u3.items.some(it => it.tipo === 'Notebook'),
      'U3 debe contener el nuevo Notebook'
    );

    // Verificar que Práctica: diagrama de flujo en U1 conserva su nota manual intacta
    const u1 = modEnt.unidades.find(u => u.k === 'U1');
    const itemDiagrama = u1.items.find(it => it.n === 'Práctica: diagrama de flujo');
    assert.ok(itemDiagrama, 'Debe seguir existiendo Práctica: diagrama de flujo en U1');
    assert.equal(
      itemDiagrama.nota,
      'Consta sin entregar. Se presenta en clase y necesita validación previa del profesor.'
    );

    // Verificar que NINGÚN ítem de ent ha sido marcado como archivado
    const todosItemsEnt = modEnt.unidades.flatMap(u => u.items);
    const algunArchivado = todosItemsEnt.some(it => Boolean(it.archivado));
    assert.equal(algunArchivado, false, 'Ningún ítem de ent debe quedar archivado');
  });

  it('CA-5.4: Idempotencia con ejecutarPasadaFuente en dos pasadas seguidas con los mismos correos de correos_sample.json', async () => {
    const correos = leerFixtureClassroom('correos_sample.json');
    const archivoEstado = path.join(tmpDir, 'watcher-estado.json');
    const almacenEstado = crearAlmacenEstadoWatcher({
      archivo: archivoEstado,
      ahora: () => new Date('2026-11-15T14:00:00Z'),
    });

    const llamadasHttp = [];
    const fetchSimulado = async (url, opts = {}) => {
      llamadasHttp.push({
        url: String(url),
        method: opts.method,
        body: opts.body ? JSON.parse(opts.body) : null,
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, data: { nuevos: 3, cambiados: 1, archivados: 0 } };
        },
        async text() {
          return JSON.stringify({ ok: true });
        },
      };
    };

    const clienteLifeOs = crearClienteLifeOs({
      lifeosUrl: 'http://127.0.0.1:3000',
      ingestaToken: 'token-classroom-test',
      fetchFn: fetchSimulado,
    });

    const fuente = crearFuenteClassroom({
      idModulo: 'ent',
      nombreModulo: 'Entornos y Sintaxis en Python',
      leerCorreos: async () => structuredClone(correos),
    });

    // 1.ª pasada: detecta cambios y los envía a Life OS
    const pasada1 = await ejecutarPasadaFuente({
      nombreFuente: 'classroom',
      fuente,
      almacenEstado,
      clienteLifeOs,
    });

    assert.equal(pasada1.ok, true);
    assert.equal(pasada1.hayCambios, true);
    assert.equal(pasada1.enviado, true);
    assert.equal(llamadasHttp.length, 1);

    // 2.ª pasada seguida con los mismos correos: idempotencia total
    llamadasHttp.length = 0;
    const pasada2 = await ejecutarPasadaFuente({
      nombreFuente: 'classroom',
      fuente,
      almacenEstado,
      clienteLifeOs,
    });

    assert.equal(pasada2.ok, true);
    assert.equal(pasada2.hayCambios, false);
    assert.deepEqual(pasada2.resumen, {
      nuevos: 0,
      cambiados: 0,
      archivados: 0,
      notasNuevas: 0,
    });
    assert.equal(pasada2.enviado, false);
    assert.equal(llamadasHttp.length, 0);
  });
});
