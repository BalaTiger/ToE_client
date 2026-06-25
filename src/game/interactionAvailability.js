import { canRevealForHunt } from './coreUtils.js';
import { cardsHuntMatch } from './aiTurn.js';

export function canUseTutorialHandCard({
  canLocalSwapGive = false,
  canLocalBewitchCard = false,
  isLocalHuntConfirm = false,
  isTutorialActionAllowed = () => false,
  card,
} = {}) {
  const canUseHandCard = canLocalSwapGive || canLocalBewitchCard || isLocalHuntConfirm;
  return !!(canUseHandCard && isTutorialActionAllowed({ type: 'handCard', cardId: card?.id }));
}

export function canRespondWithZoneCard({ phase, card, isLocalHuntWaitRevealTarget = false } = {}) {
  const canReveal = canRevealForHunt(card);
  if (phase === 'PLAYER_REVEAL_FOR_HUNT') return canReveal;
  if (phase === 'HUNT_WAIT_REVEAL' && isLocalHuntWaitRevealTarget) return canReveal;
  return false;
}

export function canRespondWithAnyHandCard({
  phase,
  isLocalCaveDuelTarget = false,
  isBuryAliveTarget = false,
  isIgniteTorchPlayer = false,
} = {}) {
  if (phase === 'CAVE_DUEL_SELECT_CARD' && isLocalCaveDuelTarget) return true;
  if (phase === 'BURY_ALIVE_SELECT') return !!isBuryAliveTarget;
  if (phase === 'IGNITE_TORCH_DISCARD') return !!isIgniteTorchPlayer;
  return false;
}

export function canRespondWithFireHandCard({
  phase,
  isAlbinoCreaturePlayer = false,
} = {}) {
  return !!(phase === 'ALBINO_CREATURE_SELECT_CARD' && isAlbinoCreaturePlayer);
}

export function canClickDiscardCard({
  selectedDiscardIndices = [],
  handSize = 0,
  effectiveHandLimit = 0,
  cardIndex,
} = {}) {
  const max = Math.max(0, handSize - effectiveHandLimit);
  return selectedDiscardIndices.includes(cardIndex) || selectedDiscardIndices.length < max;
}

export function canClickHandCard({
  phase,
  card,
  cardIndex,
  isBlocked = false,
  showTutorial = false,
  tutorialStepActive = false,
  tutorialHandCardAllowed = false,
  canLocalSwapGive = false,
  canLocalBewitchCard = false,
  localCurrentTurn = false,
  selectedDiscardIndices = [],
  handSize = 0,
  effectiveHandLimit = 0,
  isLocalHuntConfirm = false,
  revealedHuntCard = null,
  canRespondZoneCard = false,
  isLocalPublicCardPick = false,
  publicHandSize = 0,
  caveDuelSourceTurn = false,
  canRespondAnyHandCard = false,
  canRespondFireHandCard = false,
  fireCardIds = [],
  isVisualPlayerTurn = false,
} = {}) {
  if (isBlocked) return false;
  if (showTutorial && tutorialStepActive) return !!tutorialHandCardAllowed;
  if (canLocalSwapGive || canLocalBewitchCard) return true;
  if (phase === 'DISCARD_PHASE' && localCurrentTurn) {
    return canClickDiscardCard({
      selectedDiscardIndices,
      handSize,
      effectiveHandLimit,
      cardIndex,
    });
  }
  if (isLocalHuntConfirm) return !!(revealedHuntCard && cardsHuntMatch(card, revealedHuntCard));
  if (canRespondZoneCard) return true;
  if (isLocalPublicCardPick) return cardIndex < publicHandSize;
  if (caveDuelSourceTurn || canRespondAnyHandCard) return true;
  if (phase === 'ALBINO_CREATURE_SELECT_CARD' && canRespondFireHandCard) {
    return fireCardIds.includes(card?.id);
  }
  return !!(phase === 'ACTION' && isVisualPlayerTurn && card?.isGod);
}
