// API para n8n (cabecera X-API-Key). Las columnas se llaman igual que en el Sheet
// "CCD2026 Seguimiento de alumnos", así cada flujo puede volcar filas sin transformarlas.
import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { requiereApiKey } from '../lib/auth.js';
import { enviarArchivo } from '../lib/archivos.js';
import { noEncontrado, textoOpcional, validar } from '../lib/http.js';

export const integraciones = Router();
integraciones.use(requiereApiKey);

const EXPORTS = {
  alumnos: `SELECT alumno_id, nombre, grupo, CASE estado WHEN 'activo' THEN 'Activo' ELSE 'Baja' END AS estado,
              to_char(creado_en, 'YYYY-MM-DD') AS fecha_alta, COALESCE(observaciones, '') AS observaciones, email
            FROM usuarios WHERE rol = 'alumno' ORDER BY alumno_id`,
  sesiones: `SELECT id AS sesion_id, fecha, COALESCE(unidad_id, '') AS unidad_id, COALESCE(tema_id, '') AS tema_id,
               CASE WHEN hora_inicio IS NOT NULL AND hora_fin IS NOT NULL
                    THEN (EXTRACT(EPOCH FROM hora_fin - hora_inicio) / 60)::int END AS duracion_min,
               CASE estado WHEN 'cerrada' THEN 'Cerrada' ELSE 'Planificada' END AS estado, COALESCE(observaciones, '') AS observaciones
             FROM sesiones ORDER BY id`,
  asistencia: `SELECT id AS asistencia_id, sesion_id, alumno_id, estado, minutos_retraso, COALESCE(observaciones, '') AS observaciones
               FROM asistencia ORDER BY id`,
  resultados: `SELECT id AS resultado_id, alumno_id, ejercicio_id, intento, to_char(fecha, 'YYYY-MM-DD HH24:MI') AS fecha, estado,
                 nivel_autonomia, nota_10, COALESCE(entrega_url, '') AS entrega_url, COALESCE(dificultad, '') AS dificultad,
                 COALESCE(accion_refuerzo, '') AS accion_refuerzo
               FROM resultados ORDER BY id`,
  fichajes: `SELECT f.id AS fichaje_id, u.alumno_id, u.nombre, f.fecha, to_char(f.entrada, 'HH24:MI') AS entrada,
               to_char(f.salida, 'HH24:MI') AS salida
             FROM fichajes f JOIN usuarios u ON u.id = f.usuario_id WHERE u.rol = 'alumno' ORDER BY f.fecha, u.alumno_id`,
  catalogo: `SELECT 'CCD2026' AS curso_id, t.unidad_id, t.id AS tema_id, t.titulo AS tema, e.id AS ejercicio_id, t.objetivo,
               e.entrega, t.doc_url AS teoria_url, e.doc_url AS ejercicio_url
             FROM temas t LEFT JOIN ejercicios e ON e.tema_id = t.id ORDER BY t.orden, e.id`,
};

integraciones.get('/estado', (_req, res) => res.json({ ok: true, tablas: Object.keys(EXPORTS) }));

// Para resincronizar el Sheet completo
integraciones.get('/export/:tabla', async (req, res) => {
  const sql = EXPORTS[req.params.tabla];
  if (!sql) throw noEncontrado('La tabla');
  res.json(await query(sql));
});

// Archivo de una entrega, para subirlo a la carpeta "03 Entregas de alumnos" de Drive
integraciones.get('/entregas/:id/archivo', async (req, res) => {
  const r = await one('SELECT archivo, archivo_nombre, alumno_id FROM resultados WHERE id = $1', [req.params.id]);
  if (!r?.archivo) throw noEncontrado('El archivo');
  enviarArchivo(res, r.archivo, `${r.alumno_id}_${r.archivo_nombre}`);
});

// n8n devuelve el enlace de Drive tras subir el archivo
integraciones.patch('/entregas/:id', async (req, res) => {
  const { entrega_url: url } = validar(z.object({ entrega_url: textoOpcional }), req.body);
  const r = await one('UPDATE resultados SET entrega_url = $2 WHERE id = $1 RETURNING id, entrega_url', [req.params.id, url]);
  if (!r) throw noEncontrado('La entrega');
  res.json(r);
});
