import { collectFreshPresentationStats } from './presentationPublicEvents.js';
import { ruleScopedId } from '../runtime.js';

// Only a completed canonical move can produce an income event. A pending
// reveal, a hand-count change, or a presentation snapshot is not a receipt.
export function cardIncomeCommittedEvent(income, state = null) {
  if (!income) return null;
  const event = { type: 'cardIncomeCommitted', seat: income.drawerIdx, card: income.card,
    destination: income.dest === 'player' ? 'hand' : income.dest, source: income.source || 'reveal' };
  return state ? committedPublicEvent(state, event) : event;
}

export function committedPublicEvent(state, event) {
  const priorEvents = new Set(), visited = new Set();
  const visit = events => (events || []).forEach(visual => {
    if (!visual || visited.has(visual)) return;
    visited.add(visual);
    if (typeof visual.id === 'string') priorEvents.add(visual.id);
    ['settlementEvents', 'encounterEvents', 'acceptanceEvents', 'visualEvents'].forEach(key => visit(visual[key]));
  });
  visit(state._visualEvents);
  (state._pendingPublicEvents || []).forEach(prior => { if (prior.presentationEventId) priorEvents.add(prior.presentationEventId); });
  return { ...event, presentationOrder: 'beforeStats',
    presentationEventId: ruleScopedId('receipt', `${event.type}:${event.card?.id ?? state._pendingPublicEvents?.length ?? 0}:${event.seat ?? event.sourceSeat ?? 0}`),
    presentationAfterEventIds: [...priorEvents],
    presentationAfterStatIds: collectFreshPresentationStats({}, state).map(stat => stat.id) };
}

export function appendCommittedPublicEvent(state, event) {
  return { ...state, _pendingPublicEvents: [...(state._pendingPublicEvents || []), committedPublicEvent(state, event)] };
}
