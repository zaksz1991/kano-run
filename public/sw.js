/* Kano Life service worker.
 * - Pages: network first, cached copy when offline.
 * - Hashed build files (/assets/name-HASH.js|css): cache first, they never change.
 * - Models, textures and other static files: stale-while-revalidate, so repeat visits are instant
 *   and changed files are picked up on the following visit without bumping a version.
 * - Audio (large, uses Range requests), /api/ and cross-origin requests are left to the network.
 */
const VERSION = 'kano-life-v2';
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const MODELS = `${VERSION}-models`; // versioned so asset repairs cannot be hidden by an old model/texture cache
const MAX_MODEL_ENTRIES = 400;
const SHELL_URLS = ['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // One failing file must not block installation.
    await Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, STATIC, MODELS]);
    for (const key of await caches.keys()) {
      if (key.startsWith('kano-life-') && !keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

const HASHED = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|webp|svg)$/;
const STATIC_EXT = /\.(?:js|css|png|jpe?g|webp|svg|json|webmanifest|woff2?|glb)$/i;

function cacheable(response) {
  return response && response.status === 200 && response.type === 'basic';
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

async function staleWhileRevalidate(request, cacheName, trimTo) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (cacheable(response)) {
      await cache.put(request, response.clone());
      if (trimTo) trim(cacheName, trimTo);
    }
    return response;
  });
  if (cached) { refresh.catch(() => {}); return cached; }
  return refresh;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) await cache.put(request, response.clone());
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (cacheable(response)) await cache.put('/', response.clone());
    return response;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/models/audio/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else if (HASHED.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC));
  } else if (url.pathname.startsWith('/assets/models/')) {
    event.respondWith(staleWhileRevalidate(request, MODELS, MAX_MODEL_ENTRIES));
  } else if (STATIC_EXT.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC));
  }
});
