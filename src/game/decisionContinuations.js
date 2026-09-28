export const DECISION_CONTINUATION_PHASE = Object.freeze({
  GOD_CHOICE: 'GOD_CHOICE',
});

function normalizeFrame(frame) {
  if (!frame?.phase) return null;
  return {
    phase: frame.phase,
    abilityData: { ...(frame.abilityData || {}) },
  };
}

export function createDecisionContinuation(phase, abilityData = {}) {
  return normalizeFrame({ phase, abilityData });
}

export function appendDecisionContinuation(stateOrFrames, frame) {
  const normalized = normalizeFrame(frame);
  const existing = Array.isArray(stateOrFrames)
    ? stateOrFrames
    : Array.isArray(stateOrFrames?._decisionContinuations)
      ? stateOrFrames._decisionContinuations
      : [];
  return normalized ? [...existing, normalized] : [...existing];
}

export function peekDecisionContinuation(state) {
  const frames = Array.isArray(state?._decisionContinuations)
    ? state._decisionContinuations
    : [];
  return frames.length ? frames[frames.length - 1] : null;
}

export function popDecisionContinuation(state) {
  const frames = Array.isArray(state?._decisionContinuations)
    ? state._decisionContinuations
    : [];
  if (!frames.length) return { frame: null, remaining: [] };
  return {
    frame: frames[frames.length - 1],
    remaining: frames.slice(0, -1),
  };
}

