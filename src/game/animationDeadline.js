// Only the remote presentation adapter supplies a deadline. Offline playback
// retains its original timing and pause behavior.
export function animationDeadlineSchedule(cues, queuedSteps, {
  deadlineMs, nowMs, stepGapMs = 0,
} = {}) {
  if (!Number.isFinite(deadlineMs)) return { rate: 1, remainingMs: null };
  const remainingMs = Math.max(0, deadlineMs - nowMs);
  const activeMs = Math.max(0, ...cues.map(cue => cue.delayMs));
  const queuedMs = queuedSteps.reduce((total, step) => total
    + (['STATE_PATCH', 'VISUAL_LOCK'].includes(step.type) ? 0 : Math.max(0, step.durationMs || 0) + stepGapMs), 0);
  return { remainingMs, rate: remainingMs === 0 ? Infinity : Math.max(1, (activeMs + queuedMs) / remainingMs) };
}
