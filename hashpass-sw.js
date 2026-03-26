const CACHE_NAME = 'hashpass-v1';
const ASSETS = [
  '/index.html',
  '/hashpass-manifest.json'
];

// Install: cache all assets immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== 'hashpass-canary')
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: ALWAYS serve from cache first (offline-first)
// Network is only used during initial install or explicit update
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});

// Listen for update messages from the page
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    // Fetch fresh copy from network, compare with cached
    fetch('/index.html', { cache: 'no-store' })
      .then(response => response.text())
      .then(async newText => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match('/index.html');
        const cachedText = cachedResponse ? await cachedResponse.text() : '';

        // Hash both versions
        const encoder = new TextEncoder();
        const newHash = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(newText)))
        ).map(b => b.toString(16).padStart(2, '0')).join('');
        const cachedHash = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(cachedText)))
        ).map(b => b.toString(16).padStart(2, '0')).join('');

        event.source.postMessage({
          type: 'UPDATE_STATUS',
          hasUpdate: newHash !== cachedHash,
          currentHash: cachedHash.slice(0, 12),
          newHash: newHash.slice(0, 12)
        });
      })
      .catch(err => {
        event.source.postMessage({
          type: 'UPDATE_STATUS',
          error: 'Network unavailable'
        });
      });
  }

  if (event.data && event.data.type === 'APPLY_UPDATE') {
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => {
        event.source.postMessage({ type: 'UPDATE_APPLIED' });
      });
  }
});
