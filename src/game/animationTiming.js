export const DEFAULT_ANIMATION_IMPACT_MS = Object.freeze({
  HP_DAMAGE: 350,
  SAN_DAMAGE: 460,
  HP_HEAL: 350,
  SAN_HEAL: 350,
  TSG_SLIME_POP: 350,
});

export function resolveAnimationStepTiming(step = {}, {
  durationByType = {},
  speedScale = 1,
  cardRevealDuration = 0,
  defaultImpactByType = DEFAULT_ANIMATION_IMPACT_MS,
} = {}) {
  const isCard = step.type === 'DRAW_CARD';
  const durationMs = Number.isFinite(step.durationMs)
    ? Math.max(0, step.durationMs)
    : isCard
      ? Math.max(0, cardRevealDuration)
      : Math.max(0, Math.round((durationByType[step.type] || durationByType.default || 0) * speedScale));
  const configuredImpact = Number.isFinite(step.impactAtMs)
    ? step.impactAtMs
    : defaultImpactByType[step.type];
  const impactAtMs = Number.isFinite(configuredImpact)
    ? Math.min(durationMs, Math.max(0, configuredImpact))
    : null;
  return {
    ...step,
    durationMs,
    ...(impactAtMs != null ? { impactAtMs } : {}),
  };
}

export function buildAnimationPlaybackCues(step = {}, stepGapMs = 0) {
  const durationMs = Math.max(0, step.durationMs || 0);
  const cues = (Array.isArray(step.visualTimeline) ? step.visualTimeline : []).map((item, index) => ({
    id: `visual:${index}`,
    atMs: Math.max(0, item?.atMs || 0),
    kind: 'visual',
    patch: item?.patch || {},
  }));
  if (Number.isFinite(step.impactAtMs)) {
    cues.push({ id: 'impact', atMs: Math.max(0, step.impactAtMs), kind: 'impact' });
  }
  if (step.type !== 'DRAW_CARD') {
    cues.push({ id: 'exit', atMs: durationMs, kind: 'exit' });
  }
  cues.push({ id: 'advance', atMs: durationMs + Math.max(0, stepGapMs), kind: 'advance' });
  return cues.sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id));
}

export function getPendingAnimationCues(cues = [], elapsedMs = 0, firedCueIds = new Set()) {
  return cues
    .filter(cue => !firedCueIds.has(cue.id))
    .map(cue => ({ ...cue, delayMs: Math.max(0, cue.atMs - Math.max(0, elapsedMs)) }));
}

export function advanceAnimationElapsed(elapsedMs = 0, runningSinceMs = null, nowMs = Date.now()) {
  if (!Number.isFinite(runningSinceMs)) return Math.max(0, elapsedMs);
  return Math.max(0, elapsedMs) + Math.max(0, nowMs - runningSinceMs);
}
