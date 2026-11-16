import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

export const noEncontrado = (que = 'El elemento') => new HttpError(404, `${que} no existe.`);

/** Valida req.body con un esquema zod y devuelve los datos limpios */
export function validar(esquema, datos) {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const primero = r.error.issues[0];
    const campo = primero.path.join('.');
    throw new HttpError(400, campo ? `Revisa el campo «${campo}»: ${primero.message}` : primero.message);
  }
  return r.data;
}

// Campos de formulario: cadena vacía equivale a "sin valor"
export const textoOpcional = z.preprocess((v) => (v === '' ? null : v), z.string().trim().nullable().optional());
export const fechaOpcional = z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'usa el formato AAAA-MM-DD').nullable().optional());
export const horaOpcional = z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{2}:\d{2}$/, 'usa el formato HH:MM').nullable().optional());

export function manejadorErrores(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo es demasiado grande (máximo 25 MB).' });
  // Errores de PostgreSQL más habituales al editar datos
  if (err?.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con ese identificador o correo.' });
  if (err?.code === '23503') return res.status(409).json({ error: 'Ese registro está relacionado con otros datos. Borra o cambia primero los relacionados.' });
  if (err?.code === '23514' || err?.code === '22P02' || err?.code === '22007' || err?.code === '22008') {
    return res.status(400).json({ error: 'Algún valor no tiene el formato correcto.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Ha ocurrido un error en el servidor. Inténtalo de nuevo.' });
}
