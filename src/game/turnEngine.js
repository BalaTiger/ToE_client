import {
  shuffle,
  clamp,
  copyPlayers,
  isNegativeZoneCard,
  cardLogText,
  isWinHand,
  makeInspectionMeta,
  isBlackGoatYoung,
  isTsathogguaSlime,
  isGeomagneticRestore,
  killPlayerState,
  tryVritraImmortal,
  buildEtherealizeLoss,
  buildEtherealizeRedirectDecision,
  buildTsathogguaSlimeBalanceDecision,
} from './coreUtils';
import { aiShouldKeepZoneCard } from './ai';
import { clearPlayerGodZone } from './aiTurn';
import { splitAnimBoundLogs } from './animLogs';
import { localDisplayName } from './rotateState';
import { GOD_DEFS, createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../constants/card';
import { ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST, isRevealedCultist } from './coreUtils';
import { applyFx, applyInspectionForSanLoss } from './effectEngine';
import { buildZhuLight, getZhuTopGuard } from './zhuPower';
import { buildStatEvents } from './statEvents';
import { deriveEffectDecisionState } from './effectStatePatch';
import { buildApophisNightLog, getApophisNightForLevel } from './apophisNight';
import { buildGodPowerBlockedLog, canGodPowerAffect, hasGodPowerImmunity } from './godPowerImmunity';
import { appendProliferatingZDraws, clearExpiredProliferatingZ } from './proliferatingZ';
import { drawCardDecisionText, markBlindZoneCard, shouldBlindZoneDecision } from './blindZoneDecision';
import { clearExpiredTurnScopedEffects } from './turnScopedEffects';
import { createGodPowerBlockedEvent } from './visualEvents';

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

/** AI 自动选择 SHU 黑暗子嗣的目标。默认优先给自己，若自己是寻宝者则随机给其他存活角色。 */
function _chooseAiShuTarget(ci, P) {
  if (P[ci].role !== ROLE_TREASURE && canGodPowerAffect(P[ci])) return ci;
  const others = P.map((p, i) => i).filter(i => i !== ci && !P[i].isDead && canGodPowerAffect(P[i]));
  return others.length > 0 ? others[Math.floor(Math.random() * others.length)] : ci;
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

function chooseAiGodEncounterAction(ci, godCard, players, forcedConvert = false) {
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

function appendGodPowerBlockedFeedback({ player, playerIdx, log, events, msgs }) {
  if (!player || !hasGodPowerImmunity(player)) return null;
  const msg = buildGodPowerBlockedLog(player);
  if (Array.isArray(log)) log.push(msg);
  if (Array.isArray(msgs)) msgs.push(msg);
  const event = createGodPowerBlockedEvent({
    playerIdx,
    playerName: player.name,
    msgs: [msg],
  });
  if (event && Array.isArray(events)) events.push(event);
  return event;
}

export function applySanLossToPlayerWithInspection(targetIndex, amount, startIndex, P, D, Disc, L, inspectionMeta, reason = 'SAN损失', options = {}) {
  const beforePlayers = copyPlayers(P);
  const etherealizeLoss = options.skipEtherealize ? null : buildEtherealizeLoss({
      players: P,
      targetIdx: targetIndex,
      currentTurn: startIndex,
      lostSan: amount,
      source: reason,
    });
  if (etherealizeLoss) {
    return {
      P,
      D,
      Disc,
      L,
      inspectionMeta: {
        ...inspectionMeta,
        abilityData: buildEtherealizeRedirectDecision([etherealizeLoss], { _turnOwner: startIndex }),
      },
    };
  }
  P[targetIndex].san = clamp(P[targetIndex].san - amount);
  const nextInspectionMeta = appendStatEventsToInspectionMeta(
    inspectionMeta,
    beforePlayers,
    P,
    L.slice(-1),
    reason,
  );
  const processed = applyInspectionForSanLoss(targetIndex, P[targetIndex].san, startIndex, P, D, Disc, L, nextInspectionMeta);
  const slimeDecision = buildTsathogguaSlimeBalanceDecision(beforePlayers, processed.P, { _turnOwner: startIndex });
  return {
    P: processed.P,
    D: processed.D,
    Disc: processed.Disc,
    L: processed.log,
    inspectionMeta: slimeDecision
      ? { ...processed.inspectionMeta, abilityData: slimeDecision }
      : processed.inspectionMeta,
  };
}

export function abandonGodFollower(targetIndex, startIndex, P, D, Disc, L, inspectionMeta, logMsg = `被邪神抛弃，SAN-1`) {
  L = [...L, `${P[targetIndex].name} ${logMsg}`];
  const processed = applySanLossToPlayerWithInspection(targetIndex, 1, startIndex, P, D, Disc, L, inspectionMeta);
  P = processed.P; D = processed.D; Disc = processed.Disc; L = processed.L; inspectionMeta = processed.inspectionMeta;
  clearPlayerGodZone(P[targetIndex], Disc);
  return { P, D, Disc, L, inspectionMeta };
}

export function convertGodFollower(targetIndex, startIndex, P, D, Disc, L, inspectionMeta, logMsg, nextGodCard = null) {
  const convertLog = logMsg || `${P[targetIndex].name} 改信新神，SAN-1`;
  L = [...L, convertLog];
  if (nextGodCard?.godKey) {
    clearPlayerGodZone(P[targetIndex], Disc);
    P[targetIndex].godName = nextGodCard.godKey;
    P[targetIndex].godLevel = 1;
    P[targetIndex].godZone = [{ ...nextGodCard }];
  }
  const processed = applySanLossToPlayerWithInspection(targetIndex, 1, startIndex, P, D, Disc, L, inspectionMeta);
  P = processed.P; D = processed.D; Disc = processed.Disc; L = processed.L; inspectionMeta = processed.inspectionMeta;
  if (!nextGodCard?.godKey) {
    clearPlayerGodZone(P[targetIndex], Disc);
  }
  return { P, D, Disc, L, inspectionMeta };
}

export function resolveGodEncounterForAI(ci, godCard, P, D, Disc, gs, forcedConvert) {
  const msgs = []; const godKey = godCard.godKey;
  let statePatch = {};
  const visualEvents = [];
  let inspectionMeta = makeInspectionMeta(gs);
  P = P.map(p => ({ ...p, godZone: [...(p.godZone || [])] })); // shallow copy godZone arrays
  const applyImmediateGodPower = () => {
    if (!canGodPowerAffect(P[ci])) {
      if (['APO', 'ZHU', 'SHU'].includes(godKey)) {
        appendGodPowerBlockedFeedback({ player: P[ci], playerIdx: ci, events: visualEvents, msgs });
      }
      return;
    }
    if (godKey === 'APO') {
      statePatch.apophisNight = getApophisNightForLevel(P[ci].godLevel);
      msgs.push(buildApophisNightLog());
    }
    if (godKey === 'ZHU') {
      statePatch.zhuLight = buildZhuLight(P, D, ci, gs?.zhuLight);
    }
    if (godKey === 'SHU') {
      const count = GOD_DEFS.SHU.levels[(P[ci].godLevel || 1) - 1]?.offspringCount || 0;
      const shuTargetIdx = _chooseAiShuTarget(ci, P);
      if (!canGodPowerAffect(P[shuTargetIdx])) return;
      const goatCards = Array.from({ length: count }, () => createBlackGoatYoungCard());
      P[shuTargetIdx].hand.push(...goatCards);
      if (goatCards.length) proliferatingZGainEvents.push({ ownerIdx: shuTargetIdx, cards: goatCards });
      if (count) msgs.push(`【黑暗子嗣】${P[shuTargetIdx].name} 获得${count}张黑山羊幼仔`);
    }
  };
  if (forcedConvert && P[ci].godName && P[ci].godName !== godKey) {
    msgs.push(`${P[ci].name} 被迫改信新神，SAN-1`);
    const inspectionBaseLog = [...(Array.isArray(gs?.log) ? gs.log : []), ...msgs];
    const processed = applySanLossToPlayerWithInspection(ci, 1, gs?.currentTurn ?? ci, P, D, Disc, inspectionBaseLog, inspectionMeta);
    P = processed.P; D = processed.D; Disc = processed.Disc; inspectionMeta = processed.inspectionMeta;
    const extraMsgs = (processed.L || []).slice(inspectionBaseLog.length); if (extraMsgs.length) msgs.push(...extraMsgs);
    clearPlayerGodZone(P[ci], Disc);
  }
  const proliferatingZGainEvents = [];
  const action = chooseAiGodEncounterAction(ci, godCard, P, forcedConvert);
  if (action === 'upgrade') {
    P[ci].godLevel++; P[ci].godZone.push({ ...godCard });
    proliferatingZGainEvents.push({ ownerIdx: ci, cards: [godCard] });
    msgs.push(`${P[ci].name} 邪神之力升至Lv.${P[ci].godLevel}（${godCard.power}）`);
    applyImmediateGodPower();
    P.forEach((p, i) => {
      if (i !== ci && p.godName === godKey) {
        const abandonBaseLog = [...(Array.isArray(gs?.log) ? gs.log : []), ...msgs];
        const abandoned = abandonGodFollower(i, gs?.currentTurn ?? ci, P, D, Disc, abandonBaseLog, inspectionMeta);
        P = abandoned.P; D = abandoned.D; Disc = abandoned.Disc; inspectionMeta = abandoned.inspectionMeta;
        const extraMsgs = (abandoned.L || []).slice(abandonBaseLog.length); if (extraMsgs.length) msgs.push(...extraMsgs);
      }
    });
  } else if (action === 'convert') {
    const convertBaseLog = [...(Array.isArray(gs?.log) ? gs.log : []), ...msgs];
    const converted = convertGodFollower(ci, gs?.currentTurn ?? ci, P, D, Disc, convertBaseLog, inspectionMeta, `${P[ci].name} 改信新神，SAN-1`, godCard);
    P = converted.P; D = converted.D; Disc = converted.Disc; inspectionMeta = converted.inspectionMeta;
    const extraMsgs = (converted.L || []).slice(convertBaseLog.length); if (extraMsgs.length) msgs.push(...extraMsgs);
    P[ci].godName = godKey; P[ci].godLevel = 1; P[ci].godZone = [{ ...godCard }];
    proliferatingZGainEvents.push({ ownerIdx: ci, cards: [godCard] });
    msgs.push(`${P[ci].name} 信仰了 ${godCard.name}，获得${godCard.power}(Lv.1)`);
    applyImmediateGodPower();
    P.forEach((p, i) => {
      if (i !== ci && p.godName === godKey) {
        const abandonBaseLog = [...(Array.isArray(gs?.log) ? gs.log : []), ...msgs];
        const abandoned = abandonGodFollower(i, gs?.currentTurn ?? ci, P, D, Disc, abandonBaseLog, inspectionMeta);
        P = abandoned.P; D = abandoned.D; Disc = abandoned.Disc; inspectionMeta = abandoned.inspectionMeta;
        const extraMsgs = (abandoned.L || []).slice(abandonBaseLog.length); if (extraMsgs.length) msgs.push(...extraMsgs);
      }
    });
  } else if (action === 'worship') {
    P[ci].godName = godKey; P[ci].godLevel = 1; P[ci].godZone = [{ ...godCard }];
    proliferatingZGainEvents.push({ ownerIdx: ci, cards: [godCard] });
    msgs.push(`${P[ci].name} 信仰了 ${godCard.name}，获得${godCard.power}(Lv.1)`);
    applyImmediateGodPower();
    P.forEach((p, i) => {
      if (i !== ci && p.godName === godKey) {
        const abandonBaseLog = [...(Array.isArray(gs?.log) ? gs.log : []), ...msgs];
        const abandoned = abandonGodFollower(i, gs?.currentTurn ?? ci, P, D, Disc, abandonBaseLog, inspectionMeta);
        P = abandoned.P; D = abandoned.D; Disc = abandoned.Disc; inspectionMeta = abandoned.inspectionMeta;
        const extraMsgs = (abandoned.L || []).slice(abandonBaseLog.length); if (extraMsgs.length) msgs.push(...extraMsgs);
      }
    });
  } else if (action === 'hand') {
    P[ci].roleRevealed = true;
    P[ci].revealHand = true;
    P[ci].hand.push({ ...godCard }); msgs.push(`${P[ci].name}（邪祀者）将邪神牌收入手牌`);
    proliferatingZGainEvents.push({ ownerIdx: ci, cards: [godCard] });
  } else {
    Disc.push({ ...godCard }); msgs.push(`${P[ci].name} 放弃了邪神的馈赠`);
  }
  let zBase = { ...gs, ...statePatch };
  proliferatingZGainEvents.forEach(event => {
    const patch = appendProliferatingZDraws(zBase, P, event.ownerIdx, event.cards);
    if (patch.proliferatingZQueue) zBase = { ...zBase, proliferatingZQueue: patch.proliferatingZQueue };
  });
  statePatch = {
    ...statePatch,
    ...(zBase.proliferatingZQueue ? { proliferatingZQueue: zBase.proliferatingZQueue } : {}),
    ...(visualEvents.length ? { _visualEvents: visualEvents } : {}),
  };
  return { P, D, Disc, msgs, inspectionMeta, statePatch };
}

export function aiHandleGodCard(ci, godCard, P, D, Disc, L, gs, skipEffectMsg = false) {
  const sanCost = P[ci].godEncounters || 0;
  // 已揭晓的邪祀者遭遇邪神时免疫SAN损耗；未揭晓时照常结算
  if (!skipEffectMsg) {
    const revealedCultist = isRevealedCultist(P[ci]);
    let effectMsg = '';
    if (revealedCultist) {
      effectMsg = `${P[ci].name}（邪祀者）遭遇邪神 ${godCard.name}！（第${P[ci].godEncounters}次）免疫SAN损耗`;
    } else {
      effectMsg = `${P[ci].name} 遭遇邪神 ${godCard.name}！（第${P[ci].godEncounters}次）失去${sanCost}SAN`;
    }
    L.push(effectMsg);
  }
  const gres = resolveGodEncounterForAI(ci, godCard, P, D, Disc, gs, false);
  P = gres.P; D = gres.D; Disc = gres.Disc;
  L.push(...gres.msgs);
  return { P, D, Disc, L, inspectionMeta: gres.inspectionMeta, statePatch: gres.statePatch };
}

export function handleCardDraw(ci, ps, deck, disc, isAI = false, gs = {}) {
  let P = copyPlayers(ps), D = [...deck], Disc = [...disc];
  if (!D.length && Disc.length) { D = shuffle(Disc); Disc = []; }
  if (!D.length) return { P, D, Disc, drawnCard: null, effectMsgs: [], needsDecision: false };

  const whoName = ci === 0 ? '你' : P[ci].name;

  // 地磁反转：从弃牌堆暗抽
  if (gs?.geomagneticReversalActive && Disc.length > 0) {
    const shuffledDisc = shuffle([...Disc]);
    Disc = [];
    const drawnFromDisc = shuffledDisc.shift();

    if (isGeomagneticRestore(drawnFromDisc)) {
      // 反转复原：消除地磁反转效果，不进入手牌
      return {
        P, D, Disc: shuffledDisc,
        drawnCard: null,
        effectMsgs: [`【反转复原】${whoName} 抽到了反转复原，地磁反转效果被消除！`],
        needsDecision: false,
        statePatch: { geomagneticReversalActive: false },
      };
    }

    // 暗抽：直接进入手牌，效果不触发
    P[ci].hand.push(drawnFromDisc);
    return {
      P, D, Disc: shuffledDisc,
      drawnCard: drawnFromDisc,
      effectMsgs: [`【地磁反转】${whoName} 从弃牌堆暗抽了一张牌`],
      needsDecision: false,
      kept: true,
      sourcePile: 'discard',
      statePatch: { geomagneticReversalActive: true },
    };
  }

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

  const drawnCard = D.shift();

  // God card handling
  if (drawnCard.isGod) {
    P[ci].godEncounters = (P[ci].godEncounters || 0) + 1;
    const cost = P[ci].godEncounters;
    const revealedCultist = isRevealedCultist(P[ci]);

    if (isAI) {
      let L2 = [];
      let inspectionMeta = makeInspectionMeta(gs);
      let effectMsg = revealedCultist
        ? `${whoName}（邪祀者）遭遇邪神 ${drawnCard.name}！（第${P[ci].godEncounters}次）免疫SAN损耗`
        : `${whoName} 遭遇邪神 ${drawnCard.name}！（第${P[ci].godEncounters}次）失去${cost}SAN`;
      L2.push(effectMsg);
      // AI处理邪神牌时，仍然立即扣减SAN值；教程可在检定前暂停。
      if (!revealedCultist) {
        const beforePlayers = copyPlayers(P);
        P[ci].san = clamp(P[ci].san - cost);
        inspectionMeta = appendStatEventsToInspectionMeta(
          inspectionMeta,
          beforePlayers,
          P,
          [effectMsg],
          '邪神遭遇',
        );
        if (gs?.deferAiGodChoice) {
          return {
            P,
            D,
            Disc,
            drawnCard,
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
      if (gs?.deferAiGodChoice) {
        return {
          P,
          D,
          Disc,
          drawnCard,
          effectMsgs: L2,
          kept: true,
          pendingAiGodChoice: { playerIndex: ci, godCard: drawnCard },
          statePatch: {
            ...inspectionMeta,
            _pendingAiGodChoice: { playerIndex: ci, godCard: drawnCard },
          },
        };
      }
      const gr = aiHandleGodCard(ci, drawnCard, P, D, Disc, L2, gs, true);
      P = gr.P; D = gr.D; Disc = gr.Disc;
      return { P, D, Disc, drawnCard, effectMsgs: L2, kept: true, statePatch: { ...inspectionMeta, ...(gr.inspectionMeta || {}), ...(gr.statePatch || {}) } };
    } else {
      let effectMsg = revealedCultist
        ? `${whoName}（邪祀者）遭遇邪神 ${drawnCard.name}！（第${P[ci].godEncounters}次）免疫SAN损耗`
        : `${whoName} 遭遇邪神 ${drawnCard.name}！（第${P[ci].godEncounters}次）失去${cost}SAN`;

      let inspectionMeta = makeInspectionMeta(gs);
      let effectMsgs = [effectMsg];

      if (!revealedCultist && cost > 0) {
        const baseLog = gs?.log ? [...gs.log, effectMsg] : [effectMsg];
        const processed = applySanLossToPlayerWithInspection(ci, cost, gs?.currentTurn ?? ci, P, D, Disc, baseLog, inspectionMeta, '邪神遭遇');
        P = processed.P; D = processed.D; Disc = processed.Disc;
        inspectionMeta = processed.inspectionMeta;
        effectMsgs.push(...processed.L.slice(baseLog.length));
      }

      return {
        P, D, Disc, drawnCard,
        effectMsgs,
        needGodChoice: true, needsDecision: false,
        godEncounterCost: 0,
        statePatch: { ...inspectionMeta }
      };
    }
  }

  // Forced trigger cards
  if (drawnCard.forced) {
    const res = applyFx(drawnCard, ci, null, P, D, Disc, gs, false, [], isAI);
    P = res.P; D = res.D; Disc = res.Disc; P[ci].hand.push(drawnCard);
    return { P, D, Disc, drawnCard, effectMsgs: [`${whoName} 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}（强制触发）`, ...res.msgs], statePatch: res.statePatch, kept: true, needsDecision: false };
  }

  // 穴居人战争隐藏规则1：如果摸到"穴居人战争"之前没有牌，强制展示"穴居人战争"
  if (drawnCard.type === 'caveDuel' && P[ci].hand.length === 0) {
    // 强制展示穴居人战争
    P[ci].hand.push(drawnCard);
    const logMsg = `${whoName} 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，之前没有牌，强制展示！`;
    return { P, D, Disc, drawnCard, effectMsgs: [logMsg], kept: true, needsDecision: false };
  }

  // AI auto-decision
  if (isAI) {
    const keepOverride = consumeDebugForceKeepOverride(gs, ci);
    const blindZoneIdentity = shouldBlindZoneDecision(P, ci, drawnCard);
    if (blindZoneIdentity) P[ci].blindNextZoneDecision = false;
    const keep = keepOverride === 'keep' ? true : keepOverride === 'discard' ? false : blindZoneIdentity ? Math.random() < 0.5 : aiShouldKeepZoneCard(drawnCard, ci, P, false);
    if (!keep) {
      Disc.push(drawnCard);
      return { P, D, Disc, drawnCard, effectMsgs: [`${P[ci].name} 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，评估后选择弃置`], needsDecision: false, _aiDrawnCard: drawnCard, discardedDrawnCard: true };
    }

    // AI Treasure Hunter dodge logic
    const effectiveRole = P[ci]._nyaBorrow || P[ci].role;
    const isTreasureHunter = effectiveRole === ROLE_TREASURE;
    const isNegativeEffect = isNegativeZoneCard(drawnCard);

    if (isTreasureHunter && isNegativeEffect) {
      P[ci].roleRevealed = true;
      const d1 = 1 + (Math.random() * 6 | 0);
      const dodgeSuccess = d1 >= 4;
      if (dodgeSuccess) {
        const res = applyFx(drawnCard, ci, null, P, D, Disc, gs, true, [], isAI);
        P = res.P; D = res.D; Disc = res.Disc; P[ci].hand.push(drawnCard);
        return { P, D, Disc, drawnCard, effectMsgs: [`${P[ci].name}（寻宝者）摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，掷出 ${d1} 点，成功规避负面效果！`, ...res.msgs], statePatch: res.statePatch, kept: true, needsDecision: false, _aiDrawnCard: drawnCard };
      }
    }

    // Apply effect for AI
    const res = applyFx(drawnCard, ci, null, P, D, Disc, gs, false, [], isAI);
    P = res.P; D = res.D; Disc = res.Disc; P[ci].hand.push(drawnCard);
    return { P, D, Disc, drawnCard, effectMsgs: [`${P[ci].name} 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，选择收入手牌并触发效果`, ...res.msgs], statePatch: res.statePatch, kept: true, needsDecision: false, _aiDrawnCard: drawnCard };
  }

  const playerKeepOverride = consumeDebugForceKeepOverride(gs, ci);
  const blindZoneIdentity = shouldBlindZoneDecision(P, ci, drawnCard);
  if (playerKeepOverride === 'keep') {
    if (blindZoneIdentity) P[ci].blindNextZoneDecision = false;
    const res = applyFx(drawnCard, ci, null, P, D, Disc, gs, false, [], isAI);
    P = res.P; D = res.D; Disc = res.Disc; P[ci].hand.push(drawnCard);
    return { P, D, Disc, drawnCard, effectMsgs: [`${whoName} 收入了 ${cardLogText(drawnCard, { alwaysShowName: true })}`, ...res.msgs], statePatch: res.statePatch, kept: true, needsDecision: false };
  }
  if (playerKeepOverride === 'discard') {
    if (blindZoneIdentity) P[ci].blindNextZoneDecision = false;
    Disc.push(drawnCard);
    return { P, D, Disc, drawnCard, effectMsgs: [`${whoName} 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}，选择弃置`], kept: true, needsDecision: false, discardedDrawnCard: true };
  }

  // Player needs decision
  return { P, D, Disc, drawnCard: markBlindZoneCard(drawnCard, blindZoneIdentity), effectMsgs: [], needTarget: false, needsDecision: true, forcedKeep: false, blindZoneIdentity };
}

export function aiDrawAndApply(ci, ps, deck, disc, gs = {}) {
  return handleCardDraw(ci, ps, deck, disc, true, gs);
}

export function playerDrawCard(ps, deck, disc, ci = 0, gs = {}) {
  return handleCardDraw(ci, ps, deck, disc, false, gs);
}

// ══════════════════════════════════════════════════════════════
// 回合开始事件优先级定义
// 规则：
// 1. 被动事件优先于主动事件
// 2. 同为被动/主动时：神牌 > 神牌衍生 > 其他卡牌
// 新增事件必须按优先级插入到 startNextTurn 的正确位置
// ══════════════════════════════════════════════════════════════
const TURN_START_PRIORITY = {
  PASSIVE_GOD: 1,
  PASSIVE_GOD_DERIVATIVE: 2,
  PASSIVE_OTHER: 3,
  ACTIVE_GOD: 4,
  ACTIVE_OTHER: 5,
};

// [PASSIVE_GOD_DERIVATIVE] 黑山羊幼仔回合开始伤害
function turnStartEvent_BgyDamage(P, next, D, Disc, L, gs, inspectionMeta) {
  if (P[next].isDead) return { P, D, Disc, L, inspectionMeta, winAfterBgy: null };

  const bgyCount = P[next].hand.filter(isBlackGoatYoung).length;
  if (bgyCount > 0) {
    const beforePlayers = copyPlayers(P);
    P[next].hp = clamp(P[next].hp - bgyCount);
    P[next].san = clamp(P[next].san - bgyCount);
    L.push(`【黑山羊幼仔】${P[next].name} 失去 ${bgyCount} HP 和 ${bgyCount} SAN`);
    inspectionMeta = appendStatEventsToInspectionMeta(
      inspectionMeta,
      beforePlayers,
      P,
      L.slice(-1),
      '黑山羊幼仔',
    );
    const slimeDecision = buildTsathogguaSlimeBalanceDecision(beforePlayers, P, { _turnOwner: next });
    if (slimeDecision) inspectionMeta = { ...inspectionMeta, abilityData: slimeDecision };
    if (slimeDecision) return { P, D, Disc, L, inspectionMeta, winAfterBgy: null };
    const winAfterSanDepletion = checkWin(P, gs._isMP);
    if (winAfterSanDepletion) return { P, D, Disc, L, inspectionMeta, winAfterBgy: winAfterSanDepletion };
    if (P[next].san > 0 && P[next].san <= 6) {
      const baseLog = [...L];
      const processed = applyInspectionForSanLoss(next, P[next].san, next, P, D, Disc, baseLog, inspectionMeta);
      P = processed.P; D = processed.D; Disc = processed.Disc;
      inspectionMeta = processed.inspectionMeta;
      L.push(...processed.log.slice(baseLog.length));
    }
    if (P[next].hp <= 0) {
      killPlayerState(P, next, Disc, L);
    }
  }

  const winAfterBgy = checkWin(P, gs._isMP);
  return { P, D, Disc, L, inspectionMeta, winAfterBgy };
}

// [PASSIVE_OTHER] 两人一绳治愈
function turnStartEvent_LinkHeal(P, pendingLinkHeals, L, inspectionMeta, statLogs = null) {
  for (const heal of pendingLinkHeals) {
    const beforePlayers = copyPlayers(P);
    if (!P[heal.i].isDead) { P[heal.i].hp = clamp(P[heal.i].hp + heal.amount); }
    if (!P[heal.partnerIdx].isDead) { P[heal.partnerIdx].hp = clamp(P[heal.partnerIdx].hp + heal.amount); }
    L.push(heal.msg);
    inspectionMeta = appendStatEventsToInspectionMeta(
      inspectionMeta,
      beforePlayers,
      P,
      [heal.msg],
      '两人一绳',
    );
    if (statLogs) statLogs.push(heal.msg);
  }
  return { P, L, inspectionMeta };
}

// [PASSIVE_OTHER] 中毒回合开始伤害
function turnStartEvent_PoisonDamage(P, next, D, Disc, L, gs, inspectionMeta, statLogs = null) {
  if (P[next].isDead) return { P, D, Disc, L, inspectionMeta, winAfterPoison: null };
  const poisonStacks = P[next].poisonStacks || 0;
  if (poisonStacks <= 0) return { P, D, Disc, L, inspectionMeta, winAfterPoison: null };

  const beforePlayers = copyPlayers(P);
  P[next].hp = clamp(P[next].hp - poisonStacks);
  P[next].poisonStacks = Math.max(0, poisonStacks - 1);
  if (P[next].poisonStacks <= 0) delete P[next].poisonStacks;
  const msg = `【中毒】${P[next].name} 失去 ${poisonStacks} HP，消耗1层中毒`;
  L.push(msg);
  if (statLogs) statLogs.push(msg);
  inspectionMeta = appendStatEventsToInspectionMeta(
    inspectionMeta,
    beforePlayers,
    P,
    [msg],
    '中毒',
  );
  if (P[next].hp <= 0) {
    if (!tryVritraImmortal(P, next, next, D, Disc, L)) {
      killPlayerState(P, next, Disc, L);
    }
  }
  const winAfterPoison = checkWin(P, gs._isMP);
  return { P, D, Disc, L, inspectionMeta, winAfterPoison };
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

function grantTsathogguaSlimeAtEndTurn(P, prevTurn, L, visualEvents = []) {
  const p = P?.[prevTurn];
  if (!p || p.isDead || p.godName !== 'TSG' || !p.godLevel) return null;
  const count = GOD_DEFS.TSG.levels[(p.godLevel || 1) - 1]?.slimeCount || 0;
  if (!count) return null;
  if (hasGodPowerImmunity(p)) {
    appendGodPowerBlockedFeedback({ player: p, playerIdx: prevTurn, log: L, events: visualEvents });
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

function consumeTsathogguaSlimeForDraw(P, next, L, visualEvents = []) {
  const p = P?.[next];
  if (!p || p.isDead || p.godName !== 'TSG' || !p.godLevel) return 0;
  const slimes = (p.hand || []).filter(isTsathogguaSlime);
  if (!slimes.length) return 0;
  if (hasGodPowerImmunity(p)) {
    appendGodPowerBlockedFeedback({ player: p, playerIdx: next, log: L, events: visualEvents });
    return 0;
  }
  p.hand = p.hand.filter(card => !isTsathogguaSlime(card));
  L.push(`【无定形体】${p.name} 的${slimes.length}张撒托古亚的赐福黏液消失，本次摸牌阶段额外摸${slimes.length}张牌`);
  return slimes.length;
}

export function startNextTurn(gs, opts = {}) {
  const { isDebugMode = false } = opts;
  // Reset multiplyUsed at the start of every turn
  const inheritedTsgSlimeGrantEvents = Array.isArray(gs._carryTsgSlimeGrantEvents) ? gs._carryTsgSlimeGrantEvents : [];
  const inheritedGodPowerBlockedEvents = Array.isArray(gs._carryGodPowerBlockedEvents) ? gs._carryGodPowerBlockedEvents : [];
  gs = { ...gs, multiplyUsed: false, _visualEvents: [...inheritedGodPowerBlockedEvents], _tsgSlimeGrantEvents: null, _carryTsgSlimeGrantEvents: null, _carryGodPowerBlockedEvents: null };
  const visualEvents = gs._visualEvents;
  const N = gs.players.length;
  let P = copyPlayers(gs.players), D = [...gs.deck], Disc = [...gs.discard], L = [...gs.log];
  let _P_beforeTurn = copyPlayers(P);
  let next = gs.currentTurn;
  let turnStartLogs = [];
  let drawLogs = [];
  let statLogs = [];
  let zhuLight = null;
  let pendingLinkHeals = [];
  let inspectionMeta = makeInspectionMeta(gs);
  const turnDir = gs.turnDirection || 1;
  const tsgSlimeGrantEvents = [...inheritedTsgSlimeGrantEvents];
  const tsgSlimeGrant = grantTsathogguaSlimeAtEndTurn(P, gs.currentTurn, L, visualEvents);
  if (tsgSlimeGrant) tsgSlimeGrantEvents.push(tsgSlimeGrant);
  gs = { ...gs, _tsgSlimeGrantEvents: tsgSlimeGrantEvents.length ? tsgSlimeGrantEvents : null };
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
  // 清理过期的两人一绳链条
  P.forEach((p, i) => {
    const shouldExpire = p.damageLink && (
      p.damageLink.expiryOwner === next ||
      (p.damageLink.expiryOwner != null && (!P[p.damageLink.expiryOwner] || P[p.damageLink.expiryOwner].isDead)) ||
      (p.damageLink.expiryOwner == null && p.damageLink.expiryTurn <= newTurn)
    );
    if (shouldExpire) {
      // 如果链条仍然激活，双方各回复4HP
      if (p.damageLink.active) {
        const partnerIdx = p.damageLink.partner;
        if (P[partnerIdx] && !P[partnerIdx].isDead) {
          const healAmount = 4;
          const linkMsg = `【两人一绳】绳索未断裂！${P[i].name} 和 ${P[partnerIdx].name} 各回复 ${healAmount} HP`;
          pendingLinkHeals.push({ i, partnerIdx, amount: healAmount, msg: linkMsg });
        }
      }
      if (p.damageLink?.partner != null && P[p.damageLink.partner]?.damageLink?.partner === i) {
        delete P[p.damageLink.partner].damageLink;
      }
      delete p.damageLink;
    }
    // 重置当前回合生效的检定牌相关状态
    p.disableRest = false;
    p.disableSkill = false;
    p.handLimitDecrease = 0;
  });
  // 结转"下一回合生效"的检定牌负面状态
  if (P[next]) {
    P[next].disableRest = !!P[next].disableRestNextTurn;
    P[next].disableSkill = !!P[next].disableSkillNextTurn;
    P[next].handLimitDecrease = P[next].handLimitDecreaseNextTurn || 0;
    P[next].disableRestNextTurn = false;
    P[next].disableSkillNextTurn = false;
    P[next].handLimitDecreaseNextTurn = 0;
  }
  let globalOnlySwapOwner = gs.globalOnlySwapOwner;
  if (globalOnlySwapOwner === next) {
    globalOnlySwapOwner = null;
    L.push('"全员技能变为掉包"的效果结束了');
  }
  // If this player was resting: wake up (flip card face-up), skip their turn entirely
  if (P[next].isResting) {
    P[next].isResting = false;
    turnStartLogs = [`── ${P[next].name} 的回合开始 ──`];
    zhuLight = turnStartEvent_ZhuLight(P, D, next, gs);
    L.push(...turnStartLogs);
    // [PASSIVE_GOD_DERIVATIVE] 黑山羊幼仔回合开始伤害
    const bgy = turnStartEvent_BgyDamage(P, next, D, Disc, L, gs, inspectionMeta);
    P = bgy.P; D = bgy.D; Disc = bgy.Disc; L = bgy.L; inspectionMeta = bgy.inspectionMeta; gs = { ...gs, ...inspectionMeta };
    if (bgy.winAfterBgy) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, gameOver: bgy.winAfterBgy, multiplyUsed: false };
    if (inspectionMeta?.abilityData?.type === 'tsgSlimeBalance') {
      return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, phase: 'TSG_SLIME_BALANCE', abilityData: { ...inspectionMeta.abilityData, _turnOwner: next }, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn };
    }
    // [PASSIVE_OTHER] 中毒回合开始伤害
    const poison = turnStartEvent_PoisonDamage(P, next, D, Disc, L, gs, inspectionMeta);
    P = poison.P; D = poison.D; Disc = poison.Disc; L = poison.L; inspectionMeta = poison.inspectionMeta; gs = { ...gs, ...inspectionMeta };
    if (poison.winAfterPoison) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, gameOver: poison.winAfterPoison, multiplyUsed: false };
    // [PASSIVE_OTHER] 两人一绳治愈
    const link = turnStartEvent_LinkHeal(P, pendingLinkHeals, L, inspectionMeta);
    P = link.P; L = link.L; inspectionMeta = link.inspectionMeta; gs = { ...gs, ...inspectionMeta };
    L.push(`${P[next].name} 从休息中醒来，跳过本回合`);
    // CTH power: draw when ending/skipping turn while face-down
    if (P[next].godName === 'CTH' && P[next].godLevel >= 1 && hasGodPowerImmunity(P[next])) {
      appendGodPowerBlockedFeedback({ player: P[next], playerIdx: next, log: L, events: visualEvents });
    } else if (P[next].godName === 'CTH' && P[next].godLevel >= 1) {
      const extraDraws = P[next].godLevel; // lv1→1, lv2→2, lv3→3
      const whoName = localDisplayName(next, P[next].name);
      L.push(`${whoName}（克苏鲁信徒Lv.${P[next].godLevel}）梦访拉莱耶，翻面跳过回合时额外摸${extraDraws}张牌`);
      let cthRestDraws = [];
      let cthRestDrawLogs = [];
      const _P_beforeCthDraws = copyPlayers(P);
      for (let _d = 0; _d < extraDraws; _d++) {
        const r2 = playerDrawCard(P, D, Disc, next, gs); P = r2.P; D = r2.D; Disc = r2.Disc;
        if (r2.drawnCard) {
          L.push(`  摸到 ${cardLogText(r2.drawnCard, { alwaysShowName: true })}`);
          if (next === 0) cthRestDraws.push(r2.drawnCard);
        }
        if (r2.needGodChoice) {
          // AI角色不会触发神牌选择UI，直接处理
          if (next === 0) {
            const drawLogs = [`${whoName} 摸到 ${drawCardDecisionText(r2.drawnCard)}`];
            return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: true, phase: 'GOD_CHOICE', abilityData: { godCard: r2.drawnCard, fromRest: true, cthDrawsRemaining: extraDraws - _d - 1, drawerIdx: 0 }, drawReveal: null, selectedCard: null, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: [], _cthRestDraws: cthRestDraws, _cthRestDrawLogs: cthRestDrawLogs, _playersBeforeCthDraws: _P_beforeCthDraws };
          }
        }
        if (r2.needsDecision) {
          // AI角色自动处理决策
          if (next === 0) {
            const split = splitAnimBoundLogs(r2.effectMsgs || []);
            const drawLogs = [`${whoName} 摸到 ${drawCardDecisionText(r2.drawnCard)}`, ...split.preStat];
            return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'DRAW_REVEAL', drawReveal: { card: r2.drawnCard, msgs: [], needsDecision: true, forcedKeep: false, drawerIdx: 0, drawerName: P[0].name, fromRest: true }, selectedCard: null, abilityData: { fromRest: true, cthDrawsRemaining: extraDraws - _d - 1 }, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: split.stat, _cthRestDraws: cthRestDraws, _cthRestDrawLogs: cthRestDrawLogs, _playersBeforeCthDraws: _P_beforeCthDraws };
          } else {
            // AI角色自动选择收入手牌
            const aiRes = applyFx(r2.drawnCard, next, null, P, D, Disc, gs);
            P = aiRes.P; D = aiRes.D; Disc = aiRes.Disc; P[next].hand.push(r2.drawnCard);
            if (aiRes.msgs.length) L.push(...aiRes.msgs);
          }
        }
        // forced card: already applied, continue
        if (r2.kept) {
          if (r2.effectMsgs.length) {
            L.push(...r2.effectMsgs);
            if (next === 0) cthRestDrawLogs.push(...r2.effectMsgs);
          }
          continue;
        }
      }
      if (next === 0 && cthRestDraws.length > 0) {
        const nextGs = startNextTurn({ ...gs, players: P, deck: D, discard: Disc, log: L, currentTurn: next, skillUsed: false, restUsed: false, godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner }, opts);
        return { ...nextGs, zhuLight: nextGs.zhuLight ?? zhuLight, _cthRestDraws: cthRestDraws, _cthRestDrawLogs: cthRestDrawLogs, _playersBeforeCthDraws: _P_beforeCthDraws };
      }
    }
    // Skip the turn: advance past player to the next living player
    // Hand limit is NOT enforced here — excess cards are kept until the next normal turn ends
    return startNextTurn({ ...gs, players: P, deck: D, discard: Disc, log: L, currentTurn: next, skillUsed: false, restUsed: false, godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, _carryTsgSlimeGrantEvents: tsgSlimeGrantEvents, _carryGodPowerBlockedEvents: visualEvents }, opts);
  }
  turnStartLogs = [`── ${P[next].name} 的回合开始 ──`];
  L.push(...turnStartLogs);
  zhuLight = turnStartEvent_ZhuLight(P, D, next, gs);
  // [PASSIVE_GOD_DERIVATIVE] 黑山羊幼仔回合开始伤害
  const bgy = turnStartEvent_BgyDamage(P, next, D, Disc, L, gs, inspectionMeta);
  P = bgy.P; D = bgy.D; Disc = bgy.Disc; L = bgy.L; inspectionMeta = bgy.inspectionMeta; gs = { ...gs, ...inspectionMeta };
  if (bgy.winAfterBgy) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, gameOver: bgy.winAfterBgy, multiplyUsed: false };
  if (inspectionMeta?.abilityData?.type === 'tsgSlimeBalance') {
    return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, phase: 'TSG_SLIME_BALANCE', abilityData: { ...inspectionMeta.abilityData, _turnOwner: next }, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn };
  }
  // [PASSIVE_OTHER] 中毒回合开始伤害
  const poison = turnStartEvent_PoisonDamage(P, next, D, Disc, L, gs, inspectionMeta, statLogs);
  P = poison.P; D = poison.D; Disc = poison.Disc; L = poison.L; inspectionMeta = poison.inspectionMeta; gs = { ...gs, ...inspectionMeta };
  if (poison.winAfterPoison) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, gameOver: poison.winAfterPoison, multiplyUsed: false };
  // [PASSIVE_OTHER] 两人一绳治愈
  const link = turnStartEvent_LinkHeal(P, pendingLinkHeals, L, inspectionMeta, statLogs);
  P = link.P; L = link.L; inspectionMeta = link.inspectionMeta; gs = { ...gs, ...inspectionMeta };
  if (next === 0) {
    // Debug: 强制摸牌 - 玩家
    applyDebugForceDrawToTop(gs, next, D);
    // [ACTIVE_GOD] NYA 偷身份
    const nya = turnStartEvent_NyaBorrow(P, 0, L, gs, visualEvents);
    if (nya.shouldEnterPhase) {
      return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: [...L, nya.logMsg], currentTurn: 0, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'NYA_BORROW', abilityData: {}, drawReveal: null, selectedCard: null, globalOnlySwapOwner, debugForceCard: null, debugForceCardTarget: null, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: copyPlayers(P) };
    }
    // 检查是否需要跳过摸牌
    if (P[0].skipNextDraw) {
      const skipReason = P[0].skipNextDrawReason || '扭伤';
      delete P[0].skipNextDraw;
      delete P[0].skipNextDrawReason;
      L.push(`你因${skipReason}而无法摸牌`);
      const win = checkWin(P, gs._isMP); if (win) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, gameOver: win, turn: newTurn, _turnKey: newTurnKey, debugForceCard: null, debugForceCardTarget: null };
      return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'ACTION', drawReveal: null, selectedCard: null, abilityData: {}, globalOnlySwapOwner, turn: newTurn, _turnKey: newTurnKey, debugForceCard: null, debugForceCardTarget: null };
    }
    const _P_beforeDraw = copyPlayers(P);
    const tsgExtraDraws = consumeTsathogguaSlimeForDraw(P, 0, L, visualEvents);
    for (let _d = 0; _d < tsgExtraDraws; _d++) {
      const rSlime = playerDrawCard(P, D, Disc, 0, gs);
      P = rSlime.P; D = rSlime.D; Disc = rSlime.Disc;
      if (rSlime.drawnCard) {
        const msg = `【无定形体】你额外摸到 ${drawCardDecisionText(rSlime.drawnCard)}`;
        L.push(msg); drawLogs.push(msg);
      }
      if (rSlime.needGodChoice) {
        return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: true, phase: 'GOD_CHOICE', abilityData: { godCard: rSlime.drawnCard, drawerIdx: 0, godEncounterCost: rSlime.godEncounterCost, fromTsathogguaSlime: true }, drawReveal: null, selectedCard: null, globalOnlySwapOwner, _playersBeforeThisDraw: _P_beforeDraw, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn };
      }
      if (rSlime.needsDecision) {
        return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'DRAW_REVEAL', drawReveal: { card: rSlime.drawnCard, msgs: rSlime.effectMsgs, needsDecision: true, forcedKeep: !!rSlime.forcedKeep, drawerIdx: 0, drawerName: P[0].name, fromTsathogguaSlime: true }, selectedCard: null, abilityData: { fromTsathogguaSlime: true }, globalOnlySwapOwner, _playersBeforeThisDraw: _P_beforeDraw, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn };
      }
      if (rSlime.effectMsgs?.length) L.push(...rSlime.effectMsgs);
    }
    const res = playerDrawCard(P, D, Disc, 0, gs);
    P = res.P; D = res.D; Disc = res.Disc;
    // 多人游戏中记录玩家0摸牌信息到日志，让其他玩家可见（单机不需要，DRAW_REVEAL 时可见）
    if (res.drawnCard && !res.kept) {
      drawLogs.push(`${gs._isMP ? P[0].name : '你'} 摸到 ${drawCardDecisionText(res.drawnCard)}`);
    }
    if (res.effectMsgs?.length) {
      const split = splitAnimBoundLogs(res.effectMsgs);
      drawLogs.push(...split.preStat);
      statLogs.push(...split.stat);
    }
    if (drawLogs.length) L.push(...drawLogs);
    if (statLogs.length) L.push(...statLogs);
    if (!res.drawnCard) { L.push('牌堆耗尽！'); return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, phase: 'ACTION', drawReveal: null, abilityData: {}, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn }; }
    if (res.needGodChoice) { return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: true, phase: 'GOD_CHOICE', abilityData: { godCard: res.drawnCard, drawerIdx: 0, godEncounterCost: res.godEncounterCost }, drawReveal: null, selectedCard: null, globalOnlySwapOwner, _playersBeforeThisDraw: _P_beforeDraw, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _aiDrawnCard: null, _drawnCard: res.drawnCard ?? null, _drawSourcePile: res.sourcePile }; }
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
      } : null,
      selectedCard: null,
      abilityData: {},
      globalOnlySwapOwner,
      _playersBeforeThisDraw: _P_beforeDraw,
      _turnStartLogs: turnStartLogs,
      _drawLogs: drawLogs,
      _statLogs: statLogs,
      _preTurnPlayers: _P_beforeTurn,
      ...(res.statePatch || {}),
    };
    const win = checkWin(P, gs._isMP); if (win) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, gameOver: win, ...playerTurnAnimMeta };
    // 强制触发牌：效果已执行，直接进入 ACTION；drawReveal 保留卡牌供翻牌动画使用，但不广播 DRAW_REVEAL
    if (res.kept) {
      const decisionState = deriveEffectDecisionState(res.statePatch, {
        baseAbilityData: {},
        fallbackPhase: 'ACTION',
      });
      return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: decisionState.phase, drawReveal: { card: res.drawnCard, msgs: res.effectMsgs, needsDecision: false, forcedKeep: false, drawerIdx: 0, drawerName: P[0].name, sourcePile: res.sourcePile }, selectedCard: null, abilityData: decisionState.abilityData, globalOnlySwapOwner, _playersBeforeThisDraw: _P_beforeDraw, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _drawSourcePile: res.sourcePile, ...(res.statePatch || {}) };
    }
    return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: 0, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'DRAW_REVEAL', drawReveal: { card: res.drawnCard, msgs: res.effectMsgs, needsDecision: !!res.needsDecision, forcedKeep: !!res.forcedKeep, drawerIdx: 0, drawerName: P[0].name, sourcePile: res.sourcePile }, selectedCard: null, abilityData: {}, globalOnlySwapOwner, _playersBeforeThisDraw: _P_beforeDraw, turn: newTurn, _turnKey: newTurnKey, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _drawSourcePile: res.sourcePile };
  } else if (gs._isMP) {
    // Multiplayer: next player is human — draw their card and enter DRAW_REVEAL
    // [ACTIVE_GOD] NYA 偷身份
    const nyaMp = turnStartEvent_NyaBorrow(P, next, L, gs, visualEvents);
    if (nyaMp.shouldEnterPhase) {
      return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: [...L, nyaMp.logMsg], currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'NYA_BORROW', abilityData: {}, drawReveal: null, selectedCard: null, _isMP: gs._isMP, globalOnlySwapOwner, debugForceCard: null, debugForceCardTarget: null, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: copyPlayers(P) };
    }
    // 检查是否需要跳过摸牌
    if (P[next].skipNextDraw) {
      const skipReason = P[next].skipNextDrawReason || '扭伤';
      delete P[next].skipNextDraw;
      delete P[next].skipNextDrawReason;
      L.push(`${P[next].name} 因${skipReason}而无法摸牌`);
      const win = checkWin(P, true); if (win) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, gameOver: win };
      return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'ACTION', drawReveal: null, selectedCard: null, abilityData: {}, _isMP: gs._isMP, globalOnlySwapOwner };
    }
    const _P_beforeMpDraw = copyPlayers(P);
    const tsgExtraDraws = consumeTsathogguaSlimeForDraw(P, next, L, visualEvents);
    for (let _d = 0; _d < tsgExtraDraws; _d++) {
      const rSlime = playerDrawCard(P, D, Disc, next, gs);
      P = rSlime.P; D = rSlime.D; Disc = rSlime.Disc;
      if (rSlime.drawnCard) {
        const msg = `【无定形体】${P[next].name} 额外摸到 ${drawCardDecisionText(rSlime.drawnCard)}`;
        L.push(msg); drawLogs.push(msg);
      }
      if (rSlime.needGodChoice) {
        return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: true, phase: 'GOD_CHOICE', abilityData: { godCard: rSlime.drawnCard, godEncounterCost: rSlime.godEncounterCost, fromTsathogguaSlime: true }, drawReveal: null, selectedCard: null, _isMP: gs._isMP, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw };
      }
      if (rSlime.needsDecision) {
        return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'DRAW_REVEAL', drawReveal: { card: rSlime.drawnCard, msgs: rSlime.effectMsgs, needsDecision: true, forcedKeep: !!rSlime.forcedKeep, drawerIdx: next, drawerName: P[next].name, fromTsathogguaSlime: true }, selectedCard: null, abilityData: { fromTsathogguaSlime: true }, _isMP: gs._isMP, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw };
      }
      if (rSlime.effectMsgs?.length) L.push(...rSlime.effectMsgs);
    }
    const res = playerDrawCard(P, D, Disc, next, gs);
    P = res.P; D = res.D; Disc = res.Disc;
    // 记录摸牌信息到日志（与单机AI摸牌保持一致：[key] 名称）
    if (res.drawnCard && !res.kept) drawLogs.push(`${P[next].name} 摸到 ${drawCardDecisionText(res.drawnCard)}`);
    if (res.effectMsgs?.length) {
      const split = splitAnimBoundLogs(res.effectMsgs);
      drawLogs.push(...split.preStat);
      statLogs.push(...split.stat);
    }
    if (drawLogs.length) L.push(...drawLogs);
    if (statLogs.length) L.push(...statLogs);
    if (!res.drawnCard) { L.push('牌堆耗尽！'); return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, phase: 'ACTION', drawReveal: null, abilityData: {}, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw }; }
    if (res.needGodChoice) { return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: true, phase: 'GOD_CHOICE', abilityData: { godCard: res.drawnCard, godEncounterCost: res.godEncounterCost }, drawReveal: null, selectedCard: null, _isMP: gs._isMP, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw }; }
    const win = checkWin(P, true); if (win) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, gameOver: win };
    // 强制触发牌：效果已执行，直接进入 ACTION；不向其他玩家广播 DRAW_REVEAL 界面
    if (res.kept) {
      return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'ACTION', drawReveal: { card: res.drawnCard, msgs: res.effectMsgs, needsDecision: false, forcedKeep: false, drawerIdx: next, drawerName: P[next].name, sourcePile: res.sourcePile }, selectedCard: null, abilityData: {}, _isMP: gs._isMP, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw, _drawSourcePile: res.sourcePile, ...(res.statePatch || {}) };
    }
    return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, currentTurn: next, turn: newTurn, _turnKey: newTurnKey, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, phase: 'DRAW_REVEAL', drawReveal: { card: res.drawnCard, msgs: res.effectMsgs, needsDecision: !!res.needsDecision, forcedKeep: !!res.forcedKeep, drawerIdx: next, drawerName: P[next].name, sourcePile: res.sourcePile }, selectedCard: null, abilityData: {}, _isMP: gs._isMP, globalOnlySwapOwner, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, _playersBeforeThisDraw: _P_beforeMpDraw, _drawSourcePile: res.sourcePile };
  } else {
    // [ACTIVE_GOD] NYA 偷身份（AI 自动处理）
    turnStartEvent_NyaBorrow(P, next, L, gs, visualEvents);
    // 检查是否需要跳过摸牌
    if (P[next].skipNextDraw) {
      const skipReason = P[next].skipNextDrawReason || '扭伤';
      delete P[next].skipNextDraw;
      delete P[next].skipNextDrawReason;
      L.push(`${P[next].name} 因${skipReason}而无法摸牌`);
      const win = checkWin(P, gs._isMP); if (win) return { ...gs, zhuLight, players: P, deck: D, discard: Disc, log: L, gameOver: win, debugForceCard: null, debugForceCardTarget: null };
      return startNextTurn({ ...gs, players: P, deck: D, discard: Disc, log: L, currentTurn: next, skillUsed: false, restUsed: false, godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner, debugForceCard: null, debugForceCardTarget: null, _carryTsgSlimeGrantEvents: tsgSlimeGrantEvents, _carryGodPowerBlockedEvents: visualEvents }, opts);
    }
    applyDebugForceDrawToTop(gs, next, D);
    const _P_beforeDraw = copyPlayers(P);
    const tsgExtraDraws = consumeTsathogguaSlimeForDraw(P, next, L, visualEvents);
    for (let _d = 0; _d < tsgExtraDraws; _d++) {
      const rSlime = aiDrawAndApply(next, P, D, Disc, gs);
      P = rSlime.P; D = rSlime.D; Disc = rSlime.Disc;
      if (rSlime.drawnCard) {
        L.push(`【无定形体】${P[next].name} 额外摸到 ${drawCardDecisionText(rSlime.drawnCard)}`);
      }
      if (rSlime.effectMsgs?.length) L.push(...rSlime.effectMsgs);
    }
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
        _turnKey: (gs._turnKey || 0) + 1,
        _turnStartLogs: turnStartLogs,
        _drawLogs: drawLogs,
        _statLogs: statLogs,
        _preTurnPlayers: _P_beforeTurn,
        globalOnlySwapOwner,
      };
    }
    const res = aiDrawAndApply(next, P, D, Disc, { ...gs, deferAiGodChoice: true });
    gs.debugForceCardKeepPending = null;
    gs.debugForceCardKeepTarget = null;
    P = res.P; D = res.D; Disc = res.Disc;
    if (res.drawnCard && isDebugMode) {
      const debugDrawLog = `[调试] ${P[next].name}（${P[next]._nyaBorrow || P[next].role}）起手摸到 ${drawCardDecisionText(res.drawnCard)}`;
      turnStartLogs.push(debugDrawLog);
      L.push(debugDrawLog);
    }
    if (res.effectMsgs?.length) {
      const split = splitAnimBoundLogs(res.effectMsgs);
      drawLogs.push(...split.preStat);
      statLogs.push(...split.stat);
      if (drawLogs.length) L.push(...drawLogs);
      if (statLogs.length) L.push(...statLogs);
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
      _statLogs: statLogs,
      _preTurnPlayers: _P_beforeTurn,
    };
    const win = checkWin(res.P, gs._isMP); if (win) return { ...gs, zhuLight, players: res.P, deck: D, discard: Disc, log: L, gameOver: win, ...aiTurnAnimMeta, ...(res.statePatch || {}), globalOnlySwapOwner: (res.statePatch?.globalOnlySwapOwner ?? globalOnlySwapOwner) };
    if (!res.P[next].isDead && res.P[next].role === ROLE_TREASURE && isWinHand(res.P[next].hand)) {
      res.P[next].roleRevealed = true;
      return {
        ...gs,
        players: res.P,
        deck: D,
        discard: Disc,
        log: [...L, `${res.P[next].name} 集齐全部编号并获胜！`],
        gameOver: { winner: ROLE_TREASURE, reason: `${res.P[next].name} 集齐了全部编号并获胜！`, winnerIdx: next },
        ...aiTurnAnimMeta,
        ...(res.statePatch || {}),
        globalOnlySwapOwner: (res.statePatch?.globalOnlySwapOwner ?? globalOnlySwapOwner)
      };
    }
    return { ...gs, zhuLight, players: res.P, deck: D, discard: Disc, log: L, currentTurn: next, phase: nextPhase, drawReveal: null, selectedCard: null, abilityData: nextAbilityData, huntAbandoned: [], _aiDrawnCard: res.drawnCard ?? null, _drawnCard: res.drawnCard ?? null, _discardedDrawnCard: !!res.discardedDrawnCard, _playersBeforeThisDraw: _P_beforeDraw, _turnKey: (gs._turnKey || 0) + 1, _turnStartLogs: turnStartLogs, _drawLogs: drawLogs, _statLogs: statLogs, _preTurnPlayers: _P_beforeTurn, ...(res.statePatch || {}), phase: nextPhase, abilityData: nextAbilityData, globalOnlySwapOwner: (res.statePatch?.globalOnlySwapOwner ?? globalOnlySwapOwner) };
  }
}
