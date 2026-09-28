import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const recoverySource = html.match(/<script data-toe-module-recovery>([\s\S]*?)<\/script>/)[1];
const origin = 'https://www.toegame.online';
const entry = { tagName: 'SCRIPT', type: 'module', src: origin + '/assets/index-current.js' };

function setup(storage = new Map()) {
  const worker = { state: 'activated', addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const registration = { active: worker, update: vi.fn(async () => {}) };
  const serviceWorker = { register: vi.fn(async () => registration) };
  const reload = vi.fn();
  const listeners = {};
  runInNewContext(recoverySource, {
    window: { addEventListener: (name, listener) => { listeners[name] = listener; } },
    navigator: { serviceWorker },
    location: { origin, reload },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    console: { warn: vi.fn() }, setTimeout, clearTimeout,
  });
  return { worker, registration, serviceWorker, reload, error: target => listeners.error({ target }) };
}

afterEach(() => vi.useRealTimers());

describe('module failure recovery outside the React entry', () => {
  it('updates the worker and reloads once per entry version, without requiring React', async () => {
    const storage = new Map();
    const first = setup(storage);
    await first.error(entry);
    expect(first.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    expect(first.registration.update).toHaveBeenCalledOnce();
    expect(first.reload).toHaveBeenCalledOnce();
    const second = setup(storage);
    await second.error(entry);
    expect(second.reload).not.toHaveBeenCalled();
    expect(second.serviceWorker.register).not.toHaveBeenCalled();
  });

  it('waits for a newly installed worker before reloading', async () => {
    const recovery = setup();
    recovery.worker.state = 'installing';
    recovery.registration.installing = recovery.worker;
    const pending = recovery.error(entry);
    await vi.waitFor(() => expect(recovery.worker.addEventListener).toHaveBeenCalled());
    expect(recovery.reload).not.toHaveBeenCalled();
    expect(recovery.registration.update).not.toHaveBeenCalled();
    recovery.worker.state = 'activated';
    recovery.worker.addEventListener.mock.calls[0][1]();
    await pending;
    expect(recovery.reload).toHaveBeenCalledOnce();
  });

  it('does not reload a working game, development modules, H5 scripts or images', async () => {
    const recovery = setup();
    for (const target of [{}, { tagName: 'IMG' }, { ...entry, type: '' }, { ...entry, src: origin + '/src/main.jsx' }]) {
      await recovery.error(target);
    }
    expect(recovery.serviceWorker.register).not.toHaveBeenCalled();
    expect(recovery.reload).not.toHaveBeenCalled();
  });

  it('stops if the worker cannot activate instead of looping reloads', async () => {
    vi.useFakeTimers();
    const recovery = setup();
    recovery.worker.state = 'installing';
    recovery.registration.installing = recovery.worker;
    const pending = recovery.error(entry);
    await vi.advanceTimersByTimeAsync(15000);
    await pending;
    expect(recovery.reload).not.toHaveBeenCalled();
    expect(recovery.worker.removeEventListener).toHaveBeenCalled();
  });
});
