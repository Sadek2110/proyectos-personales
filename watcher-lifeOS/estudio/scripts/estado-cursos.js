'use strict';
// Estado de entregas y tests de ambos cursos, y descarga de material.
// Solo lectura. Reutiliza los wstoken guardados en course-watcher/.data (no hace login,
// no imprime tokens). Peticiones estrictamente secuenciales.
//
// Uso:
//   node estudio/scripts/estado-cursos.js                 -> tabla de pendientes + estudio/estado-cursos.json
//   node estudio/scripts/estado-cursos.js material <curso> "<texto del item>"
//        -> descarga los archivos del item a estudio/material/<curso>/
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ESTADO_WATCHER = path.join(RAIZ, 'course-watcher', '.data', 'watcher-estado.json');
const { normalizarCursoMoodle } = require(path.join(RAIZ, 'course-watcher', 'src', 'normalizador.js'));
const { CURSOS_PYTHON_MOODLE, CURSOS_CIBER_MOODLE } = require(path.join(RAIZ, 'course-watcher', 'src', 'fuentes', 'moodle.js'));

const tokens = JSON.parse(fs.readFileSync(ESTADO_WATCHER, 'utf8'));
const FUENTES = [
  { clave: 'python', base: 'https://educacionadistancia.juntadeandalucia.es/centros/malaga', token: tokens.moodleToken, cursos: CURSOS_PYTHON_MOODLE },
  { clave: 'ciber', base: 'https://www.mecd.es/aulavirtualfpceuta', token: tokens.ciberToken, cursos: CURSOS_CIBER_MOODLE },
];

async function llamarWs(fuente, wsfunction, params = {}) {
  const body = new URLSearchParams({ wstoken: fuente.token, moodlewsrestformat: 'json', wsfunction, ...params });
  const r = await fetch(`${fuente.base}/webservice/rest/server.php`, { method: 'POST', body, signal: AbortSignal.timeout(30000) });
  return r.json();
}

const fecha = ts => (ts ? new Date(ts * 1000).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16) : null);
const codigoDe = (fuente, id) => fuente.cursos.find(c => c.id === Number(id))?.codigo || String(id);

async function estado() {
  const pendientes = [];
  for (const fuente of FUENTES) {
    const info = await llamarWs(fuente, 'core_webservice_get_site_info');
    if (info.errorcode) {
      console.error(`[${fuente.clave}] token caducado (${info.errorcode}). Ejecuta el watcher para renovarlo.`);
      continue;
    }
    const params = {};
    fuente.cursos.forEach((c, i) => (params[`courseids[${i}]`] = String(c.id)));

    const asignaciones = await llamarWs(fuente, 'mod_assign_get_assignments', params);
    for (const curso of asignaciones.courses || []) {
      for (const a of curso.assignments) {
        const s = await llamarWs(fuente, 'mod_assign_get_submission_status', { assignid: String(a.id) });
        const nota = s.feedback?.gradefordisplay ? String(s.feedback.gradefordisplay).replace(/<[^>]+>/g, '').trim() : null;
        pendientes.push({
          curso: fuente.clave, modulo: codigoDe(fuente, curso.id), tipo: 'Entrega', nombre: a.name,
          fecha: fecha(a.duedate), estado: s.lastattempt?.submission?.status || (s.errorcode ? 'no-visible' : '?'), nota,
        });
      }
    }
    const tests = await llamarWs(fuente, 'mod_quiz_get_quizzes_by_courses', params);
    for (const q of tests.quizzes || []) {
      const intentos = await llamarWs(fuente, 'mod_quiz_get_user_attempts', { quizid: String(q.id), status: 'all' });
      const mejor = await llamarWs(fuente, 'mod_quiz_get_user_best_grade', { quizid: String(q.id) });
      const n = (intentos.attempts || []).length;
      pendientes.push({
        curso: fuente.clave, modulo: codigoDe(fuente, q.course), tipo: 'Test', nombre: q.name,
        fecha: fecha(q.timeclose), estado: n ? `${n} intento(s)` : 'sin hacer', nota: mejor.hasgrade ? `${mejor.grade}/${q.grade}` : null,
      });
    }
  }
  pendientes.sort((a, b) => String(a.fecha || '9999').localeCompare(String(b.fecha || '9999')));
  fs.writeFileSync(path.join(RAIZ, 'estudio', 'estado-cursos.json'), JSON.stringify({ generado: new Date().toISOString(), pendientes }, null, 1));
  for (const p of pendientes) {
    console.log([p.curso.padEnd(6), p.modulo.padEnd(4), p.tipo.padEnd(7), (p.fecha || '—').padEnd(16), p.estado.padEnd(11), (p.nota || '').padEnd(14), p.nombre.slice(0, 70)].join(' '));
  }
}

async function material(codigo, texto) {
  const fuente = FUENTES.find(f => f.cursos.some(c => c.codigo === codigo));
  if (!fuente) throw new Error(`Curso desconocido: ${codigo}`);
  const curso = fuente.cursos.find(c => c.codigo === codigo);
  const secciones = await llamarWs(fuente, 'core_course_get_contents', { courseid: String(curso.id) });
  const modulo = normalizarCursoMoodle({ courseId: curso.id, idModulo: codigo, nombreModulo: curso.nombre, origen: fuente.clave, secciones, assignments: [], quizzes: [], grades: [] });
  const buscado = texto.toLowerCase();
  const items = modulo.unidades.flatMap(u => u.items).filter(i => i.n.toLowerCase().includes(buscado));
  if (!items.length) return console.log('Ningún item coincide.');
  const destino = path.join(RAIZ, 'estudio', 'material', codigo);
  fs.mkdirSync(destino, { recursive: true });
  for (const item of items) {
    if (!item.archivos?.length) { console.log(`- ${item.n}: sin archivos (${item.url})`); continue; }
    for (const a of item.archivos) {
      const url = a.fileurl + (a.fileurl.includes('?') ? '&' : '?') + 'token=' + fuente.token;
      const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
      const nombre = a.filename.replace(/[/\\?%*:|"<>]/g, ' ');
      fs.writeFileSync(path.join(destino, nombre), buf);
      console.log(`- ${path.join('estudio', 'material', codigo, nombre)} (${buf.length} bytes)`);
    }
  }
}

const [modo, ...args] = process.argv.slice(2);
(modo === 'material' ? material(args[0], args.slice(1).join(' ')) : estado()).catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
