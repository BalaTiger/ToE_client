import { cardIdentity } from './cardIdentity.js';
import { copyPlayers } from './coreUtils.js';
import { createGodGiftDiscardEvent } from './visualEvents.js';

// A revealed god has not entered a player's god zone yet. Death or terminal
// SAN loss cancels its response but still needs a physical destination.
export function discardDeadDrawerGod({ players, discard, godCard, drawerIdx, visualEvents = [] }) {
  const drawer = players?.[drawerIdx];
  if (!godCard || !drawer || !drawer.isDead && !(drawer.san <= 0)) return { discard, visualEvents };
  const id = cardIdentity(godCard);
  if (discard.some(card => cardIdentity(card) === id)) return { discard, visualEvents };
  const nextDiscard = [...discard, godCard];
  const event = createGodGiftDiscardEvent({ card: godCard, drawerIdx,
    drawerName: players[drawerIdx].name, beforePlayers: copyPlayers(players),
    beforeDiscard: [...discard], afterDiscard: nextDiscard });
  return { discard: nextDiscard, visualEvents: [...visualEvents, event].filter(Boolean) };
}
