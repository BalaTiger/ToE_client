const STAT_TYPES = new Set(['HP_LOSS', 'HP_GAIN', 'SAN_LOSS', 'SAN_GAIN', 'HP_SAN_LOSS', 'HP_SAN_GAIN', 'PLAYER_DEFEATED']);
export function collectPublicRuleEvents(before, after) {
  const oldIds = new Set((before._statEvents || []).map(event => event.id));
  const events = (after._statEvents || []).filter(event => STAT_TYPES.has(event.type) && !oldIds.has(event.id))
    .map(event => ({ type: 'statChanged', seat: event.target, kind: event.type,
      fromHp: event.from?.hp, hp: event.to?.hp, fromSan: event.from?.san, san: event.to?.san,
      defeated: event.type === 'PLAYER_DEFEATED' }));
  if (before.currentTurn !== after.currentTurn || before.turn !== after.turn) events.push({ type: 'turnStarted', seat: after.currentTurn, turn: after.turn });
  const drawn = after.drawReveal?.card, drawer = after.drawReveal?.drawerIdx ?? after.currentTurn;
  if (drawn && drawn.id !== before.drawReveal?.card?.id) events.push({ type: 'cardRevealed', seat: drawer, card: drawn,
    reason: 'draw', ...(after.drawReveal.blindZoneIdentity || drawn.blindZoneIdentity ? { excludeSeat: drawer } : {}) });
  if (!after._privateSwap) after.players.forEach((player, seat) => {
    if (player.hand.length !== before.players[seat]?.hand.length) events.push({ type: 'cardCountChanged', seat, count: player.hand.length });
  });
  return events;
}
export function compactAuthorityState(state) {
  if (!state._intentEngine) return state;
  // Presentation snapshots/journals never own a continuation. Every pending
  // rule frame lives in explicit state/ability data, and numeric watermarks
  // remain intact. Keeping past full-board visual graphs would duplicate
  // private hands indefinitely in a local save.
  const next = { ...state, log: (state.log || []).slice(-512), _statEvents: [], _visualEvents: [] };
  for (const key of ['_playersBeforeThisDraw', '_preTurnPlayers', '_playersBeforeCthDraws', '_inspectionBeforePlayers',
    '_earthquakeBeforePlayers', '_playersBeforeNextDraw', '_playersBeforeSkillAction', '_aiHandLimitBeforePlayers',
    '_drawLogs', '_statLogs', '_turnStartLogs', '_drawnCard', '_aiDrawnCard']) delete next[key];
  return next;
}
