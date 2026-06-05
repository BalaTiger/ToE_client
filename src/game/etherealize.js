export function shouldAiUseEtherealize({ player, lostHp = 0, lostSan = 0 } = {}) {
  if (!player || player.isDead || !((player.etherealizeStacks || 0) > 0)) return false;
  if (!(lostHp > 0) && !(lostSan > 0)) return false;
  const hpAfter = (player.hp ?? 0) - (lostHp || 0);
  const sanAfter = (player.san ?? 0) - (lostSan || 0);
  if (hpAfter <= 0 || sanAfter <= 0) return true;
  if ((lostHp || 0) + (lostSan || 0) >= 2) return true;
  if ((player.hp ?? 0) <= 4 || (player.san ?? 0) <= 4) return true;
  return true;
}

export function chooseAiEtherealizeRedirectTarget(players = [], candidateIndices = []) {
  const candidates = candidateIndices
    .filter(i => players?.[i] && !players[i].isDead)
    .map(i => ({ idx: i, player: players[i] }));
  if (!candidates.length) return null;
  candidates.sort((a, b) => (
    ((b.player.hp || 0) + (b.player.san || 0)) -
    ((a.player.hp || 0) + (a.player.san || 0))
  ) || ((b.player.hp || 0) - (a.player.hp || 0)) || (a.idx - b.idx));
  return candidates[0].idx;
}
