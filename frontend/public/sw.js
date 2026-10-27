/* SmartRoad Service Worker
   In DEVELOPMENT: immediately unregisters itself so it never
   interferes with hot-reload, localhost API, or Leaflet tiles.
   In PRODUCTION: caches static assets only — never touches API
   or map tile requests. */

const IS_DEV = self.location.hostname === 'localhost' ||
               self.location.hostname === '127.0.0.1';

// ── Development: unregister immediately ──────────────────────────────────
if (IS_DEV) {
  self.addEventListener('install',  () => self.skipWaiting());
  self.addEventListener('activate', () => {
    self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
      clients.forEach(c => c.postMessage({ type: 'SW_DEV_UNREGISTERED' }));
    });
    // Unregister self so it stops intercepting requests
    self.registration.unregister();
    self.clients.claim();
  });
  // In dev: do NOT intercept any fetch requests at all
} else {
  // ── Production only ────────────────────────────────────────────────────
  const CACHE = 'smartroad-v1';

  const NEVER_CACHE = [
    'hf.space',           // Hugging Face API
    'render.com',         // Render PostgreSQL via API
    'openstreetmap.org',  // Leaflet tiles — let browser handle
    'tile.openstreetmap', // tile subdomains
  ];

  const isApiRequest = (url) =>
    url.pathname.startsWith('/detect') ||
    url.pathname.startsWith('/potholes') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/health');

  const shouldBypass = (url) =>
    NEVER_CACHE.some(h => url.hostname.includes(h)) ||
    isApiRequest(url);

  self.addEventListener('install', event => {
    event.waitUntil(
      caches.open(CACHE).then(cache =>
        cache.addAll(['/', '/index.html', '/manifest.json'])
          .catch(e => console.warn('SW cache addAll partial fail:', e))
      )
    );
    self.skipWaiting();
  });

  self.addEventListener('activate', event => {
    event.waitUntil(
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
    );
    self.clients.claim();
  });

  self.addEventListener('fetch', event => {
    // Only handle GET
    if (event.request.method !== 'GET') return;

    let url;
    try { url = new URL(event.request.url); } catch { return; }

    // Bypass: API calls, map tiles, external services
    // Returning without calling event.respondWith() lets the
    // browser handle it normally — no TypeError, no interception.
    if (shouldBypass(url)) return;

    // For non-external assets: network first, cache fallback
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Only cache valid same-origin responses
          if (
            response.ok &&
            response.type === 'basic' &&
            event.request.url.startsWith(self.location.origin)
          ) {
            const clone = response.clone();
            caches.open(CACHE)
              .then(cache => cache.put(event.request, clone))
              .catch(() => { /* ignore cache write errors */ });
          }
          return response;
        })
        .catch(async () => {
          // Network failed — try cache
          const cached = await caches.match(event.request);
          if (cached) return cached;
          // Navigation fallback
          if (event.request.mode === 'navigate') {
            const indexCache = await caches.match('/index.html');
            if (indexCache) return indexCache;
          }
          // Must return a valid Response — never throw
          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        })
    );
  });
}