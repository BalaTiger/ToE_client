import { describe, expect, it } from 'vitest';
import { EARTHQUAKE_SHAKE_CYCLE_MS, EARTHQUAKE_SHAKE_DURATION_MS, EARTHQUAKE_SHAKE_STEPS, getSceneShakeSpec } from './sceneShake';

describe('scene shake specifications', () => {
  it.each([
    ['HP_DAMAGE', 380, 380, 0],
    ['SAN_DAMAGE', 380, 280, 0],
    ['GUILLOTINE', 2000, 220, 120],
    ['EARTHQUAKE', 1250, 2500, 0],
    ['BURROWING_WORM', 1250, 1620, 0],
  ])('preserves the %s curve and active window', (type, curveDuration, activeDuration, delay) => {
    const spec = getSceneShakeSpec({ type, hitIndices: [0] });
    expect(spec.timing.duration).toBe(curveDuration);
    expect(spec.timing.duration * spec.timing.iterations).toBeCloseTo(activeDuration);
    expect(spec.timing.delay).toBe(delay);
    expect(spec.timing.fill).toBe('none');
    expect(spec.timing.easing).toBe('linear');
    const intervalEasing = ['EARTHQUAKE', 'BURROWING_WORM'].includes(type) ? 'linear' : 'ease-in-out';
    expect(spec.keyframes.every(frame => frame.easing === intervalEasing)).toBe(true);
    expect(spec.keyframes[0].offset).toBe(0);
    expect(spec.keyframes.at(-1)).toMatchObject({ offset: 1, transform: 'translate(0px, 0px)' });
    expect(getSceneShakeSpec({ type, hitIndices: [1] })).toBe(spec);
  });

  it.each(['HP_DAMAGE', 'SAN_DAMAGE', 'GUILLOTINE'])('requires actual targets for %s', type => {
    expect(getSceneShakeSpec({ type })).toBeNull();
    expect(getSceneShakeSpec({ type, hitIndices: [] })).toBeNull();
  });

  it('waits for guillotine snapshots without delaying other events', () => {
    expect(getSceneShakeSpec({ type: 'GUILLOTINE', hitIndices: [1] }, false)).toBeNull();
    expect(getSceneShakeSpec({ type: 'GUILLOTINE', hitIndices: [1] }, true)).not.toBeNull();
    expect(getSceneShakeSpec({ type: 'HP_DAMAGE', hitIndices: [1] }, false)).not.toBeNull();
    expect(getSceneShakeSpec({ type: 'EARTHQUAKE' }, false)).not.toBeNull();
  });

  it('shares the earthquake curve and duration across its consumers', () => {
    const earthquake = getSceneShakeSpec({ type: 'EARTHQUAKE' });
    const worm = getSceneShakeSpec({ type: 'BURROWING_WORM' });
    expect(worm.keyframes).toBe(earthquake.keyframes);
    expect(earthquake.keyframes.map(frame => frame.offset)).toEqual(EARTHQUAKE_SHAKE_STEPS.map(([percent]) => percent / 100));
    expect(earthquake.timing.duration).toBe(EARTHQUAKE_SHAKE_CYCLE_MS);
    expect(earthquake.timing.duration * earthquake.timing.iterations).toBe(EARTHQUAKE_SHAKE_DURATION_MS);
  });

  it('leaves local effects and absent events out of the scene controller', () => {
    for (const type of ['VOLCANO', 'GEOMAGNETIC_REVERSAL', 'DEATH', 'HP_HEAL', 'UNKNOWN']) {
      expect(getSceneShakeSpec({ type, hitIndices: [0] })).toBeNull();
    }
    expect(getSceneShakeSpec(null)).toBeNull();
  });
});
