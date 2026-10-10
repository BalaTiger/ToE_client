function getExplicitHuntPromptId(state) {
  const promptId = state?.abilityData?.huntPromptId;
  return promptId == null ? null : String(promptId);
}

// Keep this Set for one multiplayer session. Prompt IDs survive seat rotation
// and distinguish consecutive hunts, including hunts in the same turn. Legacy
// snapshots without an explicit ID retain their existing replay behavior.
export function isResolvedMpHuntWaitState(state, completedPromptIds) {
  if (state?.phase !== 'HUNT_WAIT_REVEAL') return false;
  const promptId = getExplicitHuntPromptId(state);
  return promptId !== null && !!completedPromptIds?.has(promptId);
}

export function rememberMpHuntRevealConfirmation(state, completedPromptIds) {
  if (state?.phase !== 'HUNT_CONFIRM') return;
  const promptId = getExplicitHuntPromptId(state);
  if (promptId !== null) completedPromptIds?.add(promptId);
}

// The AI authority claims after resolution succeeds and before emitting. Its
// own confirmation must still pass through normal replay, so incoming replay
// records a confirmation idempotently instead of claiming it again.
export function claimMpHuntRevealConfirmation(state, completedPromptIds) {
  if (state?.phase !== 'HUNT_CONFIRM') return true;
  const promptId = getExplicitHuntPromptId(state);
  if (promptId === null || !completedPromptIds) return true;
  if (completedPromptIds.has(promptId)) return false;
  completedPromptIds.add(promptId);
  return true;
}
