import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { one, transaccion } from './db.js';

const archivoCatalogo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'catalogo.json');
const docUrl = (id) => (id ? `https://docs.google.com/document/d/${id}` : null);

export function contenidoTema(t) {
  return [
    '## Qué aprenderás',
    t.objetivo,
    '## Lo que necesitas saber',
    ...t.saber,
    '## Antes de practicar',
    `Busca el ejercicio ${t.id}_E01. Realiza primero la tarea con apoyo y después vuelve a intentarla por tu cuenta.`,
  ].join('\n\n');
}

export function enunciadoEjercicio(t) {
  return [
    '## Situación',
    `${t.objetivo} Trabaja con la comunidad ficticia Edificio Mirador.`,
    '## Pasos',
    t.pasos.map((p, i) => `${i + 1}. ${p}`).join('\n'),
    '## Qué tienes que entregar',
    `${t.entrega}. Pon tu identificador de alumno al principio del nombre del archivo.`,
    '## Comprueba tu trabajo',
    t.comprueba.map((c) => `- ${c}`).join('\n'),
    '## Si necesitas practicar más',
    t.mas,
    '## Si terminas pronto',
    t.pronto,
  ].join('\n\n');
}

// Inserta el catálogo del curso la primera vez. Nunca pisa lo que el profesor haya editado.
export async function sembrar() {
  const catalogo = JSON.parse(await fs.readFile(archivoCatalogo, 'utf8'));
  await transaccion(async (c) => {
    for (const [i, [id, titulo]] of catalogo.unidades.entries()) {
      await c.query('INSERT INTO unidades (id, titulo, orden) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, titulo, i + 1]);
    }
    for (const [i, t] of catalogo.temas.entries()) {
      await c.query(
        `INSERT INTO temas (id, unidad_id, titulo, objetivo, contenido, doc_url, minutos, orden)
         VALUES ($1, $2, $3, $4, $5, $6, 15, $7) ON CONFLICT DO NOTHING`,
        [t.id, t.unidad, t.titulo, t.objetivo, contenidoTema(t), docUrl(t.teoria), i + 1],
      );
      await c.query(
        `INSERT INTO ejercicios (id, tema_id, titulo, enunciado, entrega, minutos, doc_url)
         VALUES ($1, $2, $3, $4, $5, '20–35 min', $6) ON CONFLICT DO NOTHING`,
        [`${t.id}_E01`, t.id, `Práctica: ${t.titulo}`, enunciadoEjercicio(t), t.entrega, docUrl(t.practica)],
      );
    }
    for (const s of catalogo.sesiones) {
      await c.query(
        `INSERT INTO sesiones (id, fecha, titulo, unidad_id, tema_id, lugar, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [s.id, s.fecha, s.titulo, s.unidad, s.tema, s.lugar, s.observaciones],
      );
    }
  });

  const { email, password, nombre } = config.admin;
  if (email && password) {
    const existe = await one('SELECT id FROM usuarios WHERE lower(email) = lower($1)', [email]);
    if (!existe) {
      await one(
        `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, lower($2), $3, 'admin') RETURNING id`,
        [nombre, email, await bcrypt.hash(password, 10)],
      );
      console.log(`Administrador creado: ${email}`);
    }
  }
}
