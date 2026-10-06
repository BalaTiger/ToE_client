import { cardIdentity } from './cardIdentity';
import { copyPlayers } from './coreUtils';
import { createGodGiftDiscardEvent } from './visualEvents';

// A revealed god has not entered a player's god zone yet. Death cancels its
// response, but must still give that physical card a final destination.
export function discardDeadDrawerGod({ players, discard, godCard, drawerIdx, visualEvents = [] }) {
  if (!godCard || !players?.[drawerIdx]?.isDead) return { discard, visualEvents };
  const id = cardIdentity(godCard);
  if (discard.some(card => cardIdentity(card) === id)) return { discard, visualEvents };
  const nextDiscard = [...discard, godCard];
  const event = createGodGiftDiscardEvent({ card: godCard, drawerIdx,
    drawerName: players[drawerIdx].name, beforePlayers: copyPlayers(players),
    beforeDiscard: [...discard], afterDiscard: nextDiscard });
  return { discard: nextDiscard, visualEvents: [...visualEvents, event].filter(Boolean) };
}
