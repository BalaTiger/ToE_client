export function queueSanInspections(before, next) {
  const targets = next.players.flatMap((player, seat) => !player.isDead && player.san > 0 && player.san <= 6
    && player.san < before.players[seat].san ? [seat] : []);
  if (!targets.length) return next;
  const pending = next.abilityData?.pendingInspectionContinuation;
  return { ...next, abilityData: { ...next.abilityData, pendingInspectionContinuation: {
    targets: [...new Set([...(pending?.targets || []), ...targets])], startIndex: before.currentTurn,
  } } };
}
