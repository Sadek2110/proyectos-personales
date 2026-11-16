import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

try {
  writeFileSync('.env', [
    'PORT=3200',
    'HOST=127.0.0.1',
    'DATABASE_PATH=data/glovi.sqlite',
    `ADMIN_TOKEN=${randomBytes(32).toString('hex')}`,
    'GEMINI_API_KEY=',
    'GEMINI_MODEL=',
    'COOKIE_SECURE=false',
    'PUBLIC_ORIGIN=',
    'EMBED_ORIGINS=',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Configuración local creada en .env. El token del panel está en ADMIN_TOKEN.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env ya existe; se conserva su configuración.');
  else throw error;
}
