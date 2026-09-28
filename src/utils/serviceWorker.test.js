import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://www.toegame.online';

function createWorker() {
  const listeners = {};
  const stores = new Map();
  const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(request, response) { store.set(key(request), response); },
        async delete(request) { return store.delete(key(request)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request) {
      for (const store of stores.values()) {
        if (store.has(key(request))) return store.get(key(request));
      }
    },
  };
  const fetch = vi.fn(async request => {
    const path = new URL(key(request)).pathname;
    if (path === '/resource-manifest.json') {
      return Response.json({
        version: 'current',
        resources: [
          { type: 'image', path: '/img/card/art.webp' },
          { type: 'image', path: '/img/effects/large.webp' },
          { type: 'font', path: '/fonts/game.woff2' },
        ],
      });
    }
    const type = path.endsWith('.css') ? 'text/css'
      : path.endsWith('.js') ? 'text/javascript'
        : path.endsWith('.woff2') ? 'font/woff2'
          : /\.(webp|png)$/.test(path) ? 'image/webp' : 'text/html';
    return new Response('asset', { headers: { 'content-type': type } });
  });
  runInNewContext(source, {
    URL, fetch, caches,
    self: {
      location: { origin },
      addEventListener: (name, listener) => { listeners[name] = listener; },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    },
  });
  return {
    fetch, caches, stores,
    async dispatch(name, path) {
      const pending = [];
      let response;
      listeners[name]({
        request: path ? { url: key(path), method: 'GET' } : undefined,
        waitUntil: promise => pending.push(promise),
        respondWith: promise => { response = promise; },
      });
      const result = await response;
      await Promise.all(pending);
      return result;
    },
  };
}

describe('service worker resource loading', () => {
  it('installs only the small app shell without forced downloads of manifest assets', async () => {
    const worker = createWorker();
    await worker.dispatch('install');
    const cachedPaths = [...worker.stores.get('toe-static-current').keys()]
      .map(url => new URL(url).pathname);
    expect(cachedPaths).toEqual(['/', '/index.html', '/favicon.png', '/socket.io.min.js', '/fonts/fonts.css']);
    expect(worker.fetch).toHaveBeenCalledTimes(6);
    expect(worker.fetch.mock.calls.some(([, options]) => options?.cache === 'reload')).toBe(false);
  });

  it('caches images and fonts only when requested and reuses their valid responses', async () => {
    const worker = createWorker();
    for (const path of ['/img/card/art.webp', '/fonts/game.woff2']) {
      await worker.dispatch('fetch', path);
      await worker.dispatch('fetch', path);
      expect(await worker.caches.match(path)).toBeDefined();
    }
    expect(worker.fetch).toHaveBeenCalledTimes(2);
    expect([...worker.stores.keys()]).toEqual(['toe-runtime-v3']);
  });

  it('does not retain an HTML fallback response for an image', async () => {
    const worker = createWorker();
    worker.fetch.mockResolvedValue(new Response('fallback', { headers: { 'content-type': 'text/html' } }));
    await worker.dispatch('fetch', '/img/missing.webp');
    expect(await worker.caches.match('/img/missing.webp')).toBeUndefined();
  });

  it('removes outdated static and runtime caches while preserving unrelated caches', async () => {
    const worker = createWorker();
    for (const name of ['toe-static-old', 'toe-static-current', 'toe-runtime-v2', 'toe-runtime-v3', 'other-app']) {
      await worker.caches.open(name);
    }
    await worker.dispatch('activate');
    expect(await worker.caches.keys()).toEqual(['toe-static-current', 'toe-runtime-v3', 'other-app']);
  });
});
