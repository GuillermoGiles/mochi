// Avisos de parciales y entregas: los recibe el service worker aunque la app esté cerrada.
// Se suma al service worker que arma vite-plugin-pwa (ver workbox.importScripts en vite.config.ts).

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Mochi', {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'mochi-avisos',
      data: { url: data.url || '/' },
    }),
  );
});

// Al tocar el aviso se abre Mochi (o se trae al frente si ya estaba abierta) en la pantalla que corresponde.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) return open.focus().then((c) => c.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
