import {
  isZoneCard,
  isPositiveZoneCard,
  isNegativeZoneCard,
  estimateZoneCardKeepScore,
  getAdjacentTargets,
  getZoneCardPolarity,
  zoneCardHasGuaranteedHpLoss,
  zoneCardHasGuaranteedSanLoss,
  zoneCardIsSacrificeStyle,
  zoneCardAppliesWidePressure,
  zoneCardProvidesGuaranteedCardGain,
  zoneCardUsesTargetInteraction,
  isBlackGoatYoung,
  canRevealForHunt,
  hasHuntRevealableCard,
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from './coreUtils';
import { getActiveDamageLinksForPlayer } from './damageLinks';

function damageLinkMissingHp(player) {
  return Math.min(4, Math.max(0, 10 - (player?.hp || 0)));
}

export function chooseAiDamageLinkTarget(players, sourceIdx, validTargetIndices = []) {
  const source = players?.[sourceIdx];
  if (!source || source.isDead) return null;
  const validTargets = validTargetIndices
    .filter(idx => idx != null && idx !== sourceIdx && players[idx] && !players[idx].isDead)
    .map(idx => ({ idx, player: players[idx] }));
  if (!validTargets.length) return null;
  const role = source._nyaBorrow || source.role;

  if (role === ROLE_HUNTER && source.hp > 3) {
    const validSet = new Set(validTargets.map(target => target.idx));
    const chaseTargets = getHunterChaseTargets(players, sourceIdx)
      .filter(target => validSet.has(target.idx));
    if (chaseTargets.length) {
      return orderHunterChaseTargets(players, sourceIdx, chaseTargets, () => 0)[0]?.idx ?? null;
    }
    const publicEnemies = validTargets.filter(({ player }) => player.roleRevealed && player.role !== ROLE_HUNTER);
    if (publicEnemies.length) {
      return [...publicEnemies].sort((a, b) => a.player.hp - b.player.hp || a.idx - b.idx)[0].idx;
    }
  }

  if (role === ROLE_CULTIST && source.hp > 3) {
    const revealedHunters = validTargets.filter(({ player }) => player.roleRevealed && player.role === ROLE_HUNTER);
    if (revealedHunters.length) {
      return [...revealedHunters].sort((a, b) => a.player.hp - b.player.hp || a.idx - b.idx)[0].idx;
    }
  }

  // Defensive fallback: maximize the possible next-turn heal and, on ties,
  // choose the sturdier target so an incidental hit is less likely to waste it.
  return [...validTargets].sort((a, b) => (
    damageLinkMissingHp(b.player) - damageLinkMissingHp(a.player)
    || b.player.hp - a.player.hp
    || a.idx - b.idx
  ))[0].idx;
}

function estimateDamageLinkZoneCardScore(self, players, ci, role) {
  const validTargets = players.map((player, idx) => ({ player, idx }))
    .filter(({ player, idx }) => idx !== ci && player && !player.isDead)
    .map(({ idx }) => idx);
  const targetIdx = chooseAiDamageLinkTarget(players, ci, validTargets);
  if (targetIdx == null) return -100;
  const target = players[targetIdx];
  const healValue = damageLinkMissingHp(self) + damageLinkMissingHp(target);
  if (role === ROLE_HUNTER) {
    const canAttack = self.hp > 3 && hasHuntRevealableCard(self)
      && hasHuntRevealableCard(target)
      && !(target.roleRevealed && target.role === ROLE_HUNTER);
    const attackValue = canAttack ? (target.hp <= 6 ? 6.5 : 4.2) : 0;
    const selfRisk = canAttack && self.hp <= 6 ? 3.5 : 0;
    return attackValue + healValue * 0.45 - selfRisk - (self.hp <= 3 ? 4.5 : 0);
  }
  if (role === ROLE_TREASURE) return healValue * 0.65 - (healValue ? 0.8 : 1.4) - (self.hp <= 3 ? 2.5 : 0);
  return healValue * 0.55 - (healValue ? 0.7 : 1.2) - (self.hp <= 3 ? 2.5 : 0);
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
    case 'allHealHP':
      return card.val || 0;
    case 'selfHealBoth':
      return card.val || 1;
    case 'selfHealHPSAN':
      return card.hpVal || 0;
    case 'selfHealBoth21':
      return 2;
    case 'selfRevealHandHP':
      return card.val || 8;
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
  if ((target._nyaBorrow || target.role) === ROLE_CULTIST && target.roleRevealed) return 0;
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

function estimateSameAbyssSelfFollowupPenalty(card, self, players, ci) {
  if (card?.type !== 'sameAbyssChoice' || !self || self.isDead) return 0;
  const living = players
    .map((player, idx) => ({ player, idx }))
    .filter(({ player }) => player && !player.isDead);
  if (!living.length) return 0;
  const selfHandAfterKeep = (self.hand?.length || 0) + 1;
  const maxOtherHand = Math.max(
    0,
    ...living
      .filter(({ idx }) => idx !== ci)
      .map(({ player }) => player.hand?.length || 0)
  );
  if (selfHandAfterKeep < maxOtherHand) return 0;
  const actorHandCount = selfHandAfterKeep;
  const discardCount = Math.max(0, selfHandAfterKeep - actorHandCount);
  const hpLoss = 4;
  const deathRisk = self.hp <= hpLoss ? 8 : 0;
  return hpLoss * 2.2 + discardCount * 1.5 + deathRisk + 2;
}

function estimateEtherealizeZoneCardScore(self, players, ci) {
  if (!self || self.isDead) return -1;
  if (!getLivingAdjacentTargets(players, ci).length) return -1;
  const stackCount = (self.hand?.length || 0) + 1;
  const danger = Math.max(0, 5 - (self.hp || 0)) * 1.2 + Math.max(0, 5 - (self.san || 0)) * 1.2;
  return stackCount * 0.9 + danger + (self.etherealizeStacks || 0) * 0.25 - 0.6;
}

function estimateHunterGlobalDamageScore(players, hpLoss = 0, sanLoss = 0, dmgBonus = 0) {
  const nonHunters = players
    .map((player, idx) => ({ player, idx }))
    .filter(({ player }) => player && player.role !== ROLE_HUNTER);
  if (!nonHunters.length) return 0;
  const killedNonHunters = nonHunters.filter(({ player }) => {
    if (player.isDead) return true;
    const nextHp = player.hp - (hpLoss || 0) - dmgBonus;
    const nextSan = player.san - (sanLoss || 0);
    return nextHp <= 0 || nextSan <= 0;
  });
  const livingNonHunters = nonHunters.filter(({ player }) => !player.isDead);
  const immediateWin = killedNonHunters.length === nonHunters.length;
  if (immediateWin) return 120;
  if (!killedNonHunters.length) return 0;
  const revealedBonus = killedNonHunters.filter(({ player }) => player.roleRevealed).length * 2;
  const damagePressure = livingNonHunters.length * Math.max(hpLoss || 0, sanLoss || 0) * 0.25;
  return 10 + killedNonHunters.length * 8 + revealedBonus + damagePressure;
}

function hasProliferatingZPayoff(self) {
  return (self?.hand || []).some(isBlackGoatYoung);
}

function getZoneAxisProgress(card, self) {
  const hand = (self?.hand || []).filter(c => !c?.isGod);
  const letters = new Set(hand.map(c => c?.letter).filter(v => v != null));
  const numbers = new Set(hand.map(c => c?.number).filter(v => v != null));
  return {
    addsLetter: !!card?.letter && !letters.has(card.letter),
    addsNumber: card?.number != null && !numbers.has(card.number),
  };
}

function estimateHunterHuntAmmoBonus(card, self) {
  if (!isZoneCard(card) || !canRevealForHunt(card)) return 0;

  // Only versatile zone cards count as dependable hunt ammunition here.
  // God and derived cards either disappear before the action phase or cannot
  // reliably answer a zone card revealed by the target.
  const huntAmmo = (self?.hand || []).filter(
    handCard => isZoneCard(handCard) && canRevealForHunt(handCard),
  ).length;
  const progress = getZoneAxisProgress(card, self);
  const coverageBonus = (progress.addsLetter ? 0.35 : 0) + (progress.addsNumber ? 0.35 : 0);

  // Even with four existing zone cards, a new card is worth slightly more
  // than the residual cost of a safe 1 HP self-damage card. This lets a
  // healthy hunter prepare for a multi-hunt turn without making heavier
  // self-damage cards attractive by default.
  return Math.max(0.9, 2.5 - huntAmmo * 0.4) + coverageBonus;
}

function isLowRiskHandValueCard(card) {
  if (!card || card.isGod || getZoneCardPolarity(card) === 'negative') return false;
  if (zoneCardHasGuaranteedHpLoss(card) || zoneCardHasGuaranteedSanLoss(card)) return false;
  return ![
    'allDiscard',
    'roseThornGiftAllHand',
    'sameAbyssChoice',
    'selfRevealHandHP',
    'selfRevealHandSAN',
    'selfRenounceGod',
  ].includes(card.type);
}

function estimateRevealHandExposurePenalty(self) {
  if (!self || (self.revealHand && self.pickInsteadOfRandom)) return 0;
  const handSize = self.hand?.length || 0;
  return 2.8 + Math.min(handSize, 5) * 0.8;
}

function estimateRoleHandValueBias(card, self, role) {
  if (!isLowRiskHandValueCard(card)) return 0;
  if (role === ROLE_CULTIST) return -0.55;
  if (role === ROLE_TREASURE) {
    const progress = getZoneAxisProgress(card, self);
    return 0.45 + (progress.addsLetter ? 0.25 : 0) + (progress.addsNumber ? 0.25 : 0);
  }
  if (role === ROLE_HUNTER) {
    const handSize = self?.hand?.length || 0;
    return 0.55 + (canRevealForHunt(card) && handSize <= 2 ? 0.45 : 0);
  }
  return 0;
}

function estimateTreasureRiskyAxisBonus(card, self) {
  if (!card || getZoneCardPolarity(card) !== 'negative') return 0;
  if (zoneCardAppliesWidePressure(card)) return 0;
  const progress = getZoneAxisProgress(card, self);
  const progressValue = (progress.addsLetter ? 1 : 0) + (progress.addsNumber ? 1 : 0);
  if (!progressValue) return 0;
  const hpLoss = zoneCardHasGuaranteedHpLoss(card) ? (card.val || card.hpVal || 1) : 0;
  const sanLoss = zoneCardHasGuaranteedSanLoss(card) ? (card.val || card.sanVal || 1) : 0;
  if ((self?.hp || 0) - hpLoss <= 3 || (self?.san || 0) - sanLoss <= 3) return 0;
  return progressValue * 1.6;
}

function estimateCultistGraveDigGodScore(self, discard = []) {
  const godCards = discard.filter(card => card?.isGod);
  if (!godCards.length) return -0.4;
  const bewitchAmmoBonus = Math.min(godCards.length, 3) * 0.45;
  const faithBonus = self?.godName ? 0.35 : 0.8;
  return 2.4 + bewitchAmmoBonus + faithBonus;
}

function estimateHunterZoneCardScore(card, self, players, ci) {
  let score = 0;
  switch (card.type) {
    case 'selfHealHP': score = (10 - self.hp) * 1.5; break;
    case 'allHealHP': score = players.filter(p => !p.isDead).reduce((sum, p) => sum + (10 - p.hp) * 0.35, 0); break;
    case 'selfHealSAN': score = (10 - self.san) * 1.4; break;
    case 'selfHealBoth': score = (10 - self.hp) + (10 - self.san); break;
    case 'selfHealHPSAN': score = (10 - self.hp) * 1.5 + (10 - self.san) * 0.8; break;
    case 'selfHealBoth21': score = (10 - self.hp) * 1.5 + (10 - self.san) * 0.8; break;
    case 'sacHealSelfSAN': score = (10 - self.san) * 1.8 - 1.2; break;
    case 'selfRevealHandHP': score = Math.max(0, (card.val || 8) - self.hp) * 2.2 - estimateRevealHandExposurePenalty(self); break;
    case 'selfRevealHandSAN': score = (10 - self.san) * 2.2 - estimateRevealHandExposurePenalty(self); break;
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
      score = estimateDamageLinkZoneCardScore(self, players, ci, ROLE_HUNTER);
      break;
    case 'etherealize':
      score = estimateEtherealizeZoneCardScore(self, players, ci);
      break;
    case 'firstComePick':
      score = 1.2;
      break;
    case 'proliferatingZ':
      score = hasProliferatingZPayoff(self) ? 3.0 : 1.0;
      break;
    case 'sameAbyssChoice':
      score = -(card.hpVal || 2) * 2.1 - estimateSameAbyssSelfFollowupPenalty(card, self, players, ci);
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
    case 'allHealHPDamageSAN': {
      const aliveOthers = players.filter((p, i) => i !== ci && !p.isDead).length;
      score = aliveOthers * 2.2 + (10 - self.san) * 0.5;
      break;
    }
    case 'reverseTurnOrder':
      score = 0.3;
      break;
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
      const livingPlayers = players.map((p, idx) => ({ player: p, idx })).filter(({ player }) => player && !player.isDead);
      const hpLoss = card.type === 'allDamageBoth' ? card.val : (card.type === 'allDamageHP' ? card.val : 0);
      const sanLoss = card.type === 'allDamageBoth' ? card.val : (card.type === 'allDamageSAN' ? card.val : 0);
      const targets = livingPlayers.map(({ idx }) => idx);
      const hunterWinPressure = estimateHunterGlobalDamageScore(players, hpLoss, sanLoss, dmgBonus);
      if (hunterWinPressure > 0) {
        score = hunterWinPressure;
        break;
      }
      let revealedEnemyPressure = 0;
      for (const idx of targets) {
        if (idx === ci) continue;
        const target = players[idx];
        if (target.role !== ROLE_HUNTER && target.roleRevealed && !target.isDead) {
          const newHp = target.hp - (hpLoss || 0) - dmgBonus;
          const newSan = target.san - (sanLoss || 0);
          if (newHp <= 3 || newSan <= 3) revealedEnemyPressure += 3;
        }
      }
      const totalDamageToOthers = targets.filter(idx => idx !== ci).length * (hpLoss || sanLoss);
      // 追猎者的胜利条件要求压低整桌血线；即使本次 AOE 不能立刻击杀，
      // 它也同时制造后续追捕斩杀线，并且这张区域牌本身还能作为追捕弹药。
      score = 3 + totalDamageToOthers * 1.25 + revealedEnemyPressure;
      if (self.hp <= hpLoss + 1) score -= 5;
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
  const isSingleTargetSelfDamage = [
    'selfDamageHP', 'selfDamageSAN', 'selfDamageHPSAN',
    'selfDamageHPPeek', 'selfDamageDiscardHP', 'selfDamageDiscardSAN',
  ].includes(card.type);
  let isSafeSelfDamageAmmo = false;
  if (isSingleTargetSelfDamage) {
    const hpLoss = zoneCardHasGuaranteedHpLoss(card) ? (card.hpVal || card.val || 1) : 0;
    const sanLoss = zoneCardHasGuaranteedSanLoss(card) ? (card.sanVal || card.val || 1) : 0;
    isSafeSelfDamageAmmo = self.hp - hpLoss >= 5 && self.san - sanLoss >= 5;
    if (self.hp - hpLoss >= 6 && self.san - sanLoss >= 6) score += 1.25;
  }
  score += estimateRoleHandValueBias(card, self, ROLE_HUNTER);
  // Ammunition value may justify a safe self-inflicted cost, but it must not
  // rescue tactically unusable cards (for example an invalid damage link).
  if (score >= 0 || isSafeSelfDamageAmmo) score += estimateHunterHuntAmmoBonus(card, self);

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
    case 'allHealHP': score = players.filter(p => !p.isDead).reduce((sum, p) => sum + (10 - p.hp) * 0.35, 0); break;
    case 'selfHealSAN': score = (10 - self.san) * 1.6; break;
    case 'selfHealBoth': score = (10 - self.hp) + (10 - self.san) * 1.1; break;
    case 'selfHealHPSAN': score = (10 - self.hp) * 1.5 + (10 - self.san) * 1.0; break;
    case 'selfHealBoth21': score = (10 - self.hp) * 1.5 + (10 - self.san) * 1.0; break;
    case 'sacHealSelfSAN': score = (10 - self.san) * 1.8 - 1.2; break;
    case 'selfRevealHandHP': score = Math.max(0, (card.val || 8) - self.hp) * 2.2 - estimateRevealHandExposurePenalty(self); break;
    case 'selfRevealHandSAN': score = (10 - self.san) * 2.3 - estimateRevealHandExposurePenalty(self); break;
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
      score = estimateDamageLinkZoneCardScore(self, players, ci, ROLE_TREASURE);
      break;
    case 'etherealize':
      score = estimateEtherealizeZoneCardScore(self, players, ci);
      break;
    case 'firstComePick':
      score = 3.8;
      break;
    case 'proliferatingZ':
      score = hasProliferatingZPayoff(self) ? 3.2 : 1.1;
      break;
    case 'sameAbyssChoice':
      score = -(card.hpVal || 2) * 2.2 - estimateSameAbyssSelfFollowupPenalty(card, self, players, ci);
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
    case 'allHealHPDamageSAN': {
      const aliveOthers = players.filter((p, i) => i !== ci && !p.isDead).length;
      score = -aliveOthers * 2.8 - (self.san <= 4 ? 6 : 0);
      break;
    }
    case 'reverseTurnOrder':
      score = 0.1;
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
  score += estimateTreasureRiskyAxisBonus(card, self);
  score += estimateRoleHandValueBias(card, self, ROLE_TREASURE);
  return score;
}

function estimateCultistZoneCardScore(card, self, players, ci, context = {}) {
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
    const effectiveHpDelta = hpDelta > 0 ? Math.min(hpDelta, Math.max(0, 10 - (target.hp || 0))) : hpDelta;
    const effectiveSanDelta = sanDelta > 0 ? Math.min(sanDelta, Math.max(0, 10 - (target.san || 0))) : sanDelta;
    let hpScore = 0, sanScore = 0;
    if (effectiveSanDelta < 0) {
      const sanUrgency = target.san <= -effectiveSanDelta ? 3 : 0;
      sanScore = (-effectiveSanDelta) * SAN_TO_HP_RATIO * 1.2 + sanUrgency;
    } else if (effectiveSanDelta > 0) {
      if (isSelf && self.hp <= 3 && minSan > 3) {
        sanScore = -effectiveSanDelta * SAN_TO_HP_RATIO * 0.3;
      } else {
        sanScore = -effectiveSanDelta * SAN_TO_HP_RATIO * 1.2;
      }
    }
    if (effectiveHpDelta > 0) {
      hpScore = effectiveHpDelta * 1.0;
    } else if (effectiveHpDelta < 0) {
      const deathRisk = target.hp <= -effectiveHpDelta + dmgBonus ? 3 : 0;
      hpScore = effectiveHpDelta * 1.2 - deathRisk;
    }
    return isSelf ? (hpScore + sanScore) : ((hpScore + sanScore) * 0.7);
  };
  const finishScore = score => score + estimateRoleHandValueBias(card, self, ROLE_CULTIST);
  const getTargetsAndValues = () => {
    switch (card.type) {
      case 'selfHealHP':
        return { targets: [ci], hpDelta: card.val, sanDelta: 0, hpLoss: 0, sanLoss: 0 };
      case 'allHealHP':
        return { targets: players.map((p, i) => i).filter(i => !players[i].isDead), hpDelta: card.val, sanDelta: 0, hpLoss: 0, sanLoss: 0 };
      case 'selfHealSAN':
        return { targets: [ci], hpDelta: 0, sanDelta: card.val, hpLoss: 0, sanLoss: 0 };
      case 'selfHealBoth':
        return { targets: [ci], hpDelta: card.val, sanDelta: card.val, hpLoss: 0, sanLoss: 0 };
      case 'selfHealHPSAN':
        return { targets: [ci], hpDelta: card.hpVal, sanDelta: card.sanVal, hpLoss: 0, sanLoss: 0 };
      case 'selfHealBoth21':
        return { targets: [ci], hpDelta: 2, sanDelta: 1, hpLoss: 0, sanLoss: 0 };
      case 'selfHealHPSelfDamageSAN':
        return { targets: [ci], hpDelta: card.hpVal, sanDelta: -card.sanVal, hpLoss: 0, sanLoss: card.sanVal };
      case 'selfRevealHandHP':
        return { targets: [ci], hpDelta: card.val || 8, sanDelta: 0, hpLoss: 0, sanLoss: 0, special: 'revealHandExposure' };
      case 'selfRevealHandSAN':
        return { targets: [ci], hpDelta: 0, sanDelta: 10, hpLoss: 0, sanLoss: 0, special: 'revealHandExposure' };
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
      case 'allHealHPDamageSAN':
        return { targets: livingPlayers.map((_, i) => i), hpDelta: card.hpVal, sanDelta: -card.sanVal, hpLoss: 0, sanLoss: card.sanVal };
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
      case 'sameAbyssChoice':
        return { targets: [ci], hpDelta: 0, sanDelta: 0, hpLoss: card.hpVal || 2, sanLoss: 0 };
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
    if (special === 'revealHandExposure') {
      totalScore -= estimateRevealHandExposurePenalty(self);
    }
    return finishScore(totalScore);
  }
  switch (card.type) {
    case 'etherealize':
      return finishScore(estimateEtherealizeZoneCardScore(self, players, ci));
    case 'selfRenounceGod':
      return -(self.godName ? 1 : 0.5);
    case 'selfBerserk':
      return finishScore(2 + minSan * 0.2);
    case 'damageLink':
      return finishScore(estimateDamageLinkZoneCardScore(self, players, ci, ROLE_CULTIST));
    case 'firstComePick':
      return finishScore(1.8);
    case 'proliferatingZ':
      return finishScore(hasProliferatingZPayoff(self) ? 3.2 : 2.4);
    case 'graveDigGod':
      return estimateCultistGraveDigGodScore(self, context.discard);
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
      return finishScore(0.3);
    case 'caveDuel':
      return finishScore(self.hand.length > 0 ? 0.3 : -0.3);
    case 'globalOnlySwap':
      return finishScore(0.2);
    case 'allDiscard':
      return -0.3;
    case 'adjRest':
      return 0;
    default:
      return finishScore(0);
  }
}

export function aiChooseRevealCard(targetHand, hunterName, log, knownHunterCards) { // eslint-disable-line no-unused-vars
  const revealableHand = targetHand.filter(canRevealForHunt);
  const zoneCards = revealableHand.filter(isZoneCard);
  if (zoneCards.length) {
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
  // 没有区域牌时，选择第一个非区域牌
  const nonZone = revealableHand.find(c => !isZoneCard(c));
  return nonZone || null;
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
    .filter(({ player, idx }) => (
      !player.isDead
      && idx !== hunterIdx
      && !(player.roleRevealed && player.role === ROLE_HUNTER)
      && !huntAbandoned.includes(idx)
    ))
    .filter(({ player }) => hasHuntRevealableCard(player));
}

export function getHunterLowQualityConfidence(gs, players, hunterIdx) {
  const hunter = players?.[hunterIdx];
  const memory = hunter?.huntQualityMemory;
  if (!memory || !Array.isArray(memory.handIds) || memory.handIds.length === 0) return 0;
  const currentIds = new Set((hunter.hand || []).map(card => card?.id).filter(id => id != null));
  const retained = memory.handIds.filter(id => currentIds.has(id)).length;
  const retention = retained / memory.handIds.length;
  if (retention < 0.5) return 0;

  const livingCount = Math.max(1, players.filter(player => player && !player.isDead).length);
  const turnGap = Math.max(0, (gs?.turn || 0) - (memory.turn || 0));
  const elapsedRounds = Math.floor(turnGap / livingCount);
  if (elapsedRounds >= 3) return 0;

  const timeFactor = elapsedRounds <= 0 ? 1 : elapsedRounds === 1 ? 0.75 : 0.45;
  const handSizeDrift = Math.abs((hunter.hand || []).length - (memory.handSize || memory.handIds.length));
  const driftPenalty = handSizeDrift <= 1 ? 1 : handSizeDrift === 2 ? 0.75 : 0.45;
  return retention * timeFactor * driftPenalty;
}

export function evaluateHunterChaseHandQuality(gs, players, hunterIdx) {
  const hunter = players?.[hunterIdx];
  const hand = hunter?.hand || [];
  const zoneCards = hand.filter(card => isZoneCard(card) && canRevealForHunt(card));
  const zoneRatio = zoneCards.length / Math.max(1, hand.length);
  const baseScore = zoneCards.length >= 4
    ? 1
    : zoneCards.length === 3
      ? 0.86
      : zoneCards.length === 2
        ? 0.7
        : zoneCards.length === 1
          ? 0.34
          : 0;
  const ratioBonus = Math.max(-0.12, Math.min(0.12, (zoneRatio - 0.5) * 0.3));
  const lowQualityConfidence = getHunterLowQualityConfidence(gs, players, hunterIdx);
  const rememberedFailures = hunter?.huntQualityMemory?.failedChainCount
    ?? hunter?.huntQualityMemory?.failedTargetCount
    ?? 0;
  const failurePenalty = lowQualityConfidence * Math.min(0.65, rememberedFailures * 0.25);
  const score = Math.max(0, Math.min(1, baseScore + ratioBonus - failurePenalty));
  return {
    suitable: zoneCards.length >= 2 && score >= 0.55,
    score,
    zoneCardCount: zoneCards.length,
    zoneRatio,
    lowQualityConfidence,
    rememberedFailures,
  };
}

export function orderHunterChaseTargets(players, hunterIdx, targets, random = Math.random) {
  const hunterLimit = Math.floor((players?.length || 0) / 2);
  const revealedHunterCount = (players || []).filter(player => (
    player && player.roleRevealed && player.role === ROLE_HUNTER
  )).length;
  const allUnrevealedAreSafe = hunterLimit > 0 && revealedHunterCount >= hunterLimit;
  const safeTargets = (targets || []).filter(({ player }) => (
    (player.roleRevealed && player.role !== ROLE_HUNTER)
    || (!player.roleRevealed && allUnrevealedAreSafe)
  ));
  const shouldConcentrate = safeTargets.length > 0;
  const linkedTargetIds = new Set(
    (players?.[hunterIdx]?.hp > 3 ? getActiveDamageLinksForPlayer(players, hunterIdx) : [])
      .map(link => link.a === hunterIdx ? link.b : link.a)
  );
  const pool = (shouldConcentrate ? safeTargets : (targets || []))
    .map(target => ({ target, tieBreaker: random() }));
  pool.sort((a, b) => {
    const linkedOrder = Number(linkedTargetIds.has(b.target.idx)) - Number(linkedTargetIds.has(a.target.idx));
    if (linkedOrder) return linkedOrder;
    const hpOrder = shouldConcentrate
      ? (a.target.player.hp - b.target.player.hp)
      : (b.target.player.hp - a.target.player.hp);
    return hpOrder || (a.tieBreaker - b.tieBreaker);
  });
  return pool.map(({ target }) => target);
}

export function shouldHunterKeepChasing(players, hunterIdx, huntAbandoned = []) {
  const hunter = players[hunterIdx];
  if (!hunter || hunter.isDead) return false;
  const hunterHandLimit = hunter._nyaHandLimit ?? 4;
  const hunterOverLimit = (hunter.hand || []).length > hunterHandLimit;
  const someoneWounded = players.some((p, i) => i !== hunterIdx && !p.isDead && p.hp < 10);
  return (hunter.hand || []).length > 0 && getHunterChaseTargets(players, hunterIdx, huntAbandoned).length > 0 && (hunterOverLimit || someoneWounded);
}

function getCthulhuRestBias(ai) {
  if (ai?.godName !== 'CTH' || !ai?.godLevel) return 0;
  return ai.godLevel * 0.08;
}

export function shouldAiRest(gs, ai, aiEffRole) {
  if (!ai || ai.isDead) return false;
  if (gs?.restUsed || gs?.skillUsed || gs?.multiplyUsed || ai.disableRest) return false;
  if (ai.hp >= 9) return false;

  const cthBias = getCthulhuRestBias(ai);
  if (ai.hp <= 3) return true;
  if (aiEffRole === ROLE_TREASURE) {
    if (ai.hp <= 4) return Math.random() < Math.min(0.96, 0.88 + cthBias);
    if (ai.hp <= 6) return Math.random() < Math.min(0.90, 0.78 + cthBias);
    return Math.random() < Math.min(0.78, 0.62 + cthBias);
  }

  if (aiEffRole === ROLE_HUNTER) {
    if (ai.hp <= 5) return Math.random() < Math.min(0.84, 0.75 + cthBias);
    return false;
  }

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

  const canUseSkill = !self.disableSkill && !gs?.restUsed && (aiEffRole === ROLE_HUNTER ? true : !gs?.skillUsed);
  const hunterHuntCards = (self.hand || []).filter(canRevealForHunt);
  const hunterHandLimit = self._nyaHandLimit ?? 4;
  const hunterOverLimit = (self.hand || []).length > hunterHandLimit;
  const someoneWounded = players.some((p, i) => i !== ct && !p.isDead && p.hp < 10);
  const hunterHandQuality = aiEffRole === ROLE_HUNTER
    ? evaluateHunterChaseHandQuality(gs, players, ct)
    : null;
  const hunterCanChase = (
    canUseSkill
    && aiEffRole === ROLE_HUNTER
    && hunterHuntCards.length > 0
    && hunterTargets.length > 0
    && !!hunterHandQuality?.suitable
  );
  const forceHunterChase = hunterCanChase && (hunterOverLimit || someoneWounded);

  const shouldHunterUseSkill =
    forceHunterChase
    || (hunterCanChase && Math.random() < 0.85);

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
    hunterHuntCards,
    hunterZoneCards: hunterHuntCards,
    hunterHandLimit,
    hunterOverLimit,
    someoneWounded,
    hunterHandQuality,
    forceHunterChase,
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

  const hand = [...self.hand].filter(card => !isBlackGoatYoung(card));
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
    const scoreGodTarget = (card, target) => {
      const sanLoss = estimateGodGiftSanLoss(card, target.player);
      if (sanLoss <= 0) return -Infinity;
      let score = sanLoss * 10 + (10 - target.player.san) + ((target.player.godEncounters || 0) * 2);
      if (target.player.godName === card.godKey) {
        score -= target.player.godLevel >= 3 ? 10 : 8;
      } else if (target.player.godName) {
        score += 3;
      }
      return score;
    };
    for (const card of godCards) {
      const nonCultistTargets = targets.filter(target => target.player.role !== ROLE_CULTIST);
      const conversionTargets = nonCultistTargets.filter(target => target.player.godName !== card.godKey);
      const sameGodLethalTargets = nonCultistTargets.filter(target =>
        target.player.godName === card.godKey &&
        estimateGodGiftSanLoss(card, target.player) > 0 &&
        target.player.san - estimateGodGiftSanLoss(card, target.player) <= 0 &&
        target.player.hp > 0
      );
      const candidateTargets = conversionTargets.length
        ? [...conversionTargets, ...sameGodLethalTargets]
        : nonCultistTargets;
      const cardTargets = candidateTargets
        .map(target => ({
          ...target,
          weight: scoreGodTarget(card, target),
        }))
        .sort((a, b) => b.weight - a.weight || sortByLowestSanThenHp(a, b));
      if (!cardTargets.length || cardTargets[0].weight <= -999) continue;
      return { card, targetIdx: cardTargets[0].idx };
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

export function aiShouldKeepZoneCard(card, ci, players, forced = false, context = {}) {
  if (!card || !isZoneCard(card)) return forced;
  if (card.isGod) return true;
  
  const self = players[ci];
  const role = self?._nyaBorrow || self?.role;

  if (card.type === 'sameAbyssChoice') {
    const selfPenalty = estimateSameAbyssSelfFollowupPenalty(card, self, players, ci);
    if (selfPenalty > 0 && (self?.hp || 0) <= (card.hpVal || 2) + 4) return false;
  }

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
    return estimateCultistZoneCardScore(card, self, players, ci, context) > 0;
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
    
    // 追猎者需要按伤害/弹药价值评估负面牌，不能因桌面已有同轴牌就在
    // 身份评分前直接否决（活火山等高价值 AOE 会因此被误弃）。
    if (role !== ROLE_HUNTER && othersWithSameLetter > 0 && othersWithSameNumber > 0) return false;
    if (card.type === 'blankZone') return true;
    if (forced) return false;
  }
  
  if (card.type === 'swapAllHands') return true;
  if (card.type === 'revealTopCards') return true;
  if (card.type === 'firstComePick') return true;
  if (card.type === 'sphinxGuess') return true;

  if (role === ROLE_HUNTER) {
    return estimateHunterZoneCardScore(card, self, players, ci) > 0;
  }
  if (role === ROLE_TREASURE) {
    return estimateTreasureZoneCardScore(card, self, players, ci) > 0;
  }

  return estimateZoneCardKeepScore(card, ci, players) > 0;
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

  const playableHand = (self.hand || []).filter(c => !isBlackGoatYoung(c));
  if (playableHand.length !== 1) return false;

  const plan = chooseAiCultistBewitchPlan(players, ti);
  return !!plan && (plan.card?.id === playableHand[0]?.id || plan.card === playableHand[0]);
}

export function aiShouldNotRest(gs, ai, aiEffRole, players, ti) {
  if (ai.hp >= 9) return false;

  if (aiEffRole === ROLE_TREASURE && ai.hp <= 4) {
    return { shouldNotRest: false };
  }

  if (aiEffRole === ROLE_CULTIST && ai.hp <= 4) {
    if (canCultistWinByBewitch(players, ti)) {
      return { shouldNotRest: true, reason: 'bewitchWin' };
    }

    if (ai.hp > 3 && canCultistEmptyHandByBewitch(players, ti)) {
      return { shouldNotRest: true, reason: 'bewitchEmptyHand' };
    }

    if (ai.hp <= 3) {
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
