// CRUD genérico para el administrador: puede ver, crear, editar y borrar cualquier
// registro de la aplicación. Solo se aceptan las tablas y columnas declaradas aquí.
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { config } from '../config.js';
import { one, query, transaccion } from '../db.js';
import { requiere, tokenAleatorio } from '../lib/auth.js';
import { borrarArchivo } from '../lib/archivos.js';
import { hoy } from '../lib/fechas.js';
import { HttpError, noEncontrado } from '../lib/http.js';
import { siguienteAlumnoId } from '../lib/ids.js';
import { emitir, reintentar } from '../lib/n8n.js';

export const admin = Router();
admin.use(requiere('admin'));

// tipo: texto | largo | numero | fecha | hora | bool | opcion | password | soloLectura
const TABLAS = {
  usuarios: {
    titulo: 'Usuarios', pk: 'id', orden: 'rol, alumno_id NULLS LAST, id', buscar: ['nombre', 'email', 'alumno_id'],
    columnas: {
      id: { tipo: 'soloLectura' },
      alumno_id: { tipo: 'texto', ayuda: 'Se asigna solo al crear un alumno' },
      nombre: { tipo: 'texto', requerido: true },
      email: { tipo: 'texto', requerido: true },
      rol: { tipo: 'opcion', opciones: ['alumno', 'profesor', 'admin'], requerido: true },
      estado: { tipo: 'opcion', opciones: ['activo', 'baja'] },
      grupo: { tipo: 'texto' },
      observaciones: { tipo: 'largo' },
      password: { tipo: 'password', ayuda: 'Déjalo vacío para no cambiarla' },
      creado_en: { tipo: 'soloLectura' },
    },
  },
  unidades: {
    titulo: 'Unidades', pk: 'id', orden: 'orden, id', buscar: ['id', 'titulo'], pkEditable: true,
    columnas: { id: { tipo: 'texto', requerido: true }, titulo: { tipo: 'texto', requerido: true }, orden: { tipo: 'numero' } },
  },
  temas: {
    titulo: 'Temas', pk: 'id', orden: 'orden, id', buscar: ['id', 'titulo'], pkEditable: true,
    columnas: {
      id: { tipo: 'texto', requerido: true }, unidad_id: { tipo: 'texto', requerido: true }, titulo: { tipo: 'texto', requerido: true },
      objetivo: { tipo: 'largo' }, contenido: { tipo: 'largo' }, doc_url: { tipo: 'texto' }, minutos: { tipo: 'numero' },
      visible: { tipo: 'bool' }, orden: { tipo: 'numero' }, archivo_nombre: { tipo: 'soloLectura' },
    },
  },
  ejercicios: {
    titulo: 'Ejercicios', pk: 'id', orden: 'id', buscar: ['id', 'titulo'], pkEditable: true,
    columnas: {
      id: { tipo: 'texto', requerido: true }, tema_id: { tipo: 'texto', requerido: true }, titulo: { tipo: 'texto', requerido: true },
      enunciado: { tipo: 'largo' }, entrega: { tipo: 'texto' }, minutos: { tipo: 'texto' }, fecha_limite: { tipo: 'fecha' },
      doc_url: { tipo: 'texto' }, visible: { tipo: 'bool' },
    },
  },
  sesiones: {
    titulo: 'Sesiones', pk: 'id', orden: 'fecha, hora_inicio', buscar: ['id', 'titulo'], pkEditable: true,
    columnas: {
      id: { tipo: 'texto', requerido: true }, fecha: { tipo: 'fecha', requerido: true }, hora_inicio: { tipo: 'hora' }, hora_fin: { tipo: 'hora' },
      titulo: { tipo: 'texto', requerido: true }, unidad_id: { tipo: 'texto' }, tema_id: { tipo: 'texto' }, lugar: { tipo: 'texto' },
      estado: { tipo: 'opcion', opciones: ['planificada', 'cerrada'] }, observaciones: { tipo: 'largo' },
    },
  },
  eventos: {
    titulo: 'Eventos del calendario', pk: 'id', orden: 'fecha', buscar: ['titulo'],
    columnas: {
      id: { tipo: 'soloLectura' }, fecha: { tipo: 'fecha', requerido: true }, titulo: { tipo: 'texto', requerido: true },
      detalle: { tipo: 'largo' }, tipo: { tipo: 'opcion', opciones: ['aviso', 'festivo', 'examen'] },
    },
  },
  fichajes: {
    titulo: 'Fichajes', pk: 'id', orden: 'fecha DESC, entrada DESC', buscar: [],
    columnas: {
      id: { tipo: 'soloLectura' }, usuario_id: { tipo: 'numero', requerido: true }, fecha: { tipo: 'fecha', requerido: true },
      entrada: { tipo: 'texto', requerido: true, ayuda: 'Fecha y hora, p. ej. 2026-10-08 09:05' }, salida: { tipo: 'texto' },
    },
  },
  asistencia: {
    titulo: 'Asistencia', pk: 'id', orden: 'sesion_id DESC, alumno_id', buscar: ['id', 'alumno_id', 'sesion_id'], pkEditable: true,
    columnas: {
      id: { tipo: 'texto', requerido: true, ayuda: 'SES001_ALU001' }, sesion_id: { tipo: 'texto', requerido: true }, alumno_id: { tipo: 'texto', requerido: true },
      estado: { tipo: 'opcion', opciones: ['Presente', 'Retraso', 'Ausente', 'Justificada'], requerido: true },
      minutos_retraso: { tipo: 'numero' }, observaciones: { tipo: 'largo' }, origen: { tipo: 'opcion', opciones: ['profesor', 'fichaje'] },
    },
  },
  resultados: {
    titulo: 'Entregas y resultados', pk: 'id', orden: 'fecha DESC', buscar: ['id', 'alumno_id', 'ejercicio_id'], pkEditable: true,
    columnas: {
      id: { tipo: 'texto', requerido: true }, alumno_id: { tipo: 'texto', requerido: true }, ejercicio_id: { tipo: 'texto', requerido: true },
      intento: { tipo: 'numero', requerido: true }, fecha: { tipo: 'soloLectura' }, estado: { tipo: 'opcion', opciones: ['Entregado', 'Revisado'] },
      archivo_nombre: { tipo: 'soloLectura' }, mensaje: { tipo: 'largo' }, entrega_url: { tipo: 'texto' },
      nivel_autonomia: { tipo: 'numero' }, nota_10: { tipo: 'numero' }, dificultad: { tipo: 'texto' },
      accion_refuerzo: { tipo: 'texto' }, comentario: { tipo: 'largo' },
    },
  },
  invitaciones: {
    titulo: 'Invitaciones', pk: 'token', orden: 'creada_en DESC', buscar: ['email'],
    columnas: {
      token: { tipo: 'soloLectura' }, email: { tipo: 'texto', requerido: true }, nombre: { tipo: 'texto' },
      rol: { tipo: 'opcion', opciones: ['alumno', 'profesor', 'admin'] }, grupo: { tipo: 'texto' },
      tipo: { tipo: 'opcion', opciones: ['alta', 'reset'] }, creada_en: { tipo: 'soloLectura' },
      expira_en: { tipo: 'texto', requerido: true }, usada_en: { tipo: 'texto' },
    },
  },
};

function tabla(nombre) {
  const t = TABLAS[nombre];
  if (!t) throw noEncontrado('La tabla');
  return t;
}

/** Convierte los valores del formulario al tipo de cada columna */
function limpiar(def, cuerpo, { creando }) {
  const datos = {};
  for (const [col, c] of Object.entries(def.columnas)) {
    if (c.tipo === 'soloLectura' || c.tipo === 'password') continue;
    if (col === def.pk && !creando && !def.pkEditable) continue;
    if (!(col in cuerpo)) continue;
    let v = cuerpo[col];
    if (v === '' || v === undefined) v = null;
    if (v !== null && c.tipo === 'numero') {
      v = Number(String(v).replace(',', '.'));
      if (Number.isNaN(v)) throw new HttpError(400, `«${col}» tiene que ser un número.`);
    }
    if (v !== null && c.tipo === 'bool') v = v === true || v === 'true';
    if (v !== null && c.tipo === 'opcion' && !c.opciones.includes(v)) throw new HttpError(400, `«${col}» no admite el valor ${v}.`);
    if (v === null && c.requerido) throw new HttpError(400, `Falta el campo «${col}».`);
    datos[col] = v;
  }
  return datos;
}

admin.get('/tablas', (_req, res) => {
  res.json(Object.entries(TABLAS).map(([nombre, t]) => ({ nombre, titulo: t.titulo, pk: t.pk, pkEditable: Boolean(t.pkEditable), columnas: t.columnas })));
});

admin.get('/tablas/:tabla', async (req, res) => {
  const def = tabla(req.params.tabla);
  const buscar = String(req.query.buscar || '').trim();
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const porPagina = 50;
  const cols = Object.keys(def.columnas).filter((c) => def.columnas[c].tipo !== 'password');
  const where = buscar && def.buscar.length ? `WHERE ${def.buscar.map((c) => `${c}::text ILIKE $1`).join(' OR ')}` : '';
  const params = where ? [`%${buscar}%`] : [];
  const [filas, total] = await Promise.all([
    query(`SELECT ${cols.join(', ')} FROM ${req.params.tabla} ${where} ORDER BY ${def.orden} LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`, params),
    one(`SELECT count(*)::int AS n FROM ${req.params.tabla} ${where}`, params),
  ]);
  res.json({ filas, total: total.n, pagina, porPagina });
});

admin.post('/tablas/:tabla', async (req, res) => {
  const nombre = req.params.tabla;
  const def = tabla(nombre);
  const datos = limpiar(def, req.body, { creando: true });

  const fila = await transaccion(async (c) => {
    if (nombre === 'usuarios') {
      datos.email = datos.email?.toLowerCase();
      if (req.body.password) datos.password_hash = await bcrypt.hash(String(req.body.password), 10);
      if (datos.rol === 'alumno' && !datos.alumno_id) datos.alumno_id = await siguienteAlumnoId(c);
    }
    if (nombre === 'invitaciones') datos.token = tokenAleatorio();
    const cols = Object.keys(datos);
    const { rows: [f] } = await c.query(
      `INSERT INTO ${nombre} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      cols.map((k) => datos[k]),
    );
    if (nombre === 'usuarios' && f.alumno_id) {
      await emitir('alumno.alta', { alumno_id: f.alumno_id, nombre: f.nombre, email: f.email, grupo: f.grupo, estado: 'Activo', fecha_alta: hoy(), observaciones: f.observaciones || '' }, c);
    }
    return f;
  });
  delete fila.password_hash;
  res.status(201).json(fila);
});

admin.put('/tablas/:tabla/:id', async (req, res) => {
  const nombre = req.params.tabla;
  const def = tabla(nombre);
  const datos = limpiar(def, req.body, { creando: false });
  if (nombre === 'usuarios') {
    if (datos.email) datos.email = datos.email.toLowerCase();
    if (req.body.password) datos.password_hash = await bcrypt.hash(String(req.body.password), 10);
    if (Number(req.params.id) === req.usuario.id && (datos.rol && datos.rol !== 'admin' || datos.estado === 'baja')) {
      throw new HttpError(400, 'No puedes quitarte a ti mismo el rol de administrador ni darte de baja.');
    }
  }
  const cols = Object.keys(datos);
  if (!cols.length) throw new HttpError(400, 'No hay cambios que guardar.');
  const f = await one(
    `UPDATE ${nombre} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE ${def.pk} = $1 RETURNING *`,
    [req.params.id, ...cols.map((k) => datos[k])],
  );
  if (!f) throw noEncontrado('El registro');
  delete f.password_hash;
  res.json(f);
});

admin.delete('/tablas/:tabla/:id', async (req, res) => {
  const nombre = req.params.tabla;
  const def = tabla(nombre);
  if (nombre === 'usuarios' && Number(req.params.id) === req.usuario.id) throw new HttpError(400, 'No puedes borrar tu propia cuenta.');
  const f = await one(`DELETE FROM ${nombre} WHERE ${def.pk} = $1 RETURNING *`, [req.params.id]);
  if (!f) throw noEncontrado('El registro');
  if (f.archivo) borrarArchivo(f.archivo);
  if (nombre === 'usuarios' && f.alumno_id) await emitir('alumno.borrado', { alumno_id: f.alumno_id });
  if (nombre === 'asistencia') await emitir('asistencia.borrada', { asistencia_id: f.id });
  if (nombre === 'resultados') await emitir('resultado.borrado', { resultado_id: f.id });
  res.json({ ok: true });
});

// ---------- Integraciones (n8n) ----------

admin.get('/integraciones', async (req, res) => {
  const estado = ['pendiente', 'enviado', 'error'].includes(req.query.estado) ? req.query.estado : null;
  const [eventos, resumen] = await Promise.all([
    query(`SELECT id, evento, payload, estado, intentos, ultimo_error, creado_en, enviado_en FROM eventos_n8n
           WHERE ($1::text IS NULL OR estado = $1) ORDER BY id DESC LIMIT 100`, [estado]),
    query('SELECT estado, count(*)::int AS n FROM eventos_n8n GROUP BY estado'),
  ]);
  res.json({
    configuracion: {
      webhook: Boolean(config.n8n.webhookUrl),
      secreto: Boolean(config.n8n.secreto),
      api_key: Boolean(config.n8n.apiKey),
      app_url: config.appUrl,
    },
    resumen: Object.fromEntries(resumen.map((r) => [r.estado, r.n])),
    eventos,
  });
});

admin.post('/integraciones/:id/reintentar', async (req, res) => {
  await reintentar(req.params.id);
  res.json({ ok: true });
});

admin.post('/integraciones/prueba', async (req, res) => {
  await emitir('prueba', { mensaje: 'Evento de prueba enviado desde Aula Conserjería', usuario: req.usuario.email });
  res.json({ ok: true });
});
