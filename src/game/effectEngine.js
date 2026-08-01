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
  isPositiveZoneCard,
  isNegativeZoneCard,
  isBlackGoatYoung,
  isTsathogguaSlime,
  makeInspectionMeta,
  sortInspectionTargets,
  tryVritraImmortal,
  appendEtherealizeLoss,
  buildEtherealizeLoss,
  buildEtherealizeRedirectDecision,
  buildTsathogguaSlimeBalanceDecision,
} from './coreUtils';
import { buildStatEvents } from './statEvents';
import { applyBalanceDiscardSideEffects } from './balanceCards';
import { makeProliferatingZState } from './proliferatingZ';
import { appendPublicCardGainTriggers } from './cardGainEvents';
import { createCardEffectEvent, createEarthquakeEvent } from './visualEvents';
import { createGeomagneticRestoreCard } from '../constants/card';
import {
  addTurnScopedDamageBonus,
  getCurrentExecutionTurnOwner,
  grantTurnScopedGodPowerImmunity,
} from './turnScopedEffects';

function cardContainsFireText(card) {
  if (!card) return false;
  const text = [
    card.name || '',
    card.subtitle || '',
    card.desc || '',
  ].join('').toLowerCase();
  return text.includes('火');
}

export function markSkipNextDraw(player, reason = '效果') {
  if (!player || player.isDead) return false;
  player.skipNextDraw = true;
  player.skipNextDrawReason = reason;
  return true;
}

function settleLethalHpDamage(P, i, Disc, L, currentTurn, D) {
  if (i == null || !P[i] || P[i].isDead || P[i].hp > 0) return false;
  if (currentTurn != null && D != null && tryVritraImmortal(P, i, currentTurn, D, Disc, L)) return false;
  killPlayerState(P, i, Disc, L);
  return true;
}

export function applyHpDamageWithLink(P, i, amount, Disc, L, currentTurn, D) {
  if (i == null || !P[i] || P[i].isDead || !(amount > 0)) return;
  P[i].hp = clamp(P[i].hp - amount);
  if (P[i].damageLink?.active) {
    const partnerIdx = P[i].damageLink.partner;
    if (partnerIdx != null && P[partnerIdx] && !P[partnerIdx].isDead) {
      if (P[i].hp <= 0) {
        const died = settleLethalHpDamage(P, i, Disc, L, currentTurn, D);
        if (died) {
          P[i]._pendingDamageLinkBreak = { sourceIdx: i, partnerIdx, sourceDead: true };
          return;
        }
      }
      // Damage reactions are ordered: the directly injured player may answer
      // with slime before the rope breaks. Store a serializable continuation;
      // the slime resolver will execute the break and feed its damage back
      // through the same reaction pipeline.
      const linkBreakHasEtherealize = [i, partnerIdx].some(idx => buildEtherealizeLoss({
        players: P,
        targetIdx: idx,
        currentTurn,
        lostHp: 3,
        source: '两人一绳',
      }));
      if ((P[i].hand || []).some(isTsathogguaSlime) || linkBreakHasEtherealize) {
        P[i]._pendingDamageLinkBreak = { sourceIdx: i, partnerIdx };
        return;
      }
      P[i].damageLink.active = false;
      if (P[partnerIdx].damageLink) P[partnerIdx].damageLink.active = false;
      const linkDamage = 3;
      P[i].hp = clamp(P[i].hp - linkDamage);
      P[partnerIdx].hp = clamp(P[partnerIdx].hp - linkDamage);
      L.push(`【两人一绳】绳索断裂！${P[i].name} 和 ${P[partnerIdx].name} 各失去 ${linkDamage} HP`);
      settleLethalHpDamage(P, i, Disc, L, currentTurn, D);
      settleLethalHpDamage(P, partnerIdx, Disc, L, currentTurn, D);
    }
  }
  settleLethalHpDamage(P, i, Disc, L, currentTurn, D);
}

export function resolvePendingDamageLinkBreak(P, targetIdx, Disc, L, currentTurn, D, continuation = {}) {
  const pending = P?.[targetIdx]?._pendingDamageLinkBreak;
  if (!pending) return { applied: false, beforePlayers: copyPlayers(P || []), affected: [] };
  delete P[targetIdx]._pendingDamageLinkBreak;
  const sourceIdx = pending.sourceIdx ?? targetIdx;
  const partnerIdx = pending.partnerIdx;
  const sourceDead = !!pending.sourceDead || !!P[sourceIdx]?.isDead;
  const beforePlayers = copyPlayers(P);
  if (!P[sourceIdx]?.damageLink?.active || partnerIdx == null || !P[partnerIdx] || P[partnerIdx].isDead) {
    return { applied: false, beforePlayers, affected: [] };
  }
  P[sourceIdx].damageLink.active = false;
  if (P[partnerIdx].damageLink) P[partnerIdx].damageLink.active = false;
  const linkDamage = 3;
  const orderedLosses = (sourceDead ? [partnerIdx] : [sourceIdx, partnerIdx]).map((idx, order) => ({
    targetIdx: idx,
    lostHp: linkDamage,
    lostSan: 0,
    source: '两人一绳',
    order,
  }));
  const pendingLosses = orderedLosses
    .map(loss => {
      const eligible = buildEtherealizeLoss({
        players: P,
        targetIdx: loss.targetIdx,
        currentTurn,
        lostHp: linkDamage,
        source: loss.source,
      });
      return eligible ? { ...eligible, order: loss.order } : null;
    })
    .filter(Boolean);
  if (pendingLosses.length) {
    const eligibleTargets = new Set(pendingLosses.map(loss => loss.targetIdx));
    const deferredDirectLosses = orderedLosses.filter(loss => !eligibleTargets.has(loss.targetIdx));
    L.push(sourceDead
      ? `【两人一绳】绳索断裂！${P[partnerIdx].name} 即将失去 ${linkDamage} HP`
      : `【两人一绳】绳索断裂！${P[sourceIdx].name} 和 ${P[partnerIdx].name} 即将各失去 ${linkDamage} HP`);
    return {
      applied: false,
      deferred: true,
      beforePlayers,
      affected: orderedLosses.map(loss => loss.targetIdx),
      etherealizeDecision: buildEtherealizeRedirectDecision(pendingLosses, {
        ...continuation,
        _turnOwner: currentTurn,
        ...(deferredDirectLosses.length ? { deferredDirectLosses } : {}),
      }),
    };
  }
  orderedLosses.forEach(loss => {
    P[loss.targetIdx].hp = clamp(P[loss.targetIdx].hp - linkDamage);
    settleLethalHpDamage(P, loss.targetIdx, Disc, L, currentTurn, D);
  });
  L.push(sourceDead
    ? `【两人一绳】绳索断裂！${P[partnerIdx].name} 失去 ${linkDamage} HP`
    : `【两人一绳】绳索断裂！${P[sourceIdx].name} 和 ${P[partnerIdx].name} 各失去 ${linkDamage} HP`);
  return { applied: true, beforePlayers, affected: orderedLosses.map(loss => loss.targetIdx) };
}

// Pure state-layer entry for damage. Callers provide only damage facts and
// continuation metadata; card/phase code remains responsible for presentation.
export function submitDamageEvents({
  players,
  deck = [],
  discard = [],
  log = [],
  currentTurn = null,
  events = [],
  continuation = {},
  skipEtherealize = false,
} = {}) {
  const P = players;
  const D = deck;
  const Disc = discard;
  const L = log;
  const normalized = (events || [])
    .map((event, order) => ({
      ...event,
      order: event?.order ?? order,
      lostHp: Math.max(0, event?.lostHp || 0),
      lostSan: Math.max(0, event?.lostSan || 0),
    }))
    .filter(event => event.targetIdx != null && P?.[event.targetIdx] && !P[event.targetIdx].isDead && (event.lostHp || event.lostSan));
  const beforePlayers = copyPlayers(P || []);
  if (!normalized.length) return { players: P, deck: D, discard: Disc, log: L, beforePlayers, phase: null, abilityData: null };

  if (!skipEtherealize) {
    const pendingLosses = normalized.map(event => {
      const loss = buildEtherealizeLoss({
        players: P,
        targetIdx: event.targetIdx,
        currentTurn,
        lostHp: event.lostHp,
        lostSan: event.lostSan,
        source: event.source || '伤害',
      });
      return loss ? { ...loss, order: event.order } : null;
    }).filter(Boolean);
    if (pendingLosses.length) {
      const pendingOrders = new Set(pendingLosses.map(loss => loss.order));
      const deferredDirectLosses = normalized.filter(event => !pendingOrders.has(event.order));
      const abilityData = buildEtherealizeRedirectDecision(pendingLosses, {
        ...continuation,
        _turnOwner: currentTurn,
        ...(deferredDirectLosses.length ? { deferredDirectLosses } : {}),
      });
      return { players: P, deck: D, discard: Disc, log: L, beforePlayers, phase: 'ETHEREALIZE_DECISION', abilityData };
    }
  }

  normalized.forEach(event => {
    // Combined damage has a fixed visible and rules order: HP first, then SAN.
    // If HP settlement kills the target, the later SAN loss no longer applies.
    if ((event.lostHp || 0) > 0) {
      applyHpDamageWithLink(P, event.targetIdx, event.lostHp, Disc, L, currentTurn, D);
    }
    if ((event.lostSan || 0) > 0 && P[event.targetIdx] && !P[event.targetIdx].isDead) {
      P[event.targetIdx].san = clamp(P[event.targetIdx].san - event.lostSan);
    }
  });

  const pendingLinkTarget = P.findIndex(player => (
    player?._pendingDamageLinkBreak && !(player.hand || []).some(isTsathogguaSlime)
  ));
  if (pendingLinkTarget >= 0) {
    const reaction = resolvePendingDamageLinkBreak(P, pendingLinkTarget, Disc, L, currentTurn, D, continuation);
    if (reaction.etherealizeDecision) {
      return {
        players: P, deck: D, discard: Disc, log: L, beforePlayers,
        phase: 'ETHEREALIZE_DECISION', abilityData: reaction.etherealizeDecision,
      };
    }
  }

  const abilityData = buildTsathogguaSlimeBalanceDecision(beforePlayers, P, {
    ...continuation,
    _turnOwner: currentTurn,
  });
  return {
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    beforePlayers,
    phase: abilityData ? 'TSG_SLIME_BALANCE' : null,
    abilityData,
  };
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

function getLivingCircularDistance(players, fromIdx, toIdx) {
  const order = getLivingPlayerOrder(players || [], fromIdx);
  const fromPos = order.indexOf(fromIdx);
  const toPos = order.indexOf(toIdx);
  if (fromPos < 0 || toPos < 0) return Infinity;
  const diff = Math.abs(fromPos - toPos);
  return Math.min(diff, order.length - diff);
}

function appendRandomTargetEvent(statePatch, gs, event) {
  const seq = (gs?._randomTargetSeq || 0) + 1 + (statePatch?._randomTargetEvents?.length || 0);
  return {
    ...statePatch,
    _randomTargetSeq: seq,
    _randomTargetEvents: [
      ...(statePatch?._randomTargetEvents || []),
      { ...event, seq },
    ],
  };
}

function appendPetrifyEvent(statePatch, gs, event) {
  const seq = (gs?._petrifySeq || 0) + 1 + (statePatch?._petrifyEvents?.length || 0);
  return {
    ...statePatch,
    _petrifySeq: seq,
    _petrifyEvents: [
      ...((gs?._petrifyEvents) || []),
      ...((statePatch?._petrifyEvents) || []),
      { ...event, seq },
    ],
  };
}

// ══════════════════════════════════════════════════════════════
//  INSPECTION SYSTEM
// ══════════════════════════════════════════════════════════════

function handleInspection(playerIndex, gs) {
  let newGs = { ...gs };
  const beforePlayers = copyPlayers(gs.players || []);
  const beforeLog = [...(Array.isArray(gs.log) ? gs.log : [])];
  const beforeDiscard = [...(Array.isArray(gs.discard) ? gs.discard : [])];
  const beforeLogLen = Array.isArray(gs.log) ? gs.log.length : 0;
  let gainedCard = null;
  let gainedCardLog = null;
  let inspectionDamageDecision = null;
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
    if (newGs.currentTurn != null && newGs.deck != null && tryVritraImmortal(P, i, newGs.currentTurn, newGs.deck, newGs.discard, L)) {
      return;
    }
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
      const targets = getLivingAdjacentTargets(P, playerIndex);
      inspectionDamageDecision = submitDamageEvents({
        players: P,
        deck: newGs.deck,
        discard: newGs.discard,
        log: L,
        currentTurn: newGs.currentTurn,
        events: targets.map((idx, order) => ({
          targetIdx: idx, lostHp: drawnCard.value, source: drawnCard.name || '乱抓', order,
        })),
      });
      if (inspectionDamageDecision.phase === 'ETHEREALIZE_DECISION') {
        targets.forEach(idx => L.push(`${P[idx].name} 即将因乱抓失去 ${drawnCard.value} HP`));
        break;
      }
      targets.forEach(idx => {
        L.push(`${P[idx].name} 被乱抓，失去 ${drawnCard.value} HP`);
        if (P[idx].hp <= 0 && !inspectionDamageDecision.abilityData) killPlayer(idx);
      });
      break;
    }
    case 'selfDamageHP': {
      inspectionDamageDecision = submitDamageEvents({
        players: P,
        deck: newGs.deck,
        discard: newGs.discard,
        log: L,
        currentTurn: newGs.currentTurn,
        events: [{ targetIdx: playerIndex, lostHp: drawnCard.value, source: drawnCard.name || '自残' }],
      });
      if (inspectionDamageDecision.phase === 'ETHEREALIZE_DECISION') {
        L.push(`${P[playerIndex].name} 即将因自残失去 ${drawnCard.value} HP`);
        break;
      }
      L.push(`${P[playerIndex].name} 自残，失去 ${drawnCard.value} HP`);
      if (P[playerIndex].hp <= 0 && !inspectionDamageDecision.abilityData) killPlayer(playerIndex);
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
      // 恢复 1 SAN
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
        // “直接摸牌”是暗抽：事件与公开日志都不能携带牌面信息。
        // 动画只需要一张牌背占位符；真正的牌仅存在于摸牌者的手牌中。
        gainedCard = { id: `hidden-inspection-draw-${newGs._inspectionSeq || 0}-${playerIndex}`, hiddenDraw: true };
        gainedCardLog = `${P[playerIndex].name} 揭开真相，直接摸1张牌收入手牌（不触发效果）`;
        L.push(gainedCardLog);
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
  const afterPlayers = copyPlayers(P);
  const afterDiscard = [...(Array.isArray(newGs.discard) ? newGs.discard : [])];
  const statEventSeq = (gs?._statEventSeq || 0) + 1;
  const statEvents = buildStatEvents(beforePlayers, afterPlayers, finalLog.slice(beforeLogLen), {
    reason: drawnCard.name || 'SAN检定',
    seq: statEventSeq,
  });
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
  newGs._statEventSeq = statEvents.length ? statEventSeq : (gs?._statEventSeq || 0);
  newGs._statEvents = [
    ...((gs?._statEvents) || []),
    ...statEvents,
  ];
  newGs._inspectionEvents = [
    ...((gs?._inspectionEvents) || []),
    {
      seq: newGs._inspectionSeq,
      card: drawnCard,
      target: playerIndex,
      prevLogLen: beforeLogLen,
      beforePlayers,
      beforeLog,
      beforeDiscard,
      beforeStatEventSeq: gs?._statEventSeq || 0,
      afterPlayers,
      afterLog: [...finalLog],
      afterDiscard,
      statEvents,
      statEventSeq: statEvents.length ? statEventSeq : null,
      ...(gainedCard ? { gainedCard, gainedCardLog } : {}),
    }
  ];
  // 更新游戏状态
  newGs.players = P;
  newGs.log = finalLog;
  if (inspectionDamageDecision?.phase) {
    newGs.phase = inspectionDamageDecision.phase;
    newGs.abilityData = { ...(newGs.abilityData || {}), ...inspectionDamageDecision.abilityData };
  }
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
    _statEvents: inspectionResult._statEvents,
    _statEventSeq: inspectionResult._statEventSeq,
    ...(['TSG_SLIME_BALANCE', 'ETHEREALIZE_DECISION'].includes(inspectionResult.phase) ? { phase: inspectionResult.phase } : {}),
    ...(inspectionResult.abilityData ? { abilityData: inspectionResult.abilityData } : {}),
  };
}

export function processInspectionTargets(targets, startIndex, P, D, Disc, baseLog, inspectionMeta) {
  let nextP = P, nextD = D, nextDisc = Disc, nextLog = [...baseLog], nextMeta = { ...inspectionMeta };
  const ordered = sortInspectionTargets(targets, startIndex, nextP.length || 1);
  for (let orderIndex = 0; orderIndex < ordered.length; orderIndex += 1) {
    const idx = ordered[orderIndex];
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
      _inspectionEvents: nextMeta._inspectionEvents,
      _statEvents: nextMeta._statEvents,
      _statEventSeq: nextMeta._statEventSeq,
      currentTurn: startIndex,
    });
    nextP = inspectionResult.players;
    nextD = inspectionResult.deck;
    nextDisc = inspectionResult.discard;
    nextLog = inspectionResult.log || nextLog;
    nextMeta = mergeInspectionMeta(nextMeta, inspectionResult);
    if (nextMeta.abilityData?.type && orderIndex < ordered.length - 1) {
      nextMeta = {
        ...nextMeta,
        abilityData: {
          ...nextMeta.abilityData,
          pendingInspectionContinuation: {
            targets: ordered.slice(orderIndex + 1),
            startIndex,
          },
        },
      };
      break;
    }
  }
  return { P: nextP, D: nextD, Disc: nextDisc, log: nextLog, inspectionMeta: nextMeta };
}

export function applyInspectionForSanLoss(targetIndex, newSan, startIndex, P, D, Disc, baseLog, inspectionMeta) {
  if (newSan > 6 || newSan <= 0) return { P, D, Disc, log: baseLog, inspectionMeta };
  return processInspectionTargets([targetIndex], startIndex, P, D, Disc, baseLog, inspectionMeta);
}

// ══════════════════════════════════════════════════════════════
//  APPLY EFFECTS
// ══════════════════════════════════════════════════════════════

export function applyFx(card, ci, ti, ps, deck, disc, gs, avoidNegative = false, avoidNegativeFor = [], isAI = false) {
  let P = copyPlayers(ps), D = [...deck], Disc = [...disc], msgs = [];
  const beforePlayers = copyPlayers(P);
  let statePatch = {};
  let inspectionMeta = makeInspectionMeta(gs);
  const pendingInspectionTargets = [];
  let pendingEtherealizeLosses = [];
  let deferredDirectLosses = [];
  let pendingDamages = [];
  let damageOrderSeq = 0;
  let directStatEvents = null;
  const executionTurnOwner = getCurrentExecutionTurnOwner(gs, ci);
  const dmgBonus = P[ci]?.damageBonus || 0;
  const healHP = (i, v) => { if (i == null || !P[i] || P[i].isDead) return; P[i].hp = clamp(P[i].hp + v); };
  const healSAN = (i, v) => { if (i == null || !P[i] || P[i].isDead) return; P[i].san = clamp(P[i].san + v); };
  // 伤害不再立即结算，而是先进入待结算队列：
  // - 'eager' 模式立即逐条结算（虚化候选仍转入决策），供效果中途依赖结算后状态的场景使用；
  // - 'batch' 模式在效果结束时统一处理：一旦存在虚化候选（伤害前置事件），
  //   其余直接伤害也一并延迟（deferredDirectLosses），待决策链结束后归并结算。
  const settlePendingDamages = (mode = 'batch') => {
    if (!pendingDamages.length) return;
    const batch = pendingDamages;
    pendingDamages = [];
    const deferredEligible = mode === 'batch'
      ? batch.map(d => buildEtherealizeLoss({
        players: P,
        targetIdx: d.targetIdx,
        currentTurn: gs?.currentTurn,
        lostHp: d.kind === 'hp' ? d.amount : 0,
        lostSan: d.kind === 'san' ? d.amount : 0,
        source: d.source,
      }))
      : null;
    const deferDirect = mode === 'batch' && (
      pendingEtherealizeLosses.length > 0 || deferredEligible.some(Boolean)
    );
    batch.forEach((d, batchIdx) => {
      if (!P[d.targetIdx] || P[d.targetIdx].isDead) return;
      const etherealizeLoss = mode === 'eager'
        ? buildEtherealizeLoss({
          players: P,
          targetIdx: d.targetIdx,
          currentTurn: gs?.currentTurn,
          lostHp: d.kind === 'hp' ? d.amount : 0,
          lostSan: d.kind === 'san' ? d.amount : 0,
          source: d.source,
        })
        : deferredEligible[batchIdx];
      if (etherealizeLoss) {
        pendingEtherealizeLosses = appendEtherealizeLoss(pendingEtherealizeLosses, { ...etherealizeLoss, order: d.order });
        return;
      }
      if (deferDirect) {
        deferredDirectLosses = appendEtherealizeLoss(deferredDirectLosses, {
          targetIdx: d.targetIdx,
          lostHp: d.kind === 'hp' ? d.amount : 0,
          lostSan: d.kind === 'san' ? d.amount : 0,
          source: d.source,
          order: d.order,
        });
        return;
      }
      if (d.kind === 'hp') {
        applyHpDamageWithLink(P, d.targetIdx, d.amount, Disc, d.msgsTarget, gs?.currentTurn, D);
      } else {
        P[d.targetIdx].san = clamp(P[d.targetIdx].san - d.amount);
        const newSan = P[d.targetIdx].san;
        if (newSan > 0 && newSan <= 6) {
          pendingInspectionTargets.push(d.targetIdx);
        }
      }
    });
  };
  const hurtHPDirect = (i, v, targetMsgs = msgs, source = card?.name || card?.type || 'HP') => {
    if (i == null || !P[i] || P[i].isDead || (avoidNegative && i === ci) || avoidNegativeFor.includes(i)) return;
    pendingDamages.push({ kind: 'hp', targetIdx: i, amount: v, source, msgsTarget: targetMsgs, order: damageOrderSeq++ });
  };
  const hurtHP = (i, v) => hurtHPDirect(i, v, msgs);
  const hurtSAN = (i, v) => {
    if (i == null || !P[i] || P[i].isDead || (avoidNegative && i === ci) || avoidNegativeFor.includes(i)) return;
    pendingDamages.push({ kind: 'san', targetIdx: i, amount: v, source: card?.name || card?.type || 'SAN', msgsTarget: msgs, order: damageOrderSeq++ });
  };
  const dealHP = (i, v) => hurtHP(i, v + dmgBonus);
  const dealSAN = (i, v) => hurtSAN(i, v + dmgBonus);
  const randDiscard = (i, count = 1) => {
    const discardEvents = [];
    if (i == null || !P[i] || (avoidNegative && i === ci) || avoidNegativeFor.includes(i)) return discardEvents;
    for (let n = 0; n < count; n++) {
      if (P[i].hand.length) {
        const x = 0 | Math.random() * P[i].hand.length;
        const c = P[i].hand.splice(x, 1)[0];
        // 黑山羊幼仔被弃置时销毁，不进入弃牌堆
        if (isBlackGoatYoung(c) || isTsathogguaSlime(c)) {
          msgs.push(`${P[i].name} 的衍生牌被销毁`);
        } else if (c.type !== 'blankZone') {
          Disc.push(c);
          msgs.push(`${P[i].name} 失去了 ${cardLogText(c, { alwaysShowName: true })}`);
          const balance = applyBalanceDiscardSideEffects({ players: P, deck: D, discard: Disc, log: msgs, ownerIdx: i, cards: [c], reason: '失去手牌', applyHpDamage: applyHpDamageWithLink, submitDamage: submitDamageEvents, currentTurn: gs?.currentTurn });
          msgs.splice(0, msgs.length, ...balance.log);
          (balance.etherealizeDecision?.pendingLosses || []).forEach(loss => {
            pendingEtherealizeLosses = appendEtherealizeLoss(pendingEtherealizeLosses, { ...loss, order: damageOrderSeq++ });
          });
          discardEvents.push({
            playerIndex: i,
            card: c,
            afterPlayers: copyPlayers(P),
            afterDiscard: [...Disc],
          });
        } else {
          msgs.push(`${P[i].name} 的空白区域牌消失了`);
        }
      }
    }
    return discardEvents;
  };
  const appendForcedRandomDiscardEvent = (beforeForcedPlayers, beforeForcedDiscard, discardEvents) => {
    if (!discardEvents.length) return;
    const event = createCardEffectEvent({
      effectKey: 'forcedRandomDiscard',
      card,
      actorIdx: ci,
      beforePlayers: beforeForcedPlayers,
      beforeDiscard: beforeForcedDiscard,
      afterPlayers: copyPlayers(P),
      afterDiscard: [...Disc],
      discardEvents,
      msgs: msgs.slice(),
    });
    if (event) {
      statePatch = {
        ...statePatch,
        _visualEvents: [...(statePatch._visualEvents || []), event],
      };
    }
  };
  const toggleRest = i => { if (i == null || !P[i] || P[i].isDead || (avoidNegative && i === ci) || avoidNegativeFor.includes(i)) return; P[i].isResting = !P[i].isResting; msgs.push(`${P[i].name}${P[i].isResting ? '进入' : '离开'}休息状态`); };
  const adjacent = getAdjacentTargets(P, ci);
  const others = P.map((_, i) => i).filter(i => i !== ci && !P[i].isDead);
  const allLiving = P.map((_, i) => i).filter(i => !P[i].isDead);
  const actor = P[ci];
  const buildChainEtherealizeDecision = () => {
    const decision = buildEtherealizeRedirectDecision(pendingEtherealizeLosses, { _turnOwner: gs?.currentTurn ?? ci });
    if (decision && deferredDirectLosses.length) {
      return { ...decision, deferredDirectLosses };
    }
    return decision;
  };
  const finish = (result, explicitStatEvents = null) => {
    settlePendingDamages('batch');
    let linkEtherealizeDecision = null;
    const pendingLinkTarget = (result.P || P).findIndex(player => (
      player?._pendingDamageLinkBreak && !(player.hand || []).some(isTsathogguaSlime)
    ));
    if (pendingLinkTarget >= 0) {
      const reaction = resolvePendingDamageLinkBreak(
        result.P || P,
        pendingLinkTarget,
        result.Disc || Disc,
        result.msgs || msgs,
        gs?.currentTurn ?? ci,
        result.D || D,
      );
      linkEtherealizeDecision = reaction.etherealizeDecision || null;
    }
    const statEventSeq = (gs?._statEventSeq || 0) + 1;
    const statEvents = explicitStatEvents || buildStatEvents(beforePlayers, result.P || P, result.msgs || msgs, { reason: card?.name || card?.type || '', seq: statEventSeq });
    const patchedStatEvents = Array.isArray(result.statePatch?._statEvents)
      ? result.statePatch._statEvents
      : [];
    const mergedStatEvents = patchedStatEvents.length
      ? [...statEvents, ...patchedStatEvents.filter(event => !statEvents.some(own => own?.seq === event?.seq && own?.type === event?.type && own?.target === event?.target))]
      : statEvents;
    const mergedStatEventSeq = Math.max(
      statEvents.length ? statEventSeq : (gs?._statEventSeq || 0),
      result.statePatch?._statEventSeq || 0,
    );
    const etherealizeDecision = statePatch?.abilityData?.type
      ? null
      : (linkEtherealizeDecision || buildChainEtherealizeDecision());
    const slimeDecision = etherealizeDecision || statePatch?.abilityData?.type
      ? null
      : buildTsathogguaSlimeBalanceDecision(beforePlayers, result.P || P, { _turnOwner: gs?.currentTurn ?? ci });
    const nextStatePatch = {
      ...(result.statePatch || {}),
      ...(etherealizeDecision ? { abilityData: etherealizeDecision } : {}),
      ...(slimeDecision ? { abilityData: slimeDecision } : {}),
      ...(mergedStatEvents.length ? { _statEvents: mergedStatEvents, _statEventSeq: mergedStatEventSeq } : {}),
    };
    return {
      ...result,
      statePatch: nextStatePatch,
      ...(mergedStatEvents.length ? { statEvents: mergedStatEvents } : {}),
    };
  };

  const playerStats = player => ({
    hp: player?.hp ?? 0,
    san: player?.san ?? 0,
    isDead: !!player?.isDead,
  });
  const killPlayerByPetrification = (idx) => {
    if (idx == null || !P[idx] || P[idx].isDead) return;
    const target = P[idx];
    target._pendingAnimDeath = true;
    target._petrified = true;
    target.isDead = true;
    target.roleRevealed = true;
    msgs.push(`☠ ${target.name}（${target.role}）被石化了！`);
    const kept = [];
    let destroyed = 0;
    (target.hand || []).forEach(handCard => {
      if (isBlackGoatYoung(handCard) || isTsathogguaSlime(handCard)) {
        destroyed += 1;
      } else if (handCard.type !== 'blankZone') {
        kept.push(handCard);
      }
    });
    if (kept.length) Disc.push(...kept);
    if (destroyed) msgs.push(`${target.name} 的 ${destroyed} 张衍生牌被销毁`);
    target.hand = [];
    if (target.godZone?.length) {
      Disc.push(...target.godZone);
      target.godZone = [];
      target.godName = null;
      target.godLevel = 0;
    }
  };
  const hasLivingSanDepleted = players => players.some(p => p && !p.isDead && p.hp > 0 && p.san <= 0);

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
    const affectedTargets = targets.filter(i => !avoidNegativeFor.includes(i) && (i !== ci || !avoidNegative));
    const selfAvoided = targets.includes(ci) && !affectedTargets.includes(ci) && (avoidNegative || avoidNegativeFor.includes(ci));
    if (affectedTargets.length) {
      const subject = selfAvoided ? '相邻角色' : `${actor.name} 与相邻角色`;
      if (hpVal && sanVal) {
        msgs.push(`${subject}各失去 ${hpVal + dmgBonus} HP 和 ${sanVal} SAN`);
      } else {
        const damageDesc = damageType === 'hp' ? 'HP' : (damageType === 'san' ? 'SAN' : 'HP 和 SAN');
        msgs.push(`${subject}各失去 ${value + dmgBonus} ${damageDesc}`);
      }
    }
    targets.forEach(i => {
      if (!avoidNegativeFor.includes(i) && (i !== ci || !avoidNegative)) {
        if (damageType === 'both' || damageType.includes('hp')) dealHP(i, hpVal || value);
        if (damageType === 'both' || damageType.includes('san')) dealSAN(i, sanVal || value);
      }
    });
  };

  // 辅助函数：应用全局AOE伤害
  const applyGlobalAOEDamage = (damageType, value) => {
    const affectedTargets = allLiving.filter(i => !avoidNegativeFor.includes(i) && (i !== ci || !avoidNegative));
    const selfAvoided = allLiving.includes(ci) && !affectedTargets.includes(ci) && (avoidNegative || avoidNegativeFor.includes(ci));
    if (affectedTargets.length) {
      const damageDesc = damageType === 'hp' ? 'HP' : (damageType === 'san' ? 'SAN' : 'HP 和 SAN');
      msgs.push(`${selfAvoided ? `除${actor.name}外，` : ''}全体存活角色失去 ${value + dmgBonus} ${damageDesc}`);
    }
    allLiving.forEach(i => {
      if (!avoidNegativeFor.includes(i) && (i !== ci || !avoidNegative)) {
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
    lifeBalance: () => { healHP(ci, card.val || 3); msgs.push(`${actor.name} 回复了 ${card.val || 3} HP`); },
    soulBalance: () => { healSAN(ci, card.val || 3); msgs.push(`${actor.name} 回复了 ${card.val || 3} SAN`); },
    blindFish: () => {
      const amount = card.val || 3;
      healHP(ci, amount);
      actor.blindNextZoneDecision = true;
      msgs.push(`${actor.name} 回复了 ${amount} HP，下一张区域牌只能看见编号后决定是否收入`);
    },
    proliferatingZ: () => {
      statePatch = { ...statePatch, proliferatingZ: makeProliferatingZState(executionTurnOwner, gs?.turn || 0), proliferatingZQueue: [] };
      msgs.push(`【增殖的Z】本回合若有其他角色获得邪神牌或其衍生牌，你摸1张牌`);
    },
    petrifyingFormula: () => {
      const priorState = gs?.petrifyingFormula || {};
      const accomplices = new Set(Array.isArray(priorState.accomplices) ? priorState.accomplices : []);
      accomplices.add(ci);
      const priorProgress = Number.isFinite(priorState.progress) ? priorState.progress : 4;
      const progress = Math.max(1, priorProgress - 1);
      statePatch = {
        ...statePatch,
        petrifyingFormula: {
          active: true,
          progress,
          accomplices: [...accomplices],
        },
      };
      msgs.push(`【石化配方】${actor.name} 协助调配药水，调配进度降至 ${progress}`);
      if (progress > 1) return;

      const candidates = P.map((p, i) => ({ player: p, idx: i }))
        .filter(item => item.player && !item.player.isDead);
      if (!candidates.length) {
        statePatch = {
          ...statePatch,
          petrifyingFormula: { active: false, progress: null, accomplices: [] },
        };
        return;
      }
      const minHp = Math.min(...candidates.map(item => item.player.hp));
      const targetIdx = candidates.find(item => item.player.hp === minHp)?.idx;
      const beforePetrifyTarget = { ...P[targetIdx] };
      killPlayerByPetrification(targetIdx);
      msgs.push(`【石化配方】场上 HP 最低的 ${beforePetrifyTarget.name} 立即死亡并石化`);

      const beforeAccomplicePlayers = copyPlayers(P);
      const livingAccomplices = [...accomplices].filter(idx => P[idx] && !P[idx].isDead);
      const sanEvents = [];
      const accompliceDamage = submitDamageEvents({
        players: P, deck: D, discard: Disc, log: msgs, currentTurn: gs?.currentTurn,
        events: livingAccomplices.map((idx, order) => ({
          targetIdx: idx, lostSan: 1, source: card?.name || '石化配方', order,
        })),
      });
      livingAccomplices.forEach(idx => {
        msgs.push(`【石化配方】共犯 ${P[idx].name} ${accompliceDamage.phase === 'ETHEREALIZE_DECISION' ? '即将失去' : '失去'} 1 SAN`);
        if (!accompliceDamage.abilityData) {
          sanEvents.push(idx);
          if (P[idx].san > 0 && P[idx].san <= 6) pendingInspectionTargets.push(idx);
        }
      });
      if (accompliceDamage.phase) statePatch = { ...statePatch, phase: accompliceDamage.phase, abilityData: accompliceDamage.abilityData };
      statePatch = {
        ...statePatch,
        petrifyingFormula: { active: false, progress: null, accomplices: [] },
      };
      statePatch = appendPetrifyEvent(statePatch, gs, {
        targetIdx,
        targetName: beforePetrifyTarget.name,
        accomplices: [...accomplices],
      });
      const seq = (gs?._statEventSeq || 0) + 1;
      directStatEvents = [
        {
          type: 'PETRIFY_DEATH',
          target: targetIdx,
          from: playerStats(beforePetrifyTarget),
          to: playerStats(P[targetIdx]),
          reason: card?.name || card?.type || '',
          seq,
          phaseOrder: 0,
        },
        ...sanEvents.map(idx => ({
          type: 'SAN_LOSS',
          target: idx,
          from: playerStats(beforeAccomplicePlayers[idx]),
          to: playerStats(P[idx]),
          reason: card?.name || card?.type || '',
          seq,
          phaseOrder: 1,
        })),
      ];
    },
    decipherStoneCarving: () => {
      const revealCount = Math.min(3, D.length);
      const revealedCards = [];
      for (let i = 0; i < revealCount; i++) {
        revealedCards.push(D.shift());
      }
      if (revealedCards.length === 0) {
        msgs.push('牌堆已空，无法解读石刻');
        return;
      }
      msgs.push(`${actor.name} 解读石刻，翻开了牌堆顶的 ${revealedCards.length} 张牌`);
      if (isAI) {
        // AI 策略：优先选非邪神牌中评分最高的；若没有则选邪神牌并承受 SAN 损失
        const sorted = [...revealedCards].map((c, i) => ({ card: c, originalIdx: i })).sort((a, b) => {
          const scoreA = a.card.isGod ? -10 : (isPositiveZoneCard(a.card) ? 5 : (isNegativeZoneCard(a.card) ? 2 : 3));
          const scoreB = b.card.isGod ? -10 : (isPositiveZoneCard(b.card) ? 5 : (isNegativeZoneCard(b.card) ? 2 : 3));
          return scoreB - scoreA;
        });
        const chosen = sorted[0];
        const remaining = revealedCards.filter(c => c.id !== chosen.card.id);
        P[ci].hand.push(chosen.card);
        msgs.push(`【解读石刻】${actor.name} 选择了 ${cardLogText(chosen.card, { alwaysShowName: true })} 收入手牌`);
        statePatch = { ...statePatch, ...appendPublicCardGainTriggers({ ...gs, ...statePatch }, P, ci, chosen.card) };
        if (chosen.card.isGod) {
          msgs.push(`【解读石刻】${actor.name} 因选择邪神牌失去 1 SAN`);
          P[ci].san = clamp(P[ci].san - 1);
          if (P[ci].san > 0 && P[ci].san <= 6) pendingInspectionTargets.push(ci);
        }
        // 剩余牌：AI 简单策略——非收入牌一半放牌堆顶，一半放牌堆底
        const mid = Math.ceil(remaining.length / 2);
        const topCards = remaining.slice(0, mid);
        const bottomCards = remaining.slice(mid);
        D.unshift(...topCards);
        D.push(...bottomCards);
        if (topCards.length) msgs.push(`【解读石刻】${topCards.length} 张牌放回牌堆顶`);
        if (bottomCards.length) msgs.push(`【解读石刻】${bottomCards.length} 张牌放到牌堆底`);
      } else {
        return {
          P, D, Disc,
          msgs,
          statePatch: {
            abilityData: {
              type: 'decipherStoneCarving',
              playerIndex: ci,
              revealedCards,
              handCard: null,
              deckTopCards: [...revealedCards],
              deckBottomCards: [],
            }
          }
        };
      }
    },
    allHealHP: () => {
      const beforePlayers = card?.name === '地下泉' ? copyPlayers(P) : null;
      allLiving.forEach(i => healHP(i, card.val));
      msgs.push(`全体存活角色回复 ${card.val} HP`);
      if (card?.name === '地下泉') {
        const event = createCardEffectEvent({
          effectKey: 'undergroundSpring',
          card,
          actorIdx: ci,
          beforePlayers,
          beforeDiscard: [...Disc],
          afterPlayers: copyPlayers(P),
          afterDiscard: [...Disc],
          statEvents: buildStatEvents(beforePlayers, P, msgs.slice(-1), { reason: card?.name || card?.type || '', seq: (gs?._statEventSeq || 0) + 1 }),
          msgs: msgs.slice(-1),
        });
        if (event) {
          statePatch = {
            ...statePatch,
            _visualEvents: [...(statePatch._visualEvents || []), event],
          };
        }
      }
    },
    selfHealBoth: () => { healHP(ci, 1); healSAN(ci, 1); msgs.push(`${actor.name} 回复了 1 HP 和 1 SAN`); },
    selfHealHPSAN: () => {
      const hpVal = card.hpVal || 0;
      const sanVal = card.sanVal || 0;
      if (hpVal) healHP(ci, hpVal);
      if (sanVal) healSAN(ci, sanVal);
      msgs.push(`${actor.name} 回复了 ${hpVal} HP 和 ${sanVal} SAN`);
    },
    selfHealBoth21: () => { healHP(ci, 2); healSAN(ci, 1); msgs.push(`${actor.name} 回复了 2 HP 和 1 SAN`); },
    selfHealAdjDamageHP: () => {
      healHP(ci, card.val);
      const adjDamage = card.adjVal || card.val;
      const adjacentTargets = getLivingAdjacentTargets(P, ci);
      adjacentTargets.forEach(i => dealHP(i, adjDamage));
      msgs.push(`${actor.name} 回复了 ${card.val} HP，相邻角色各失去 ${adjDamage + dmgBonus} HP`);
    },
    selfHealAdjHealHP: () => { healHP(ci, card.val); adjacent.filter(i => i !== ci).forEach(i => healHP(i, card.adjVal || 1)); msgs.push(`${actor.name} 回复了 ${card.val} HP，相邻角色各回复 ${card.adjVal || 1} HP`); },
    adjHealHP: () => { adjacent.forEach(i => healHP(i, card.val)); msgs.push(`${actor.name} 与相邻角色各回复 ${card.val} HP`); },
    selfRevealHandHP: () => {
      const healTarget = card.val || 8;
      if (actor.hp < healTarget) {
        actor.hp = healTarget;
        msgs.push(`${actor.name} HP 恢复至 ${healTarget}，手牌公开且盲抽改为挑选`);
      } else {
        msgs.push(`${actor.name} 手牌公开且盲抽改为挑选（HP 不低于 ${healTarget}，未恢复）`);
      }
      actor.revealHand = true; actor.pickInsteadOfRandom = true;
    },
    selfRevealHandSAN: () => { actor.san = Math.min(10, actor.san + card.val); actor.revealHand = true; actor.pickInsteadOfRandom = true; msgs.push(`${actor.name} 回复 ${card.val} SAN，手牌公开且盲抽改为挑选`); },
    globalOnlySwap: () => { statePatch = { globalOnlySwapOwner: ci }; msgs.push(`直到 ${actor.name} 的下回合开始前，所有角色技能都视为"掉包"`); },
    endTurnReplayHand: () => {},
    igniteTorch: () => {
      if (!isAI) {
        statePatch = {
          ...statePatch,
          abilityData: {
            type: 'igniteTorchDiscard',
            playerIndex: ci,
          }
        };
        msgs.push(`${actor.name} 准备弃一张牌并引燃火把`);
        return;
      }
      const beforeForcedPlayers = copyPlayers(P);
      const beforeForcedDiscard = [...Disc];
      const discardEvents = randDiscard(ci, 1);
      appendForcedRandomDiscardEvent(beforeForcedPlayers, beforeForcedDiscard, discardEvents);
      grantTurnScopedGodPowerImmunity(P[ci], executionTurnOwner);
      msgs.push(`【引燃火把】${actor.name} 本回合不受邪神之力影响`);
    },
    swapDeckDiscard: () => {
      const oldDeck = D;
      D = Disc;
      Disc = oldDeck;
      msgs.push(`【地底天空】牌堆和弃牌堆交换了`);
    },
    geomagneticReversal: () => {
      const beforePlayers = copyPlayers(P);
      const beforeDiscard = [...Disc];
      const restoreCard = createGeomagneticRestoreCard();
      Disc.push(restoreCard);
      Disc = shuffle(Disc);
      statePatch = { ...statePatch, geomagneticReversalActive: true };
      msgs.push(`【地磁反转】一张"反转复原"被洗入弃牌堆，场地被地磁反转笼罩！`);
      const event = createCardEffectEvent({
        effectKey: 'geomagneticReversal',
        card,
        actorIdx: ci,
        beforePlayers,
        beforeDiscard,
        afterPlayers: copyPlayers(P),
        afterDiscard: [...Disc],
        msgs: [msgs[msgs.length - 1]],
        payload: { restoreCard },
      });
      if (event) {
        statePatch = {
          ...statePatch,
          _visualEvents: [...(statePatch._visualEvents || []), event],
        };
      }
    },
    etherealize: () => {
      const beforeEtherealizePlayers = copyPlayers(P);
      const beforeEtherealizeDiscard = [...Disc];
      const hand = actor.hand || [];
      const cardAlreadyInHand = card?.id ? hand.some(c => c?.id === card.id) : false;
      const stackCount = hand.length + (cardAlreadyInHand ? 0 : 1);
      if (stackCount > 0) {
        actor.etherealizeStacks = (actor.etherealizeStacks || 0) + stackCount;
        msgs.push(`【半物质化】${actor.name} 进入半物质化状态，获得 ${stackCount} 层虚化`);
        const event = createCardEffectEvent({
          effectKey: 'etherealizeGain',
          card,
          actorIdx: ci,
          beforePlayers: beforeEtherealizePlayers,
          beforeDiscard: beforeEtherealizeDiscard,
          afterPlayers: copyPlayers(P),
          afterDiscard: [...Disc],
          msgs: [msgs[msgs.length - 1]],
          payload: { stackCount },
        });
        if (event) {
          statePatch = {
            ...statePatch,
            _visualEvents: [...(statePatch._visualEvents || []), event],
          };
        }
      } else {
        msgs.push(`【半物质化】${actor.name} 手牌为空，无法获得虚化`);
      }
    },
    snakePoisonTrap: () => {
      const livingTargets = P.map((p, i) => i).filter(i => P[i] && !P[i].isDead);
      const targets = livingTargets.filter(i => !avoidNegativeFor.includes(i));
      if (!targets.length) {
        msgs.push('【群蛇陷阱】没有存活角色可被中毒');
        return;
      }
      const beforePlayers = copyPlayers(P);
      const assignments = new Map();
      const assignmentHits = [];
      const totalLayers = livingTargets.length;
      for (let n = 0; n < totalLayers; n += 1) {
        const targetIdx = targets[Math.floor(Math.random() * targets.length)];
        P[targetIdx].poisonStacks = (P[targetIdx].poisonStacks || 0) + 1;
        assignments.set(targetIdx, (assignments.get(targetIdx) || 0) + 1);
        assignmentHits.push({ idx: targetIdx, name: P[targetIdx].name });
      }
      const summary = [...assignments.entries()]
        .map(([idx, count]) => `${P[idx].name}+${count}`)
        .join('、');
      msgs.push(`【群蛇陷阱】分配了 ${totalLayers} 层中毒：${summary}`);
      const assignmentList = [...assignments.entries()].map(([idx, count]) => ({ idx, count, name: P[idx].name }));
      const event = createCardEffectEvent({
        effectKey: 'snakeTrap',
        card,
        actorIdx: ci,
        beforePlayers,
        afterPlayers: copyPlayers(P),
        msgs: [msgs[msgs.length - 1]],
        payload: { assignmentList, assignmentHits, totalLayers },
      });
      if (event) {
        statePatch = {
          ...statePatch,
          _visualEvents: [...(statePatch._visualEvents || []), event],
        };
      }
    },
    deadNeighborSkipDraw: () => {
      const skipped = new Set();
      const N = P.length;
      P.forEach((p, i) => {
        if (!p?.isDead) return;
        [(i - 1 + N) % N, (i + 1) % N].forEach(targetIdx => {
          if (P[targetIdx] && !P[targetIdx].isDead) skipped.add(targetIdx);
        });
      });
      if (!skipped.size) {
        msgs.push('没有存活角色与死亡角色相邻');
        return;
      }
      skipped.forEach(i => { markSkipNextDraw(P[i], '活死人哨兵'); });
      msgs.push(`【活死人哨兵】${[...skipped].map(i => P[i].name).join('、')} 下回合不能摸牌`);
    },
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
        const beforeForcedPlayers = copyPlayers(P);
        const beforeForcedDiscard = [...Disc];
        msgs.push(`${actor.name} 失去 ${card.val} HP`);
        hurtHP(ci, card.val);
        const discardEvents = randDiscard(ci, 1);
        appendForcedRandomDiscardEvent(beforeForcedPlayers, beforeForcedDiscard, discardEvents);
      }
    },
    selfDamageDiscardSAN: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        const beforeForcedPlayers = copyPlayers(P);
        const beforeForcedDiscard = [...Disc];
        hurtSAN(ci, card.val);
        msgs.push(`${actor.name} 失去 ${card.val} SAN`);
        const discardEvents = randDiscard(ci, 1);
        appendForcedRandomDiscardEvent(beforeForcedPlayers, beforeForcedDiscard, discardEvents);
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
    adjDamageHP: () => {
      const beforePlayers = card?.name === '惊扰蝙蝠' ? copyPlayers(P) : null;
      applyAOEDamage(adjacent, 'hp', card.val);
      if (card?.name === '惊扰蝙蝠') {
        settlePendingDamages('eager');
        const event = createCardEffectEvent({
          effectKey: 'startledBats',
          card,
          actorIdx: ci,
          beforePlayers,
          beforeDiscard: [...Disc],
          afterPlayers: copyPlayers(P),
          afterDiscard: [...Disc],
          statEvents: buildStatEvents(beforePlayers, P, msgs.slice(-1), { reason: card?.name || card?.type || '', seq: (gs?._statEventSeq || 0) + 1 }),
          msgs: msgs.slice(-1),
        });
        if (event) {
          statePatch = {
            ...statePatch,
            _visualEvents: [...(statePatch._visualEvents || []), event],
          };
        }
      }
    },
    adjDamageSAN: () => { applyAOEDamage(adjacent, 'san', card.val); },
    adjDamageBoth: () => { applyAOEDamage(adjacent, 'both', card.val, card.hpVal, card.sanVal); },
    allDamageHP: () => {
      const beforePlayers = card?.name === '活火山' ? copyPlayers(P) : null;
      applyGlobalAOEDamage('hp', card.val);
      if (card?.name === '活火山') {
        settlePendingDamages('eager');
        const event = createCardEffectEvent({
          effectKey: 'volcano',
          card,
          actorIdx: ci,
          beforePlayers,
          beforeDiscard: [...Disc],
          afterPlayers: copyPlayers(P),
          afterDiscard: [...Disc],
          statEvents: directStatEvents || buildStatEvents(beforePlayers, P, msgs.slice(-1), { reason: card?.name || card?.type || '', seq: (gs?._statEventSeq || 0) + 1 }),
          msgs: msgs.slice(-1),
        });
        if (event) {
          statePatch = {
            ...statePatch,
            _visualEvents: [...(statePatch._visualEvents || []), event],
          };
        }
      }
    },
    allDamageSAN: () => { applyGlobalAOEDamage('san', card.val); },
    allDamageBoth: () => {
      const beforePlayers = card?.name === '夜风呼啸' ? copyPlayers(P) : null;
      applyGlobalAOEDamage('both', card.val);
      if (card?.name === '夜风呼啸') {
        settlePendingDamages('eager');
        const event = createCardEffectEvent({
          effectKey: 'nightWind',
          card,
          actorIdx: ci,
          beforePlayers,
          beforeDiscard: [...Disc],
          afterPlayers: copyPlayers(P),
          afterDiscard: [...Disc],
          statEvents: buildStatEvents(beforePlayers, P, msgs.slice(-1), { reason: card?.name || card?.type || '', seq: (gs?._statEventSeq || 0) + 1 }),
          msgs: msgs.slice(-1),
        });
        if (event) {
          statePatch = {
            ...statePatch,
            _visualEvents: [...(statePatch._visualEvents || []), event],
          };
        }
      }
    },
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
      const beforeEarthquakePlayers = copyPlayers(P);
      const beforeEarthquakeDiscard = [...Disc];
      const earthquakeDiscardEvents = [];
      allLiving.forEach(i => {
        if (!avoidNegativeFor.includes(i) && P[i]?.hand?.length) {
          const x = 0 | Math.random() * P[i].hand.length;
          const c = P[i].hand.splice(x, 1)[0];
          if (isBlackGoatYoung(c) || isTsathogguaSlime(c)) {
            msgs.push(`${P[i].name} 的衍生牌被销毁`);
          } else if (c.type !== 'blankZone') {
            Disc.push(c);
            msgs.push(`${P[i].name} 失去了 ${cardLogText(c, { alwaysShowName: true })}`);
            const balance = applyBalanceDiscardSideEffects({ players: P, deck: D, discard: Disc, log: msgs, ownerIdx: i, cards: [c], reason: '失去手牌', applyHpDamage: applyHpDamageWithLink, submitDamage: submitDamageEvents, currentTurn: gs?.currentTurn });
            msgs.splice(0, msgs.length, ...balance.log);
            (balance.etherealizeDecision?.pendingLosses || []).forEach(loss => {
              pendingEtherealizeLosses = appendEtherealizeLoss(pendingEtherealizeLosses, { ...loss, order: damageOrderSeq++ });
            });
            earthquakeDiscardEvents.push({
              playerIndex: i,
              card: c,
              afterPlayers: copyPlayers(P),
              afterDiscard: [...Disc],
            });
          } else {
            msgs.push(`${P[i].name} 的空白区域牌消失了`);
          }
        }
      });
      const earthquakeEvent = createEarthquakeEvent({
        beforePlayers: beforeEarthquakePlayers,
        beforeDiscard: beforeEarthquakeDiscard,
        discardEvents: earthquakeDiscardEvents,
        msgs: msgs.slice(),
      });
      statePatch = {
        ...statePatch,
        _visualEvents: earthquakeEvent
          ? [...(statePatch._visualEvents || []), earthquakeEvent]
          : (statePatch._visualEvents || []),
      };
    },
    selfRenounceGod: () => {
      if (actor.godName) {
        if (actor.godZone?.length) Disc.push(...actor.godZone);
        actor.godZone = []; actor.godName = null; actor.godLevel = 0;
        msgs.push(`${actor.name} 放弃信仰`);
      }
    },
    graveDigGod: () => {
      const godCards = Disc
        .map((discardCard, discardIndex) => ({ card: discardCard, discardIndex }))
        .filter(item => item.card?.isGod);
      if (!godCards.length) {
        msgs.push('弃牌堆中没有邪神牌，无法掘墓');
        return;
      }
      if (isAI) {
        const picked = godCards[godCards.length - 1];
        const [godCard] = Disc.splice(picked.discardIndex, 1);
        P[ci].hand.push(godCard);
        statePatch = { ...statePatch, ...appendPublicCardGainTriggers({ ...gs, ...statePatch }, P, ci, godCard) };
        msgs.push(`${actor.name} 从弃牌堆中取回 ${cardLogText(godCard, { alwaysShowName: true })}`);
      } else {
        statePatch = {
          ...statePatch,
          abilityData: {
            type: 'graveDigPickGod',
            playerIndex: ci,
            godCards: godCards.map(item => item.card),
            discardIndices: godCards.map(item => item.discardIndex),
          }
        };
        msgs.push(`${actor.name} 准备从弃牌堆中取回一张邪神牌`);
      }
    },
    buryAlive: () => {
      const targets = getAdjacentTargets(P, ci).filter(i =>
        P[i] &&
        !P[i].isDead &&
        P[i].hand.length > 0 &&
        !(avoidNegative && i === ci) &&
        !avoidNegativeFor.includes(i)
      );
      if (!targets.length) {
        msgs.push('没有角色有手牌，无法活埋');
        return;
      }
      if (isAI) {
        targets.forEach(targetIdx => {
          if (!P[targetIdx]?.hand?.length) return;
          const [buriedCard] = P[targetIdx].hand.splice(0, 1);
          D.push(buriedCard);
          msgs.push(`【活埋】${P[targetIdx].name} 将 ${cardLogText(buriedCard, { alwaysShowName: true })} 放到了牌堆底`);
        });
      } else {
        statePatch = {
          ...statePatch,
          abilityData: {
            type: 'buryAliveSelect',
            source: ci,
            targets,
            targetIndex: 0,
            ...(gs?._isMP ? { buryAliveChoices: Array(P.length).fill(null) } : {}),
          }
        };
        msgs.push(`${actor.name} 与相邻角色准备各将一张手牌放到牌堆底`);
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
        settlePendingDamages('eager');
      }
      healSAN(ci, card.val);
      msgs.push(`${actor.name} 回复 ${card.val} SAN`);
    },
    sacHealSelfSANCultist: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci) && actor.hasBelievedGod) {
        msgs.push(`${actor.name} 失去 3 HP`);
        hurtHP(ci, 3);
        settlePendingDamages('eager');
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
      addTurnScopedDamageBonus(P[ci], executionTurnOwner, 1);
      msgs.push(`${actor.name} 本回合造成的伤害+1`);
    },
    selfDamageSkipDraw: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        if (P[ci] && !P[ci].isDead) {
          msgs.push(`${actor.name} 失去 ${card.val} HP`);
        }
        hurtHP(ci, card.val);
        settlePendingDamages('eager');
        if (P[ci] && !P[ci].isDead) {
          markSkipNextDraw(P[ci], card.name || '扭伤');
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
      const beforeGlobalPlayers = copyPlayers(P);
      const beforeGlobalDiscard = [...Disc];
      const burrowingWormTriggerMsgs = [];
      affectedTargets.forEach(i => {
        const localMsgs = [];
        hurtHPDirect(i, (card.val || 0) + dmgBonus, localMsgs);
        settlePendingDamages('eager');
        deferredGlobalLogs.push(...localMsgs);
      });
      const afterGlobalPlayers = copyPlayers(P);
      if (affectedTargets.length) {
        const globalDamageMsg = avoidSelf && affectedTargets.length === allLiving.length - 1
          ? `除${actor.name}外，全体存活角色失去 ${card.val} HP`
          : `全体存活角色失去 ${card.val} HP`;
        msgs.push(globalDamageMsg);
        if (card?.name === '钻地魔虫') burrowingWormTriggerMsgs.push(globalDamageMsg);
      }
      if (deferredGlobalLogs.length) msgs.push(...deferredGlobalLogs);
      const alivePlayers = P.map((p, i) => i).filter(i => !P[i].isDead && !avoidNegativeFor.includes(i) && !(avoidSelf && i === ci));
      if (alivePlayers.length > 0) {
        const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        const beforeExtraPlayer = { ...P[randomTarget] };
        const localMsgs = [];
        hurtHPDirect(randomTarget, (card.val || 0) + dmgBonus, localMsgs);
        settlePendingDamages('eager');
        statePatch = appendRandomTargetEvent(statePatch, gs, {
          sourceIdx: ci,
          targetIdx: randomTarget,
          label: card.name || '随机目标',
          resultText: `${P[randomTarget].name} 被选中`,
          phaseOrder: 1,
        });
        msgs.push(`${P[randomTarget].name} 额外失去 ${card.val} HP`);
        if (localMsgs.length) msgs.push(...localMsgs);
        const seq = (gs?._statEventSeq || 0) + 1;
        directStatEvents = [
          ...affectedTargets
            .filter(i => afterGlobalPlayers[i]?.hp < beforeGlobalPlayers[i]?.hp)
            .map(i => ({
              type: 'HP_LOSS',
              target: i,
              from: playerStats(beforeGlobalPlayers[i]),
              to: playerStats(afterGlobalPlayers[i]),
              reason: card?.name || card?.type || '',
              seq,
              phaseOrder: 0,
            })),
          ...((P[randomTarget]?.hp ?? 0) < (beforeExtraPlayer.hp ?? 0) ? [{
            type: 'HP_LOSS',
            target: randomTarget,
            from: playerStats(beforeExtraPlayer),
            to: playerStats(P[randomTarget]),
            reason: card?.name || card?.type || '',
            seq,
            phaseOrder: 2,
          }] : []),
        ];
      }
      if (card?.name === '钻地魔虫') {
        const event = createCardEffectEvent({
          effectKey: 'burrowingWorm',
          card,
          actorIdx: ci,
          beforePlayers: beforeGlobalPlayers,
          beforeDiscard: beforeGlobalDiscard,
          afterPlayers: copyPlayers(P),
          afterDiscard: [...Disc],
          msgs: burrowingWormTriggerMsgs,
        });
        if (event) {
          statePatch = {
            ...statePatch,
            _visualEvents: [...(statePatch._visualEvents || []), event],
          };
        }
      }
    },
    throwStone: () => {
      const candidates = P.map((p, i) => i).filter(i => i !== ci && !P[i].isDead);
      if (!candidates.length) {
        msgs.push('没有其他存活角色，无法投掷石块');
        return;
      }
      const roll = 1 + (Math.random() * 6 | 0);
      const randomTarget = candidates[Math.floor(Math.random() * candidates.length)];
      const distance = getLivingCircularDistance(P, ci, randomTarget);
      const damage = Math.max(0, roll - distance) + dmgBonus;
      const beforeTarget = { ...P[randomTarget] };
      statePatch = appendRandomTargetEvent(statePatch, gs, {
        sourceIdx: ci,
        targetIdx: randomTarget,
        label: card.name || '投掷石块',
        roll,
        distance,
        damage,
        resultText: `${P[randomTarget].name} 被选中`,
        diceBefore: true,
        phaseOrder: 1,
      });
      msgs.push(`${actor.name} 掷出 ${roll} 点，随机砸向 ${P[randomTarget].name}（距离${distance}），造成 ${damage} HP 伤害`);
      if (damage > 0) {
        const localMsgs = [];
        hurtHPDirect(randomTarget, damage, localMsgs);
        settlePendingDamages('eager');
        if (localMsgs.length) msgs.push(...localMsgs);
      }
      const seq = (gs?._statEventSeq || 0) + 1;
      directStatEvents = damage > 0 ? [{
        type: 'HP_LOSS',
        target: randomTarget,
        from: playerStats(beforeTarget),
        to: playerStats(P[randomTarget]),
        reason: card?.name || card?.type || '',
        seq,
        phaseOrder: 2,
      }] : [];
    },
    sameAbyssChoice: () => {
      if (!avoidNegative && !avoidNegativeFor.includes(ci)) {
        msgs.push(`${actor.name} 失去 ${card.hpVal || 2} HP`);
        hurtHP(ci, card.hpVal || 2);
        settlePendingDamages('eager');
      }
      const actorHand = actor.hand || [];
      const cardAlreadyInHand = card?.id ? actorHand.some(c => c?.id === card.id) : false;
      const incomingCardCount = cardAlreadyInHand ? 0 : 1;
      const getSameAbyssHandCount = i => (P[i]?.hand?.length || 0) + (i === ci ? incomingCardCount : 0);
      const livingPlayers = P.map((p, i) => i).filter(i => !P[i].isDead);
      if (livingPlayers.length === 0) return;
      let maxHand = -1;
      let maxHandPlayers = [];
      livingPlayers.forEach(i => {
        const handCount = getSameAbyssHandCount(i);
        if (handCount > maxHand) {
          maxHand = handCount;
          maxHandPlayers = [i];
        } else if (handCount === maxHand) {
          maxHandPlayers.push(i);
        }
      });
      const targetIdx = maxHandPlayers[0];
      const actorHandCount = getSameAbyssHandCount(ci);
      const targetHandCount = getSameAbyssHandCount(targetIdx);
      const discardCount = Math.max(0, targetHandCount - actorHandCount);
      msgs.push(`【同归深渊】${P[targetIdx].name} 手牌最多（${targetHandCount} 张），须做出选择`);
      if (targetIdx === 0) {
        return {
          P, D, Disc, msgs,
          statePatch: {
            abilityData: {
              type: 'sameAbyssChoice',
              actorIdx: ci,
              targetIdx,
              actorHandCount,
              discardCount,
              targetHandCount,
            }
          }
        };
      }
      const target = P[targetIdx];
      if (discardCount > 0 && target.hp <= 5) {
        for (let d = 0; d < discardCount; d++) {
          if (target.hand.length > actorHandCount) {
            const c = target.hand.shift();
            if (isBlackGoatYoung(c) || isTsathogguaSlime(c)) {
              msgs.push(`${target.name} 的衍生牌被销毁`);
            } else if (c.type !== 'blankZone') {
              Disc.push(c);
              const balance = applyBalanceDiscardSideEffects({ players: P, deck: D, discard: Disc, log: msgs, ownerIdx: targetIdx, cards: [c], reason: '同归深渊弃牌', applyHpDamage: applyHpDamageWithLink, submitDamage: submitDamageEvents, currentTurn: gs?.currentTurn });
              msgs.splice(0, msgs.length, ...balance.log);
              (balance.etherealizeDecision?.pendingLosses || []).forEach(loss => {
                pendingEtherealizeLosses = appendEtherealizeLoss(pendingEtherealizeLosses, { ...loss, order: damageOrderSeq++ });
              });
            }
          }
        }
        msgs.push(`【同归深渊】${target.name} 选择弃置手牌至 ${actorHandCount} 张`);
      } else {
        msgs.push(`【同归深渊】${target.name} 选择承受伤害，失去 4 HP`);
        hurtHP(targetIdx, 4);
      }
    },
    sphinxGuess: () => {
      if (D.length === 0) {
        msgs.push('牌堆已空，无法猜测');
        return;
      }
      const topCard = D[0];
      const isZone = isZoneCard(topCard);
      if (isAI) {
        const guessYes = Math.random() < 0.5;
        msgs.push(`${actor.name} 猜测牌堆顶的牌${guessYes ? '是' : '不是'}区域牌`);
        const actualCard = D.shift();
        const guessCorrect = (guessYes && isZone) || (!guessYes && !isZone);
        if (guessCorrect) {
          msgs.push(`猜测正确！${actor.name} 收入了 ${cardLogText(actualCard)}`);
          P[ci].hand.push(actualCard);
          statePatch = { ...statePatch, ...appendPublicCardGainTriggers({ ...gs, ...statePatch }, P, ci, actualCard) };
        } else {
          if (avoidNegative || avoidNegativeFor.includes(ci)) {
            msgs.push(`猜测错误！${actor.name} 负面效果已规避`);
          } else {
            msgs.push(`猜测错误！${actor.name} 失去 3 HP`);
            hurtHP(ci, 3);
          }
          Disc.push(actualCard);
        }
        statePatch = {
          ...statePatch,
          _animSphinxReveal: { card: actualCard, guessYes, guessCorrect, actorIdx: ci }
        };
      } else {
        return {
          P, D, Disc, msgs,
          statePatch: {
            abilityData: {
              type: 'sphinxGuess',
              topCard,
              sphinxAvoidNegative: avoidNegative || avoidNegativeFor.includes(ci),
            }
          }
        };
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
    moldyFood: () => {
      const d1 = 1 + (Math.random() * 6 | 0);
      const isEven = d1 % 2 === 0;
      const seq = (gs?._moldyFoodDiceSeq || 0) + 1;
      const negativeAvoided = !isEven && (avoidNegative || avoidNegativeFor.includes(ci));
      statePatch = { ...statePatch, _moldyFoodDiceSeq: seq, _moldyFoodDiceRoll: { d1, isEven, actorIdx: ci, seq, negativeAvoided } };
      if (isEven) {
        healHP(ci, 2);
        msgs.push(`【霉变食物】${actor.name} 掷出 ${d1} 点（双数），恢复 2 HP`);
      } else {
        if (!negativeAvoided) {
          msgs.push(`【霉变食物】${actor.name} 掷出 ${d1} 点（单数），失去 1 HP，下回合开始时不能摸牌`);
          hurtHP(ci, 1);
          settlePendingDamages('eager');
          markSkipNextDraw(P[ci], '霉变食物');
        } else {
          msgs.push(`【霉变食物】${actor.name} 掷出 ${d1} 点（单数），负面效果已规避`);
        }
      }
    },
    albinoCreature: () => {
      const hand = actor.hand || [];
      const fireCards = hand.filter(c => cardContainsFireText(c));
      if (fireCards.length > 0) {
        if (isAI) {
          const chosenCard = fireCards[Math.floor(Math.random() * fireCards.length)];
          msgs.push(`【白化生物】${actor.name} 亮出了 ${cardLogText(chosenCard, { alwaysShowName: true })}`);
          const candidates = P.map((p, i) => i).filter(i => !P[i].isDead);
          if (candidates.length > 0) {
            const randomTarget = candidates[Math.floor(Math.random() * candidates.length)];
            const beforeTarget = { ...P[randomTarget] };
            hurtHP(randomTarget, 2);
            hurtSAN(randomTarget, 2);
            settlePendingDamages('eager');
            msgs.push(`${P[randomTarget].name} 失去 2 HP 和 2 SAN`);
            const seq = (gs?._statEventSeq || 0) + 1;
            directStatEvents = [{
              type: 'HP_LOSS',
              target: randomTarget,
              from: playerStats(beforeTarget),
              to: playerStats(P[randomTarget]),
              reason: '白化生物',
              seq,
              phaseOrder: 0,
            }];
          }
        } else {
          statePatch = {
            ...statePatch,
            abilityData: {
              type: 'albinoCreatureSelectCard',
              playerIndex: ci,
              fireCardIds: fireCards.map(c => c.id),
            }
          };
          msgs.push(`${actor.name} 收入了白化生物，准备亮出带"火"字的手牌`);
        }
      } else {
        msgs.push(`【白化生物】${actor.name} 没有带"火"字的手牌，失去 2 HP 和 2 SAN`);
        hurtHP(ci, 2);
        hurtSAN(ci, 2);
      }
    },
    allHealHPDamageSAN: () => {
      const healVal = card.hpVal || 2;
      const sanDmg = card.sanVal || 2;
      allLiving.forEach(i => healHP(i, healVal));
      msgs.push(`全体存活角色回复 ${healVal} HP`);
      const sanTargets = allLiving.filter(i => !(avoidNegative && i === ci) && !avoidNegativeFor.includes(i));
      sanTargets.forEach(i => hurtSAN(i, sanDmg));
      if (sanTargets.length === allLiving.length) {
        msgs.push(`全体存活角色失去 ${sanDmg} SAN`);
      } else if (sanTargets.length) {
        msgs.push(`${sanTargets.map(i => P[i].name).join('、')} 失去 ${sanDmg} SAN`);
      } else {
        msgs.push(`所有角色的 SAN 损失均被规避`);
      }
    },
  };

  const handler = handlers[card.type];
  if (handler) {
    const earlyReturn = handler();
    if (earlyReturn) return finish(earlyReturn);
  }
  settlePendingDamages('batch');
  const directStatEventSeq = (gs?._statEventSeq || 0) + 1;
  if (!directStatEvents) directStatEvents = buildStatEvents(beforePlayers, P, msgs, { reason: card?.name || card?.type || '', seq: directStatEventSeq });
  const inspectionStartMeta = directStatEvents.length
    ? {
      ...inspectionMeta,
      _statEvents: [
        ...((inspectionMeta?._statEvents) || []),
        ...directStatEvents,
      ],
      _statEventSeq: Math.max(
        inspectionMeta?._statEventSeq || 0,
        ...directStatEvents.map(event => event?.seq || 0),
      ),
    }
    : inspectionMeta;
  const inspectionTargets = hasLivingSanDepleted(P)
    ? []
    : pendingInspectionTargets.filter(i => P[i]?.san > 0 && P[i].san <= 6);
  if (inspectionTargets.length) {
    const inspectionBaseLog = [...(Array.isArray(gs?.log) ? gs.log : []), ...msgs];
    const pendingChainDecision = statePatch?.abilityData?.type
      ? statePatch.abilityData
      : buildChainEtherealizeDecision()
        || buildTsathogguaSlimeBalanceDecision(beforePlayers, P, { _turnOwner: gs?.currentTurn ?? ci });
    const processed = processInspectionTargets(
      inspectionTargets,
      gs?.currentTurn ?? ci,
      P,
      D,
      Disc,
      inspectionBaseLog,
      pendingChainDecision ? { ...inspectionStartMeta, abilityData: pendingChainDecision } : inspectionStartMeta
    );
    P = processed.P; D = processed.D; Disc = processed.Disc; inspectionMeta = processed.inspectionMeta;
    msgs = [...msgs, ...processed.log.slice(inspectionBaseLog.length)];
    statePatch = { ...statePatch, ...inspectionMeta };
  }
  return finish({ P, D, Disc, msgs, statePatch }, directStatEvents);
}
