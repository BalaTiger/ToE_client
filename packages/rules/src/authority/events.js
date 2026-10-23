import { collectFreshPresentationStats, collectSafePresentationEvents } from './presentationPublicEvents.js';
import { collectSafeDrawPresentationEvents } from './presentationDrawEvents.js';
import { orderPresentationEntries } from './presentationOrdering.js';
import { collectSafeComplexPresentationEvents } from './presentationComplexEvents.js';
import { collectSafeIncomePresentationEvents } from './presentationIncomeEvents.js';

const STAT_TYPES = new Set(['HP_LOSS', 'HP_GAIN', 'SAN_LOSS', 'SAN_GAIN', 'HP_SAN_LOSS', 'HP_SAN_GAIN', 'PLAYER_DEFEATED']);
export function collectPublicRuleEvents(before, after, { includeSummaries = true } = {}) {
  const pending = after._pendingPublicEvents || [];
  const stats = collectFreshPresentationStats(before, after, { orderOwnedPhases: true })
    .filter(event => STAT_TYPES.has(event.type));
  const positions = new Map(stats.map((event, index) => [event.id, index]));
  const cues = Array.from({ length: stats.length + 1 }, () => []);
  const drawEntries = collectSafeDrawPresentationEvents(before, after);
  const publicEntries = [...collectSafePresentationEvents(before, after), ...collectSafeComplexPresentationEvents(before, after),
    ...collectSafeIncomePresentationEvents(before, after)];
  const withoutOrder = input => Object.fromEntries(Object.entries(input)
    .filter(([key]) => !key.startsWith('presentation')));
  const pendingEntries = pending.map((event, index) => ({
    event: withoutOrder(event), sourceEventId: event.presentationEventId || `pending:${index}`,
    afterStatIds: event.presentationAfterStatIds || [], beforeStatIds: event.presentationBeforeStatIds || [],
    afterEventIds: event.presentationAfterEventIds || [], beforeEventIds: event.presentationBeforeEventIds || [],
    hasExplicitStatBoundary: Object.hasOwn(event, 'presentationAfterStatIds') || Object.hasOwn(event, 'presentationBeforeStatIds'),
    presentationOrder: event.presentationOrder,
  }));
  const entries = [...pendingEntries.filter(entry => entry.presentationOrder === 'beforeStats'),
    ...drawEntries, ...publicEntries, ...pendingEntries.filter(entry => entry.presentationOrder !== 'beforeStats')];
  for (const entry of entries) {
    const beforePositions = entry.beforeStatIds.filter(id => positions.has(id)).map(id => positions.get(id));
    const afterPositions = entry.afterStatIds.filter(id => positions.has(id)).map(id => positions.get(id) + 1);
    const beforeIndex = beforePositions.length ? Math.min(...beforePositions) : stats.length;
    const afterIndex = afterPositions.length ? Math.max(...afterPositions) : 0;
    // Only explicit producer anchors order a cue. A contradictory graph is
    // not permission to fabricate a result or to interrupt rule execution.
    if (afterIndex > beforeIndex) throw new TypeError('Conflicting presentation stat anchors');
    // The physical ID remains host-only until projectMatch HMACs it per
    // recipient. Keeping this identity makes reveal/income DOM anchors agree.
    let event = entry.event.type === 'cardRevealed' && entry.sourceCardId !== undefined
      ? { ...entry.event, card: { ...entry.event.card, id: entry.sourceCardId } } : entry.event;
    if (entry.sourceLinkId !== undefined) event = { ...event, sourceLinkId: entry.sourceLinkId };
    entry.event = event;
    entry.slot = beforePositions.length ? beforeIndex : afterPositions.length ? afterIndex
      : entry.hasExplicitStatBoundary || entry.presentationOrder === 'beforeStats' ? 0 : stats.length;
  }
  orderPresentationEntries(entries).forEach(entry => cues[entry.slot].push(entry.event));
  const deathSettlements = new Set(publicEntries.map(entry => entry.sourceDefeatStatId).filter(Boolean));
  const handled = new Set(publicEntries.filter(entry => entry.event.type === 'tsgSlimePopped'
    && ['fromHp', 'hp', 'fromSan', 'san'].every(key => Number.isFinite(entry.event[key])))
    .flatMap(entry => (entry.handledStatEventIds || []).filter(id => entry.statEventIds.includes(id))));
  const events = stats.flatMap((event, index) => [...cues[index], ...(handled.has(event.id) ? [] : [{ type: 'statChanged', seat: event.target, kind: event.type,
      fromHp: event.from?.hp, hp: event.to?.hp, fromSan: event.from?.san, san: event.to?.san,
      ...(['hpDepleted', 'petrification'].includes(event.cause) ? { cause: event.cause } : {}),
      ...(deathSettlements.has(event.id) || event.type === 'PLAYER_DEFEATED' && event.settlementOwner === 'huntResult'
        ? { cardSettlementPending: true } : {}),
      ...(event.type === 'PLAYER_DEFEATED' && event.committedPlayers?.[event.target]?.roleRevealed
        && ['寻宝者', '追猎者', '邪祀者'].includes(event.committedPlayers[event.target].role)
        ? { revealedRole: event.committedPlayers[event.target].role } : {}),
      defeated: event.type === 'PLAYER_DEFEATED' }])]).concat(cues[stats.length]);
  if (includeSummaries && (before.currentTurn !== after.currentTurn || before.turn !== after.turn)
    && !drawEntries.some(entry => entry.event.type === 'turnStarted')) events.push({ type: 'turnStarted', seat: after.currentTurn, turn: after.turn });
  const drawn = after.drawReveal?.card, drawer = after.drawReveal?.drawerIdx ?? after.currentTurn;
  if (includeSummaries && drawn && drawn.id !== before.drawReveal?.card?.id
    && !drawEntries.some(entry => entry.sourceCardId === drawn.id)) events.push({ type: 'cardRevealed', seat: drawer, card: drawn,
    reason: 'draw', ...(after.drawReveal.blindZoneIdentity || drawn.blindZoneIdentity ? { excludeSeat: drawer } : {}) });
  if (includeSummaries && !after._privateSwap) after.players.forEach((player, seat) => {
    if (player.hand.length !== before.players[seat]?.hand.length) events.push({ type: 'cardCountChanged', seat, count: player.hand.length });
  });
  return events;
}
// Fresh initialization only. Reconnect never regenerates historical events.
// The original initGame journals must still be available before compaction.
export function collectInitialPublicRuleEvents(state) {
  return collectPublicRuleEvents({ players: state.players || [], currentTurn: -1, turn: -1,
    _visualEvents: [], _statEvents: [] }, state, { includeSummaries: false });
}
export function compactAuthorityState(state) {
  if (!state._intentEngine) return state;
  // Presentation snapshots/journals never own a continuation. Every pending
  // rule frame lives in explicit state/ability data, and numeric watermarks
  // remain intact. Keeping past full-board visual graphs would duplicate
  // private hands indefinitely in a local save.
  const next = { ...state, log: (state.log || []).slice(-512), _statEvents: [], _visualEvents: [] };
  next.players = state.players.map(player => {
    if (!player?._deathSettlementReceipt) return player;
    const clean = { ...player }; delete clean._deathSettlementReceipt; return clean;
  });
  for (const key of ['_playersBeforeThisDraw', '_preTurnPlayers', '_playersBeforeCthDraws', '_inspectionBeforePlayers',
    '_earthquakeBeforePlayers', '_playersBeforeNextDraw', '_playersBeforeSkillAction', '_aiHandLimitBeforePlayers',
    '_drawLogs', '_statLogs', '_turnStartLogs', '_drawnCard', '_aiDrawnCard']) delete next[key];
  return next;
}
