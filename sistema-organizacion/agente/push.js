// Web Push: claves, suscripciones de cada dispositivo y envío.
'use strict';
const webpush = require('web-push');

const MAX_DISPOSITIVOS = 10;
const MAX_CUERPO = 1000; // los servicios de push rechazan los mensajes de más de unos 4 KB

function crearPush({ almacen, asunto }) {
  const { estado, guardar } = almacen;
  if (!estado.claves.vapid) {
    estado.claves.vapid = webpush.generateVAPIDKeys();
    guardar();
  }
  const { publicKey, privateKey } = estado.claves.vapid;
  const vapidDetails = { subject: asunto, publicKey, privateKey };

  return {
    clavePublica: publicKey,
    hayDispositivos: () => estado.suscripciones.length > 0,

    suscribir(s) {
      if (!s || typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://') || !s.keys?.p256dh || !s.keys?.auth) {
        throw new Error('Suscripción no válida');
      }
      const limpia = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
      estado.suscripciones = [...estado.suscripciones.filter(x => x.endpoint !== s.endpoint), limpia].slice(-MAX_DISPOSITIVOS);
      guardar();
    },

    desuscribir(endpoint) {
      estado.suscripciones = estado.suscripciones.filter(x => x.endpoint !== endpoint);
      guardar();
    },

    /** Devuelve cuántos dispositivos lo aceptaron, y si alguno falló por algo que se puede reintentar. */
    async enviar({ clave, titulo, cuerpo, tab, ttl = 3600 }) {
      const carga = JSON.stringify({ titulo, cuerpo: String(cuerpo || '').slice(0, MAX_CUERPO), tab, etiqueta: clave });
      const resultados = await Promise.all(estado.suscripciones.map(async s => {
        try {
          await webpush.sendNotification(s, carga, { vapidDetails, TTL: ttl });
          return { s, ok: true };
        } catch (e) {
          return { s, caducada: e.statusCode === 404 || e.statusCode === 410, error: e.statusCode || e.message };
        }
      }));
      const caducadas = new Set(resultados.filter(r => r.caducada).map(r => r.s.endpoint));
      if (caducadas.size) {
        estado.suscripciones = estado.suscripciones.filter(x => !caducadas.has(x.endpoint));
        guardar();
      }
      resultados.filter(r => r.error && !r.caducada).forEach(r => console.error(`[push] Fallo de envío: ${r.error}`));
      return { entregados: resultados.filter(r => r.ok).length, reintentar: resultados.some(r => r.error && !r.caducada) };
    },
  };
}

module.exports = { crearPush };
