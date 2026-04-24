import {
  isZoneCard,
  isPositiveZoneCard,
  isNegativeZoneCard,
  estimateZoneCardKeepScore,
  getPrevLivingIndex,
  getNextLivingIndex,
  getZoneCardPolarity,
  zoneCardHasGuaranteedHpLoss,
  zoneCardHasGuaranteedSanLoss,
  zoneCardIsSacrificeStyle,
  zoneCardAppliesWidePressure,
  zoneCardProvidesGuaranteedCardGain,
  zoneCardUsesTargetInteraction,
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

function zoneCardCanGiftLowerSan(card, target) {
  if (!card?.type || !target) return 0;
  switch (card.type) {
    case 'selfDamageSAN':
    case 'selfDamageDiscardSAN':
    case 'selfDamageRestSAN':
      return card.val || 0;
    case 'selfDamageSANCond':
      return (card.val || 0) + ((card.condType === 'sanHigh' && target.san >= (card.condVal || 0)) ? (card.bonus || 0) : 0);
    case 'selfDamageHPSAN':
    case 'selfHealHPSelfDamageSAN':
      return card.sanVal || 0;
    case 'adjDamageSAN':
      return card.val || 0;
    case 'adjDamageBoth':
      return card.sanVal || card.val || 0;
    case 'allDamageSAN':
      return card.val || 0;
    case 'allDamageBoth':
      return card.sanVal || card.val || 0;
    case 'selfDamageAdjDamageBoth':
      return card.sanVal || 0;
    default:
      return 0;
  }
}

function zoneCardGiftHpHealValue(card) {
  if (!card?.type) return 0;
  switch (card.type) {
    case 'selfHealHP':
      return card.val || 0;
    case 'selfHealBoth':
      return card.val || 1;
    case 'selfHealBoth21':
      return 2;
    case 'selfRevealHandHP':
      return 10;
    case 'selfHealAdjDamageHP':
    case 'selfHealAdjHealHP':
      return card.val || 0;
    case 'selfHealHPSelfDamageSAN':
      return card.hpVal || 0;
    case 'adjHealHP':
      return card.val || 0;
    case 'sacHealHP':
      return 1;
    default:
      return 0;
  }
}

function zoneCardGiftHpDamageValue(card, target) {
  if (!card?.type || !target) return 0;
  switch (card.type) {
    case 'selfDamageHP':
    case 'selfDamageDiscardHP':
    case 'selfDamageRestHP':
    case 'selfDamageHPPeek':
      return card.val || 0;
    case 'selfDamageHPCond':
      return (card.val || 0) + ((card.condType === 'hpLow' && target.hp <= (card.condVal || 0)) ? (card.bonus || 0) : 0);
    case 'selfDamageHPSAN':
      return card.hpVal || 0;
    case 'adjDamageHP':
      return card.val || 0;
    case 'adjDamageBoth':
      return card.hpVal || card.val || 0;
    case 'allDamageHP':
      return card.val || 0;
    case 'allDamageBoth':
      return card.hpVal || card.val || 0;
    case 'selfDamageAdjDamageHP':
      return card.val || 0;
    case 'selfDamageAdjDamageBoth':
      return card.hpVal || 0;
    case 'allDamageHPRandomExtra':
      return card.val || 0;
    default:
      return 0;
  }
}

function zoneCardGiftRestsTarget(card) {
  return ['selfDamageRestHP', 'selfDamageRestSAN', 'adjRest'].includes(card?.type);
}

function estimateGodGiftSanLoss(card, target) {
  if (!card?.isGod || !target || target.isDead) return 0;
  if ((target._nyaBorrow || target.role) === ROLE_CULTIST) return 0;
  const encounterCost = (target.godEncounters || 0) + 1;
  const convertCost = target.godName && target.godName !== card.godKey ? 1 : 0;
  return encounterCost + convertCost;
}

function getCultistSanTargetPriority(target) {
  if (!target) return 99;
  if (target.role === ROLE_CULTIST && target.roleRevealed) return 0;
  if (!target.roleRevealed) return 1;
  if (target.role === ROLE_HUNTER) return 2;
  if (target.role === ROLE_TREASURE) return 3;
  return 4;
}

function getDualLowTargets(players, sourceIdx) {
  return players
    .map((player, idx) => ({ player, idx }))
    .filter(({ player, idx }) => idx !== sourceIdx && !player.isDead && player.hp <= 5 && player.san <= 5);
}

function sortByLowestSanThenHp(a, b) {
  return (a.player.san - b.player.san) || (a.player.hp - b.player.hp) || (a.idx - b.idx);
}

function sortByLowestHpThenSan(a, b) {
  return (a.player.hp - b.player.hp) || (a.player.san - b.player.san) || (a.idx - b.idx);
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
    case 'allDamageHP':
    case 'allDamageSAN':
    case 'allDamageBoth': {
      const dmgBonus = self.damageBonus || 0;
      const livingPlayers = players.filter(p => !p.isDead);
      const hpLoss = card.type === 'allDamageBoth' ? card.val : (card.type === 'allDamageHP' ? card.val : 0);
      const sanLoss = card.type === 'allDamageBoth' ? card.val : (card.type === 'allDamageSAN' ? card.val : 0);
      const targets = livingPlayers.map((_, i) => i);
      let hunterKillBonus = 0;
      let totalKillPotential = 0;
      for (const idx of targets) {
        if (idx === ci) continue;
        const target = players[idx];
        if (target.role === ROLE_HUNTER && !target.isDead) {
          const newHp = target.hp - hpLoss - dmgBonus;
          if (newHp <= 0 && target.san >= 4) {
            hunterKillBonus += 8;
            totalKillPotential++;
          }
        }
      }
      if (totalKillPotential > 0) {
        score = 10 + hunterKillBonus + totalKillPotential * 2;
      } else {
        const totalDamageToOthers = targets.filter(idx => idx !== ci).length * (hpLoss || sanLoss);
        score = totalDamageToOthers * 0.3;
        if (self.hp <= hpLoss + 1) score -= 5;
      }
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

  const abandonedHunts = self?._abandonedHunts || 0;
  const ammoPressure = self.hand.length <= 2 || abandonedHunts >= 2;
  if (ammoPressure && score < 0) {
    const isSelfDamage = ['selfDamageHP', 'selfDamageSAN', 'selfDamageHPSAN', 'selfDamageRestHP', 'selfDamageRestSAN', 'selfDamageHPPeek', 'selfDamageDiscardHP', 'selfDamageDiscardSAN'].includes(card.type);
    if (isSelfDamage) {
      const willHpBe = self.hp - (zoneCardHasGuaranteedHpLoss(card) ? (card.val || card.hpVal || 1) : 0);
      const willSanBe = self.san - (zoneCardHasGuaranteedSanLoss(card) ? (card.val || card.sanVal || 1) : 0);
      if (willHpBe >= 5 && willSanBe >= 5 && card.type !== 'selfDamageRestHP' && card.type !== 'selfDamageRestSAN') {
        let ammoBonus = 0;
        if (self.hand.length === 0) ammoBonus += 10;
        else if (self.hand.length === 1) ammoBonus += 7;
        else ammoBonus += 4.5;
        ammoBonus += Math.min(abandonedHunts, 3) * 1.5;
        score += ammoBonus;
      }
    }
  }

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

export function aiChooseRevealCard(targetHand, hunterName, log, knownHunterCards) { // eslint-disable-line no-unused-vars
  const zoneCards = targetHand.filter(isZoneCard);
  if (!zoneCards.length) return null;

  const scored = zoneCards.map((card, index) => {
    let score = 0;
    if (card.type === 'revealTopCards') score += 5;
    if (card.type === 'firstComePick') score += 4;
    if (card.type === 'swapAllHands') score = 10;
    if (card.type === 'caveDuel') score += 3;
    const isNegative = isNegativeZoneCard(card);
    if (isNegative) score -= 100;
    return { index, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return zoneCards[scored[0]?.index ?? 0];
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

export function getHunterChaseTargets(players, hunterIdx, huntAbandoned = []) {
  return players
    .map((player, idx) => ({ player, idx }))
    .filter(({ player, idx }) => !player.isDead && idx !== hunterIdx && player.role !== ROLE_HUNTER && !huntAbandoned.includes(idx))
    .filter(({ player }) => (player.hand || []).some(isZoneCard));
}

export function shouldHunterKeepChasing(players, hunterIdx, huntAbandoned = []) {
  const hunter = players[hunterIdx];
  if (!hunter || hunter.isDead) return false;
  const hunterZoneCards = (hunter.hand || []).filter(isZoneCard);
  const hunterHandLimit = hunter._nyaHandLimit ?? 4;
  const hunterOverLimit = hunterZoneCards.length > hunterHandLimit;
  const someoneWounded = players.some((p, i) => i !== hunterIdx && !p.isDead && p.hp < 10);
  return hunterZoneCards.length > 0 && getHunterChaseTargets(players, hunterIdx, huntAbandoned).length > 0 && (hunterOverLimit || someoneWounded);
}

function getCthulhuRestBias(ai) {
  if (ai?.godName !== 'CTH' || !ai?.godLevel) return 0;
  return ai.godLevel * 0.08;
}

export function shouldAiRest(gs, ai, aiEffRole) {
  if (!ai || ai.isDead) return false;
  if (gs?.restUsed || gs?.skillUsed) return false;
  if (ai.hp >= 9) return false;

  const cthBias = getCthulhuRestBias(ai);
  if (aiEffRole === ROLE_TREASURE) {
    if (ai.hp <= 4) return Math.random() < Math.min(0.96, 0.88 + cthBias);
    if (ai.hp <= 6) return Math.random() < Math.min(0.90, 0.78 + cthBias);
    return Math.random() < Math.min(0.78, 0.62 + cthBias);
  }

  if (aiEffRole === ROLE_HUNTER) {
    if (ai.hp <= 5) return Math.random() < Math.min(0.84, 0.75 + cthBias);
    return false;
  }

  if (ai.hp <= 3) return Math.random() < Math.min(0.95, 0.86 + cthBias);
  if (ai.hp <= 5) return Math.random() < Math.min(0.88, 0.72 + cthBias);
  return Math.random() < Math.min(0.74, 0.52 + cthBias);
}

export function decideAiSkillUsage(gs, players, ct, aiEffRole, hunterTargets = []) {
  const self = players?.[ct];
  if (!self || self.isDead) {
    return {
      canUseSkill: false,
      shouldHunterUseSkill: false,
      shouldNonHunterUseSkill: false,
      useSkill: false,
      skillRate: 0,
      canBewitch: false,
      canSwapHands: false,
    };
  }

  const myNonGod = (self.hand || []).filter(c => !c.isGod);
  const myProgress = aiEffRole === ROLE_TREASURE
    ? (new Set(myNonGod.map(c => c.letter)).size + new Set(myNonGod.map(c => c.number)).size)
    : 0;

  let skillRate = 0.35;
  if (aiEffRole === ROLE_HUNTER) skillRate = 0.97;
  else if (aiEffRole === ROLE_CULTIST) skillRate = 0.95;
  else if (myProgress >= 7) skillRate = 0.55;

  const canUseSkill = !gs?.restUsed && (aiEffRole === ROLE_HUNTER ? true : !gs?.skillUsed);
  const hunterZoneCards = (self.hand || []).filter(isZoneCard);
  const hunterHandLimit = self._nyaHandLimit ?? 4;
  const hunterOverLimit = hunterZoneCards.length > hunterHandLimit;
  const someoneWounded = players.some((p, i) => i !== ct && !p.isDead && p.hp < 10);

  const shouldHunterUseSkill =
    canUseSkill &&
    aiEffRole === ROLE_HUNTER &&
    hunterZoneCards.length > 0 &&
    hunterTargets.length > 0 &&
    (hunterOverLimit || someoneWounded);

  const aliveOthers = players.some((p, i) => i !== ct && !p.isDead);
  const canBewitch = aiEffRole === ROLE_CULTIST && (self.hand || []).length > 0 && aliveOthers;
  const canSwapHands = aiEffRole === ROLE_TREASURE && (self.hand || []).length > 0 && players.some((p, i) => i !== ct && !p.isDead && (p.hand || []).length > 0);
  const shouldNonHunterUseSkill = canUseSkill && Math.random() < skillRate && (canBewitch || canSwapHands);
  const useSkill = aiEffRole === ROLE_HUNTER ? shouldHunterUseSkill : shouldNonHunterUseSkill;

  return {
    canUseSkill,
    shouldHunterUseSkill,
    shouldNonHunterUseSkill,
    useSkill,
    skillRate,
    canBewitch,
    canSwapHands,
    myProgress,
    hunterZoneCards,
    hunterHandLimit,
    hunterOverLimit,
    someoneWounded,
  };
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

export function chooseAiCultistBewitchPlan(players, sourceIdx) {
  const self = players?.[sourceIdx];
  if (!self || self.isDead) return null;
  const targets = players
    .map((player, idx) => ({ player, idx }))
    .filter(({ player, idx }) => idx !== sourceIdx && !player.isDead);
  if (!targets.length || !(self.hand || []).length) return null;

  const hand = [...self.hand];
  const regionCards = hand.filter(card => !card.isGod);
  const godCards = hand.filter(card => card.isGod);

  // 1. Immediate cultist win: choose any card that can push a target SAN to 0 or below.
  const lethalCandidates = [];
  for (const target of targets) {
    for (const card of hand) {
      const sanLoss = card.isGod
        ? estimateGodGiftSanLoss(card, target.player)
        : zoneCardCanGiftLowerSan(card, target.player);
      if (sanLoss > 0 && target.player.san - sanLoss <= 0 && target.player.hp > 0) {
        lethalCandidates.push({
          card,
          targetIdx: target.idx,
          score: sanLoss * 10 + (10 - target.player.san) + (card.isGod ? 2 : 0),
        });
      }
    }
  }
  if (lethalCandidates.length) {
    lethalCandidates.sort((a, b) => b.score - a.score);
    return { card: lethalCandidates[0].card, targetIdx: lethalCandidates[0].targetIdx };
  }

  // 2. Heal HP for a target who is both HP-low and SAN-low.
  const healCards = regionCards.filter(card => zoneCardGiftHpHealValue(card) > 0);
  const dualLowTargets = getDualLowTargets(players, sourceIdx);
  if (healCards.length && dualLowTargets.length) {
    const bestTarget = [...dualLowTargets].sort(sortByLowestHpThenSan)[0];
    const bestCard = [...healCards].sort((a, b) => zoneCardGiftHpHealValue(b) - zoneCardGiftHpHealValue(a))[0];
    return { card: bestCard, targetIdx: bestTarget.idx };
  }

  // 3. Prioritize SAN-damage region cards.
  const sanCards = regionCards.filter(card => zoneCardCanGiftLowerSan(card, { san: 99, hp: 99 }) > 0);
  if (sanCards.length) {
    const rankedSanCards = [...sanCards].sort((a, b) => {
      const aBurst = a.type === 'selfDamageSANCond' ? 1 : 0;
      const bBurst = b.type === 'selfDamageSANCond' ? 1 : 0;
      return bBurst - aBurst || zoneCardCanGiftLowerSan(b, { san: 99, hp: 99 }) - zoneCardCanGiftLowerSan(a, { san: 99, hp: 99 });
    });
    for (const card of rankedSanCards) {
      let orderedTargets;
      if (['allDamageSAN', 'allDamageBoth'].includes(card.type)) {
        orderedTargets = [...targets].sort((a, b) =>
          getCultistSanTargetPriority(a.player) - getCultistSanTargetPriority(b.player) ||
          sortByLowestSanThenHp(a, b)
        );
      } else {
        orderedTargets = [...targets].sort(sortByLowestSanThenHp);
      }
      if (orderedTargets.length) return { card, targetIdx: orderedTargets[0].idx };
    }
  }

  // 4. Use region cards to heal or flip targets.
  if (healCards.length) {
    const damagedTargets = targets.filter(({ player }) => player.hp < 10).sort(sortByLowestHpThenSan);
    if (damagedTargets.length) {
      const bestCard = [...healCards].sort((a, b) => zoneCardGiftHpHealValue(b) - zoneCardGiftHpHealValue(a))[0];
      return { card: bestCard, targetIdx: damagedTargets[0].idx };
    }
  }

  const restCards = regionCards.filter(card => zoneCardGiftRestsTarget(card));
  if (restCards.length) {
    const chooseRestTarget = (pool, card) => {
      const filtered = pool.filter(({ idx }) => card.type !== 'adjRest' || !getAdjacentTargets(players, idx).includes(sourceIdx));
      return filtered.length ? filtered[0] : null;
    };
    const revealedHunters = targets.filter(t => t.player.role === ROLE_HUNTER && t.player.roleRevealed).sort(sortByLowestHpThenSan);
    const revealedTreasures = targets.filter(t => t.player.role === ROLE_TREASURE && t.player.roleRevealed).sort(sortByLowestHpThenSan);
    const unrevealed = targets.filter(t => !t.player.roleRevealed).sort(() => Math.random() - 0.5);
    for (const card of restCards) {
      const candidate = chooseRestTarget(revealedHunters, card) || chooseRestTarget(revealedTreasures, card) || chooseRestTarget(unrevealed, card);
      if (candidate) return { card, targetIdx: candidate.idx };
    }
  }

  // 5. God cards: prefer high-skull / low-SAN targets, avoid cultists.
  if (godCards.length) {
    const weightedTargets = targets
      .map(target => ({
        ...target,
        weight: (target.player.role === ROLE_CULTIST ? -999 : 0) + ((target.player.godEncounters || 0) * 3) + (10 - target.player.san),
      }))
      .sort((a, b) => b.weight - a.weight || sortByLowestSanThenHp(a, b));
    if (weightedTargets.length && weightedTargets[0].weight > -999) {
      return { card: godCards[0], targetIdx: weightedTargets[0].idx };
    }
  }

  // 6. Final fallback: if unrevealed, may choose to not use skill at all.
  if (!self.roleRevealed) return null;

  const hpDamageCards = regionCards.filter(card => zoneCardGiftHpDamageValue(card, { hp: 99, san: 99 }) > 0);
  if (hpDamageCards.length) {
    for (const card of hpDamageCards) {
      const lethalHunter = targets
        .filter(t => t.player.role === ROLE_HUNTER && !t.player.isDead && t.player.hp <= zoneCardGiftHpDamageValue(card, t.player))
        .sort(sortByLowestHpThenSan)[0];
      if (lethalHunter) return { card, targetIdx: lethalHunter.idx };
    }
    const sturdyTargets = [...targets].sort((a, b) =>
      ((b.player.hp + b.player.san) - (a.player.hp + a.player.san)) ||
      (b.player.hp - a.player.hp) ||
      (a.idx - b.idx)
    );
    if (sturdyTargets.length) return { card: hpDamageCards[0], targetIdx: sturdyTargets[0].idx };
    const revealedHunter = targets
      .filter(t => t.player.role === ROLE_HUNTER && t.player.roleRevealed)
      .sort(sortByLowestHpThenSan)[0];
    if (revealedHunter) return { card: hpDamageCards[0], targetIdx: revealedHunter.idx };
  }

  if (regionCards.length) {
    const fallbackTarget = [...targets].sort((a, b) => (b.player.hp + b.player.san) - (a.player.hp + a.player.san))[0];
    if (fallbackTarget) return { card: regionCards[0], targetIdx: fallbackTarget.idx };
  }

  if (godCards.length) {
    const fallbackTarget = [...targets].sort(sortByLowestSanThenHp)[0];
    if (fallbackTarget) return { card: godCards[0], targetIdx: fallbackTarget.idx };
  }

  return null;
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

  if (role === ROLE_CULTIST) {
    return estimateCultistZoneCardScore(card, self, players, ci) > 0;
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

  return estimateZoneCardKeepScore(card, ci, players) > 0;
}

export function canTreasureHunterWinBySwap(players, ti) {
  const self = players[ti];
  if (!self || self.isDead) return null;
  const role = self._nyaBorrow || self.role;
  if (role !== ROLE_TREASURE) return null;

  const myHand = self.hand || [];
  const myLetters = new Set(myHand.filter(c => c.letter && !c.isGod).map(c => c.letter));
  const myNumbers = new Set(myHand.filter(c => c.number != null && !c.isGod).map(c => c.number));
  const missingLetters = ['A', 'B', 'C', 'D'].filter(l => !myLetters.has(l));
  const missingNumbers = [1, 2, 3, 4].filter(n => !myNumbers.has(n));

  if (missingLetters.length === 0 && missingNumbers.length === 0) return null;
  if (missingLetters.length > 1 || missingNumbers.length > 1) return null;

  const neededLetter = missingLetters.length === 1 ? missingLetters[0] : null;
  const neededNumber = missingNumbers.length === 1 ? missingNumbers[0] : null;

  const targetPlayers = players
    .map((p, i) => ({ player: p, idx: i }))
    .filter(({ player, idx }) => idx !== ti && !player.isDead);

  for (const { player, idx } of targetPlayers) {
    for (const card of player.hand || []) {
      if (card.isGod) continue;
      const hasNeeded = (neededLetter && card.letter === neededLetter) || (neededNumber && card.number === neededNumber);
      if (hasNeeded) {
        const giveCard = player.hand.find(c => !c.isGod && !((neededLetter && c.letter === neededLetter) || (neededNumber && c.number === neededNumber)));
        const newMissingLetters = ['A', 'B', 'C', 'D'].filter(l => {
          if (neededLetter && l === neededLetter) return false;
          if (giveCard && giveCard.letter === l) return false;
          return !myLetters.has(l);
        });
        const newMissingNumbers = [1, 2, 3, 4].filter(n => {
          if (neededNumber && n === neededNumber) return false;
          if (giveCard && giveCard.number === n) return false;
          return !myNumbers.has(n);
        });
        if (newMissingLetters.length === 0 && newMissingNumbers.length === 0) {
          return { targetIdx: idx, neededCard: card };
        }
      }
    }
  }
  return null;
}

export function shouldTreasureHunterSwapToAvoidRegression(players, ti) {
  const self = players[ti];
  if (!self || self.isDead) return null;
  const role = self._nyaBorrow || self.role;
  if (role !== ROLE_TREASURE) return null;

  const handLimit = self._nyaHandLimit ?? 4;
  const zoneCards = (self.hand || []).filter(isZoneCard);
  if (zoneCards.length <= handLimit) return null;

  const myHand = self.hand || [];
  const myLetters = new Set(myHand.filter(c => c.letter && !c.isGod).map(c => c.letter));
  const myNumbers = new Set(myHand.filter(c => c.number != null && !c.isGod).map(c => c.number));
  const missingLetters = ['A', 'B', 'C', 'D'].filter(l => !myLetters.has(l));
  const missingNumbers = [1, 2, 3, 4].filter(n => !myNumbers.has(n));

  if (missingLetters.length === 0 && missingNumbers.length === 0) return null;
  if (missingLetters.length > 1 || missingNumbers.length > 1) return null;

  const neededLetter = missingLetters.length === 1 ? missingLetters[0] : null;
  const neededNumber = missingNumbers.length === 1 ? missingNumbers[0] : null;

  const targetPlayers = players
    .map((p, i) => ({ player: p, idx: i }))
    .filter(({ player, idx }) => idx !== ti && !player.isDead);

  for (const { player, idx } of targetPlayers) {
    for (const card of player.hand || []) {
      if (card.isGod) continue;
      const hasNeeded = (neededLetter && card.letter === neededLetter) || (neededNumber && card.number === neededNumber);
      if (hasNeeded) {
        return { targetIdx: idx, neededCard: card };
      }
    }
  }
  return null;
}

export function canCultistWinByBewitch(players, ti) {
  const cultistPlan = chooseAiCultistBewitchPlan(players, ti);
  if (!cultistPlan) return false;

  const self = players[ti];
  const target = players[cultistPlan.targetIdx];
  if (!self || !target) return false;

  const card = cultistPlan.card;
  if (card.isGod) {
    const sanLoss = estimateGodGiftSanLoss(card, target);
    return target.san - sanLoss <= 0 && target.hp > 0;
  } else {
    const sanLoss = zoneCardCanGiftLowerSan(card, target);
    return target.san - sanLoss <= 0 && target.hp > 0;
  }
}

export function canCultistEmptyHandByBewitch(players, ti) {
  const self = players[ti];
  if (!self || self.isDead) return false;

  const hand = self.hand || [];
  if (hand.length === 0) return true;

  const regionCards = hand.filter(c => !c.isGod);
  return regionCards.length > 0;
}

export function aiShouldNotRest(gs, ai, aiEffRole, players, ti) {
  if (ai.hp >= 9) return false;

  if (aiEffRole === ROLE_TREASURE && ai.hp <= 4) {
    const winSwap = canTreasureHunterWinBySwap(players, ti);
    if (winSwap) return { shouldNotRest: true, reason: 'swapWin', targetIdx: winSwap.targetIdx };

    const regressionSwap = shouldTreasureHunterSwapToAvoidRegression(players, ti);
    if (regressionSwap) return { shouldNotRest: true, reason: 'swapAvoidRegression', targetIdx: regressionSwap.targetIdx };

    return { shouldNotRest: false };
  }

  if (aiEffRole === ROLE_CULTIST && ai.hp <= 4) {
    if (canCultistWinByBewitch(players, ti)) {
      return { shouldNotRest: true, reason: 'bewitchWin' };
    }

    if (canCultistEmptyHandByBewitch(players, ti)) {
      return { shouldNotRest: true, reason: 'bewitchEmptyHand' };
    }

    if (ai.hp <= 2) {
      return { shouldNotRest: false, reason: 'hpTooLow' };
    }

    return { shouldNotRest: false };
  }

  return { shouldNotRest: false };
}

export function isCultistEndingTurnUnreasonable(players, ti) {
  const self = players[ti];
  if (!self || self.isDead) return false;

  const role = self._nyaBorrow || self.role;
  if (role !== ROLE_CULTIST) return false;

  const regionCards = (self.hand || []).filter(c => !c.isGod);
  if (regionCards.length === 0) return false;
  if (self.roleRevealed) return true;
  if (self.hp < 5 || self.san < 5) return true;
  return false;
}
