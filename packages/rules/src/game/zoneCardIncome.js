import { hasEffectDecisionState } from './effectStatePatch.js';

// These helpers mutate the caller's copied rule state, like the hand.push they
// replace. Player ids stay stable when multiplayer seats rotate.
export function settlePendingZoneIncome(players, discard, pendingZoneIncome) {
  if (!pendingZoneIncome?.card) return null;
  const drawerIdx = players.findIndex(player => player.id === pendingZoneIncome.ownerId);
  if (drawerIdx < 0) return null;
  const { card } = pendingZoneIncome;
  const dest = players[drawerIdx].isDead ? 'discard' : 'player';
  (dest === 'discard' ? discard : players[drawerIdx].hand).push(card);
  return { card, drawerIdx, dest };
}

export function applyZoneCardIncome({
  players, discard, card, drawerIdx, statePatch = {}, fromEndTurnReplay = false,
  onIncomeCommitted, presentationSource,
}) {
  if (fromEndTurnReplay) return statePatch;
  const pendingZoneIncome = { card, ownerId: players[drawerIdx].id,
    ...(presentationSource ? { presentationSource } : {}) };
  if (hasEffectDecisionState(statePatch)) {
    return {
      ...statePatch,
      abilityData: { ...statePatch?.abilityData, pendingZoneIncome },
    };
  }
  const income = settlePendingZoneIncome(players, discard, pendingZoneIncome);
  // Optional authority metadata observes the actual mutation, never predicts it.
  if (income) onIncomeCommitted?.(income);
  return statePatch;
}
