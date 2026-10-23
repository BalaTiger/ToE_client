import { createCardEffectEvent } from './visualEvents.js';

// A mutation receipt owns only the cards it moved. It is never a player snapshot.
export function createCardReceiptEvent(receipt, state = {}) {
  const ids = new Set(), visited = new Set();
  const add = events => (events || []).forEach(event => { if (event?.id) ids.add(event.id); });
  const visit = events => (events || []).forEach(event => {
    if (!event || visited.has(event)) return;
    visited.add(event); add(event.statEvents);
    ['settlementEvents', 'encounterEvents', 'acceptanceEvents', 'visualEvents'].forEach(key => visit(event[key]));
  });
  add(state._statEvents); visit(state._visualEvents);
  return { ...createCardEffectEvent({ effectKey: 'authorityCardReceipt', payload: { receipt } }),
    presentationAfterStatIds: [...ids] };
}

export function appendCardReceiptEvent(state, receipt) {
  return { ...state, _visualEvents: [...(state._visualEvents || []), createCardReceiptEvent(receipt, state)] };
}
