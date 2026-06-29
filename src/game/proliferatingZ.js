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

export function buildProliferatingZOwnerDrawEntry(gs, players, gainOwnerIdx, gainedCards, { publicGain = true } = {}) {
  const state = gs?.proliferatingZ;
  if (!state?.active || !publicGain) return null;
  if (state.ownerIdx == null || state.ownerIdx === gainOwnerIdx) return null;
  if (gs?.currentTurn != null && gs.currentTurn !== state.ownerIdx) return null;
  if (gs?.turn != null && state.turn != null && gs.turn !== state.turn) return null;
  if (!players?.[state.ownerIdx] || players[state.ownerIdx].isDead) return null;
  const cards = Array.isArray(gainedCards) ? gainedCards : (gainedCards ? [gainedCards] : []);
  const triggerCards = cards.filter(isProliferatingZGain);
  if (!triggerCards.length) return null;
  return {
    drawerIdx: state.ownerIdx,
    gainOwnerIdx,
    gainedCardNames: triggerCards.map(card => cardLogText(card, { alwaysShowName: true })),
  };
}

export function appendProliferatingZOwnerDraw(gs, players, gainOwnerIdx, gainedCards, opts) {
  const entry = buildProliferatingZOwnerDrawEntry(gs, players || gs?.players || [], gainOwnerIdx, gainedCards, opts);
  if (!entry) return {};
  return {
    proliferatingZQueue: [...(gs?.proliferatingZQueue || []), entry],
  };
}
