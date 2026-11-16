import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { requiere } from '../lib/auth.js';
import { borrarArchivo, enviarArchivo, subida } from '../lib/archivos.js';
import { generarDocx, generarPdf, nombreArchivo } from '../lib/documentos.js';
import { HttpError, fechaOpcional, noEncontrado, textoOpcional, validar } from '../lib/http.js';

export const catalogo = Router();
catalogo.use(requiere());

const esProfesor = (req) => req.usuario.rol !== 'alumno';

// ---------- Lectura ----------

catalogo.get('/unidades', async (req, res) => {
  const soloVisibles = !esProfesor(req);
  const [unidades, temas, ejercicios] = await Promise.all([
    query('SELECT * FROM unidades ORDER BY orden, id'),
    query(`SELECT id, unidad_id, titulo, objetivo, minutos, visible, orden, doc_url, archivo_nombre FROM temas ${soloVisibles ? 'WHERE visible' : ''} ORDER BY orden, id`),
    query(`SELECT id, tema_id, titulo, visible, fecha_limite FROM ejercicios ${soloVisibles ? 'WHERE visible' : ''} ORDER BY id`),
  ]);
  res.json(unidades.map((u) => ({
    ...u,
    temas: temas.filter((t) => t.unidad_id === u.id).map((t) => ({ ...t, ejercicios: ejercicios.filter((e) => e.tema_id === t.id) })),
  })).filter((u) => !soloVisibles || u.temas.length));
});

async function temaVisible(req, id) {
  const t = await one(
    `SELECT t.*, u.titulo AS unidad_titulo FROM temas t JOIN unidades u ON u.id = t.unidad_id WHERE t.id = $1`,
    [id],
  );
  if (!t || (!t.visible && !esProfesor(req))) throw noEncontrado('El tema');
  return t;
}

async function ejercicioVisible(req, id) {
  const e = await one(
    `SELECT e.*, t.titulo AS tema_titulo, t.unidad_id, t.visible AS tema_visible
     FROM ejercicios e JOIN temas t ON t.id = e.tema_id WHERE e.id = $1`,
    [id],
  );
  if (!e || ((!e.visible || !e.tema_visible) && !esProfesor(req))) throw noEncontrado('El ejercicio');
  return e;
}

catalogo.get('/temas/:id', async (req, res) => {
  const t = await temaVisible(req, req.params.id);
  const ejercicios = await query(`SELECT id, titulo, entrega, minutos, fecha_limite, visible FROM ejercicios WHERE tema_id = $1 ${esProfesor(req) ? '' : 'AND visible'} ORDER BY id`, [t.id]);
  const vecinos = await query(`SELECT id, titulo FROM temas ${esProfesor(req) ? '' : 'WHERE visible'} ORDER BY orden, id`);
  const i = vecinos.findIndex((v) => v.id === t.id);
  res.json({ ...t, archivo: undefined, tiene_archivo: Boolean(t.archivo), ejercicios, anterior: vecinos[i - 1] ?? null, siguiente: vecinos[i + 1] ?? null });
});

catalogo.get('/ejercicios/:id', async (req, res) => {
  res.json(await ejercicioVisible(req, req.params.id));
});

async function descargar(res, formato, { id, titulo, subtitulo, markdown }) {
  if (formato === 'docx') {
    const buffer = await generarDocx({ titulo, subtitulo, markdown });
    res.attachment(nombreArchivo(id, titulo, 'docx'));
    res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(buffer);
  } else {
    res.attachment(nombreArchivo(id, titulo, 'pdf'));
    res.type('application/pdf');
    generarPdf({ titulo, subtitulo, markdown }).pipe(res);
  }
}

const formatoDescarga = z.object({ formato: z.enum(['pdf', 'docx', 'original']).default('pdf') });

catalogo.get('/temas/:id/descargar', async (req, res) => {
  const { formato } = validar(formatoDescarga, req.query);
  const t = await temaVisible(req, req.params.id);
  // Si el profesor ha subido su propio archivo para este tema, se descarga ese
  if (formato === 'original') {
    if (!t.archivo) throw noEncontrado('El archivo del tema');
    return enviarArchivo(res, t.archivo, t.archivo_nombre);
  }
  await descargar(res, formato, { id: t.id, titulo: t.titulo, subtitulo: `${t.unidad_id} ${t.unidad_titulo} · Tema ${t.id}`, markdown: t.contenido });
});

catalogo.get('/ejercicios/:id/descargar', async (req, res) => {
  const { formato } = validar(formatoDescarga, req.query);
  const e = await ejercicioVisible(req, req.params.id);
  await descargar(res, formato === 'original' ? 'pdf' : formato, { id: e.id, titulo: e.titulo, subtitulo: `Ejercicio ${e.id} · Tiempo orientativo ${e.minutos || '—'}`, markdown: e.enunciado });
});

// ---------- Edición (profesor y admin) ----------

const profesor = requiere('profesor');
const idTexto = (patron, ejemplo) => z.string().trim().toUpperCase().regex(patron, `usa el formato ${ejemplo}`);

const esquemaUnidad = z.object({
  id: idTexto(/^U\d{2}$/, 'U01'),
  titulo: z.string().trim().min(1),
  orden: z.coerce.number().int().default(0),
});

catalogo.post('/unidades', profesor, async (req, res) => {
  const d = validar(esquemaUnidad, req.body);
  res.status(201).json(await one('INSERT INTO unidades (id, titulo, orden) VALUES ($1, $2, $3) RETURNING *', [d.id, d.titulo, d.orden]));
});

catalogo.put('/unidades/:id', profesor, async (req, res) => {
  const d = validar(esquemaUnidad, req.body);
  const u = await one('UPDATE unidades SET id = $2, titulo = $3, orden = $4 WHERE id = $1 RETURNING *', [req.params.id, d.id, d.titulo, d.orden]);
  if (!u) throw noEncontrado('La unidad');
  res.json(u);
});

catalogo.delete('/unidades/:id', profesor, async (req, res) => {
  const u = await one('DELETE FROM unidades WHERE id = $1 RETURNING id', [req.params.id]);
  if (!u) throw noEncontrado('La unidad');
  res.json({ ok: true });
});

const esquemaTema = z.object({
  id: idTexto(/^T\d{2}$/, 'T01'),
  unidad_id: idTexto(/^U\d{2}$/, 'U01'),
  titulo: z.string().trim().min(1),
  objetivo: textoOpcional,
  contenido: z.string().default(''),
  doc_url: textoOpcional,
  minutos: z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.number().int().positive().nullable().optional()),
  visible: z.boolean().default(true),
  orden: z.coerce.number().int().default(0),
});

catalogo.post('/temas', profesor, async (req, res) => {
  const d = validar(esquemaTema, req.body);
  res.status(201).json(await one(
    `INSERT INTO temas (id, unidad_id, titulo, objetivo, contenido, doc_url, minutos, visible, orden)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [d.id, d.unidad_id, d.titulo, d.objetivo, d.contenido, d.doc_url, d.minutos, d.visible, d.orden],
  ));
});

catalogo.put('/temas/:id', profesor, async (req, res) => {
  const d = validar(esquemaTema, req.body);
  const t = await one(
    `UPDATE temas SET id = $2, unidad_id = $3, titulo = $4, objetivo = $5, contenido = $6, doc_url = $7, minutos = $8, visible = $9, orden = $10
     WHERE id = $1 RETURNING *`,
    [req.params.id, d.id, d.unidad_id, d.titulo, d.objetivo, d.contenido, d.doc_url, d.minutos, d.visible, d.orden],
  );
  if (!t) throw noEncontrado('El tema');
  res.json(t);
});

catalogo.delete('/temas/:id', profesor, async (req, res) => {
  const t = await one('DELETE FROM temas WHERE id = $1 RETURNING archivo', [req.params.id]);
  if (!t) throw noEncontrado('El tema');
  borrarArchivo(t.archivo);
  res.json({ ok: true });
});

catalogo.post('/temas/:id/archivo', profesor, subida.single('archivo'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Elige un archivo.');
  const anterior = await one('SELECT archivo FROM temas WHERE id = $1', [req.params.id]);
  if (!anterior) {
    borrarArchivo(req.file.filename);
    throw noEncontrado('El tema');
  }
  await query('UPDATE temas SET archivo = $2, archivo_nombre = $3 WHERE id = $1', [req.params.id, req.file.filename, req.file.originalname]);
  borrarArchivo(anterior.archivo);
  res.json({ archivo_nombre: req.file.originalname });
});

catalogo.delete('/temas/:id/archivo', profesor, async (req, res) => {
  const t = await one('SELECT archivo FROM temas WHERE id = $1', [req.params.id]);
  if (!t) throw noEncontrado('El tema');
  await query('UPDATE temas SET archivo = NULL, archivo_nombre = NULL WHERE id = $1', [req.params.id]);
  borrarArchivo(t.archivo);
  res.json({ ok: true });
});

const esquemaEjercicio = z.object({
  id: idTexto(/^T\d{2}_E\d{2}$/, 'T01_E01'),
  tema_id: idTexto(/^T\d{2}$/, 'T01'),
  titulo: z.string().trim().min(1),
  enunciado: z.string().default(''),
  entrega: textoOpcional,
  minutos: textoOpcional,
  fecha_limite: fechaOpcional,
  doc_url: textoOpcional,
  visible: z.boolean().default(true),
});

catalogo.post('/ejercicios', profesor, async (req, res) => {
  const d = validar(esquemaEjercicio, req.body);
  res.status(201).json(await one(
    `INSERT INTO ejercicios (id, tema_id, titulo, enunciado, entrega, minutos, fecha_limite, doc_url, visible)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [d.id, d.tema_id, d.titulo, d.enunciado, d.entrega, d.minutos, d.fecha_limite, d.doc_url, d.visible],
  ));
});

catalogo.put('/ejercicios/:id', profesor, async (req, res) => {
  const d = validar(esquemaEjercicio, req.body);
  const e = await one(
    `UPDATE ejercicios SET id = $2, tema_id = $3, titulo = $4, enunciado = $5, entrega = $6, minutos = $7, fecha_limite = $8, doc_url = $9, visible = $10
     WHERE id = $1 RETURNING *`,
    [req.params.id, d.id, d.tema_id, d.titulo, d.enunciado, d.entrega, d.minutos, d.fecha_limite, d.doc_url, d.visible],
  );
  if (!e) throw noEncontrado('El ejercicio');
  res.json(e);
});

catalogo.delete('/ejercicios/:id', profesor, async (req, res) => {
  const e = await one('DELETE FROM ejercicios WHERE id = $1 RETURNING id', [req.params.id]);
  if (!e) throw noEncontrado('El ejercicio');
  res.json({ ok: true });
});
