const MANIFEST_URL = '/resource-manifest.json';
const STATIC_CACHE_PREFIX = 'toe-static-';
const RUNTIME_CACHE_PREFIX = 'toe-runtime-';
// Bump when same-URL assets change so cache-first responses cannot stay stale.
const RUNTIME_CACHE = `${RUNTIME_CACHE_PREFIX}v3`;

function isValidAssetResponse(request, response) {
  if (!response?.ok) return false;
  const requestUrl = typeof request === 'string' ? request : request.url;
  const pathname = new URL(requestUrl, self.location.origin).pathname;
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (pathname.startsWith('/img/') || pathname === '/bg.webp' || pathname === '/favicon.png') {
    return contentType.startsWith('image/');
  }
  if (pathname.startsWith('/fonts/')) {
    return contentType.startsWith('font/')
      || contentType.includes('application/font')
      || contentType.includes('application/octet-stream')
      || (pathname.endsWith('.css') && contentType.includes('text/css'));
  }
  if (pathname.startsWith('/assets/')) {
    if (pathname.endsWith('.js')) return contentType.includes('javascript');
    if (pathname.endsWith('.css')) return contentType.includes('text/css');
  }
  return !contentType.includes('text/html') || pathname === '/' || pathname === '/index.html';
}

async function fetchManifest() {
  const response = await fetch(`${MANIFEST_URL}?sw=${Date.now()}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`manifest ${response.status}`);
  return response.json();
}

async function fetchAsset(request) {
  const response = await fetch(request);
  if (isValidAssetResponse(request, response)) return response;
  const originalRequest = typeof request === 'string'
    ? new Request(new URL(request, self.location.origin)) : request;
  const retryUrl = new URL(originalRequest.url);
  // A CDN can cache an HTML fallback at an asset URL; bypass that cache key once.
  retryUrl.searchParams.set('toe-retry', Date.now());
  return fetch(new Request(retryUrl, originalRequest), { cache: 'reload' });
}

async function putIfOk(cache, request) {
  try {
    const response = await fetchAsset(request);
    if (isValidAssetResponse(request, response)) await cache.put(request, response);
  } catch {
    // Precache is best-effort; runtime fetch still works.
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const manifest = await fetchManifest();
    const cache = await caches.open(`${STATIC_CACHE_PREFIX}${manifest.version}`);
    const corePaths = [
      '/',
      '/index.html',
      '/favicon.png',
      '/socket.io.min.js',
      '/fonts/fonts.css',
    ];
    await Promise.allSettled(corePaths.map(path => putIfOk(cache, path)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const manifest = await fetchManifest().catch(() => null);
    if (manifest) {
      const currentStatic = `${STATIC_CACHE_PREFIX}${manifest.version}`;
      const freshKeys = await caches.keys();
      await Promise.all(freshKeys
        .filter(key =>
          (key.startsWith(STATIC_CACHE_PREFIX) && key !== currentStatic)
          || (key.startsWith(RUNTIME_CACHE_PREFIX) && key !== RUNTIME_CACHE)
        )
        .map(key => caches.delete(key)));
    }
    self.clients.claim();
  })());
});

function shouldCache(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.method !== 'GET') return false;
  return (
    url.pathname.startsWith('/img/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/bg.webp' ||
    url.pathname === '/socket.io.min.js'
  );
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (!shouldCache(request)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached && isValidAssetResponse(request, cached)) return cached;
    if (cached) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(async cacheName => {
        const cache = await caches.open(cacheName);
        await cache.delete(request);
      }));
    }
    const response = await fetchAsset(request);
    if (isValidAssetResponse(request, response)) {
      const cache = await caches.open(RUNTIME_CACHE);
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  })());
});
