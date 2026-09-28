import { afterEach, describe, expect, it, vi } from 'vitest';
import { landscapeFrameGeometry, mountMobileLandscape } from './mobileLandscape';

afterEach(() => vi.unstubAllGlobals());

describe('mobile landscape viewport', () => {
  it('keeps identical logical dimensions when a phone turns, preserving circular art', () => {
    const portrait = landscapeFrameGeometry(390, 844);
    const landscape = landscapeFrameGeometry(844, 390);
    expect({ ...portrait, rotation: 0 }).toEqual(landscape);
    expect(portrait.rotation).toBe(90);
    expect(landscapeFrameGeometry(390, 844, 'portrait-secondary').rotation).toBe(-90);
    expect(landscapeFrameGeometry(844, 390, 'landscape-secondary').rotation).toBe(0);
    expect(portrait.width).toBeGreaterThanOrEqual(900);
    expect(portrait.height).toBeGreaterThanOrEqual(600);
    expect(Math.abs(portrait.width * portrait.scale - 844)).toBeLessThan(1);
    expect(portrait.height * portrait.scale).toBe(390);
  });

  it('does not enlarge a tablet or change its landscape aspect ratio', () => {
    expect(landscapeFrameGeometry(1024, 768)).toEqual({
      width: 1024, height: 768, scale: 1, rotation: 0,
    });
  });

  it('resizes the existing game frame instead of navigating or mounting it again', () => {
    const listeners = {};
    const frameListeners = {};
    const setProperty = vi.fn();
    const frame = {
      style: {}, setAttribute: vi.fn(),
      contentDocument: { documentElement: { style: { setProperty } } },
      addEventListener: (event, callback) => { frameListeners[event] = callback; },
    };
    const appendChild = vi.fn();
    const orientation = { type: 'portrait-primary', addEventListener: vi.fn() };
    const win = { name: '', innerWidth: 390, innerHeight: 844, screen: { orientation },
      addEventListener: (event, callback) => { listeners[event] = callback; } };
    vi.stubGlobal('window', win);
    vi.stubGlobal('navigator', { userAgentData: { mobile: true } });
    vi.stubGlobal('location', { href: 'https://example.test/game', search: '' });
    vi.stubGlobal('document', {
      documentElement: { classList: { add: vi.fn() } },
      createElement: () => frame,
      getElementById: () => ({ appendChild }),
    });
    expect(mountMobileLandscape()).toBe(true);
    const source = frame.src;
    const { width, height } = frame.style;
    win.innerWidth = 844;
    win.innerHeight = 390;
    listeners.resize();
    expect(frame.style).toMatchObject({ width, height });
    expect(frame.style.transform).toContain('rotate(0deg)');
    expect(frame.src).toBe(source);
    expect(frame.name).toBe('toe-landscape-game');
    expect(appendChild).toHaveBeenCalledExactlyOnceWith(frame);
    expect(setProperty).toHaveBeenLastCalledWith('--toe-mobile-screen-scale', '0.65');
    const loadedStyle = { setProperty: vi.fn() };
    frame.contentDocument = { documentElement: { style: loadedStyle } };
    frameListeners.load();
    expect(loadedStyle.setProperty).toHaveBeenCalledExactlyOnceWith('--toe-mobile-screen-scale', '0.65');
    win.innerHeight = 480;
    listeners.resize();
    expect(loadedStyle.setProperty).toHaveBeenLastCalledWith('--toe-mobile-screen-scale', '0.8');
    Object.defineProperty(frame, 'contentDocument', { get() { throw new Error('Frame navigating'); } });
    expect(listeners.resize).not.toThrow();
  });
});
