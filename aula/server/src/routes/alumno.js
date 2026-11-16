import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query, transaccion } from '../db.js';
import { soloAlumno } from '../lib/auth.js';
import { borrarArchivo, enviarArchivo, subida } from '../lib/archivos.js';
import { horaAMinutos, hoy, minutosDelDia } from '../lib/fechas.js';
import { HttpError, noEncontrado, validar } from '../lib/http.js';
import { idAsistencia, idResultado } from '../lib/ids.js';
import { emitir } from '../lib/n8n.js';

export const alumno = Router();
alumno.use(soloAlumno);

const SQL_SESION_HOY = `
  SELECT s.*, t.titulo AS tema_titulo, u.titulo AS unidad_titulo
  FROM sesiones s
  LEFT JOIN temas t ON t.id = s.tema_id
  LEFT JOIN unidades u ON u.id = s.unidad_id
  WHERE s.fecha >= $1 ORDER BY s.fecha, s.hora_inicio NULLS FIRST LIMIT 1`;

// Ejercicios visibles con el estado de la última entrega del alumno
const SQL_EJERCICIOS = `
  SELECT e.id, e.titulo, e.entrega, e.minutos, e.fecha_limite, e.tema_id, t.titulo AS tema_titulo, t.unidad_id,
         r.id AS resultado_id, r.intento, r.estado, r.nota_10, r.nivel_autonomia, r.comentario, r.fecha AS fecha_entrega,
         r.archivo_nombre
  FROM ejercicios e
  JOIN temas t ON t.id = e.tema_id AND t.visible
  LEFT JOIN LATERAL (
    SELECT * FROM resultados WHERE alumno_id = $1 AND ejercicio_id = e.id ORDER BY intento DESC LIMIT 1
  ) r ON true
  WHERE e.visible
  ORDER BY t.orden, e.id`;

alumno.get('/inicio', async (req, res) => {
  const fecha = hoy();
  const [fichaje, sesion, ejercicios, totalTemas] = await Promise.all([
    one('SELECT * FROM fichajes WHERE usuario_id = $1 AND fecha = $2', [req.usuario.id, fecha]),
    one(SQL_SESION_HOY, [fecha]),
    query(SQL_EJERCICIOS, [req.usuario.alumno_id]),
    one('SELECT count(*)::int AS n FROM temas WHERE visible'),
  ]);
  const temasHechos = new Set(ejercicios.filter((e) => e.estado).map((e) => e.tema_id));
  const siguienteTema = ejercicios.find((e) => !e.estado);
  res.json({
    fecha,
    fichaje,
    sesion,
    pendientes: ejercicios.filter((e) => !e.estado).slice(0, 3),
    corregidos: ejercicios.filter((e) => e.estado === 'Revisado').slice(-2),
    progreso: { hechos: temasHechos.size, total: totalTemas.n },
    siguiente: siguienteTema ? { tema_id: siguienteTema.tema_id, tema_titulo: siguienteTema.tema_titulo, unidad_id: siguienteTema.unidad_id } : null,
  });
});

alumno.post('/fichar', async (req, res) => {
  const { tipo } = validar(z.object({ tipo: z.enum(['entrada', 'salida']) }), req.body);
  const u = req.usuario;
  const fecha = hoy();

  const fichaje = await transaccion(async (c) => {
    const { rows: [actual] } = await c.query('SELECT * FROM fichajes WHERE usuario_id = $1 AND fecha = $2 FOR UPDATE', [u.id, fecha]);
    const { rows: [sesion] } = await c.query('SELECT * FROM sesiones WHERE fecha = $1 ORDER BY hora_inicio NULLS LAST LIMIT 1', [fecha]);
    let f;

    if (tipo === 'entrada') {
      if (actual) throw new HttpError(409, 'Ya has fichado la entrada hoy.');
      ({ rows: [f] } = await c.query('INSERT INTO fichajes (usuario_id, fecha, entrada) VALUES ($1, $2, now()) RETURNING *', [u.id, fecha]));

      // Si hoy hay clase, el fichaje marca la asistencia (salvo que el profesor ya la haya pasado)
      if (sesion) {
        const inicio = horaAMinutos(sesion.hora_inicio);
        const retraso = inicio === null ? 0 : minutosDelDia() - inicio;
        const estado = retraso > config.toleranciaRetraso ? 'Retraso' : 'Presente';
        const asistenciaId = idAsistencia(sesion.id, u.alumno_id);
        const { rows: [a] } = await c.query(
          `INSERT INTO asistencia (id, sesion_id, alumno_id, estado, minutos_retraso, origen)
           VALUES ($1, $2, $3, $4, $5, 'fichaje')
           ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado, minutos_retraso = EXCLUDED.minutos_retraso
             WHERE asistencia.origen = 'fichaje'
           RETURNING *`,
          [asistenciaId, sesion.id, u.alumno_id, estado, estado === 'Retraso' ? retraso : null],
        );
        if (a) {
          await emitir('asistencia.actualizada', {
            asistencia_id: a.id, sesion_id: a.sesion_id, alumno_id: a.alumno_id, estado: a.estado,
            minutos_retraso: a.minutos_retraso, observaciones: a.observaciones || '',
          }, c);
        }
      }
    } else {
      if (!actual) throw new HttpError(409, 'Primero tienes que fichar la entrada.');
      if (actual.salida) throw new HttpError(409, 'Ya has fichado la salida hoy.');
      ({ rows: [f] } = await c.query('UPDATE fichajes SET salida = now() WHERE id = $1 RETURNING *', [actual.id]));
    }

    await emitir(`fichaje.${tipo}`, {
      fichaje_id: f.id, alumno_id: u.alumno_id, nombre: u.nombre, fecha,
      entrada: f.entrada, salida: f.salida, sesion_id: sesion?.id ?? null,
    }, c);
    return f;
  });

  res.json({ fichaje });
});

alumno.get('/calendario', async (req, res) => {
  const { mes } = validar(z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/) }), req.query);
  const desde = `${mes}-01`;
  const params = [desde];
  const hasta = `($1::date + interval '1 month')::date`;
  const [sesiones, eventos, limites, fichajes] = await Promise.all([
    query(`SELECT s.id, s.fecha, s.hora_inicio, s.hora_fin, s.titulo, s.lugar, s.tema_id, t.titulo AS tema_titulo
           FROM sesiones s LEFT JOIN temas t ON t.id = s.tema_id
           WHERE s.fecha >= $1 AND s.fecha < ${hasta} ORDER BY s.fecha`, params),
    query(`SELECT * FROM eventos WHERE fecha >= $1 AND fecha < ${hasta} ORDER BY fecha`, params),
    query(`SELECT e.id, e.titulo, e.fecha_limite AS fecha,
                  EXISTS (SELECT 1 FROM resultados r WHERE r.ejercicio_id = e.id AND r.alumno_id = $2) AS entregado
           FROM ejercicios e JOIN temas t ON t.id = e.tema_id AND t.visible
           WHERE e.visible AND e.fecha_limite >= $1 AND e.fecha_limite < ${hasta}`, [desde, req.usuario.alumno_id]),
    query(`SELECT fecha, entrada, salida FROM fichajes WHERE usuario_id = $2 AND fecha >= $1 AND fecha < ${hasta}`, [desde, req.usuario.id]),
  ]);
  res.json({ sesiones, eventos, limites, fichajes });
});

alumno.get('/ejercicios', async (req, res) => {
  res.json(await query(SQL_EJERCICIOS, [req.usuario.alumno_id]));
});

alumno.get('/ejercicios/:id/entregas', async (req, res) => {
  res.json(await query(
    `SELECT id, intento, fecha, estado, archivo_nombre, mensaje, nota_10, nivel_autonomia, comentario, revisado_en
     FROM resultados WHERE alumno_id = $1 AND ejercicio_id = $2 ORDER BY intento DESC`,
    [req.usuario.alumno_id, req.params.id],
  ));
});

alumno.post('/ejercicios/:id/entregas', subida.single('archivo'), async (req, res) => {
  const archivo = req.file;
  try {
    if (!archivo) throw new HttpError(400, 'Elige el archivo que quieres entregar.');
    const mensaje = typeof req.body.mensaje === 'string' ? req.body.mensaje.trim().slice(0, 2000) : '';
    const ejercicio = await one(
      'SELECT e.* FROM ejercicios e JOIN temas t ON t.id = e.tema_id WHERE e.id = $1 AND e.visible AND t.visible',
      [req.params.id],
    );
    if (!ejercicio) throw noEncontrado('El ejercicio');
    const u = req.usuario;

    const resultado = await transaccion(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${u.alumno_id}_${ejercicio.id}`]);
      const { rows: [{ n }] } = await c.query(
        'SELECT COALESCE(MAX(intento), 0) + 1 AS n FROM resultados WHERE alumno_id = $1 AND ejercicio_id = $2',
        [u.alumno_id, ejercicio.id],
      );
      const { rows: [r] } = await c.query(
        `INSERT INTO resultados (id, alumno_id, ejercicio_id, intento, archivo, archivo_nombre, archivo_tipo, mensaje)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [idResultado(u.alumno_id, ejercicio.id, n), u.alumno_id, ejercicio.id, n, archivo.filename, archivo.originalname, archivo.mimetype, mensaje || null],
      );
      await emitir('entrega.creada', {
        resultado_id: r.id, alumno_id: u.alumno_id, nombre: u.nombre, ejercicio_id: ejercicio.id,
        tema_id: ejercicio.tema_id, intento: r.intento, fecha: r.fecha, estado: 'Entregado',
        archivo_nombre: `${u.alumno_id}_${archivo.originalname}`, archivo_tipo: archivo.mimetype, archivo_bytes: archivo.size,
        // n8n descarga el archivo desde aquí (cabecera X-API-Key) y lo sube a "03 Entregas de alumnos"
        archivo_url: `${config.appUrl}/api/integraciones/entregas/${encodeURIComponent(r.id)}/archivo`,
        mensaje: mensaje || '',
      }, c);
      return r;
    });
    res.status(201).json({ ...resultado, archivo: undefined });
  } catch (err) {
    if (archivo) borrarArchivo(archivo.filename);
    throw err;
  }
});

alumno.get('/entregas/:id/archivo', async (req, res) => {
  const r = await one('SELECT * FROM resultados WHERE id = $1 AND alumno_id = $2', [req.params.id, req.usuario.alumno_id]);
  if (!r?.archivo) throw noEncontrado('La entrega');
  enviarArchivo(res, r.archivo, r.archivo_nombre);
});
