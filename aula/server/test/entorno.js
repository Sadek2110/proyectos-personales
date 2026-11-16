// Entorno de pruebas: una base de datos PostgreSQL real en memoria (PGlite), la API
// escuchando en un puerto libre y un falso n8n que registra los avisos que recibe.
// Cada archivo de test arranca el suyo, así que las pruebas no tocan producción.
import fs from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export const ADMIN = { email: 'admin@aula.test', password: 'Admin-12345' };
export const API_KEY = 'clave-integraciones-de-prueba';
export const SECRETO = 'secreto-webhook-de-prueba';

/** Cliente HTTP con su propia sesión (cookie), como un navegador */
export class Cliente {
  constructor(base) {
    this.base = base;
    this.cookie = '';
  }

  async pedir(metodo, ruta, { json, form, headers = {} } = {}) {
    const res = await fetch(this.base + ruta, {
      method: metodo,
      headers: {
        ...(this.cookie && { cookie: this.cookie }),
        ...(json !== undefined && { 'content-type': 'application/json' }),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : form,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const valor = setCookie.split(';')[0];
      this.cookie = valor.endsWith('=') ? '' : valor;
    }
    const tipo = res.headers.get('content-type') || '';
    const body = tipo.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, body, headers: res.headers };
  }

  get(ruta, opciones) { return this.pedir('GET', ruta, opciones); }
  post(ruta, json, opciones) { return this.pedir('POST', ruta, { ...opciones, json }); }
  put(ruta, json, opciones) { return this.pedir('PUT', ruta, { ...opciones, json }); }
  patch(ruta, json, opciones) { return this.pedir('PATCH', ruta, { ...opciones, json }); }
  del(ruta, opciones) { return this.pedir('DELETE', ruta, opciones); }

  /** Sube un archivo como multipart/form-data */
  subir(ruta, campo, nombre, contenido, extra = {}) {
    const form = new FormData();
    form.append(campo, new Blob([contenido]), nombre);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return this.pedir('POST', ruta, { form });
  }

  async entrar(email, password) {
    const r = await this.post('/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`No se pudo entrar como ${email}: ${r.status} ${JSON.stringify(r.body)}`);
    return this;
  }
}

/** Falso n8n: guarda cada petición y responde con el código que se le indique */
async function falsoN8n() {
  const n8n = { recibidos: [], estado: 200 };
  n8n.servidor = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      n8n.recibidos.push({ headers: req.headers, body: JSON.parse(cuerpo || '{}') });
      res.writeHead(n8n.estado, { 'content-type': 'application/json' }).end('{}');
    });
  });
  n8n.servidor.listen(0, '127.0.0.1');
  await once(n8n.servidor, 'listening');
  n8n.url = `http://127.0.0.1:${n8n.servidor.address().port}/webhook/aula`;
  return n8n;
}

export async function prepararEntorno() {
  const db = await PGlite.create();
  const puertoDb = 40000 + Math.floor(Math.random() * 20000);
  // PGlite admite una sola conexión: la API usará un pool de 1
  const socket = new PGLiteSocketServer({ db, port: puertoDb, host: '127.0.0.1', maxConnections: 1 });
  await socket.start();
  const n8n = await falsoN8n();
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'aula-test-'));

  // config.js lee el entorno al importarse: hay que fijarlo antes de cargar la app
  Object.assign(process.env, {
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${puertoDb}/postgres`,
    PG_POOL_MAX: '1',
    UPLOADS_DIR: uploads,
    APP_URL: 'http://aula.test',
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    ADMIN_NOMBRE: 'Admin de prueba',
    INTEGRACIONES_API_KEY: API_KEY,
    N8N_WEBHOOK_URL: n8n.url,
    N8N_WEBHOOK_SECRET: SECRETO,
    TOLERANCIA_RETRASO_MIN: '10',
  });
  const originalLog = console.log;
  console.log = () => {}; // silencia los avisos de migraciones y semilla
  const { migrar, pool, query, one, transaccion } = await import('../src/db.js');
  const { sembrar } = await import('../src/seed.js');
  const { app } = await import('../src/app.js');
  await migrar();
  await sembrar();
  console.log = originalLog;

  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const base = `http://127.0.0.1:${servidor.address().port}`;

  let siguiente = 1;
  const entorno = {
    base,
    n8n,
    query,
    one,
    transaccion,
    cliente: () => new Cliente(base),
    admin: () => new Cliente(base).entrar(ADMIN.email, ADMIN.password),

    /** Crea un usuario desde el CRUD del admin y devuelve su cliente ya identificado */
    async crearUsuario(rol, datos = {}) {
      const n = siguiente++;
      const email = datos.email || `${rol}${n}@aula.test`;
      const password = datos.password || `Clave-${rol}-${n}`;
      const adm = await entorno.admin();
      const r = await adm.post('/api/admin/tablas/usuarios', { nombre: datos.nombre || `${rol} ${n}`, email, rol, password, grupo: datos.grupo });
      if (r.status !== 201) throw new Error(`No se pudo crear ${rol}: ${JSON.stringify(r.body)}`);
      const cli = await new Cliente(base).entrar(email, password);
      return Object.assign(cli, { usuario: r.body, email, password });
    },

    /** Eventos guardados para n8n, del más antiguo al más reciente */
    eventos: (evento) => query('SELECT * FROM eventos_n8n WHERE ($1::text IS NULL OR evento = $1) ORDER BY id', [evento ?? null]),

    async cerrar() {
      servidor.closeAllConnections?.();
      servidor.close();
      n8n.servidor.close();
      await pool.end();
      await socket.stop();
      await db.close();
      fs.rmSync(uploads, { recursive: true, force: true });
    },
  };
  return entorno;
}
