export function claimReadyCaveDuel(state, playerUUID, claimedIds, connected) {
  const ad = state?.abilityData;
  if (!connected || !state?._isMP || state.gameOver
    || !['CAVE_DUEL_SELECT_CARD', 'CAVE_DUEL_WAIT_REVEAL'].includes(state.phase)
    || !ad?.caveDuelId || !ad.caveDuelReady || !ad.sourceCard || !ad.targetCard
    || ad.caveDuelResolverUuid !== playerUUID || claimedIds.has(ad.caveDuelId)) return false;
  claimedIds.add(ad.caveDuelId);
  return true;
}
