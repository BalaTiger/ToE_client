import { SOFT_GUIDE_STORAGE_KEY, parseSoftGuideDone, serializeSoftGuideDone } from '../../game/softGuides.js';

/** Only owns a pause acquired from a running local session. Never resumes a user's prior pause. */
export function createSoftGuideController(session, storage) {
  let done = {}, active = null, pendingFlip = false, previous = null, ownsPause = false;
  const listeners = new Set();
  try { done = parseSoftGuideDone(storage?.getItem(SOFT_GUIDE_STORAGE_KEY)); } catch { /* Optional preference. */ }
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => active,
    update(view, { offline, busy }) {
      if (!offline || view.tutorial || view.gameOver || !session.setPaused) return active;
      const players = view.players;
      if (previous && players.some((player, index) => player.isResting && !previous[index]?.isResting)) pendingFlip = true;
      previous = players;
      if (active || busy || view.status?.paused) return active;
      const me = players.find(player => player.seat === view.viewerSeat) || players[view.viewerSeat];
      const id = !done.flip && pendingFlip ? 'flip' : !done.rest && me?.hp < 10 && view.decision.actions.some(action => action.type === 'turn.rest') ? 'rest' : null;
      if (!id) return null;
      active = id; done[id] = true; ownsPause = true; session.setPaused(true);
      try { storage?.setItem(SOFT_GUIDE_STORAGE_KEY, serializeSoftGuideDone(done)); } catch { /* Current session remembers. */ }
      listeners.forEach(listener => listener());
      return active;
    },
    close() { const wasActive = active; active = null; if (ownsPause) { ownsPause = false; session.setPaused(false); } if (wasActive) listeners.forEach(listener => listener()); },
    dispose() { this.close(); },
  };
}
