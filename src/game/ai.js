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
  ROLE_HUNTER,
  ROLE_CULTIST,
} from './coreUtils';

function countUniqueZoneAxes(hand = []) {
  const letters = new Set(hand.filter(c => c?.letter && !c.isGod).map(c => c.letter));
  const numbers = new Set(hand.filter(c => c?.number != null && !c.isGod).map(c => c.number));
  return letters.size + numbers.size;
}

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

export function chooseFirstComePickForAI(cards, ci, players) {
  if (!cards?.length) return 0;
  const scored = cards.map((card, index) => ({
    index,
    score: estimateZoneCardKeepScore(card, ci, players) + (isZoneCard(card) ? 0.5 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].index;
}

export function chooseAiRoseThornTarget(players, sourceIdx, validTargetIndices) {
  if (!Array.isArray(validTargetIndices) || !validTargetIndices.length) return null;
  const sourcePlayer = players?.[sourceIdx];
  if (!sourcePlayer || sourcePlayer.isDead) return null;

  const validTargets = validTargetIndices
    .filter(i => i != null && i !== sourceIdx && players[i] && !players[i].isDead)
    .map(i => ({ idx: i, player: players[i] }));
  if (!validTargets.length) return null;

  const byLowestHpThenMoreCards = (a, b) =>
    (a.player.hp - b.player.hp) ||
    (b.player.hand.length - a.player.hand.length) ||
    (a.idx - b.idx);

  if (sourcePlayer.role === ROLE_CULTIST) {
    const revealedHunters = validTargets.filter(t => t.player.role === ROLE_HUNTER && t.player.roleRevealed);
    const hunterPool = revealedHunters.length
      ? revealedHunters
      : validTargets.filter(t => t.player.role === ROLE_HUNTER);
    if (hunterPool.length) {
      return [...hunterPool].sort(byLowestHpThenMoreCards)[0].idx;
    }
  }

  if (sourcePlayer.role === ROLE_HUNTER) {
    const selectableTargets = validTargets.filter(t => !(t.player.role === ROLE_HUNTER && t.player.roleRevealed));
    if (!selectableTargets.length) return null;

    const revealedCultists = selectableTargets.filter(t => t.player.role === ROLE_CULTIST && t.player.roleRevealed);
    if (revealedCultists.length) {
      return [...revealedCultists].sort(byLowestHpThenMoreCards)[0].idx;
    }

    const revealedNonTreasure = selectableTargets.filter(t => t.player.roleRevealed && t.player.role !== ROLE_TREASURE);
    const safePool = revealedNonTreasure.length
      ? revealedNonTreasure
      : selectableTargets.filter(t => t.player.role !== ROLE_TREASURE);
    const fallbackPool = safePool.length ? safePool : selectableTargets;
    return [...fallbackPool].sort((a, b) =>
      (b.player.hand.length - a.player.hand.length) ||
      (a.player.hp - b.player.hp) ||
      (a.idx - b.idx)
    )[0].idx;
  }

  return [...validTargets].sort((a, b) =>
    (b.player.hand.length - a.player.hand.length) ||
    (a.player.hp - b.player.hp) ||
    (a.idx - b.idx)
  )[0].idx;
}

export function aiShouldKeepZoneCard(card, ci, players, forced = false) {
  if (!card || !isZoneCard(card)) return forced;
  if (card.isGod) return true;
  
  if (card.type === 'roseThornGiftAllHand') {
    const self = players[ci];
    const role = self?._nyaBorrow || self?.role;
    const hand = self?.hand || [];
    const validTargets = players.filter((p, i) => i !== ci && !p?.isDead);
    if (role === ROLE_TREASURE) return false;
    if (!validTargets.length) return false;
    if (role === ROLE_CULTIST) {
      const revealedHunters = validTargets.filter(p => p.role === ROLE_HUNTER && p.roleRevealed);
      const maxPotentialDamage = Math.max(2, hand.length * 2);
      return revealedHunters.some(hunter => hunter.hp <= maxPotentialDamage);
    }
    if (role === ROLE_HUNTER) {
      const selectableTargets = validTargets.filter(p => !(p.role === ROLE_HUNTER && p.roleRevealed));
      if (!selectableTargets.length) return false;
      const godCardCount = hand.filter(c => c.isGod).length;
      const abandonedHunts = self?._abandonedHunts || 0;
      const revealedCultists = validTargets.filter(p => p.role === ROLE_CULTIST && p.roleRevealed);
      const uniqueAxes = countUniqueZoneAxes(hand);
      let score = 0;
      if (godCardCount >= 2) score += 5.5;
      else if (godCardCount === 1) score += 2.0;
      if (abandonedHunts >= 2) score += 4.5;
      else if (abandonedHunts === 1) score += 2.2;
      if (revealedCultists.length > 0) score += 4.0;
      else score -= uniqueAxes * 0.55;
      if (hand.length >= 5) score += 1.2;
      return score >= 2.5;
    }
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
