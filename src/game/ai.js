import {
  isZoneCard,
  isBlankZoneCard,
  isPositiveZoneCard,
  isNegativeZoneCard,
  isWinHand,
  estimateZoneCardKeepScore,
  getPrevLivingIndex,
  getNextLivingIndex,
  getZoneCardPolarity,
  getZoneCardEffectScope,
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from './coreUtils';

function getAdjacentTargets(players, ci) {
  const prev = getPrevLivingIndex(players, ci);
  const next = getNextLivingIndex(players, ci);
  return [ci, ...[prev, next].filter((idx, pos, arr) => idx != null && arr.indexOf(idx) === pos)];
}

function getLivingAdjacentTargets(players, ci) {
  return getAdjacentTargets(players, ci).filter(
    (idx, pos, arr) => idx !== ci && idx != null && players[idx] && !players[idx].isDead && arr.indexOf(idx) === pos
  );
}

function countUniqueZoneAxes(hand = []) {
  const letters = new Set(hand.filter(c => c?.letter && !c.isGod).map(c => c.letter));
  const numbers = new Set(hand.filter(c => c?.number != null && !c.isGod).map(c => c.number));
  return letters.size + numbers.size;
}

function zoneCardHasGuaranteedHpLoss(card) {
  if (!card?.type) return false;
  return [
    'selfDamageHP', 'selfDamageDiscardHP', 'selfDamageHPSAN', 'selfDamageRestHP', 'selfDamageHPPeek',
    'allDamageHP', 'allDamageBoth', 'adjDamageHP', 'adjDamageBoth',
    'selfDamageAdjDamageHP', 'selfDamageAdjDamageBoth', 'allDamageHPRandomExtra'
  ].includes(card.type);
}

function zoneCardHasGuaranteedSanLoss(card) {
  if (!card?.type) return false;
  return [
    'selfDamageSAN', 'selfDamageDiscardSAN', 'selfDamageHPSAN', 'selfDamageRestSAN',
    'allDamageSAN', 'allDamageBoth', 'adjDamageSAN', 'adjDamageBoth', 'selfDamageAdjDamageBoth'
  ].includes(card.type);
}

function zoneCardIsSacrificeStyle(card) {
  return !!card?.type && (card.type.startsWith('sac') || card.type === 'selfBerserk');
}

function zoneCardAppliesWidePressure(card) {
  const scope = getZoneCardEffectScope(card);
  return scope === 'all' || scope === 'adjacent';
}

function zoneCardProvidesGuaranteedCardGain(card) {
  return !!card?.type && ['placeBlankZone', 'revealTopCards', 'firstComePick', 'drawCard'].includes(card.type);
}

function zoneCardUsesTargetInteraction(card) {
  return !!card?.type && ['swapAllHands', 'caveDuel', 'damageLink', 'roseThornGiftAllHand', 'globalOnlySwap'].includes(card.type);
}

function estimateHunterZoneCardScore(card, self, players, ci) {
  let score = 0;
  switch (card.type) {
    case 'selfHealHP': score = (10 - self.hp) * 1.5; break;
    case 'selfHealSAN': score = (10 - self.san) * 1.4; break;
    case 'selfHealBoth': score = (10 - self.hp) + (10 - self.san); break;
    case 'selfHealBoth21': score = (10 - self.hp) * 1.5 + (10 - self.san) * 0.8; break;
    case 'sacHealSelfSAN': score = (10 - self.san) * 1.8 - 1.2; break;
    case 'selfRevealHandHP': score = (10 - self.hp) * 2.2 + 1.5; break;
    case 'selfRevealHandSAN': score = (10 - self.san) * 2.2 + 1.5; break;
    case 'adjHealHP':
      score = getLivingAdjacentTargets(players, ci).reduce((sum, idx) => sum + (10 - players[idx].hp) * 0.6, 0);
      break;
    case 'globalOnlySwap':
      score = 0.8;
      break;
    case 'selfBerserk':
      score = 7.2;
      break;
    case 'swapAllHands': {
      const bestOther = players.reduce((best, p, i) => {
        if (i === ci || p.isDead) return best;
        return p.hand.length > best.count ? { idx: i, count: p.hand.length } : best;
      }, { idx: -1, count: -1 });
      const cardDiff = (bestOther.count - self.hand.length);
      score = cardDiff > 0 ? cardDiff * 3 + 2.5 : (self.hand.length > (self._nyaHandLimit ?? 4) ? -2 : -0.8);
      break;
    }
    case 'caveDuel':
      score = self.hand.length > 0 ? 1.2 : -0.8;
      break;
    case 'selfDamageHPPeek':
      score = -card.val * 1.8 + 0.5;
      break;
    case 'damageLink':
      score = 4.2;
      break;
    case 'firstComePick':
      score = 1.2;
      break;
    case 'roseThornGiftAllHand': {
      const hunters = players.filter((p, i) => i !== ci && !p.isDead && p.role === ROLE_HUNTER);
      if (hunters.length > 0) {
        const hasVulnerableHunter = hunters.some(hunter => hunter.hp <= 2);
        if (hasVulnerableHunter) {
          score = 5.0;
        }
      }
      if (score === 0) score = -100;
      break;
    }
    case 'allDamageHPRandomExtra': {
      const aliveOthers = players.filter((p, i) => i !== ci && !p.isDead).length;
      score = aliveOthers * 2.6;
      if (self.hp <= ((card.val || 0) * 2)) score -= 12;
      else if (self.hp <= ((card.val || 0) + 1)) score -= 5;
      break;
    }
    case 'selfDamageHP':
    case 'selfDamageSAN':
      score = -card.val * 2.1;
      break;
    case 'selfDamageDiscardHP':
    case 'selfDamageDiscardSAN':
      score = -card.val * 2.2 - Math.min(self.hand.length, 1) * 1.2;
      break;
    case 'selfDamageHPSAN':
      score = -(card.hpVal || 0) * 1.8 - (card.sanVal || 0) * 2.1;
      break;
    case 'selfDamageRestHP':
    case 'selfDamageRestSAN':
      score = -3.1;
      break;
    case 'selfRenounceGod':
      score = -(self.godName ? 2.8 : 1.4);
      break;
    default: {
      const polarity = getZoneCardPolarity(card);
      if (zoneCardAppliesWidePressure(card) && (polarity === 'negative' || card.type === 'allDiscard')) {
        const isWideHpDamage = zoneCardHasGuaranteedHpLoss(card);
        const isWideSanDamage = zoneCardHasGuaranteedSanLoss(card) && !isWideHpDamage;
        if (isWideHpDamage) score = 6.5;
        else if (isWideSanDamage) score = 1.8;
        else score = 1.2;
      } else if (zoneCardIsSacrificeStyle(card)) {
        score = 1.6;
      } else if (polarity === 'positive' && zoneCardProvidesGuaranteedCardGain(card)) {
        score = 1.2;
      } else if (polarity === 'neutral' && zoneCardUsesTargetInteraction(card)) {
        score = 1.3;
      } else if (polarity === 'neutral') {
        score = 0.2;
      }
      break;
    }
  }
  if (self.hp <= 2 && zoneCardHasGuaranteedHpLoss(card)) score -= 4;
  if (self.san <= 2 && zoneCardHasGuaranteedSanLoss(card)) score -= 4;
  return score;
}

function estimateTreasureZoneCardScore(card, self, players, ci) {
  let score = 0;
  const myNonGod = (self.hand || []).filter(c => !c.isGod);
  const letters = new Set(myNonGod.map(c => c.letter).filter(v => v != null));
  const numbers = new Set(myNonGod.map(c => c.number).filter(v => v != null));
  const progress = letters.size + numbers.size;
  const closeToWin = progress >= 6;
  switch (card.type) {
    case 'selfHealHP': score = (10 - self.hp) * 1.5; break;
    case 'selfHealSAN': score = (10 - self.san) * 1.6; break;
    case 'selfHealBoth': score = (10 - self.hp) + (10 - self.san) * 1.1; break;
    case 'selfHealBoth21': score = (10 - self.hp) * 1.5 + (10 - self.san) * 1.0; break;
    case 'sacHealSelfSAN': score = (10 - self.san) * 1.8 - 1.2; break;
    case 'selfRevealHandHP': score = (10 - self.hp) * 2.2 + 1.2; break;
    case 'selfRevealHandSAN': score = (10 - self.san) * 2.3 + 1.0; break;
    case 'adjHealHP':
      score = getLivingAdjacentTargets(players, ci).reduce((sum, idx) => sum + (10 - players[idx].hp) * 0.3, 0);
      break;
    case 'globalOnlySwap':
      score = 3.5;
      break;
    case 'selfBerserk':
      score = -1.5;
      break;
    case 'swapAllHands': {
      const bestOther = players.reduce((best, p, i) => {
        if (i === ci || p.isDead) return best;
        return p.hand.length > best.count ? { idx: i, count: p.hand.length } : best;
      }, { idx: -1, count: -1 });
      const cardDiff = (bestOther.count - self.hand.length);
      score = cardDiff > 1 ? cardDiff * 1.5 : 0.5;
      break;
    }
    case 'caveDuel':
      score = self.hand.length > 0 ? (closeToWin ? 1.4 : 0.8) : -1.0;
      break;
    case 'selfDamageHPPeek':
      score = -card.val * 1.8 + 0.6;
      break;
    case 'damageLink':
      score = 0.1;
      break;
    case 'firstComePick':
      score = 3.8;
      break;
    case 'roseThornGiftAllHand':
      score = -100;
      break;
    case 'selfDamageHP':
    case 'selfDamageSAN':
      score = -card.val * 2.2;
      break;
    case 'selfDamageDiscardHP':
    case 'selfDamageDiscardSAN':
      score = -card.val * 2.4 - Math.min(self.hand.length, 1) * 1.3;
      break;
    case 'selfDamageHPSAN':
      score = -(card.hpVal || 0) * 1.9 - (card.sanVal || 0) * 2.2;
      break;
    case 'selfDamageRestHP':
    case 'selfDamageRestSAN':
      score = -3.3;
      break;
    case 'selfRenounceGod':
      score = -(self.godName ? 2.8 : 1.0);
      break;
    default: {
      const polarity = getZoneCardPolarity(card);
      if (zoneCardAppliesWidePressure(card) && (polarity === 'negative' || card.type === 'allDiscard')) {
        const isWideHpDamage = zoneCardHasGuaranteedHpLoss(card);
        const isWideSanDamage = zoneCardHasGuaranteedSanLoss(card) && !isWideHpDamage;
        if (isWideHpDamage) score = -3.8;
        else if (isWideSanDamage) score = -2.4;
        else score = -1.8;
      } else if (zoneCardIsSacrificeStyle(card)) {
        score = 0.4;
      } else if (polarity === 'positive' && zoneCardProvidesGuaranteedCardGain(card)) {
        score = closeToWin ? 3.2 : 2.6;
      } else if (polarity === 'neutral' && zoneCardUsesTargetInteraction(card)) {
        score = closeToWin ? 1.2 : 0.4;
      } else if (polarity === 'neutral') {
        score = 0.1;
      }
      break;
    }
  }
  if (self.hp <= 2 && zoneCardHasGuaranteedHpLoss(card)) score -= 4.5;
  if (self.san <= 2 && zoneCardHasGuaranteedSanLoss(card)) score -= 4.5;
  return score;
}

function estimateCultistZoneCardScore(card, self, players, ci) {
  const dmgBonus = self.damageBonus || 0;
  const livingPlayers = players.filter(p => !p.isDead);
  const minSan = Math.min(...livingPlayers.map(p => p.san));
  const SAN_TO_HP_RATIO = 1.8;
  const checkInstantWin = (targets, hpLoss, sanLoss) => {
    for (const idx of targets) {
      const target = players[idx];
      if (target.isDead) continue;
      const newHp = target.hp - (hpLoss || 0) - dmgBonus;
      const newSan = target.san - (sanLoss || 0);
      if (newSan <= 0 && newHp > 0) return true;
    }
    return false;
  };
  const checkHunterKill = (targets, hpLoss) => {
    let bonus = 0;
    for (const idx of targets) {
      const target = players[idx];
      if (target.role === ROLE_HUNTER && !target.isDead) {
        const newHp = target.hp - (hpLoss || 0) - dmgBonus;
        if (newHp <= 0 && target.san >= 4) bonus += 5;
      }
    }
    return bonus;
  };
  const calcHPSanScore = (hpDelta, sanDelta, targetIdx, isSelf) => {
    const target = players[targetIdx];
    if (!target || target.isDead) return 0;
    let hpScore = 0, sanScore = 0;
    if (sanDelta < 0) {
      const sanUrgency = target.san <= -sanDelta ? 3 : 0;
      sanScore = (-sanDelta) * SAN_TO_HP_RATIO * 1.2 + sanUrgency;
    } else if (sanDelta > 0) {
      if (isSelf && self.hp <= 3 && minSan > 3) {
        sanScore = -sanDelta * SAN_TO_HP_RATIO * 0.3;
      } else {
        sanScore = -sanDelta * SAN_TO_HP_RATIO * 1.2;
      }
    }
    if (hpDelta > 0) {
      hpScore = hpDelta * 1.0;
    } else if (hpDelta < 0) {
      const deathRisk = target.hp <= -hpDelta + dmgBonus ? 3 : 0;
      hpScore = hpDelta * 1.2 - deathRisk;
    }
    return isSelf ? (hpScore + sanScore) : ((hpScore + sanScore) * 0.7);
  };
  const getTargetsAndValues = () => {
    switch (card.type) {
      case 'selfHealHP':
        return { targets: [ci], hpDelta: card.val, sanDelta: 0, hpLoss: 0, sanLoss: 0 };
      case 'selfHealSAN':
        return { targets: [ci], hpDelta: 0, sanDelta: card.val, hpLoss: 0, sanLoss: 0 };
      case 'selfHealBoth':
        return { targets: [ci], hpDelta: card.val, sanDelta: card.val, hpLoss: 0, sanLoss: 0 };
      case 'selfHealBoth21':
        return { targets: [ci], hpDelta: 2, sanDelta: 1, hpLoss: 0, sanLoss: 0 };
      case 'selfHealHPSelfDamageSAN':
        return { targets: [ci], hpDelta: card.hpVal, sanDelta: -card.sanVal, hpLoss: 0, sanLoss: card.sanVal };
      case 'selfRevealHandHP':
        return { targets: [ci], hpDelta: 10, sanDelta: 0, hpLoss: 0, sanLoss: 0 };
      case 'selfRevealHandSAN':
        return { targets: [ci], hpDelta: 0, sanDelta: 10, hpLoss: 0, sanLoss: 0 };
      case 'adjHealHP':
        return { targets: getAdjacentTargets(players, ci), hpDelta: card.val, sanDelta: 0, hpLoss: 0, sanLoss: 0 };
      case 'sacHealHP':
        return { targets: [ci, ...livingPlayers.map((_, i) => i)], hpDelta: 1, sanDelta: -1, hpLoss: 0, sanLoss: 1, special: 'sacHealHP' };
      case 'sacHealSelfSAN':
        return { targets: [ci], hpDelta: -3, sanDelta: card.val, hpLoss: 3, sanLoss: 0 };
      case 'selfDamageHP':
      case 'selfDamageDiscardHP':
        return { targets: [ci], hpDelta: 0, sanDelta: 0, hpLoss: card.val, sanLoss: 0 };
      case 'selfDamageSAN':
      case 'selfDamageDiscardSAN':
        return { targets: [ci], hpDelta: 0, sanDelta: 0, hpLoss: 0, sanLoss: card.val };
      case 'selfDamageHPSAN':
        return { targets: [ci], hpDelta: 0, sanDelta: 0, hpLoss: card.hpVal, sanLoss: card.sanVal };
      case 'selfDamageRestHP':
        return { targets: [ci], hpDelta: 0, sanDelta: 0, hpLoss: card.val, sanLoss: 0 };
      case 'selfDamageRestSAN':
        return { targets: [ci], hpDelta: 0, sanDelta: 0, hpLoss: 0, sanLoss: card.val };
      case 'selfDamageHPPeek':
        return { targets: [ci], hpDelta: 0, sanDelta: 0, hpLoss: card.val, sanLoss: 0 };
      case 'adjDamageHP':
        return { targets: getAdjacentTargets(players, ci), hpDelta: 0, sanDelta: 0, hpLoss: card.val, sanLoss: 0 };
      case 'adjDamageSAN':
        return { targets: getAdjacentTargets(players, ci), hpDelta: 0, sanDelta: 0, hpLoss: 0, sanLoss: card.val };
      case 'adjDamageBoth':
        return { targets: getAdjacentTargets(players, ci), hpDelta: 0, sanDelta: 0, hpLoss: card.hpVal, sanLoss: card.sanVal };
      case 'allDamageHP':
        return { targets: livingPlayers.map((_, i) => i), hpDelta: 0, sanDelta: 0, hpLoss: card.val, sanLoss: 0 };
      case 'allDamageSAN':
        return { targets: livingPlayers.map((_, i) => i), hpDelta: 0, sanDelta: 0, hpLoss: 0, sanLoss: card.val };
      case 'allDamageBoth':
        return { targets: livingPlayers.map((_, i) => i), hpDelta: 0, sanDelta: 0, hpLoss: card.val, sanLoss: card.val };
      case 'selfDamageAdjDamageBoth':
        return {
          targets: [ci, ...getAdjacentTargets(players, ci)],
          hpDelta: 0,
          sanDelta: 0,
          hpLoss: card.hpVal,
          sanLoss: card.sanVal,
          special: 'selfDamageAdjDamageBoth',
          adjHpLoss: card.adjHpVal,
          adjSanLoss: card.adjSanVal
        };
      default:
        return null;
    }
  };
  const cardInfo = getTargetsAndValues();
  if (cardInfo) {
    const { targets, hpDelta, sanDelta, hpLoss, sanLoss, special, adjHpLoss, adjSanLoss } = cardInfo;
    if (special === 'selfDamageAdjDamageBoth') {
      if (checkInstantWin([ci], hpLoss, sanLoss)) return 100;
      const adjTargets = targets.filter(idx => idx !== ci);
      if (checkInstantWin(adjTargets, adjHpLoss, adjSanLoss)) return 100;
    } else if (checkInstantWin(targets, hpLoss, sanLoss)) {
      return 100;
    }
    let hunterBonus = 0;
    if (special === 'selfDamageAdjDamageBoth') {
      hunterBonus = checkHunterKill([ci], hpLoss) + checkHunterKill(targets.filter(idx => idx !== ci), adjHpLoss);
    } else {
      hunterBonus = checkHunterKill(targets, hpLoss);
    }
    let totalScore = hunterBonus;
    if (special === 'sacHealHP') {
      totalScore += calcHPSanScore(0, -1, ci, true);
      targets.filter(idx => idx !== ci).forEach(idx => {
        totalScore += calcHPSanScore(1, 0, idx, false);
      });
    } else if (special === 'selfDamageAdjDamageBoth') {
      totalScore += calcHPSanScore(-hpLoss, -sanLoss, ci, true);
      targets.filter(idx => idx !== ci).forEach(idx => {
        totalScore += calcHPSanScore(-adjHpLoss, -adjSanLoss, idx, false);
      });
    } else if (hpLoss || sanLoss) {
      targets.forEach(idx => {
        const isSelf = idx === ci;
        totalScore += calcHPSanScore(-hpLoss, -sanLoss, idx, isSelf);
      });
    } else if (hpDelta || sanDelta) {
      targets.forEach(idx => {
        const isSelf = idx === ci;
        totalScore += calcHPSanScore(hpDelta, sanDelta, idx, isSelf);
      });
    }
    return totalScore;
  }
  switch (card.type) {
    case 'selfRenounceGod':
      return -(self.godName ? 1 : 0.5);
    case 'selfBerserk':
      return 2 + minSan * 0.2;
    case 'damageLink':
      return 0.5;
    case 'firstComePick':
      return 1.8;
    case 'roseThornGiftAllHand': {
      const hunters = players.filter((p, i) => i !== ci && !p.isDead && p.role === ROLE_HUNTER);
      if (hunters.length > 0) {
        const hasVulnerableHunter = hunters.some(hunter => hunter.hp <= 2);
        if (hasVulnerableHunter) {
          return 5.0;
        }
      }
      return -100;
    }
    case 'swapAllHands':
      return 0.3;
    case 'caveDuel':
      return self.hand.length > 0 ? 0.3 : -0.3;
    case 'globalOnlySwap':
      return 0.2;
    case 'allDiscard':
      return -0.3;
    case 'adjRest':
      return 0;
    default:
      return 0;
  }
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
  
  const self = players[ci];
  const role = self?._nyaBorrow || self?.role;

  if (card.type === 'roseThornGiftAllHand') {
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

  if (role === ROLE_HUNTER) {
    return estimateHunterZoneCardScore(card, self, players, ci) > 0;
  }
  if (role === ROLE_TREASURE) {
    return estimateTreasureZoneCardScore(card, self, players, ci) > 0;
  }
  if (role === ROLE_CULTIST) {
    return estimateCultistZoneCardScore(card, self, players, ci) > 0;
  }

  return estimateZoneCardKeepScore(card, ci, players) > 0;
}
