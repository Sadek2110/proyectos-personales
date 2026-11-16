// La interfaz abre al instante desde la caché y se actualiza por detrás: una versión
// nueva se ve en la siguiente apertura. Los datos (/api) nunca pasan por aquí.
const CACHE = 'lifeos-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

async function guardar(clave, res) {
  if (res.ok && !res.redirected && res.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(clave, res.clone());
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Los nombres llevan hash o no cambian: lo guardado siempre vale.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => guardar(req, res))));
    return;
  }

  if (req.mode === 'navigate' && url.pathname === '/') {
    const red = fetch(req).then(res => guardar('/', res));
    e.waitUntil(red.catch(() => {}));
    e.respondWith(caches.match('/').then(r => r || red));
    return;
  }

  e.respondWith(fetch(req).then(res => guardar(req, res)).catch(() => caches.match(req)));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { /* sin contenido legible: se muestra el aviso genérico */ }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Life OS', {
    body: d.cuerpo || '',
    icon: '/icon-192.png?v=2',
    badge: '/badge.png', // Android solo usa la transparencia: un icono opaco se vería como un cuadrado
    tag: d.etiqueta,
    data: { tab: d.tab },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const tab = e.notification.data?.tab;
  const destino = tab ? `/?tab=${encodeURIComponent(tab)}` : '/';
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const ventana = abiertas[0];
    if (!ventana) return self.clients.openWindow(destino);
    await ventana.focus();
    return ventana.navigate(destino);
  })());
});
