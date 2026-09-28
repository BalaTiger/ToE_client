import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAVE_DUEL_SOUND_TIMING,
  startCaveDuelSoundSequence,
} from './caveDuelSoundSequence';

function makeAudio() {
  return {
    currentTime: 0,
    playbackRate: 1,
    volume: 1,
    pause: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
  };
}

function makeHarness(localLost = false) {
  const caveDuel = {
    bg: makeAudio(),
    win: makeAudio(),
    lose: makeAudio(),
  };
  const fadeOutAudio = vi.fn();
  const fadeFrames = {};
  const cancelAnimationFrame = vi.fn();
  let nextFrame = 1;
  const cleanup = startCaveDuelSoundSequence({
    caveDuel,
    localLost,
    fadeFrames,
    fadeOutAudio,
    sequenceKey: 'test',
    scheduler: {
      setTimeout,
      clearTimeout,
      now: () => 0,
      requestAnimationFrame: () => nextFrame++,
      cancelAnimationFrame,
    },
  });
  return {
    caveDuel,
    fadeOutAudio,
    fadeFrames,
    cancelAnimationFrame,
    cleanup,
  };
}

describe('cave duel sound sequence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the result track after the cinematic delay', () => {
    const { caveDuel, cleanup } = makeHarness();

    expect(caveDuel.bg.play).toHaveBeenCalledOnce();
    expect(caveDuel.win.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(CAVE_DUEL_SOUND_TIMING.resultDelayMs - 1);
    expect(caveDuel.win.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(caveDuel.win.play).toHaveBeenCalledOnce();

    cleanup();
  });

  it('keeps the winning hit before its one-second fade', () => {
    const { caveDuel, fadeOutAudio, cleanup } = makeHarness();
    const fadeStart = CAVE_DUEL_SOUND_TIMING.resultDelayMs
      + CAVE_DUEL_SOUND_TIMING.winStopMs
      - CAVE_DUEL_SOUND_TIMING.winFadeMs;

    vi.advanceTimersByTime(fadeStart - 1);
    expect(fadeOutAudio).not.toHaveBeenCalledWith(
      caveDuel.win,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    vi.advanceTimersByTime(1);
    expect(fadeOutAudio).toHaveBeenCalledWith(
      caveDuel.win,
      'cave-duel-result-test',
      1000,
      CAVE_DUEL_SOUND_TIMING.winVolume
    );

    cleanup();
  });

  it('preserves the existing losing-track fade timing', () => {
    const { caveDuel, fadeOutAudio, cleanup } = makeHarness(true);
    const fadeStart = CAVE_DUEL_SOUND_TIMING.resultDelayMs
      + CAVE_DUEL_SOUND_TIMING.loseStopMs
      - CAVE_DUEL_SOUND_TIMING.loseFadeMs;

    vi.advanceTimersByTime(fadeStart - 1);
    expect(fadeOutAudio).not.toHaveBeenCalledWith(
      caveDuel.lose,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    vi.advanceTimersByTime(1);
    expect(fadeOutAudio).toHaveBeenCalledWith(
      caveDuel.lose,
      'cave-duel-result-test',
      320,
      CAVE_DUEL_SOUND_TIMING.loseVolume
    );

    cleanup();
  });

  it('outlives the visual overlay and resets every track on cleanup', () => {
    const {
      caveDuel,
      fadeFrames,
      cancelAnimationFrame,
      cleanup,
    } = makeHarness();

    vi.advanceTimersByTime(2600);
    expect(caveDuel.win.play).toHaveBeenCalledOnce();
    expect(caveDuel.win.pause).toHaveBeenCalledOnce();

    cleanup();

    expect(caveDuel.bg.volume).toBe(CAVE_DUEL_SOUND_TIMING.bgVolume);
    expect(caveDuel.win.volume).toBe(CAVE_DUEL_SOUND_TIMING.winVolume);
    expect(caveDuel.lose.volume).toBe(CAVE_DUEL_SOUND_TIMING.loseVolume);
    expect(caveDuel.win.pause).toHaveBeenCalledTimes(2);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(Object.values(fadeFrames).every(value => value == null)).toBe(true);
  });
});
