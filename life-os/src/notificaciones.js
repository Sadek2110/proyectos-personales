import { api } from './api.js';

function bytesDeBase64Url(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texto.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

const mismaClave = (suscripcion, clavePublica) => {
  const actual = suscripcion.options?.applicationServerKey;
  if (!actual) return false;
  const a = new Uint8Array(actual), b = bytesDeBase64Url(clavePublica);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

const esIphoneEnNavegador = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches;

/** 'ios' = hay que instalar la app primero. El service worker solo se registra en producción. */
export async function estadoAvisos(clavePublica) {
  if (esIphoneEnNavegador()) return 'ios';
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'no-soportado';
  if (Notification.permission === 'denied') return 'denegado';
  const registro = await navigator.serviceWorker.ready;
  const actual = await registro.pushManager.getSubscription();
  if (!actual || !mismaClave(actual, clavePublica)) return 'inactivo';
  // Por si el servidor la perdió: dejaría de avisar sin que nadie se enterase.
  api('agente/suscribir', [actual.toJSON()]).catch(() => {});
  return 'activo';
}

export async function activarAvisos(clavePublica) {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return permiso === 'denied' ? 'denegado' : 'inactivo';
  const registro = await navigator.serviceWorker.ready;
  await (await registro.pushManager.getSubscription())?.unsubscribe();
  const suscripcion = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDeBase64Url(clavePublica) });
  await api('agente/suscribir', [suscripcion.toJSON()]);
  return 'activo';
}

export async function desactivarAvisos() {
  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();
  if (suscripcion) {
    await api('agente/desuscribir', [suscripcion.endpoint]);
    await suscripcion.unsubscribe();
  }
  return 'inactivo';
}
