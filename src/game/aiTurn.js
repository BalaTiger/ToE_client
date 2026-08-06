import {
  copyPlayers,
  clamp,
  isZoneCard,
  isBlankZoneCard,
  isBlackGoatYoung,
  isTsathogguaSlime,
  canRevealForHunt,
  hasHuntRevealableCard,
  separateBlackGoatYoung,
  isWinHand,
  cardLogText,
  buildWorshipFromHandLog,
  removeCardsFromDiscard,
  makeInspectionMeta,
  formatSanLoss,
} from './coreUtils';
import {
  aiChooseRevealCard,
  aiChooseHunterLootCards,
  chooseAiRoseThornTarget,
  chooseAiCultistBewitchPlan,
  decideAiSkillUsage,
  shouldAiRest,
  getHunterChaseTargets,
  getHunterLowQualityConfidence,
  orderHunterChaseTargets,
  canCultistWinByBewitch,
  canCultistEmptyHandByBewitch,
  aiShouldKeepZoneCard,
  aiShouldNotRest,
  isCultistEndingTurnUnreasonable,
} from './ai';
import { applyFx, applyHpDamageWithLink, submitDamageEvents } from './effectEngine';
import { advanceGodEncounter, formatGodEncounterProgress } from './balancePatches';
import {
  checkWin,
  aiHandleGodCard,
  chooseAiGodEncounterAction,
  applySanLossToPlayerWithInspection,
  abandonGodFollower,
  convertGodFollower,
  startNextTurn,
  aiDrawAndApply,
  grantTsathogguaSlimeAtEndTurn,
} from './turnEngine';
import { withClearedTurnAnimFields } from './turnAnimState';
import { buildAnimQueue } from './animQueueCore';
import { cardTransferStep, statePatchStep } from './animQueueHelpers';
import { ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST, isRevealedCultist } from './coreUtils';
import { createBlackGoatYoungCard } from '../constants/card';
import { buildStatEvents } from './statEvents';
import { END_TURN_EVENT, getEndTurnEvents, getEndTurnReplayHandCards, resolveReverseTurnOrderAtEnd } from './endTurnEvents';
import { deriveEffectDecisionState, hasEffectDecisionState } from './effectStatePatch';
import { buildApophisNightLog, getApophisNightForLevel, resolveApophisTarget } from './apophisNight';
import { applyBalanceDiscardSideEffects } from './balanceCards';
import { TURN_FLOW_STAGE } from './turnFlowStages';
import { buildGodPowerBlockedLog, canGodPowerAffect, hasGodPowerImmunity } from './godPowerImmunity';
import { appendPublicCardGainTriggers } from './cardGainEvents';
import {
  buildGodPowerBlockedStepsFromVisualEvents,
  buildTsathogguaSlimeGrantSteps,
  createBewitchGiftEvent,
  createGodPowerBlockedEvent,
  createGodStatusChangedEvent,
  createHuntResultEvent,
  createMultiplyVisualEvent,
  createSwapCardsEvent,
  createTsathogguaSlimeGrantEvent,
} from './visualEvents';
import {
  getBestCaveDuelCardIndex,
  resolveCaveDuelOutcome,
} from './caveDuel';

/**
 * 检查两张卡是否满足追捕匹配规则。
 * - 被捕者展示非区域牌：追捕者弃任意牌都成功
 * - 追捕者弃非区域牌去匹配区域牌：失败
 * - 空白区域牌默认匹配
 * - 否则字母或数字相同即匹配
 */
export function cardsHuntMatch(a, b) {
  if (!a || !b) return false;
  if (isBlackGoatYoung(a) || isBlackGoatYoung(b) || isTsathogguaSlime(a) || isTsathogguaSlime(b)) return false; // 衍生牌不可被任何卡牌匹配
  if (!isZoneCard(b)) return true;      // 被捕者展示非区域牌 → 追捕者弃任意牌成功
  if (!isZoneCard(a)) return false;     // 追捕者弃非区域牌去匹配区域牌 → 失败
  if (isBlankZoneCard(a) || isBlankZoneCard(b)) return true;
  return a.letter === b.letter || a.number === b.number;
}

function countTreasureAxes(hand = []) {
  const letters = new Set();
  const numbers = new Set();
  hand.forEach(card => {
    if (!card || card.isGod || !card.isZone) return;
    if (card.letter) letters.add(card.letter);
    if (Number.isFinite(card.number)) numbers.add(card.number);
  });
  return letters.size + numbers.size;
}

function treasureGodCardUtility(card) {
  switch (card?.godKey) {
    case 'TSG': return 2.2;
    case 'NYA': return 1.2;
    case 'VRI': return 0.8;
    case 'CTH': return 0.4;
    case 'SHU': return -4.0;
    case 'APO': return -3.0;
    default: return -1.5;
  }
}

function treasureCardRetentionValue(card, hand = [], index = -1) {
  if (!card) return -99;
  if (isBlackGoatYoung(card) || isTsathogguaSlime(card)) return -20;
  if (card.isGod) return treasureGodCardUtility(card);
  if (!card.isZone) return 0.2;
  const without = hand.filter((_, i) => i !== index);
  const axisContribution = Math.max(0, countTreasureAxes(hand) - countTreasureAxes(without));
  return axisContribution * 8 + 1;
}

function treasureHandValue(hand = []) {
  return countTreasureAxes(hand) * 10
    + hand.reduce((sum, card, index) => sum + treasureCardRetentionValue(card, hand, index) * 0.2, 0);
}

function chooseTreasureSwapGiveIndex(hand = []) {
  if (!hand.length) return -1;
  return hand.reduce((bestIdx, card, index) => {
    const score = treasureCardRetentionValue(card, hand, index);
    const bestScore = treasureCardRetentionValue(hand[bestIdx], hand, bestIdx);
    return score < bestScore ? index : bestIdx;
  }, 0);
}

function evaluateTreasureSwapSteal(selfHand = [], takenCard) {
  const beforeScore = treasureHandValue(selfHand);
  const handAfterSteal = [...selfHand, takenCard];
  const giveIdx = chooseTreasureSwapGiveIndex(handAfterSteal);
  if (giveIdx < 0) return { score: -Infinity, giveIdx: -1 };
  const handAfterSwap = handAfterSteal.filter((_, index) => index !== giveIdx);
  return {
    score: treasureHandValue(handAfterSwap) - beforeScore,
    giveIdx,
  };
}

function chooseAiTreasureSwapPlan(players = [], sourceIdx, targetIndices = [], overrideTargetIdx = null) {
  const self = players[sourceIdx];
  if (!self?.hand?.length) return null;
  const candidates = overrideTargetIdx != null ? [overrideTargetIdx] : targetIndices;
  const scoredTargets = candidates
    .filter(idx => idx != null && idx !== sourceIdx && players[idx] && !players[idx].isDead && players[idx].hand?.length)
    .map(idx => {
      const targetHand = players[idx].hand || [];
      const outcomes = targetHand.map(card => evaluateTreasureSwapSteal(self.hand, card));
      const expectedScore = outcomes.reduce((sum, outcome) => sum + outcome.score, 0) / Math.max(1, outcomes.length);
      return { idx, expectedScore };
    })
    .sort((a, b) => b.expectedScore - a.expectedScore || a.idx - b.idx);
  if (!scoredTargets.length) return null;
  if (overrideTargetIdx == null && scoredTargets[0].expectedScore <= 0.05) return null;
  return { targetIdx: scoredTargets[0].idx, expectedScore: scoredTargets[0].expectedScore };
}

/**
 * 将手牌不大于3张的玩家的空白区域牌移入手牌。
 * @returns {{players, log}|null} 如果有变化则返回新状态，否则返回 null
 */
export function moveEligibleBlankZones(players, log = []) {
  let changed = false;
  const P = copyPlayers(players);
  const L = [...log];
  P.forEach(player => {
    if (!player || player.isDead) return;
    const blankZones = (player.zoneCards || []).filter(isBlankZoneCard);
    if (!blankZones.length) return;
    if (player.hand.length <= 3) {
      blankZones.forEach(blank => {
        player.hand.push(blank);
        L.push(`${player.name} 手牌不大于3张，将空白区域牌收入手牌`);
      });
      player.zoneCards = (player.zoneCards || []).filter(c => !isBlankZoneCard(c));
      changed = true;
    }
  });
  return changed ? { players: P, log: L } : null;
}

function getBlackGoatMultiplyEvent(players, sourceIdx) {
  const source = players?.[sourceIdx];
  if (!source || source.isDead || !(source.hand || []).some(isBlackGoatYoung)) return null;
  const targetCandidates = players
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => !p.isDead && i !== sourceIdx)
    .sort((a, b) => {
      const aBgy = a.p.hand.filter(isBlackGoatYoung).length;
      const bBgy = b.p.hand.filter(isBlackGoatYoung).length;
      if (aBgy !== bBgy) return aBgy - bBgy;
      return a.p.hp - b.p.hp || b.p.san - a.p.san;
    });
  if (!targetCandidates.length) return null;
  return { fromIdx: sourceIdx, toIdx: targetCandidates[0].i };
}

function hasTreasureSwapBuffer(hand = []) {
  const zoneCards = hand.filter(c => isZoneCard(c) && !c.isGod);
  const letters = new Set();
  const numbers = new Set();
  for (const card of zoneCards) {
    const duplicateLetter = card.letter && letters.has(card.letter);
    const duplicateNumber = card.number != null && numbers.has(card.number);
    if (duplicateLetter || duplicateNumber) return true;
    if (card.letter) letters.add(card.letter);
    if (card.number != null) numbers.add(card.number);
  }
  return false;
}

function bestCultistBewitchSanLoss(hand = []) {
  return hand.reduce((best, card) => {
    if (!card || card.isGod || isBlackGoatYoung(card)) return best;
    switch (card.type) {
      case 'selfDamageSAN':
      case 'selfDamageDiscardSAN':
      case 'selfDamageRestSAN':
      case 'selfDamageSANCond':
        return Math.max(best, card.val || 0);
      case 'selfDamageHPSAN':
      case 'adjDamageBoth':
        return Math.max(best, card.sanVal || 0);
      case 'allDamageSAN':
      case 'allDamageBoth':
        return Math.max(best, card.val || 0);
      case 'allHealHPDamageSAN':
        return Math.max(best, card.sanVal || 0);
      default:
        return best;
    }
  }, 0);
}

function hasImmediateHunterKill(players, hunterIdx, huntAbandoned = []) {
  const hunter = players?.[hunterIdx];
  if (!hunter || hunter.isDead || !(hunter.hand || []).some(isZoneCard)) return false;
  const damage = 3 + (hunter.damageBonus || 0);
  return getHunterChaseTargets(players, hunterIdx, huntAbandoned)
    .some(({ player }) => player.hp <= damage);
}

function markHunterLowQualityHand(players, hunterIdx, gs, attemptedTargets) {
  const hunter = players?.[hunterIdx];
  if (!hunter || hunter.isDead) return;
  const handIds = (hunter.hand || [])
    .filter(canRevealForHunt)
    .map(card => card.id)
    .filter(id => id != null);
  if (!handIds.length || attemptedTargets <= 0) {
    hunter.huntQualityMemory = null;
    return;
  }
  const previousMemory = hunter.huntQualityMemory;
  const previousIds = new Set(previousMemory?.handIds || []);
  const retainedFromPrevious = handIds.filter(id => previousIds.has(id)).length;
  const sameStructure = previousIds.size > 0 && retainedFromPrevious / previousIds.size >= 0.5;
  hunter.huntQualityMemory = {
    turn: gs?.turn || 0,
    handIds,
    handSize: hunter.hand.length,
    failedTargetCount: attemptedTargets,
    failedChainCount: sameStructure
      ? (previousMemory.failedChainCount ?? previousMemory.failedTargetCount ?? 1) + 1
      : 1,
  };
}

function clearHunterLowQualityHand(players, hunterIdx) {
  const hunter = players?.[hunterIdx];
  if (hunter) hunter.huntQualityMemory = null;
}

function shouldAiMultiply({ gs, players, sourceIdx, aiEffRole, ai, aiSkillDecision, cultistBewitchPlan, huntAbandoned }) {
  if (!ai || ai.isDead) return false;
  if (aiEffRole === ROLE_TREASURE) {
    return !(aiSkillDecision?.canSwapHands && hasTreasureSwapBuffer(ai.hand));
  }
  if (aiEffRole === ROLE_HUNTER) {
    if (hasImmediateHunterKill(players, sourceIdx, huntAbandoned)) return false;
    const lowQualityConfidence = getHunterLowQualityConfidence(gs, players, sourceIdx);
    return lowQualityConfidence >= 0.55 || !aiSkillDecision?.shouldHunterUseSkill;
  }
  if (aiEffRole === ROLE_CULTIST) {
    const bestSanLoss = bestCultistBewitchSanLoss(ai.hand);
    return !cultistBewitchPlan || bestSanLoss <= 1;
  }
  return true;
}

/**
 * 清空玩家的神牌区域，并将神牌移入弃牌堆。
 */
export function clearPlayerGodZone(targetPlayer, discard) {
  if (targetPlayer?.godZone?.length) discard.push(...targetPlayer.godZone);
  if (targetPlayer) {
    targetPlayer.godZone = [];
    targetPlayer.godName = null;
    targetPlayer.godLevel = 0;
  }
}

/**
 * AI 弃牌至手牌上限。
 */
export function discardAiHandToLimit(P, ct, Disc, L, D = [], discardedCards = []) {
  const aiHandLimit = P[ct]._nyaHandLimit ?? 4;
  while (P[ct].hand.length > aiHandLimit) {
    const c = P[ct].hand.shift();
    if (isBlackGoatYoung(c) || isTsathogguaSlime(c)) {
      L.push(`${P[ct].name} 的衍生牌被销毁`);
    } else {
      Disc.push(c);
      discardedCards.push(c);
      L.push(`${P[ct].name} 弃 ${cardLogText(c, { alwaysShowName: true })}（上限）`);
      const balance = applyBalanceDiscardSideEffects({ players: P, deck: D, discard: Disc, log: L, ownerIdx: ct, cards: [c], reason: '手牌上限弃牌', applyHpDamage: applyHpDamageWithLink, submitDamage: submitDamageEvents, currentTurn: ct });
      P.splice(0, P.length, ...balance.players);
      D.splice(0, D.length, ...balance.deck);
      Disc.splice(0, Disc.length, ...balance.discard);
      L.splice(0, L.length, ...balance.log);
    }
  }
}

function buildAiEndTurnReplayResolutionQueue({ beforeGs, afterGs }) {
  return buildAnimQueue(beforeGs, afterGs).filter(step => step?.type !== 'DRAW_CARD');
}

function replayStatePatch(P, D, Disc, L) {
  // Each replay step must own an immutable snapshot. The corridor resolver
  // keeps mutating these collections while it processes the remaining hand;
  // retaining their references makes every earlier STATE_PATCH jump to the
  // final hand/discard state and visually collapses consecutive discards.
  return statePatchStep({
    players: copyPlayers(P),
    deck: [...D],
    discard: [...Disc],
    log: [...L],
  });
}

export function processAiEndTurnReplayHand(P, D, Disc, L, ct, gs) {
  const handCards = P[ct]?.hand || [];
  const replayIds = getEndTurnReplayHandCards(P[ct]).map(card => card?.id).filter(id => id != null);
  if (!replayIds.length) return { P, D, Disc, L, statePatch: {}, replayQueue: [], replayMsgs: [] };
  const replayMsgs = [];
  const introMsg = `【无尽通道】${P[ct].name} 展示所有手牌：${handCards.map(card => cardLogText(card, { alwaysShowName: true })).join(' ')}`;
  const replayQueue = [{ type: 'ENDLESS_CORRIDOR_TUNNEL', msgs: [introMsg] }];
  L.push(introMsg);
  replayMsgs.push(introMsg);
  let statePatch = {};
  for (const cardId of replayIds) {
    const handIdx = (P[ct].hand || []).findIndex(card => card?.id === cardId);
    if (handIdx < 0 || P[ct].isDead) break;
    const card = P[ct].hand[handIdx];
    const drawMsg = `【无尽通道】${P[ct].name} 重新摸到 ${cardLogText(card, { alwaysShowName: true })}`;
    L.push(drawMsg);
    replayMsgs.push(drawMsg);
    replayQueue.push({
      type: 'DRAW_CARD',
      card,
      triggerName: '无尽通道',
      targetPid: ct,
      skipTravel: true,
      msgs: [drawMsg],
    });
    if (card.isGod) {
      const beforePlayers = copyPlayers(P);
      const beforeDeck = [...D];
      const beforeDiscard = [...Disc];
      const beforeLog = [...L];
      const beforePatch = statePatch;
      P[ct].hand.splice(handIdx, 1);
      const encounterProgress = advanceGodEncounter(P[ct], gs);
      const godCost = encounterProgress.sanLoss;
      const revealedCultist = isRevealedCultist(P[ct]);
      const effectMsg = revealedCultist
        ? `${P[ct].name}（邪祀者）遭遇邪神 ${card.name}！（${formatGodEncounterProgress(encounterProgress)}）免疫SAN损耗`
        : `${P[ct].name} 遭遇邪神 ${card.name}！（${formatGodEncounterProgress(encounterProgress)}）${formatSanLoss(godCost)}`;
      L.push(effectMsg);
      let inspectionMeta = makeInspectionMeta({ ...gs, ...statePatch });
      if (!revealedCultist && godCost > 0) {
        const processed = applySanLossToPlayerWithInspection(ct, godCost, gs.currentTurn ?? ct, P, D, Disc, L, inspectionMeta, '邪神遭遇');
        P = processed.P; D = processed.D; Disc = processed.Disc; L = processed.L; inspectionMeta = processed.inspectionMeta;
      }
      const gr = aiHandleGodCard(ct, card, P, D, Disc, L, { ...gs, ...statePatch, ...inspectionMeta }, true);
      P = gr.P; D = gr.D; Disc = gr.Disc;
      statePatch = { ...statePatch, ...inspectionMeta, ...(gr.inspectionMeta || {}), ...(gr.statePatch || {}) };
      const resolutionQueue = buildAiEndTurnReplayResolutionQueue({
        beforeGs: { ...gs, ...beforePatch, players: beforePlayers, deck: beforeDeck, discard: beforeDiscard, log: beforeLog },
        afterGs: { ...gs, ...statePatch, players: P, deck: D, discard: Disc, log: L },
      });
      replayQueue.push(...resolutionQueue, replayStatePatch(P, D, Disc, L));
      continue;
    }
    const keep = card?.type === END_TURN_EVENT.END_TURN_REPLAY_HAND || !isZoneCard(card) || aiShouldKeepZoneCard(card, ct, P, false, { discard: Disc, deck: D, gs });
    if (!keep) {
      const [discarded] = P[ct].hand.splice(handIdx, 1);
      if (isBlackGoatYoung(discarded) || isTsathogguaSlime(discarded)) L.push(`${P[ct].name} 的衍生牌被销毁`);
      else {
        Disc.push(discarded);
        const discardMsg = `${P[ct].name} 弃置了 ${cardLogText(discarded, { alwaysShowName: true })}`;
        L.push(discardMsg);
        replayMsgs.push(discardMsg);
        replayQueue.push({
          type: 'DISCARD',
          card: discarded,
          triggerName: P[ct].name,
          targetPid: ct,
          msgs: [discardMsg],
        });
        const beforeBalancePlayers = copyPlayers(P);
        const beforeBalanceDeck = [...D];
        const beforeBalanceDiscard = [...Disc];
        const beforeBalanceLog = [...L];
        const beforeBalancePatch = statePatch;
        const balance = applyBalanceDiscardSideEffects({ players: P, deck: D, discard: Disc, log: L, ownerIdx: ct, cards: [discarded], reason: '无尽通道弃牌', applyHpDamage: applyHpDamageWithLink, submitDamage: submitDamageEvents, currentTurn: gs.currentTurn });
        P = balance.players; D = balance.deck; Disc = balance.discard; L = balance.log;
        const balanceQueue = buildAiEndTurnReplayResolutionQueue({
          beforeGs: { ...gs, ...beforeBalancePatch, players: beforeBalancePlayers, deck: beforeBalanceDeck, discard: beforeBalanceDiscard, log: beforeBalanceLog },
          afterGs: { ...gs, ...statePatch, players: P, deck: D, discard: Disc, log: L },
        });
        replayQueue.push(...balanceQueue);
      }
      replayQueue.push(replayStatePatch(P, D, Disc, L));
      continue;
    }
    const beforePlayers = copyPlayers(P);
    const beforeDeck = [...D];
    const beforeDiscard = [...Disc];
    const beforeLog = [...L];
    const beforePatch = statePatch;
    const res = applyFx(card, ct, null, P, D, Disc, { ...gs, ...statePatch, players: P, deck: D, discard: Disc, log: L }, false, [], true);
    P = res.P; D = res.D; Disc = res.Disc;
    if (res.msgs?.length) L.push(...res.msgs);
    statePatch = { ...statePatch, ...(res.statePatch || {}) };
    // The replayed card already exists in the logical hand, but it is visually
    // treated as a fresh draw.  Commit that visible "gain" before resolving its
    // stats so a prior action heal (notably Rest) cannot run straight into a
    // Dragon Heart heal with no corridor/card boundary between them.
    replayQueue.push(cardTransferStep({
      fromPid: ct,
      dest: 'player',
      toPid: ct,
      count: 1,
      sourceAnchor: 'playerArea',
      effect: 'draw',
      cards: [card],
      msgs: [drawMsg],
    }));
    const resolutionQueue = buildAiEndTurnReplayResolutionQueue({
      beforeGs: { ...gs, ...beforePatch, players: beforePlayers, deck: beforeDeck, discard: beforeDiscard, log: beforeLog },
      afterGs: { ...gs, ...statePatch, players: P, deck: D, discard: Disc, log: L },
    });
    replayQueue.push(...resolutionQueue, replayStatePatch(P, D, Disc, L));
    if (hasEffectDecisionState(res.statePatch)) {
      break;
    }
  }
  return { P, D, Disc, L, statePatch, replayQueue, replayMsgs };
}

function processAiCthEndTurnDraws(P, D, Disc, L, ct, gs, drawCount) {
  if (!drawCount) return { P, D, Disc, L, statePatch: {}, replayQueue: [], replayMsgs: [] };
  const replayQueue = [];
  const replayMsgs = [];
  let statePatch = {};
  const introMsg = `${P[ct].name}（克苏鲁信徒Lv.${P[ct].godLevel || drawCount}）梦访拉莱耶，翻面结束回合时额外摸${drawCount}张牌`;
  L.push(introMsg);
  replayMsgs.push(introMsg);
  replayQueue.push({ type: 'CTH_RLYEH_DREAM', targetPid: ct, msgs: [introMsg] });

  for (let index = 0; index < drawCount; index++) {
    if (!P[ct] || P[ct].isDead) break;
    const beforeGs = {
      ...gs,
      ...statePatch,
      players: copyPlayers(P),
      deck: [...D],
      discard: [...Disc],
      log: [...L],
    };
    const result = aiDrawAndApply(ct, P, D, Disc, { ...beforeGs, deferAiGodChoice: false });
    P = result.P;
    D = result.D;
    Disc = result.Disc;
    statePatch = { ...statePatch, ...(result.statePatch || {}) };
    const drawMsgs = [result.reshuffleLog, ...(result.effectMsgs || [])].filter(Boolean);
    L.push(...drawMsgs);
    replayMsgs.push(...drawMsgs);
    if (result.drawnCard) {
      replayQueue.push({
        type: 'DRAW_CARD',
        card: result.drawnCard,
        triggerName: P[ct]?.name || '该AI',
        targetPid: ct,
        msgs: drawMsgs,
      });
    }
    const afterGs = {
      ...gs,
      ...statePatch,
      players: P,
      deck: D,
      discard: Disc,
      log: L,
    };
    replayQueue.push(
      ...buildAiEndTurnReplayResolutionQueue({ beforeGs, afterGs }),
      replayStatePatch(P, D, Disc, L),
    );
    if (checkWin(P, gs?._isMP) || hasEffectDecisionState(result.statePatch)) break;
  }
  return { P, D, Disc, L, statePatch, replayQueue, replayMsgs };
}

// AI and player turns share the same end-turn registry and priority order.
// Handlers remain AI-specific because decisions are automatic, but no AI path
// may reorder or bypass registered events before entering the next turn.
export function processAiEndTurnEvents(P, D, Disc, L, ct, gs) {
  const events = getEndTurnEvents(P, ct);
  const replayQueue = [];
  const replayMsgs = [];
  let statePatch = {};

  for (const event of events) {
    const eventGs = { ...gs, ...statePatch, players: P, deck: D, discard: Disc, log: L, _turnFlowStage: TURN_FLOW_STAGE.END_TURN };
    if (event.id === END_TURN_EVENT.CTH_REST_DRAW) {
      const resolved = processAiCthEndTurnDraws(P, D, Disc, L, ct, eventGs, event.drawCount);
      P = resolved.P; D = resolved.D; Disc = resolved.Disc; L = resolved.L;
      statePatch = { ...statePatch, ...resolved.statePatch };
      replayQueue.push(...resolved.replayQueue);
      replayMsgs.push(...resolved.replayMsgs);
      continue;
    }
    if (event.id === END_TURN_EVENT.REVERSE_TURN_ORDER) {
      const resolved = resolveReverseTurnOrderAtEnd(P, ct, eventGs.turnDirection, L, event.reverseCount);
      P = resolved.players; L = resolved.log;
      statePatch = { ...statePatch, turnDirection: resolved.turnDirection };
      replayQueue.push(statePatchStep({
        players: copyPlayers(P),
        log: [...L],
        turnDirection: resolved.turnDirection,
        msgs: resolved.msgs,
      }));
      replayMsgs.push(...resolved.msgs);
      continue;
    }
    if (event.id === END_TURN_EVENT.TSG_SLIME_GRANT) {
      const visualEvents = [];
      const grant = grantTsathogguaSlimeAtEndTurn(P, ct, L, visualEvents);
      if (grant) {
        const grantEvent = createTsathogguaSlimeGrantEvent(grant);
        replayQueue.push(...buildTsathogguaSlimeGrantSteps(grantEvent, eventGs));
        replayMsgs.push(...(grant.msgs || []));
        const gainPatch = appendPublicCardGainTriggers(eventGs, P, grant.ownerIdx, grant.cards);
        statePatch = { ...statePatch, ...gainPatch };
      } else if (visualEvents.length) {
        replayQueue.push(...buildGodPowerBlockedStepsFromVisualEvents({ ...eventGs, players: P, _visualEvents: visualEvents }));
        replayMsgs.push(...visualEvents.flatMap(item => item?.msgs || []));
      }
      statePatch = { ...statePatch, _tsgSlimeGrantedAtTurnEnd: true };
      continue;
    }
    if (event.id === END_TURN_EVENT.END_TURN_REPLAY_HAND) {
      const resolved = processAiEndTurnReplayHand(P, D, Disc, L, ct, eventGs);
      P = resolved.P; D = resolved.D; Disc = resolved.Disc; L = resolved.L;
      statePatch = { ...statePatch, ...resolved.statePatch };
      replayQueue.push(...resolved.replayQueue);
      replayMsgs.push(...resolved.replayMsgs);
    }
  }

  return { P, D, Disc, L, statePatch, replayQueue, replayMsgs, events };
}

export function aiStep(gs, opts = {}) {
  const{players:ps,currentTurn:ct,abilityData}=gs;
  const incomingVisualEventIds = new Set(
    (Array.isArray(gs?._visualEvents) ? gs._visualEvents : [])
      .map(event => event?.id)
      .filter(Boolean),
  );
  const incomingVisualEventRefs = new Set(Array.isArray(gs?._visualEvents) ? gs._visualEvents : []);
  let P=copyPlayers(ps),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
  const getAi=()=>P[ct];
  const getAlive=()=>P.filter((p,i)=>!p.isDead&&i!==ct);
  let ai=getAi();let alive=getAlive();
  const aiHuntEvents=[];
  let animMultiplyEvent = null;
  let playersBeforeSkillAction=null;
  let preSkillLogs=[];
  let preSkillDiscard=null;
  const getReplayVisualEvents = (nextGs) => {
    const freshCurrentTurnEvents = (Array.isArray(gs?._visualEvents) ? gs._visualEvents : [])
      .filter(event => event?.id
        ? !incomingVisualEventIds.has(event.id)
        : !incomingVisualEventRefs.has(event));
    // startNextTurn now produces the next turn's own visual events in the rule
    // layer. Preserve action events first, then append that next-turn
    // transaction; never let incoming events from an older replay leak in.
    if (Object.prototype.hasOwnProperty.call(nextGs || {}, '_visualEvents')) {
      const nextTurnEvents = Array.isArray(nextGs._visualEvents) ? nextGs._visualEvents : [];
      const combined = [...freshCurrentTurnEvents, ...nextTurnEvents]
        .filter((event, index, events) => !event?.id || events.findIndex(candidate => candidate?.id === event.id) === index);
      return combined.length ? combined : null;
    }
    return freshCurrentTurnEvents.length ? freshCurrentTurnEvents : null;
  };
  let unifiedReplayCacheState = null;
  let unifiedReplayCache = null;
  const getUnifiedReplayVisualEvents = nextGs => {
    if (unifiedReplayCacheState === nextGs && unifiedReplayCache) return unifiedReplayCache;
    const baseEvents = getReplayVisualEvents(nextGs) || [];
    const huntEvents = aiHuntEvents.map(createHuntResultEvent).filter(Boolean);
    const multiplyVisualEvent = animMultiplyEvent
      ? createMultiplyVisualEvent(animMultiplyEvent)
      : null;
    unifiedReplayCacheState = nextGs;
    unifiedReplayCache = [...baseEvents, ...huntEvents, ...(multiplyVisualEvent ? [multiplyVisualEvent] : [])];
    return unifiedReplayCache;
  };

  const buildReturnPack = (nextGs, P_afterAction, P_beforeEndTurnReplay = null) => ({
    ...nextGs,
    _animAiDrawnCard: gs._aiDrawnCard ?? gs._drawnCard ?? null,
    _animDiscardedDrawnCard: gs._discardedDrawnCard ?? false,
    _aiName: ai.name,
    _playersBeforeNextDraw: P_afterAction,
    _playersBeforeSkillAction: playersBeforeSkillAction,
    _preSkillLogs: preSkillLogs,
    _preSkillDiscard: preSkillDiscard,
    ...(P_beforeEndTurnReplay ? { _playersBeforeEndTurnReplay: P_beforeEndTurnReplay } : {}),
    ...(aiHuntEvents.length ? { _aiHuntEvents: aiHuntEvents } : {}),
    ...(animMultiplyEvent ? { _animMultiplyEvent: animMultiplyEvent } : {}),
    ...(getUnifiedReplayVisualEvents(nextGs).length ? { _visualEvents: getUnifiedReplayVisualEvents(nextGs) } : {})
  });

  const buildPendingSlimeBalanceState = (state, nextPlayers, nextDeck, nextDiscard, nextLog, extra = {}) => {
    if (state?.abilityData?.type !== 'tsgSlimeBalance') return null;
    return {
      ...state,
      players: nextPlayers,
      deck: nextDeck,
      discard: nextDiscard,
      log: nextLog,
      currentTurn: ct,
      phase: 'TSG_SLIME_BALANCE',
      abilityData: { ...state.abilityData, _turnOwner: ct },
      skillUsed: true,
      ...extra,
    };
  };

  let lastApophisTargetEvent = null;
  const consumeLastApophisTargetEvent = () => {
    const event = lastApophisTargetEvent;
    lastApophisTargetEvent = null;
    return event;
  };
  const applyNightTarget = (selectedIdx, legalTargets, label) => {
    const night = resolveApophisTarget({
      gs,
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      actorIdx: ct,
      selectedIdx,
      legalTargets,
      label,
    });
    P = night.players;
    ai=getAi();alive=getAlive();
    D = night.deck;
    Disc = night.discard;
    L = night.log;
    gs = { ...gs, ...(night.statePatch || {}) };
    lastApophisTargetEvent = night.apophisTargetEvent || null;
    return night.targetIdx;
  };

  // 提取蛊惑赠予的核心逻辑（主行动路径与强制路径共用）
  const applyBewitchGift = (_gs, _P, _D, _Disc, _L, _ct, _ti, _sc) => {
    let inspectionMeta = makeInspectionMeta(_gs);
    _P[_ct].hand = _P[_ct].hand.filter(c => c.id !== _sc.id);
    const bewitchMsg = `${_P[_ct].name}（邪祀者）对 ${_P[_ti].name} 【蛊惑】，赠予 ${cardLogText(_sc, { alwaysShowName: true })}`;
    _L.push(bewitchMsg);
    let encounterState = null;
    let fxResult = null;
    if (_sc.isGod) {
      const encounterProgress = advanceGodEncounter(_P[_ti], _gs);
      const godCost = encounterProgress.sanLoss;
      const revealedCultist = isRevealedCultist(_P[_ti]);
      const effectMsg = revealedCultist
        ? `${_P[_ti].name}（邪祀者）遭遇邪神 ${_sc.name}！（${formatGodEncounterProgress(encounterProgress)}）免疫SAN损耗`
        : `${_P[_ti].name} 遭遇邪神 ${_sc.name}！（${formatGodEncounterProgress(encounterProgress)}）${formatSanLoss(godCost)}`;
      _L.push(effectMsg);
      if (!revealedCultist && godCost > 0) {
        const processed = applySanLossToPlayerWithInspection(_ti, godCost, _gs.currentTurn, _P, _D, _Disc, _L, inspectionMeta, '邪神遭遇');
        _P = processed.P; _D = processed.D; _Disc = processed.Disc;
        inspectionMeta = processed.inspectionMeta;
        _L.splice(0, _L.length, ...processed.L);
      }
      encounterState = {
        players: copyPlayers(_P),
        deck: [..._D],
        discard: [..._Disc],
        log: [..._L],
        currentTurn: _gs.currentTurn,
        _inspectionEvents: [...(inspectionMeta?._inspectionEvents || [])],
        _inspectionSeq: inspectionMeta?._inspectionSeq || 0,
        _statEvents: [...(inspectionMeta?._statEvents || [])],
        _statEventSeq: inspectionMeta?._statEventSeq || 0,
        _visualEvents: [...(_gs?._visualEvents || [])],
      };
      const godResolveGs = { ..._gs, ...inspectionMeta };
      const shouldDeferShuTarget = _sc.godKey === 'SHU' && _ti === 0 && !opts.allAi;
      const gr = aiHandleGodCard(_ti, _sc, _P, _D, _Disc, _L, godResolveGs, true, true, { deferShuTarget: shouldDeferShuTarget });
      _P = gr.P; _D = gr.D; _Disc = gr.Disc;
      const mergedInspectionMeta = {
        ...inspectionMeta,
        ...(gr.inspectionMeta || {}),
        ...((gr.inspectionMeta?.abilityData || inspectionMeta?.abilityData) ? { abilityData: gr.inspectionMeta?.abilityData || inspectionMeta.abilityData } : {}),
      };
      _gs = { ..._gs, ...mergedInspectionMeta, ...(gr.statePatch || {}) };
    } else {
      _P[_ti].hand.push(_sc);
      fxResult = applyFx(
        _sc,
        _ti,
        _sc.type === 'swapAllHands' ? null : _ti,
        _P,
        _D,
        _Disc,
        _gs,
        false,
        [],
        !!opts.allAi,
      );
      _P = fxResult.P; _D = fxResult.D; _Disc = fxResult.Disc;
      _L.push(...fxResult.msgs);
      _gs = { ..._gs, ...fxResult.statePatch };
    }
    const bewitchEvent = createBewitchGiftEvent({
      sourceIdx: _ct,
      targetIdx: _ti,
      targetName: _P[_ti].name,
      card: _sc,
      msgs: [bewitchMsg],
      encounterState,
    });
    if (bewitchEvent) {
      _gs = { ..._gs, _visualEvents: [bewitchEvent, ...(_gs._visualEvents || [])] };
    }
    return { gs: _gs, P: _P, D: _D, Disc: _Disc, L: _L, fxResult };
  };

  const buildDeferredShuTargetState = (_gs, _P, _D, _Disc, _L) => {
    if (!_gs?._deferredShuTarget) return null;
    return {
      ..._gs,
      players: _P,
      deck: _D,
      discard: _Disc,
      log: _L,
      currentTurn: ct,
      phase: 'SHU_SELECT_TARGET',
      abilityData: _gs.abilityData,
      huntAbandoned: newAbandoned,
      skillUsed: true,
      _aiDrawnCard: (gs._aiDrawnCard ?? gs._drawnCard ?? null),
      _discardedDrawnCard: (gs._discardedDrawnCard ?? false),
      _aiName: ai.name,
      _playersBeforeNextDraw: copyPlayers(_P),
      _playersBeforeSkillAction: playersBeforeSkillAction,
      _preSkillLogs: preSkillLogs,
      _preSkillDiscard: preSkillDiscard,
      _aiHuntEvents: aiHuntEvents,
    };
  };

  const buildBewitchTreasureWinState = (_gs, _P, _D, _Disc, _L, targetIdx) => {
    const target = _P[targetIdx];
    const effectiveRole = target?._nyaBorrow || target?.role;
    if (!target || target.isDead || effectiveRole !== ROLE_TREASURE || !isWinHand(target.hand)) return null;
    _P[targetIdx] = { ...target, roleRevealed: true };
    const isLocalPlayer = targetIdx === 0 && !_gs._isMP;
    const winnerName = isLocalPlayer ? '你' : _P[targetIdx].name;
    const winLog = isLocalPlayer ? '你集齐了全部编号！' : `${_P[targetIdx].name} 集齐全部编号并获胜！`;
    return withClearedTurnAnimFields({
      ..._gs,
      players: _P,
      deck: _D,
      discard: _Disc,
      log: [..._L, winLog],
      abilityData: {},
      phase: 'AI_TURN',
      gameOver: {
        winner: ROLE_TREASURE,
        reason: isLocalPlayer ? '你集齐了全部编号并获胜！' : `${winnerName} 集齐了全部编号并获胜！`,
        winnerIdx: targetIdx,
      },
    });
  };

  if(abilityData?.type==='firstComePick'&&Array.isArray(abilityData.revealedCards)){
    const pickOrder=abilityData.pickOrder||[];
    const pickIndex=abilityData.pickIndex||0;
    const pickerIdx=pickOrder[pickIndex];
    if(pickerIdx==null)return {...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{},phase:'AI_TURN'};
    return {...gs,players:P,deck:D,discard:Disc,log:L,phase:'FIRST_COME_PICK_SELECT',abilityData};
  }

  if(abilityData?.type==='sameAbyssChoice'){
    return {...gs,players:P,deck:D,discard:Disc,log:L,phase:'SAME_ABYSS_SELECT',abilityData};
  }

  if(abilityData?.type==='sphinxGuess'){
    return {...gs,players:P,deck:D,discard:Disc,log:L,phase:'SPHINX_GUESS',abilityData};
  }

  if(Array.isArray(abilityData?.peekHandTargets)&&abilityData.peekHandSource===ct){
    return {...gs,players:P,deck:D,discard:Disc,log:L,phase:'PEEK_HAND_SELECT_TARGET',abilityData};
  }

  if(Array.isArray(abilityData?.damageLinkTargets)&&abilityData.damageLinkSource===ct){
    const validTargets=abilityData.damageLinkTargets.filter(i=>P[i]&&!P[i].isDead&&i!==ct);
    if(validTargets.length>0){
      const targetIdx=applyNightTarget(validTargets[0],validTargets,'选择【两人一绳】目标');
      P[ct].damageLink={partner:targetIdx,active:true,expiryOwner:ct};
      P[targetIdx].damageLink={partner:ct,active:true,expiryOwner:ct};
      L.push(`【两人一绳】${P[ct].name} 与 ${P[targetIdx].name} 间架起链条，一方受到HP伤害时另一方受等量伤害`);
      const win=checkWin(P,gs._isMP);
      if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,abilityData:{},phase:'AI_TURN'};
      return{...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{},phase:'AI_TURN'};
    }
    return {...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{},phase:'AI_TURN'};
  }

  if(abilityData.roseThornTargets&&abilityData.roseThornSource===ct){
    const validTargets=abilityData.roseThornTargets.filter(i=>P[i]&&!P[i].isDead&&i!==ct);
    if(validTargets.length){
      const targetIdx=applyNightTarget(chooseAiRoseThornTarget(P, ct, validTargets),validTargets,'选择【玫瑰倒刺】目标');
      const gifted=P[ct].hand.splice(0).map(card=>({...card,roseThornHolderId:targetIdx,roseThornSourceId:ct,roseThornSourceName:P[ct].name}));
      P[targetIdx].hand.push(...gifted);
      L.push(`【玫瑰倒刺】${P[ct].name} 将全部手牌交给了 ${P[targetIdx].name}`);
      if(!P[targetIdx].isDead&&P[targetIdx].role===ROLE_TREASURE&&isWinHand(P[targetIdx].hand)){
        P[targetIdx].roleRevealed=true;
        return withClearedTurnAnimFields({
          ...gs,
          players:P,
          deck:D,
          discard:Disc,
          log:[...L,`${P[targetIdx].name} 集齐全部编号并获胜！`],
          gameOver:{winner:ROLE_TREASURE,reason:`${P[targetIdx].name} 集齐了全部编号并获胜！`,winnerIdx:targetIdx},
          abilityData:{},
          phase:'AI_TURN',
        });
      }
    }
    return withClearedTurnAnimFields({
      ...gs,
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      abilityData:{},
      phase:'AI_TURN',
    });
  }
  if(P[ct].isDead){
    const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    const _P_afterAction=copyPlayers(P);
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:gs.huntAbandoned||[],skillUsed:gs.skillUsed}, opts);
    return buildReturnPack(nextGs, _P_afterAction);
  }

  // 处理AI触发的需要目标选择的效果
  if(abilityData.caveDuelTargets&&abilityData.caveDuelSource===ct){
    // 穴居人战争目标选择
    const validTargets=abilityData.caveDuelTargets;
    let proliferatingZPatch={};
    if(validTargets.length>0){
      // AI随机选择一个目标
      const targetIdx=applyNightTarget(validTargets[Math.floor(Math.random()*validTargets.length)],validTargets,'选择【穴居人战争】目标');
      // 执行穴居人战争效果
      const sourcePlayer=P[ct];
      const targetPlayer=P[targetIdx];

      // 源角色（AI）按穴居人战争规则选择牌
      let sourceCardIndex=getBestCaveDuelCardIndex(sourcePlayer.hand), sourceCard;
      sourceCard=sourcePlayer.hand[sourceCardIndex];

      // 目标角色选择牌
      let targetCardIndex, targetCard;
      if(targetIdx===0&&!opts.allAi){
        // 玩家作为目标角色，需要选择牌
        return withClearedTurnAnimFields({
          ...gs,
          players:P,
          deck:D,
          discard:Disc,
          log:L,
          abilityData:{...abilityData,caveDuelTarget:targetIdx,sourceCardIndex:sourceCardIndex,sourceCard:sourceCard},
          currentTurn:ct,
          phase:'CAVE_DUEL_SELECT_CARD',
        });
      }else{
        // AI作为目标角色，按盲选启发式选择，不查看源角色亮牌
        targetCardIndex=getBestCaveDuelCardIndex(targetPlayer.hand);
        targetCard=targetPlayer.hand[targetCardIndex];

        const outcome=resolveCaveDuelOutcome({
          players:P,
          sourceIdx:ct,
          targetIdx,
          sourceCardIndex,
          targetCardIndex,
          sourceCard,
          targetCard,
        });
        P=outcome.players;ai=getAi();alive=getAlive();
        L.push(outcome.logLine);
        if(outcome.winnerIdx!=null&&outcome.gainedCard){
          proliferatingZPatch=appendPublicCardGainTriggers(
            gs,
            P,
            outcome.winnerIdx,
            outcome.gainedCard
          );
        }
      }
    }
    // 清除能力数据
    return withClearedTurnAnimFields({
      ...gs,
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      abilityData:{},
      currentTurn:ct,
      phase:'AI_TURN',
      ...proliferatingZPatch,
    });
  }
  if((ai._nyaBorrow||ai.role)===ROLE_TREASURE&&isWinHand(ai.hand)){P[ct].roleRevealed=true;return{...gs,players:P,log:[...L,`${ai.name} 宣告获胜！`],gameOver:{winner:ROLE_TREASURE,reason:`${ai.name} 集齐了全部编号并获胜！`,winnerIdx:ct}};}
  // AI worship-from-hand: face-down god cards in hand can be worshipped (no skull counter, once per turn)
  if(!gs.skillUsed&&!gs.restUsed){
    const handGodIdx=P[ct].hand.findIndex(c=>c.isGod);
    if(handGodIdx>=0){
      const hgc=P[ct].hand[handGodIdx];
      let inspectionMeta=makeInspectionMeta(gs);
      const alreadyHasGod=P[ct].godName&&P[ct].godName!==hgc.godKey;
      const handAiEffRole=gs.globalOnlySwapOwner!=null?ROLE_TREASURE:(P[ct]._nyaBorrow||P[ct].role);
      const reserveForCultistBewitch=handAiEffRole===ROLE_CULTIST&&!gs.multiplyUsed&&!!chooseAiCultistBewitchPlan(P,ct);
      const handGodAction=reserveForCultistBewitch?'discard':chooseAiGodEncounterAction(ct,hgc,P,false);
      const willWorship=handGodAction==='worship'||handGodAction==='convert'||handGodAction==='upgrade';
      if(willWorship){
        const handWorshipPlayersBefore=copyPlayers(P);
        let previousFaithExit=null;
        let faithEstablished=null;
        const abandonedFaithExits=[];
        let presentAfterInspectionSeq=null;
        const worshipLogStart=L.length;
        P[ct].hand.splice(handGodIdx,1);
        if(P[ct].godName===hgc.godKey&&P[ct].godLevel<3){
          L.push(buildWorshipFromHandLog(P[ct].name,hgc,{upgrade:true,level:P[ct].godLevel+1}));
        } else if(!P[ct].godName||alreadyHasGod){
          L.push(buildWorshipFromHandLog(P[ct].name,hgc));
        }
        // Forced convert if worshipping different god
        if(alreadyHasGod){
          const inspectionSeqBefore=inspectionMeta?._inspectionSeq||0;
          const converted=convertGodFollower(ct,gs.currentTurn,P,D,Disc,L,inspectionMeta,`${P[ct].name} 改信新神，${formatSanLoss(1)}`,hgc);
          P=converted.P;D=converted.D;Disc=converted.Disc;L=converted.L;inspectionMeta=converted.inspectionMeta;
          previousFaithExit=converted.faithExit||null;
          faithEstablished=converted.faithEstablished||null;
          if((inspectionMeta?._inspectionSeq||0)>inspectionSeqBefore)presentAfterInspectionSeq=inspectionMeta._inspectionSeq;
          ai=getAi();alive=getAlive();
        } else if(P[ct].godName===hgc.godKey&&P[ct].godLevel<3){
          const playersBeforeFaithEstablished=copyPlayers(P);
          P[ct].godLevel++;P[ct].godZone.push({...hgc});
          faithEstablished={playersBefore:playersBeforeFaithEstablished,playersAfter:copyPlayers(P)};
        } else if(!P[ct].godName){
          const playersBeforeFaithEstablished=copyPlayers(P);
          P[ct].godName=hgc.godKey;P[ct].godLevel=1;P[ct].godZone=[{...hgc}];
          faithEstablished={playersBefore:playersBeforeFaithEstablished,playersAfter:copyPlayers(P)};
        }
        P[ct].hasBelievedGod=true;
        if(faithEstablished)faithEstablished.playersAfter=copyPlayers(P);
        P.forEach((p,i)=>{
          if(i===ct||p.godName!==hgc.godKey)return;
          const abandoned=abandonGodFollower(i,gs.currentTurn,P,D,Disc,L,inspectionMeta);
          P=abandoned.P;D=abandoned.D;Disc=abandoned.Disc;L=abandoned.L;inspectionMeta=abandoned.inspectionMeta;
          if(abandoned.faithExit)abandonedFaithExits.push(abandoned.faithExit);
          ai=getAi();alive=getAlive();
        });
        let handWorshipBlockedEvent = null;
        if(['APO','ZHU','SHU'].includes(hgc.godKey)&&hasGodPowerImmunity(P[ct])){
          const blockedLog=buildGodPowerBlockedLog(P[ct]);
          L.push(blockedLog);
          handWorshipBlockedEvent=createGodPowerBlockedEvent({playerIdx:ct,playerName:P[ct].name,msgs:[blockedLog]});
        }
        if(hgc.godKey==='APO'&&canGodPowerAffect(P[ct])){
          gs={...gs,apophisNight:getApophisNightForLevel(P[ct].godLevel)};
          L.push(buildApophisNightLog());
        }

        const handWorshipEvent=createGodStatusChangedEvent({
          playerIdx:ct,
          playerName:P[ct].name,
          godKey:P[ct].godName,
          godLevel:P[ct].godLevel,
          msgs:L.slice(worshipLogStart,worshipLogStart+1),
          playersBefore:faithEstablished?.playersBefore||handWorshipPlayersBefore,
          playersAfter:faithEstablished?.playersAfter||copyPlayers(P),
          faithSettlement:{previousFaithExit,abandonedFollowers:abandonedFaithExits},
          presentAfterInspectionSeq,
        });
        playersBeforeSkillAction=copyPlayers(P);
        preSkillLogs=L.slice(worshipLogStart);
        preSkillDiscard=[...Disc];
        gs={...gs,...inspectionMeta,_visualEvents:[
          ...(gs._visualEvents||[]),
          ...(handWorshipEvent?[handWorshipEvent]:[]),
          ...(handWorshipBlockedEvent?[handWorshipBlockedEvent]:[]),
        ]};
        const ww=checkWin(P,gs._isMP);if(ww)return{...gs,players:P,deck:D,discard:Disc,log:L,...inspectionMeta,gameOver:ww};
      }
    }
  }
  // ── AI Rest (新版策略) ───────────────────────────────────────
  // HP≤4时积极休息（已进入斩杀线）
  // 寻宝者HP≤4：除非掉包可获胜或避免进度倒退，否则休息
  // 邪祀者HP≤4：除非蛊惑可获胜或清空手牌，否则休息
  // 邪祀者HP≤2：除非蛊惑可获胜，否则必须休息（已进入AOE斩杀线）
  // 追猎者HP≤5：积极休息
  const aiEffRole=gs.globalOnlySwapOwner!=null?ROLE_TREASURE:(P[ct]._nyaBorrow||P[ct].role);
  const noRestReason=aiShouldNotRest(gs,P[ct],aiEffRole,P,ct);
  let swapTargetOverride=null;
  let treasureSwapPlan=null;
  if(noRestReason?.shouldNotRest){
    if(noRestReason.reason==='swapWin'){
      swapTargetOverride={targetIdx:noRestReason.targetIdx,reason:'win'};
    }else if(noRestReason.reason==='swapAvoidRegression'){
      swapTargetOverride={targetIdx:noRestReason.targetIdx,reason:'avoidRegression'};
    }
  }
  if(aiEffRole===ROLE_TREASURE&&swapTargetOverride?.targetIdx!=null){
    const treasureSwapTargets=alive.filter(p=>p.hand.length>0).map(p=>P.indexOf(p)).filter(i=>i>=0);
    treasureSwapPlan=chooseAiTreasureSwapPlan(P,ct,treasureSwapTargets,swapTargetOverride.targetIdx);
    if(!treasureSwapPlan)swapTargetOverride=null;
  }
  let newAbandoned = gs.huntAbandoned || [];
  const getHunterTargets = () => getHunterChaseTargets(P,ct,newAbandoned);
  const preRestHunterDecision = aiEffRole === ROLE_HUNTER
    ? decideAiSkillUsage(gs,P,ct,aiEffRole,getHunterTargets())
    : null;
  const hunterHasImmediateKill = aiEffRole === ROLE_HUNTER
    && hasImmediateHunterKill(P,ct,newAbandoned);
  const hunterMustChase = !!preRestHunterDecision?.forceHunterChase || hunterHasImmediateKill;
  const shouldRest=(()=>{
    if(noRestReason?.shouldNotRest&&(aiEffRole!==ROLE_TREASURE||!!swapTargetOverride))return false;
    if(aiEffRole===ROLE_HUNTER&&hunterMustChase)return false;
    return shouldAiRest(gs, P[ct], aiEffRole);
  })();
  if(shouldRest){
    const d1=(1+Math.random()*6|0),d2=(1+Math.random()*6|0),heal=Math.max(d1,d2);
    const beforeRestPlayers=copyPlayers(P);
    P[ct].hp=clamp(P[ct].hp+heal);P[ct].isResting=true;
    L.push(`${ai.name} 选择【休息】，掷骰 ${d1}、${d2}，取高值回复 ${heal}HP，翻面休息中`);
    const restStatEventSeq=(gs._statEventSeq||0)+1;
    const restStatEvents=buildStatEvents(beforeRestPlayers,P,L.slice(-1),{reason:'休息',seq:restStatEventSeq});
    const restStatPatch=restStatEvents.length?{_statEvents:[...(gs._statEvents||[]),...restStatEvents],_statEventSeq:restStatEventSeq}:{};
    const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,...restStatPatch};
    discardAiHandToLimit(P, ct, Disc, L);
    const _P_beforeEndTurnReplay = copyPlayers(P);
    const replayed=processAiEndTurnEvents(P,D,Disc,L,ct,{...gs,...restStatPatch});
    P=replayed.P;D=replayed.D;Disc=replayed.Disc;L=replayed.L;ai=getAi();alive=getAlive();
    const _P_afterRest=copyPlayers(P);
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,restUsed:true,skillUsed:false,...restStatPatch,...replayed.statePatch,_aiEndTurnReplayQueue:replayed.replayQueue,_aiEndTurnReplayMsgs:replayed.replayMsgs}, opts);
    return buildReturnPack(nextGs, _P_afterRest, _P_beforeEndTurnReplay);
  }
  // 追猎者按手牌结构与近期追捕失败记录评估；邪祀者积极蛊惑，寻宝者随进度提高掉包意愿。
  let huntContinue = true;
  const aiSkillDecision=preRestHunterDecision||decideAiSkillUsage(gs,P,ct,aiEffRole,getHunterTargets());
  let useSkill=aiSkillDecision.useSkill;
  if(hunterHasImmediateKill)useSkill=true;
  if(gs.multiplyUsed) useSkill=false;
  let cultistBewitchPlan = null;
  if (aiEffRole === ROLE_CULTIST && useSkill) {
    cultistBewitchPlan = chooseAiCultistBewitchPlan(P, ct);
    if (!cultistBewitchPlan && !P[ct].roleRevealed) {
      useSkill = false;
    }
  }
  if (aiEffRole === ROLE_CULTIST && !useSkill && !gs.skillUsed && !gs.multiplyUsed && !gs.restUsed) {
    const canWin = canCultistWinByBewitch(P, ct);
    const canEmpty = canCultistEmptyHandByBewitch(P, ct);
    if ((ai.hp <= 4 && (canWin || canEmpty)) || (ai.hp <= 2 && canWin)) {
      cultistBewitchPlan = chooseAiCultistBewitchPlan(P, ct);
      if (cultistBewitchPlan) {
        useSkill = true;
      }
    }
    if (!useSkill && (P[ct].hand || []).some(card => card?.isGod)) {
      cultistBewitchPlan = chooseAiCultistBewitchPlan(P, ct);
      if (cultistBewitchPlan?.card?.isGod) {
        useSkill = true;
      }
    }
  }
  if (aiEffRole === ROLE_TREASURE && aiSkillDecision.canSwapHands && hasTreasureSwapBuffer(P[ct].hand)) {
    useSkill = true;
  }
  if (aiEffRole === ROLE_TREASURE && treasureSwapPlan) {
    useSkill = true;
  }
  if (aiEffRole === ROLE_CULTIST && cultistBewitchPlan && bestCultistBewitchSanLoss(P[ct].hand) > 1) {
    useSkill = true;
  }
  if (aiEffRole === ROLE_TREASURE && useSkill) {
    if (!treasureSwapPlan) {
      const treasureSwapTargets = alive.filter(p => p.hand.length > 0).map(p => P.indexOf(p)).filter(i => i >= 0);
      treasureSwapPlan = chooseAiTreasureSwapPlan(P, ct, treasureSwapTargets, swapTargetOverride?.targetIdx);
    }
    if (!treasureSwapPlan) useSkill = false;
  }

  const multiplyEvent = (!gs.multiplyUsed && !gs.skillUsed && !gs.restUsed)
    ? getBlackGoatMultiplyEvent(P, ct)
    : null;
  if (multiplyEvent && shouldAiMultiply({ gs, players: P, sourceIdx: ct, aiEffRole, ai: P[ct], aiSkillDecision, cultistBewitchPlan, huntAbandoned: newAbandoned })) {
    const multiplyPlayersBefore = copyPlayers(P);
    const goatCard = createBlackGoatYoungCard();
    P[multiplyEvent.toIdx].hand.push(goatCard);
    L.push(`【繁衍】${P[ct].name} 将黑山羊幼仔传播给了 ${P[multiplyEvent.toIdx].name}`);
    animMultiplyEvent = {
      ...multiplyEvent,
      count: 1,
      cards: [goatCard],
      msgs: [L[L.length - 1]],
      playersBefore: multiplyPlayersBefore,
      playersAfter: copyPlayers(P),
      discardAfter: [...Disc],
    };
    gs = { ...gs, multiplyUsed: true, skillUsed: true, ...appendPublicCardGainTriggers(gs, P, multiplyEvent.toIdx, goatCard) };
    useSkill = false;
  }
  const appendAiEndTurnLog = () => {
    const usedSkillThisTurn = !!(
      useSkill
      || gs.skillUsed
      || gs.multiplyUsed
      || gs.skillActivatedTurn === gs.turn
    );
    L.push(usedSkillThisTurn ? `${ai.name} 结束回合` : `${ai.name} 未使用技能，结束回合`);
  };

  if(aiEffRole!==ROLE_HUNTER && alive.length===0){
    const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    discardAiHandToLimit(P, ct, Disc, L);
    appendAiEndTurnLog();
    const _P_beforeEndTurnReplay = copyPlayers(P);
    const replayed=processAiEndTurnEvents(P,D,Disc,L,ct,gs);
    P=replayed.P;D=replayed.D;Disc=replayed.Disc;L=replayed.L;gs={...gs,...replayed.statePatch};ai=getAi();alive=getAlive();
    const _P_afterAction=copyPlayers(P);
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:gs.skillUsed,_aiEndTurnReplayQueue:replayed.replayQueue,_aiEndTurnReplayMsgs:replayed.replayMsgs}, opts);
    return buildReturnPack(nextGs, _P_afterAction, _P_beforeEndTurnReplay);
  }

  // 如果无法使用技能，重置huntContinue为false，防止无限循环
  if(!useSkill){
    huntContinue = false;
  }

  if(useSkill){
    if(aiEffRole!==ROLE_CULTIST || cultistBewitchPlan){
      P[ct].roleRevealed=true;
    }
    // ── v2 MCTS 目标选择 ────────────────────────────────────
    let tgt;
    if(aiEffRole===ROLE_HUNTER){
        if(!hasHuntRevealableCard(P[ct])) huntContinue = false;
        while (huntContinue && hasHuntRevealableCard(P[ct])) {
        const validTargets = getHunterTargets();
        if (validTargets.length > 0) {
          const sortedTargets = orderHunterChaseTargets(P,ct,validTargets);

          // 遍历所有目标，直到找到可以追捕的目标或用完所有目标
          let foundTarget = false;
          for (const targetEntry of sortedTargets) {
            let ti = applyNightTarget(targetEntry.idx, validTargets.map(t => t.idx), '选择【追捕】目标');
            const apophisTargetEvent = consumeLastApophisTargetEvent();
            const tgt = P[ti];
            const targetHand = P[ti].hand;
            if (!hasHuntRevealableCard(targetHand)) {
              newAbandoned = [...new Set([...newAbandoned, ti])];
              continue;
            }
            if (ti === 0 && !opts.allAi) {
              const huntPromptLogStart = L.length;
              L.push(`${ai.name}（追猎者）向你发动【追捕】！请选择亮出一张手牌`);
              aiHuntEvents.push({
                apophisTargetEvent,
                targetIdx:ti,
                hunterIdx:ct,
                beforePlayers:copyPlayers(P),
                afterPlayers:copyPlayers(P),
                afterResultDiscard:[...Disc],
                beforeLog:L.slice(0,huntPromptLogStart),
                afterLog:[...L],
                msgs:L.slice(huntPromptLogStart),
                skipReveal:true,
              });
              const updatedAbandoned = [...newAbandoned, ti];
              return {...gs, players:P, deck:D, discard:Disc, log:L,
                phase:'PLAYER_REVEAL_FOR_HUNT',
                abilityData:{huntingAI:ct, aiHunterName:ai.name},
                skillUsed:true, skillActivatedTurn:gs.turn, huntAbandoned: updatedAbandoned, _aiName:ai.name, _drawnCard:gs._drawnCard, _aiDrawnCard:gs._aiDrawnCard??gs._drawnCard??null, _discardedDrawnCard:gs._discardedDrawnCard??false, _playersBeforeSkillAction:playersBeforeSkillAction, _preSkillLogs:preSkillLogs, _preSkillDiscard:preSkillDiscard, _aiHuntEvents:aiHuntEvents};
            } else {
              const beforeHuntPlayers=copyPlayers(P);
              const huntLogStart=L.length;
              const targetHandBefore=[...(P[ti]?.hand||[])];
              const targetRevealBefore=!!P[ti]?.revealHand;
              const knownHunterCards=P[ti]?.peekMemories?.[ct]||[];
              const rc = aiChooseRevealCard(targetHand, ai.name, L, knownHunterCards);
              if (!rc) {
                newAbandoned = [...new Set([...newAbandoned, ti])];
                continue;
              }
              L.push(`${ai.name}（追猎者）对 ${tgt.name} 【追捕】，亮出 ${cardLogText(rc)}`);
              const mi = P[ct].hand.findIndex(c => cardsHuntMatch(c,rc));
              if (mi >= 0) {
                const dc = P[ct].hand.splice(mi, 1)[0]; Disc.push(dc);
                clearHunterLowQualityHand(P, ct);
                const blankZoneUpdate=moveEligibleBlankZones(P,L);
                if(blankZoneUpdate){
                  P=blankZoneUpdate.players;ai=getAi();alive=getAlive();
                  L=blankZoneUpdate.log;
                }
                const afterDiscardPlayers=copyPlayers(P);
                const afterDiscardDiscard=[...Disc];
                const huntDamage=3+(P[ct].damageBonus||0);
                L.push(`弃 ${cardLogText(dc,{alwaysShowName:true})} → ${tgt.name} 受 ${huntDamage}HP 伤害！`);
                const huntDamageResult=submitDamageEvents({
                  players:P,deck:D,discard:Disc,log:L,currentTurn:gs.currentTurn,
                  events:[{targetIdx:ti,lostHp:huntDamage,source:'追捕'}],
                });
                if(huntDamageResult.phase==='ETHEREALIZE_DECISION'){
                  return buildReturnPack({
                    ...gs,
                    players:P,
                    deck:D,
                    discard:Disc,
                    log:L,
                    currentTurn:ct,
                    phase:huntDamageResult.phase,
                    abilityData:huntDamageResult.abilityData,
                    skillUsed:true,
                    huntAbandoned:newAbandoned,
                  },copyPlayers(P));
                }
                if (P[ti].hp <= 0 && !(P[ti].hand || []).some(isTsathogguaSlime)) {
                  let afterDamagePlayers=null;
                  let afterDamageDiscard=null;
                  let afterDamageLog=null;
                  let lootTransferCount=0;
                  let lootDiscardCards=[];
                  if (targetHandBefore.length) {
                    Disc=removeCardsFromDiscard(Disc,targetHandBefore);
                    P[ti].hand=[...targetHandBefore];
                    afterDamagePlayers=copyPlayers(P);
                    afterDamageDiscard=[...Disc];
                    afterDamageLog=[...L];
                    const maxToTake=3;
                    if (targetRevealBefore) {
                      const chosenCards=aiChooseHunterLootCards(P[ti].hand,P[ct].hand,maxToTake);
                      chosenCards.forEach(stolenCard=>{
                        const idx=P[ti].hand.findIndex(c=>c.id===stolenCard.id);
                        if(idx>=0){
                          P[ti].hand.splice(idx,1);
                          P[ct].hand.push(stolenCard);
                          lootTransferCount++;
                          L.push(`${ai.name} 从 ${tgt.name} 的公开手牌中选择了 ${cardLogText(stolenCard)}！`);
                        }
                      });
                      const { kept: kept1, destroyed: destroyed1 } = separateBlackGoatYoung(P[ti].hand);
                      lootDiscardCards=[...kept1];
                      if (kept1.length) Disc.push(...kept1);
                      if (destroyed1.length) L.push(`${P[ti].name} 的 ${destroyed1.length} 张黑山羊幼仔被销毁`);
                      P[ti].hand = [];
                    } else {
                      const cardsToTake=Math.min(maxToTake,P[ti].hand.length);
                      for(let i=0;i<cardsToTake;i++){
                        const randomIndex = Math.floor(Math.random() * P[ti].hand.length);
                        const stolenCard = P[ti].hand.splice(randomIndex, 1)[0];
                        P[ct].hand.push(stolenCard);
                        lootTransferCount++;
                        L.push(`${ai.name} 从 ${tgt.name} 的手牌中暗抽了一张！`);
                      }
                      const { kept: kept2, destroyed: destroyed2 } = separateBlackGoatYoung(P[ti].hand);
                      lootDiscardCards=[...kept2];
                      if (kept2.length) Disc.push(...kept2);
                      if (destroyed2.length) L.push(`${P[ti].name} 的 ${destroyed2.length} 张黑山羊幼仔被销毁`);
                      P[ti].hand = [];
                    }
                  } else {
                    afterDamagePlayers=copyPlayers(P);
                    afterDamageDiscard=[...Disc];
                    afterDamageLog=[...L];
                  }
                  if (P[ti].godZone?.length) {
                    const defeatedGodCards=[...P[ti].godZone];
                    Disc.push(...defeatedGodCards);
                    lootDiscardCards.push(...defeatedGodCards);
                    P[ti].godZone = []; P[ti].godName = null; P[ti].godLevel = 0;
                  }
                  aiHuntEvents.push({
                    apophisTargetEvent,
                    targetIdx:ti,
                    hunterIdx:ct,
                    revealedCard:rc,
                    discardedCard:dc,
                    afterDiscardPlayers,
                    afterDiscardDiscard,
                    beforePlayers:beforeHuntPlayers,
                    afterDamagePlayers,
                    afterDamageDiscard,
                    afterDamageLog,
                    lootTransferCount,
                    lootDiscardCards,
                    afterPlayers:copyPlayers(P),
                    afterResultDiscard:[...Disc],
                    beforeLog:L.slice(0,huntLogStart),
                    afterLog:[...L],
                    msgs:L.slice(huntLogStart),
                  });
                  alive = P.filter((p, i) => !p.isDead && i !== ct);
                  newAbandoned = newAbandoned.filter(i => P[i] && !P[i].isDead);
                  foundTarget = true;
                  break;
                } else {
                  aiHuntEvents.push({
                    apophisTargetEvent,
                    targetIdx:ti,
                    hunterIdx:ct,
                    revealedCard:rc,
                    discardedCard:dc,
                    afterDiscardPlayers,
                    afterDiscardDiscard,
                    beforePlayers:beforeHuntPlayers,
                    afterPlayers:copyPlayers(P),
                    afterResultDiscard:[...Disc],
                    beforeLog:L.slice(0,huntLogStart),
                    afterLog:[...L],
                    msgs:L.slice(huntLogStart),
                  });
                  foundTarget = true;
                  newAbandoned = newAbandoned.filter(i => i !== ti);
                  break;
                }
              } else {
                L.push(`无匹配手牌，放弃追捕 ${tgt.name}`);
                aiHuntEvents.push({
                  apophisTargetEvent,
                  targetIdx:ti,
                  hunterIdx:ct,
                  revealedCard:rc,
                  beforePlayers:beforeHuntPlayers,
                  afterPlayers:copyPlayers(P),
                  afterResultDiscard:[...Disc],
                  beforeLog:L.slice(0,huntLogStart),
                  afterLog:[...L],
                  msgs:L.slice(huntLogStart),
                });
                // 将目标添加到已放弃列表，避免同一回合再次选择
                newAbandoned = [...newAbandoned, ti];
                // 追猎者放弃追捕后本回合禁用追捕技能
                P[ct].disableSkill = true;
                huntContinue = false;
                break;
              }
            }
          }

          if (!foundTarget) {
            // 所有目标都尝试过了，仍无法追捕
            L.push(`${ai.name} 尝试了所有目标，仍无法追捕`);
            markHunterLowQualityHand(P, ct, gs, newAbandoned.length);
            huntContinue = false;
          }
        } else {
          L.push(`${ai.name} 环顾四周，没有合适的猎物了`);
          markHunterLowQualityHand(P, ct, gs, newAbandoned.length);
          huntContinue = false;
        }

        // 检查胜利条件
        const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
      }
    } else if(aiEffRole===ROLE_CULTIST){
      if(!alive.length){
        huntContinue=false;
      }else{
      const plan = cultistBewitchPlan || chooseAiCultistBewitchPlan(P, ct);
      if(!plan){
        huntContinue = false;
      }else if(P[ct].hand.length){
        alive=getAlive();
        const legalTargets=alive.map(p=>P.indexOf(p)).filter(i=>i>=0);
        const ti=applyNightTarget(plan.targetIdx,legalTargets,'选择【蛊惑】目标');
        tgt=P[ti];
        const sc=plan.card;
        const bwRes=applyBewitchGift(gs,P,D,Disc,L,ct,ti,sc);
        gs=bwRes.gs;P=bwRes.P;D=bwRes.D;Disc=bwRes.Disc;L=bwRes.L;ai=getAi();alive=getAlive();
        const treasureWin=buildBewitchTreasureWinState(gs,P,D,Disc,L,ti);
        if(treasureWin)return buildReturnPack(treasureWin,copyPlayers(P));
        const pendingSlime=buildPendingSlimeBalanceState(gs,P,D,Disc,L,{
          huntAbandoned:newAbandoned,
          _aiDrawnCard:(gs._aiDrawnCard??gs._drawnCard??null),
          _discardedDrawnCard:(gs._discardedDrawnCard??false),
          _aiName:ai.name,
          _playersBeforeNextDraw:copyPlayers(P),
          _playersBeforeSkillAction:playersBeforeSkillAction,
          _preSkillLogs:preSkillLogs,
          _preSkillDiscard:preSkillDiscard,
          _aiHuntEvents:aiHuntEvents,
        });
        if(pendingSlime)return pendingSlime;
        const deferredShu=buildDeferredShuTargetState(gs,P,D,Disc,L);
        if(deferredShu)return deferredShu;
        if(!sc.isGod&&bwRes.fxResult){
          const res=bwRes.fxResult;
          if(sc.type==='swapAllHands'||hasEffectDecisionState(res.statePatch)){
            const {phase:nextPhase,abilityData:phaseAbilityData}=deriveEffectDecisionState(res.statePatch,{
              fallbackPhase:'ACTION',
              leadingPhase:sc.type==='swapAllHands'?'ZONE_SWAP_SELECT_TARGET':null,
              leadingAbilityData:sc.type==='swapAllHands'?{
                zoneSwapCard:sc,
                zoneSwapSource:ti,
              }:{},
              turnOwner:gs.currentTurn,
            });
            const needsPlayerDecision = sc.type==='swapAllHands' || !!res.statePatch?.peekHandTargets || !!res.statePatch?.caveDuelTargets || !!res.statePatch?.damageLinkTargets || !!res.statePatch?.roseThornTargets || res.statePatch?.abilityData?.type==='sphinxGuess';
            return {
              ...gs,
              players:P,
              deck:D,
              discard:Disc,
              log:L,
              phase:nextPhase,
              currentTurn: needsPlayerDecision ? ti : gs.currentTurn,
              abilityData:phaseAbilityData,
              huntAbandoned:newAbandoned,
              skillUsed:true,
              _aiDrawnCard:(gs._aiDrawnCard??gs._drawnCard??null),
              _discardedDrawnCard:(gs._discardedDrawnCard??false),
              _aiName:ai.name,
              _playersBeforeNextDraw:copyPlayers(P),
              _playersBeforeSkillAction:playersBeforeSkillAction,
              _preSkillLogs:preSkillLogs,
              _preSkillDiscard:preSkillDiscard,
              _aiHuntEvents:aiHuntEvents,
            };
          }
        }
      }
      }
    } else {
      alive=getAlive();
      const withH=alive.filter(p=>p.hand.length>0);
      const pool=withH.length?withH:alive;
      if(pool.length){
        if(treasureSwapPlan?.targetIdx!=null){
          tgt=P[treasureSwapPlan.targetIdx];
        }else{
          tgt=pool[0];
        }
        const legalTargets=pool.map(p=>P.indexOf(p)).filter(i=>i>=0);
        const ti=applyNightTarget(P.indexOf(tgt),legalTargets,'选择【掉包】目标');
        tgt=P[ti];
        if(P[ti]?.hand.length&&P[ct].hand.length){
          const swapBeforePlayers=copyPlayers(P);
          const swapBeforeDiscard=[...Disc];
          const ri=0|Math.random()*P[ti].hand.length;const taken=P[ti].hand.splice(ri,1)[0];
          P[ct].hand.push(taken);
          const gi=chooseTreasureSwapGiveIndex(P[ct].hand);
          const given=P[ct].hand.splice(gi,1)[0];
          P[ti].hand.push(given);
          // 只有使用自己的掉包技能时才显示"（寻宝者）"，通过"绮丽诗篇"获得的掉包技能不显示
          const swapActorLabel=`${ai.name}${gs.globalOnlySwapOwner===null?'（寻宝者）':''}`;
          const swapPublicLog=`${swapActorLabel}对 ${tgt.name} 【掉包】`;
          L.push(swapPublicLog);
          if(ti===0&&!gs._isMP){
            L.push(`你的手牌${cardLogText(taken,{alwaysShowName:true})}被暗抽`);
            L.push(`${swapActorLabel}给你一张${cardLogText(given,{alwaysShowName:true})}`);
          }
          const aiSwapEvent=createSwapCardsEvent({
            sourceIdx:ct,
            targetIdx:ti,
            sourceCount:1,
            targetCount:1,
            takenCard:taken,
            givenCard:given,
            sourceName:ai.name,
            sourceLabel:swapActorLabel,
            beforePlayers:swapBeforePlayers,
            afterPlayers:copyPlayers(P),
            beforeDiscard:swapBeforeDiscard,
            afterDiscard:[...Disc],
            msgs:[swapPublicLog],
          });
          if(aiSwapEvent)gs={...gs,_visualEvents:[aiSwapEvent,...(gs._visualEvents||[])]};
          // 只有真正的寻宝者才能通过集齐全部编号获胜
          if((ai._nyaBorrow||ai.role)===ROLE_TREASURE&&isWinHand(P[ct].hand)){
            if(gs.globalOnlySwapOwner===null)P[ct].roleRevealed=true;
            if(P[ti].role===ROLE_TREASURE&&isWinHand(P[ti].hand)){
              P[ti].roleRevealed=true;
              const reason2=`${ai.name} 与 ${P[ti].name} 互换后双方均集齐编号，两位寻宝者共同获胜！`;
              const orderedWinnerSeats=[ct,ti].sort((a,b)=>a-b);
              return{...gs,players:P,deck:D,discard:Disc,log:[...L,reason2],gameOver:{winner:ROLE_TREASURE,reason:reason2,winnerIdx:orderedWinnerSeats[0],winnerIdx2:orderedWinnerSeats[1]}};
            }
            return{...gs,players:P,deck:D,discard:Disc,log:[...L,`${ai.name} 掉包后获胜！`],gameOver:{winner:ROLE_TREASURE,reason:`${ai.name} 通过掉包集齐全部编号并获胜！`,winnerIdx:ct}};
          }
          if(P[ti].role===ROLE_TREASURE&&isWinHand(P[ti].hand)){
            P[ti].roleRevealed=true;
            const reason3=`${P[ti].name} 因掉包获得最后一张编号，寻宝者获胜！`;
            return{...gs,players:P,deck:D,discard:Disc,log:[...L,reason3],gameOver:{winner:ROLE_TREASURE,reason:reason3,winnerIdx:ti}};
          }
        }
        }
      }
  }else if(!P[ct].isDead){
    if(aiEffRole===ROLE_CULTIST&&!gs.skillUsed&&!gs.multiplyUsed&&!gs.restUsed&&isCultistEndingTurnUnreasonable(P,ct)){
      cultistBewitchPlan=chooseAiCultistBewitchPlan(P,ct);
      if(cultistBewitchPlan){
        const plan=cultistBewitchPlan;
        alive=getAlive();
        const legalTargets=alive.map(p=>P.indexOf(p)).filter(i=>i>=0);
        const ti=applyNightTarget(plan.targetIdx,legalTargets,'选择【蛊惑】目标');
        const sc=plan.card;
        const bwRes=applyBewitchGift(gs,P,D,Disc,L,ct,ti,sc);
        gs=bwRes.gs;P=bwRes.P;D=bwRes.D;Disc=bwRes.Disc;L=bwRes.L;ai=getAi();alive=getAlive();
        const treasureWin=buildBewitchTreasureWinState(gs,P,D,Disc,L,ti);
        if(treasureWin)return buildReturnPack(treasureWin,copyPlayers(P));
        const pendingSlime=buildPendingSlimeBalanceState(gs,P,D,Disc,L,{
          huntAbandoned:newAbandoned,
          _aiDrawnCard:(gs._aiDrawnCard??gs._drawnCard??null),
          _discardedDrawnCard:(gs._discardedDrawnCard??false),
          _aiName:ai.name,
          _playersBeforeNextDraw:copyPlayers(P),
          _playersBeforeSkillAction:playersBeforeSkillAction,
          _preSkillLogs:preSkillLogs,
          _preSkillDiscard:preSkillDiscard,
          _aiHuntEvents:aiHuntEvents,
        });
        if(pendingSlime)return pendingSlime;
        const deferredShu=buildDeferredShuTargetState(gs,P,D,Disc,L);
        if(deferredShu)return deferredShu;
        if(!sc.isGod&&bwRes.fxResult){
          const res=bwRes.fxResult;
          if(hasEffectDecisionState(res.statePatch)){
            const {phase,abilityData}=deriveEffectDecisionState(res.statePatch,{fallbackPhase:'ACTION',turnOwner:gs.currentTurn});
            const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
            return {...gs,players:P,deck:D,discard:Disc,log:L,phase,abilityData,currentTurn:res.statePatch?.abilityData?.type==='sphinxGuess'?ti:gs.currentTurn,skillUsed:true};
          }
        }
        const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
        const _P_afterAction=copyPlayers(P);
        const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:true}, opts);
        return buildReturnPack(nextGs,_P_afterAction);
      }
    }
    appendAiEndTurnLog();
  }
  if(P[ct].isDead){
    const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    const _P_afterAction=copyPlayers(P);
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:gs.skillUsed}, opts);
    return{...nextGs,_animAiDrawnCard:gs._aiDrawnCard??gs._drawnCard??null,_animDiscardedDrawnCard:gs._discardedDrawnCard??false,_aiName:ai.name,_playersBeforeNextDraw:_P_afterAction,_playersBeforeSkillAction:playersBeforeSkillAction,_preSkillLogs:preSkillLogs,_preSkillDiscard:preSkillDiscard,_aiHuntEvents:aiHuntEvents};
  }
  const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
  const discardedCards=[];
  const handLimitBeforePlayers=copyPlayers(P);
  const handLimitBeforeDiscard=[...Disc];
  const handLimitBeforeLog=[...L];
  discardAiHandToLimit(P,ct,Disc,L,D,discardedCards);
  // 结算玫瑰倒刺：弃掉的标记牌立即造成伤害，日志紧跟在弃牌日志之后
  if(discardedCards.length){
    const thornLosses={};
    discardedCards.forEach(c=>{
      if(c.roseThornHolderId!=null && P[c.roseThornHolderId] && !P[c.roseThornHolderId].isDead){
        thornLosses[c.roseThornHolderId]=(thornLosses[c.roseThornHolderId]||0)+1;
      }
    });
    const thornDamageEvents=Object.entries(thornLosses).map(([holderIdxStr,count],order)=>{
      const holderIdx=+holderIdxStr;
      L.push(`【玫瑰倒刺】${P[holderIdx].name} 失去标记手牌，受到 ${2*count} HP 伤害`);
      return {targetIdx:holderIdx,lostHp:2*count,source:'玫瑰倒刺',order};
    });
    const thornDamage=submitDamageEvents({
      players:P,deck:D,discard:Disc,log:L,currentTurn:gs.currentTurn,
      events:thornDamageEvents,continuation:{_turnOwner:ct},
    });
    if(thornDamage.phase)gs={...gs,phase:thornDamage.phase,abilityData:thornDamage.abilityData};
    const pendingDecision=!!thornDamage.abilityData;
    if(pendingDecision){
      return buildReturnPack({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,skillUsed:(useSkill||gs.skillUsed)},copyPlayers(P));
    }
  }
  const winAfterDiscard=checkWin(P,gs._isMP);
  if(winAfterDiscard){
    return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:winAfterDiscard,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:(useSkill||gs.skillUsed),_animAiDrawnCard:gs._aiDrawnCard??gs._drawnCard??null,_animDiscardedDrawnCard:gs._discardedDrawnCard??false,_aiName:ai.name,_playersBeforeNextDraw:copyPlayers(P),_playersBeforeSkillAction:playersBeforeSkillAction,_preSkillLogs:preSkillLogs,_preSkillDiscard:preSkillDiscard,_aiHuntEvents:aiHuntEvents};
  }
  const _P_beforeEndTurnReplay = copyPlayers(P);
  const _Disc_beforeEndTurnReplay = [...Disc];
  const replayed=processAiEndTurnEvents(P,D,Disc,L,ct,gs);
  P=replayed.P;D=replayed.D;Disc=replayed.Disc;L=replayed.L;gs={...gs,...replayed.statePatch};ai=getAi();alive=getAlive();
  const _P_afterAction=copyPlayers(P);
  let nextGs;

  // AI状态机扭转关键：只有追猎者才能在同一回合内连续追捕并留在 AI_TURN
  const hasValidTargets = getHunterTargets().length > 0;
  const hasZoneCards = P[ct].hand.filter(canRevealForHunt).length > 0;
  try{
    if (aiEffRole === ROLE_HUNTER && huntContinue && hasZoneCards && hasValidTargets) {
        nextGs = withClearedTurnAnimFields({...gs, players:P, deck:D, discard:Disc, log:L, phase: 'AI_TURN', currentTurn: ct, huntAbandoned: newAbandoned, skillUsed: false});
    } else {
        nextGs = startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct, huntAbandoned: newAbandoned, skillUsed: (useSkill || gs.skillUsed), _aiEndTurnReplayQueue:replayed.replayQueue, _aiEndTurnReplayMsgs: replayed.replayMsgs}, opts);
    }
  }catch(e){
    throw new Error(`${ai.name} 回合收尾失败: ${e?.message||'未知错误'}`);
  }

  return{
    ...nextGs,
    _animAiDrawnCard:(nextGs.currentTurn===ct&&nextGs.phase==='AI_TURN')?null:(gs._aiDrawnCard??gs._drawnCard??null),
    _animDiscardedDrawnCard:(nextGs.currentTurn===ct&&nextGs.phase==='AI_TURN')?false:(gs._discardedDrawnCard??false),
    _aiName:ai.name,
    _playersBeforeNextDraw:_P_afterAction,
    _playersBeforeEndTurnReplay:_P_beforeEndTurnReplay,
    _discardBeforeEndTurnReplay:_Disc_beforeEndTurnReplay,
    _playersBeforeSkillAction:playersBeforeSkillAction,
    _preSkillLogs:preSkillLogs,
    _preSkillDiscard:preSkillDiscard,
    _aiHuntEvents:aiHuntEvents,
    ...(getUnifiedReplayVisualEvents(nextGs).length ? { _visualEvents: getUnifiedReplayVisualEvents(nextGs) } : {}),
    _aiHandLimitDiscards:discardedCards,
    ...(discardedCards.length?{
      _aiHandLimitBeforePlayers:handLimitBeforePlayers,
      _aiHandLimitBeforeDiscard:handLimitBeforeDiscard,
      _aiHandLimitBeforeLog:handLimitBeforeLog,
    }:{}),
    ...(animMultiplyEvent?{_animMultiplyEvent:animMultiplyEvent}:{}),
  };
}
