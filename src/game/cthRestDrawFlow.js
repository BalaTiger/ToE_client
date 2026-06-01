export function getCthRestDrawRemaining(stateLike) {
  return stateLike?.abilityData?.cthDrawsRemaining || 0;
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
