// Aplicación Express sin arrancar: index.js la pone a escuchar y los tests la usan directamente.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { pool } from './db.js';
import { cargarUsuario } from './lib/auth.js';
import { HttpError, manejadorErrores } from './lib/http.js';
import { admin } from './routes/admin.js';
import { alumno } from './routes/alumno.js';
import { auth } from './routes/auth.js';
import { catalogo } from './routes/catalogo.js';
import { integraciones } from './routes/integraciones.js';
import { profesor } from './routes/profesor.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Easypanel sirve la app detrás de su proxy con HTTPS

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/salud', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.use('/api/integraciones', integraciones);
app.use('/api', cargarUsuario);
app.use('/api/auth', auth);
app.use('/api/alumno', alumno);
app.use('/api/admin', admin);
app.use('/api', catalogo);
app.use('/api', profesor);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Esa ruta de la API no existe.')));

// En producción el mismo servidor entrega la web compilada
const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
if (fs.existsSync(web)) {
  app.use(express.static(web, { index: false, maxAge: '7d', setHeaders: (res, ruta) => {
    if (ruta.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  } }));
  app.get('/{*ruta}', (_req, res) => res.sendFile(path.join(web, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
}

app.use(manejadorErrores);
