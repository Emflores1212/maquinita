const STATIC_CACHE = 'consumer-static-v1';
const IMAGE_CACHE = 'consumer-images-v1';
const INVENTORY_CACHE = 'consumer-inventory-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(['/', '/manifest.webmanifest', '/icon.png'])
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, IMAGE_CACHE, INVENTORY_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || networkPromise || fetch(request);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && url.pathname.includes('/machine/')) {
    event.respondWith(staleWhileRevalidate(event.request, INVENTORY_CACHE));
    return;
  }

  if (
    url.pathname.includes('/storage/v1/object/public/product-images/') ||
    /\.(?:png|jpg|jpeg|gif|webp|svg)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(event.request, IMAGE_CACHE));
    return;
  }

  if (url.origin === self.location.origin && /^\/(?:_next\/static|manifest\.webmanifest|icon)/.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'Maquinita Alert';
  const body = payload.body || 'You have a new notification.';
  const url = payload.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.png',
      badge: '/icon.png',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
