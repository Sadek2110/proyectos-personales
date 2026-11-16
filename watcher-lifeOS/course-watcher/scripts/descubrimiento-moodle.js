 // Script de descubrimiento para Fase 0: obtiene el wstoken vía CAS -> launch.php
// en Moodle Centros, lista las funciones habilitadas, comprueba todos los cursos
// matriculados y guarda fixtures 100% anonimizadas en test/fixtures/moodle/.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = 'https://educacionadistancia.juntadeandalucia.es/centros/malaga';
const CURSOS = [
  { id: 2005, codigo: 'est', nombre: 'Estructuras de control en Python' },
  { id: 2475, codigo: 'poo', nombre: 'Programación orientada a objetos' },
  { id: 2006, codigo: 'ana', nombre: 'Análisis de datos en Python' },
];

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  addFromHeaders(headers, url) {
    const host = new URL(url).hostname;
    const setCookies = headers.getSetCookie ? headers.getSetCookie() : [];
    for (const sc of setCookies) {
      const [pair] = sc.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const name = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1).trim();
        this.cookies.set(`${host}:${name}`, { host, name, val });
      }
    }
  }
  headerFor(url) {
    const host = new URL(url).hostname;
    const parts = [];
    for (const { host: h, name, val } of this.cookies.values()) {
      if (host === h || host.endsWith('.' + h) || h.endsWith('.' + host)) {
        parts.push(`${name}=${val}`);
      }
    }
    return parts.join('; ');
  }
}

async function fetchConCookies(jar, url, opts = {}) {
  let actual = url;
  let method = opts.method || 'GET';
  let body = opts.body;
  let headers = { ...(opts.headers || {}) };

  for (let i = 0; i < 12; i++) {
    const cookieHeader = jar.headerFor(actual);
    if (cookieHeader) headers.Cookie = cookieHeader;
    else delete headers.Cookie;

    const r = await fetch(actual, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
    jar.addFromHeaders(r.headers, actual);
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) {
      actual = new URL(loc, actual).toString();
      if (actual.startsWith('moodlemobile://')) {
        return { moodleRedirect: actual };
      }
      method = 'GET';
      body = undefined;
      delete headers['Content-Type'];
      continue;
    }
    return { url: actual, status: r.status, text: await r.text(), headers: r.headers };
  }
  throw new Error('Demasiadas redirecciones en CAS');
}

async function obtenerTokenCas(user, pass) {
  const jar = new CookieJar();
  const paso1 = await fetchConCookies(jar, `${BASE_URL}/login/index.php?authCAS=CAS`);
  const inputs = {};
  const regex = /<input[^>]+name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = regex.exec(paso1.text)) !== null) {
    inputs[m[1]] = m[2];
  }
  const actionMatch = /<form[^>]+action=["']([^"']+)["']/i.exec(paso1.text);
  const postUrl = actionMatch ? new URL(actionMatch[1].replace(/&amp;/g, '&'), paso1.url).toString() : paso1.url;

  const form = new URLSearchParams({
    ...inputs,
    username: user,
    password: pass,
    _eventId: 'submit',
  });

  const paso2 = await fetchConCookies(jar, postUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  if (!paso2.url || !paso2.url.includes('/centros/')) {
    throw new Error('Credenciales rechazadas por CAS o requiere intervención.');
  }

  const passport = String(Math.floor(Math.random() * 100000));
  const launch = await fetchConCookies(
    jar,
    `${BASE_URL}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`
  );
  if (!launch.moodleRedirect) {
    throw new Error('launch.php no devolvió esquema moodlemobile://');
  }
  const b64 = launch.moodleRedirect.split('token=')[1];
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  const [, wstoken] = decoded.split(':::');
  if (!wstoken) throw new Error('No se pudo decodificar el wstoken');
  return wstoken;
}

async function llamarWs(token, wsfunction, params = {}) {
  const body = new URLSearchParams({
    wstoken: token,
    moodlewsrestformat: 'json',
    wsfunction,
    ...params,
  });
  const r = await fetch(`${BASE_URL}/webservice/rest/server.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });
  return r.json();
}

function anonimizar(obj, token, siteInfo) {
  let texto = JSON.stringify(obj);
  if (token) texto = texto.split(token).join('TOKEN_ANONIMIZADO');
  if (siteInfo?.fullname) texto = texto.split(siteInfo.fullname).join('Alumno Demo');
  if (siteInfo?.firstname) texto = texto.split(siteInfo.firstname).join('Alumno');
  if (siteInfo?.lastname) texto = texto.split(siteInfo.lastname).join('Demo');
  if (siteInfo?.username) texto = texto.split(siteInfo.username).join('alumno_demo');
  if (siteInfo?.idnumber) texto = texto.split(siteInfo.idnumber).join('00000000X');
  texto = texto.replace(/\b\d{8}[a-zA-Z]\b/g, '00000000X');
  return JSON.parse(texto);
}

async function main() {
  const user = process.env.MOODLE_USER;
  const pass = process.env.MOODLE_PASS;
  if (!user || !pass) {
    console.error('Faltan MOODLE_USER o MOODLE_PASS.');
    process.exit(1);
  }

  console.log('1. Obteniendo wstoken vía SSO CAS -> launch.php...');
  const token = await obtenerTokenCas(user, pass);
  console.log('   ✅ Token obtenido (longitud:', token.length, ')');

  const siteInfo = await llamarWs(token, 'core_webservice_get_site_info');
  const funciones = (siteInfo.functions || []).map(f => f.name);
  const funcionesClave = [
    'core_enrol_get_users_courses',
    'core_course_get_contents',
    'core_course_get_updates_since',
    'mod_assign_get_assignments',
    'mod_quiz_get_quizzes_by_courses',
    'mod_forum_get_forums_by_courses',
    'mod_forum_get_forum_discussions',
    'gradereport_user_get_grade_items',
    'core_calendar_get_calendar_upcoming_view',
  ];

  console.log('2. Funciones clave disponibles:');
  for (const fn of funcionesClave) {
    console.log(`   - ${fn}: ${funciones.includes(fn) ? '✅ SÍ' : '❌ NO'}`);
  }

  // Listar todos los cursos en los que está matriculado el usuario
  const misCursos = await llamarWs(token, 'core_enrol_get_users_courses', { userid: String(siteInfo.userid) });
  console.log('3. Cursos matriculados en Moodle Centros:');
  if (Array.isArray(misCursos)) {
    for (const mc of misCursos) {
      console.log(`   - [${mc.id}] ${mc.fullname} (${mc.shortname})`);
    }
  }

  const outDir = path.join(__dirname, '..', 'test', 'fixtures', 'moodle');
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, 'site_info.json'),
    JSON.stringify({
      sitename: siteInfo.sitename,
      release: siteInfo.release,
      version: siteInfo.version,
      userid: 99999,
      username: 'alumno_demo',
      fullname: 'Alumno Demo',
      functions: siteInfo.functions || [],
    }, null, 2)
  );

  if (Array.isArray(misCursos)) {
    fs.writeFileSync(
      path.join(outDir, 'enrolled_courses.json'),
      JSON.stringify(anonimizar(misCursos, token, siteInfo), null, 2)
    );
  }

  for (const c of CURSOS) {
    console.log(`4. Descargando estructura de curso ${c.id} (${c.codigo})...`);
    const secciones = await llamarWs(token, 'core_course_get_contents', { courseid: String(c.id) });
    if (Array.isArray(secciones)) {
      const limpio = anonimizar(secciones, token, siteInfo);
      fs.writeFileSync(path.join(outDir, `course_${c.id}_contents.json`), JSON.stringify(limpio, null, 2));
      const totalMods = limpio.reduce((acc, s) => acc + (s.modules?.length || 0), 0);
      console.log(`   ✅ Curso ${c.id}: ${limpio.length} secciones, ${totalMods} módulos guardados.`);
    }
  }

  console.log('5. Descargando asignaciones (mod_assign_get_assignments)...');
  const assignRaw = await llamarWs(token, 'mod_assign_get_assignments', {
    'courseids[0]': '2005',
    'courseids[1]': '2475',
    'courseids[2]': '2006',
  });
  if (assignRaw && assignRaw.courses) {
    const limpio = anonimizar(assignRaw, token, siteInfo);
    fs.writeFileSync(path.join(outDir, 'assignments.json'), JSON.stringify(limpio, null, 2));
    for (const c of limpio.courses) {
      console.log(`   ✅ Curso ${c.id} (${c.shortname}): ${(c.assignments || []).length} entregas.`);
    }
  }

  if (funciones.includes('mod_quiz_get_quizzes_by_courses')) {
    console.log('6. Descargando cuestionarios (mod_quiz_get_quizzes_by_courses)...');
    const quizRaw = await llamarWs(token, 'mod_quiz_get_quizzes_by_courses', {
      'courseids[0]': '2005',
      'courseids[1]': '2475',
      'courseids[2]': '2006',
    });
    if (quizRaw && quizRaw.quizzes) {
      const limpio = anonimizar(quizRaw, token, siteInfo);
      fs.writeFileSync(path.join(outDir, 'quizzes.json'), JSON.stringify(limpio, null, 2));
      console.log(`   ✅ Total cuestionarios obtenidos: ${limpio.quizzes.length}`);
    }
  }

  if (funciones.includes('gradereport_user_get_grade_items') && siteInfo.userid) {
    console.log('7. Descargando estructura de calificaciones (gradereport_user_get_grade_items)...');
    for (const c of CURSOS) {
      const gradesRaw = await llamarWs(token, 'gradereport_user_get_grade_items', {
        courseid: String(c.id),
        userid: String(siteInfo.userid),
      });
      if (gradesRaw && gradesRaw.usergrades) {
        const limpio = anonimizar(gradesRaw, token, siteInfo);
        if (limpio.usergrades[0]) {
          limpio.usergrades[0].userid = 99999;
          limpio.usergrades[0].userfullname = 'Alumno Demo';
        }
        fs.writeFileSync(path.join(outDir, `grades_${c.id}.json`), JSON.stringify(limpio, null, 2));
        console.log(`   ✅ Calificaciones curso ${c.id}: ${(limpio.usergrades[0]?.gradeitems || []).length} items.`);
      }
    }
  }
}

main().catch(err => {
  console.error('Error en descubrimiento:', err.message, err.cause || '');
  process.exitCode = 1;
});
