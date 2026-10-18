export function getCthRestDrawRemaining(stateLike) {
  return stateLike?.abilityData?.cthDrawsRemaining || 0;
}

export function consumeCthRestDrawRemaining(stateLike) {
  return Math.max(0, getCthRestDrawRemaining(stateLike) - 1);
}

export function buildCthRestDrawFinishedState({
  stateLike,
  players,
  deck,
  discard,
  log,
}) {
  return {
    ...stateLike,
    players,
    deck,
    discard,
    log,
    abilityData: {},
  };
}
