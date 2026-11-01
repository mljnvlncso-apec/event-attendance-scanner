/* APEC Gala Attendance — V12.3 hardened app-shell cache. */
const CACHE_NAME = 'apec-gala-attendance-v12-4';
const REQUIRED_ASSETS = [
  './',
  './index.html',
  './vendor/html5-qrcode-2.3.8.min.js'
];
const OPTIONAL_ASSETS = ['./event-poster.jpg'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Fail installation if the exact pinned scanner library is missing or unavailable.
    // This prevents a false-positive "offline ready" state with a broken camera scanner.
    await cache.addAll(REQUIRED_ASSETS);
    await Promise.allSettled(OPTIONAL_ASSETS.map(async path => {
      const response = await fetch(path, { cache: 'reload' });
      if (response.ok) await cache.put(path, response.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('apec-gala-attendance-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch (err) {
      return Response.error();
    }
  })());
});
