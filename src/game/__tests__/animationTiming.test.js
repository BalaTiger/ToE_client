import { describe, expect, it } from 'vitest';
import {
  advanceAnimationElapsed,
  buildAnimationPlaybackCues,
  getPendingAnimationCues,
  resolveAnimationStepTiming,
} from '../animationTiming';

describe('animationTiming', () => {
  const timingOptions = {
    durationByType: { SAN_DAMAGE: 800, default: 600 },
    speedScale: 1.35,
    cardRevealDuration: 3510,
  };

  it('为动画步骤统一解析总时长与命中时点', () => {
    expect(resolveAnimationStepTiming({ type: 'SAN_DAMAGE' }, timingOptions)).toMatchObject({
      durationMs: 1080,
      impactAtMs: 460,
    });
    expect(resolveAnimationStepTiming({ type: 'SAN_DAMAGE', durationMs: 300, impactAtMs: 500 }, timingOptions)).toMatchObject({
      durationMs: 300,
      impactAtMs: 300,
    });
  });

  it('把视觉、命中、退出和推进统一编译为 cue', () => {
    const cues = buildAnimationPlaybackCues({
      type: 'SAN_DAMAGE', durationMs: 1080, impactAtMs: 460,
      visualTimeline: [{ atMs: 0, patch: { start: true } }, { atMs: 460, patch: { hit: true } }],
    }, 420);

    expect(cues.map(cue => [cue.id, cue.atMs])).toEqual([
      ['visual:0', 0],
      ['impact', 460],
      ['visual:1', 460],
      ['exit', 1080],
      ['advance', 1500],
    ]);
  });

  it('暂停恢复只调度剩余 cue 且不会重复已命中事件', () => {
    const cues = buildAnimationPlaybackCues({ type: 'HP_DAMAGE', durationMs: 810, impactAtMs: 350 }, 420);
    const fired = new Set(['impact']);
    const elapsed = advanceAnimationElapsed(200, 1000, 1400);
    const pending = getPendingAnimationCues(cues, elapsed, fired);

    expect(elapsed).toBe(600);
    expect(pending.map(cue => [cue.id, cue.delayMs])).toEqual([
      ['exit', 210],
      ['advance', 630],
    ]);
  });
});
