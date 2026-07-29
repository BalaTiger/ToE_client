import { describe, expect, it, vi } from 'vitest';
import {
  GAMMA_KEY,
  buildGammaFilter,
  clampPreference,
  persistPreference,
  readStoredPreference,
} from './useGamePreferences';

describe('game preference helpers', () => {
  it('clamps numeric values and uses a fallback for invalid input', () => {
    expect(clampPreference(2, 0, 1, 1)).toBe(1);
    expect(clampPreference(-1, 0, 1, 1)).toBe(0);
    expect(clampPreference('0.35', 0, 1, 1)).toBe(0.35);
    expect(clampPreference('invalid', 0, 1, 1)).toBe(1);
  });

  it('reads stored values safely and clamps corrupted ranges', () => {
    const storage = { getItem: vi.fn(() => '3.5') };
    expect(readStoredPreference(storage, GAMMA_KEY, {
      min: 0.5,
      max: 2,
      fallback: 1,
    })).toBe(2);

    storage.getItem.mockImplementation(() => { throw new Error('blocked'); });
    expect(readStoredPreference(storage, GAMMA_KEY, {
      min: 0.5,
      max: 2,
      fallback: 1,
    })).toBe(1);
  });

  it('persists without surfacing storage failures', () => {
    const storage = { setItem: vi.fn() };
    persistPreference(storage, GAMMA_KEY, 1.25);
    expect(storage.setItem).toHaveBeenCalledWith(GAMMA_KEY, '1.25');

    storage.setItem.mockImplementation(() => { throw new Error('quota'); });
    expect(() => persistPreference(storage, GAMMA_KEY, 1.5)).not.toThrow();
  });

  it('builds the viewport gamma filter deterministically', () => {
    expect(buildGammaFilter(1)).toBe('');
    expect(buildGammaFilter(1.5)).toBe('brightness(1.50) contrast(1.15)');
    expect(buildGammaFilter(0.5)).toBe('brightness(0.50) contrast(0.85)');
  });
});
