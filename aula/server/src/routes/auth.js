import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { one, transaccion } from '../db.js';
import { cerrarSesion, iniciarSesion, requiere, usuarioPublico } from '../lib/auth.js';
import { HttpError, validar } from '../lib/http.js';
import { siguienteAlumnoId } from '../lib/ids.js';
import { emitir } from '../lib/n8n.js';
import { hoy } from '../lib/fechas.js';

export const auth = Router();

// Freno sencillo contra adivinar contraseñas: 10 intentos fallidos por correo cada 15 minutos
const fallos = new Map();
function comprobarIntentos(email) {
  const ahora = Date.now();
  const f = fallos.get(email);
  if (f && ahora - f.desde < 15 * 60 * 1000 && f.n >= 10) {
    throw new HttpError(429, 'Demasiados intentos. Espera unos minutos o pide ayuda al profesor.');
  }
}
function registrarFallo(email) {
  const ahora = Date.now();
  const f = fallos.get(email);
  if (!f || ahora - f.desde > 15 * 60 * 1000) fallos.set(email, { desde: ahora, n: 1 });
  else f.n += 1;
}

auth.post('/login', async (req, res) => {
  const { email, password } = validar(z.object({ email: z.string().trim().toLowerCase(), password: z.string() }), req.body);
  comprobarIntentos(email);
  const u = await one(`SELECT * FROM usuarios WHERE lower(email) = $1 AND estado = 'activo'`, [email]);
  if (!u || !u.password_hash || !(await bcrypt.compare(password, u.password_hash))) {
    registrarFallo(email);
    throw new HttpError(401, 'El correo o la contraseña no son correctos.');
  }
  fallos.delete(email);
  iniciarSesion(res, u);
  res.json({ usuario: usuarioPublico(u) });
});

auth.post('/logout', (_req, res) => {
  cerrarSesion(res);
  res.json({ ok: true });
});

auth.get('/yo', (req, res) => {
  res.json({ usuario: req.usuario ? usuarioPublico(req.usuario) : null });
});

auth.post('/password', requiere(), async (req, res) => {
  const { actual, nueva } = validar(z.object({ actual: z.string(), nueva: z.string().min(8, 'mínimo 8 caracteres') }), req.body);
  if (!(await bcrypt.compare(actual, req.usuario.password_hash || ''))) throw new HttpError(400, 'La contraseña actual no es correcta.');
  await one('UPDATE usuarios SET password_hash = $2 WHERE id = $1 RETURNING id', [req.usuario.id, await bcrypt.hash(nueva, 10)]);
  res.json({ ok: true });
});

async function invitacionValida(token) {
  const inv = await one('SELECT * FROM invitaciones WHERE token = $1', [token]);
  if (!inv) throw new HttpError(404, 'Este enlace no es válido. Pide al profesor uno nuevo.');
  if (inv.usada_en) throw new HttpError(410, 'Este enlace ya se ha usado. Entra con tu correo y tu contraseña.');
  if (new Date(inv.expira_en) < new Date()) throw new HttpError(410, 'Este enlace ha caducado. Pide al profesor uno nuevo.');
  return inv;
}

auth.get('/invitacion/:token', async (req, res) => {
  const inv = await invitacionValida(req.params.token);
  res.json({ email: inv.email, nombre: inv.nombre, tipo: inv.tipo, rol: inv.rol });
});

auth.post('/invitacion/:token', async (req, res) => {
  const datos = validar(z.object({
    nombre: z.string().trim().min(2, 'escribe tu nombre y apellidos').optional(),
    password: z.string().min(8, 'mínimo 8 caracteres'),
    consentimiento: z.boolean().optional(),
  }), req.body);

  const usuario = await transaccion(async (c) => {
    const { rows: [inv] } = await c.query('SELECT * FROM invitaciones WHERE token = $1 FOR UPDATE', [req.params.token]);
    if (!inv || inv.usada_en || new Date(inv.expira_en) < new Date()) throw new HttpError(410, 'Este enlace ya no es válido. Pide al profesor uno nuevo.');
    const hash = await bcrypt.hash(datos.password, 10);
    let u;

    if (inv.tipo === 'reset') {
      ({ rows: [u] } = await c.query('UPDATE usuarios SET password_hash = $2 WHERE lower(email) = lower($1) RETURNING *', [inv.email, hash]));
      if (!u) throw new HttpError(404, 'No existe ninguna cuenta con ese correo.');
    } else {
      if (inv.rol === 'alumno' && !datos.consentimiento) throw new HttpError(400, 'Tienes que aceptar el uso de tus datos para el seguimiento del curso.');
      const { rows: [existente] } = await c.query('SELECT id FROM usuarios WHERE lower(email) = lower($1)', [inv.email]);
      if (existente) throw new HttpError(409, 'Ya hay una cuenta con este correo. Entra con tu contraseña.');
      const alumnoId = inv.rol === 'alumno' ? await siguienteAlumnoId(c) : null;
      ({ rows: [u] } = await c.query(
        `INSERT INTO usuarios (alumno_id, nombre, email, password_hash, rol, grupo)
         VALUES ($1, $2, lower($3), $4, $5, $6) RETURNING *`,
        [alumnoId, datos.nombre || inv.nombre || inv.email, inv.email, hash, inv.rol, inv.grupo],
      ));
      if (u.alumno_id) {
        await emitir('alumno.alta', {
          alumno_id: u.alumno_id, nombre: u.nombre, email: u.email, grupo: u.grupo,
          estado: 'Activo', fecha_alta: hoy(), observaciones: '',
        }, c);
      }
    }
    await c.query('UPDATE invitaciones SET usada_en = now() WHERE token = $1', [inv.token]);
    return u;
  });

  iniciarSesion(res, usuario);
  res.json({ usuario: usuarioPublico(usuario) });
});
