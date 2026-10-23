import { describe, expect, it } from 'vitest';
import { animationDeadlineSchedule } from './animationDeadline';

describe('bounded remote playback schedule', () => {
  const cues = [{ delayMs: 350 }, { delayMs: 1420 }];
  it('keeps ordinary playback unchanged when no server deadline exists', () => {
    expect(animationDeadlineSchedule(cues, [])).toEqual({ rate: 1, remainingMs: null });
  });
  it('includes subsequent steps and gaps while preserving cue order', () => {
    expect(animationDeadlineSchedule(cues, [{ durationMs: 1000 }, { type: 'STATE_PATCH' }],
      { deadlineMs: 1520, nowMs: 100, stepGapMs: 420 })).toEqual({ rate: 2, remainingMs: 1420 });
  });
  it('cannot request more time or slow ordinary playback', () => {
    expect(animationDeadlineSchedule(cues, [], { deadlineMs: 10000, nowMs: 0 }).rate).toBe(1);
    expect(animationDeadlineSchedule(cues, [], { deadlineMs: 100, nowMs: 100 }).rate).toBe(Infinity);
  });
});
