import { describe, expect, it } from 'vitest';
import { computeScaleRatio, getFontZoomCompensate } from './scale';

describe('computeScaleRatio', () => {
  it('shrinks below the design width', () => {
    expect(computeScaleRatio(900, 800)).toBeCloseTo(0.75);
  });

  it('keeps the base scale through 1920x1080', () => {
    expect(computeScaleRatio(1200, 800)).toBe(1);
    expect(computeScaleRatio(1920, 1080)).toBe(1);
    expect(computeScaleRatio(2560, 1080)).toBe(1);
    expect(computeScaleRatio(1920, 1440)).toBe(1);
  });

  it('upscales above 1920x1080 using the limiting axis with extra aggression', () => {
    expect(computeScaleRatio(2560, 1440)).toBeGreaterThan(1.7);
    expect(computeScaleRatio(2560, 1440)).toBeLessThan((2560 - 96) / 1200);
    expect(computeScaleRatio(3840, 2160)).toBeGreaterThan(computeScaleRatio(2560, 1440));
    expect(computeScaleRatio(3840, 2160)).toBeCloseTo(2.91, 1);
  });

  it('caps very large displays', () => {
    expect(computeScaleRatio(7680, 4320)).toBeCloseTo(3);
  });
});

describe('getFontZoomCompensate', () => {
  it('only compensates fonts when the whole board is scaled down', () => {
    expect(getFontZoomCompensate(0.75)).toBeCloseTo(4 / 3);
    expect(getFontZoomCompensate(1)).toBe(1);
    expect(getFontZoomCompensate(1.5)).toBe(1);
  });
});
