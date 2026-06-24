import { appendProliferatingZOwnerDraw } from './proliferatingZ';

export const CARD_GAIN_VISIBILITY = {
  PUBLIC: 'public',
  PARTICIPANTS: 'participants',
  PRIVATE: 'private',
};

export function isPublicCardIdentityGain({ visibility = CARD_GAIN_VISIBILITY.PUBLIC, cardIdentityVisibleToAll = true } = {}) {
  return visibility === CARD_GAIN_VISIBILITY.PUBLIC && cardIdentityVisibleToAll !== false;
}

export function appendCardGainTriggers(gs, players, gainOwnerIdx, gainedCards, opts = {}) {
  const publicGain = isPublicCardIdentityGain(opts);
  return {
    ...appendProliferatingZOwnerDraw(gs, players, gainOwnerIdx, gainedCards, { publicGain }),
  };
}

export function appendPublicCardGainTriggers(gs, players, gainOwnerIdx, gainedCards) {
  return appendCardGainTriggers(gs, players, gainOwnerIdx, gainedCards, {
    visibility: CARD_GAIN_VISIBILITY.PUBLIC,
    cardIdentityVisibleToAll: true,
  });
}
