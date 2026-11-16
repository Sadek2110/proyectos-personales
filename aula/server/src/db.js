import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

// DATE y TIME llegan como texto para no desplazar fechas por la zona horaria del servidor
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1083, (v) => v.slice(0, 5));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: Number(process.env.PG_POOL_MAX) || 10 });

export async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function transaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const dirMigraciones = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrar() {
  await query(`CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const aplicadas = new Set((await query('SELECT nombre FROM migraciones')).map((r) => r.nombre));
  const archivos = (await fs.readdir(dirMigraciones)).filter((f) => f.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = await fs.readFile(path.join(dirMigraciones, archivo), 'utf8');
    await transaccion(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO migraciones (nombre) VALUES ($1)', [archivo]);
    });
    console.log(`Migración aplicada: ${archivo}`);
  }
}
