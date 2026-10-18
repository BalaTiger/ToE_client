const key = state => `${state._turnKey ?? state.turn ?? 0}:${state.currentTurn ?? 0}`;
export function createTurnClock(state, now) { return { key: key(state), remainingMs: 45000, lastAt: now }; }
export function updateTurnClock(record, state, now) {
  const previous = record.turnClock || createTurnClock(record.state, now);
  if (previous.key !== key(state)) return createTurnClock(state, now);
  const elapsed = record.state._isMP && record.state.phase === 'ACTION' ? Math.max(0, now - previous.lastAt) : 0;
  return { ...previous, remainingMs: Math.max(0, previous.remainingMs - elapsed), lastAt: now };
}
export function decisionDuration(state, record) {
  if (record.durationMs !== null && record.durationMs !== undefined) return record.durationMs;
  if (state.phase === 'ACTION') return record.turnClock?.remainingMs ?? 45000;
  if (state.phase === 'DISCARD_PHASE' || state.phase === 'DRAW_REVEAL' && state.drawReveal?.fromRest
    || state.phase === 'GOD_CHOICE' && state.abilityData?.fromRest) return 15000;
  return 20000;
}
export function houndsRunning(state) {
  if (!state.houndsOfTindalosActive || state.gameOver) return false;
  if (state._isMP) return state.phase === 'ACTION';
  return !['HUNT_WAIT_REVEAL', 'PLAYER_REVEAL_FOR_HUNT', 'CAVE_DUEL_SELECT_TARGET', 'CAVE_DUEL_SELECT_CARD', 'CAVE_DUEL_WAIT_REVEAL'].includes(state.phase);
}
export function remainingHounds(record, now) {
  const clock = record.houndsClock;
  if (!clock) return null;
  return Math.max(0, clock.remainingMs - (houndsRunning(record.state) ? Math.max(0, now - clock.lastAt) : 0));
}
export function updateHoundsClock(record, state, now, revision) {
  if (!state.houndsOfTindalosActive || state.gameOver) return null;
  if (!record.houndsClock || !record.state.houndsOfTindalosActive) return {
    id: `${record.id}:hounds:${revision}`, remainingMs: Math.max(0, 15000 - (state.houndsOfTindalosElapsed || 0) * 1000), lastAt: now,
  };
  return { ...record.houndsClock, remainingMs: remainingHounds(record, now), lastAt: now };
}
