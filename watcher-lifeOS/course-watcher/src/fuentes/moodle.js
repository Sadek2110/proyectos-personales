'use strict';

const { normalizarCursoMoodle } = require('../normalizador.js');

const CURSOS_PYTHON_MOODLE = [
  { id: 2005, codigo: 'est', nombre: 'Estructuras de control en Python' },
  { id: 2475, codigo: 'poo', nombre: 'Programación orientada a objetos' },
  { id: 2006, codigo: 'ana', nombre: 'Análisis de datos en Python' },
];

const CURSOS_CIBER_MOODLE = [
  { id: 311, codigo: 'brs', corto: 'Bastionado', nombre: 'Bastionado de redes y sistemas' },
  { id: 177, codigo: 'afi', corto: 'Forense', nombre: 'Análisis forense informático' },
  { id: 175, codigo: 'pps', corto: 'Producción', nombre: 'Puesta en producción segura' },
  { id: 174, codigo: 'nc', corto: 'Normativa', nombre: 'Normativa de ciberseguridad' },
  { id: 173, codigo: 'ic', corto: 'Incidentes', nombre: 'Incidentes de ciberseguridad' },
  { id: 172, codigo: 'he', corto: 'Hacking', nombre: 'Hacking ético' },
];

class ErrorCaptchaDetectado extends Error {
  constructor(mensaje = 'Se ha detectado un reto CAPTCHA o 2FA en el inicio de sesión de Moodle.') {
    super(mensaje);
    this.name = 'ErrorCaptchaDetectado';
    this.codigo = 'CAPTCHA_DETECTADO';
  }
}

function detectarCaptchaO2FA(html) {
  if (!html || typeof html !== 'string') return;
  const patron = /g-recaptcha|cf-turnstile|hcaptcha|\b(?:2fa|two-factor|otp_token)\b|<input[^>]+name=["']?(?:otp|2fa|totp)["']?/i;
  if (patron.test(html)) {
    throw new ErrorCaptchaDetectado(
      'Bloqueo de seguridad detectado (CAPTCHA o 2FA). Abortando sin reintentar.'
    );
  }
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  addFromHeaders(headers, url) {
    if (!headers) return;
    const host = new URL(url).hostname;
    let setCookies = [];
    if (typeof headers.getSetCookie === 'function') {
      setCookies = headers.getSetCookie();
    } else if (typeof headers.get === 'function') {
      const sc = headers.get('set-cookie');
      if (sc) setCookies = [sc];
    }
    for (const sc of setCookies) {
      const [pair] = String(sc).split(';');
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

async function fetchConCookies(jar, url, opts = {}, fetchFn = global.fetch) {
  let actual = url;
  let method = opts.method || 'GET';
  let body = opts.body;
  let headers = { ...(opts.headers || {}) };

  for (let i = 0; i < 12; i++) {
    const cookieHeader = jar.headerFor(actual);
    if (cookieHeader) headers.Cookie = cookieHeader;
    else delete headers.Cookie;

    const r = await fetchFn(actual, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });

    jar.addFromHeaders(r.headers, actual);
    const loc = r.headers && typeof r.headers.get === 'function' ? r.headers.get('location') : null;
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

    const text = typeof r.text === 'function' ? await r.text() : '';
    detectarCaptchaO2FA(text);
    return { url: actual, status: r.status, text, headers: r.headers };
  }
  throw new Error('Demasiadas redirecciones en CAS');
}

async function obtenerTokenCas(baseUrl, user, pass, fetchFn = global.fetch) {
  const urlLimpia = String(baseUrl || '').replace(/\/+$/, '');
  const jar = new CookieJar();

  const paso1 = await fetchConCookies(
    jar,
    `${urlLimpia}/login/index.php?authCAS=CAS`,
    {},
    fetchFn
  );
  detectarCaptchaO2FA(paso1.text);

  const inputs = {};
  const regex = /<input[^>]+name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = regex.exec(paso1.text)) !== null) {
    inputs[m[1]] = m[2];
  }
  const actionMatch = /<form[^>]+action=["']([^"']+)["']/i.exec(paso1.text);
  const postUrl = actionMatch
    ? new URL(actionMatch[1].replace(/&amp;/g, '&'), paso1.url).toString()
    : paso1.url;

  const form = new URLSearchParams({
    ...inputs,
    username: user || '',
    password: pass || '',
    _eventId: 'submit',
  });

  const paso2 = await fetchConCookies(
    jar,
    postUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    },
    fetchFn
  );
  detectarCaptchaO2FA(paso2.text);

  if (!paso2.url || (!paso2.url.includes('/centros/') && paso2.url.includes('/cas/login'))) {
    throw new Error('Credenciales rechazadas por CAS o requiere intervención.');
  }

  const passport = String(Math.floor(Math.random() * 100000));
  const launch = await fetchConCookies(
    jar,
    `${urlLimpia}/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=${passport}&urlscheme=moodlemobile`,
    {},
    fetchFn
  );

  if (!launch.moodleRedirect) {
    detectarCaptchaO2FA(launch.text);
    throw new Error('launch.php no devolvió esquema moodlemobile://');
  }

  const b64 = launch.moodleRedirect.split('token=')[1];
  if (!b64) throw new Error('No se encontró el parámetro token en moodlemobile://');
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  const [, wstoken] = decoded.split(':::');
  if (!wstoken) throw new Error('No se pudo decodificar el wstoken');
  return wstoken;
}

async function obtenerTokenDirecto(baseUrl, user, pass, fetchFn = global.fetch) {
  const urlLimpia = String(baseUrl || '').replace(/\/+$/, '');
  const form = new URLSearchParams({
    username: user || '',
    password: pass || '',
    service: 'moodle_mobile_app',
  });

  const r = await fetchFn(`${urlLimpia}/login/token.php?service=moodle_mobile_app`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(30000),
  });

  const texto = typeof r.text === 'function' ? await r.text() : '';
  if (texto) {
    detectarCaptchaO2FA(texto);
  }

  let datos;
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new Error('Respuesta no válida en login directo de Moodle');
    }
  } else if (typeof r.json === 'function') {
    datos = await r.json();
  }

  if (!datos || datos.error || !datos.token) {
    throw new Error(datos?.error || 'No se pudo obtener el token directo de Moodle');
  }
  return datos.token;
}

function crearFuenteMoodle({
  baseUrl = 'https://educacionadistancia.juntadeandalucia.es/centros/malaga',
  modoAuth = 'cas',
  nombreFuente = 'moodle',
  user,
  usuario,
  pass,
  password,
  tokenInicial,
  cursos = CURSOS_PYTHON_MOODLE,
  fetchFn = global.fetch,
  leerToken,
  leerTokenGuardado,
  guardarToken,
  sincronizadorDrive,
  nombreCurso = 'Curso',
} = {}) {
  const urlLimpia = String(baseUrl || 'https://educacionadistancia.juntadeandalucia.es/centros/malaga').replace(/\/+$/, '');
  const usuarioLimpio = user || usuario || process.env.MOODLE_USER;
  const passwordLimpio = pass || password || process.env.MOODLE_PASS;
  const fnLeerToken = leerToken || leerTokenGuardado;
  let tokenEnMemoria = tokenInicial || null;

  async function obtenerToken(forzar = false) {
    if (!forzar) {
      if (tokenEnMemoria) return tokenEnMemoria;
      if (typeof fnLeerToken === 'function') {
        const tokenGuardado = await fnLeerToken();
        if (tokenGuardado) {
          tokenEnMemoria = tokenGuardado;
          return tokenEnMemoria;
        }
      }
    }

    const nuevoToken =
      modoAuth === 'directo'
        ? await obtenerTokenDirecto(urlLimpia, usuarioLimpio, passwordLimpio, fetchFn)
        : await obtenerTokenCas(urlLimpia, usuarioLimpio, passwordLimpio, fetchFn);

    tokenEnMemoria = nuevoToken;
    if (typeof guardarToken === 'function') {
      await guardarToken(tokenEnMemoria);
    }
    return tokenEnMemoria;
  }

  async function peticionWsConToken(token, wsfunction, params = {}) {
    const body = new URLSearchParams({
      wstoken: token,
      moodlewsrestformat: 'json',
      wsfunction,
      ...params,
    });

    const r = await fetchFn(`${urlLimpia}/webservice/rest/server.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(30000),
    });

    return r.json();
  }

  async function llamarWs(wsfunction, params = {}) {
    let token = await obtenerToken(false);
    let res = await peticionWsConToken(token, wsfunction, params);

    if (res && res.errorcode === 'invalidtoken') {
      token = await obtenerToken(true);
      res = await peticionWsConToken(token, wsfunction, params);
    }

    if (res && (res.exception || res.errorcode)) {
      throw new Error(res.message || res.errorcode || res.exception);
    }

    return res;
  }

  async function obtenerLote() {
    const siteInfo = await llamarWs('core_webservice_get_site_info');
    const tieneListaFunciones =
      Array.isArray(siteInfo?.functions) && siteInfo.functions.length > 0;
    const soportaFuncion = nombre =>
      !tieneListaFunciones || siteInfo.functions.some(f => f.name === nombre);

    const paramsCursos = {};
    cursos.forEach((c, idx) => {
      paramsCursos[`courseids[${idx}]`] = String(c.id);
    });

    const assignmentsPorCurso = new Map();
    if (cursos.length > 0 && soportaFuncion('mod_assign_get_assignments')) {
      const assignRaw = await llamarWs('mod_assign_get_assignments', paramsCursos);
      if (assignRaw && Array.isArray(assignRaw.courses)) {
        for (const c of assignRaw.courses) {
          assignmentsPorCurso.set(Number(c.id), c.assignments || []);
        }
      }
    }

    let todosQuizzes = [];
    if (cursos.length > 0 && soportaFuncion('mod_quiz_get_quizzes_by_courses')) {
      const quizRaw = await llamarWs('mod_quiz_get_quizzes_by_courses', paramsCursos);
      if (quizRaw && Array.isArray(quizRaw.quizzes)) {
        todosQuizzes = quizRaw.quizzes;
      }
    }

    const modulos = [];
    // Ejecución estrictamente secuencial curso a curso
    for (const curso of cursos) {
      const secciones = await llamarWs('core_course_get_contents', {
        courseid: String(curso.id),
      });

      let grades = [];
      if (soportaFuncion('gradereport_user_get_grade_items') && siteInfo?.userid) {
        const gradesRaw = await llamarWs('gradereport_user_get_grade_items', {
          courseid: String(curso.id),
          userid: String(siteInfo.userid),
        });
        grades = gradesRaw?.usergrades?.[0]?.gradeitems || [];
      }

      const assignmentsCurso = assignmentsPorCurso.get(Number(curso.id)) || [];
      const quizzesCurso = todosQuizzes.filter(
        q => !q.course || Number(q.course) === Number(curso.id)
      );

      const moduloNormalizado = normalizarCursoMoodle({
        courseId: curso.id,
        idModulo: curso.codigo || String(curso.id),
        nombreModulo: curso.nombre || `Curso ${curso.id}`,
        origen: nombreFuente,
        secciones: Array.isArray(secciones) ? secciones : [],
        assignments: assignmentsCurso,
        quizzes: quizzesCurso,
        grades,
      });

      modulos.push(moduloNormalizado);
    }

    if (sincronizadorDrive && typeof sincronizadorDrive.sincronizarModulos === 'function') {
      const tokenActual = await obtenerToken(false);
      await sincronizadorDrive.sincronizarModulos(modulos, tokenActual, nombreCurso);
    }

    return {
      fuente: nombreFuente,
      origen: nombreFuente,
      completa: true,
      modulos,
      userid: siteInfo?.userid,
    };
  }

  return {
    obtenerToken,
    llamarWs,
    obtenerLote,
  };
}

function crearFuenteCiberseguridad(opciones = {}) {
  return crearFuenteMoodle({
    ...opciones,
    baseUrl: opciones.baseUrl || process.env.CIBER_URL || 'https://www.mecd.es/aulavirtualfpceuta',
    modoAuth: 'directo',
    nombreFuente: 'ciber',
    nombreCurso: opciones.nombreCurso || 'FP Especialización Ciberseguridad',
    cursos: opciones.cursos || CURSOS_CIBER_MOODLE,
  });
}

module.exports = {
  CURSOS_PYTHON_MOODLE,
  CURSOS_CIBER_MOODLE,
  ErrorCaptchaDetectado,
  detectarCaptchaO2FA,
  obtenerTokenCas,
  obtenerTokenDirecto,
  crearFuenteMoodle,
  crearFuenteCiberseguridad,
};
