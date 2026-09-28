import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConcurrent, selectBootstrapResources, selectDeferredResources } from './useResourcePreload';

const manifest = JSON.parse(readFileSync(new URL('../../public/resource-manifest.json', import.meta.url), 'utf8'));
const paths = resources => resources.map(resource => resource.path);

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('resource loading stages', () => {
  it('blocks only on lobby art, choosing one density and no obsolete start artwork', () => {
    for (const density of [1, 2]) {
      const resources = selectBootstrapResources(manifest, density);
      const selected = paths(resources);
      expect(selected).toContain('/img/bg/bg_main.webp');
      expect(selected).toContain('/img/ui/start/role-treasure-v3-' + density + 'x.webp');
      expect(selected).not.toContain('/img/ui/start/role-treasure-v3-' + (density === 1 ? 2 : 1) + 'x.webp');
      expect(resources.every(resource => resource.type === 'image')).toBe(true);
      expect(selected.some(path => /\/card\/|\/effects\/|\/coastal\/|-v2\./.test(path))).toBe(false);
      expect(resources.reduce((sum, resource) => sum + resource.size, 0)).toBeLessThan(1024 * 1024);
    }
  });

  it('keeps lobby background work small and prewarms only the current battle theme', () => {
    expect(paths(selectDeferredResources(manifest, false, '群星呼唤')).sort()).toEqual([
      '/sounds/SE/common/ui/close.mp3', '/sounds/SE/common/ui/open.mp3',
    ]);
    for (const [key, own, other] of [['地神的潜影', 'earth_shadow', 'stars_call'], ['群星呼唤', 'stars_call', 'earth_shadow']]) {
      const selected = paths(selectDeferredResources(manifest, true, key));
      expect(selected).toContain('/img/card/animated/' + own + '/frame_00.webp');
      expect(selected.some(path => path.startsWith('/sounds/BGM/'))).toBe(false);
      expect(selected.some(path => path.includes(other))).toBe(false);
      const otherSounds = key === '地神的潜影' ? '/sounds/SE/starsCall/' : '/sounds/SE/earthShadow/';
      expect(selected.some(path => path.startsWith(otherSounds))).toBe(false);
      expect(selected.some(path => path.startsWith('/img/card/illustration/') || path.startsWith('/videos/'))).toBe(false);
    }
  });
});

describe('bounded, cancellable preload queue', () => {
  function imageQueue() {
    const images = [];
    vi.stubGlobal('window', {});
    vi.stubGlobal('Image', class {
      constructor() { images.push(this); }
      removeAttribute = vi.fn();
    });
    return images;
  }

  it('limits parallel requests and stops active and queued work on a stage change', async () => {
    const images = imageQueue();
    const controller = new AbortController();
    const settled = vi.fn();
    const work = loadConcurrent([1, 2, 3, 4].map(n => ({ path: '/img/' + n + '.webp', type: 'image' })), 2, controller.signal, settled);
    expect(images).toHaveLength(2);
    images[0].onload();
    await Promise.resolve();
    expect(images).toHaveLength(3);
    controller.abort();
    await work;
    expect(images).toHaveLength(3);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(images[1].removeAttribute).toHaveBeenCalledWith('src');
    expect(images[2].removeAttribute).toHaveBeenCalledWith('src');
  });

  it('times out a stalled image and continues without marking it successful', async () => {
    vi.useFakeTimers();
    const images = imageQueue();
    const settled = vi.fn();
    const resources = [1, 2].map(n => ({ path: '/img/' + n + '.webp', type: 'image' }));
    const work = loadConcurrent(resources, 1, new AbortController().signal, settled);
    await vi.advanceTimersByTimeAsync(8000);
    expect(settled).toHaveBeenCalledWith(resources[0], expect.any(Error));
    expect(images[0].removeAttribute).toHaveBeenCalledWith('src');
    images[1].onload();
    await work;
    expect(settled).toHaveBeenLastCalledWith(resources[1], null);
  });

  it('waits for the complete audio response instead of treating metadata as a full download', async () => {
    vi.stubGlobal('window', {});
    let finishBody;
    const arrayBuffer = vi.fn(() => new Promise(resolve => { finishBody = resolve; }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer })));
    const settled = vi.fn();
    const resource = { path: '/sounds/SE/common/ui/open.mp3', type: 'audio' };
    const work = loadConcurrent([resource], 1, new AbortController().signal, settled);
    await Promise.resolve();
    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(settled).not.toHaveBeenCalled();
    finishBody(new ArrayBuffer(1));
    await work;
    expect(settled).toHaveBeenCalledWith(resource, null);
  });
});
