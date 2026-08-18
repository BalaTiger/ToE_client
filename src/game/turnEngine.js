import {
  shuffle,
  copyPlayers,
  isDodgeableZoneCard,
  shouldTriggerTreasureDodge,
  cardLogText,
  isWinHand,
  makeInspectionMeta,
  isBlackGoatYoung,
  isTsathogguaSlime,
  isGeomagneticRestore,
  killPlayerState,
  tryVritraImmortal,
  canRevealForHunt,
  formatSanLoss,
} from './coreUtils';
import { aiShouldKeepZoneCard, chooseAiCultistBewitchPlan, getHunterChaseTargets } from './ai';
import { clearPlayerGodZone } from './aiTurn';
import { splitAnimBoundLogs } from './animLogs';
import { GOD_DEFS, createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../constants/card';
import { ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST, isRevealedCultist } from './coreUtils';
import { applyFx, applyInspectionForSanLoss, submitLossEvents } from './effectEngine';
import { appendStatChangeResult, submitRecoveryEvents } from './statChangeEngine';
import { buildZhuLight, getZhuTopGuard } from './zhuPower';
import { buildStatEvents } from './statEvents';
import { deriveEffectDecisionState } from './effectStatePatch';
import { buildApophisNightLog, getApophisNightForLevel } from './apophisNight';
import { buildGodPowerBlockedLog, canGodPowerAffect, hasGodPowerImmunity } from './godPowerImmunity';
import { clearExpiredProliferatingZ } from './proliferatingZ';
import { appendPublicCardGainTriggers } from './cardGainEvents';
import { drawCardDecisionText, markBlindZoneCard, shouldBlindZoneDecision } from './blindZoneDecision';
import { clearExpiredTurnScopedEffects } from './turnScopedEffects';
import {
  buildFreshStatVisualEvents,
  buildTurnStartDrawVisualEvents,
  VISUAL_EVENT,
  createInspectionVisualEvent,
  createApophisEclipseEvent,
  createGodPowerBlockedEvent,
  createGodStatusChangedEvent,
  createGodGiftDiscardEvent,
  createStatEventsEvent,
  createTsathogguaSlimeGrantEvent,
  createTsathogguaSlimePopEvent,
  createTurnDrawVisualEvents,
} from './visualEvents';
import { createRuleResolutionTransaction } from './ruleResolutionTransaction';
import { advanceGodEncounter, formatGodEncounterProgress, getLatestGodEncounterProgress } from './balancePatches';
import { TURN_START_EVENT, getTurnStartEvents } from './turnStartEvents';
import { TURN_FLOW_STAGE } from './turnFlowStages';
import { enterTurnBoundary, enterTurnFlowStage, normalizeTurnOpeningFlowState } from './turnFlowManager';
import {
  appendDecisionContinuation,
  createDecisionContinuation,
  DECISION_CONTINUATION_PHASE,
} from './decisionContinuations';
import {
  getActiveDamageLinksForPlayer,
  getAllDamageLinks,
  removeDamageLink,
  removeDamageLinks,
} from './damageLinks';

function appendStatEventsToInspectionMeta(inspectionMeta, beforePlayers, afterPlayers, logs, reason) {
  const statEventSeq = (inspectionMeta?._statEventSeq || 0) + 1;
  const statEvents = buildStatEvents(beforePlayers, afterPlayers, logs, { reason, seq: statEventSeq });
  if (!statEvents.length) return inspectionMeta;
  return {
    ...inspectionMeta,
    _statEvents: [...(inspectionMeta?._statEvents || []), ...statEvents],
    _statEventSeq: statEventSeq,
  };
}

function mergeVisualEventLists(...lists) {
  const merged = lists.flatMap(list => (Array.isArray(list) ? list : [])).filter(Boolean);
  const seenIds = new Set();
  return merged.filter(event => {
    if (!event?.id) return true;
    if (seenIds.has(event.id)) return false;
    seenIds.add(event.id);
    return true;
  });
}

function appendGodChoiceContinuation(statePatch, baseState, abilityData) {
  const frame = createDecisionContinuation(DECISION_CONTINUATION_PHASE.GOD_CHOICE, abilityData);
  return {
    ...(statePatch || {}),
    _decisionContinuations: appendDecisionContinuation(
      statePatch?._decisionContinuations || baseState,
      frame,
    ),
  };
}

function appendTurnDrawVisualEvents(events, draw) {
  const drawOrder = events.filter(event => event?.type === VISUAL_EVENT.DRAW_CARD).length;
  const created = createTurnDrawVisualEvents({ ...draw, drawOrder });
  events.push(...created);
  return created.find(event => event?.type === VISUAL_EVENT.DRAW_CARD) || null;
}

function sameDrawnCard(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.id != null && right.id != null) return left.id === right.id;
  return left.key === right.key && left.name === right.name && left.type === right.type;
}

// Every resolved draw owns the presentation snapshots for its own keep step.
// playersAfterKeep deliberately changes only the hand: card effects (including
// Sphinx's reward card) are committed by their later visual events instead of
// leaking into the frame where the originally drawn card lands.
function buildDrawKeepPresentation({ playersBefore = [], playersAfter = [], playerIdx = 0, card } = {}) {
  const before = copyPlayers(playersBefore);
  const after = copyPlayers(playersAfter);
  const keptInHand = !!card && (after[playerIdx]?.hand || []).some(candidate => sameDrawnCard(candidate, card));
  const playersAfterKeep = keptInHand
    ? before.map((player, idx) => idx === playerIdx ? {
        ...player,
        hand: (player.hand || []).some(candidate => sameDrawnCard(candidate, card))
          ? [...(player.hand || [])]
          : [...(player.hand || []), card],
      } : player)
    : null;
  return {
    keptInHand,
    playersBefore: before,
    ...(playersAfterKeep ? { playersAfterKeep } : {}),
    playersAfterResolution: after,
  };
}

function withMergedVisualEvents(state, ...eventLists) {
  const visualEvents = mergeVisualEventLists(state?._visualEvents, ...eventLists);
  return visualEvents.length ? { ...state, _visualEvents: visualEvents } : state;
}

function getDebugForceTargetIndex(target) {
  if (target === 'player') return 0;
  const match = String(target || '').match(/^ai([1-4])$/);
  return match ? Number(match[1]) : null;
}

function applyDebugForceDrawToTop(gs, next, deck) {
  if (gs?._isMP) {
    gs.debugForceCard = null;
    gs.debugForceCardTarget = null;
    gs.debugForceCardKeep = null;
    return false;
  }
  const targetIndex = getDebugForceTargetIndex(gs?.debugForceCardTarget);
  if (!gs?.debugForceCard || targetIndex !== next) return false;
  deck.unshift(gs.debugForceCard);
  gs.debugForceCardKeepPending = gs.debugForceCardKeep || 'auto';
  gs.debugForceCardKeepTarget = next;
  gs.debugForceCard = null;
  gs.debugForceCardTarget = null;
  return true;
}

function consumeDebugForceKeepOverride(gs, ci) {
  if (gs?._isMP) {
    gs.debugForceCardKeepPending = null;
    gs.debugForceCardKeepTarget = null;
    return 'auto';
  }
  if (gs?.debugForceCardKeepTarget !== ci || !gs?.debugForceCardKeepPending) return 'auto';
  const keepOverride = gs.debugForceCardKeepPending;
  gs.debugForceCardKeepPending = null;
  gs.debugForceCardKeepTarget = null;
  return keepOverride;
}

export function checkWin(players, isMP) {
  const hasHunters = players.some(p => p.role === ROLE_HUNTER);
  const hasCultists = players.some(p => p.role === ROLE_CULTIST);
  // 1. SAN归零：有邪祀者则邪祀者获胜；无邪祀者则全员失败（邪神复活但无人受益）
  for (const p of players) if (!p.isDead && p.san <= 0) {
    if (hasCultists) {
      const ws = players.filter(q => q.role === ROLE_CULTIST).map(q => q.name).join('、');
      return { winner: ROLE_CULTIST, reason: `${p.name} 的理智归零，邪神苏醒！邪祀者（${ws}）获胜！` };
    } else {
      return { winner: 'LOSE_ALL', reason: `${p.name} 的理智归零，邪神复活，无人幸存！全员失败！` };
    }
  }
  // 2. 非追猎者全灭：有追猎者则追猎者获胜；无追猎者则全员失败
  const nonHunters = players.filter(p => p.role !== ROLE_HUNTER);
  if (nonHunters.length && nonHunters.every(p => p.isDead)) {
    if (hasHunters) {
      const ws = players.filter(q => q.role === ROLE_HUNTER).map(q => q.name).join('、');
      return { winner: ROLE_HUNTER, reason: `所有非追猎者已覆灭！追猎者（${ws}）获胜！` };
    } else {
      return { winner: 'LOSE_ALL', reason: '所有探险者均已覆灭，无人幸存！全员失败！' };
    }
  }
  // 3. 场上只有一人存活：寻宝者获胜或邪祀者阵营获胜
  const alivePlayers = players.filter(p => !p.isDead);
  if (alivePlayers.length === 1) {
    const survivor = alivePlayers[0];
    if (survivor.role === ROLE_TREASURE) {
      return { winner: ROLE_TREASURE, reason: `${survivor.name} 是唯一的幸存者，成功逃离！` };
    } else if (survivor.role === ROLE_CULTIST) {
      return { winner: ROLE_CULTIST, reason: `${survivor.name} 是唯一的幸存者，邪祀者阵营获胜！` };
    }
    // 追猎者单独存活的情况已被条件2覆盖
  }
  // 4. Player death — single-player only (MP games continue when a player dies)
  if (!isMP && players[0].isDead) return { winner: 'LOSE', reason: '你已沉入永恒的黑暗…' };
  return null;
}

export function shouldTriggerGodResurrection(gs) {
  if (!gs?.players?.length) return false;
  const hasCultists = gs.players.some(p => p.role === ROLE_CULTIST);
  if (!hasCultists) return false;
  return gs.players.some(p => !p.isDead && p.san <= 0);
}

function getShuOffspringTargets(ci, P) {
  return P
    .map((player, idx) => ({ player, idx }))
    .filter(({ player, idx }) => idx !== ci && player && !player.isDead && canGodPowerAffect(player));
}

function chooseOtherShuTarget(ci, P, role) {
  const targets = getShuOffspringTargets(ci, P);
  if (!targets.length) return ci;
  if (role === ROLE_HUNTER) {
    return [...targets].sort((a, b) => {
      const aPref = a.player.hp < a.player.san ? 0 : 1;
      const bPref = b.player.hp < b.player.san ? 0 : 1;
      return aPref - bPref || a.player.hp - b.player.hp || b.player.san - a.player.san || a.idx - b.idx;
    })[0].idx;
  }
  if (role === ROLE_CULTIST) {
    return [...targets].sort((a, b) => {
      const aPref = a.player.san < a.player.hp ? 0 : 1;
      const bPref = b.player.san < b.player.hp ? 0 : 1;
      return aPref - bPref || a.player.san - b.player.san || b.player.hp - a.player.hp || a.idx - b.idx;
    })[0].idx;
  }
  return targets[Math.floor(Math.random() * targets.length)].idx;
}

function shouldAiKeepActionForSkill(ci, P, role) {
  const actor = P?.[ci];
  if (!actor || actor.isDead) return false;
  if (role === ROLE_HUNTER) {
    return (actor.hand || []).some(canRevealForHunt) && getHunterChaseTargets(P, ci).length > 0;
  }
  if (role === ROLE_CULTIST) {
    return !!chooseAiCultistBewitchPlan(P, ci);
  }
  return false;
}

/** AI 自动选择 SHU 黑暗子嗣的目标。会避免让黑山羊幼仔占掉更高价值的追捕/蛊惑行动。 */
function _chooseAiShuTarget(ci, P) {
  const actor = P?.[ci];
  const role = actor?._nyaBorrow || actor?.role;
  if (role === ROLE_TREASURE) return chooseOtherShuTarget(ci, P, role);
  if (shouldAiKeepActionForSkill(ci, P, role)) return chooseOtherShuTarget(ci, P, role);
  if (canGodPowerAffect(actor)) return ci;
  return chooseOtherShuTarget(ci, P, role);
}

function getAiGodPowerScore(godKey, ci, players, level = 1) {
  const actor = players?.[ci];
  if (!actor || actor.isDead || !godKey || hasGodPowerImmunity(actor)) return -2;
  const role = actor._nyaBorrow || actor.role;
  const living = (players || []).filter(p => p && !p.isDead);
  const livingOthers = living.filter(p => p !== actor);
  const deadOthers = (players || []).filter((p, idx) => idx !== ci && p?.isDead);
  const lowSanOpponents = livingOthers.filter(p => p.role !== ROLE_CULTIST && p.san <= 6).length;
  const lowHpActor = actor.hp <= 4;
  const handCount = actor.hand?.length || 0;
  const roleDrawValue = role === ROLE_TREASURE ? 1.2 : role === ROLE_CULTIST ? 1.0 : 0.65;

  switch (godKey) {
    case 'NYA': {
      let score = -1.2;
      if (deadOthers.length) score += 1.3 + Math.min(1.2, deadOthers.length * 0.4);
      if (role === ROLE_TREASURE && deadOthers.some(p => p.role === ROLE_TREASURE)) score += 0.8;
      if (role === ROLE_CULTIST && deadOthers.some(p => p.role === ROLE_CULTIST)) score += 0.7;
      if (role === ROLE_HUNTER && deadOthers.some(p => p.role !== ROLE_HUNTER)) score += 0.4;
      if (!deadOthers.length && living.length >= players.length) score -= role === ROLE_HUNTER ? 0.7 : 1.4;
      score += (level - 1) * 0.35;
      return score;
    }
    case 'CTH':
      return 0.65 + roleDrawValue * level + (actor.isResting ? 0.8 : 0) + (handCount <= 2 ? 0.35 : 0);
    case 'SHU':
      return role === ROLE_CULTIST
        ? 1.6 + level * 0.85 + lowSanOpponents * 0.25
        : role === ROLE_HUNTER
          ? 0.25 + level * 0.2
          : 0.15 + level * 0.25;
    case 'ZHU':
      return 1.0 + level * 0.45 + (role === ROLE_TREASURE ? 0.35 : 0) + (role === ROLE_CULTIST ? 0.2 : 0);
    case 'APO':
      return role === ROLE_HUNTER
        ? -3.6 - level * 0.65
        : role === ROLE_CULTIST
          ? 1.4 + level * 0.7 + lowSanOpponents * 0.35
          : -0.7 + level * 0.15;
    case 'VRI':
      return 0.65 + (role === ROLE_HUNTER ? 0.75 : 0) + (role === ROLE_TREASURE ? 0.45 : 0) + (lowHpActor ? 1.25 : 0) + level * 0.25;
    case 'TSG':
      return 0.75 + roleDrawValue * level + (handCount <= 2 ? 0.25 : 0);
    default:
      return GOD_DEFS[godKey]?.levels?.some(levelDef => !/待设计/.test(levelDef?.desc || ''))
        ? 0.25 + level * 0.2
        : -0.8;
  }
}

export function chooseAiGodEncounterAction(ci, godCard, players, forcedConvert = false) {
  const actor = players?.[ci];
  const godKey = godCard?.godKey;
  if (!actor || !godKey) return 'discard';
  const role = actor._nyaBorrow || actor.role;
  const oldGodKey = actor.godName;
  const oldLevel = actor.godLevel || 0;
  const sanAfterConvert = actor.san - 1;
  const hasCultist = (players || []).some(p => p?.role === ROLE_CULTIST && !p.isDead);
  const convertSanPenalty = sanAfterConvert <= 0
    ? 99
    : sanAfterConvert <= 3
      ? 2.2
      : sanAfterConvert <= 6
        ? (hasCultist && role !== ROLE_CULTIST ? 0.9 : 0.45)
        : 0.15;

  if (oldGodKey === godKey) return oldLevel < 3 ? 'upgrade' : 'discard';
  if (forcedConvert) return 'worship';

  const newScore = getAiGodPowerScore(godKey, ci, players, 1);
  const keepHandScore = role === ROLE_CULTIST ? 1.35 + ((actor.godEncounters || 0) * 0.25) : -99;

  if (!oldGodKey) {
    const worshipScore = newScore - (actor.san <= 3 ? 0.9 : 0);
    if (keepHandScore > worshipScore && keepHandScore >= 1.2) return 'hand';
    return worshipScore >= 0.75 ? 'worship' : 'discard';
  }

  const oldScore = getAiGodPowerScore(oldGodKey, ci, players, Math.max(1, oldLevel));
  const resetPenalty = Math.max(0, oldLevel - 1) * 0.75;
  const convertScore = newScore - oldScore - resetPenalty - convertSanPenalty;
  if (keepHandScore > convertScore && keepHandScore >= 1.3) return 'hand';
  return convertScore >= 0.45 ? 'convert' : 'discard';
}

function appendGodPowerBlockedFeedback({ player, playerIdx, log, events, msgs, turnStartStage = null }) {
  if (!player || !hasGodPowerImmunity(player)) return null;
  const msg = buildGodPowerBlockedLog(player);
  if (Array.isArray(log)) log.push(msg);
  if (Array.isArray(msgs)) msgs.push(msg);
  const event = createGodPowerBlockedEvent({
    playerIdx,
    playerName: player.name,
    msgs: [msg],
    ...(turnStartStage ? { turnStartStage, turnStartStageOrder: 0 } : {}),
  });
  if (event && Array.isArray(events)) events.push(event);
  return event;
}

export function applySanLossToPlayerWithInspection(targetIndex, amount, startIndex, P, D, Disc, L, inspectionMeta, reason = 'SAN损失', options = {}) {
  const statEventSeq = (inspectionMeta?._statEventSeq || 0) + 1;
  const damage = submitLossEvents({
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    currentTurn: startIndex,
    events: [{ targetIdx: targetIndex, lostSan: amount, source: reason }],
    skipEtherealize: !!options.skipEtherealize,
    statEventSeq,
    statEventReason: reason,
    statEventLogs: L.slice(-1),
  });
  const nextInspectionMeta = appendStatChangeResult(inspectionMeta, damage);
  if (damage.abilityData) {
    return {
      P,
      D,
      Disc,
      L,
      inspectionMeta: {
        ...nextInspectionMeta,
        abilityData: {
          ...damage.abilityData,
          ...(damage.phase === 'TSG_SLIME_BALANCE' ? {
            pendingSanInspection: { targetIndex, startIndex, reason },
          } : {}),
        },
      },
    };
  }
  const processed = applyInspectionForSanLoss(targetIndex, P[targetIndex].san, startIndex, P, D, Disc, L, nextInspectionMeta);
  return {
    P: processed.P,
    D: processed.D,
    Disc: processed.Disc,
    L: processed.log,
    inspectionMeta: processed.inspectionMeta,
  };
}

function splitGodEncounterLogs(effectMsgs = []) {
  const logs = (Array.isArray(effectMsgs) ? effectMsgs : []).filter(line => typeof line === 'string' && line.length);
  const inspectionStart = logs.findIndex(line => line.includes('的SAN检定结果为'));
  if (inspectionStart < 0) return { encounterLogs: logs, inspectionLogs: [] };
  return {
    encounterLogs: logs.slice(0, inspectionStart),
    inspectionLogs: logs.slice(inspectionStart),
  };
}

export function abandonGodFollower(targetIndex, startIndex, P, D, Disc, L, inspectionMeta, logMsg = `被邪神抛弃，${formatSanLoss(1)}`) {
  let settlementMsg = `${P[targetIndex].name} ${logMsg}`;
  const playersBeforeFaithExit = copyPlayers(P);
  const discardBeforeFaithExit = [...Disc];
  const discardedGodCards = [...(P[targetIndex]?.godZone || [])];
  const statEventSeqBefore = inspectionMeta?._statEventSeq || 0;
  const inspectionSeqBefore = inspectionMeta?._inspectionSeq || 0;
  // 信仰退出是抛弃结算的边界：先移除 Tag/神域牌，再结算 SAN 与其
  // 连带检定。这样后续任何伤害或检定快照都不可能恢复已经失去的信仰。
  clearPlayerGodZone(P[targetIndex], Disc);
  const playersAfterFaithExit = copyPlayers(P);
  const discardAfterFaithExit = [...Disc];
  L = [...L, settlementMsg];
  const processed = applySanLossToPlayerWithInspection(targetIndex, 1, startIndex, P, D, Disc, L, inspectionMeta);
  P = processed.P; D = processed.D; Disc = processed.Disc; L = processed.L; inspectionMeta = processed.inspectionMeta;
  if (inspectionMeta?.abilityData?.type === 'etherealizeRedirect') {
    settlementMsg = settlementMsg.replace('失去', '即将失去');
    L[L.length - 1] = settlementMsg;
  }
  return {
    P,
    D,
    Disc,
    L,
    inspectionMeta,
    faithExit: {
      playerIdx: targetIndex,
      cards: discardedGodCards,
      msgs: [settlementMsg],
      playersBefore: playersBeforeFaithExit,
      playersAfter: playersAfterFaithExit,
      discardBefore: discardBeforeFaithExit,
      discardAfter: discardAfterFaithExit,
      statEventSeqBefore,
      statEventSeqAfter: inspectionMeta?._statEventSeq || statEventSeqBefore,
      inspectionSeqBefore,
      inspectionSeqAfter: inspectionMeta?._inspectionSeq || inspectionSeqBefore,
      playersAfterResolution: copyPlayers(P),
      discardAfterResolution: [...Disc],
      effect: 'godAbandon',
    },
  };
}

function appendMissingLogOccurrences(log, routedLogs = []) {
  const available = new Map();
  log.forEach(line => available.set(line, (available.get(line) || 0) + 1));
  const consumed = new Map();
  routedLogs.forEach(line => {
    const used = consumed.get(line) || 0;
    if (used < (available.get(line) || 0)) {
      consumed.set(line, used + 1);
    } else {
      log.push(line);
    }
  });
}

export function createFaithSettlementGodStatusEvent({
  playerIdx = 0,
  playersBeforeSettlement = null,
  playersAfterSettlement = null,
  faithEstablished = null,
  previousFaithExit = null,
  abandonedFollowers = [],
  msgs = [],
  presentAfterInspectionSeq = null,
} = {}) {
  const beforePlayer = playersBeforeSettlement?.[playerIdx];
  const afterPlayer = playersAfterSettlement?.[playerIdx];
  const normalizedAbandonedFollowers = (Array.isArray(abandonedFollowers) ? abandonedFollowers : []).filter(Boolean);
  if (!afterPlayer?.godName) return null;
  if (
    beforePlayer?.godName === afterPlayer.godName &&
    (beforePlayer?.godLevel || 0) === (afterPlayer.godLevel || 0)
  ) return null;
  const statusMsgs = (Array.isArray(msgs) ? msgs : []).filter(line => (
    typeof line === 'string' && (
      line.includes('信仰了') ||
      line.includes('邪神之力升至') ||
      line.includes('改信')
    )
  ));
  const presentationBoundary = Math.max(
    Number(presentAfterInspectionSeq) || 0,
    Number(previousFaithExit?.inspectionSeqAfter) || 0,
  );
  return createGodStatusChangedEvent({
    playerIdx,
    playerName: afterPlayer.name,
    godKey: afterPlayer.godName,
    godLevel: afterPlayer.godLevel || 0,
    msgs: statusMsgs.slice(0, 1),
    playersBefore: faithEstablished?.playersBefore || playersBeforeSettlement,
    playersAfter: faithEstablished?.playersAfter || playersAfterSettlement,
    faithSettlement: {
      previousFaithExit,
      abandonedFollowers: normalizedAbandonedFollowers,
    },
    presentAfterInspectionSeq: presentationBoundary || null,
  });
}

export function convertGodFollower(targetIndex, startIndex, P, D, Disc, L, inspectionMeta, logMsg, nextGodCard = null) {
  let convertLog = logMsg || `${P[targetIndex].name} 改信新神，${formatSanLoss(1)}`;
  L = [...L, convertLog];
  const playersBeforeFaithExit = copyPlayers(P);
  const discardBeforeFaithExit = [...Disc];
  const discardedGodCards = [...(P[targetIndex]?.godZone || [])];
  const statEventSeqBefore = inspectionMeta?._statEventSeq || 0;
  const inspectionSeqBefore = inspectionMeta?._inspectionSeq || 0;
  if (P[targetIndex]?.godName || discardedGodCards.length) {
    clearPlayerGodZone(P[targetIndex], Disc);
  }
  const playersAfterFaithExit = copyPlayers(P);
  const discardAfterFaithExit = [...Disc];
  const processed = applySanLossToPlayerWithInspection(targetIndex, 1, startIndex, P, D, Disc, L, inspectionMeta);
  P = processed.P; D = processed.D; Disc = processed.Disc; L = processed.L; inspectionMeta = processed.inspectionMeta;
  if (inspectionMeta?.abilityData?.type === 'etherealizeRedirect') {
    convertLog = convertLog.replace('失去', '即将失去');
    L[L.length - 1] = convertLog;
  }
  const playersBeforeFaithEstablished = copyPlayers(P);
  if (nextGodCard?.godKey) {
    P[targetIndex].godName = nextGodCard.godKey;
    P[targetIndex].godLevel = 1;
    P[targetIndex].godZone = [{ ...nextGodCard }];
    P[targetIndex].hasBelievedGod = true;
  }
  return {
    P,
    D,
    Disc,
    L,
    inspectionMeta,
    faithExit: discardedGodCards.length ? {
      playerIdx: targetIndex,
      cards: discardedGodCards,
      msgs: [convertLog],
      playersBefore: playersBeforeFaithExit,
      playersAfter: playersAfterFaithExit,
      discardBefore: discardBeforeFaithExit,
      discardAfter: discardAfterFaithExit,
      statEventSeqBefore,
      statEventSeqAfter: inspectionMeta?._statEventSeq || statEventSeqBefore,
      inspectionSeqBefore,
      inspectionSeqAfter: inspectionMeta?._inspectionSeq || inspectionSeqBefore,
      playersAfterResolution: playersBeforeFaithEstablished,
      discardAfterResolution: [...Disc],
      effect: 'godConvertDiscard',
    } : null,
    faithEstablished: nextGodCard?.godKey ? {
      playersBefore: playersBeforeFaithEstablished,
      playersAfter: copyPlayers(P),
    } : null,
  };
}

export function resolveGodEncounterForAI(ci, godCard, P, D, Disc, gs, forcedConvert, opts = {}) {
  const msgs = []; const godKey = godCard.godKey;
  let statePatch = {};
  const visualEvents = [];
  let apophisEclipseEvent = null;
  const godStatusPlayersBefore = copyPlayers(P);
  let previousFaithExit = null;
  let faithEstablished = null;
  // 放弃馈赠时把邪神牌结构化地带回给调用方，供规则层记录到摸牌事件上；
  // 不要再靠扫描「放弃了邪神的馈赠」日志文本来推断弃牌结果。
  let discardedGod = null;
  const abandonedFaithExits = [];
  let presentAfterInspectionSeq = null;
  let inspectionMeta = makeInspectionMeta(gs);
  P = P.map(p => ({ ...p, godZone: [...(p.godZone || [])] })); // shallow copy godZone arrays
  const hadWinnerAtSettlementStart = !!checkWin(P, gs?._isMP);
  const settlementHasNewWinner = () => !hadWinnerAtSettlementStart && !!checkWin(P, gs?._isMP);
  const applyImmediateGodPower = () => {
    // A conversion cost or an abandonment penalty can end the game before the
    // newly gained/upgraded power resolves. Victory terminates that chain.
    if (settlementHasNewWinner()) return;
    if (!canGodPowerAffect(P[ci])) {
      if (['APO', 'ZHU', 'SHU'].includes(godKey)) {
        appendGodPowerBlockedFeedback({ player: P[ci], playerIdx: ci, events: visualEvents, msgs });
      }
      return;
    }
    if (godKey === 'APO') {
      statePatch.apophisNight = getApophisNightForLevel(P[ci].godLevel);
      const nightMsg = buildApophisNightLog();
      msgs.push(nightMsg);
      apophisEclipseEvent = createApophisEclipseEvent({
        playerIdx: ci,
        playerName: P[ci].name,
        apophisNight: statePatch.apophisNight,
        msgs: [nightMsg],
      });
    }
    if (godKey === 'ZHU') {
      statePatch.zhuLight = buildZhuLight(P, D, ci, gs?.zhuLight);
    }
    if (godKey === 'SHU') {
      const count = GOD_DEFS.SHU.levels[(P[ci].godLevel || 1) - 1]?.offspringCount || 0;
      if (opts?.deferShuTarget && count > 0) {
        statePatch = {
          ...statePatch,
          _deferredShuTarget: { chooserIdx: ci, count },
          abilityData: {
            ...(statePatch.abilityData || {}),
            shuOffspringCount: count,
            shuChooserIdx: ci,
            _turnOwner: gs?.currentTurn ?? ci,
          },
        };
        return;
      }
      const shuTargetIdx = _chooseAiShuTarget(ci, P);
      if (!canGodPowerAffect(P[shuTargetIdx])) return;
      const goatCards = Array.from({ length: count }, () => createBlackGoatYoungCard());
      P[shuTargetIdx].hand.push(...goatCards);
      if (goatCards.length) proliferatingZGainEvents.push({ ownerIdx: shuTargetIdx, cards: goatCards });
      if (count) msgs.push(`【黑暗子嗣】${P[shuTargetIdx].name} 获得${count}张黑山羊幼仔`);
    }
  };
  if (forcedConvert && P[ci].godName && P[ci].godName !== godKey) {
    let convertMsg = `${P[ci].name} 被迫改信新神，${formatSanLoss(1)}`;
    msgs.push(convertMsg);
    const playersBeforeFaithExit = copyPlayers(P);
    const discardBeforeFaithExit = [...Disc];
    const discardedGodCards = [...(P[ci]?.godZone || [])];
    const statEventSeqBefore = inspectionMeta?._statEventSeq || 0;
    const inspectionSeqBefore = inspectionMeta?._inspectionSeq || 0;
    clearPlayerGodZone(P[ci], Disc);
    const playersAfterFaithExit = copyPlayers(P);
    const discardAfterFaithExit = [...Disc];
    previousFaithExit = {
      playerIdx: ci,
      cards: discardedGodCards,
      msgs: [convertMsg],
      playersBefore: playersBeforeFaithExit,
      playersAfter: playersAfterFaithExit,
      discardBefore: discardBeforeFaithExit,
      discardAfter: discardAfterFaithExit,
      statEventSeqBefore,
      statEventSeqAfter: null,
      inspectionSeqBefore,
      inspectionSeqAfter: null,
      effect: 'godConvertDiscard',
    };
    const inspectionBaseLog = [...(Array.isArray(gs?.log) ? gs.log : []), ...msgs];
    const processed = applySanLossToPlayerWithInspection(ci, 1, gs?.currentTurn ?? ci, P, D, Disc, inspectionBaseLog, inspectionMeta);
    P = processed.P; D = processed.D; Disc = processed.Disc; inspectionMeta = processed.inspectionMeta;
    if (inspectionMeta?.abilityData?.type === 'etherealizeRedirect') {
      convertMsg = convertMsg.replace('失去', '即将失去');
      msgs[msgs.length - 1] = convertMsg;
      previousFaithExit.msgs = [convertMsg];
    }
    previousFaithExit.statEventSeqAfter = inspectionMeta?._statEventSeq || statEventSeqBefore;
    previousFaithExit.inspectionSeqAfter = inspectionMeta?._inspectionSeq || inspectionSeqBefore;
    previousFaithExit.playersAfterResolution = copyPlayers(P);
    previousFaithExit.discardAfterResolution = [...Disc];
    const extraMsgs = (processed.L || []).slice(inspectionBaseLog.length); if (extraMsgs.length) msgs.push(...extraMsgs);
    if ((inspectionMeta?._inspectionSeq || 0) > inspectionSeqBefore) {
      presentAfterInspectionSeq = inspectionMeta._inspectionSeq;
    }
  }
  const proliferatingZGainEvents = [];
  const abandonCompetingFollowers = () => {
    P.forEach((p, i) => {
      if (i === ci || p.godName !== godKey) return;
      const abandonBaseLog = [...(Array.isArray(gs?.log) ? gs.log : []), ...msgs];
      const abandoned = abandonGodFollower(i, gs?.currentTurn ?? ci, P, D, Disc, abandonBaseLog, inspectionMeta);
      P = abandoned.P; D = abandoned.D; Disc = abandoned.Disc; inspectionMeta = abandoned.inspectionMeta;
      if (abandoned.faithExit) abandonedFaithExits.push(abandoned.faithExit);
      const extraMsgs = (abandoned.L || []).slice(abandonBaseLog.length); if (extraMsgs.length) msgs.push(...extraMsgs);
    });
  };
  const action = chooseAiGodEncounterAction(ci, godCard, P, forcedConvert);
  if (action === 'upgrade') {
    const playersBeforeFaithEstablished = copyPlayers(P);
    P[ci].godLevel++; P[ci].godZone.push({ ...godCard });
    P[ci].hasBelievedGod = true;
    faithEstablished = {
      playersBefore: playersBeforeFaithEstablished,
      playersAfter: copyPlayers(P),
    };
    proliferatingZGainEvents.push({ ownerIdx: ci, cards: [godCard] });
    msgs.push(`${P[ci].name} 邪神之力升至Lv.${P[ci].godLevel}（${godCard.power}）`);
    abandonCompetingFollowers();
    applyImmediateGodPower();
  } else if (action === 'convert') {
    msgs.push(`${P[ci].name} 信仰了 ${godCard.name}，获得${godCard.power}(Lv.1)`);
    const inspectionSeqBefore = inspectionMeta?._inspectionSeq || 0;
    const convertBaseLog = [...(Array.isArray(gs?.log) ? gs.log : []), ...msgs];
    const converted = convertGodFollower(ci, gs?.currentTurn ?? ci, P, D, Disc, convertBaseLog, inspectionMeta, `${P[ci].name} 改信新神，${formatSanLoss(1)}`, godCard);
    P = converted.P; D = converted.D; Disc = converted.Disc; inspectionMeta = converted.inspectionMeta;
    previousFaithExit = converted.faithExit || previousFaithExit;
    faithEstablished = converted.faithEstablished || faithEstablished;
    if ((inspectionMeta?._inspectionSeq || 0) > inspectionSeqBefore) {
      presentAfterInspectionSeq = inspectionMeta._inspectionSeq;
    }
    const extraMsgs = (converted.L || []).slice(convertBaseLog.length); if (extraMsgs.length) msgs.push(...extraMsgs);
    proliferatingZGainEvents.push({ ownerIdx: ci, cards: [godCard] });
    abandonCompetingFollowers();
    applyImmediateGodPower();
  } else if (action === 'worship') {
    const playersBeforeFaithEstablished = copyPlayers(P);
    P[ci].godName = godKey; P[ci].godLevel = 1; P[ci].godZone = [{ ...godCard }]; P[ci].hasBelievedGod = true;
    faithEstablished = {
      playersBefore: playersBeforeFaithEstablished,
      playersAfter: copyPlayers(P),
    };
    proliferatingZGainEvents.push({ ownerIdx: ci, cards: [godCard] });
    msgs.push(`${P[ci].name} 信仰了 ${godCard.name}，获得${godCard.power}(Lv.1)`);
    abandonCompetingFollowers();
    applyImmediateGodPower();
  } else if (action === 'hand') {
    P[ci].roleRevealed = true;
    P[ci].hand.push({ ...godCard }); msgs.push(`${P[ci].name}（邪祀者）将邪神牌收入手牌`);
    proliferatingZGainEvents.push({ ownerIdx: ci, cards: [godCard] });
  } else {
    Disc.push({ ...godCard }); msgs.push(`${P[ci].name} 放弃了邪神的馈赠`);
    discardedGod = godCard;
  }
  let zBase = { ...gs, ...statePatch };
  const godStatusEvent = createFaithSettlementGodStatusEvent({
    playerIdx: ci,
    playersBeforeSettlement: godStatusPlayersBefore,
    playersAfterSettlement: copyPlayers(P),
    faithEstablished,
    previousFaithExit,
    abandonedFollowers: abandonedFaithExits,
    msgs,
    presentAfterInspectionSeq,
  });
  const faithResolutionEvents = [godStatusEvent, apophisEclipseEvent].filter(Boolean);
  if (faithResolutionEvents.length > 1) {
    visualEvents.unshift(...createRuleResolutionTransaction({
      id: `faith:${godStatusEvent.id}`,
      phase: 'faithSettlement',
      events: faithResolutionEvents,
    }).events.map(event => ({
      ...event,
      ...(presentAfterInspectionSeq != null ? { presentAfterInspectionSeq } : {}),
    })));
  } else if (faithResolutionEvents.length) {
    visualEvents.unshift(...faithResolutionEvents);
  }
  if (!settlementHasNewWinner()) {
    proliferatingZGainEvents.forEach(event => {
      const patch = appendPublicCardGainTriggers(zBase, P, event.ownerIdx, event.cards);
      if (patch.proliferatingZQueue) zBase = { ...zBase, proliferatingZQueue: patch.proliferatingZQueue };
    });
  }
  statePatch = {
    ...statePatch,
    ...(zBase.proliferatingZQueue ? { proliferatingZQueue: zBase.proliferatingZQueue } : {}),
    _visualEvents: [
      ...(inspectionMeta?._visualEvents || []),
      ...visualEvents,
    ].filter((event, index, events) => (
      !event?.id || events.findIndex(candidate => candidate?.id === event.id) === index
    )),
  };
  return { P, D, Disc, msgs, inspectionMeta, statePatch, discardedGod };
}

export function aiHandleGodCard(ci, godCard, P, D, Disc, L, gs, skipEffectMsg = false, forcedConvert = false, opts = {}) {
  const progress = getLatestGodEncounterProgress(P[ci], gs);
  const sanCost = progress.sanLoss;
  // 已揭晓的邪祀者遭遇邪神时免疫SAN损耗；未揭晓时照常结算
  if (!skipEffectMsg) {
    const revealedCultist = isRevealedCultist(P[ci]);
    let effectMsg = '';
    if (revealedCultist) {
      effectMsg = `${P[ci].name}（邪祀者）遭遇邪神 ${godCard.name}！（${formatGodEncounterProgress(progress)}）免疫SAN损耗`;
    } else {
      effectMsg = `${P[ci].name} 遭遇邪神 ${godCard.name}！（${formatGodEncounterProgress(progress)}）${formatSanLoss(sanCost)}`;
    }
    L.push(effectMsg);
  }
  const gres = resolveGodEncounterForAI(ci, godCard, P, D, Disc, gs, forcedConvert, opts);
  P = gres.P; D = gres.D; Disc = gres.Disc;
  L.push(...gres.msgs);
  return { P, D, Disc, L, inspectionMeta: gres.inspectionMeta, statePatch: gres.statePatch, discardedGod: gres.discardedGod || null };
}

function handleCardDrawCore(ci, ps, deck, disc, isAI = false, gs = {}) {
  let P = copyPlayers(ps), D = [...deck], Disc = [...disc];
  let reshuffleLog = '';
  // 地磁反转生效时，弃牌堆就是当前摸牌来源。即使普通牌堆已空，也不能
  // 先把弃牌堆重洗回牌堆，否则“反转复原”会被困在普通牌堆，而刚弃掉的
  // 单张区域牌会被无限重复抽取。
  if (!D.length && Disc.length && !gs?.geomagneticReversalActive) {
    reshuffleLog = '牌堆耗尽，重洗弃牌堆';
    D = shuffle(Disc);
    Disc = [];
  }
  if (!D.length && !(gs?.geomagneticReversalActive && Disc.length)) {
    return { P, D, Disc, drawnCard: null, effectMsgs: [], needsDecision: false };
  }

  const whoName = ci === 0 ? '你' : P[ci].name;

  let drawnCard;
  let geomagneticDraw = false;

  // 地磁反转：摸牌改为「重洗弃牌堆并从中随机摸一张」，替代摸牌堆顶。
  // 抽出后照常翻开结算——区域牌触发效果/收弃决策，邪神牌走遭遇邪神；仅"反转复原"特殊处理。
  if (gs?.geomagneticReversalActive && Disc.length > 0) {
    const shuffledDisc = shuffle([...Disc]);
    Disc = [];
    const drawnFromDisc = shuffledDisc.shift();

    if (isGeomagneticRestore(drawnFromDisc)) {
      // 反转复原：消除地磁反转效果，不进入手牌。仍保留 drawnCard，供上层
      // 区分“抽到后销毁”与“无牌可抽”，并播放从弃牌堆翻开的摸牌动画。
      return {
        P, D, Disc: shuffledDisc,
        drawnCard: drawnFromDisc,
        effectMsgs: [`【反转复原】${whoName} 抽到了反转复原，地磁反转效果被消除！`],
        kept: true,
        needsDecision: false,
        sourcePile: 'discard',
        statePatch: { geomagneticReversalActive: false },
      };
    }

    // 其余牌一律按普通摸牌流程处理；地磁反转保持生效，
    // 摸牌动画的 sourcePile 由 geomagneticReversalActive 推断为弃牌堆。
    Disc = shuffledDisc;
    drawnCard = drawnFromDisc;
    geomagneticDraw = true;
  }

  if (!geomagneticDraw) {
    if (gs?._zhuRequestDecision && !gs?._zhuBypassTopGuard) {
      const zhuGuard = getZhuTopGuard({ ...gs, players: P, deck: D }, D);
      if (zhuGuard) {
        return {
          P,
          D,
          Disc,
          drawnCard: null,
          effectMsgs: [],
          needsDecision: false,
          zhuHideDecision: true,
          zhuGuard,
        };
      }
    }

    drawnCard = D.shift();
  }

  // God card handling
  if (drawnCard.isGod) {
    const encounterProgress = advanceGodEncounter(P[ci], gs);
    const cost = encounterProgress.sanLoss;
    const revealedCultist = isRevealedCultist(P[ci]);

    if (isAI) {
      let L2 = [];
      let inspectionMeta = makeInspectionMeta(gs);
      // 同步结算路径（如黏液额外摸到邪神牌）需要把这次遭遇产出的属性/检定事件
      // 归属到本次摸牌，供回合开始动画把它们排在邪神翻牌之后、下一张摸牌之前。
      const encounterStatSeqBefore = inspectionMeta?._statEventSeq || 0;
      const encounterInspectionSeqBefore = inspectionMeta?._inspectionSeq || 0;
      let effectMsg = revealedCultist
        ? `${whoName}（邪祀者）遭遇邪神 ${drawnCard.name}！（${formatGodEncounterProgress(encounterProgress)}）免疫SAN损耗`
        : `${whoName} 遭遇邪神 ${drawnCard.name}！（${formatGodEncounterProgress(encounterProgress)}）${formatSanLoss(cost)}`;
      L2.push(effectMsg);
      // AI处理邪神牌时，仍然立即扣减SAN值；教程可在检定前暂停。
      if (!revealedCultist && cost > 0) {
        const pendingGodChoice = {
          playerIndex: ci,
          godCard: drawnCard,
          pendingEncounterInspection: true,
        };
        const damage = submitLossEvents({
          players: P, deck: D, discard: Disc, log: L2, currentTurn: gs?.currentTurn ?? ci,
          events: [{ targetIdx: ci, lostSan: cost, source: '邪神遭遇' }],
          continuation: { pendingGodChoice },
        });
        pendingGodChoice.pendingEncounterInspection = P[ci].san > 0 && P[ci].san <= 6;
        inspectionMeta = appendStatEventsToInspectionMeta(
          inspectionMeta,
          damage.beforePlayers,
          P,
          [effectMsg],
          '邪神遭遇',
        );
        if (damage.abilityData) {
          return {
            P, D, Disc, drawnCard, reshuffleLog, effectMsgs: L2, kept: true,
            statePatch: { ...inspectionMeta, abilityData: damage.abilityData },
          };
        }
        if (checkWin(P, gs?._isMP)) {
          return {
            P,
            D,
            Disc,
            drawnCard,
            reshuffleLog,
            effectMsgs: L2,
            kept: true,
            statePatch: { ...inspectionMeta },
          };
        }
        if (gs?.deferAiGodChoice) {
          return {
            P,
            D,
            Disc,
            drawnCard,
            reshuffleLog,
            effectMsgs: L2,
            kept: true,
            pendingAiGodChoice: {
              playerIndex: ci,
              godCard: drawnCard,
              pendingEncounterInspection: P[ci].san > 0 && P[ci].san <= 6,
            },
            statePatch: {
              ...inspectionMeta,
              _pendingAiGodChoice: {
                playerIndex: ci,
                godCard: drawnCard,
                pendingEncounterInspection: P[ci].san > 0 && P[ci].san <= 6,
              },
            },
          };
        }
        const baseLog = [...(gs?.log || []), effectMsg];
        const processed = applyInspectionForSanLoss(ci, P[ci].san, gs?.currentTurn ?? ci, P, D, Disc, baseLog, inspectionMeta);
        P = processed.P; D = processed.D; Disc = processed.Disc; inspectionMeta = processed.inspectionMeta; L2.push(...processed.log.slice(baseLog.length));
      }
      // 遭遇本身已经触发终局时，邪神馈赠不再继续结算。否则会留下
      // AI_GOD_CHOICE，结算界面仍会替 AI 选择并播放弃牌动画/音效。
      if (checkWin(P, gs?._isMP)) {
        return {
          P,
          D,
          Disc,
          drawnCard,
          reshuffleLog,
          effectMsgs: L2,
          kept: true,
          statePatch: { ...inspectionMeta },
        };
      }
      if (gs?.deferAiGodChoice) {
        return {
          P,
          D,
          Disc,
          drawnCard,
          reshuffleLog,
          effectMsgs: L2,
          kept: true,
          pendingAiGodChoice: { playerIndex: ci, godCard: drawnCard },
          statePatch: {
            ...inspectionMeta,
            _pendingAiGodChoice: { playerIndex: ci, godCard: drawnCard },
          },
        };
      }
      // 同步结算路径（如黏液额外摸到邪神牌）必须把「遭遇邪神」已经产生的
      // SAN 扣减与 SAN 检定元数据一并带入邪神抉择，否则 resolveGodEncounterForAI
      // 会用空 inspectionMeta 覆盖掉它们，导致后续动画队列丢掉 SAN 扣减与检定翻牌。
      const gr = aiHandleGodCard(ci, drawnCard, P, D, Disc, L2, { ...gs, ...inspectionMeta }, true);
      P = gr.P; D = gr.D; Disc = gr.Disc;
      const mergedMeta = { ...inspectionMeta, ...(gr.inspectionMeta || {}), ...(gr.statePatch || {}) };
      // 本次遭遇产出的属性/检定事件序号 + 结构化的弃牌结果，供 startNextTurn
      // 把对应的视觉事件归属到这次摸牌（godEncounter.visualEventIds）。
      const godEncounter = {
        statSeqs: (mergedMeta._statEvents || [])
          .map(event => event?.seq)
          .filter(seq => Number.isFinite(seq) && seq > encounterStatSeqBefore),
        inspectionSeqs: (mergedMeta._visualEvents || [])
          .filter(event => event?.type === VISUAL_EVENT.INSPECTION)
          .map(event => event?.legacySeq)
          .filter(seq => Number.isFinite(seq) && seq > encounterInspectionSeqBefore),
        discardedGod: gr.discardedGod || null,
      };
      return { P, D, Disc, drawnCard, reshuffleLog, effectMsgs: L2, kept: true, statePatch: mergedMeta, godEncounter };
    } else {
      let effectMsg = revealedCultist
        ? `${whoName}（邪祀者）遭遇邪神 ${drawnCard.name}！（${formatGodEncounterProgress(encounterProgress)}）免疫SAN损耗`
        : `${whoName} 遭遇邪神 ${drawnCard.name}！（${formatGodEncounterProgress(encounterProgress)}）${formatSanLoss(cost)}`;

      let inspectionMeta = makeInspectionMeta(gs);
      let effectMsgs = [effectMsg];

      if (!revealedCultist && cost > 0) {
        const pendingGodChoice = {
          godCard: drawnCard,
          drawerIdx: ci,
          godEncounterCost: 0,
        };
        const damage = submitLossEvents({
          players: P, deck: D, discard: Disc, log: effectMsgs,
          currentTurn: gs?.currentTurn ?? ci,
          events: [{ targetIdx: ci, lostSan: cost, source: '邪神遭遇' }],
          continuation: { pendingGodChoice },
        });
        inspectionMeta = appendStatEventsToInspectionMeta(
          inspectionMeta,
          damage.beforePlayers,
          P,
          [effectMsg],
          '邪神遭遇',
        );
        if (damage.abilityData) {
          return {
            P, D, Disc, drawnCard,
            reshuffleLog,
            effectMsgs,
            kept: true,
            needsDecision: false,
            statePatch: {
              ...appendGodChoiceContinuation(inspectionMeta, gs, pendingGodChoice),
              abilityData: {
                ...damage.abilityData,
                ...(damage.phase === 'TSG_SLIME_BALANCE' ? {
                  pendingSanInspection: {
                    targetIndex: ci,
                    startIndex: gs?.currentTurn ?? ci,
                    reason: '邪神遭遇',
                  },
                } : {}),
              },
            },
          };
        }
        const baseLog = gs?.log ? [...gs.log, effectMsg] : [effectMsg];
        const processed = applyInspectionForSanLoss(ci, P[ci].san, gs?.currentTurn ?? ci, P, D, Disc, baseLog, inspectionMeta);
        P = processed.P; D = processed.D; Disc = processed.Disc;
        inspectionMeta = processed.inspectionMeta;
        effectMsgs.push(...processed.log.slice(baseLog.length));
      }

      // SAN loss from the encounter resolves before the god-gift decision.
      // If it already ended the game, never expose the card as an available
      // worship/keep/discard choice (the AI branch has the same short-circuit).
      if (!P[ci].isDead && P[ci].san <= 0) {
        return {
          P, D, Disc, drawnCard,
          reshuffleLog,
          effectMsgs,
          kept: true,
          needsDecision: false,
          statePatch: { ...inspectionMeta },
        };
      }

      return {
        P, D, Disc, drawnCard,
        reshuffleLog,
        effectMsgs,
        needGodChoice: true, needsDecision: false,
        godEncounterCost: 0,
        statePatch: hasPendingDamageReaction(inspectionMeta)
          ? appendGodChoiceContinuation(inspectionMeta, gs, {
              godCard: drawnCard,
              drawerIdx: ci,
              godEncounterCost: 0,
            })
          : { ...inspectionMeta }
      };
    }
  }

  // Forced trigger cards
  if (drawnCard.forced) {
    const res = applyFx(drawnCard, ci, null, P, D, Disc, gs, false, [], isAI);
    P = res.P; D = res.D; Disc = res.Disc; P[ci].hand.push(drawnCard);
    return { P, D, Disc, drawnCard, reshuffleLog, effectMsgs: [`${whoName} 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}（强制触发）`, ...res.msgs], statePatch: res.statePatch, kept: true, needsDecision: false };
  }

  // 穴居人战争隐藏规则1：如果摸到"穴居人战争"之前没有牌，强制展示"穴居人战争"
  if (drawnCard.type === 'caveDuel' && P[ci].hand.length === 0) {
    // 强制展示穴居人战争
    P[ci].hand.push(drawnCard);
    const logMsg = `${whoName} 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，之前没有牌，强制展示！`;
    return { P, D, Disc, drawnCard, reshuffleLog, effectMsgs: [logMsg], kept: true, needsDecision: false };
  }

  // AI auto-decision
  if (isAI) {
    const keepOverride = consumeDebugForceKeepOverride(gs, ci);
    const blindZoneIdentity = shouldBlindZoneDecision(P, ci, drawnCard);
    if (blindZoneIdentity) P[ci].blindNextZoneDecision = false;
    const keep = keepOverride === 'keep' ? true : keepOverride === 'discard' ? false : blindZoneIdentity ? Math.random() < 0.5 : aiShouldKeepZoneCard(drawnCard, ci, P, false, { discard: Disc, deck: D, gs });
    if (!keep) {
      Disc.push(drawnCard);
      return { P, D, Disc, drawnCard, reshuffleLog, effectMsgs: [`${P[ci].name} 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，评估后选择弃置`], needsDecision: false, _aiDrawnCard: drawnCard, discardedDrawnCard: true };
    }

    // AI Treasure Hunter dodge logic
    const effectiveRole = P[ci]._nyaBorrow || P[ci].role;
    const isTreasureHunter = effectiveRole === ROLE_TREASURE;
    const isDodgeableEffect = isDodgeableZoneCard(drawnCard);

    const moldyFoodRoll = drawnCard.type === 'moldyFood' ? 1 + (Math.random() * 6 | 0) : null;
    const conditionalNegativeApplies = shouldTriggerTreasureDodge(
      drawnCard,
      P[ci],
      { moldyFoodRoll },
    );
    const effectGs = moldyFoodRoll == null ? gs : { ...gs, _pendingMoldyFoodRoll: moldyFoodRoll };
    // Sphinx is the one zone card whose effect visually and semantically starts
    // after the trigger card has entered the hand. Keep it before applyFx so a
    // correctly guessed reward is appended after D4 in both rule and visual state.
    const keepBeforeEffect = drawnCard.type === 'sphinxGuess' || drawnCard.name === '斯芬克斯';

    let failedDodgeLog = null;
    if (isTreasureHunter && isDodgeableEffect && conditionalNegativeApplies) {
      P[ci].roleRevealed = true;
      const d1 = 1 + (Math.random() * 6 | 0);
      const dodgeSuccess = d1 >= 4;
      if (dodgeSuccess) {
        if (keepBeforeEffect) P[ci].hand.push(drawnCard);
        const res = applyFx(drawnCard, ci, null, P, D, Disc, effectGs, true, [], isAI);
        P = res.P; D = res.D; Disc = res.Disc;
        if (!keepBeforeEffect) P[ci].hand.push(drawnCard);
        const dodgeLog = `${P[ci].name}（寻宝者）摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，掷出 ${d1} 点，成功规避负面效果！`;
        const effectMsgs = drawnCard.type === 'albinoCreature' ? [...res.msgs, dodgeLog] : [dodgeLog, ...res.msgs];
        return { P, D, Disc, drawnCard, reshuffleLog, effectMsgs, statePatch: res.statePatch, kept: true, needsDecision: false, _aiDrawnCard: drawnCard };
      }
      failedDodgeLog = `${P[ci].name}（寻宝者）摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，掷出 ${d1} 点，未能规避，触发负面效果！`;
    }

    // Apply effect for AI
    if (keepBeforeEffect) P[ci].hand.push(drawnCard);
    const res = applyFx(drawnCard, ci, null, P, D, Disc, effectGs, false, [], isAI);
    P = res.P; D = res.D; Disc = res.Disc;
    if (!keepBeforeEffect) P[ci].hand.push(drawnCard);
    const keepLog = `${P[ci].name} 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，选择收入手牌并触发效果`;
    return { P, D, Disc, drawnCard, reshuffleLog, effectMsgs: failedDodgeLog ? [failedDodgeLog, ...res.msgs] : [keepLog, ...res.msgs], statePatch: res.statePatch, kept: true, needsDecision: false, _aiDrawnCard: drawnCard };
  }

  const playerKeepOverride = consumeDebugForceKeepOverride(gs, ci);
  const blindZoneIdentity = shouldBlindZoneDecision(P, ci, drawnCard);
  if (playerKeepOverride === 'keep') {
    if (blindZoneIdentity) P[ci].blindNextZoneDecision = false;
    const res = applyFx(drawnCard, ci, null, P, D, Disc, gs, false, [], isAI);
    P = res.P; D = res.D; Disc = res.Disc; P[ci].hand.push(drawnCard);
    return { P, D, Disc, drawnCard, reshuffleLog, effectMsgs: [`${whoName} 收入了 ${cardLogText(drawnCard, { alwaysShowName: true })}`, ...res.msgs], statePatch: res.statePatch, kept: true, needsDecision: false };
  }
  if (playerKeepOverride === 'discard') {
    if (blindZoneIdentity) P[ci].blindNextZoneDecision = false;
    Disc.push(drawnCard);
    return { P, D, Disc, drawnCard, reshuffleLog, effectMsgs: [`${whoName} 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，选择弃置`], kept: true, needsDecision: false, discardedDrawnCard: true };
  }

  // Player needs decision
  return { P, D, Disc, drawnCard: markBlindZoneCard(drawnCard, blindZoneIdentity), reshuffleLog, effectMsgs: [], needTarget: false, needsDecision: true, forcedKeep: false, blindZoneIdentity };
}

export function handleCardDraw(ci, ps, deck, disc, isAI = false, gs = {}) {
  // The animation source belongs to this draw, not to the resulting global
  // reversal state. In particular, drawing "反转复原" turns the effect off but
  // still came from discard; the following normal draw must explicitly switch
  // back to deck instead of inheriting the previous `_drawSourcePile` hint.
  // The restore card is also the authoritative lifetime token for this effect.
  // If an older/remote state lost the `false` patch after that token was drawn,
  // never let the stale boolean keep drawing real cards from discard forever.
  const hasRestoreInDiscard = disc.some(isGeomagneticRestore);
  const reversalActive = !!gs?.geomagneticReversalActive && hasRestoreInDiscard;
  const drawGs = reversalActive === !!gs?.geomagneticReversalActive
    ? gs
    : { ...gs, geomagneticReversalActive: reversalActive };
  const sourcePile = reversalActive && disc.length > 0
    ? 'discard'
    : 'deck';
  const result = handleCardDrawCore(ci, ps, deck, disc, isAI, drawGs);
  const staleReversalPatch = gs?.geomagneticReversalActive && !reversalActive
    ? { geomagneticReversalActive: false }
    : null;
  return {
    ...result,
    ...(result.drawnCard ? { sourcePile: result.sourcePile || sourcePile } : {}),
    ...(staleReversalPatch ? {
      statePatch: { ...(result.statePatch || {}), ...staleReversalPatch },
    } : {}),
  };
}

export function aiDrawAndApply(ci, ps, deck, disc, gs = {}) {
  return handleCardDraw(ci, ps, deck, disc, true, gs);
}

export function playerDrawCard(ps, deck, disc, ci = 0, gs = {}) {
  return handleCardDraw(ci, ps, deck, disc, false, gs);
}

// [PASSIVE_GOD_DERIVATIVE] 黑山羊幼仔回合开始伤害
function turnStartEvent_BgyDamage(P, next, D, Disc, L, gs, inspectionMeta) {
  if (P[next].isDead) return { P, D, Disc, L, inspectionMeta, winAfterBgy: null };

  const bgyCount = P[next].hand.filter(isBlackGoatYoung).length;
  if (bgyCount > 0) {
    const beforePlayers = copyPlayers(P);
    const linkPartnerIndices = getActiveDamageLinksForPlayer(P, next)
      .map(link => link.a === next ? link.b : link.a);
    const logStart = L.length;
    const reactionLogs = [];
    const damage = submitLossEvents({
      players: P, deck: D, discard: Disc, log: reactionLogs, currentTurn: next,
      events: [{ targetIdx: next, lostHp: bgyCount, lostSan: bgyCount, source: '黑山羊幼仔' }],
    });
    L.push(`【黑山羊幼仔】${P[next].name} 失去 ${bgyCount} HP 和 ${bgyCount} SAN`);
    L.push(...reactionLogs);
    inspectionMeta = appendStatEventsToInspectionMeta(
      inspectionMeta,
      beforePlayers,
      P,
      L.slice(logStart),
      '黑山羊幼仔',
    );
    const slimeDecision = damage.phase === 'TSG_SLIME_BALANCE' ? damage.abilityData : null;
    if (slimeDecision) inspectionMeta = { ...inspectionMeta, abilityData: slimeDecision };
    if (slimeDecision) return { P, D, Disc, L, inspectionMeta, winAfterBgy: null };
    const winAfterSanDepletion = checkWin(P, gs._isMP);
    if (winAfterSanDepletion) return { P, D, Disc, L, inspectionMeta, winAfterBgy: winAfterSanDepletion };
    if (P[next].san > 0 && P[next].san <= 6) {
      const baseLog = [...L];
      const inspectionSeqBefore = inspectionMeta?._inspectionSeq || 0;
      const processed = applyInspectionForSanLoss(next, P[next].san, next, P, D, Disc, baseLog, inspectionMeta);
      P = processed.P; D = processed.D; Disc = processed.Disc;
      inspectionMeta = {
        ...processed.inspectionMeta,
        // This inspection is caused by a pre-draw passive. Declare that
        // ownership at the rule boundary so the turn-start transaction can
        // compile it once, before the fixed draw, without log/state-diff
        // inference in the presentation layer.
        _visualEvents: (processed.inspectionMeta?._visualEvents || []).map(event => (
          event?.type === VISUAL_EVENT.INSPECTION &&
          Number.isFinite(event?.legacySeq) &&
          event.legacySeq > inspectionSeqBefore
            ? { ...event, turnStartStage: 'turnStart', turnStartStageOrder: 2 }
            : event
        )),
      };
      L.push(...processed.log.slice(baseLog.length));
    }
    if (P[next].hp <= 0) {
      killPlayerState(P, next, Disc, L);
    }
    if (!P[next]._pendingDamageLinkBreak) linkPartnerIndices.forEach(partnerIdx => {
      if (P[partnerIdx]?.hp <= 0 && !tryVritraImmortal(P, partnerIdx, next, D, Disc, L)) {
        killPlayerState(P, partnerIdx, Disc, L);
      }
    });
  }

  const winAfterBgy = checkWin(P, gs._isMP);
  return { P, D, Disc, L, inspectionMeta, winAfterBgy };
}

// [PASSIVE_OTHER] 两人一绳治愈
function turnStartEvent_LinkHeal(P, pendingLinkHeals, L, inspectionMeta, statLogs = null) {
  for (const heal of pendingLinkHeals) {
    const activeLink = getAllDamageLinks(P, { activeOnly: true }).find(link => link.id === heal.linkId);
    if (!activeLink) continue;
    L.push(heal.msg);
    const statEventSeq = (inspectionMeta?._statEventSeq || 0) + 1;
    const recovery = submitRecoveryEvents({
      players: P,
      events: [
        { targetIdx: heal.i, gainHp: heal.amount, source: '两人一绳', logHint: heal.msg },
        { targetIdx: heal.partnerIdx, gainHp: heal.amount, source: '两人一绳', logHint: heal.msg },
      ],
      statEventSeq,
      logs: [heal.msg],
    });
    inspectionMeta = appendStatChangeResult(inspectionMeta, recovery);
    if (statLogs) statLogs.push(heal.msg);
    removeDamageLink(P, heal.linkId);
  }
  return { P, L, inspectionMeta };
}

// [PASSIVE_OTHER] 中毒回合开始伤害
function turnStartEvent_PoisonDamage(P, next, D, Disc, L, gs, inspectionMeta, statLogs = null) {
  if (P[next].isDead) return { P, D, Disc, L, inspectionMeta, winAfterPoison: null, slimeDecision: null };
  const poisonStacks = P[next].poisonStacks || 0;
  if (poisonStacks <= 0) return { P, D, Disc, L, inspectionMeta, winAfterPoison: null, slimeDecision: null };

  const beforePlayers = copyPlayers(P);
  const reactionLogs = [];
  const damage = submitLossEvents({
    players: P, deck: D, discard: Disc, log: reactionLogs, currentTurn: next,
    events: [{ targetIdx: next, lostHp: poisonStacks, source: '中毒' }],
  });
  P[next].poisonStacks = Math.max(0, poisonStacks - 1);
  if (P[next].poisonStacks <= 0) delete P[next].poisonStacks;
  const msg = `【中毒】${P[next].name} 失去 ${poisonStacks} HP，消耗1层中毒`;
  L.push(msg);
  L.push(...reactionLogs);
  if (statLogs) statLogs.push(msg);
  inspectionMeta = appendStatEventsToInspectionMeta(
    inspectionMeta,
    beforePlayers,
    P,
    [msg],
    '中毒',
  );
  const slimeDecision = damage.phase === 'TSG_SLIME_BALANCE' ? damage.abilityData : null;
  if (slimeDecision) return { P, D, Disc, L, inspectionMeta, winAfterPoison: null, slimeDecision };
  if (P[next].hp <= 0) {
    if (!tryVritraImmortal(P, next, next, D, Disc, L)) {
      killPlayerState(P, next, Disc, L);
    }
  }
  const winAfterPoison = checkWin(P, gs._isMP);
  return { P, D, Disc, L, inspectionMeta, winAfterPoison, slimeDecision: null };
}

function hasPendingDamageReaction(statePatch) {
  return ['tsgSlimeBalance', 'etherealizeRedirect'].includes(statePatch?.abilityData?.type);
}

function deriveGodEncounterDecisionState(statePatch, godChoiceAbilityData) {
  if (!hasPendingDamageReaction(statePatch)) {
    return { phase: 'GOD_CHOICE', abilityData: godChoiceAbilityData };
  }
  return deriveEffectDecisionState(statePatch, {
    baseAbilityData: {},
    fallbackPhase: 'GOD_CHOICE',
  });
}

// [ACTIVE_GOD] NYA 偷身份
function turnStartEvent_NyaBorrow(P, next, L, gs, visualEvents = []) {
  if (P[next].godName !== 'NYA' || P[next].godLevel < 1) return { shouldEnterPhase: false };
  if (hasGodPowerImmunity(P[next])) {
    const hasBorrowTarget = next === 0
      ? P.some((p, i) => i > 0 && p.isDead)
      : P.some((p, i) => i !== next && p.isDead);
    if (hasBorrowTarget) appendGodPowerBlockedFeedback({ player: P[next], playerIdx: next, log: L, events: visualEvents });
    return { shouldEnterPhase: false };
  }

  if (next === 0) {
    const deadOthers = P.filter((p, i) => i > 0 && p.isDead);
    if (deadOthers.length > 0) return { shouldEnterPhase: true, logMsg: '你的邪神之力「千人千貌」：可借用已死角色的身份' };
  } else if (gs._isMP) {
    const deadOthers = P.filter((p, i) => i !== next && p.isDead);
    if (deadOthers.length > 0) return { shouldEnterPhase: true, logMsg: `${P[next].name} 的邪神之力「千人千貌」：可借用已死角色的身份` };
  } else {
    const deadPlayers = P.filter((p, i) => i > 0 && p.isDead && i !== next);
    if (deadPlayers.length) {
      const aiRole = P[next].role;
      let borrow = deadPlayers[0];
      if (aiRole === ROLE_CULTIST) borrow = deadPlayers.find(p => p.role === ROLE_HUNTER) || deadPlayers[0];
      const handLimit = 4 - (GOD_DEFS.NYA.levels[P[next].godLevel - 1].handPenalty);
      P[next] = { ...P[next], _nyaBorrow: borrow.role, _nyaHandLimit: handLimit };
      L.push(`${P[next].name}（NYA Lv.${P[next].godLevel}）千人千貌：本回合借用 [${borrow.role}]`);
    }
  }
  return { shouldEnterPhase: false };
}

function turnStartEvent_ZhuLight(P, D, next, gs) {
  return buildZhuLight(P, D, next, gs.zhuLight);
}

function endPreviousTurnCleanup(P, prevTurn) {
  P = clearExpiredTurnScopedEffects(P, prevTurn);
  if (!P[prevTurn]) return P;
  const p = { ...P[prevTurn] };
  delete p._nyaBorrow;
  delete p._nyaHandLimit;
  P[prevTurn] = p;
  return P;
}

export function grantTsathogguaSlimeAtEndTurn(P, prevTurn, L, visualEvents = []) {
  const p = P?.[prevTurn];
  if (!p || p.isDead || p.godName !== 'TSG' || !p.godLevel) return null;
  const count = GOD_DEFS.TSG.levels[(p.godLevel || 1) - 1]?.slimeCount || 0;
  if (!count) return null;
  if (hasGodPowerImmunity(p)) {
    appendGodPowerBlockedFeedback({
      player: p,
      playerIdx: prevTurn,
      log: L,
      events: visualEvents,
      turnStartStage: 'turnBoundary',
    });
    return null;
  }
  const playersBefore = copyPlayers(P);
  const cards = [];
  for (let i = 0; i < count; i++) {
    const card = createTsathogguaSlimeCard();
    cards.push(card);
    p.hand.push(card);
  }
  const msg = `【无定形体】${p.name} 获得${count}张撒托古亚的赐福黏液`;
  L.push(msg);
  return {
    ownerIdx: prevTurn,
    count,
    cards,
    msgs: [msg],
    playersBefore,
    playersAfter: copyPlayers(P),
  };
}

function getTsathogguaSlimesForDraw(P, next, L, visualEvents = []) {
  const p = P?.[next];
  if (!p || p.isDead || p.godName !== 'TSG' || !p.godLevel) return [];
  const slimes = (p.hand || []).filter(isTsathogguaSlime);
  if (!slimes.length) return [];
  if (hasGodPowerImmunity(p)) {
    appendGodPowerBlockedFeedback({ player: p, playerIdx: next, log: L, events: visualEvents });
    return [];
  }
  return slimes;
}

function findCardIndexByIdentity(cards = [], target) {
  if (!target) return -1;
  const byId = cards.findIndex(card => card && target.id != null && card.id === target.id);
  if (byId >= 0) return byId;
  return cards.findIndex(card => card === target || (
    isTsathogguaSlime(card) &&
    isTsathogguaSlime(target) &&
    [card.key, card.name, card.type].filter(Boolean).join(':') === [target.key, target.name, target.type].filter(Boolean).join(':')
  ));
}

function consumeTsathogguaSlimeBeforeDraw(P, ownerIdx, slime, L, visualEvents = []) {
  const holderIdx = ownerIdx;
  const cardIdx = findCardIndexByIdentity(P?.[holderIdx]?.hand || [], slime);
  // Extra-draw rights are checked at resolution time, not locked when the
  // draw phase opens. A slime transferred away before its turn is reached no
  // longer grants the original owner a draw and must not be consumed remotely.
  if (holderIdx < 0 || cardIdx < 0) return null;
  const holder = P[holderIdx];
  const playersBefore = copyPlayers(P);
  const [removed] = holder.hand.splice(cardIdx, 1);
  const msg = `【无定形体】${holder.name} 的1张撒托古亚的赐福黏液消失`;
  L.push(msg);
  const event = createTsathogguaSlimePopEvent({
    playerIdx: holderIdx,
    playerName: holder.name,
    cards: [removed || slime].filter(Boolean),
    msgs: [msg],
    playersBefore,
    playersAfter: copyPlayers(P),
  });
  if (event) visualEvents.push(event);
  return {
    targetPid: holderIdx,
    cards: [removed || slime].filter(Boolean),
    msgs: [msg],
    playersBefore,
    playersAfter: copyPlayers(P),
  };
}

function consumeSkipNextDraw(P, playerIdx, L, { local = false } = {}) {
  const player = P?.[playerIdx];
  if (!player?.skipNextDraw) return null;
  const reason = player.skipNextDrawReason || '扭伤';
  delete player.skipNextDraw;
  delete player.skipNextDrawReason;
  const msg = local
    ? `你因${reason}而无法摸牌`
    : `${player.name} 因${reason}而无法摸牌`;
  L.push(msg);
  return { reason, msg };
}

function buildSkippedDrawActionState({
  gs,
  zhuLight,
  players,
  deck,
  discard,
  log,
  currentTurn,
  newTurn,
  newTurnKey,
  turnStartLogs,
  statLogs,
  preTurnPlayers,
  globalOnlySwapOwner,
  extra = {},
}) {
  return {
    ...gs,
    zhuLight,
    players,
    deck,
    discard,
    log,
    currentTurn,
    skillUsed: false,
    restUsed: false,
    huntAbandoned: [],
    godFromHandUsed: false,
    godTriggeredThisTurn: false,
    phase: 'ACTION',
    drawReveal: null,
    selectedCard: null,
    abilityData: {},
    globalOnlySwapOwner,
    turn: newTurn,
    _turnKey: newTurnKey,
    _turnStartLogs: turnStartLogs,
    _drawLogs: [],
    _statLogs: statLogs,
    _preTurnPlayers: preTurnPlayers,
    _playersBeforeThisDraw: copyPlayers(players),
    ...extra,
  };
}

function buildPendingZhuRevealState({
  gs, guard, players, deck, discard, log, currentTurn, newTurn, newTurnKey,
  turnStartLogs, drawLogs, turnDrawVisualEvents, statLogs, preTurnPlayers,
  beforeDrawPlayers, globalOnlySwapOwner, abilityData = {},
}) {
  return {
    ...gs,
    zhuLight: guard.zhuLight,
    players,
    deck,
    discard,
    log,
    currentTurn,
    phase: 'ZHU_HIDE_AI_DRAW',
    drawReveal: null,
    selectedCard: null,
    abilityData: { zhuGuard: guard, drawerIdx: currentTurn, ...abilityData },
    skillUsed: false,
    restUsed: false,
    huntAbandoned: [],
    godFromHandUsed: false,
    godTriggeredThisTurn: false,
    globalOnlySwapOwner,
    turn: newTurn,
    _turnKey: newTurnKey,
    _turnStartLogs: turnStartLogs,
    _drawLogs: drawLogs,
    _visualEvents: mergeVisualEventLists(gs._visualEvents, turnDrawVisualEvents),
    _statLogs: statLogs,
    _preTurnPlayers: preTurnPlayers,
    _playersBeforeThisDraw: beforeDrawPlayers,
  };
}

export function continueTurnStartAfterDamageReaction(state) {
  if (!state?.abilityData) return state;
  const abilityData = state.abilityData;
  const next = abilityData._turnOwner ?? state.currentTurn;
  let P = copyPlayers(state.players || []);
  let D = [...(state.deck || [])];
  let Disc = [...(state.discard || [])];
  let L = [...(state.log || [])];
  let inspectionMeta = makeInspectionMeta(state);
  const statLogs = [...(state._statLogs || [])];
  const pendingEventIds = new Set(abilityData._pendingTurnStartEventIds || []);
  if (abilityData._pendingTurnStartPoison) pendingEventIds.add(TURN_START_EVENT.POISON_DAMAGE);
  if (abilityData._pendingTurnStartLinkHeals?.length) pendingEventIds.add(TURN_START_EVENT.DAMAGE_LINK_HEAL);
  if (pendingEventIds.has(TURN_START_EVENT.POISON_DAMAGE)) {
    const poison = turnStartEvent_PoisonDamage(P, next, D, Disc, L, state, inspectionMeta, statLogs);
    P = poison.P; D = poison.D; Disc = poison.Disc; L = poison.L; inspectionMeta = poison.inspectionMeta;
    if (poison.slimeDecision) {
      return {
        ...state,
        ...inspectionMeta,
        players: P, deck: D, discard: Disc, log: L,
        phase: 'TSG_SLIME_BALANCE',
        abilityData: {
          ...abilityData,
          ...poison.slimeDecision,
          _pendingTurnStartPoison: false,
          _pendingTurnStartEventIds: [...pendingEventIds].filter(id => id !== TURN_START_EVENT.POISON_DAMAGE),
        },
        _statLogs: statLogs,
      };
    }
    if (poison.winAfterPoison) return { ...state, ...inspectionMeta, players: P, deck: D, discard: Disc, log: L, gameOver: poison.winAfterPoison };
  }
  const validHeals = pendingEventIds.has(TURN_START_EVENT.DAMAGE_LINK_HEAL)
    ? (abilityData._pendingTurnStartLinkHeals || []).filter(heal => (
    getAllDamageLinks(P, { activeOnly: true }).some(link => link.id === heal.linkId)
    ))
    : [];
  const link = turnStartEvent_LinkHeal(P, validHeals, L, inspectionMeta, statLogs);
  P = link.P; L = link.L; inspectionMeta = link.inspectionMeta;
  const cleanedAbilityData = { ...abilityData };
  delete cleanedAbilityData._pendingTurnStartPoison;
  delete cleanedAbilityData._pendingTurnStartLinkHeals;
  delete cleanedAbilityData._pendingTurnStartEventIds;
  const zhuLight = pendingEventIds.has(TURN_START_EVENT.ZHU_LIGHT)
    ? turnStartEvent_ZhuLight(P, D, next, state)
    : state.zhuLight;
  const nya = pendingEventIds.has(TURN_START_EVENT.NYA_BORROW)
    ? turnStartEvent_NyaBorrow(P, next, L, state, state._visualEvents || [])
    : { shouldEnterPhase: false };
  if (nya.shouldEnterPhase) {
    return {
      ...state,
      ...inspectionMeta,
      zhuLight,
      players: P,
      deck: D,
      discard: Disc,
      log: [...L, nya.logMsg],
      phase: 'NYA_BORROW',
      abilityData: {},
      _statLogs: statLogs,
    };
  }
  return {
    ...state,
    ...inspectionMeta,
    zhuLight,
    players: P, deck: D, discard: Disc, log: L,
    phase: 'ACTION',
    abilityData: cleanedAbilityData,
    _statLogs: statLogs,
  };
}

function resolveNextTurnState(gs, opts = {}) {
  const {
    isDebugMode = false,
    allAi = false,
    isAiControlled = null,
    skipCurrentEndTurnStage = false,
  } = opts;
  const shouldUseAiController = (playerIndex) => (
    allAi || (typeof isAiControlled === 'function' && !!isAiControlled(playerIndex, gs))
  );
  // Reset multiplyUsed at the start of every turn
  const inheritedTsgSlimeGrantEvents = (Array.isArray(gs._carryTsgSlimeGrantEvents) ? gs._carryTsgSlimeGrantEvents : [])
    .map(event => event?.type === VISUAL_EVENT.TSG_SLIME_GRANT ? event : createTsathogguaSlimeGrantEvent(event))
    .filter(Boolean);
  const inheritedGodPowerBlockedEvents = Array.isArray(gs._carryGodPowerBlockedEvents) ? gs._carryGodPowerBlockedEvents : [];
  const inheritedSkippedTurnReplays = Array.isArray(gs._carrySkippedTurnReplays) ? gs._carrySkippedTurnReplays : [];
  // 黄液（蟾蜍之神回合结束发放）属神牌事件，按 END_TURN_PRIORITY 应先于其他卡牌（如无尽通道）结算。
  // 若已在无尽通道重播前发放（见 App.beginEndTurnReplay），此处跳过，避免重复发放。
  const skipEndTurnTsgSlimeGrant = !!gs._tsgSlimeGrantedAtTurnEnd;
  gs = {
    ...gs,
    multiplyUsed: false,
    // Target events are one-shot animation payloads. Keep the monotonically
    // increasing _apophisTargetSeq watermark across turns, but never let the
    // previous turn's final roll enter the next turn's draw replay.
    _apophisTargetEvent: null,
    _visualEvents: [...inheritedGodPowerBlockedEvents, ...inheritedTsgSlimeGrantEvents],
    _skippedTurnReplays: inheritedSkippedTurnReplays,
    _carryTsgSlimeGrantEvents: null,
    _carryGodPowerBlockedEvents: null,
    _carrySkippedTurnReplays: null,
    _tsgSlimeGrantedAtTurnEnd: undefined,
  };
  const visualEvents = gs._visualEvents;
  const inheritedGodPowerBlockedEventCount = inheritedGodPowerBlockedEvents.length;
  const N = gs.players.length;
  let P = copyPlayers(gs.players), D = [...gs.deck], Disc = [...gs.discard], L = [...gs.log];
  let _P_beforeTurn = copyPlayers(P);
  let next = gs.currentTurn;
  let turnStartLogs = [];
  let drawLogs = [];
  let statLogs = [];
  // Keep the currently lit deck cards until a real turn-start refresh replaces
  // them. A face-down/resting player has no turn-start phase, but CTH rest draws
  // are still reveal draws and may therefore be intercepted by an existing ZHU
  // light from its owner.
  let zhuLight = gs.zhuLight || null;
  let pendingLinkHeals = [];
  let inspectionMeta = makeInspectionMeta(gs);
  const turnDir = gs.turnDirection || 1;
  const tsgSlimeGrantEvents = [...inheritedTsgSlimeGrantEvents];
  // A recursive hop over a face-down player represents a skipped turn, which
  // has no end-turn stage. Do not manufacture its passive end-turn events.
  const tsgSlimeGrant = (skipEndTurnTsgSlimeGrant || skipCurrentEndTurnStage)
    ? null
    : grantTsathogguaSlimeAtEndTurn(P, gs.currentTurn, L, visualEvents);
  if (tsgSlimeGrant) {
    const grantVisualEvent = createTsathogguaSlimeGrantEvent(tsgSlimeGrant);
    if (grantVisualEvent) {
      tsgSlimeGrantEvents.push(grantVisualEvent);
      visualEvents.push(grantVisualEvent);
    }
    const proliferatingZPatch = appendPublicCardGainTriggers(gs, P, tsgSlimeGrant.ownerIdx, tsgSlimeGrant.cards);
    if (proliferatingZPatch.proliferatingZQueue) {
      gs = { ...gs, proliferatingZQueue: proliferatingZPatch.proliferatingZQueue };
    }
  }
  for (let i = 1; i <= N; i++) { next = (gs.currentTurn + i * turnDir + N) % N; if (!P[next].isDead) break; }
  const nextProliferatingZ = clearExpiredProliferatingZ(gs, gs.currentTurn);
  gs = nextProliferatingZ === gs.proliferatingZ
    ? gs
    : { ...gs, proliferatingZ: nextProliferatingZ, proliferatingZQueue: [] };
  // 增加回合数
  const newTurn = (gs.turn || 0) + 1;
  const newTurnKey = (gs._turnKey || 0) + 1;
  // 清理上回合玩家的临时状态
  P = endPreviousTurnCleanup(P, gs.currentTurn);
  _P_beforeTurn = copyPlayers(P);
  // 此后所有回合内操作（摸牌、效果结算）都应以 next 为当前回合拥有者，
  // 否则 applyFx 等函数会拿 gs.currentTurn（旧回合）去决定 _turnOwner/检定触发者。
  gs = enterTurnFlowStage({ ...gs, currentTurn: next }, TURN_FLOW_STAGE.TURN_START);
  // 清理过期的两人一绳链条；多条链按创建顺序分别治疗或移除。
  const expiredInactiveIds = [];
  getAllDamageLinks(P).forEach(link => {
    const shouldExpire = !P[next].isResting && (
      link.expiryOwner === next ||
      (link.expiryOwner != null && (!P[link.expiryOwner] || P[link.expiryOwner].isDead)) ||
      (link.expiryOwner == null && link.expiryTurn <= newTurn)
    );
    if (!shouldExpire) return;
    if (link.active) {
      const healAmount = 4;
      const linkMsg = `【两人一绳】绳索未断裂！${P[link.a].name} 和 ${P[link.b].name} 各回复 ${healAmount} HP`;
      pendingLinkHeals.push({ linkId: link.id, i: link.a, partnerIdx: link.b, amount: healAmount, msg: linkMsg });
    } else {
      expiredInactiveIds.push(link.id);
    }
  });
  removeDamageLinks(P, expiredInactiveIds);
  P.forEach(p => {
    // 重置当前回合生效的检定牌相关状态
    p.disableRest = false;
    p.disableSkill = false;
    p.handLimitDecrease = 0;
  });
  let globalOnlySwapOwner = gs.globalOnlySwapOwner;
  // If this player was resting: wake up (flip card face-up), skip their turn entirely
  if (P[next].isResting) {
    const skippedTurnBeforePlayers = copyPlayers(_P_beforeTurn);
    const skippedTurnBeforeLog = [...L];
    const skippedTurnBeforeStatSeq = inspectionMeta?._statEventSeq || 0;
    const skippedTurnBeforeInspectionSeq = inspectionMeta?._inspectionSeq || 0;
    const skippedTurnCthReplay = null;
    // A resting player still owns a distinct turn, even though that turn has no
    // start phase (and therefore no turn-start effects or draw phase). Keep the
    // visual/log boundary before recording the wake-up skip.
    turnStartLogs = [`── ${P[next].name} 的回合开始 ──`];
    L.push(...turnStartLogs);
    P[next].isResting = false;
    L.push(`${P[next].name} 从休息中醒来，跳过本回合`);
    // Skip the turn: advance past player to the next living player
    // Hand limit is NOT enforced here — excess cards are kept until the next normal turn ends
    const skippedTurnReplay = {
      restingSkip: true,
      playerIdx: next,
      playerName: P[next].name,
      beforePlayers: skippedTurnBeforePlayers,
      afterPlayers: copyPlayers(P),
      beforeLog: skippedTurnBeforeLog,
      afterLog: [...L],
      turnStartLogs: [...turnStartLogs],
      beforeStatSeq: skippedTurnBeforeStatSeq,
      afterStatSeq: inspectionMeta?._statEventSeq || skippedTurnBeforeStatSeq,
      beforeInspectionSeq: skippedTurnBeforeInspectionSeq,
      afterInspectionSeq: inspectionMeta?._inspectionSeq || skippedTurnBeforeInspectionSeq,
      cthReplay: skippedTurnCthReplay,
    };
    return resolveNextTurnState(
      { ...gs, players: P, deck: D, discard: Disc, log: L, currentTurn: next, skillUsed: false, restUsed: false, godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, _carryTsgSlimeGrantEvents: tsgSlimeGrantEvents, _carryGodPowerBlockedEvents: visualEvents.filter(event => event?.type === VISUAL_EVENT.GOD_POWER_BLOCKED).slice(inheritedGodPowerBlockedEventCount), _carrySkippedTurnReplays: [...inheritedSkippedTurnReplays, skippedTurnReplay] },
      { ...opts, skipCurrentEndTurnStage: true },
    );
  }
  // 翻面跳过回合没有回合开始/摸牌/行动/结束阶段，因此所有“下一回合”
  // 状态都只在角色真正进入正常回合时结转或到期。
  if (P[next]) {
    P[next].disableRest = !!P[next].disableRestNextTurn;
    P[next].disableSkill = !!P[next].disableSkillNextTurn;
    P[next].handLimitDecrease = P[next].handLimitDecreaseNextTurn || 0;
    P[next].disableRestNextTurn = false;
    P[next].disableSkillNextTurn = false;
    P[next].handLimitDecreaseNextTurn = 0;
  }
  if (globalOnlySwapOwner === next) {
    globalOnlySwapOwner = null;
    L.push('"全员技能变为掉包"的效果结束了');
  }
  turnStartLogs = [`── ${P[next].name} 的回合开始 ──`];
  L.push(...turnStartLogs);
  // The registry is the single shared ordering source for local, multiplayer
  // and AI turns. It puts passive effects first, then active god powers.
  const turnStartEvents = getTurnStartEvents(P, next, { pendingLinkHeals });
  const turnStartEventIds = new Set(turnStartEvents.map(event => event.id));
  const pendingAfter = eventId => {
    const eventIndex = turnStartEvents.findIndex(event => event.id === eventId);
    return turnStartEvents.slice(eventIndex + 1).map(event => event.id);
  };
  // A real turn start refreshes ZHU light. Skipped face-down turns returned
  // above and therefore neither clear nor execute any turn-start stage.
  zhuLight = null;
  // [PASSIVE_GOD_DERIVATIVE] 黑山羊幼仔回合开始伤害
  const bgy = turnStartEventIds.has(TURN_START_EVENT.BLACK_GOAT_YOUNG_DAMAGE)
    ? turnStartEvent_BgyDamage(P, next, D, Disc, L, gs, inspectionMeta)
    : { P, D, Disc, L, inspectionMeta, winAfterBgy: null };
  P = bgy.P; D = bgy.D; Disc = bgy.Disc; L = bgy.L; inspectionMeta = bgy.inspectionMeta; gs = { ...gs, ...inspectionMeta };
  if (bgy.winAfterBgy) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, gameOver: bgy.winAfterBgy, multiplyUsed: false };
  if (inspectionMeta?.abilityData?.type === 'tsgSlimeBalance') {
    // 黑山羊伤害发生在本回合的摸牌阶段之前。黏液平衡会暂时
    // 中断 startNextTurn，因此必须显式保存后续的黏液额外摸牌与
    // 固定摸牌；否则决策结束后会直接恢复 AI_TURN 并开始行动。
    return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, phase: 'TSG_SLIME_BALANCE', abilityData: { ...inspectionMeta.abilityData, _turnOwner: next, continueTurnStartDraw: true, _pendingTurnStartLinkHeals: pendingLinkHeals, _pendingTurnStartEventIds: pendingAfter(TURN_START_EVENT.BLACK_GOAT_YOUNG_DAMAGE) }, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn };
  }
  // [PASSIVE_OTHER] 中毒回合开始伤害
  const poison = turnStartEventIds.has(TURN_START_EVENT.POISON_DAMAGE)
    ? turnStartEvent_PoisonDamage(P, next, D, Disc, L, gs, inspectionMeta, statLogs)
    : { P, D, Disc, L, inspectionMeta, winAfterPoison: null, slimeDecision: null };
  P = poison.P; D = poison.D; Disc = poison.Disc; L = poison.L; inspectionMeta = poison.inspectionMeta; gs = { ...gs, ...inspectionMeta };
  if (poison.slimeDecision) {
    return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, phase: 'TSG_SLIME_BALANCE', abilityData: { ...poison.slimeDecision, _turnOwner: next, continueTurnStartDraw: true, _pendingTurnStartLinkHeals: pendingLinkHeals, _pendingTurnStartEventIds: pendingAfter(TURN_START_EVENT.POISON_DAMAGE) }, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: copyPlayers(P) };
  }
  if (poison.winAfterPoison) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, gameOver: poison.winAfterPoison, multiplyUsed: false };
  // [PASSIVE_OTHER] 两人一绳治愈
  const link = turnStartEvent_LinkHeal(P, turnStartEventIds.has(TURN_START_EVENT.DAMAGE_LINK_HEAL) ? pendingLinkHeals : [], L, inspectionMeta, statLogs);
  P = link.P; L = link.L; inspectionMeta = link.inspectionMeta; gs = { ...gs, ...inspectionMeta };
  if (turnStartEventIds.has(TURN_START_EVENT.ZHU_LIGHT)) {
    zhuLight = turnStartEvent_ZhuLight(P, D, next, gs);
  }
  if (next === 0 && !shouldUseAiController(next)) {
    // Debug: 强制摸牌 - 玩家
    applyDebugForceDrawToTop(gs, next, D);
    // [ACTIVE_GOD] NYA 偷身份
    const nya = turnStartEventIds.has(TURN_START_EVENT.NYA_BORROW)
      ? turnStartEvent_NyaBorrow(P, 0, L, gs, visualEvents)
      : { shouldEnterPhase: false };
    if (nya.shouldEnterPhase) {
      return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: [...L, nya.logMsg], currentTurn: 0, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'NYA_BORROW', abilityData: {}, drawReveal: null, selectedCard: null, globalOnlySwapOwner, debugForceCard: null, debugForceCardTarget: null, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: copyPlayers(P) };
    }
    gs = enterTurnFlowStage(gs, TURN_FLOW_STAGE.DRAW);
    // 检查是否需要跳过摸牌
    if (consumeSkipNextDraw(P, 0, L, { local: true })) {
      const win = checkWin(P, gs._isMP); if (win) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, gameOver: win, turn: newTurn, _turnKey: newTurnKey, debugForceCard: null, debugForceCardTarget: null };
      return buildSkippedDrawActionState({
        gs,
        zhuLight,
        players: P,
        deck: D,
        discard: Disc,
        log: L,
        currentTurn: 0,
        newTurn,
        newTurnKey,
        turnStartLogs,
        statLogs,
        preTurnPlayers: _P_beforeTurn,
        globalOnlySwapOwner,
        extra: { debugForceCard: null, debugForceCardTarget: null },
      });
    }
    const _P_beforeDraw = copyPlayers(P);
    const turnDrawVisualEvents = [];
    // Do not snapshot slime entitlement at draw-phase start. Each extra draw
    // consumes one slime that is still in the current drawer's hand now; a
    // slime lost during an earlier draw can no longer grant a later draw.
    while (true) {
      const tsgSlime = getTsathogguaSlimesForDraw(P, 0, L, visualEvents)[0];
      if (!tsgSlime) break;
      const slimePop = consumeTsathogguaSlimeBeforeDraw(P, 0, tsgSlime, L, visualEvents);
      if (!slimePop) continue;
      if (!gs.geomagneticReversalActive) {
        const guard = getZhuTopGuard({ ...gs, players: P, deck: D, currentTurn: 0, zhuLight }, D);
        if (guard) return buildPendingZhuRevealState({
          gs, guard, players: P, deck: D, discard: Disc, log: L, currentTurn: 0,
          newTurn, newTurnKey, turnStartLogs, drawLogs, turnDrawVisualEvents, statLogs,
          preTurnPlayers: _P_beforeTurn, beforeDrawPlayers: _P_beforeDraw, globalOnlySwapOwner,
          abilityData: { fromTsathogguaSlime: true, continueTurnStartDraw: true, _tsgExtraDrawReady: true, _turnOwner: 0 },
        });
      }
      const playersBeforeSlimeDraw = copyPlayers(P);
      const rSlime = playerDrawCard(P, D, Disc, 0, gs);
      P = rSlime.P; D = rSlime.D; Disc = rSlime.Disc;
      // Every reveal draw re-evaluates its source. Effects such as geomagnetic
      // reversal/restoration produced by this draw must affect the very next
      // slime/fixed draw in the same draw phase.
      if (rSlime.statePatch) gs = { ...gs, ...rSlime.statePatch };
      if (rSlime.drawnCard) {
        if (rSlime.reshuffleLog) { L.push(rSlime.reshuffleLog); drawLogs.push(rSlime.reshuffleLog); }
        if (slimePop) drawLogs.push(...slimePop.msgs);
        const msg = `【无定形体】你额外摸到 ${drawCardDecisionText(rSlime.drawnCard)}`;
        L.push(msg); drawLogs.push(msg);
        appendTurnDrawVisualEvents(turnDrawVisualEvents, {
          playerIdx: 0,
          playerName: P[0].name,
          card: rSlime.drawnCard,
          sourcePile: rSlime.sourcePile,
          msgs: [msg],
          reshuffleLog: rSlime.reshuffleLog,
          fromTsathogguaSlime: true,
          slimePop,
          ...buildDrawKeepPresentation({
            playersBefore: playersBeforeSlimeDraw,
            playersAfter: P,
            playerIdx: 0,
            card: rSlime.drawnCard,
          }),
        });
      }
      if (rSlime.needGodChoice) {
        const godChoiceAbilityData={godCard:rSlime.drawnCard,drawerIdx:0,godEncounterCost:rSlime.godEncounterCost,fromTsathogguaSlime:true,continueTurnStartDraw:true,_turnOwner:0};
        const decisionState=deriveGodEncounterDecisionState(rSlime.statePatch,godChoiceAbilityData);
        return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: true, phase: decisionState.phase, abilityData: decisionState.abilityData, drawReveal: null, selectedCard: null, globalOnlySwapOwner, _playersBeforeThisDraw: _P_beforeDraw, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn }, turnDrawVisualEvents);
      }
      if (rSlime.needsDecision) {
        return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'DRAW_REVEAL', drawReveal: { card: rSlime.drawnCard, msgs: rSlime.effectMsgs, needsDecision: true, forcedKeep: !!rSlime.forcedKeep, drawerIdx: 0, drawerName: P[0].name, fromTsathogguaSlime: true, reshuffleLog: rSlime.reshuffleLog }, selectedCard: null, abilityData: { fromTsathogguaSlime: true, continueTurnStartDraw: true, _turnOwner: 0 }, globalOnlySwapOwner, _playersBeforeThisDraw: _P_beforeDraw, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn }, turnDrawVisualEvents);
      }
      if (rSlime.effectMsgs?.length) L.push(...rSlime.effectMsgs);
    }
    // 循环内的黏液额外摸牌消息已逐条写入 L，最终统一 flush 时只补固定摸牌新增的部分，
    // 否则额外摸牌/黏液消失消息会在日志里重复出现两次。
    const drawLogsSyncedCount = drawLogs.length;
    if (!gs.geomagneticReversalActive) {
      const guard = getZhuTopGuard({ ...gs, players: P, deck: D, currentTurn: 0, zhuLight }, D);
      if (guard) return buildPendingZhuRevealState({
        gs, guard, players: P, deck: D, discard: Disc, log: L, currentTurn: 0,
        newTurn, newTurnKey, turnStartLogs, drawLogs, turnDrawVisualEvents, statLogs,
        preTurnPlayers: _P_beforeTurn, beforeDrawPlayers: _P_beforeDraw, globalOnlySwapOwner,
      });
    }
    const playersBeforeFixedDraw = copyPlayers(P);
    const res = playerDrawCard(P, D, Disc, 0, gs);
    P = res.P; D = res.D; Disc = res.Disc;
    // 多人游戏中记录玩家0摸牌信息到日志，让其他玩家可见（单机不需要，DRAW_REVEAL 时可见）
    if (res.reshuffleLog) drawLogs.push(res.reshuffleLog);
    if (res.drawnCard && !res.kept) {
      const msg = `${gs._isMP ? P[0].name : '你'} 摸到 ${drawCardDecisionText(res.drawnCard)}`;
      drawLogs.push(msg);
      appendTurnDrawVisualEvents(turnDrawVisualEvents, {
        playerIdx: 0,
        playerName: P[0].name,
        card: res.drawnCard,
        sourcePile: res.sourcePile,
        msgs: [msg],
        reshuffleLog: res.reshuffleLog,
        ...buildDrawKeepPresentation({
          playersBefore: playersBeforeFixedDraw,
          playersAfter: P,
          playerIdx: 0,
          card: res.drawnCard,
        }),
      });
    }
    if (res.effectMsgs?.length) {
      if (res.needGodChoice) {
        // 邪神牌：遭遇消息跟随翻牌动画；检定消息由 INSPECTION 视觉事件单独驱动。
        const split = splitGodEncounterLogs(res.effectMsgs);
        drawLogs.push(...split.encounterLogs);
        statLogs.push(...split.inspectionLogs);
      } else {
        const split = splitAnimBoundLogs(res.effectMsgs);
        drawLogs.push(...split.preStat);
        statLogs.push(...split.stat);
      }
    }
    if (drawLogs.length > drawLogsSyncedCount) L.push(...drawLogs.slice(drawLogsSyncedCount));
    if (statLogs.length) appendMissingLogOccurrences(L, statLogs);
    if (!res.drawnCard) { L.push('牌堆耗尽！'); return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, phase: 'ACTION', drawReveal: null, abilityData: {}, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn }, turnDrawVisualEvents); }
    if (res.needGodChoice) {
      const inspectionPatch = res.statePatch || {};
      const godChoiceAbilityData={godCard:res.drawnCard,drawerIdx:0,godEncounterCost:res.godEncounterCost};
      const decisionState=deriveGodEncounterDecisionState(inspectionPatch,godChoiceAbilityData);
      return {
        ...gs,
        zhuLight,
        players: P,
        deck: D,
        discard: Disc,
        log: L,
        currentTurn: 0,
        skillUsed: false,
        restUsed: false,
        huntAbandoned: [],
        godFromHandUsed: false,
        godTriggeredThisTurn: true,
        phase: decisionState.phase,
        abilityData: decisionState.abilityData,
        drawReveal: null,
        selectedCard: null,
        globalOnlySwapOwner,
        _playersBeforeThisDraw: _P_beforeDraw,
        turn: newTurn,
        _turnKey: newTurnKey,
        _turnStartLogs: turnStartLogs,
        _drawLogs: drawLogs,
        _visualEvents: mergeVisualEventLists(inspectionPatch._visualEvents, turnDrawVisualEvents),
        _statLogs: statLogs,
        _preTurnPlayers: _P_beforeTurn,
        _aiDrawnCard: null,
        _drawnCard: res.drawnCard ?? null,
        _drawSourcePile: res.sourcePile,
        inspectionDeck: inspectionPatch.inspectionDeck,
        inspectionDiscard: inspectionPatch.inspectionDiscard,
        sealLooseningCount: inspectionPatch.sealLooseningCount,
        houndsOfTindalosActive: inspectionPatch.houndsOfTindalosActive,
        houndsOfTindalosTarget: inspectionPatch.houndsOfTindalosTarget,
        houndsOfTindalosElapsed: inspectionPatch.houndsOfTindalosElapsed,
        _inspectionSeq: inspectionPatch._inspectionSeq,
        _inspectionCard: inspectionPatch._inspectionCard,
        _inspectionTarget: inspectionPatch._inspectionTarget,
        _inspectionBeforePlayers: inspectionPatch._inspectionBeforePlayers,
        _inspectionPrevLogLen: inspectionPatch._inspectionPrevLogLen,
        _statEvents: inspectionPatch._statEvents,
        _statEventSeq: inspectionPatch._statEventSeq,
        _decisionContinuations: inspectionPatch._decisionContinuations || [],
      };
    }
    const playerTurnAnimMeta = {
      currentTurn: 0,
      turn: newTurn,
      _turnKey: newTurnKey,
      skillUsed: false,
      restUsed: false,
      huntAbandoned: [],
      godFromHandUsed: false,
      godTriggeredThisTurn: false,
      phase: res.kept ? 'ACTION' : 'DRAW_REVEAL',
      drawReveal: res.drawnCard ? {
        card: res.drawnCard,
        msgs: res.effectMsgs,
        needsDecision: !!res.needsDecision,
        forcedKeep: !!res.forcedKeep,
        drawerIdx: 0,
        drawerName: P[0].name,
        sourcePile: res.sourcePile,
        reshuffleLog: res.reshuffleLog,
      } : null,
      selectedCard: null,
      abilityData: {},
      globalOnlySwapOwner,
      _playersBeforeThisDraw: _P_beforeDraw,
      _turnStartLogs: turnStartLogs,
      _drawLogs: drawLogs,
      _visualEvents: mergeVisualEventLists(res.statePatch?._visualEvents, turnDrawVisualEvents),
      _statLogs: statLogs,
      _preTurnPlayers: _P_beforeTurn,
      ...(res.statePatch || {}),
    };
    const win = hasPendingDamageReaction(res.statePatch) ? null : checkWin(P, gs._isMP); if (win) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, gameOver: win, ...playerTurnAnimMeta };
    // 强制触发牌：效果已执行，直接进入 ACTION；drawReveal 保留卡牌供翻牌动画使用，但不广播 DRAW_REVEAL
    if (res.kept) {
      const decisionState = deriveEffectDecisionState(res.statePatch, {
        baseAbilityData: {},
        fallbackPhase: 'ACTION',
      });
      return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: decisionState.phase, drawReveal: { card: res.drawnCard, msgs: res.effectMsgs, needsDecision: false, forcedKeep: false, drawerIdx: 0, drawerName: P[0].name, sourcePile: res.sourcePile }, selectedCard: null, abilityData: decisionState.abilityData, globalOnlySwapOwner, _playersBeforeThisDraw: _P_beforeDraw, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _drawSourcePile: res.sourcePile, ...(res.statePatch || {}) }, turnDrawVisualEvents);
    }
    return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'DRAW_REVEAL', drawReveal: { card: res.drawnCard, msgs: res.effectMsgs, needsDecision: !!res.needsDecision, forcedKeep: !!res.forcedKeep, drawerIdx: 0, drawerName: P[0].name, sourcePile: res.sourcePile }, selectedCard: null, abilityData: {}, globalOnlySwapOwner, _playersBeforeThisDraw: _P_beforeDraw, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _drawSourcePile: res.sourcePile }, turnDrawVisualEvents);
  } else if (gs._isMP && !shouldUseAiController(next)) {
    // Multiplayer: next player is human — draw their card and enter DRAW_REVEAL
    // [ACTIVE_GOD] NYA 偷身份
    const nyaMp = turnStartEventIds.has(TURN_START_EVENT.NYA_BORROW)
      ? turnStartEvent_NyaBorrow(P, next, L, gs, visualEvents)
      : { shouldEnterPhase: false };
    if (nyaMp.shouldEnterPhase) {
      return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: [...L, nyaMp.logMsg], currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'NYA_BORROW', abilityData: {}, drawReveal: null, selectedCard: null, _isMP: gs._isMP, globalOnlySwapOwner, debugForceCard: null, debugForceCardTarget: null, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: copyPlayers(P) };
    }
    gs = enterTurnFlowStage(gs, TURN_FLOW_STAGE.DRAW);
    // 检查是否需要跳过摸牌
    if (consumeSkipNextDraw(P, next, L)) {
      const win = checkWin(P, true); if (win) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, gameOver: win };
      return buildSkippedDrawActionState({
        gs,
        zhuLight,
        players: P,
        deck: D,
        discard: Disc,
        log: L,
        currentTurn: next,
        newTurn,
        newTurnKey,
        turnStartLogs,
        statLogs,
        preTurnPlayers: _P_beforeTurn,
        globalOnlySwapOwner,
        extra: { _isMP: gs._isMP },
      });
    }
    const _P_beforeMpDraw = copyPlayers(P);
    const turnDrawVisualEvents = [];
    while (true) {
      const tsgSlime = getTsathogguaSlimesForDraw(P, next, L, visualEvents)[0];
      if (!tsgSlime) break;
      const slimePop = consumeTsathogguaSlimeBeforeDraw(P, next, tsgSlime, L, visualEvents);
      if (!slimePop) continue;
      if (!gs.geomagneticReversalActive) {
        const guard = getZhuTopGuard({ ...gs, players: P, deck: D, currentTurn: next, zhuLight }, D);
        if (guard) return buildPendingZhuRevealState({
          gs, guard, players: P, deck: D, discard: Disc, log: L, currentTurn: next,
          newTurn, newTurnKey, turnStartLogs, drawLogs, turnDrawVisualEvents, statLogs,
          preTurnPlayers: _P_beforeTurn, beforeDrawPlayers: _P_beforeMpDraw, globalOnlySwapOwner,
          abilityData: { fromTsathogguaSlime: true, continueTurnStartDraw: true, _tsgExtraDrawReady: true, _turnOwner: next },
        });
      }
      const playersBeforeSlimeDraw = copyPlayers(P);
      const rSlime = playerDrawCard(P, D, Disc, next, gs);
      P = rSlime.P; D = rSlime.D; Disc = rSlime.Disc;
      if (rSlime.statePatch) gs = { ...gs, ...rSlime.statePatch };
      if (rSlime.drawnCard) {
        if (rSlime.reshuffleLog) { L.push(rSlime.reshuffleLog); drawLogs.push(rSlime.reshuffleLog); }
        if (slimePop) drawLogs.push(...slimePop.msgs);
        const msg = `【无定形体】${P[next].name} 额外摸到 ${drawCardDecisionText(rSlime.drawnCard)}`;
        L.push(msg); drawLogs.push(msg);
        appendTurnDrawVisualEvents(turnDrawVisualEvents, {
          playerIdx: next,
          playerName: P[next].name,
          card: rSlime.drawnCard,
          sourcePile: rSlime.sourcePile,
          msgs: [msg],
          reshuffleLog: rSlime.reshuffleLog,
          fromTsathogguaSlime: true,
          slimePop,
          ...buildDrawKeepPresentation({
            playersBefore: playersBeforeSlimeDraw,
            playersAfter: P,
            playerIdx: next,
            card: rSlime.drawnCard,
          }),
        });
      }
      if (rSlime.needGodChoice) {
        const godChoiceAbilityData={godCard:rSlime.drawnCard,godEncounterCost:rSlime.godEncounterCost,fromTsathogguaSlime:true,continueTurnStartDraw:true,_turnOwner:next};
        const decisionState=deriveGodEncounterDecisionState(rSlime.statePatch,godChoiceAbilityData);
        return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: true, phase: decisionState.phase, abilityData: decisionState.abilityData, drawReveal: null, selectedCard: null, _isMP: gs._isMP, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw }, turnDrawVisualEvents);
      }
      if (rSlime.needsDecision) {
        return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'DRAW_REVEAL', drawReveal: { card: rSlime.drawnCard, msgs: rSlime.effectMsgs, needsDecision: true, forcedKeep: !!rSlime.forcedKeep, drawerIdx: next, drawerName: P[next].name, fromTsathogguaSlime: true, reshuffleLog: rSlime.reshuffleLog }, selectedCard: null, abilityData: { fromTsathogguaSlime: true, continueTurnStartDraw: true, _turnOwner: next }, _isMP: gs._isMP, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw }, turnDrawVisualEvents);
      }
      if (rSlime.effectMsgs?.length) L.push(...rSlime.effectMsgs);
    }
    // 循环内的黏液额外摸牌消息已逐条写入 L，最终统一 flush 时只补固定摸牌新增的部分，
    // 否则额外摸牌/黏液消失消息会在日志里重复出现两次。
    const drawLogsSyncedCount = drawLogs.length;
    if (!gs.geomagneticReversalActive) {
      const guard = getZhuTopGuard({ ...gs, players: P, deck: D, currentTurn: next, zhuLight }, D);
      if (guard) return buildPendingZhuRevealState({
        gs, guard, players: P, deck: D, discard: Disc, log: L, currentTurn: next,
        newTurn, newTurnKey, turnStartLogs, drawLogs, turnDrawVisualEvents, statLogs,
        preTurnPlayers: _P_beforeTurn, beforeDrawPlayers: _P_beforeMpDraw, globalOnlySwapOwner,
      });
    }
    const playersBeforeFixedDraw = copyPlayers(P);
    const res = playerDrawCard(P, D, Disc, next, gs);
    P = res.P; D = res.D; Disc = res.Disc;
    // 记录摸牌信息到日志（与单机AI摸牌保持一致：[key] 名称）
    if (res.reshuffleLog) drawLogs.push(res.reshuffleLog);
    if (res.drawnCard && !res.kept) {
      const msg = `${P[next].name} 摸到 ${drawCardDecisionText(res.drawnCard)}`;
      drawLogs.push(msg);
      appendTurnDrawVisualEvents(turnDrawVisualEvents, {
        playerIdx: next,
        playerName: P[next].name,
        card: res.drawnCard,
        sourcePile: res.sourcePile,
        msgs: [msg],
        reshuffleLog: res.reshuffleLog,
        ...buildDrawKeepPresentation({
          playersBefore: playersBeforeFixedDraw,
          playersAfter: P,
          playerIdx: next,
          card: res.drawnCard,
        }),
      });
    }
    if (res.effectMsgs?.length) {
      if (res.needGodChoice) {
        // 邪神牌：遭遇消息跟随翻牌动画；检定消息由 INSPECTION 视觉事件单独驱动。
        const split = splitGodEncounterLogs(res.effectMsgs);
        drawLogs.push(...split.encounterLogs);
        statLogs.push(...split.inspectionLogs);
      } else {
        const split = splitAnimBoundLogs(res.effectMsgs);
        drawLogs.push(...split.preStat);
        statLogs.push(...split.stat);
      }
    }
    if (drawLogs.length > drawLogsSyncedCount) L.push(...drawLogs.slice(drawLogsSyncedCount));
    if (statLogs.length) appendMissingLogOccurrences(L, statLogs);
    if (!res.drawnCard) { L.push('牌堆耗尽！'); return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, phase: 'ACTION', drawReveal: null, abilityData: {}, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw }, turnDrawVisualEvents); }
    if (res.needGodChoice) {
      const decisionState=deriveGodEncounterDecisionState(res.statePatch,{godCard:res.drawnCard,godEncounterCost:res.godEncounterCost});
      return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: true, drawReveal: null, selectedCard: null, _isMP: gs._isMP, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw, ...(res.statePatch || {}), phase:decisionState.phase,abilityData:decisionState.abilityData }, turnDrawVisualEvents);
    }
    const win = hasPendingDamageReaction(res.statePatch) ? null : checkWin(P, true); if (win) return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, gameOver: win, ...(res.statePatch || {}) }, turnDrawVisualEvents);
    // 强制触发牌：效果已执行，直接进入 ACTION；不向其他玩家广播 DRAW_REVEAL 界面
    if (res.kept) {
      return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'ACTION', drawReveal: { card: res.drawnCard, msgs: res.effectMsgs, needsDecision: false, forcedKeep: false, drawerIdx: next, drawerName: P[next].name, sourcePile: res.sourcePile }, selectedCard: null, abilityData: {}, _isMP: gs._isMP, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw, _drawSourcePile: res.sourcePile, ...(res.statePatch || {}) }, turnDrawVisualEvents);
    }
    return withMergedVisualEvents({ ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'DRAW_REVEAL', drawReveal: { card: res.drawnCard, msgs: res.effectMsgs, needsDecision: !!res.needsDecision, forcedKeep: !!res.forcedKeep, drawerIdx: next, drawerName: P[next].name, sourcePile: res.sourcePile }, selectedCard: null, abilityData: {}, _isMP: gs._isMP, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw, _drawSourcePile: res.sourcePile }, turnDrawVisualEvents);
  } else {
    // [ACTIVE_GOD] NYA 偷身份（AI 自动处理）
    if (turnStartEventIds.has(TURN_START_EVENT.NYA_BORROW)) {
      turnStartEvent_NyaBorrow(P, next, L, gs, visualEvents);
    }
    gs = enterTurnFlowStage(gs, TURN_FLOW_STAGE.DRAW);
    // 检查是否需要跳过摸牌
    if (consumeSkipNextDraw(P, next, L)) {
      const win = checkWin(P, gs._isMP); if (win) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, gameOver: win, debugForceCard: null, debugForceCardTarget: null };
      return buildSkippedDrawActionState({
        gs,
        zhuLight,
        players: P,
        deck: D,
        discard: Disc,
        log: L,
        currentTurn: next,
        newTurn,
        newTurnKey,
        turnStartLogs,
        statLogs,
        preTurnPlayers: _P_beforeTurn,
        globalOnlySwapOwner,
        extra: {
          phase: 'AI_TURN',
          debugForceCard: null,
          debugForceCardTarget: null,
          _isMP: gs._isMP,
        },
      });
    }
    applyDebugForceDrawToTop(gs, next, D);
    const _P_beforeDraw = copyPlayers(P);
    const turnDrawVisualEvents = [];
    while (true) {
      const tsgSlime = getTsathogguaSlimesForDraw(P, next, L, visualEvents)[0];
      if (!tsgSlime) break;
      const slimePop = consumeTsathogguaSlimeBeforeDraw(P, next, tsgSlime, L, visualEvents);
      if (!slimePop) continue;
      // ZHU is a per-reveal guard, not a once-per-phase precondition. Stop
      // before consuming the lit top card even when this reveal comes from a
      // slime extra draw.
      if (!gs.geomagneticReversalActive) {
        const slimeZhuGuard = getZhuTopGuard({ ...gs, players: P, deck: D, currentTurn: next, zhuLight }, D);
        if (slimeZhuGuard) {
          return {
            ...gs,
            zhuLight: slimeZhuGuard.zhuLight,
            players: P,
            deck: D,
            discard: Disc,
            log: L,
            currentTurn: next,
            phase: 'ZHU_HIDE_AI_DRAW',
            drawReveal: null,
            selectedCard: null,
            abilityData: {
              zhuGuard: slimeZhuGuard,
              drawerIdx: next,
              fromTsathogguaSlime: true,
              continueTurnStartDraw: true,
              _tsgExtraDrawReady: true,
              _turnOwner: next,
            },
            _playersBeforeThisDraw: _P_beforeDraw,
            turn: newTurn,
            _turnKey: newTurnKey,
            _turnStartLogs: turnStartLogs,
            _drawLogs: drawLogs,
            _visualEvents: mergeVisualEventLists(gs._visualEvents, turnDrawVisualEvents),
            _statLogs: statLogs,
            _preTurnPlayers: _P_beforeTurn,
            globalOnlySwapOwner,
          };
        }
      }
      const playersBeforeSlimeDraw = copyPlayers(P);
      const rSlime = aiDrawAndApply(next, P, D, Disc, gs);
      P = rSlime.P; D = rSlime.D; Disc = rSlime.Disc;
      if (rSlime.statePatch) gs = { ...gs, ...rSlime.statePatch };
      if (rSlime.drawnCard) {
        if (rSlime.reshuffleLog) { L.push(rSlime.reshuffleLog); drawLogs.push(rSlime.reshuffleLog); }
        if (slimePop) drawLogs.push(...slimePop.msgs);
        const msg = `【无定形体】${P[next].name} 额外摸到 ${drawCardDecisionText(rSlime.drawnCard)}`;
        L.push(msg);
        drawLogs.push(msg);
        // 黏液额外摸到邪神牌时是同步结算的（不进入 AI_GOD_CHOICE）。规则层把遭遇
        // 产出的属性/检定事件序号与弃牌结果记录在摸牌事件上，startNextTurn 据此
        // 把对应视觉事件归属到这次摸牌，动画队列才能按序补播 SAN/检定/弃牌。
        appendTurnDrawVisualEvents(turnDrawVisualEvents, {
          playerIdx: next,
          playerName: P[next].name,
          card: rSlime.drawnCard,
          sourcePile: rSlime.sourcePile,
          msgs: [msg],
          reshuffleLog: rSlime.reshuffleLog,
          fromTsathogguaSlime: true,
          slimePop,
          godEncounter: rSlime.godEncounter,
          ...buildDrawKeepPresentation({
            playersBefore: playersBeforeSlimeDraw,
            playersAfter: P,
            playerIdx: next,
            card: rSlime.drawnCard,
          }),
        });
      }
      if (rSlime.effectMsgs?.length) L.push(...rSlime.effectMsgs);
    }
    // 循环内的黏液额外摸牌消息已逐条写入 L，最终统一 flush 时只补固定摸牌新增的部分，
    // 否则额外摸牌/黏液消失消息会在日志里重复出现两次。
    const zhuGuard = getZhuTopGuard({ ...gs, players: P, deck: D, currentTurn: next, zhuLight }, D);
    if (zhuGuard) {
      return {
        ...gs,
        zhuLight: zhuGuard.zhuLight,
        players: P,
        deck: D,
        discard: Disc,
        log: L,
        currentTurn: next,
        phase: 'ZHU_HIDE_AI_DRAW',
        drawReveal: null,
        selectedCard: null,
        abilityData: { zhuGuard, drawerIdx: next },
        skillUsed: false,
        restUsed: false,
        huntAbandoned: [],
        godFromHandUsed: false,
        godTriggeredThisTurn: false,
        _playersBeforeThisDraw: _P_beforeDraw,
        turn: newTurn,
        _turnKey: (gs._turnKey || 0) + 1,
        _turnStartLogs: turnStartLogs,
        _drawLogs: drawLogs,
        _visualEvents: mergeVisualEventLists(gs._visualEvents, turnDrawVisualEvents),
        _statLogs: statLogs,
        _preTurnPlayers: _P_beforeTurn,
        globalOnlySwapOwner,
      };
    }
    const playersBeforeFixedDraw = copyPlayers(P);
    const res = aiDrawAndApply(next, P, D, Disc, { ...gs, deferAiGodChoice: true });
    gs.debugForceCardKeepPending = null;
    gs.debugForceCardKeepTarget = null;
    P = res.P; D = res.D; Disc = res.Disc;
    if (res.drawnCard && isDebugMode) {
      const debugDrawLog = `[调试] ${P[next].name}（${P[next]._nyaBorrow || P[next].role}）起手摸到 ${drawCardDecisionText(res.drawnCard)}`;
      turnStartLogs.push(debugDrawLog);
      L.push(debugDrawLog);
    }
    if (res.reshuffleLog) drawLogs.push(res.reshuffleLog);
    if (res.effectMsgs?.length) {
      const split = splitAnimBoundLogs(res.effectMsgs);
      drawLogs.push(...split.preStat);
      statLogs.push(...split.stat);
    }
    // drawLogs/statLogs are animation routing buckets, not the authoritative
    // adventure-log order. Appending the buckets separately moves inspection
    // text ahead of AOE lines (e.g. 夜风呼啸), because the AOE line is
    // classified as a stat log while the inspection result is not.
    if (res.reshuffleLog) L.push(res.reshuffleLog);
    if (res.effectMsgs?.length) L.push(...res.effectMsgs);
    if (res.drawnCard) {
      const eventMsgs = (res.effectMsgs || []).filter(msg => (drawLogs || []).includes(msg));
      appendTurnDrawVisualEvents(turnDrawVisualEvents, {
        playerIdx: next,
        playerName: P[next].name,
        card: res.drawnCard,
        sourcePile: res.sourcePile,
        msgs: eventMsgs.length ? eventMsgs : drawLogs.slice(-1),
        reshuffleLog: res.reshuffleLog,
        ...buildDrawKeepPresentation({
          playersBefore: playersBeforeFixedDraw,
          playersAfter: P,
          playerIdx: next,
          card: res.drawnCard,
        }),
      });
    }
    const pendingAiGodChoice = res.pendingAiGodChoice || res.statePatch?._pendingAiGodChoice || null;
    const { phase: resolvedNextPhase, abilityData: resolvedNextAbilityData } = deriveEffectDecisionState(res.statePatch, {
      baseAbilityData: gs.abilityData,
      fallbackPhase: 'AI_TURN',
    });
    const nextPhase = pendingAiGodChoice ? 'AI_GOD_CHOICE' : resolvedNextPhase;
    const nextAbilityData = pendingAiGodChoice
      ? { ...(gs.abilityData || {}), ...pendingAiGodChoice }
      : resolvedNextAbilityData;
    const aiTurnAnimMeta = {
      currentTurn: next,
      turn: newTurn,
      phase: nextPhase,
      drawReveal: null,
      selectedCard: null,
      abilityData: nextAbilityData,
      huntAbandoned: [],
      _aiDrawnCard: res.drawnCard ?? null,
      _drawnCard: res.drawnCard ?? null,
      _drawSourcePile: res.sourcePile,
      _discardedDrawnCard: !!res.discardedDrawnCard,
      _playersBeforeThisDraw: _P_beforeDraw,
      _turnKey: (gs._turnKey || 0) + 1,
      _turnStartLogs: turnStartLogs,
      _drawLogs: drawLogs,
      _visualEvents: mergeVisualEventLists(res.statePatch?._visualEvents, turnDrawVisualEvents),
      _statLogs: statLogs,
      _preTurnPlayers: _P_beforeTurn,
    };
    const win = hasPendingDamageReaction(res.statePatch) ? null : checkWin(res.P, gs._isMP); if (win) return withMergedVisualEvents({ ...gs, zhuLight, players: res.P, deck: D, discard: Disc, log: L, gameOver: win, ...aiTurnAnimMeta, ...(res.statePatch || {}), globalOnlySwapOwner: (res.statePatch?.globalOnlySwapOwner ?? globalOnlySwapOwner) }, turnDrawVisualEvents);
    if (!res.P[next].isDead && res.P[next].role === ROLE_TREASURE && isWinHand(res.P[next].hand)) {
      res.P[next].roleRevealed = true;
      return withMergedVisualEvents({
        ...gs,
        players: res.P,
        deck: D,
        discard: Disc,
        log: [...L, `${res.P[next].name} 集齐全部编号并获胜！`],
        gameOver: { winner: ROLE_TREASURE, reason: `${res.P[next].name} 集齐了全部编号并获胜！`, winnerIdx: next },
        ...aiTurnAnimMeta,
        ...(res.statePatch || {}),
        globalOnlySwapOwner: (res.statePatch?.globalOnlySwapOwner ?? globalOnlySwapOwner)
      }, turnDrawVisualEvents);
    }
    return withMergedVisualEvents({ ...gs, zhuLight, players: res.P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, skillUsed: false, restUsed: false, godFromHandUsed: false, godTriggeredThisTurn: false, drawReveal: null, selectedCard: null, huntAbandoned: [], _aiDrawnCard: res.drawnCard ?? null, _drawnCard: res.drawnCard ?? null, _discardedDrawnCard: !!res.discardedDrawnCard, _playersBeforeThisDraw: _P_beforeDraw, _turnKey: (gs._turnKey || 0) + 1, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, ...(res.statePatch || {}), phase: nextPhase, abilityData: nextAbilityData, globalOnlySwapOwner: (res.statePatch?.globalOnlySwapOwner ?? globalOnlySwapOwner) }, turnDrawVisualEvents);
  }
}

function maxKnownStatEventSeq(state) {
  const explicit = Number.isFinite(state?._statEventSeq) ? state._statEventSeq : 0;
  const fromStats = (Array.isArray(state?._statEvents) ? state._statEvents : [])
    .reduce((max, event) => Number.isFinite(event?.seq) ? Math.max(max, event.seq) : max, 0);
  const fromVisualEvents = (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .flatMap(event => Array.isArray(event?.statEvents) ? event.statEvents : [])
    .reduce((max, event) => Number.isFinite(event?.seq) ? Math.max(max, event.seq) : max, 0);
  return Math.max(explicit, fromStats, fromVisualEvents);
}

function maxKnownInspectionEventSeq(state) {
  const explicit = Number.isFinite(state?._inspectionSeq) ? state._inspectionSeq : 0;
  const fromInspections = (Array.isArray(state?._inspectionEvents) ? state._inspectionEvents : [])
    .reduce((max, event) => Number.isFinite(event?.seq) ? Math.max(max, event.seq) : max, 0);
  const fromVisualEvents = (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .filter(event => event?.type === VISUAL_EVENT.INSPECTION)
    .reduce((max, event) => Number.isFinite(event?.legacySeq) ? Math.max(max, event.legacySeq) : max, 0);
  return Math.max(explicit, fromInspections, fromVisualEvents);
}

// Rule and presentation metadata are produced at the same boundary. Every
// caller (local player, AI, multiplayer takeover, and setup) receives the same
// one-shot visual events instead of reconstructing them later in React.
export function startNextTurn(gs, opts = {}) {
  const previousStatSeq = maxKnownStatEventSeq(gs);
  const previousInspectionSeq = maxKnownInspectionEventSeq(gs);
  const cleanInput = Array.isArray(gs?._visualEvents) && gs._visualEvents.length
    ? { ...gs, _visualEvents: [] }
    : gs;
  // Cleanup, expiry, next-seat selection and turn-key advancement are rules
  // executed at the turn boundary, before the next TURN_START stage begins.
  const boundaryInput = enterTurnBoundary(cleanInput);
  const nextState = normalizeTurnOpeningFlowState(resolveNextTurnState(boundaryInput, opts));
  const engineEvents = Array.isArray(nextState?._visualEvents) ? nextState._visualEvents : [];
  const freshStatVisualEvents = buildFreshStatVisualEvents(nextState, previousStatSeq);
  const freshStatEvents = freshStatVisualEvents.flatMap(event => event?.statEvents || []);
  // resolveNextTurnState only produces events for the newly entered turn.
  // Tag its remaining card/god/effect events as draw-stage events so an AI
  // action queue can exclude the entire future turn transaction explicitly.
  const stagedEngineEvents = engineEvents.map(event => {
    if (event?.turnStartStage) return event;
    const isPreDrawEvent = [VISUAL_EVENT.GOD_POWER_BLOCKED, VISUAL_EVENT.TSG_SLIME_GRANT]
      .includes(event?.type);
    const ownedStatEvents = event?.type === VISUAL_EVENT.SPHINX_RESULT
      ? freshStatEvents.filter(statEvent => (
          statEvent?.target === event.actorIdx &&
          (!statEvent?.logHint || (event.msgs || []).includes(statEvent.logHint))
        ))
      : [];
    return {
      ...event,
      ...(event?.type === VISUAL_EVENT.SPHINX_RESULT ? { statEvents: ownedStatEvents } : {}),
      turnStartStage: isPreDrawEvent ? 'turnStart' : 'draw',
      turnStartStageOrder: isPreDrawEvent ? 1 : 2,
    };
  });
  // 同步结算路径（如 AI 黏液额外摸到邪神牌）里 handleInspection 已经把一个
  // 检定视觉事件写进了 _visualEvents，这里再按 _inspectionEvents 重建会造成重复翻牌。
  // 以 legacySeq 去重，保证每次 SAN 检定只产生一个检定动画。
  const engineInspectionSeqs = new Set(
    engineEvents
      .filter(event => event?.type === VISUAL_EVENT.INSPECTION)
      .map(event => event?.legacySeq)
      .filter(seq => seq != null)
  );
  const stagedInspectionEvents = (Array.isArray(nextState?._inspectionEvents) ? nextState._inspectionEvents : [])
    .filter(event => (
      Number.isFinite(event?.seq) &&
      event.seq > previousInspectionSeq &&
      !engineInspectionSeqs.has(event.seq)
    ))
    .map(createInspectionVisualEvent)
    .filter(Boolean)
    .map(event => ({
      ...event,
      turnStartStage: 'draw',
      turnStartStageOrder: 3,
    }));
  let visualEvents = [
    ...buildTurnStartDrawVisualEvents(nextState),
    ...freshStatVisualEvents,
    ...stagedEngineEvents,
    ...stagedInspectionEvents,
  ];
  // 黏液额外摸到邪神牌的同步遭遇：把属于该次遭遇的视觉事件显式归属到对应的
  // 摸牌事件（godEncounter.visualEventIds）。归属信息来自规则层结算时记录的
  // 序号，呈现层据此把遭遇块（SAN 扣减 → 检定 → 弃牌）插到该邪神牌翻牌之后、
  // 下一张摸牌之前，不再按步骤类型/队列位置启发式猜测。
  const godEncounterDraws = visualEvents
    .filter(event => event?.type === VISUAL_EVENT.DRAW_CARD && event?.id && event?.godEncounter);
  if (godEncounterDraws.length) {
    const ownedIdsByDraw = new Map();
    godEncounterDraws.forEach(drawEvent => {
      const encounter = drawEvent.godEncounter;
      const ownedIds = [];
      const ownedStatSeqs = new Set((encounter.statSeqs || []).filter(seq => seq != null));
      if (ownedStatSeqs.size) {
        // 遭遇的 SAN 扣减可能与本次摸牌阶段的其它属性事件打包在同一个
        // STAT_EVENTS 事件里；按规则层记录的序号拆出独立事件，才能整体随遭遇块移动。
        const splitEvents = [];
        visualEvents.forEach(visualEvent => {
          if (visualEvent?.type !== VISUAL_EVENT.STAT_EVENTS || visualEvent?.turnStartStage !== 'draw'
            || !Array.isArray(visualEvent.statEvents)) {
            splitEvents.push(visualEvent);
            return;
          }
          const owned = visualEvent.statEvents.filter(statEvent => ownedStatSeqs.has(statEvent?.seq));
          if (!owned.length) {
            splitEvents.push(visualEvent);
            return;
          }
          const rest = visualEvent.statEvents.filter(statEvent => !ownedStatSeqs.has(statEvent?.seq));
          const hints = new Set(owned.map(statEvent => statEvent?.logHint).filter(Boolean));
          const ownedMsgs = (visualEvent.msgs || []).filter(msg => hints.has(msg));
          const restMsgs = (visualEvent.msgs || []).filter(msg => !ownedMsgs.includes(msg));
          if (rest.length) {
            splitEvents.push(createStatEventsEvent({ statEvents: rest, msgs: restMsgs, turnStartStage: 'draw' }));
          }
          const ownedEvent = createStatEventsEvent({ statEvents: owned, msgs: ownedMsgs, turnStartStage: 'draw' });
          if (ownedEvent) {
            splitEvents.push(ownedEvent);
            ownedIds.push(ownedEvent.id);
          }
        });
        visualEvents = splitEvents;
      }
      const ownedInspectionSeqs = new Set((encounter.inspectionSeqs || []).filter(seq => seq != null));
      visualEvents.forEach(visualEvent => {
        if (visualEvent?.type === VISUAL_EVENT.INSPECTION
          && ownedInspectionSeqs.has(visualEvent?.legacySeq) && visualEvent?.id) {
          ownedIds.push(visualEvent.id);
        }
      });
      if (encounter.discardedGod) {
        const discardEvent = createGodGiftDiscardEvent({
          card: drawEvent.card,
          drawerIdx: drawEvent.playerIdx ?? nextState.currentTurn ?? 0,
          drawerName: drawEvent.playerName,
        });
        if (discardEvent) {
          visualEvents = [...visualEvents, discardEvent];
          ownedIds.push(discardEvent.id);
        }
      }
      ownedIdsByDraw.set(drawEvent.id, ownedIds);
    });
    visualEvents = visualEvents.map(event => (
      ownedIdsByDraw.has(event?.id)
        ? { ...event, godEncounter: { ...event.godEncounter, visualEventIds: ownedIdsByDraw.get(event.id) } }
        : event
    ));
  }
  return visualEvents.length ? { ...nextState, _visualEvents: visualEvents } : nextState;
}
