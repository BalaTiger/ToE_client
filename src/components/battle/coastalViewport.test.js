import { describe, expect, it } from 'vitest';
import { DESIGN_WIDTH } from '../../utils/scale';
import { COASTAL_MIN_ASPECT, COASTAL_MAX_ASPECT, getCoastalViewport } from './coastalViewport';

describe('coastal safe viewport', () => {
  it.each([[1600, 1000], [1600, 900], [1900, 1000]])('fills a %ix%i window inside the safe range', (width, height) => {
    const frame = getCoastalViewport(width, height);
    expect(frame).toMatchObject({ width, height, left: 0, top: 0 });
  });

  it.each([[3440, 1440], [2560, 720], [844, 390]])('adds equal side margins at %ix%i', (width, height) => {
    const frame = getCoastalViewport(width, height);
    expect(frame.width / frame.height).toBeCloseTo(COASTAL_MAX_ASPECT);
    expect(frame.height).toBe(height);
    expect(frame.top).toBe(0);
    expect(frame.left).toBeGreaterThan(0);
    expect(frame.left * 2 + frame.width).toBeCloseTo(width);
  });

  it.each([[1280, 1024], [900, 1600], [390, 844]])('adds equal top/bottom margins at %ix%i', (width, height) => {
    const frame = getCoastalViewport(width, height);
    expect(frame.width / frame.height).toBeCloseTo(COASTAL_MIN_ASPECT);
    expect(frame.width).toBe(width);
    expect(frame.left).toBe(0);
    expect(frame.top).toBeGreaterThan(0);
    expect(frame.top * 2 + frame.height).toBeCloseTo(height);
  });

  it('keeps one scale for both axes and logical content in the safe height range', () => {
    for (const width of [320, 1200, 2548, 4096]) for (const height of [240, 720, 1303, 2160]) {
      const frame = getCoastalViewport(width, height);
      expect(frame.scale).toBeCloseTo(frame.width / DESIGN_WIDTH);
      expect(frame.scale).toBeCloseTo(frame.height / frame.boardHeight);
      expect(frame.boardHeight).toBeGreaterThanOrEqual(DESIGN_WIDTH / COASTAL_MAX_ASPECT);
      expect(frame.boardHeight).toBeLessThanOrEqual(DESIGN_WIDTH / COASTAL_MIN_ASPECT);
      expect(frame.width).toBeLessThanOrEqual(width);
      expect(frame.height).toBeLessThanOrEqual(height);
    }
  });
});
