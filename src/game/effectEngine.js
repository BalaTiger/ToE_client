import { clamp, killPlayerState, getPrevLivingIndex, getNextLivingIndex } from './coreUtils';

export function applyHpDamageWithLink(P, i, amount, Disc, L) {
  if (i == null || !P[i] || P[i].isDead || !(amount > 0)) return;
  P[i].hp = clamp(P[i].hp - amount);
  if (P[i].damageLink?.active) {
    const partnerIdx = P[i].damageLink.partner;
    if (partnerIdx != null && P[partnerIdx] && !P[partnerIdx].isDead) {
      P[i].damageLink.active = false;
      if (P[partnerIdx].damageLink) P[partnerIdx].damageLink.active = false;
      const linkDamage = 3;
      P[i].hp = clamp(P[i].hp - linkDamage);
      P[partnerIdx].hp = clamp(P[partnerIdx].hp - linkDamage);
      L.push(`【两人一绳】绳索断裂！${P[i].name} 和 ${P[partnerIdx].name} 各失去 ${linkDamage} HP`);
      if (P[i].hp <= 0) killPlayerState(P, i, Disc, L);
      if (P[partnerIdx].hp <= 0) killPlayerState(P, partnerIdx, Disc, L);
    }
  }
  if (P[i].hp <= 0) killPlayerState(P, i, Disc, L);
}

export function getAdjacentTargets(players, ci) {
  const prev = getPrevLivingIndex(players, ci);
  const next = getNextLivingIndex(players, ci);
  return [ci, ...[prev, next].filter((idx, pos, arr) => idx != null && arr.indexOf(idx) === pos)];
}

export function getLivingAdjacentTargets(players, ci) {
  return getAdjacentTargets(players, ci).filter(
    (idx, pos, arr) => idx !== ci && idx != null && players[idx] && !players[idx].isDead && arr.indexOf(idx) === pos
  );
}
