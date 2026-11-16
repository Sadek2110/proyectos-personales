import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const CLAVE_CACHE = 'lifeos:cache';
const SIETE_DIAS = 7 * 864e5;

export const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60e3,
      gcTime: SIETE_DIAS,
      networkMode: 'offlineFirst', // sin red, que falle y lo diga, no que se quede en pausa
      retry: 1,
      refetchOnWindowFocus: () => !hayEscrituras(),
    },
  },
});

export const persistencia = {
  persister: createSyncStoragePersister({ storage: window.localStorage, key: CLAVE_CACHE }),
  maxAge: SIETE_DIAS,
  buster: 'v1',
};

/** La caché guarda datos personales en el navegador: no pueden sobrevivir a la sesión. */
async function olvidarDatos() {
  qc.clear();
  localStorage.removeItem(CLAVE_CACHE);
  if ('caches' in window) await caches.delete('lifeos-v2');
}

/** Sin esto, el dispositivo seguiría recibiendo avisos con datos personales tras cerrar sesión. */
async function darDeBajaAvisos() {
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    const suscripcion = await registro?.pushManager?.getSubscription();
    if (!suscripcion) return;
    await api('agente/desuscribir', [suscripcion.endpoint]);
    await suscripcion.unsubscribe();
  } catch { /* cerrar sesión debe funcionar igual */ }
}

export async function cerrarSesion() {
  await darDeBajaAvisos();
  await olvidarDatos();
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = '/logout';
  document.body.appendChild(f);
  f.submit();
}

export async function api(fn, args = [], signal) {
  let r;
  try {
    r = await fetch(`/api/${fn}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Sin conexión');
  }
  if (r.status === 401) {
    await olvidarDatos();
    location.href = '/login.html';
    throw new Error('Sesión caducada');
  }
  const cuerpo = await r.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor' }));
  if (!cuerpo.ok) throw new Error(cuerpo.error || 'Error del servidor');
  return cuerpo.data;
}

let escrituras = 0;
export const hayEscrituras = () => escrituras > 0;

/**
 * Pinta el cambio al momento y lo envía a Google. Si falla, `revertir` deshace solo este
 * cambio: restaurar una foto de la lista borraría lo que se haya tocado mientras tanto.
 * Una lectura en curso se cancela porque podría traer datos anteriores a esta escritura;
 * si se interrumpió alguna, se repite al terminar.
 */
export async function escribir(clave, { aplicar, revertir, llamada }) {
  const interrumpida = qc.isFetching({ queryKey: clave }) > 0;
  await qc.cancelQueries({ queryKey: clave });
  qc.setQueryData(clave, aplicar);
  escrituras++;
  try {
    return await llamada();
  } catch (e) {
    qc.setQueryData(clave, revertir);
    throw e;
  } finally {
    escrituras--;
    if (interrumpida && !hayEscrituras()) qc.invalidateQueries({ queryKey: clave });
  }
}
