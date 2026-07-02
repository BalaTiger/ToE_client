const MANIFEST_URL = '/resource-manifest.json';
const STATIC_CACHE_PREFIX = 'toe-static-';
const RUNTIME_CACHE = 'toe-runtime-v1';

async function fetchManifest() {
  const response = await fetch(`${MANIFEST_URL}?sw=${Date.now()}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`manifest ${response.status}`);
  return response.json();
}

async function putIfOk(cache, request) {
  try {
    const response = await fetch(request, { cache: 'reload' });
    if (response.ok) await cache.put(request, response);
  } catch {
    // Precache is best-effort; runtime fetch still works.
  }
}

function isAnimatedCardBackResource(resource) {
  return resource.path.startsWith('/img/card/animated/') && resource.path.includes('/frame_');
}

function isCoreResource(resource) {
  if (resource.type === 'font' || resource.type === 'style') return true;
  if (resource.type !== 'image') return false;
  if (isAnimatedCardBackResource(resource)) return false;
  return true;
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
      ...manifest.resources
        .filter(isCoreResource)
        .map(resource => resource.path),
    ];
    await Promise.allSettled([...new Set(corePaths)].map(path => putIfOk(cache, path)));
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
        .filter(key => key.startsWith(STATIC_CACHE_PREFIX) && key !== currentStatic)
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
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  })());
});
