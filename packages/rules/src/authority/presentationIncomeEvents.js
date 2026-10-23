import { orderRuleResolutionEvents } from '../game/ruleResolutionTransaction.js';
import { collectFreshPresentationStats } from './presentationPublicEvents.js';

const list = value => Array.isArray(value) ? value : [];
const validSeat = value => Number.isInteger(value) && value >= 0;
const strings = ['id', 'name', 'desc', 'key', 'letter', 'type', 'godKey', 'shortKey', 'flavorText'];
const numbers = ['id', 'number', 'val'];
const flags = ['forced', 'isZone', 'isGod', 'isBlackGoatYoung', 'isTsathogguaSlime'];
const face = card => Object.fromEntries([
  ...strings.filter(key => typeof card?.[key] === 'string'),
  ...numbers.filter(key => Number.isFinite(card?.[key])),
  ...flags.filter(key => typeof card?.[key] === 'boolean'),
].map(key => [key, card[key]]));
function visuals(state) {
  const result = [], visited = new Set();
  const visit = events => orderRuleResolutionEvents(list(events)).forEach(event => {
    if (!event || visited.has(event)) return;
    visited.add(event); result.push(event);
    ['settlementEvents', 'encounterEvents', 'acceptanceEvents', 'visualEvents'].forEach(key => visit(event[key]));
  });
  visit(state?._visualEvents); return result;
}
function receiptEvent(receipt) {
  if (!receipt) return null;
  if (receipt.type === 'handsSwapped' && validSeat(receipt.sourceSeat) && validSeat(receipt.targetSeat)
    && receipt.sourceSeat !== receipt.targetSeat) {
    const sourceReceivedCards = list(receipt.sourceReceivedCards).map(face);
    const targetReceivedCards = list(receipt.targetReceivedCards).map(face);
    return { type: 'handsSwapped', sourceSeat: receipt.sourceSeat, targetSeat: receipt.targetSeat,
      sourceCount: sourceReceivedCards.length, targetCount: targetReceivedCards.length,
      sourceReceivedCards, targetReceivedCards };
  }
  if (receipt.type === 'cardIncomeCommitted' && validSeat(receipt.seat) && receipt.card
    && ['hand', 'discard', 'zone', 'godZone'].includes(receipt.destination)
    && ['reveal', 'generated', 'hand'].includes(receipt.source)) {
    return { type: receipt.type, seat: receipt.seat, card: face(receipt.card),
      destination: receipt.destination, source: receipt.source };
  }
  if (receipt.type === 'publicCardsDiscarded' && validSeat(receipt.seat)
    && receipt.source === 'godZone' && list(receipt.cards).length) {
    return { type: receipt.type, seat: receipt.seat, source: receipt.source, cards: receipt.cards.map(face) };
  }
  return null;
}

// Server-only candidates: receipt cards still require per-recipient HMAC and
// handsSwapped faces must be reduced to the receiving viewer by projectMatch.
export function collectSafeIncomePresentationEvents(before, after) {
  const seen = new Set(visuals(before).map(event => event.id)), entries = [];
  const stats = collectFreshPresentationStats(before, after).map(stat => stat.id);
  for (const visual of visuals(after)) {
    if (typeof visual.id !== 'string' || seen.has(visual.id)) continue;
    seen.add(visual.id);
    if (visual.type !== 'cardEffect' || visual.effectKey !== 'authorityCardReceipt') continue;
    const event = receiptEvent(visual.payload?.receipt);
    if (!event) continue;
    const afterStatIds = list(visual.presentationAfterStatIds);
    entries.push({ event, sourceEventId: visual.id, statEventIds: [],
      afterStatIds, beforeStatIds: [...list(visual.presentationBeforeStatIds),
        ...stats.filter(id => !afterStatIds.includes(id))],
      afterEventIds: list(visual.presentationAfterEventIds), beforeEventIds: list(visual.presentationBeforeEventIds) });
  }
  return entries;
}
