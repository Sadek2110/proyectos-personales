// Generación de IDs de negocio consecutivos (ALU001, SES001), iguales a los del Sheet.
// Deben llamarse dentro de una transacción: el bloqueo evita que dos altas simultáneas
// reciban el mismo número.

async function siguiente(cliente, { tabla, columna, prefijo, bloqueo }) {
  await cliente.query('SELECT pg_advisory_xact_lock($1)', [bloqueo]);
  const { rows } = await cliente.query(
    `SELECT COALESCE(MAX(substring(${columna} FROM '^${prefijo}(\\d+)$')::int), 0) + 1 AS n FROM ${tabla}`,
  );
  return `${prefijo}${String(rows[0].n).padStart(3, '0')}`;
}

export const siguienteAlumnoId = (c) => siguiente(c, { tabla: 'usuarios', columna: 'alumno_id', prefijo: 'ALU', bloqueo: 1001 });
export const siguienteSesionId = (c) => siguiente(c, { tabla: 'sesiones', columna: 'id', prefijo: 'SES', bloqueo: 1002 });

export const idAsistencia = (sesionId, alumnoId) => `${sesionId}_${alumnoId}`;
export const idResultado = (alumnoId, ejercicioId, intento) => `${alumnoId}_${ejercicioId}_I${String(intento).padStart(2, '0')}`;
