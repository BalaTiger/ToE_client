function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function getTrackEndFadeProgress({
  currentTimeSeconds,
  durationSeconds,
  fallbackDurationMs,
  fadeMs,
  guardMs = 0,
}) {
  const durationMs = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds * 1000
    : fallbackDurationMs;
  const currentTimeMs = Math.max(0, Number(currentTimeSeconds) || 0) * 1000;
  const remainingMs = Math.max(0, durationMs - currentTimeMs);
  const fadeStartRemainingMs = Math.max(0, fadeMs) + Math.max(0, guardMs);
  if (remainingMs > fadeStartRemainingMs) return null;
  return clamp01((fadeStartRemainingMs - remainingMs) / Math.max(1, fadeMs));
}

export function startTrackEndFadeMonitor({
  audio,
  baseVolume,
  fallbackDurationMs,
  fadeMs,
  guardMs = 0,
  smooth = false,
  isCurrent = () => true,
  onComplete,
  scheduler = {
    requestAnimationFrame: callback => requestAnimationFrame(callback),
    cancelAnimationFrame: frame => cancelAnimationFrame(frame),
  },
}) {
  let frame = null;
  let cancelled = false;

  const step = () => {
    if (cancelled || !isCurrent()) return;
    const progress = getTrackEndFadeProgress({
      currentTimeSeconds: audio.currentTime,
      durationSeconds: audio.duration,
      fallbackDurationMs,
      fadeMs,
      guardMs,
    });
    if (progress != null) {
      const gain = smooth ? 1 - smoothstep01(progress) : 1 - progress;
      try { audio.volume = baseVolume * gain; } catch { /* ignore */ }
      if (progress >= 1) {
        frame = null;
        onComplete?.();
        return;
      }
    }
    frame = scheduler.requestAnimationFrame(step);
  };

  frame = scheduler.requestAnimationFrame(step);
  return () => {
    cancelled = true;
    if (frame != null) scheduler.cancelAnimationFrame(frame);
    frame = null;
  };
}
