import { config } from '../config.js';
import { pool, query } from '../db.js';

/**
 * Encola un evento para n8n. Si se pasa `cliente`, el evento se guarda dentro de
 * la misma transacción que el cambio que lo provoca: o se guardan los dos o ninguno.
 */
export async function emitir(evento, datos, cliente = pool) {
  await cliente.query('INSERT INTO eventos_n8n (evento, payload) VALUES ($1, $2)', [evento, JSON.stringify(datos)]);
}

const MAX_INTENTOS = 10;

async function enviar(fila) {
  const res = await fetch(config.n8n.webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.n8n.secreto && { 'x-webhook-secret': config.n8n.secreto }),
    },
    body: JSON.stringify({
      evento: fila.evento,
      // Clave de idempotencia: si n8n recibe dos veces el mismo id_evento, debe ignorar el segundo
      id_evento: Number(fila.id),
      fecha: fila.creado_en,
      curso_id: 'CCD2026',
      datos: fila.payload,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`n8n respondió ${res.status}`);
}

export async function procesarPendientes() {
  if (!config.n8n.webhookUrl) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SKIP LOCKED permite varias réplicas sin enviar dos veces el mismo evento; el orden por id respeta la secuencia
    const { rows } = await client.query(
      `SELECT * FROM eventos_n8n
       WHERE estado = 'pendiente' AND proximo_intento <= now()
       ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED`,
    );
    for (const fila of rows) {
      try {
        await enviar(fila);
        await client.query(`UPDATE eventos_n8n SET estado = 'enviado', enviado_en = now(), intentos = intentos + 1, ultimo_error = NULL WHERE id = $1`, [fila.id]);
      } catch (err) {
        const intentos = fila.intentos + 1;
        const esperaMin = Math.min(2 ** intentos, 60);
        await client.query(
          `UPDATE eventos_n8n SET intentos = $2::int, ultimo_error = $3,
             estado = CASE WHEN $2::int >= $4::int THEN 'error' ELSE 'pendiente' END,
             proximo_intento = now() + make_interval(mins => $5::int)
           WHERE id = $1`,
          [fila.id, intentos, String(err.message).slice(0, 500), MAX_INTENTOS, esperaMin],
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error procesando eventos de n8n:', err.message);
  } finally {
    client.release();
  }
}

export function arrancarCola() {
  let ocupado = false;
  setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await procesarPendientes();
    } finally {
      ocupado = false;
    }
  }, 5000).unref();
}

export async function reintentar(id) {
  await query(`UPDATE eventos_n8n SET estado = 'pendiente', proximo_intento = now() WHERE id = $1 AND estado <> 'enviado'`, [id]);
}
