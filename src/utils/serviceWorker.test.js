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
        async put(request, response) { store.set(key(request), response.clone()); },
        async match(request) { return store.get(key(request))?.clone(); },
        async delete(request) { return store.delete(key(request)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(request) {
      for (const store of stores.values()) {
        if (store.has(key(request))) return store.get(key(request)).clone();
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
    URL, Request, fetch, caches,
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
        request: path ? (typeof path === 'object' ? path : new Request(key(path))) : undefined,
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
  it('prepares every built script/style referenced by the shell, without caching private API requests', async () => {
    const worker = createWorker(), fallback = worker.fetch.getMockImplementation();
    const html = '<script type="module" src="/assets/main.js"></script><link rel="modulepreload" href="/assets/chunk.js"><link rel="stylesheet" href="/assets/main.css">';
    worker.fetch.mockImplementation(request => new URL(typeof request === 'string' ? request : request.url, origin).pathname === '/index.html'
      ? Promise.resolve(new Response(html, { headers: { 'content-type': 'text/html' } })) : fallback(request));
    await worker.dispatch('install');
    for (const name of ['/assets/main.js', '/assets/chunk.js', '/assets/main.css']) expect(await worker.caches.match(name)).toBeDefined();
    expect(await worker.dispatch('fetch', new Request(`${origin}/v2/identity`))).toBeUndefined();
    expect(await worker.caches.match('/v2/identity')).toBeUndefined();
  });
  it('upgrading never prepares the stale entry from an older static cache', async () => {
    const worker = createWorker();
    const old = await worker.caches.open('toe-static-old');
    await old.put('/index.html', new Response('<script src="/assets/stale.js"></script>'));
    await worker.dispatch('install');
    expect(worker.fetch.mock.calls.some(([request]) => String(request).includes('stale.js'))).toBe(false);
  });
  it('serves the latest cached navigation shell and scripts after the origin becomes unreachable', async () => {
    const worker = createWorker(), fallback = worker.fetch.getMockImplementation();
    const html = '<script type="module" src="/assets/current.js"></script>';
    worker.fetch.mockImplementation(request => new URL(typeof request === 'string' ? request : request.url, origin).pathname === '/'
      ? Promise.resolve(new Response(html, { headers: { 'content-type': 'text/html' } })) : fallback(request));
    await worker.dispatch('fetch', { url: origin + '/', method: 'GET', mode: 'navigate' });
    worker.fetch.mockRejectedValue(new TypeError('Origin disconnected'));
    expect(await (await worker.dispatch('fetch', { url: origin + '/', method: 'GET', mode: 'navigate' })).text()).toBe(html);
    expect((await worker.dispatch('fetch', '/assets/current.js')).headers.get('content-type')).toBe('text/javascript');
  });
  it('installs only the small app shell without forced downloads of manifest assets', async () => {
    const worker = createWorker();
    await worker.dispatch('install');
    const cachedPaths = [...worker.stores.get('toe-static-current').keys()]
      .map(url => new URL(url).pathname);
    expect(cachedPaths).toEqual(['/', '/index.html', '/favicon.png', '/socket.io.min.js', '/fonts/fonts.css']);
    expect(worker.fetch).toHaveBeenCalledTimes(6);
    expect(worker.fetch.mock.calls.some(([, options]) => options?.cache === 'reload')).toBe(false);
  });

  it('caches images, fonts, and scripts only when requested and reuses their valid responses', async () => {
    const worker = createWorker();
    for (const path of ['/img/card/art.webp', '/fonts/game.woff2', '/assets/game.js']) {
      await worker.dispatch('fetch', path);
      await worker.dispatch('fetch', path);
      expect(await worker.caches.match(path)).toBeDefined();
    }
    expect(worker.fetch).toHaveBeenCalledTimes(3);
    expect([...worker.stores.keys()]).toEqual(['toe-runtime-v3']);
  });

  it.each([200, 404])('recovers a %i HTML asset response with one cache-busting retry', async status => {
    const worker = createWorker();
    const request = new Request(`${origin}/assets/game.js?version=1`, {
      mode: 'cors', credentials: 'include', headers: { 'x-asset-test': 'preserved' },
    });
    worker.fetch.mockResolvedValueOnce(new Response('fallback', {
      status, headers: { 'content-type': 'text/html' },
    }));
    const response = await worker.dispatch('fetch', request);
    expect(response.headers.get('content-type')).toBe('text/javascript');
    expect(worker.fetch).toHaveBeenCalledTimes(2);
    const [retryRequest, options] = worker.fetch.mock.calls[1];
    const retryUrl = new URL(retryRequest.url);
    expect(retryUrl.pathname).toBe('/assets/game.js');
    expect(retryUrl.searchParams.get('version')).toBe('1');
    expect(retryUrl.searchParams.get('toe-retry')).toMatch(/^\d+$/);
    expect(retryRequest.mode).toBe('cors');
    expect(retryRequest.credentials).toBe('include');
    expect(retryRequest.headers.get('x-asset-test')).toBe('preserved');
    expect(options.cache).toBe('reload');
    expect((await worker.caches.match(request)).headers.get('content-type')).toBe('text/javascript');
    expect(await worker.caches.match(retryRequest)).toBeUndefined();
  });

  it('stops after one invalid retry without caching either HTML response', async () => {
    const worker = createWorker();
    worker.fetch.mockResolvedValue(new Response('fallback', { headers: { 'content-type': 'text/html' } }));
    const response = await worker.dispatch('fetch', '/assets/missing.js');
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(worker.fetch).toHaveBeenCalledTimes(2);
    expect(worker.stores.size).toBe(0);
  });

  it('replaces an invalid cached script with the validated retry response', async () => {
    const worker = createWorker();
    const path = '/assets/game.js';
    const cache = await worker.caches.open('toe-runtime-v3');
    await cache.put(path, new Response('cached fallback', { headers: { 'content-type': 'text/html' } }));
    worker.fetch.mockResolvedValueOnce(new Response('network fallback', { headers: { 'content-type': 'text/html' } }));
    await worker.dispatch('fetch', path);
    expect(worker.fetch).toHaveBeenCalledTimes(2);
    expect((await worker.caches.match(path)).headers.get('content-type')).toBe('text/javascript');
    await worker.dispatch('fetch', path);
    expect(worker.fetch).toHaveBeenCalledTimes(2);
  });

  it('propagates a network failure without retrying', async () => {
    const worker = createWorker();
    const failure = new TypeError('Network unavailable');
    worker.fetch.mockRejectedValue(failure);
    await expect(worker.dispatch('fetch', '/assets/game.js')).rejects.toBe(failure);
    expect(worker.fetch).toHaveBeenCalledTimes(1);
    expect(worker.stores.size).toBe(0);
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
