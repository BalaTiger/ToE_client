import { describe, expect, it, vi } from 'vitest';
import {
  getTrackEndFadeProgress,
  startTrackEndFadeMonitor,
} from './trackEndFadeMonitor';

function makeScheduler() {
  let nextId = 1;
  const frames = new Map();
  return {
    requestAnimationFrame(callback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    runFrame() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback());
    },
    pendingCount() {
      return frames.size;
    },
  };
}

describe('track-end fade monitor', () => {
  it('derives fade progress from media time instead of elapsed wall time', () => {
    expect(getTrackEndFadeProgress({
      currentTimeSeconds: 2.5,
      durationSeconds: 3.6,
      fallbackDurationMs: 3600,
      fadeMs: 900,
      guardMs: 40,
    })).toBeNull();
    expect(getTrackEndFadeProgress({
      currentTimeSeconds: 3.11,
      durationSeconds: 3.6,
      fallbackDurationMs: 3600,
      fadeMs: 900,
      guardMs: 40,
    })).toBeCloseTo(0.5, 5);
    expect(getTrackEndFadeProgress({
      currentTimeSeconds: 3.56,
      durationSeconds: 3.6,
      fallbackDurationMs: 3600,
      fadeMs: 900,
      guardMs: 40,
    })).toBe(1);
  });

  it('waits through delayed playback and completes only at the media fade boundary', () => {
    const scheduler = makeScheduler();
    const audio = { currentTime: 0, duration: 3.6, volume: 0.72 };
    const onComplete = vi.fn();
    const cleanup = startTrackEndFadeMonitor({
      audio,
      baseVolume: 0.72,
      fallbackDurationMs: 3600,
      fadeMs: 900,
      guardMs: 40,
      smooth: true,
      onComplete,
      scheduler,
    });

    scheduler.runFrame();
    scheduler.runFrame();
    expect(audio.volume).toBe(0.72);
    expect(onComplete).not.toHaveBeenCalled();

    audio.currentTime = 3.11;
    scheduler.runFrame();
    expect(audio.volume).toBeCloseTo(0.36, 5);

    audio.currentTime = 3.56;
    scheduler.runFrame();
    expect(audio.volume).toBe(0);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(scheduler.pendingCount()).toBe(0);

    cleanup();
  });

  it('ignores a stale playback generation', () => {
    const scheduler = makeScheduler();
    const audio = { currentTime: 3.2, duration: 3.6, volume: 0.72 };
    const onComplete = vi.fn();
    startTrackEndFadeMonitor({
      audio,
      baseVolume: 0.72,
      fallbackDurationMs: 3600,
      fadeMs: 900,
      guardMs: 40,
      isCurrent: () => false,
      onComplete,
      scheduler,
    });

    scheduler.runFrame();
    expect(audio.volume).toBe(0.72);
    expect(onComplete).not.toHaveBeenCalled();
    expect(scheduler.pendingCount()).toBe(0);
  });
});
