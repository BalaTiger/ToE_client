export const CAVE_DUEL_SOUND_TIMING = Object.freeze({
  bgVolume: 0.14,
  bgFadeInMs: 220,
  bgStopMs: 2600,
  bgFadeMs: 520,
  resultDelayMs: 1380,
  winVolume: 0.28,
  winStopMs: 2580,
  winFadeMs: 1000,
  loseVolume: 0.74,
  loseStopMs: 2200,
  loseFadeMs: 320,
  cleanupTailMs: 360,
});

const clamp01 = value => Math.max(0, Math.min(1, value));
const smoothstep01 = value => {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
};

function resetAudio(audio, volume) {
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = 1;
    audio.volume = volume;
  } catch {
    // Ignore browser audio state errors during cleanup.
  }
}

export function startCaveDuelSoundSequence({
  caveDuel,
  localLost = false,
  fadeFrames,
  fadeOutAudio,
  sequenceKey = Date.now(),
  timing = CAVE_DUEL_SOUND_TIMING,
  scheduler = {},
  onCleanup,
}) {
  if (!caveDuel?.bg || !caveDuel?.win || !caveDuel?.lose) {
    return undefined;
  }
  const setTimer = scheduler.setTimeout || setTimeout;
  const clearTimer = scheduler.clearTimeout || clearTimeout;
  const requestFrame = scheduler.requestAnimationFrame
    || (callback => requestAnimationFrame(callback));
  const cancelFrame = scheduler.cancelAnimationFrame
    || (frame => cancelAnimationFrame(frame));
  const now = scheduler.now || (() => performance.now());
  const timers = [];
  const fadeKeys = new Set();
  const addTimer = timer => timers.push(timer);
  const addFadeKey = key => fadeKeys.add(key);
  const bgFadeKey = `cave-duel-bg-${sequenceKey}`;
  const resultFadeKey = `cave-duel-result-${sequenceKey}`;
  const resultAudio = localLost ? caveDuel.lose : caveDuel.win;
  const resultVolume = localLost
    ? timing.loseVolume
    : timing.winVolume;
  const resultStopMs = localLost
    ? timing.loseStopMs
    : timing.winStopMs;
  const resultFadeMs = localLost
    ? timing.loseFadeMs
    : timing.winFadeMs;
  let cleaned = false;

  const fadeInAudio = (audio, key, durationMs, targetVolume) => {
    addFadeKey(key);
    if (fadeFrames[key]) {
      cancelFrame(fadeFrames[key]);
      fadeFrames[key] = null;
    }
    const start = now();
    const step = frameTime => {
      const progress = clamp01((frameTime - start) / durationMs);
      try {
        audio.volume = targetVolume * smoothstep01(progress);
      } catch {
        // Ignore browser audio state errors.
      }
      if (progress < 1) {
        fadeFrames[key] = requestFrame(step);
        return;
      }
      try {
        audio.volume = targetVolume;
      } catch {
        // Ignore browser audio state errors.
      }
      fadeFrames[key] = null;
    };
    fadeFrames[key] = requestFrame(step);
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    timers.forEach(timer => clearTimer(timer));
    fadeKeys.forEach(key => {
      if (fadeFrames[key]) {
        cancelFrame(fadeFrames[key]);
        fadeFrames[key] = null;
      }
    });
    resetAudio(caveDuel.bg, timing.bgVolume);
    resetAudio(caveDuel.win, timing.winVolume);
    resetAudio(caveDuel.lose, timing.loseVolume);
    onCleanup?.();
  };

  try {
    resetAudio(caveDuel.bg, 0);
    caveDuel.bg.volume = 0;
    caveDuel.bg.play().catch(() => {});
    fadeInAudio(
      caveDuel.bg,
      bgFadeKey,
      timing.bgFadeInMs,
      timing.bgVolume
    );
    addTimer(setTimer(() => {
      fadeOutAudio(
        caveDuel.bg,
        bgFadeKey,
        timing.bgFadeMs,
        timing.bgVolume
      );
    }, Math.max(0, timing.bgStopMs - timing.bgFadeMs)));
  } catch {
    // Ignore browser audio state errors.
  }

  addTimer(setTimer(() => {
    try {
      resetAudio(resultAudio, resultVolume);
      resultAudio.volume = resultVolume;
      resultAudio.play().catch(() => {});
      addFadeKey(resultFadeKey);
      addTimer(setTimer(() => {
        fadeOutAudio(
          resultAudio,
          resultFadeKey,
          resultFadeMs,
          resultVolume
        );
      }, Math.max(0, resultStopMs - resultFadeMs)));
    } catch {
      // Ignore browser audio state errors.
    }
  }, timing.resultDelayMs));

  addTimer(setTimer(
    cleanup,
    timing.resultDelayMs + resultStopMs + timing.cleanupTailMs
  ));
  return cleanup;
}
