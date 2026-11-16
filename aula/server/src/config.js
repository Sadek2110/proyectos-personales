import path from 'node:path';

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

const produccion = process.env.NODE_ENV === 'production';

export const config = {
  produccion,
  puerto: Number(process.env.PORT || 3000),
  databaseUrl: requerida('DATABASE_URL'),
  jwtSecret: produccion ? requerida('JWT_SECRET') : process.env.JWT_SECRET || 'desarrollo-no-usar-en-produccion',
  // URL pública de la app, para los enlaces de invitación y los de descarga que se mandan a n8n
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  uploadsDir: path.resolve(process.env.UPLOADS_DIR || './data/uploads'),
  zonaHoraria: process.env.TZ_CURSO || 'Europe/Madrid',
  // Minutos de cortesía antes de marcar Retraso al fichar
  toleranciaRetraso: Number(process.env.TOLERANCIA_RETRASO_MIN || 10),
  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    nombre: process.env.ADMIN_NOMBRE || 'Administrador',
  },
  n8n: {
    // Un único webhook de n8n recibe todos los eventos; el campo "evento" indica cuál es
    webhookUrl: process.env.N8N_WEBHOOK_URL || '',
    secreto: process.env.N8N_WEBHOOK_SECRET || '',
    // Clave con la que n8n llama a /api/integraciones
    apiKey: process.env.INTEGRACIONES_API_KEY || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  },
};
