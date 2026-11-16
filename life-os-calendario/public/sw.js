// Service worker mínimo: permite instalar la app y abrirla sin conexión
// (muestra la última versión guardada de la interfaz; los datos necesitan red).
const CACHE = 'lifeos-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Red primero; si no hay conexión, la copia guardada.
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && !res.redirected) {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(req, copia));
      }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('/')))
  );
});
