const TERMINAL_LOSS_TYPES = new Set(['HP_LOSS', 'SAN_LOSS', 'HP_SAN_LOSS']);

function statEventCrossesTerminalThreshold(event = {}) {
  if (!TERMINAL_LOSS_TYPES.has(event?.type)) return false;
  const fromHp = Number(event?.from?.hp);
  const toHp = Number(event?.to?.hp);
  const fromSan = Number(event?.from?.san);
  const toSan = Number(event?.to?.san);
  const hpDepleted = Number.isFinite(toHp) && toHp <= 0
    && (!Number.isFinite(fromHp) || fromHp > 0);
  const sanDepleted = Number.isFinite(toSan) && toSan <= 0
    && (!Number.isFinite(fromSan) || fromSan > 0);
  return hpDepleted || sanDepleted;
}

function stepCrossesTerminalThreshold(step = {}) {
  return (Array.isArray(step?.statEvents) ? step.statEvents : [])
    .some(statEventCrossesTerminalThreshold);
}

// Terminal presentation is a transaction property, not an animation type.
// New rule transactions mark the causative event explicitly. The stat-event
// fallback keeps still-migrating queue-authoritative call sites safe without
// branching on SAN/HP game-over scenarios.
export function findTerminalPresentationBoundary(queue = [], nextState = null) {
  if (!nextState?.gameOver || !Array.isArray(queue) || !queue.length) return -1;

  const explicitIndex = queue.findIndex(step => step?.terminalBoundary === true);
  if (explicitIndex >= 0) return explicitIndex;

  const terminalVisualEventId = nextState?.terminalBoundary?.visualEventId
    || nextState?._terminalVisualEventId
    || null;
  if (terminalVisualEventId) {
    const eventIndex = queue.findIndex(step => step?.visualEventId === terminalVisualEventId);
    if (eventIndex >= 0) return eventIndex;
  }

  return queue.findIndex(stepCrossesTerminalThreshold);
}

export function truncateQueueAtTerminalPresentation(queue = [], nextState = null) {
  const source = Array.isArray(queue) ? queue.filter(Boolean) : [];
  const boundaryIndex = findTerminalPresentationBoundary(source, nextState);
  return boundaryIndex >= 0 ? source.slice(0, boundaryIndex + 1) : source;
}
