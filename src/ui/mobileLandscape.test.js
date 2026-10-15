import { afterEach, describe, expect, it, vi } from 'vitest';
import { landscapeFrameGeometry, mountMobileLandscape } from './mobileLandscape';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('mobile landscape viewport', () => {
  it.each([[390, 844], [375, 667]])('keeps identical logical dimensions when a %d×%d phone turns, preserving circular art', (width, height) => {
    const portrait = landscapeFrameGeometry(width, height);
    const landscape = landscapeFrameGeometry(height, width);
    expect({ ...portrait, rotation: 0 }).toEqual(landscape);
    expect(portrait.rotation).toBe(90);
    expect(landscapeFrameGeometry(width, height, 'portrait-secondary').rotation).toBe(-90);
    expect(landscapeFrameGeometry(height, width, 'landscape-secondary').rotation).toBe(0);
    expect(portrait.width).toBeGreaterThanOrEqual(900);
    expect(portrait.height).toBeGreaterThanOrEqual(600);
    expect(Math.abs(portrait.width * portrait.scale - height)).toBeLessThan(1);
    expect(portrait.height * portrait.scale).toBe(width);
  });

  it('does not enlarge a tablet or change its landscape aspect ratio', () => {
    expect(landscapeFrameGeometry(1024, 768)).toEqual({
      width: 1024, height: 768, scale: 1, rotation: 0,
    });
  });

  it.each(['unsupported', 'throws', 'rejects'])('starts the existing game frame when native orientation lock %s', async behavior => {
    const listeners = {};
    const lock = behavior === 'unsupported' ? undefined : vi.fn(() => {
      if (behavior === 'throws') throw new Error('Orientation lock unavailable');
      return Promise.reject(new Error('Fullscreen required'));
    });
    const createElement = vi.fn();
    const addEventListener = vi.fn((event, callback) => { listeners[event] = callback; });
    vi.stubGlobal('window', { name: 'toe-landscape-game', screen: { orientation: behavior === 'unsupported' ? undefined : { lock } } });
    vi.stubGlobal('document', { addEventListener, createElement });

    expect(mountMobileLandscape()).toBe(false);
    expect(createElement).not.toHaveBeenCalled();
    expect(addEventListener).toHaveBeenCalledWith('pointerup', expect.any(Function), { once: true });
    expect(listeners.pointerup).not.toThrow();
    expect(listeners.fullscreenchange).not.toThrow();
    await Promise.resolve();
    if (lock) expect(lock).toHaveBeenNthCalledWith(2, 'landscape');
  });

  it.each([
    ['desktop mouse', { userAgent: 'Windows', platform: 'Win32', maxTouchPoints: 0 }, false, 1920, 1080, false],
    ['large touchscreen monitor', { userAgent: 'Windows', platform: 'Win32', maxTouchPoints: 10 }, true, 1920, 1080, false],
    ['touchscreen tablet', { userAgent: 'Windows', platform: 'Win32', maxTouchPoints: 10 }, true, 1366, 1024, true],
    ['iPad with desktop user agent', { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }, false, 1366, 1024, true],
    ['Android tablet', { userAgentData: { mobile: false }, userAgent: 'Android', platform: 'Linux', maxTouchPoints: 5 }, false, 1280, 800, true],
  ])('uses the landscape host appropriately on %s', (_label, navigator, coarse, width, height, expectedHost) => {
    const appendChild = vi.fn();
    vi.stubEnv('DEV', false);
    vi.stubGlobal('navigator', navigator);
    vi.stubGlobal('screen', { width, height });
    vi.stubGlobal('matchMedia', () => ({ matches: coarse }));
    vi.stubGlobal('location', { href: 'https://example.test/game?mobile-landscape', search: '?mobile-landscape' });
    vi.stubGlobal('window', { name: '', innerWidth: width, innerHeight: height, screen: {}, addEventListener: vi.fn() });
    vi.stubGlobal('document', {
      documentElement: { classList: { add: vi.fn() } },
      createElement: () => ({ style: {}, setAttribute: vi.fn(), addEventListener: vi.fn() }),
      getElementById: () => ({ appendChild }),
    });

    expect(mountMobileLandscape()).toBe(expectedHost);
    expect(appendChild).toHaveBeenCalledTimes(expectedHost ? 1 : 0);
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
