import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';
import { HttpError } from './http.js';

const COOKIE = 'aula_sesion';
// Sesión larga: el alumnado entra desde su móvil y no conviene pedirle la contraseña cada día
const DURACION_DIAS = 60;

export function iniciarSesion(res, usuario) {
  const token = jwt.sign({ uid: usuario.id }, config.jwtSecret, { expiresIn: `${DURACION_DIAS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.produccion,
    maxAge: DURACION_DIAS * 24 * 3600 * 1000,
  });
}

export function cerrarSesion(res) {
  res.clearCookie(COOKIE);
}

export function usuarioPublico(u) {
  return { id: u.id, alumno_id: u.alumno_id, nombre: u.nombre, email: u.email, rol: u.rol, grupo: u.grupo };
}

/** Carga el usuario de la cookie (si la hay) en req.usuario */
export async function cargarUsuario(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, config.jwtSecret);
      const u = await one(`SELECT * FROM usuarios WHERE id = $1 AND estado = 'activo'`, [uid]);
      if (u) req.usuario = u;
    } catch {
      // token caducado o manipulado: se trata como no autenticado
    }
  }
  next();
}

const NIVEL = { alumno: 1, profesor: 2, admin: 3 };

/** requiere('profesor') deja pasar a profesor y admin */
export function requiere(rolMinimo = 'alumno') {
  return (req, _res, next) => {
    if (!req.usuario) throw new HttpError(401, 'Tienes que entrar con tu cuenta.');
    if (NIVEL[req.usuario.rol] < NIVEL[rolMinimo]) throw new HttpError(403, 'No tienes permiso para hacer esto.');
    next();
  };
}

export function soloAlumno(req, _res, next) {
  if (!req.usuario) throw new HttpError(401, 'Tienes que entrar con tu cuenta.');
  if (req.usuario.rol !== 'alumno') throw new HttpError(403, 'Esta parte es solo para el alumnado.');
  next();
}

/** Autenticación de n8n en /api/integraciones */
export function requiereApiKey(req, _res, next) {
  const clave = req.get('x-api-key') || '';
  const esperada = config.n8n.apiKey;
  const ok = esperada && clave.length === esperada.length && crypto.timingSafeEqual(Buffer.from(clave), Buffer.from(esperada));
  if (!ok) throw new HttpError(401, 'Clave de integración no válida.');
  next();
}

export const tokenAleatorio = () => crypto.randomBytes(24).toString('base64url');
