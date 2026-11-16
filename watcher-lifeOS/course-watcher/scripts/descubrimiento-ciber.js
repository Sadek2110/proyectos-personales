// Script de descubrimiento Fase 0 para Curso 2 — Especialización en Ciberseguridad
// Plataforma: https://www.mecd.es/aulavirtualfpceuta (Moodle Ministerio de Educación - Ceuta)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = 'https://www.mecd.es/aulavirtualfpceuta';

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
  const user = process.env.CIBER_USER;
  const pass = process.env.CIBER_PASS;
  if (!user || !pass) {
    console.error('Faltan CIBER_USER o CIBER_PASS');
    process.exit(1);
  }

  console.log('1. Consultando configuración pública de Moodle FP Ceuta...');
  const pubRes = await fetch(`${BASE_URL}/lib/ajax/service.php?info=tool_mobile_get_public_config`, {
    method: 'POST',
    body: JSON.stringify([{ index: 0, methodname: 'tool_mobile_get_public_config', args: {} }]),
    signal: AbortSignal.timeout(30000),
  });
  const pubJson = await pubRes.json().catch(() => null);
  console.log('   typeoflogin:', pubJson?.[0]?.data?.typeoflogin, '| sitename:', pubJson?.[0]?.data?.sitename);

  console.log('2. Probando login/token.php?service=moodle_mobile_app...');
  const tokenRes = await fetch(`${BASE_URL}/login/token.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: user, password: pass, service: 'moodle_mobile_app' }).toString(),
    signal: AbortSignal.timeout(30000),
  });
  const tokenJson = await tokenRes.json();

  if (tokenJson.error || !tokenJson.token) {
    console.log('   Respuesta de token.php:', { error: tokenJson.error, errorcode: tokenJson.errorcode });
    process.exit(2);
  }

  const token = tokenJson.token;
  console.log('   ✅ ¡Token obtenido directamente con login/token.php! (longitud:', token.length, ')');

  const siteInfo = await llamarWs(token, 'core_webservice_get_site_info');
  const funciones = (siteInfo.functions || []).map(f => f.name);
  console.log('3. Funciones disponibles:', funciones.length);

  const misCursos = await llamarWs(token, 'core_enrol_get_users_courses', { userid: String(siteInfo.userid) });
  console.log('4. Cursos matriculados en Aula Virtual FP Ceuta (Ciberseguridad):');
  if (Array.isArray(misCursos)) {
    for (const c of misCursos) {
      console.log(`   - [${c.id}] ${c.fullname} (${c.shortname})`);
    }
  }

  const outDir = path.join(__dirname, '..', 'test', 'fixtures', 'ciber');
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

    const courseIdsParams = {};
    misCursos.forEach((c, idx) => { courseIdsParams[`courseids[${idx}]`] = String(c.id); });

    for (const c of misCursos) {
      const secciones = await llamarWs(token, 'core_course_get_contents', { courseid: String(c.id) });
      if (Array.isArray(secciones)) {
        const limpio = anonimizar(secciones, token, siteInfo);
        fs.writeFileSync(path.join(outDir, `course_${c.id}_contents.json`), JSON.stringify(limpio, null, 2));
        const totalMods = limpio.reduce((acc, s) => acc + (s.modules?.length || 0), 0);
        console.log(`   ✅ Curso ${c.id} (${c.shortname}): ${limpio.length} secciones, ${totalMods} módulos guardados.`);
      }
    }

    if (misCursos.length > 0) {
      const assignRaw = await llamarWs(token, 'mod_assign_get_assignments', courseIdsParams);
      if (assignRaw && assignRaw.courses) {
        const limpio = anonimizar(assignRaw, token, siteInfo);
        fs.writeFileSync(path.join(outDir, 'assignments.json'), JSON.stringify(limpio, null, 2));
        for (const c of limpio.courses) {
          console.log(`   ✅ Entregas curso ${c.id}: ${(c.assignments || []).length}`);
        }
      }
    }
  }
}

main().catch(err => {
  console.error('Error en descubrimiento ciber:', err.message, err.cause || '');
  process.exitCode = 1;
});
