import { copyPlayers } from '../game/coreUtils.js';
import { buildTargetContinuationState } from '../game/targetContinuation.js';
const pending = (state, seat) => (state.abilityData.targets || []).includes(seat)
  && !state.abilityData.buryAliveChoices?.[seat];
export function settleAuthorityBury(state, choices = state.abilityData.buryAliveChoices || []) {
  const ad = state.abilityData, targets = ad.targets.filter(seat => !state.players[seat].isDead && state.players[seat].hand.length);
  if (targets.some(target => !choices[target])) return { ...state, abilityData: { ...ad, targets, buryAliveChoices: choices } };
  const players = copyPlayers(state.players), deck = [...state.deck];
  for (const target of targets) {
    const index = players[target].hand.findIndex(card => card.id === choices[target].cardId);
    if (index < 0) throw new Error('Locked bury card no longer belongs to its seat');
    const [card] = players[target].hand.splice(index, 1); deck.push(card);
  }
  return { ...buildTargetContinuationState({ baseState: state, players, deck }),
    _pendingPublicEvents: [...(state._pendingPublicEvents || []), ...targets.map(target => ({
      type: 'cardCountChanged', seat: target, count: players[target].hand.length,
    }))] };
}
export const buryActions = {
  'bury.commit': { phases: ['BURY_ALIVE_SELECT'], payloadKeys: ['cardIndex'], concurrent: true,
    windowKey: state => state.phase === 'BURY_ALIVE_SELECT'
      ? JSON.stringify([state._turnKey, state.abilityData.targets, state.abilityData.pendingZoneIncome?.card?.id]) : null,
    authorize: pending, available: pending,
    describe: (state, seat) => ({ cardIndices: state.players[seat].hand.map((_card, index) => index) }),
    validate: (state, seat, payload) => Number.isInteger(payload.cardIndex) && payload.cardIndex >= 0
      && payload.cardIndex < state.players[seat].hand.length,
    apply: (state, seat, payload) => {
      const ad = state.abilityData, choices = [...(ad.buryAliveChoices || Array(state.players.length).fill(null))];
      choices[seat] = { cardId: state.players[seat].hand[payload.cardIndex].id, index: payload.cardIndex };
      // Moving an unrevealed hand card to the deck is not a public reveal.
      // Only counts are public; canonical card ids/order stay on the host.
      return settleAuthorityBury(state, choices);
    } },
};
