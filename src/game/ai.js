import {
  isZoneCard,
  isBlankZoneCard,
  isPositiveZoneCard,
  isNegativeZoneCard,
  isWinHand,
  estimateZoneCardKeepScore,
  copyPlayers,
  getPrevLivingIndex,
  getNextLivingIndex,
  ROLE_TREASURE,
} from './coreUtils';

export function aiChooseRevealCard(targetHand, hunterName, log = [], knownHunterCards = []) {
  const zoneCards = targetHand.filter(isZoneCard);
  if (!zoneCards.length) return targetHand[0];
  
  const scored = zoneCards.map((card, index) => {
    let score = 0;
    if (card.type === 'revealTopCards') score += 5;
    if (card.type === 'firstComePick') score += 4;
    if (card.type === 'swapAllHands') score = 10;
    if (card.type === 'caveDuel') score += 3;
    const isNegative = isNegativeZoneCard(card);
    if (isNegative) score -= 100;
    return { index: targetHand.indexOf(card), score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.index != null ? targetHand[scored[0].index] : targetHand[0];
}

export function aiChooseHunterLootCards(targetHand, hunterHand, maxToTake = 3) {
  if (!targetHand?.length) return [];
  const targetZoneCards = targetHand.filter(isZoneCard);
  if (!targetZoneCards.length) return [];
  
  const hunterLetters = new Set((hunterHand || []).map(c => c.letter));
  const hunterNumbers = new Set((hunterHand || []).map(c => c.number));
  
  const scored = targetZoneCards.map(card => {
    let score = 0;
    if (isNegativeZoneCard(card)) score += 5;
    if (card.letter && hunterLetters.has(card.letter)) score -= 3;
    if (card.number && hunterNumbers.has(card.number)) score -= 3;
    return { card, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxToTake).map(s => s.card);
}

export function aiShouldKeepZoneCard(card, ci, players, forced = false) {
  if (!card || !isZoneCard(card)) return forced;
  if (card.isGod) return true;
  
  // 玫瑰倒刺：寻宝者AI永远丢弃，邪祀者AI让评分逻辑决定
  if (card.type === 'roseThornGiftAllHand') {
    const role = players[ci]?.role;
    if (role === ROLE_TREASURE) return false; // 寻宝者不能触发玫瑰倒刺
    // 邪祀者让收入评分逻辑决定
    return false;
  }
  
  const myHand = players[ci]?.hand || [];
  const myLetter = new Set(myHand.filter(c => c.letter && !c.isGod).map(c => c.letter));
  const myNumber = new Set(myHand.filter(c => c.number).map(c => c.number));
  
  if (isPositiveZoneCard(card)) {
    if (myLetter.size === 0 || myNumber.size === 0) return true;
    if (card.letter && myLetter.has(card.letter)) return true;
    if (card.number && myNumber.has(card.number)) return true;
  }
  
  if (isNegativeZoneCard(card)) {
    const otherPlayers = players.filter((p, i) => i !== ci && !p.isDead);
    const othersWithSameLetter = otherPlayers.filter(p => p.hand.some(c => c.letter === card.letter)).length;
    const othersWithSameNumber = otherPlayers.filter(p => p.hand.some(c => c.number === card.number)).length;
    
    if (othersWithSameLetter > 0 && othersWithSameNumber > 0) return false;
    if (card.type === 'blankZone') return true;
    if (forced) return false;
  }
  
  if (card.type === 'swapAllHands') return true;
  if (card.type === 'revealTopCards') return true;
  if (card.type === 'firstComePick') return true;
  
  return estimateZoneCardKeepScore(card, ci, players) > 0;
}