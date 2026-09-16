import { describe, expect, it } from 'vitest';
import { landscapeFrameGeometry } from '../../ui/mobileLandscape';
import { START_SCREEN_WIDTH, START_SCREEN_HEIGHT, getStartScreenScale, getStartScreenControlScale } from './startScreenGeometry';

describe('fixed start-screen composition and viewport controls', () => {
  it.each([[617, 1009], [400, 900], [1490, 1056], [1600, 1000], [1900, 1000], [2560, 720], [900, 474]])(
    'keeps visible content inside %sx%s and clear of the fixed footer', (width, height) => {
      const scale = getStartScreenScale(width, height);
      const left = (width - START_SCREEN_WIDTH * scale) / 2;
      const top = (height - START_SCREEN_HEIGHT * scale) / 2;
      expect(left + 265 * scale).toBeGreaterThanOrEqual(16 - 1e-8);
      expect(left + 1225 * scale).toBeLessThanOrEqual(width - 16 + 1e-8);
      expect(top + 105 * scale).toBeGreaterThanOrEqual(0);
      const footerTop = height - 14 - 57.37 * getStartScreenControlScale(width, height);
      expect(top + 935 * scale).toBeLessThanOrEqual(footerTop - 12 + 1e-8);
    },
  );

  it('fills the portrait window to 16px side margins without changing the composition', () => {
    const scale = getStartScreenScale(617, 1009);
    expect(scale * 960).toBeCloseTo(585);
    expect(scale / (617 / 1490)).toBeGreaterThan(1.47);
  });

  it('retains the existing reference and equal-height wide-screen sizes', () => {
    expect(getStartScreenScale(1490, 1056)).toBe(1);
    expect(getStartScreenScale(1600, 1000)).toBe(1000 / 1056);
    expect(getStartScreenScale(1900, 1000)).toBe(getStartScreenScale(1600, 1000));
    expect(getStartScreenScale(3200, 1000)).toBe(getStartScreenScale(1600, 1000));
  });

  it('keeps utility buttons near native size and prevents narrow-window footer collisions', () => {
    expect(getStartScreenControlScale(617, 1009)).toBeCloseTo(0.9617);
    expect(getStartScreenControlScale(1600, 1000)).toBe(1);
    expect(getStartScreenControlScale(7680, 4320)).toBe(1.12);
    for (const width of [320, 400, 617, 900]) {
      expect(520 * getStartScreenControlScale(width, 900) + 40).toBeLessThanOrEqual(width + 1e-8);
    }
  });

  it.each([[390, 844], [375, 667]])('keeps content and control sizes after phone rotation (%s x %s)', (width, height) => {
    const portrait = landscapeFrameGeometry(width, height);
    const landscape = landscapeFrameGeometry(height, width);
    for (const getScale of [getStartScreenScale, getStartScreenControlScale]) {
      expect(getScale(portrait.width, portrait.height) * portrait.scale)
        .toBe(getScale(landscape.width, landscape.height) * landscape.scale);
    }
  });

  it('falls back for absent or invalid viewport measurements', () => {
    for (const invalid of [undefined, null, 0, -1, NaN, Infinity, -Infinity]) {
      expect(getStartScreenScale(invalid, invalid)).toBe(1);
      expect(getStartScreenScale(invalid, 600)).toBe(getStartScreenScale(1490, 600));
      expect(getStartScreenControlScale(invalid, invalid)).toBe(getStartScreenControlScale(1490, 1056));
    }
  });
});
