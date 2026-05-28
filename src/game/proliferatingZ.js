import { cardLogText, isBlackGoatYoung, isTsathogguaSlime } from './coreUtils';

export function isProliferatingZGain(card) {
  return !!(card?.isGod || isBlackGoatYoung(card) || isTsathogguaSlime(card));
}

export function makeProliferatingZState(ownerIdx, turn) {
  return {
    active: true,
    ownerIdx,
    turn: turn || 0,
  };
}

export function clearExpiredProliferatingZ(gs, endingTurn) {
  const state = gs?.proliferatingZ;
  if (!state?.active) return null;
  return state.ownerIdx === endingTurn ? null : state;
}

export function buildProliferatingZQueueEntries(players, gainOwnerIdx, gainedCards) {
  const cards = Array.isArray(gainedCards) ? gainedCards : (gainedCards ? [gainedCards] : []);
  const triggerCards = cards.filter(isProliferatingZGain);
  if (!triggerCards.length) return [];
  return (players || [])
    .map((player, drawerIdx) => ({ player, drawerIdx }))
    .filter(({ player, drawerIdx }) => player && !player.isDead && drawerIdx !== gainOwnerIdx)
    .map(({ drawerIdx }) => ({
      drawerIdx,
      gainOwnerIdx,
      gainedCardNames: triggerCards.map(card => cardLogText(card, { alwaysShowName: true })),
    }));
}

export function appendProliferatingZDraws(gs, players, gainOwnerIdx, gainedCards) {
  const state = gs?.proliferatingZ;
  if (!state?.active) return {};
  const entries = buildProliferatingZQueueEntries(players || gs?.players || [], gainOwnerIdx, gainedCards);
  if (!entries.length) return {};
  return {
    proliferatingZQueue: [...(gs?.proliferatingZQueue || []), ...entries],
  };
}
