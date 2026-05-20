import {
  clamp,
  killPlayerState,
  getPrevLivingIndex,
  getNextLivingIndex,
  copyPlayers,
  shuffle,
  getLivingPlayerOrder,
  cardLogText,
  isZoneCard,
  isBlackGoatYoung,
  makeInspectionMeta,
  sortInspectionTargets,
} from './coreUtils';

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

// ══════════════════════════════════════════════════════════════
//  INSPECTION SYSTEM
// ══════════════════════════════════════════════════════════════

function handleInspection(playerIndex, gs) {
  let newGs = { ...gs };
  const beforePlayers = copyPlayers(gs.players || []);
  const beforeLog = [...(Array.isArray(gs.log) ? gs.log : [])];
  const beforeLogLen = Array.isArray(gs.log) ? gs.log.length : 0;
  // 检查检定牌堆是否为空，如果为空则洗牌
  if (newGs.inspectionDeck.length === 0) {
    newGs.inspectionDeck = shuffle([...newGs.inspectionDiscard]);
    newGs.inspectionDiscard = [];
  }
  // 翻开检定牌
  const drawnCard = newGs.inspectionDeck.shift();
  // 结算检定牌效果
  const L = [...(Array.isArray(newGs.log) ? newGs.log : [])];
  const P = [...newGs.players];
  L.push(`${P[playerIndex].name} 的SAN检定结果为"${drawnCard.name}"`);
  const killPlayer = (i) => {
    if (i == null || !P[i] || P[i].isDead) return;
    // 标记待播放死亡特效的角色（用于面板延迟置灰）
    P[i]._pendingAnimDeath = true;
    P[i].isDead = true;
    P[i].roleRevealed = true;
    L.push(`☠ ${P[i].name}（${P[i].role}）倒下了！`);
    if (P[i].hand?.length) {
      newGs.discard.push(...P[i].hand);
      P[i].hand = [];
    }
    if (P[i].godZone?.length) {
      newGs.discard.push(...P[i].godZone);
      P[i].godZone = [];
      P[i].godName = null;
      P[i].godLevel = 0;
    }
  };
  switch (drawnCard.effect) {
    case 'adjacentDamageHP': {
      // 相邻角色失去1HP
      const N = P.length;
      for (let i = 1; i <= N; i++) {
        const leftIdx = (playerIndex - i + N) % N;
        if (!P[leftIdx].isDead) {
          P[leftIdx].hp = Math.max(0, P[leftIdx].hp - drawnCard.value);
          L.push(`${P[leftIdx].name} 被乱抓，失去 ${drawnCard.value} HP`);
          if (P[leftIdx].hp <= 0) killPlayer(leftIdx);
          break;
        }
      }
      for (let i = 1; i <= N; i++) {
        const rightIdx = (playerIndex + i) % N;
        if (!P[rightIdx].isDead) {
          P[rightIdx].hp = Math.max(0, P[rightIdx].hp - drawnCard.value);
          L.push(`${P[rightIdx].name} 被乱抓，失去 ${drawnCard.value} HP`);
          if (P[rightIdx].hp <= 0) killPlayer(rightIdx);
          break;
        }
      }
      break;
    }
    case 'selfDamageHP': {
      // 失去1HP
      P[playerIndex].hp = Math.max(0, P[playerIndex].hp - drawnCard.value);
      L.push(`${P[playerIndex].name} 自残，失去 ${drawnCard.value} HP`);
      if (P[playerIndex].hp <= 0) killPlayer(playerIndex);
      break;
    }
    case 'disableRest': {
      // 下一回合禁用"休息"
      P[playerIndex].disableRestNextTurn = true;
      L.push(`${P[playerIndex].name} 失眠，下一回合禁用休息`);
      break;
    }
    case 'nothing': {
      // 什么也不做
      break;
    }
    case 'flip': {
      // 翻面
      P[playerIndex].isResting = !P[playerIndex].isResting;
      L.push(`${P[playerIndex].name} 昏睡，${P[playerIndex].isResting ? '翻面' : '醒来'}`);
      break;
    }
    case 'discardRandom': {
      // 随机弃一张牌
      if (P[playerIndex].hand.length > 0) {
        const randomIndex = Math.floor(Math.random() * P[playerIndex].hand.length);
        const discardedCard = P[playerIndex].hand.splice(randomIndex, 1)[0];
        newGs.discard.push(discardedCard);
        L.push(`${P[playerIndex].name} 迫害妄想，弃置了一张牌`);
      }
      break;
    }
    case 'disableSkill': {
      // 下一回合禁用技能
      P[playerIndex].disableSkillNextTurn = true;
      L.push(`${P[playerIndex].name} 失忆，下一回合禁用技能`);
      break;
    }
    case 'handLimitDecrease': {
      // 下一回合手牌上限-1
      P[playerIndex].handLimitDecreaseNextTurn = 1;
      L.push(`${P[playerIndex].name} 乏力，下一回合手牌上限-1`);
      break;
    }
    case 'healSAN': {
      // 恢复1SAN
      P[playerIndex].san = Math.min(10, P[playerIndex].san + drawnCard.value);
      L.push(`${P[playerIndex].name} 超人意志，恢复 ${drawnCard.value} SAN`);
      break;
    }
    case 'drawCard': {
      // 从牌堆摸一张牌
      if (newGs.deck.length === 0) {
        newGs.deck = shuffle([...newGs.discard]);
        newGs.discard = [];
      }
      if (newGs.deck.length > 0) {
        const newCard = newGs.deck.shift();
        P[playerIndex].hand.push(newCard);
        L.push(`${P[playerIndex].name} 揭开真相，摸到一张牌`);
      }
      break;
    }
    case 'sealLoosening': {
      // 连续翻出两次时邪神复活（无视SAN值条件）
      newGs.sealLooseningCount++;
      L.push(`${P[playerIndex].name} 感到封印松动`);
      if (newGs.sealLooseningCount >= 2) {
        // 邪神复活逻辑
        L.push('封印完全松动，邪神复活了！');
        // 这里可以添加邪神复活的具体逻辑
        newGs.sealLooseningCount = 0;
      }
      break;
    }
    case 'houndsOfTindalos': {
      // 廷达罗斯猎犬离开检定牌堆并沿场地奔跑，对第一个回合用时超过15秒的玩家造成4点HP伤害，之后返回检定牌堆
      newGs.houndsOfTindalosActive = true;
      newGs.houndsOfTindalosTarget = null;
      newGs.houndsOfTindalosElapsed = 0;
      L.push('廷达罗斯猎犬出现了！');
      break;
    }
  }
  const finalLog = drawnCard.effect === 'nothing'
    ? L.filter(line => line !== `${P[playerIndex].name} 获得暂时的平静`)
    : L;
  if (drawnCard.effect === 'houndsOfTindalos') {
    newGs.inspectionDiscard = [];
  } else {
    newGs.inspectionDeck = shuffle([...(newGs.inspectionDeck || []), drawnCard]);
    newGs.inspectionDiscard = [];
  }
  newGs._inspectionSeq = (gs?._inspectionSeq || 0) + 1;
  newGs._inspectionCard = drawnCard;
  newGs._inspectionTarget = playerIndex;
  newGs._inspectionPrevLogLen = beforeLogLen;
  newGs._inspectionBeforePlayers = beforePlayers;
  newGs._inspectionEvents = [
    ...((gs?._inspectionEvents) || []),
    {
      seq: newGs._inspectionSeq,
      card: drawnCard,
      target: playerIndex,
      prevLogLen: beforeLogLen,
      beforePlayers,
      beforeLog,
      afterPlayers: copyPlayers(P),
      afterLog: [...finalLog],
    }
  ];
  // 更新游戏状态
  newGs.players = P;
  newGs.log = finalLog;
  return newGs;
}

function mergeInspectionMeta(target, inspectionResult) {
  return {
    ...target,
    inspectionDeck: inspectionResult.inspectionDeck,
    inspectionDiscard: inspectionResult.inspectionDiscard,
    sealLooseningCount: inspectionResult.sealLooseningCount,
    houndsOfTindalosActive: inspectionResult.houndsOfTindalosActive,
    houndsOfTindalosTarget: inspectionResult.houndsOfTindalosTarget,
    houndsOfTindalosElapsed: inspectionResult.houndsOfTindalosElapsed,
    _inspectionSeq: inspectionResult._inspectionSeq,
    _inspectionCard: inspectionResult._inspectionCard,
    _inspectionTarget: inspectionResult._inspectionTarget,
    _inspectionPrevLogLen: inspectionResult._inspectionPrevLogLen,
    _inspectionBeforePlayers: inspectionResult._inspectionBeforePlayers,
    _inspectionEvents: inspectionResult._inspectionEvents,
  };
}

export function processInspectionTargets(targets, startIndex, P, D, Disc, baseLog, inspectionMeta) {
  let nextP = P, nextD = D, nextDisc = Disc, nextLog = [...baseLog], nextMeta = { ...inspectionMeta };
  const ordered = sortInspectionTargets(targets, startIndex, nextP.length || 1);
  for (const idx of ordered) {
    const inspectionResult = handleInspection(idx, {
      players: nextP,
      deck: nextD,
      discard: nextDisc,
      log: nextLog,
      inspectionDeck: nextMeta.inspectionDeck,
      inspectionDiscard: nextMeta.inspectionDiscard,
      sealLooseningCount: nextMeta.sealLooseningCount,
      houndsOfTindalosActive: nextMeta.houndsOfTindalosActive,
      houndsOfTindalosTarget: nextMeta.houndsOfTindalosTarget,
      houndsOfTindalosElapsed: nextMeta.houndsOfTindalosElapsed,
      _inspectionSeq: nextMeta._inspectionSeq,
    });
    nextP = inspectionResult.players;
    nextD = inspectionResult.deck;
    nextDisc = inspectionResult.discard;
    nextLog = inspectionResult.log || nextLog;
    nextMeta = mergeInspectionMeta(nextMeta, inspectionResult);
  }
  return { P: nextP, D: nextD, Disc: nextDisc, log: nextLog, inspectionMeta: nextMeta };
}

export function applyInspectionForSanLoss(targetIndex, newSan, startIndex, P, D, Disc, baseLog, inspectionMeta) {
  if (newSan > 6) return { P, D, Disc, log: baseLog, inspectionMeta };
  return processInspectionTargets([targetIndex], startIndex, P, D, Disc, baseLog, inspectionMeta);
}

// ══════════════════════════════════════════════════════════════
//  APPLY EFFECTS
// ══════════════════════════════════════════════════════════════

export function applyFx(card, ci, ti, ps, deck, disc, gs, avoidNegative = false, avoidNegativeFor = [], isAI = false) {
  let P = copyPlayers(ps), D = [...deck], Disc = [...disc], msgs = [];
  let statePatch = {};
  let inspectionMeta = makeInspectionMeta(gs);
  const pendingInspectionTargets = [];
  const dmgBonus = P[ci]?.damageBonus || 0;
  const healHP = (i, v) => { if (i == null || !P[i] || P[i].isDead) return; P[i].hp = clamp(P[i].hp + v); };
  const healSAN = (i, v) => { if (i == null || !P[i] || P[i].isDead) return; P[i].san = clamp(P[i].san + v); };
  const hurtHP = (i, v) => {
    if (i == null || !P[i] || P[i].isDead || (avoidNegative && i === ci) || avoidNegativeFor.includes(i)) return;
    applyHpDamageWithLink(P, i, v, Disc, msgs);
  };
  const hurtSAN = (i, v) => {
    if (i == null || !P[i] || P[i].isDead || (avoidNegative && i === ci) || avoidNegativeFor.includes(i)) return;
    P[i].san = clamp(P[i].san - v);
    const newSan = P[i].san;
    if (newSan <= 6) {
      pendingInspectionTargets.push(i);
    }
  };
  const dealHP = (i, v) => hurtHP(i, v + dmgBonus);
  const dealSAN = (i, v) => hurtSAN(i, v + dmgBonus);
  const randDiscard = (i, count = 1) => {
    if (i == null || !P[i] || (avoidNegative && i === ci) || avoidNegativeFor.includes(i)) return;
    for (let n = 0; n < count; n++) {
      if (P[i].hand.length) {
        const x = 0 | Math.random() * P[i].hand.length;
        const c = P[i].hand.splice(x, 1)[0];
        // 黑山羊幼仔被弃置时销毁，不进入弃牌堆
        if (isBlackGoatYoung(c)) {
          msgs.push(`${P[i].name} 的黑山羊幼仔被销毁`);
        } else if (c.type !== 'blankZone') {
          Disc.push(c);
          msgs.push(`${P[i].name} 失去了 ${cardLogText(c, { alwaysShowName: true })}`);
        } else {
          msgs.push(`${P[i].name} 的空白区域牌消失了`);
        }
      }
    }
  };
  const toggleRest = i => { if (i == null || !P[i] || P[i].isDead || (avoidNegative && i === ci) || avoidNegativeFor.includes(i)) return; P[i].isResting = !P[i].isResting; msgs.push(`${P[i].name}${P[i].isResting ? '进入' : '离开'}休息状态`); };
  const adjacent = getAdjacentTargets(P, ci);
  const others = P.map((_, i) => i).filter(i => i !== ci && !P[i].isDead);
  const allLiving = P.map((_, i) => i).filter(i => !P[i].isDead);
  const actor = P[ci];

  // 辅助函数：检查条件
  const checkCondition = (condType, condVal, actor) => {
    switch (condType) {
      case 'handHigh': return actor.hand.length >= condVal;
      case 'handLow': return actor.hand.length <= condVal;
      case 'hpLow': return actor.hp <= condVal;
      case 'sanHigh': return actor.san >= condVal;
      default: return false;
    }
  };

  // 辅助函数：应用条件伤害
  const applyConditionalDamage = (type, card) => {
    if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
      let totalDamage = card.val || 0;
      let bonusDamage = 0;
      const conditionMet = checkCondition(card.condType, card.condVal, actor);
      if (conditionMet) {
        bonusDamage = card.bonus || 0;
        totalDamage += bonusDamage;
      }
      const bonusText = bonusDamage > 0 ? `（其中${card.val}点基础伤害+${bonusDamage}点额外伤害）` : '';
      msgs.push(`${actor.name} 失去 ${totalDamage} ${type === 'hp' ? 'HP' : 'SAN'}${bonusText}`);
      if (type === 'hp') {
        hurtHP(ci, totalDamage);
      } else if (type === 'san') {
        hurtSAN(ci, totalDamage);
      }
    }
  };

  // 辅助函数：应用AOE伤害
  const applyAOEDamage = (targets, damageType, value, hpVal, sanVal) => {
    let affected = false;
    targets.forEach(i => {
      if (!avoidNegativeFor.includes(i) && (i !== ci || !avoidNegative)) affected = true;
    });
    if (affected) {
      if (hpVal && sanVal) {
        msgs.push(`${actor.name} 与相邻角色各失去 ${hpVal + dmgBonus} HP 和 ${sanVal} SAN`);
      } else {
        const damageDesc = damageType === 'hp' ? 'HP' : (damageType === 'san' ? 'SAN' : 'HP 和 SAN');
        msgs.push(`${actor.name} 与相邻角色各失去 ${value + dmgBonus} ${damageDesc}`);
      }
    }
    targets.forEach(i => {
      if (!avoidNegativeFor.includes(i)) {
        if (damageType === 'both' || damageType.includes('hp')) dealHP(i, hpVal || value);
        if (damageType === 'both' || damageType.includes('san')) dealSAN(i, sanVal || value);
      }
    });
  };

  // 辅助函数：应用全局AOE伤害
  const applyGlobalAOEDamage = (damageType, value) => {
    let affected = false;
    allLiving.forEach(i => {
      if (!avoidNegativeFor.includes(i) && (i !== ci || !avoidNegative)) affected = true;
    });
    if (affected) {
      const damageDesc = damageType === 'hp' ? 'HP' : (damageType === 'san' ? 'SAN' : 'HP 和 SAN');
      msgs.push(`全体存活角色失去 ${value + dmgBonus} ${damageDesc}`);
    }
    allLiving.forEach(i => {
      if (!avoidNegativeFor.includes(i)) {
        if (damageType === 'both' || damageType.includes('hp')) dealHP(i, value);
        if (damageType === 'both' || damageType.includes('san')) dealSAN(i, value);
      }
    });
  };

  // 辅助函数：自身先受伤，再对相邻角色造成伤害
  const applySelfAndAdjacentDamage = ({ selfHp = 0, selfSan = 0, adjHp = 0, adjSan = 0 }) => {
    const avoidSelf = avoidNegative || avoidNegativeFor.includes(ci);
    const adjacentTargets = getLivingAdjacentTargets(P, ci);
    if (!avoidSelf && selfHp && selfSan) {
      msgs.push(`${actor.name} 失去 ${selfHp} HP 和 ${selfSan} SAN`);
    } else if (!avoidSelf && selfHp) {
      msgs.push(`${actor.name} 失去 ${selfHp} HP`);
    } else if (!avoidSelf && selfSan) {
      msgs.push(`${actor.name} 失去 ${selfSan} SAN`);
    }
    if (!avoidSelf && selfHp) hurtHP(ci, selfHp);
    if (!avoidSelf && selfSan) hurtSAN(ci, selfSan);
    let adjacentAffected = false;
    adjacentTargets.forEach(i => {
      if (!avoidNegativeFor.includes(i)) {
        adjacentAffected = true;
        if (adjHp) dealHP(i, adjHp);
        if (adjSan) dealSAN(i, adjSan);
      }
    });
    if (adjacentAffected && adjHp && adjSan) {
      msgs.push(`${actor.name} 周围的角色各失去 ${adjHp + dmgBonus} HP 和 ${adjSan + dmgBonus} SAN`);
    } else if (adjacentAffected && adjHp) {
      msgs.push(`${actor.name} 周围的角色各失去 ${adjHp + dmgBonus} HP`);
    } else if (adjacentAffected && adjSan) {
      msgs.push(`${actor.name} 周围的角色各失去 ${adjSan + dmgBonus} SAN`);
    }
    return !avoidSelf || adjacentAffected;
  };
  const handlers = {
    selfHealHP: () => { healHP(ci, card.val); msgs.push(`${actor.name} 回复了 ${card.val} HP`); },
    selfHealSAN: () => { healSAN(ci, card.val); msgs.push(`${actor.name} 回复了 ${card.val} SAN`); },
    selfHealBoth: () => { healHP(ci, 1); healSAN(ci, 1); msgs.push(`${actor.name} 回复了 1 HP 和 1 SAN`); },
    selfHealBoth21: () => { healHP(ci, 2); healSAN(ci, 1); msgs.push(`${actor.name} 回复了 2 HP 和 1 SAN`); },
    selfHealAdjDamageHP: () => {
      healHP(ci, card.val);
      const adjacentTargets = getLivingAdjacentTargets(P, ci);
      adjacentTargets.forEach(i => dealHP(i, card.val));
      msgs.push(`${actor.name} 回复了 ${card.val} HP，相邻角色各失去 ${card.val + dmgBonus} HP`);
    },
    selfHealAdjHealHP: () => { healHP(ci, card.val); adjacent.filter(i => i !== ci).forEach(i => healHP(i, card.adjVal || 1)); msgs.push(`${actor.name} 回复了 ${card.val} HP，相邻角色各回复 ${card.adjVal || 1} HP`); },
    adjHealHP: () => { adjacent.forEach(i => healHP(i, card.val)); msgs.push(`${actor.name} 与相邻角色各回复 ${card.val} HP`); },
    selfRevealHandHP: () => { actor.hp = 10; actor.revealHand = true; actor.pickInsteadOfRandom = true; msgs.push(`${actor.name} HP 回满，手牌公开且盲抽改为挑选`); },
    selfRevealHandSAN: () => { actor.san = Math.min(10, actor.san + card.val); actor.revealHand = true; actor.pickInsteadOfRandom = true; msgs.push(`${actor.name} 回复 ${card.val} SAN，手牌公开且盲抽改为挑选`); },
    globalOnlySwap: () => { statePatch = { globalOnlySwapOwner: ci }; msgs.push(`直到 ${actor.name} 的下回合开始前，所有角色技能都视为"掉包"`); },
    selfDamageHP: () => { if (!avoidNegative && !avoidNegativeFor.includes(ci)) msgs.push(`${actor.name} 失去 ${card.val} HP`); hurtHP(ci, card.val); },
    selfDamageSAN: () => { hurtSAN(ci, card.val); if (!avoidNegative && !avoidNegativeFor.includes(ci)) msgs.push(`${actor.name} 失去 ${card.val} SAN`); },
    selfDamageHPCond: () => { applyConditionalDamage('hp', card); },
    selfDamageSANCond: () => { applyConditionalDamage('san', card); },
    selfDamageHPSAN: () => {
      const hv = card.hpVal || 0, sv = card.sanVal || 0;
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        msgs.push(`${actor.name} 失去 ${hv} HP 和 ${sv} SAN`);
        hurtHP(ci, hv);
        hurtSAN(ci, sv);
      }
    },
    selfDamageDiscardHP: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        msgs.push(`${actor.name} 失去 ${card.val} HP`);
        hurtHP(ci, card.val);
        randDiscard(ci, 1);
      }
    },
    selfDamageDiscardSAN: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        hurtSAN(ci, card.val);
        msgs.push(`${actor.name} 失去 ${card.val} SAN`);
        randDiscard(ci, 1);
      }
    },
    selfDamageRestHP: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        msgs.push(`${actor.name} 失去 ${card.val} HP`);
        hurtHP(ci, card.val);
        toggleRest(ci);
      }
    },
    selfDamageRestSAN: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        hurtSAN(ci, card.val);
        msgs.push(`${actor.name} 失去 ${card.val} SAN`);
        toggleRest(ci);
      }
    },
    adjDamageHP: () => { applyAOEDamage(adjacent, 'hp', card.val); },
    adjDamageSAN: () => { applyAOEDamage(adjacent, 'san', card.val); },
    adjDamageBoth: () => { applyAOEDamage(adjacent, 'both', card.val, card.hpVal, card.sanVal); },
    allDamageHP: () => { applyGlobalAOEDamage('hp', card.val); },
    allDamageSAN: () => { applyGlobalAOEDamage('san', card.val); },
    allDamageBoth: () => { applyGlobalAOEDamage('both', card.val); },
    adjRest: () => {
      adjacent.forEach(i => {
        if (!avoidNegativeFor.includes(i)) {
          toggleRest(i);
        }
      });
    },
    selfHealHPSelfDamageSAN: () => {
      healHP(ci, card.hpVal);
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        hurtSAN(ci, card.sanVal);
        msgs.push(`${actor.name} 回复 ${card.hpVal} HP，失去 ${card.sanVal} SAN`);
      } else {
        msgs.push(`${actor.name} 回复 ${card.hpVal} HP`);
      }
    },
    allDiscard: () => {
      allLiving.forEach(i => {
        if (!avoidNegativeFor.includes(i)) {
          randDiscard(i, 1);
        }
      });
      statePatch = { ...statePatch, _earthquakeSeq: (gs?._earthquakeSeq || 0) + 1 };
    },
    selfRenounceGod: () => {
      if (actor.godName) {
        if (actor.godZone?.length) Disc.push(...actor.godZone);
        actor.godZone = []; actor.godName = null; actor.godLevel = 0;
        msgs.push(`${actor.name} 放弃信仰`);
      }
    },
    sacHealHP: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        hurtSAN(ci, 1);
        msgs.push(`${actor.name} 失去 1 SAN`);
      }
      allLiving.forEach(i => healHP(i, card.val));
      msgs.push(`随后全体回复 ${card.val} HP`);
    },
    sacHealSelfSAN: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        msgs.push(`${actor.name} 失去 3 HP`);
        hurtHP(ci, 3);
      }
      healSAN(ci, card.val);
      msgs.push(`${actor.name} 回复 ${card.val} SAN`);
    },
    sacHealSelfSANCultist: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci) && actor.hasBelievedGod) {
        msgs.push(`${actor.name} 失去 3 HP`);
        hurtHP(ci, 3);
      }
      healSAN(ci, card.val);
      msgs.push(`${actor.name} 回复 ${card.val} SAN`);
    },
    selfDamageHPPeek: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        msgs.push(`${actor.name} 失去 ${card.val} HP`);
        hurtHP(ci, card.val);
      }
      {
        const validTargets = others.filter(i => !P[i].revealHand);
        if (validTargets.length > 0) {
          statePatch = { peekHandTargets: validTargets, peekHandSource: ci };
          msgs.push(`${actor.name} 准备偷看一名角色的手牌`);
        } else {
          msgs.push(`所有其他角色的手牌都已公开，无法偷看`);
        }
      }
    },
    swapAllHands: () => {
      const swapTarget = ti != null ? ti : others.reduce((best, i) => P[i].hand.length > P[best].hand.length ? i : best, others[0] ?? ci);
      if (swapTarget != null && swapTarget !== ci && P[swapTarget] && !P[swapTarget].isDead) {
        const myHand = [...P[ci].hand];
        P[ci].hand = [...P[swapTarget].hand];
        P[swapTarget].hand = myHand;
        msgs.push(`${actor.name} 与 ${P[swapTarget].name} 交换了全部手牌（${P[ci].hand.length} 张 ↔ ${P[swapTarget].hand.length} 张）`);
      } else {
        msgs.push(`${actor.name} 无法找到交换目标`);
      }
    },
    selfBerserk: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        hurtSAN(ci, 1);
        msgs.push(`${actor.name} 失去 1 SAN`);
      }
      P[ci].damageBonus = (P[ci].damageBonus || 0) + 1;
      msgs.push(`${actor.name} 本回合造成的伤害+1`);
    },
    selfDamageSkipDraw: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        if (P[ci] && !P[ci].isDead) {
          msgs.push(`${actor.name} 失去 ${card.val} HP`);
        }
        hurtHP(ci, card.val);
        if (P[ci] && !P[ci].isDead) {
          P[ci].skipNextDraw = true;
          msgs.push(`${actor.name} 下回合开始时不能摸牌`);
        }
      }
    },
    selfDamageAdjDamageBoth: () => {
      applySelfAndAdjacentDamage({
        selfHp: card.hpVal || 0,
        selfSan: card.sanVal || 0,
        adjHp: card.adjHpVal || 0,
        adjSan: card.adjSanVal || 0,
      });
    },
    selfDamageAdjDamageHP: () => {
      applySelfAndAdjacentDamage({
        selfHp: card.val || 0,
        adjHp: card.adjVal || 1,
      });
    },
    allDamageHPRandomExtra: () => {
      const avoidSelf = avoidNegative || avoidNegativeFor.includes(ci);
      const deferredGlobalLogs = [];
      const affectedTargets = P.map((p, i) => i).filter(i => !P[i].isDead && !avoidNegativeFor.includes(i) && !(avoidSelf && i === ci));
      affectedTargets.forEach(i => {
        const localMsgs = [];
        applyHpDamageWithLink(P, i, (card.val || 0) + dmgBonus, Disc, localMsgs);
        deferredGlobalLogs.push(...localMsgs);
      });
      if (affectedTargets.length) {
        if (avoidSelf && affectedTargets.length === allLiving.length - 1) {
          msgs.push(`除${actor.name}外，全体存活角色失去 ${card.val} HP`);
        } else {
          msgs.push(`全体存活角色失去 ${card.val} HP`);
        }
      }
      if (deferredGlobalLogs.length) msgs.push(...deferredGlobalLogs);
      const alivePlayers = P.map((p, i) => i).filter(i => !P[i].isDead && !avoidNegativeFor.includes(i) && !(avoidSelf && i === ci));
      if (alivePlayers.length > 0) {
        const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        const localMsgs = [];
        applyHpDamageWithLink(P, randomTarget, (card.val || 0) + dmgBonus, Disc, localMsgs);
        msgs.push(`${P[randomTarget].name} 额外失去 ${card.val} HP`);
        if (localMsgs.length) msgs.push(...localMsgs);
      }
    },
    damageLink: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        const validTargets = others.filter(i => !P[i].isDead);
        if (validTargets.length === 0) {
          msgs.push(`没有其他存活角色，无法架起链条`);
        } else {
          statePatch = { damageLinkTargets: validTargets, damageLinkSource: ci };
          msgs.push(`${actor.name} 准备使用两人一绳`);
        }
      }
    },
    caveDuel: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        const validTargets = others.filter(i => P[i].hand.length > 0);
        if (validTargets.length === 0) {
          msgs.push(`没有其他角色有手牌，无法进行穴居人战争`);
        } else {
          statePatch = { caveDuelTargets: validTargets, caveDuelSource: ci };
          msgs.push(`${actor.name} 准备进行穴居人战争`);
        }
      }
    },
    placeBlankZone: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        const blankZone = {
          id: `blank-${ci}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: '空白区域牌',
          key: 'BLANK',
          isZone: true,
          type: 'blankZone',
          desc: '可代表任意字母和数字组合'
        };
        if (!P[ci].zoneCards) P[ci].zoneCards = [];
        P[ci].zoneCards.push(blankZone);
        msgs.push(`${actor.name} 放置了一张空白区域牌`);
        if (P[ci].hand.length <= 3) {
          P[ci].hand.push(blankZone);
          P[ci].zoneCards.pop();
          msgs.push(`${actor.name} 手牌不大于3张，将空白区域牌收入手牌`);
        }
      }
    },
    revealTopCards: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        const revealedCards = [];
        const isZoneMatchKey = (card, key) => {
          if (!isZoneCard(card)) return false;
          return /^[A-Z]$/.test(key) ? card.letter === key : /^\d$/.test(key) ? String(card.number) === String(key) : false;
        };
        for (let i = 0; i < card.val && D.length > 0; i++) {
          revealedCards.push(D.shift());
        }
        if (revealedCards.length > 0) {
          msgs.push(`${actor.name} 展示了牌堆顶的 ${revealedCards.length} 张牌：${revealedCards.map(c => cardLogText(c)).join(' ')}`);
          const letterCountMap = {};
          const numberCountMap = {};
          P[ci].hand.forEach(card => {
            if (isZoneCard(card) && card.key) {
              const letter = card.key.match(/[A-Z]/);
              const number = card.key.match(/\d/);
              if (letter) {
                const l = letter[0];
                letterCountMap[l] = (letterCountMap[l] || 0) + 1;
              }
              if (number) {
                const n = number[0];
                numberCountMap[n] = (numberCountMap[n] || 0) + 1;
              }
            }
          });
          let maxLetterCount = 0;
          const maxLetters = [];
          Object.entries(letterCountMap).forEach(([key, count]) => {
            if (count > maxLetterCount) {
              maxLetterCount = count;
              maxLetters.length = 0;
              maxLetters.push(key);
            } else if (count === maxLetterCount) {
              maxLetters.push(key);
            }
          });
          let maxNumberCount = 0;
          const maxNumbers = [];
          Object.entries(numberCountMap).forEach(([key, count]) => {
            if (count > maxNumberCount) {
              maxNumberCount = count;
              maxNumbers.length = 0;
              maxNumbers.push(key);
            } else if (count === maxNumberCount) {
              maxNumbers.push(key);
            }
          });
          const selectableKeys = [];
          if (maxLetters.length > 0) selectableKeys.push(...maxLetters);
          if (maxNumbers.length > 0) selectableKeys.push(...maxNumbers);
          if (selectableKeys.length > 0) {
            if (isAI) {
              const selectedKey = selectableKeys[Math.floor(Math.random() * selectableKeys.length)];
              msgs.push(`${actor.name} 选择了编号 ${selectedKey}`);
              const matchedCards = revealedCards.filter(c => isZoneMatchKey(c, selectedKey));
              if (matchedCards.length > 0) {
                P[ci].hand.push(...matchedCards);
                msgs.push(`${actor.name} 收入了 ${matchedCards.length} 张编号为 ${selectedKey} 的牌`);
                const remainingCards = revealedCards.filter(c => !isZoneMatchKey(c, selectedKey));
                if (remainingCards.length > 0) {
                  Disc.push(...remainingCards);
                }
              } else {
                msgs.push(`展示的牌中没有编号为 ${selectedKey} 的牌`);
                Disc.push(...revealedCards);
              }
            } else {
              return {
                P,
                D,
                Disc,
                msgs,
                statePatch: {
                  abilityData: {
                    type: 'tortoiseOracleSelect',
                    playerIndex: ci,
                    revealedCards,
                    selectableKeys
                  }
                }
              };
            }
          } else {
            msgs.push(`${actor.name} 手中没有牌，无法选择编号`);
            Disc.push(...revealedCards);
          }
        } else {
          msgs.push(`牌堆已空，无法展示牌`);
        }
      }
    },
    firstComePick: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        const revealCount = P.filter(p => !p.isDead).length;
        const revealedCards = [];
        while (revealedCards.length < revealCount) {
          if (!D.length && Disc.length) {
            D = shuffle(Disc);
            Disc = [];
          }
          if (!D.length) break;
          revealedCards.push(D.shift());
        }
        if (revealedCards.length) {
          const pickOrder = getLivingPlayerOrder(P, ci);
          msgs.push(`${actor.name} 翻开了 ${revealedCards.length} 张牌：[${revealedCards.map(c => c.key || c.name).join('] [')}]`);
          msgs.push(`【先到先得】从 ${actor.name} 开始，每名存活角色依次挑选一张收入手牌`);
          statePatch = {
            ...statePatch,
            abilityData: {
              type: 'firstComePick',
              revealedCards,
              pickOrder,
              pickIndex: 0,
              pickSource: ci,
            }
          };
        }
      }
    },
    roseThornGiftAllHand: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        const validTargets = others.filter(i => !P[i].isDead);
        if (validTargets.length === 0) {
          msgs.push(`没有其他存活角色，无法施加玫瑰倒刺`);
        } else {
          statePatch = { ...statePatch, roseThornTargets: validTargets, roseThornSource: ci };
          msgs.push(`${actor.name} 准备使用玫瑰倒刺`);
        }
      }
    },
    reverseTurnOrder: () => {
      const currentDir = gs?.turnDirection || 1;
      const newDir = -currentDir;
      statePatch = { ...statePatch, turnDirection: newDir };
      msgs.push(`${actor.name} 打出【逆流】，回合轮换方向变为${newDir === 1 ? '顺时针' : '逆时针'}`);
    },
    allHealHPDamageSAN: () => {
      const healVal = card.hpVal || 2;
      const sanDmg = card.sanVal || 2;
      allLiving.forEach(i => healHP(i, healVal));
      msgs.push(`全体存活角色回复 ${healVal} HP`);
      allLiving.forEach(i => hurtSAN(i, sanDmg));
      msgs.push(`全体存活角色失去 ${sanDmg} SAN`);
    },
  };

  const handler = handlers[card.type];
  if (handler) {
    const earlyReturn = handler();
    if (earlyReturn) return earlyReturn;
  }
  if (pendingInspectionTargets.length) {
    const inspectionBaseLog = [...(Array.isArray(gs?.log) ? gs.log : []), ...msgs];
    const processed = processInspectionTargets(pendingInspectionTargets, gs?.currentTurn ?? ci, P, D, Disc, inspectionBaseLog, inspectionMeta);
    P = processed.P; D = processed.D; Disc = processed.Disc; inspectionMeta = processed.inspectionMeta;
    msgs = [...msgs, ...processed.log.slice(inspectionBaseLog.length)];
    statePatch = { ...statePatch, ...inspectionMeta };
  }
  return { P, D, Disc, msgs, statePatch };
}
