import { cardLogText } from './coreUtils';

export function shouldBlindZoneDecision(players, playerIdx, card) {
  return !!(players?.[playerIdx]?.blindNextZoneDecision && card?.isZone && !card?.forced);
}

export function markBlindZoneCard(card, blindZoneIdentity) {
  return blindZoneIdentity ? { ...card, blindZoneIdentity: true } : card;
}

export function revealBlindDrawCard(card) {
  if (!card?.blindZoneIdentity) return card;
  const { blindZoneIdentity: _blindZoneIdentity, ...rest } = card;
  return rest;
}

export function clearBlindZoneDecisionFlag(players, drawerIdx, drawReveal) {
  if (drawReveal?.blindZoneIdentity || drawReveal?.card?.blindZoneIdentity) {
    if (players?.[drawerIdx]) players[drawerIdx].blindNextZoneDecision = false;
  }
}

export function drawCardDecisionText(card) {
  return card?.blindZoneIdentity
    ? cardLogText(card)
    : cardLogText(card, { alwaysShowName: true });
}
