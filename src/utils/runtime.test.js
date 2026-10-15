import { afterEach, describe, expect, it, vi } from 'vitest';
import { isArtifactRuntime } from './runtime';

afterEach(() => vi.unstubAllGlobals());

function stubRuntime({ framed = false, ownFrame = false, nested = false, origin = 'https://www.toegame.online' } = {}) {
  const win = { location: { origin }, name: 'toe-landscape-game' };
  win.self = win;
  win.top = framed ? {} : win;
  win.parent = nested ? {} : win.top;
  win.frameElement = framed ? {
    tagName: 'IFRAME',
    name: 'toe-landscape-game',
    hasAttribute: attribute => ownFrame && attribute === 'data-toe-landscape-game',
  } : null;
  vi.stubGlobal('window', win);
  return win;
}

describe('preview runtime detection', () => {
  it.each(['https://www.toegame.online', 'http://localhost:5174'])('allows the top-level website at %s', origin => {
    stubRuntime({ origin });
    expect(isArtifactRuntime(false)).toBe(false);
  });

  it('allows the same-origin mobile game frame so multiplayer and tutorial storage stay available', () => {
    stubRuntime({ framed: true, ownFrame: true });
    expect(isArtifactRuntime(false)).toBe(false);
  });

  it('does not trust a preview frame just because it has the mobile frame name', () => {
    stubRuntime({ framed: true });
    expect(isArtifactRuntime(false)).toBe(true);
  });

  it('keeps mobile games embedded inside a preview restricted', () => {
    stubRuntime({ framed: true, ownFrame: true, nested: true });
    expect(isArtifactRuntime(false)).toBe(true);
  });

  it('keeps inaccessible cross-origin frames restricted', () => {
    const win = stubRuntime({ framed: true });
    win.frameElement = null;
    expect(isArtifactRuntime(false)).toBe(true);
    Object.defineProperty(win, 'frameElement', { get() { throw new Error('Cross-origin frame'); } });
    expect(isArtifactRuntime(false)).toBe(true);
  });

  it('rejects opaque sandbox origins while preserving the packaged H5 exception', () => {
    stubRuntime({ origin: 'null' });
    expect(isArtifactRuntime(false)).toBe(true);
    expect(isArtifactRuntime(true)).toBe(false);
  });
});
