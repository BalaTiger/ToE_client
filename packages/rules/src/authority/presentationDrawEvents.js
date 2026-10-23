import { orderRuleResolutionEvents } from '../game/ruleResolutionTransaction.js';
import { collectFreshPresentationStats } from './presentationPublicEvents.js';

const CHILD_EVENTS = ['settlementEvents', 'encounterEvents', 'acceptanceEvents', 'visualEvents'];
const STRINGS = ['name', 'desc', 'key', 'letter', 'type', 'godKey', 'shortKey', 'flavorText'];
const NUMBERS = ['number', 'val'];
const FLAGS = ['forced', 'isZone', 'isGod', 'isBlackGoatYoung', 'isTsathogguaSlime'];
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value))];
const validSeat = value => Number.isInteger(value) && value >= 0;

function visualsOf(state) {
  const result = [], visited = new Set();
  const visit = events => {
    for (const event of orderRuleResolutionEvents(list(events))) {
      if (!event || visited.has(event)) continue;
      visited.add(event);
      result.push(event);
      CHILD_EVENTS.forEach(key => visit(event[key]));
    }
  };
  visit(state?._visualEvents);
  return result;
}

const cardFace = card => Object.fromEntries([
  ...STRINGS.filter(key => typeof card?.[key] === 'string'),
  ...NUMBERS.filter(key => Number.isFinite(card?.[key])),
  ...FLAGS.filter(key => typeof card?.[key] === 'boolean'),
].map(key => [key, card[key]]));

/** Server-only extraction from explicit canonical draw/turn events.
 * Only entry.event is a wire candidate. sourceCardId is retained separately
 * for host HMAC projection and summary deduplication, never sent directly.
 * No player, hand, deck, log or final drawReveal snapshot supplies a reveal.
 */
export function collectSafeDrawPresentationEvents(before, after) {
  const previousIds = new Set(visualsOf(before).map(event => event.id));
  const visuals = visualsOf(after);
  const stats = collectFreshPresentationStats(before, after, { orderOwnedPhases: true });
  const statIds = new Set(stats.map(stat => stat.id));
  const fresh = ids => unique(ids).filter(id => statIds.has(id));
  const emitted = new Set(), entries = [];
  for (const visual of visuals) {
    if (typeof visual.id !== 'string' || !visual.id || previousIds.has(visual.id) || emitted.has(visual.id)) continue;
    if (!validSeat(visual.playerIdx)) continue;
    if (visual.type === 'turnStart') {
      // A resumed decision may carry the stable banner again; this condition
      // suppresses that duplicate, it never manufactures a banner from state.
      if (before?.currentTurn === after?.currentTurn && before?.turn === after?.turn) continue;
      const turnStats = unique(visuals.filter(event => event.turnKey === visual.turnKey)
        .flatMap(event => [...list(event.statEventIds), ...list(event.statEvents).map(stat => stat.id)]));
      const afterStatIds = fresh(list(visual.presentationAfterStatIds));
      entries.push({ event: { type: 'turnStarted', seat: visual.playerIdx,
        ...(Number.isFinite(visual.turnKey) ? { turn: visual.turnKey } : {}) },
      sourceEventId: visual.id, statEventIds: [], afterStatIds,
      afterEventIds: unique(list(visual.presentationAfterEventIds)),
      beforeStatIds: fresh([...list(visual.presentationBeforeStatIds), ...turnStats]).filter(id => !afterStatIds.includes(id)) });
      emitted.add(visual.id);
      continue;
    }
    if (visual.type !== 'drawCard' || !visual.card) continue;
    const card = cardFace(visual.card);
    if (!Object.keys(card).length) continue;
    const owned = fresh(list(visual.statEventIds));
    const afterStatIds = fresh(list(visual.presentationAfterStatIds));
    // Canonical turn draws own their consequences by stat identity. When no
    // explicit prior boundary exists, their earliest owned stat establishes it.
    const firstOwned = stats.findIndex(stat => owned.includes(stat.id));
    if (!Object.hasOwn(visual, 'presentationAfterStatIds') && firstOwned >= 0) {
      afterStatIds.push(...stats.slice(0, firstOwned).map(stat => stat.id));
    }
    const sourceCardId = visual.card.id;
    entries.push({ event: { type: 'cardRevealed', seat: visual.playerIdx,
      reason: visual.presentationReason === 'endTurnReplay' ? 'endTurnReplay' : 'draw', card,
      ...(visual.presentationReason !== 'endTurnReplay' && ['deck', 'discard'].includes(visual.sourcePile) ? { sourcePile: visual.sourcePile } : {}),
      ...(visual.blindZoneIdentity === true || visual.card.blindZoneIdentity === true ? { excludeSeat: visual.playerIdx } : {}) },
    sourceEventId: visual.id,
    ...(['string', 'number'].includes(typeof sourceCardId) ? { sourceCardId } : {}),
    statEventIds: owned, afterStatIds: unique(afterStatIds), beforeStatIds: owned,
    beforeEventIds: unique(list(visual.presentationBeforeEventIds)),
    afterEventIds: unique(list(visual.presentationAfterEventIds)) });
    emitted.add(visual.id);
  }
  return entries;
}
