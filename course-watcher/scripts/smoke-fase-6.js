// Smoke test real de la Fase 6 (fuera de CI):
// Conecta con Aula Virtual FP Ceuta (mecd.es/aulavirtualfpceuta) usando crearFuenteCiberseguridad,
// persiste/reutiliza el wstoken en .data/watcher-estado.json y verifica los 6 módulos.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { crearFuenteCiberseguridad } = require('../src');

const DATA_DIR = path.join(__dirname, '..', process.env.DATA_DIR || '.data');
const ESTADO_PATH = path.join(DATA_DIR, 'watcher-estado.json');
const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(ENV_PATH);
}

function leerEstado() {
  try {
    if (fs.existsSync(ESTADO_PATH)) {
      return JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf8'));
    }
  } catch {
    // Ignorar si está corrupto
  }
  return {};
}

function guardarEstado(parcial) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const actual = leerEstado();
  const nuevo = { ...actual, ...parcial, actualizado: new Date().toISOString() };
  fs.writeFileSync(ESTADO_PATH, JSON.stringify(nuevo, null, 2));
}

async function main() {
  const estadoInicial = leerEstado();
  const tieneTokenPrevio = Boolean(estadoInicial.ciberToken);

  if (!tieneTokenPrevio && (!process.env.CIBER_USER || !process.env.CIBER_PASS)) {
    console.error('Faltan CIBER_USER y CIBER_PASS (y no hay token previo en .data/watcher-estado.json).');
    process.exit(1);
  }

  const fuente = crearFuenteCiberseguridad({
    baseUrl: process.env.CIBER_URL || 'https://www.mecd.es/aulavirtualfpceuta',
    user: process.env.CIBER_USER,
    pass: process.env.CIBER_PASS,
    leerToken: () => leerEstado().ciberToken || null,
    guardarToken: token => guardarEstado({ ciberToken: token }),
  });

  console.log(`1. Ejecutando obtenerLote() contra Aula Virtual FP Ceuta (token previo en caché: ${tieneTokenPrevio ? 'SÍ' : 'NO'})...`);
  const lote = await fuente.obtenerLote();

  console.log(`2. Lote obtenido: fuente=${lote.fuente}, completa=${lote.completa}, módulos=${lote.modulos.length}`);
  for (const m of lote.modulos) {
    const totalItems = m.unidades.reduce((acc, u) => acc + u.items.length, 0);
    const entregas = m.unidades.flatMap(u => u.items).filter(i => i.tipo === 'Entrega').length;
    console.log(
      `   - [${m.id}] ${m.nombre}: ${m.unidades.length} unidades (${m.unidades.map(u => u.k).join(', ')}), ${totalItems} ítems (${entregas} entregas), ${m.calificaciones.length} notas publicadas.`
    );
  }

  const estadoFinal = leerEstado();
  console.log(`3. Token ciber persistido en .data/watcher-estado.json: ${estadoFinal.ciberToken ? '✅ SÍ (longitud ' + estadoFinal.ciberToken.length + ')' : '❌ NO'}`);
}

main().catch(err => {
  console.error('Error en smoke test Fase 6:', err.message);
  process.exitCode = 1;
});
