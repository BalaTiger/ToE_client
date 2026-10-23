import { createCardEffectEvent } from '../game/visualEvents.js';
import { committedPublicEvent } from './incomeEvents.js';

// Called only after the canonical deck move succeeds. Faces remain host-only
// until the per-viewer projection authorizes the owner or emits a card back.
export function appendDeckMoveEvent(state, event) {
  const receipt = committedPublicEvent(state, event);
  const visual = createCardEffectEvent({ effectKey: event.type, actorIdx: event.seat,
    id: receipt.presentationEventId, payload: event });
  return { ...state, _visualEvents: [...(state._visualEvents || []), { ...visual,
    presentationAfterStatIds: receipt.presentationAfterStatIds,
    presentationAfterEventIds: receipt.presentationAfterEventIds,
    presentationStatBoundarySeq: state._statEventSeq || 0,
  }] };
}
