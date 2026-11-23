'use strict';
const CACHE_NAME = 'apec-gala-scanner-shell-v2';
const CORE = ['./', './index.html', './manifest.webmanifest'];
const OPTIONAL = ['./event-poster.jpg'];
const QR_LIB = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Keep shell installation resilient: one missing optional poster must not
    // prevent the scanner itself from becoming available offline.
    for (const url of CORE) {
      try {
        const response = await fetch(url, {cache:'reload'});
        if (response.ok) await cache.put(url, response);
      } catch (e) { /* A later online launch can populate this asset. */ }
    }
    for (const url of OPTIONAL) {
      try {
        const response = await fetch(url, {cache:'reload'});
        if (response.ok) await cache.put(url, response);
      } catch (e) { /* Poster is decorative; scanner remains usable without it. */ }
    }
    try {
      const response = await fetch(QR_LIB, {mode:'cors', cache:'reload'});
      if (response.ok) await cache.put(QR_LIB, response);
    } catch (e) { /* Best effort CDN pre-cache; confirm before the event. */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('apec-gala-scanner-') && n !== CACHE_NAME).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin === self.location.origin || event.request.url === QR_LIB) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request, {ignoreSearch:true});
      if (cached) {
        if (url.origin === self.location.origin) {
          fetch(event.request).then(r => { if (r.ok) cache.put(event.request, r.clone()); }).catch(()=>{});
        }
        return cached;
      }
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (e) {
        return new Response('Scanner resource unavailable offline. Reconnect before continuing.', {status:503, headers:{'Content-Type':'text/plain'}});
      }
    })());
  }
});
