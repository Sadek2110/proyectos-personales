import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query, transaccion } from '../db.js';
import { requiere, tokenAleatorio } from '../lib/auth.js';
import { enviarArchivo } from '../lib/archivos.js';
import { enviarCorreo, smtpConfigurado, textoInvitacion } from '../lib/correo.js';
import { hoy } from '../lib/fechas.js';
import { HttpError, fechaOpcional, horaOpcional, noEncontrado, textoOpcional, validar } from '../lib/http.js';
import { idAsistencia, siguienteSesionId } from '../lib/ids.js';
import { emitir } from '../lib/n8n.js';

export const profesor = Router();
profesor.use(requiere('profesor'));

// ---------- Panel ----------

profesor.get('/panel', async (_req, res) => {
  const fecha = hoy();
  const [sesion, alumnos, fichajes, porCorregir, stats] = await Promise.all([
    one(`SELECT s.*, t.titulo AS tema_titulo FROM sesiones s LEFT JOIN temas t ON t.id = s.tema_id
         WHERE s.fecha >= $1 ORDER BY s.fecha, s.hora_inicio NULLS FIRST LIMIT 1`, [fecha]),
    query(`SELECT id, alumno_id, nombre FROM usuarios WHERE rol = 'alumno' AND estado = 'activo' ORDER BY alumno_id`),
    query(`SELECT f.*, u.alumno_id FROM fichajes f JOIN usuarios u ON u.id = f.usuario_id WHERE f.fecha = $1`, [fecha]),
    query(`SELECT r.id, r.alumno_id, r.ejercicio_id, r.intento, r.fecha, u.nombre, e.titulo AS ejercicio_titulo
           FROM resultados r JOIN usuarios u ON u.alumno_id = r.alumno_id JOIN ejercicios e ON e.id = r.ejercicio_id
           WHERE r.estado = 'Entregado' ORDER BY r.fecha LIMIT 8`),
    one(`SELECT
           (SELECT count(*) FROM resultados WHERE estado = 'Entregado')::int AS por_corregir,
           (SELECT round(avg(nota_10), 1) FROM resultados WHERE estado = 'Revisado' AND intento = 1) AS media_nota,
           (SELECT count(*) FROM asistencia)::int AS registros_asistencia,
           (SELECT count(*) FILTER (WHERE estado IN ('Presente', 'Retraso')) FROM asistencia)::int AS asistencias`),
  ]);
  const asistencia = sesion?.fecha === fecha
    ? await query('SELECT alumno_id, estado, minutos_retraso FROM asistencia WHERE sesion_id = $1', [sesion.id])
    : [];
  res.json({
    fecha,
    sesion,
    hoy: alumnos.map((a) => ({
      ...a,
      fichaje: fichajes.find((f) => f.alumno_id === a.alumno_id) ?? null,
      asistencia: asistencia.find((x) => x.alumno_id === a.alumno_id) ?? null,
    })),
    por_corregir: porCorregir,
    stats: {
      alumnos: alumnos.length,
      presentes_hoy: fichajes.length,
      por_corregir: stats.por_corregir,
      media_nota: stats.media_nota,
      asistencia_pct: stats.registros_asistencia ? Math.round((stats.asistencias / stats.registros_asistencia) * 100) : null,
    },
  });
});

// ---------- Alumnos ----------

profesor.get('/alumnos', async (_req, res) => {
  res.json(await query(`
    SELECT u.id, u.alumno_id, u.nombre, u.email, u.grupo, u.estado, u.observaciones, u.creado_en,
      (SELECT count(*) FROM asistencia a WHERE a.alumno_id = u.alumno_id)::int AS sesiones_registradas,
      (SELECT count(*) FROM asistencia a WHERE a.alumno_id = u.alumno_id AND a.estado IN ('Presente', 'Retraso'))::int AS asistencias,
      (SELECT count(*) FROM resultados r WHERE r.alumno_id = u.alumno_id AND r.estado = 'Revisado' AND r.intento = 1)::int AS ejercicios_revisados,
      (SELECT count(DISTINCT ejercicio_id) FROM resultados r WHERE r.alumno_id = u.alumno_id)::int AS ejercicios_entregados,
      (SELECT round(avg(nota_10), 1) FROM resultados r WHERE r.alumno_id = u.alumno_id AND r.estado = 'Revisado' AND r.intento = 1) AS media_nota_10
    FROM usuarios u WHERE u.rol = 'alumno' ORDER BY u.alumno_id`));
});

profesor.get('/alumnos/:alumnoId', async (req, res) => {
  const a = await one(`SELECT id, alumno_id, nombre, email, grupo, estado, observaciones, creado_en FROM usuarios WHERE alumno_id = $1`, [req.params.alumnoId]);
  if (!a) throw noEncontrado('El alumno');
  const [asistencia, resultados, fichajes] = await Promise.all([
    query(`SELECT a.*, s.fecha, s.titulo FROM asistencia a JOIN sesiones s ON s.id = a.sesion_id WHERE a.alumno_id = $1 ORDER BY s.fecha DESC`, [a.alumno_id]),
    query(`SELECT r.id, r.ejercicio_id, r.intento, r.fecha, r.estado, r.nota_10, r.nivel_autonomia, r.dificultad, e.titulo
           FROM resultados r JOIN ejercicios e ON e.id = r.ejercicio_id WHERE r.alumno_id = $1 ORDER BY r.fecha DESC`, [a.alumno_id]),
    query(`SELECT fecha, entrada, salida FROM fichajes WHERE usuario_id = $1 ORDER BY fecha DESC LIMIT 30`, [a.id]),
  ]);
  res.json({ ...a, asistencia, resultados, fichajes });
});

profesor.put('/alumnos/:alumnoId', async (req, res) => {
  const d = validar(z.object({
    nombre: z.string().trim().min(1),
    grupo: textoOpcional,
    estado: z.enum(['activo', 'baja']),
    observaciones: textoOpcional,
  }), req.body);
  const a = await transaccion(async (c) => {
    const { rows: [u] } = await c.query(
      `UPDATE usuarios SET nombre = $2, grupo = $3, estado = $4, observaciones = $5 WHERE alumno_id = $1 RETURNING *`,
      [req.params.alumnoId, d.nombre, d.grupo, d.estado, d.observaciones],
    );
    if (!u) throw noEncontrado('El alumno');
    await emitir('alumno.actualizado', {
      alumno_id: u.alumno_id, nombre: u.nombre, email: u.email, grupo: u.grupo,
      estado: u.estado === 'activo' ? 'Activo' : 'Baja', observaciones: u.observaciones || '',
    }, c);
    return u;
  });
  res.json({ alumno_id: a.alumno_id });
});

// ---------- Invitaciones ----------

async function crearInvitacion({ email, nombre, rol = 'alumno', grupo, tipo = 'alta', creadaPor, profesorNombre }) {
  const token = tokenAleatorio();
  const inv = await one(
    `INSERT INTO invitaciones (token, email, nombre, rol, grupo, tipo, creada_por, expira_en)
     VALUES ($1, lower($2), $3, $4, $5, $6, $7, now() + interval '7 days') RETURNING *`,
    [token, email, nombre || null, rol, grupo || null, tipo, creadaPor],
  );
  const enlace = `${config.appUrl}/invitacion/${token}`;
  const { asunto, texto } = textoInvitacion({ nombre, enlace, tipo, profesor: profesorNombre });
  // n8n envía el correo con Gmail; si hay SMTP configurado, la app lo envía también directamente
  await emitir('invitacion.creada', { email: inv.email, nombre: inv.nombre || '', rol, grupo: grupo || '', tipo, enlace, asunto, texto, caduca: inv.expira_en });
  let enviadoSmtp = false;
  try {
    enviadoSmtp = await enviarCorreo({ para: inv.email, asunto, texto });
  } catch (err) {
    console.error('No se pudo enviar el correo por SMTP:', err.message);
  }
  return { email: inv.email, enlace, expira_en: inv.expira_en, enviado_smtp: enviadoSmtp };
}

profesor.get('/invitaciones', async (_req, res) => {
  res.json({
    smtp: smtpConfigurado(),
    n8n: Boolean(config.n8n.webhookUrl),
    invitaciones: await query(`SELECT token, email, nombre, rol, grupo, tipo, creada_en, expira_en, usada_en,
                                 '${config.appUrl}/invitacion/' || token AS enlace
                               FROM invitaciones ORDER BY creada_en DESC LIMIT 200`),
  });
});

profesor.post('/invitaciones', async (req, res) => {
  const d = validar(z.object({
    emails: z.array(z.string().trim().toLowerCase().email('hay un correo que no es válido')).min(1, 'escribe al menos un correo').max(60),
    grupo: textoOpcional,
    rol: z.enum(['alumno', 'profesor']).default('alumno'),
  }), req.body);
  if (d.rol === 'profesor' && req.usuario.rol !== 'admin') throw new HttpError(403, 'Solo el administrador puede invitar a otros profesores.');
  const existentes = new Set((await query('SELECT lower(email) AS email FROM usuarios WHERE lower(email) = ANY($1)', [d.emails])).map((r) => r.email));
  const creadas = [];
  const omitidas = [];
  for (const email of new Set(d.emails)) {
    if (existentes.has(email)) {
      omitidas.push(email);
      continue;
    }
    creadas.push(await crearInvitacion({ email, rol: d.rol, grupo: d.grupo, creadaPor: req.usuario.id, profesorNombre: req.usuario.nombre }));
  }
  res.status(201).json({ creadas, omitidas });
});

profesor.delete('/invitaciones/:token', async (req, res) => {
  const inv = await one('DELETE FROM invitaciones WHERE token = $1 AND usada_en IS NULL RETURNING token', [req.params.token]);
  if (!inv) throw noEncontrado('La invitación pendiente');
  res.json({ ok: true });
});

// Enlace para que un alumno ponga una contraseña nueva
profesor.post('/alumnos/:alumnoId/reset', async (req, res) => {
  const u = await one(`SELECT email, nombre FROM usuarios WHERE alumno_id = $1`, [req.params.alumnoId]);
  if (!u) throw noEncontrado('El alumno');
  res.json(await crearInvitacion({ email: u.email, nombre: u.nombre, tipo: 'reset', creadaPor: req.usuario.id, profesorNombre: req.usuario.nombre }));
});

// ---------- Sesiones ----------

const esquemaSesion = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'usa el formato AAAA-MM-DD'),
  hora_inicio: horaOpcional,
  hora_fin: horaOpcional,
  titulo: z.string().trim().min(1),
  unidad_id: textoOpcional,
  tema_id: textoOpcional,
  lugar: textoOpcional,
  observaciones: textoOpcional,
});

function payloadSesion(s) {
  const duracion = s.hora_inicio && s.hora_fin
    ? (Number(s.hora_fin.slice(0, 2)) * 60 + Number(s.hora_fin.slice(3, 5))) - (Number(s.hora_inicio.slice(0, 2)) * 60 + Number(s.hora_inicio.slice(3, 5)))
    : null;
  return {
    sesion_id: s.id, fecha: s.fecha, unidad_id: s.unidad_id || '', tema_id: s.tema_id || '',
    duracion_min: duracion, estado: s.estado === 'cerrada' ? 'Cerrada' : 'Planificada',
    titulo: s.titulo, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin, lugar: s.lugar || '', observaciones: s.observaciones || '',
  };
}

profesor.get('/sesiones', async (_req, res) => {
  res.json(await query(`
    SELECT s.*, t.titulo AS tema_titulo,
      (SELECT count(*) FROM asistencia a WHERE a.sesion_id = s.id AND a.estado IN ('Presente', 'Retraso'))::int AS presentes,
      (SELECT count(*) FROM asistencia a WHERE a.sesion_id = s.id)::int AS registrados
    FROM sesiones s LEFT JOIN temas t ON t.id = s.tema_id ORDER BY s.fecha, s.hora_inicio NULLS FIRST`));
});

profesor.post('/sesiones', async (req, res) => {
  const d = validar(esquemaSesion, req.body);
  const s = await transaccion(async (c) => {
    const id = await siguienteSesionId(c);
    const { rows: [s] } = await c.query(
      `INSERT INTO sesiones (id, fecha, hora_inicio, hora_fin, titulo, unidad_id, tema_id, lugar, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, d.fecha, d.hora_inicio, d.hora_fin, d.titulo, d.unidad_id, d.tema_id, d.lugar, d.observaciones],
    );
    await emitir('sesion.guardada', payloadSesion(s), c);
    return s;
  });
  res.status(201).json(s);
});

profesor.put('/sesiones/:id', async (req, res) => {
  const d = validar(esquemaSesion, req.body);
  const s = await transaccion(async (c) => {
    const { rows: [s] } = await c.query(
      `UPDATE sesiones SET fecha = $2, hora_inicio = $3, hora_fin = $4, titulo = $5, unidad_id = $6, tema_id = $7, lugar = $8, observaciones = $9
       WHERE id = $1 RETURNING *`,
      [req.params.id, d.fecha, d.hora_inicio, d.hora_fin, d.titulo, d.unidad_id, d.tema_id, d.lugar, d.observaciones],
    );
    if (!s) throw noEncontrado('La sesión');
    await emitir('sesion.guardada', payloadSesion(s), c);
    return s;
  });
  res.json(s);
});

profesor.delete('/sesiones/:id', async (req, res) => {
  const s = await one('DELETE FROM sesiones WHERE id = $1 RETURNING id', [req.params.id]);
  if (!s) throw noEncontrado('La sesión');
  await emitir('sesion.borrada', { sesion_id: s.id });
  res.json({ ok: true });
});

profesor.get('/sesiones/:id/asistencia', async (req, res) => {
  const s = await one(`SELECT s.*, t.titulo AS tema_titulo FROM sesiones s LEFT JOIN temas t ON t.id = s.tema_id WHERE s.id = $1`, [req.params.id]);
  if (!s) throw noEncontrado('La sesión');
  const lista = await query(`
    SELECT u.alumno_id, u.nombre, a.estado, a.minutos_retraso, a.observaciones, a.origen, f.entrada, f.salida
    FROM usuarios u
    LEFT JOIN asistencia a ON a.alumno_id = u.alumno_id AND a.sesion_id = $1
    LEFT JOIN fichajes f ON f.usuario_id = u.id AND f.fecha = $2
    WHERE u.rol = 'alumno' AND (u.estado = 'activo' OR a.id IS NOT NULL)
    ORDER BY u.alumno_id`, [s.id, s.fecha]);
  res.json({ sesion: s, alumnos: lista });
});

profesor.put('/sesiones/:id/asistencia', async (req, res) => {
  const { registros } = validar(z.object({
    registros: z.array(z.object({
      alumno_id: z.string(),
      estado: z.enum(['Presente', 'Retraso', 'Ausente', 'Justificada']),
      minutos_retraso: z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.number().int().min(0).nullable().optional()),
      observaciones: textoOpcional,
    })).min(1),
  }), req.body);
  const sesion = await one('SELECT id FROM sesiones WHERE id = $1', [req.params.id]);
  if (!sesion) throw noEncontrado('La sesión');
  await transaccion(async (c) => {
    for (const r of registros) {
      const { rows: [a] } = await c.query(
        `INSERT INTO asistencia (id, sesion_id, alumno_id, estado, minutos_retraso, observaciones, origen)
         VALUES ($1, $2, $3, $4, $5, $6, 'profesor')
         ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado, minutos_retraso = EXCLUDED.minutos_retraso,
           observaciones = EXCLUDED.observaciones, origen = 'profesor'
         RETURNING *`,
        [idAsistencia(sesion.id, r.alumno_id), sesion.id, r.alumno_id, r.estado, r.estado === 'Retraso' ? r.minutos_retraso ?? null : null, r.observaciones],
      );
      await emitir('asistencia.actualizada', {
        asistencia_id: a.id, sesion_id: a.sesion_id, alumno_id: a.alumno_id, estado: a.estado,
        minutos_retraso: a.minutos_retraso, observaciones: a.observaciones || '',
      }, c);
    }
  });
  res.json({ ok: true, guardados: registros.length });
});

// Cierre de la clase: resumen para el diario del profesor en Notion
profesor.post('/sesiones/:id/cerrar', async (req, res) => {
  const { observaciones } = validar(z.object({ observaciones: textoOpcional }), req.body);
  const s = await transaccion(async (c) => {
    const { rows: [s] } = await c.query(
      `UPDATE sesiones SET estado = 'cerrada', observaciones = COALESCE($2, observaciones) WHERE id = $1 RETURNING *`,
      [req.params.id, observaciones],
    );
    if (!s) throw noEncontrado('La sesión');
    const { rows: asistencia } = await c.query('SELECT estado, count(*)::int AS n FROM asistencia WHERE sesion_id = $1 GROUP BY estado', [s.id]);
    // Dificultades anotadas al corregir entregas de ese día; si varias se repiten son necesidad del grupo
    const { rows: dificultades } = await c.query(
      `SELECT dificultad, count(*)::int AS alumnos FROM resultados
       WHERE dificultad IS NOT NULL AND dificultad <> '' AND (fecha AT TIME ZONE $1)::date = $2
       GROUP BY dificultad ORDER BY alumnos DESC`,
      [config.zonaHoraria, s.fecha],
    );
    await emitir('sesion.cerrada', {
      ...payloadSesion(s),
      asistencia: Object.fromEntries(asistencia.map((a) => [a.estado, a.n])),
      dificultades,
      necesidades_grupo: dificultades.filter((d) => d.alumnos > 1).map((d) => d.dificultad),
    }, c);
    return s;
  });
  res.json(s);
});

// ---------- Entregas y correcciones ----------

profesor.get('/entregas', async (req, res) => {
  const { estado, alumno_id: alumnoId, ejercicio_id: ejercicioId } = validar(z.object({
    estado: z.enum(['Entregado', 'Revisado']).optional(),
    alumno_id: z.string().optional(),
    ejercicio_id: z.string().optional(),
  }), req.query);
  res.json(await query(`
    SELECT r.id, r.alumno_id, r.ejercicio_id, r.intento, r.fecha, r.estado, r.nota_10, r.nivel_autonomia, r.archivo_nombre,
           u.nombre, e.titulo AS ejercicio_titulo
    FROM resultados r JOIN usuarios u ON u.alumno_id = r.alumno_id JOIN ejercicios e ON e.id = r.ejercicio_id
    WHERE ($1::text IS NULL OR r.estado = $1) AND ($2::text IS NULL OR r.alumno_id = $2) AND ($3::text IS NULL OR r.ejercicio_id = $3)
    ORDER BY CASE WHEN r.estado = 'Entregado' THEN 0 ELSE 1 END, r.fecha ${estado === 'Revisado' ? 'DESC' : 'ASC'}
    LIMIT 300`, [estado ?? null, alumnoId ?? null, ejercicioId ?? null]));
});

profesor.get('/entregas/:id', async (req, res) => {
  const r = await one(`
    SELECT r.*, u.nombre, u.email, e.titulo AS ejercicio_titulo, e.enunciado, e.entrega AS entrega_esperada
    FROM resultados r JOIN usuarios u ON u.alumno_id = r.alumno_id JOIN ejercicios e ON e.id = r.ejercicio_id
    WHERE r.id = $1`, [req.params.id]);
  if (!r) throw noEncontrado('La entrega');
  const anteriores = await query(
    `SELECT id, intento, fecha, estado, nota_10, nivel_autonomia, comentario FROM resultados
     WHERE alumno_id = $1 AND ejercicio_id = $2 AND id <> $3 ORDER BY intento DESC`,
    [r.alumno_id, r.ejercicio_id, r.id],
  );
  res.json({ ...r, archivo: undefined, tiene_archivo: Boolean(r.archivo), anteriores });
});

profesor.get('/entregas/:id/archivo', async (req, res) => {
  const r = await one('SELECT archivo, archivo_nombre, alumno_id FROM resultados WHERE id = $1', [req.params.id]);
  if (!r?.archivo) throw noEncontrado('El archivo');
  enviarArchivo(res, r.archivo, `${r.alumno_id}_${r.archivo_nombre}`);
});

profesor.put('/entregas/:id/correccion', async (req, res) => {
  const d = validar(z.object({
    nota_10: z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.number().min(0).max(10).nullable()),
    nivel_autonomia: z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.number().int().min(1).max(4).nullable()),
    dificultad: textoOpcional,
    accion_refuerzo: textoOpcional,
    comentario: textoOpcional,
  }), req.body);
  const r = await transaccion(async (c) => {
    const { rows: [r] } = await c.query(
      `UPDATE resultados SET estado = 'Revisado', nota_10 = $2, nivel_autonomia = $3, dificultad = $4,
         accion_refuerzo = $5, comentario = $6, revisado_en = now()
       WHERE id = $1 RETURNING *`,
      [req.params.id, d.nota_10, d.nivel_autonomia, d.dificultad, d.accion_refuerzo, d.comentario],
    );
    if (!r) throw noEncontrado('La entrega');
    await emitir('resultado.revisado', {
      resultado_id: r.id, alumno_id: r.alumno_id, ejercicio_id: r.ejercicio_id, intento: r.intento, fecha: r.fecha,
      estado: 'Revisado', nivel_autonomia: r.nivel_autonomia, nota_10: r.nota_10, entrega_url: r.entrega_url || '',
      dificultad: r.dificultad || '', accion_refuerzo: r.accion_refuerzo || '', comentario: r.comentario || '',
    }, c);
    return r;
  });
  res.json({ id: r.id, estado: r.estado });
});

// ---------- Eventos del calendario y fichajes ----------

const esquemaEvento = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  titulo: z.string().trim().min(1),
  detalle: textoOpcional,
  tipo: z.enum(['aviso', 'festivo', 'examen']).default('aviso'),
});

profesor.get('/eventos', async (_req, res) => res.json(await query('SELECT * FROM eventos ORDER BY fecha')));
profesor.post('/eventos', async (req, res) => {
  const d = validar(esquemaEvento, req.body);
  res.status(201).json(await one('INSERT INTO eventos (fecha, titulo, detalle, tipo) VALUES ($1, $2, $3, $4) RETURNING *', [d.fecha, d.titulo, d.detalle, d.tipo]));
});
profesor.put('/eventos/:id', async (req, res) => {
  const d = validar(esquemaEvento, req.body);
  const e = await one('UPDATE eventos SET fecha = $2, titulo = $3, detalle = $4, tipo = $5 WHERE id = $1 RETURNING *', [req.params.id, d.fecha, d.titulo, d.detalle, d.tipo]);
  if (!e) throw noEncontrado('El evento');
  res.json(e);
});
profesor.delete('/eventos/:id', async (req, res) => {
  const e = await one('DELETE FROM eventos WHERE id = $1 RETURNING id', [req.params.id]);
  if (!e) throw noEncontrado('El evento');
  res.json({ ok: true });
});

profesor.get('/fichajes', async (req, res) => {
  const { fecha } = validar(z.object({ fecha: fechaOpcional }), req.query);
  res.json(await query(
    `SELECT f.*, u.alumno_id, u.nombre FROM fichajes f JOIN usuarios u ON u.id = f.usuario_id
     WHERE f.fecha = $1 ORDER BY f.entrada`, [fecha || hoy()],
  ));
});
