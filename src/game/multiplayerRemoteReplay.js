import { bindAnimLogChunks } from './animLogs';
import { mergeApophisTargetQueue } from './apophisAnimQueue';
import { buildAiHuntEventAnimQueue } from './animQueueCore';
import { buildSphinxResultQueue, cardTransferStep, swapCardsSteps } from './animQueueHelpers';
import {
  buildBewitchGiftReplay,
  buildInspectionReplay,
  buildRandomTargetReplay,
  findFreshBewitchReplayLog,
  hasFreshRandomTargetEvents,
  isFreshActionReplayEvent,
  isFreshBewitchReplayEvent,
} from './animReplayEvents';
import { appendFinalStatePatch, finalStatePatch } from './animStatePatch';
import { cardLogText, copyPlayers } from './coreUtils';
import { isLocalCurrentTurn, isLocalSeatIndex, localDisplayName } from './rotateState';
import {
  buildTurnStartPreDrawEffectQueue,
  buildTsathogguaSlimeGrantQueue,
  buildTurnStartDrawReplayQueue,
  getTurnStartDrawBaselineLog,
  getTurnStartDrawerIdx,
  withClearedReplayAnimFields,
} from './turnAnimState';
import {
  buildStatStepsFromVisualEvents,
  buildTimedOutDrawDiscardStepFromVisualEvents,
  buildHandLimitDiscardStepsFromVisualEvents,
  clearVisualEvents,
  getVisualEventIdsFromState,
  buildCardEffectStepsFromVisualEvents,
  getBewitchGiftVisualEvent,
  getSwapCardsVisualEvent,
  getHuntRevealVisualEvent,
  buildHuntRevealStepFromVisualEvent,
  getHuntTargetVisualEvent,
  getHuntResultVisualEvent,
  getSphinxResultVisualEvent,
  getEndlessCorridorReplayVisualEvent,
  pruneConsumedVisualEvents,
} from './visualEvents';

export const MP_REMOTE_REPLAY = {
  ROLE_REVEAL: 'ROLE_REVEAL',
  SET_STATE: 'SET_STATE',
  DICE_ROLL: 'DICE_ROLL',
  ANIM_QUEUE: 'ANIM_QUEUE',
  START_ANIM: 'START_ANIM',
};

function hasDrawAnimationState(state) {
  if (state?.gameOver) return false;
  if (isPendingZhuHideState(state)) return false;
  return (
    state.phase === 'DRAW_REVEAL'
    || state.phase === 'DRAW_SELECT_TARGET'
    || state.phase === 'GOD_CHOICE'
    || (
      state.phase === 'ACTION'
      && state.drawReveal?.card != null
      && state.drawReveal?.needsDecision === false
      && state.drawReveal?.drawerIdx != null
    )
    || (
      (state.phase === 'ACTION' || state.phase === 'AI_TURN')
      && (state._drawnCard || state._aiDrawnCard)
      && hasFreshTurnDrawReplayState(state)
    )
  );
}

function hasFreshTurnDrawReplayState(state) {
  if (!state || state.gameOver) return false;
  if (
    state.phase === 'DRAW_REVEAL'
    || state.phase === 'DRAW_SELECT_TARGET'
    || state.phase === 'GOD_CHOICE'
  ) {
    return true;
  }
  return (
    (Array.isArray(state._turnStartLogs) && state._turnStartLogs.length > 0)
    || (Array.isArray(state._drawLogs) && state._drawLogs.length > 0)
  );
}

function isPendingZhuHideState(state) {
  const ids = state?.zhuLight?.cardIds || [];
  if (!ids.length && state?.phase !== 'ZHU_HIDE_AI_DRAW') return false;
  if (state?.phase === 'DRAW_REVEAL') {
    const card = state.drawReveal?.card;
    return !!(card?.id && !state.drawReveal?.zhuResolved && ids.includes(card.id));
  }
  if (state?.phase === 'GOD_CHOICE') {
    const card = state.abilityData?.godCard;
    return !!(card?.id && !state.abilityData?.zhuResolved && ids.includes(card.id));
  }
  return state?.phase === 'ZHU_HIDE_AI_DRAW';
}

function buildZhuHideWaitAction(rotated, previousGs) {
  const drawerPid = getTurnStartDrawerIdx(rotated);
  const drawerName = rotated?.players?.[drawerPid]?.name || '???';
  if (!Array.isArray(rotated?._turnStartLogs) || !rotated._turnStartLogs.length) {
    return { type: MP_REMOTE_REPLAY.SET_STATE, gs: clearRemoteReplayHints(rotated) };
  }
  const preDrawQueue = buildTurnStartPreDrawEffectQueue({ oldGs: previousGs, newGs: rotated });
  return {
    type: MP_REMOTE_REPLAY.START_ANIM,
    maskedGs: buildMaskedActionState(rotated),
    pendingGs: clearRemoteReplayHints(rotated),
    anim: {
      type: 'YOUR_TURN',
      ...(drawerPid === 0 ? {} : { name: drawerName }),
      msgs: rotated._turnStartLogs,
    },
    queue: preDrawQueue,
  };
}

function buildMaskedActionState(state) {
  return { ...state, phase: 'ACTION', drawReveal: null, abilityData: {} };
}

function withApophisTargetReplay(queue = [], previousGs, rotated, buildAnimQueue) {
  return mergeApophisTargetQueue(queue, previousGs || buildMaskedActionState(rotated), rotated, buildAnimQueue);
}

function clearRemoteReplayHints(state) {
  return state ? withClearedReplayAnimFields(clearVisualEvents({ ...state, _mpTimedOutDrawDiscard: null })) : state;
}

function getLogDelta(previousGs, rotated) {
  const prevLog = Array.isArray(previousGs?.log) ? previousGs.log : [];
  const nextLog = Array.isArray(rotated?.log) ? rotated.log : [];
  let start = 0;
  while (start < prevLog.length && start < nextLog.length && prevLog[start] === nextLog[start]) start += 1;
  return nextLog.slice(start);
}

function buildTreasureDodgeResolutionReplay({ previousGs, rotated, logDelta, buildAnimQueue }) {
  if (!['TREASURE_DODGE_DECISION', 'TREASURE_AOE_DODGE_DECISION'].includes(previousGs?.phase)) return null;
  const resultLog = logDelta.find(line => (
    typeof line === 'string'
    && / 掷出 \d+ 点，(?:成功规避负面效果|未能规避，触发负面效果)/.test(line)
  ));
  const match = resultLog?.match(/^(.+?) 掷出 (\d+) 点，(.+?)！?$/);
  if (!match) return null;

  const drawerIdx = previousGs.drawReveal?.drawerIdx
    ?? previousGs.abilityData?.drawerIdx
    ?? previousGs.currentTurn
    ?? 0;
  const card = previousGs.drawReveal?.card || null;
  const d1 = Number(match[2]);
  const effectQueue = buildAnimQueue(previousGs, rotated)
    .filter(step => step?.type !== 'DRAW_CARD' && step?.type !== 'DICE_ROLL');
  const keptInHand = !!card && (rotated.players?.[drawerIdx]?.hand || []).some(candidate => (
    candidate === card
    || (candidate?.id != null && card?.id != null && candidate.id === card.id)
    || (candidate?.key === card?.key && candidate?.name === card?.name)
  ));
  const transferStep = keptInHand
    ? cardTransferStep({
      fromPid: drawerIdx,
      dest: 'player',
      toPid: drawerIdx,
      count: 1,
      sourceAnchor: 'playerArea',
      effect: 'draw',
      cards: [card],
    })
    : null;
  return appendFinalStatePatch(
    [{
      type: 'DICE_ROLL',
      d1,
      d2: 0,
      heal: 0,
      rollerName: localDisplayName(drawerIdx, rotated.players?.[drawerIdx]?.name || match[1]),
      dodgeSuccess: match[3].includes('成功规避负面效果'),
      msgs: [resultLog],
    }, ...effectQueue, ...(transferStep ? [transferStep] : [])],
    rotated,
    ['players', 'deck', 'discard', 'log', 'phase', 'drawReveal', 'abilityData'],
  );
}

function buildTimedOutDrawDiscardStep(rotated, previousGs, logDelta = []) {
  const visualEventStep = buildTimedOutDrawDiscardStepFromVisualEvents(rotated);
  if (visualEventStep) return visualEventStep;
  const explicit = rotated?._mpTimedOutDrawDiscard;
  if (explicit?.card) {
    const drawerIdx = explicit.drawerIdx ?? 0;
    const drawerName = explicit.drawerName || rotated?.players?.[drawerIdx]?.name || '???';
    return {
      type: 'DISCARD',
      card: explicit.card,
      triggerName: localDisplayName(drawerIdx, drawerName),
      targetPid: drawerIdx,
      msgs: [`(超时) ${localDisplayName(drawerIdx, drawerName)} 弃置了 ${cardLogText(explicit.card, { alwaysShowName: true })}`],
    };
  }
  const previousDraw = previousGs?.drawReveal;
  if (!previousDraw?.card || !previousDraw.needsDecision || previousDraw.forcedKeep) return null;
  const discardMsg = logDelta.find(line => /（?超时\)? .*弃置了/.test(line || '') || /\(超时\).*弃置了/.test(line || ''));
  if (!discardMsg) return null;
  const drawerIdx = previousDraw.drawerIdx ?? previousGs?.currentTurn ?? 0;
  const drawerName = previousDraw.drawerName || previousGs?.players?.[drawerIdx]?.name || '???';
  return {
    type: 'DISCARD',
    card: previousDraw.card,
    triggerName: drawerName,
    targetPid: drawerIdx,
    msgs: [discardMsg],
  };
}

function findCardByLabel(players, label) {
  if (!label) return null;
  for (const player of players || []) {
    const zones = [player?.hand, player?.godZone, player?.zoneCards].filter(Array.isArray);
    for (const zone of zones) {
      const found = zone.find(card => card?.key === label || card?.name === label || card?.godKey === label);
      if (found) return found;
    }
  }
  return null;
}

function isSameCard(first, second) {
  if (!first || !second) return false;
  if (first === second) return true;
  if (first.id != null && second.id != null) return first.id === second.id;
  return first.godKey === second.godKey
    && first.name === second.name
    && first.type === second.type;
}

function getPendingGodChoiceCard(state) {
  return state?.phase === 'GOD_CHOICE' ? state.abilityData?.godCard || null : null;
}

function buildResolvedGodChoiceDiscardStep(rotated, previousGs, logDelta = []) {
  const previousCard = getPendingGodChoiceCard(previousGs);
  if (!previousCard || !(rotated?.discard || []).some(card => isSameCard(card, previousCard))) return null;

  const drawerIdx = previousGs.abilityData?.drawerIdx ?? previousGs.currentTurn ?? 0;
  const drawerName = previousGs.players?.[drawerIdx]?.name || rotated?.players?.[drawerIdx]?.name || '???';
  const discardMsg = logDelta.find(line => /放弃了邪神的馈赠|\(超时\).*放弃了邪神的馈赠/.test(line || ''));
  return {
    type: 'DISCARD',
    card: previousCard,
    triggerName: localDisplayName(drawerIdx, drawerName),
    targetPid: drawerIdx,
    msgs: discardMsg ? [discardMsg] : [],
    // The incoming state already contains the discarded card. Restore the
    // pre-decision view until the card has visibly reached the discard pile.
    visualSetupTiming: 'queueStart',
    visualSetupPatch: {
      players: previousGs.players,
      discard: previousGs.discard || [],
    },
  };
}

function buildResolvedDrawChoiceQueue(rotated, previousGs, logDelta, buildAnimQueue) {
  const previousDraw = previousGs?.drawReveal;
  const card = previousDraw?.card;
  if (previousGs?.phase !== 'DRAW_REVEAL' || !card || !previousDraw.needsDecision || previousDraw.forcedKeep || rotated?.drawReveal?.card) return null;
  const drawerIdx = previousDraw.drawerIdx ?? previousGs.currentTurn ?? 0;
  const drawerName = previousDraw.drawerName || previousGs.players?.[drawerIdx]?.name || rotated.players?.[drawerIdx]?.name || '???';
  const inHand = (rotated.players?.[drawerIdx]?.hand || []).some(candidate => isSameCard(candidate, card));
  const inDiscard = (rotated.discard || []).some(candidate => isSameCard(candidate, card));
  if (!inHand && !inDiscard) return null;
  const effectQueue = bindAnimLogChunks(
    buildAnimQueue(previousGs, rotated).filter(step => !['DRAW_CARD', 'CARD_TRANSFER', 'DISCARD'].includes(step?.type)),
    { statLogs: logDelta },
  );
  const resolutionStep = inHand
    ? cardTransferStep({
        fromPid: drawerIdx,
        dest: 'player',
        toPid: drawerIdx,
        count: 1,
        sourceAnchor: 'playerArea',
        effect: 'draw',
        cards: [card],
        msgs: logDelta.filter(line => typeof line === 'string' && line.includes('收入了')),
      })
    : {
        type: 'DISCARD',
        card,
        triggerName: localDisplayName(drawerIdx, drawerName),
        targetPid: drawerIdx,
        msgs: logDelta.filter(line => typeof line === 'string' && line.includes('弃置了')),
      };
  return [resolutionStep, ...effectQueue];
}

export function buildMpRemoteReplayAction({
  rotated,
  previousGs,
  roleRevealed,
  buildAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
  consumedVisualEventIds,
}) {
  if (!rotated) return null;
  const hadVisualEventsBeforePrune = Array.isArray(rotated._visualEvents) && rotated._visualEvents.length > 0;
  rotated = pruneConsumedVisualEvents(rotated, consumedVisualEventIds);
  const visualEventIds = getVisualEventIdsFromState(rotated);
  if (hadVisualEventsBeforePrune && visualEventIds.length === 0 && !hasFreshTurnDrawReplayState(rotated)) {
    return { type: MP_REMOTE_REPLAY.SET_STATE, gs: clearRemoteReplayHints(rotated) };
  }
  const withConsumedVisualEvents = action => (
    visualEventIds.length ? { ...action, consumedVisualEventIds: visualEventIds } : action
  );
  if (!roleRevealed && !rotated.gameOver) {
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ROLE_REVEAL,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: rotated,
      role: rotated.players?.[0]?.role,
    });
  }

  const logDelta = getLogDelta(previousGs, rotated);
  const timedOutDrawDiscardStep = buildTimedOutDrawDiscardStep(rotated, previousGs, logDelta);
  const handLimitDiscardSteps = buildHandLimitDiscardStepsFromVisualEvents(rotated);
  const preTurnSteps = [
    ...handLimitDiscardSteps,
    ...buildTsathogguaSlimeGrantQueue(rotated),
  ];
  const isDrawAnimationState = hasDrawAnimationState(rotated);
  const previousPendingZhuHide = isPendingZhuHideState(previousGs);
  const resolvedDrawChoiceQueue = buildResolvedDrawChoiceQueue(rotated, previousGs, logDelta, buildAnimQueue);
  if (resolvedDrawChoiceQueue?.length) {
    const queue = appendFinalStatePatch(
      resolvedDrawChoiceQueue,
      rotated,
      ['players', 'deck', 'discard', 'log', 'phase', 'drawReveal', 'abilityData'],
    );
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue,
      visualLock: {
        players: previousGs?.players || null,
        zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
      },
    });
  }
  const resolvedGodChoiceDiscardStep = buildResolvedGodChoiceDiscardStep(rotated, previousGs, logDelta);
  if (resolvedGodChoiceDiscardStep) {
    const queue = appendFinalStatePatch(
      [resolvedGodChoiceDiscardStep],
      rotated,
      ['players', 'discard', 'log', 'phase', 'abilityData'],
    );
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue,
      visualLock: {
        players: previousGs?.players || null,
        zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
      },
    });
  }
  const resolvedGodChoiceCard = getPendingGodChoiceCard(previousGs);
  if (resolvedGodChoiceCard && rotated.phase !== 'GOD_CHOICE') {
    // The previous sync already displayed the drawn god card before the
    // decision modal opened. A later decision sync must replay only its new
    // effects, never the original card draw and background camera.
    const decisionQueue = bindAnimLogChunks(
      buildAnimQueue(previousGs, rotated).filter(step => !(step?.type === 'DRAW_CARD' && isSameCard(step.card, resolvedGodChoiceCard))),
      { statLogs: logDelta },
    );
    if (decisionQueue.length) {
      const queue = appendFinalStatePatch(
        decisionQueue,
        rotated,
        ['players', 'discard', 'log', 'phase', 'abilityData'],
      );
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.ANIM_QUEUE,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(rotated),
        queue,
        visualLock: {
          players: previousGs?.players || null,
          zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
        },
      });
    }
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.SET_STATE,
      gs: clearRemoteReplayHints(rotated),
    });
  }
  const endlessCorridorReplayEvent = getEndlessCorridorReplayVisualEvent(rotated);
  if (endlessCorridorReplayEvent) {
    const endlessCorridorQueue = [...(endlessCorridorReplayEvent.queue || [])];
    if (endlessCorridorQueue.length && (Array.isArray(endlessCorridorReplayEvent.beforePlayers) || Array.isArray(endlessCorridorReplayEvent.beforeDiscard))) {
      endlessCorridorQueue[0] = {
        ...endlessCorridorQueue[0],
        visualSetupTiming: 'queueStart',
        visualSetupPatch: {
          ...(endlessCorridorQueue[0].visualSetupPatch || {}),
          ...(Array.isArray(endlessCorridorReplayEvent.beforePlayers) ? { players: endlessCorridorReplayEvent.beforePlayers } : {}),
          ...(Array.isArray(endlessCorridorReplayEvent.beforeDiscard) ? { discard: endlessCorridorReplayEvent.beforeDiscard } : {}),
          ...(endlessCorridorReplayEvent.zhuLight ? { zhuLight: endlessCorridorReplayEvent.zhuLight } : {}),
        },
      };
    }
    const isTurnEndCthDecisionDraw = !!(rotated.drawReveal?.fromRest || rotated.abilityData?.fromRest);
    // _endTurnReplay 存在即"无尽通道进行中"（currentTurn 仍是行动方，回合尚未结束）。Phase C 把 CTH 与无尽通道
    // 拆成两段广播后，通道起始态带 _endTurnReplay 但还没有 fromEndTurnReplay 决策标记——若不在此拦住，远端会
    // 误把它当成回合末事件、附加下家回合开场动画而抢跑。通道真正结束走 finishEndTurnSeq→applyNextTurnGs（_endTurnReplay 已清空）才前进。
    const isEndTurnReplayDecisionDraw = !!(rotated.drawReveal?.fromEndTurnReplay || rotated.abilityData?.fromEndTurnReplay || rotated._endTurnReplay);
    const replay = buildTurnStartDrawReplayQueue({
      oldGs: previousGs,
      newGs: rotated,
      timedOutDrawDiscardStep,
      preTurnSteps,
      buildQueue: buildAnimQueue,
      buildFullHandSwapTransferQueue: buildFullHandSwapTransferQueueFromLogs,
      effectOldGs: { ...rotated, players: rotated._playersBeforeThisDraw || previousGs?.players || rotated.players, log: getTurnStartDrawBaselineLog(rotated) },
    });
    const tailQueue = replay.drawnCard && !isTurnEndCthDecisionDraw && !isEndTurnReplayDecisionDraw ? replay.queue : [];
    const finalFields = replay.drawnCard
      ? ['players', 'discard', 'log', 'phase', 'abilityData', 'currentTurn', 'drawReveal']
      : ['players', 'discard', 'log', 'phase', 'abilityData', 'currentTurn', 'drawReveal'];
    const queue = appendFinalStatePatch(
      [...endlessCorridorQueue, ...tailQueue],
      rotated,
      finalFields,
    );
    if (queue.length) {
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.ANIM_QUEUE,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(rotated),
        queue,
        visualLock: {
          ...(replay.visualLock || {}),
          ...(Array.isArray(endlessCorridorReplayEvent.beforePlayers) ? { players: endlessCorridorReplayEvent.beforePlayers } : {}),
          ...(endlessCorridorReplayEvent.zhuLight ? { zhuLight: endlessCorridorReplayEvent.zhuLight } : {}),
        },
        inspectionEvents: replay.inspectionEvents,
      });
    }
  }
  const hasCthRestDraws = Array.isArray(rotated._cthRestDraws) && rotated._cthRestDraws.length > 0;
  const isCthRestDraw = rotated.drawReveal?.fromRest || rotated.abilityData?.fromRest;
  if (hasCthRestDraws || isCthRestDraw) {
    const queue = [];
    const cthDreamTargetPid = rotated.drawReveal?.drawerIdx ?? rotated.abilityData?.drawerIdx ?? 0;
    const cthDreamMsgs = rotated._cthRestDrawLogs || rotated._drawLogs || [];
    if (hasCthRestDraws) {
      queue.push(...rotated._cthRestDraws.map(card => ({
        type: 'DRAW_CARD',
        card,
        triggerName: localDisplayName(0, rotated.players?.[0]?.name),
        targetPid: 0,
        msgs: rotated._cthRestDrawLogs?.filter(l => l.includes(card.name) || l.includes(card.key)) || [],
      })));
    }
    if (isCthRestDraw) {
      const isGodChoice = rotated.phase === 'GOD_CHOICE';
      const card = isGodChoice ? rotated.abilityData?.godCard : rotated.drawReveal?.card;
      const drawerIdx = isGodChoice ? (rotated.abilityData?.drawerIdx ?? 0) : (rotated.drawReveal?.drawerIdx ?? 0);
      const drawerName = rotated.players?.[drawerIdx]?.name || '???';
      const msgs = isGodChoice ? rotated._drawLogs : (rotated._drawLogs || []);
      if (card) {
        queue.push({
          type: 'DRAW_CARD',
          card,
          triggerName: localDisplayName(drawerIdx, drawerName),
          targetPid: drawerIdx,
          msgs: Array.isArray(msgs) ? msgs.filter(Boolean) : [],
        });
      }
    }
    if (queue.some(step => step?.type === 'DRAW_CARD')) {
      queue.unshift({
        type: 'CTH_RLYEH_DREAM',
        targetPid: cthDreamTargetPid,
        msgs: Array.isArray(cthDreamMsgs) ? cthDreamMsgs.filter(Boolean) : [],
      });
    }
    const pendingGs = {
      ...rotated,
      _cthRestDraws: null,
      _cthRestDrawLogs: null,
      _playersBeforeCthDraws: null,
    };
    const patchedQueue = appendFinalStatePatch(
      queue,
      pendingGs,
      ['players', 'deck', 'discard', 'log', 'currentTurn', 'phase', 'drawReveal', 'abilityData'],
    );
    if (patchedQueue.length) {
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.ANIM_QUEUE,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(pendingGs),
        queue: patchedQueue,
      });
    }
  }
  if (isPendingZhuHideState(rotated)) {
    return withConsumedVisualEvents(buildZhuHideWaitAction(rotated, previousGs));
  }
  const treasureDodgeQueue = buildTreasureDodgeResolutionReplay({
    previousGs,
    rotated,
    logDelta,
    buildAnimQueue,
  });
  if (treasureDodgeQueue?.length) {
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue: treasureDodgeQueue,
      visualLock: { players: previousGs?.players || rotated.players },
    });
  }
  if (!isDrawAnimationState && hasFreshRandomTargetEvents(rotated, previousGs)) {
    const oldGs = previousGs || buildMaskedActionState(rotated);
    const replay = buildRandomTargetReplay({ oldGs, newGs: rotated, logDelta, buildAnimQueue, copyPlayers });
    if (replay.queue.length) {
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.ANIM_QUEUE,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(rotated),
        queue: replay.queue,
        inspectionEvents: replay.inspectionEvents,
      });
    }
  }
  const lastLog = rotated.log?.[rotated.log.length - 1] || '';
  const moldyMatch = lastLog.match(/^【霉变食物】(.+?) 掷出 (\d+) 点（(双数|单数)）/);
  const isMoldyFoodDiceRoll = moldyMatch && !rotated.gameOver && rotated.phase === 'ACTION';
  if (isMoldyFoodDiceRoll) {
    const rollerName = moldyMatch[1];
    const d1 = parseInt(moldyMatch[2], 10);
    const isSelf = rollerName === '你' || rollerName === localDisplayName(0, rotated.players?.[0]?.name);
    return {
      type: MP_REMOTE_REPLAY.DICE_ROLL,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: rotated,
      anim: {
        type: 'DICE_ROLL',
        diceMode: 'moldyFood',
        d1,
        d2: 0,
        heal: 0,
        rollerName: isSelf ? '你' : rollerName,
        negativeAvoided: /负面效果已规避/.test(lastLog),
      },
    };
  }
  const diceMatch = lastLog.match(/(.+?) 掷出 (\d+) 点/);
  const isDiceRoll = diceMatch && !rotated.gameOver && rotated.phase === 'ACTION';
  if (isDiceRoll) {
    const rollerName = diceMatch[1];
    const d1 = parseInt(diceMatch[2], 10);
    const isSelf = rollerName === '你' || rollerName === localDisplayName(0, rotated.players?.[0]?.name);
    return {
      type: MP_REMOTE_REPLAY.DICE_ROLL,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: rotated,
      anim: {
        type: 'DICE_ROLL',
        d1,
        d2: 0,
        heal: 0,
        rollerName: isSelf ? '你' : rollerName,
        dodgeSuccess: d1 >= 4,
      },
    };
  }
  const swapEvent = getSwapCardsVisualEvent(rotated);
  if (swapEvent && isFreshActionReplayEvent(swapEvent, logDelta)) {
    // 本地玩家（旋转后座位 0）未参与的掉包不向本地观众暴露牌面，
    // 飞行动画一律以背面展示
    const hideSwapCards = swapEvent.sourceIdx !== 0 && swapEvent.targetIdx !== 0;
    const swapBeforePlayers = swapEvent.beforePlayers || previousGs?.players || null;
    const swapBeforeDiscard = swapEvent.beforeDiscard || previousGs?.discard || null;
    const swapLandingPatch = Array.isArray(swapEvent.afterPlayers)
      ? [finalStatePatch({
          players: swapEvent.afterPlayers,
          discard: swapEvent.afterDiscard || swapBeforeDiscard || rotated.discard,
        }, ['players', 'discard'])]
      : [];
    const queue = withApophisTargetReplay([
      { type: 'SKILL_SWAP', msgs: swapEvent.msgs || logDelta },
      ...swapCardsSteps({
        sourceIdx: swapEvent.sourceIdx,
        targetIdx: swapEvent.targetIdx,
        sourceCount: swapEvent.sourceCount || 1,
        targetCount: swapEvent.targetCount || 1,
        takenCard: hideSwapCards ? null : (swapEvent.takenCard || null),
        givenCard: hideSwapCards ? null : (swapEvent.givenCard || null),
        msgs: swapEvent.msgs || logDelta,
        playersBefore: swapBeforePlayers,
        zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
      }),
      ...swapLandingPatch,
      ...handLimitDiscardSteps,
      finalStatePatch(
        { ...rotated, drawReveal: null },
        ['players', 'discard', 'log', 'drawReveal', 'phase', 'abilityData'],
      ),
    ], previousGs, rotated, buildAnimQueue);
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints({ ...rotated, drawReveal: null }),
      queue,
      visualLock: {
        players: swapBeforePlayers,
        zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
      },
    });
  }
  const huntResultEvent = getHuntResultVisualEvent(rotated);
  if (huntResultEvent && isFreshActionReplayEvent(huntResultEvent, logDelta)) {
    const queue = appendFinalStatePatch(
      withApophisTargetReplay(
        buildAiHuntEventAnimQueue(huntResultEvent, rotated.players?.[huntResultEvent.hunterIdx]?.name || '???'),
        previousGs,
        rotated,
        buildAnimQueue,
      ),
      rotated,
      ['players', 'discard', 'log', 'phase', 'abilityData'],
    );
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue,
      visualLock: {
        players: huntResultEvent.beforePlayers || previousGs?.players || null,
        zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
      },
    });
  }
  const sphinxResultEvent = getSphinxResultVisualEvent(rotated);
  // A sphinx result is an explicit public reveal event. It may share one
  // state-sync packet with a later turn/draw boundary, so log freshness must
  // not suppress it. Event ids are pruned above and provide replay dedupe.
  if (sphinxResultEvent) {
    const statQueue = sphinxResultEvent.guessCorrect
      ? []
      : bindAnimLogChunks(
        buildAnimQueue(previousGs || buildMaskedActionState(rotated), rotated),
        { statLogs: sphinxResultEvent.msgs || logDelta },
      );
    const resultQueue = buildSphinxResultQueue({
      card: sphinxResultEvent.card,
      actorIdx: sphinxResultEvent.actorIdx,
      guessCorrect: !!sphinxResultEvent.guessCorrect,
      msgs: sphinxResultEvent.msgs || logDelta,
      resultQueue: statQueue,
    });
    const queue = appendFinalStatePatch(
      withApophisTargetReplay(resultQueue, previousGs, rotated, buildAnimQueue),
      rotated,
      ['players', 'deck', 'discard', 'log', 'phase', 'abilityData'],
    );
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue,
      visualLock: {
        players: previousGs?.players || null,
        zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
      },
    });
  }
  const bewitchEvent = getBewitchGiftVisualEvent(rotated);
  if (bewitchEvent && !isDrawAnimationState && isFreshBewitchReplayEvent(bewitchEvent, logDelta)) {
    const oldGs = previousGs || buildMaskedActionState(rotated);
    const replay = buildBewitchGiftReplay({
      oldGs,
      newGs: rotated,
      bewitchEvent,
      logDelta,
      visualStatQueue: buildStatStepsFromVisualEvents(rotated, previousGs?.players || rotated.players),
      buildAnimQueue,
      copyPlayers,
    });
    const queue = withApophisTargetReplay(replay.queue, previousGs, rotated, buildAnimQueue);
    const patchedQueue = appendFinalStatePatch(queue, rotated);
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue: patchedQueue,
      inspectionEvents: replay.inspectionEvents,
    });
  }
  const huntEvent = getHuntTargetVisualEvent(rotated);
  if (huntEvent && !isDrawAnimationState && rotated.phase !== 'PLAYER_REVEAL_FOR_HUNT') {
    const baseStep = { type: 'SKILL_HUNT', msgs: huntEvent.msgs || logDelta, targetIdx: huntEvent.targetIdx };
    const queue = withApophisTargetReplay([baseStep], previousGs, rotated, buildAnimQueue);
    if (queue.length <= 1 && queue[0] === baseStep) {
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.START_ANIM,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(rotated),
        anim: baseStep,
        queue: [],
      });
    }
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue,
    });
  }
  const huntRevealEvent = getHuntRevealVisualEvent(rotated);
  if (huntRevealEvent && !isDrawAnimationState) {
    const revealStep = buildHuntRevealStepFromVisualEvent(huntRevealEvent, rotated);
    if (!revealStep) {
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.SET_STATE,
        gs: clearRemoteReplayHints(rotated),
      });
    }
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      anim: { ...revealStep, msgs: revealStep.msgs?.length ? revealStep.msgs : logDelta },
      queue: [],
    });
  }
  const bewitchMsg = findFreshBewitchReplayLog(logDelta);
  if (bewitchMsg && !isDrawAnimationState) {
    const targetName = bewitchMsg.match(/对 (.+?) 【蛊惑】/)?.[1];
    const targetIdx = targetName ? rotated.players?.findIndex(p => p?.name === targetName) : -1;
    const giftLabel = bewitchMsg.match(/赠予 \[([^\]]+)\]/)?.[1] || bewitchMsg.match(/赠予 ([^，。]+)/)?.[1];
    const giftCard = findCardByLabel(rotated.players, giftLabel);
    const oldGs = previousGs || buildMaskedActionState(rotated);
    const replay = giftCard && targetIdx >= 0
      ? buildBewitchGiftReplay({
        oldGs,
        newGs: rotated,
        bewitchEvent: {
          sourceIdx: rotated.currentTurn,
          targetIdx,
          targetName: rotated.players?.[targetIdx]?.name,
          card: giftCard,
          msgs: logDelta,
        },
        logDelta,
        buildAnimQueue,
        copyPlayers,
      })
      : buildInspectionReplay(oldGs, rotated, { buildAnimQueue, copyPlayers });
    const statQueue = giftCard && targetIdx >= 0
      ? replay.statQueue
      : bindAnimLogChunks(replay.queue, { statLogs: logDelta });
    const queue = giftCard && targetIdx >= 0
      ? replay.queue
      : [{ type: 'SKILL_BEWITCH', msgs: logDelta, targetIdx: targetIdx >= 0 ? targetIdx : 1 }, ...statQueue];
    const patchedQueue = appendFinalStatePatch(withApophisTargetReplay(queue, previousGs, rotated, buildAnimQueue), rotated);
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue: patchedQueue,
      inspectionEvents: replay.inspectionEvents,
    });
  }
  const cardEffectSteps = !isDrawAnimationState
    ? buildCardEffectStepsFromVisualEvents(rotated, previousGs, event => isFreshActionReplayEvent(event, logDelta))
    : [];
  if (cardEffectSteps.length) {
    const queue = appendFinalStatePatch(
      withApophisTargetReplay(cardEffectSteps, previousGs, rotated, buildAnimQueue),
      rotated,
      ['players', 'discard', 'log', 'phase', 'abilityData'],
    );
    if (queue.length) {
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.ANIM_QUEUE,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(rotated),
        queue,
      });
    }
  }

  // 强制收入的牌（如地动山摇）摸到后 drawReveal.card 会在本回合一直残留（needsDecision:false, phase:ACTION），
  // 使 hasDrawAnimationState 持续为真。必须叠加 hasFreshTurnDrawReplayState（要求本次同步带有回合开始/摸牌日志）
  // 才认定为「新摸牌」，否则后续无视觉事件的行动（如放弃追捕）会被误判为回合首抽而重播「XX的回合」+翻牌。
  const nonSelfDraw = hasDrawAnimationState(rotated) && hasFreshTurnDrawReplayState(rotated) && !isLocalCurrentTurn(rotated);
  if (nonSelfDraw && !isLocalSeatIndex(rotated.drawReveal?.drawerIdx ?? rotated.currentTurn)) {
    const beforeDrawPlayers = rotated._playersBeforeThisDraw || previousGs?.players || rotated.players;
    const replay = buildTurnStartDrawReplayQueue({
      oldGs: previousGs,
      newGs: rotated,
      timedOutDrawDiscardStep,
      preTurnSteps,
      buildQueue: buildAnimQueue,
      buildFullHandSwapTransferQueue: buildFullHandSwapTransferQueueFromLogs,
      effectOldGs: { ...rotated, players: beforeDrawPlayers, log: getTurnStartDrawBaselineLog(rotated) },
    });
    if (!replay.drawnCard) return { type: MP_REMOTE_REPLAY.SET_STATE, gs: rotated };
    const queue = previousPendingZhuHide
      ? [replay.drawCardStep, ...replay.drawEffectQ]
      : [...replay.queue];
    const patchedQueue = replay.drawEffectQ.length
      ? appendFinalStatePatch(queue, rotated, ['players', 'discard'])
      : queue;
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue: patchedQueue,
      visualLock: replay.visualLock,
      inspectionEvents: replay.inspectionEvents,
    });
  }

  const localDraw = hasDrawAnimationState(rotated) && hasFreshTurnDrawReplayState(rotated) && isLocalCurrentTurn(rotated);
  if (localDraw) {
    const beforeDrawPlayers = rotated._playersBeforeThisDraw || previousGs?.players || rotated.players;
    const replay = buildTurnStartDrawReplayQueue({
      oldGs: previousGs,
      newGs: rotated,
      timedOutDrawDiscardStep,
      preTurnSteps,
      buildQueue: buildAnimQueue,
      buildFullHandSwapTransferQueue: buildFullHandSwapTransferQueueFromLogs,
      effectOldGs: { ...previousGs, players: beforeDrawPlayers },
    });
    if (!replay.drawnCard) return { type: MP_REMOTE_REPLAY.SET_STATE, gs: rotated };
    if (previousPendingZhuHide) {
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.START_ANIM,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(rotated),
        anim: replay.drawCardStep,
        queue: replay.drawEffectQ,
        visualLock: replay.visualLock,
        inspectionEvents: replay.inspectionEvents,
      });
    }
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      anim: replay.startAnim,
      queue: replay.startQueue,
      visualLock: replay.visualLock,
      inspectionEvents: replay.inspectionEvents,
    });
  }

  const isHuntingPlayer0 = !rotated.gameOver && rotated.phase === 'PLAYER_REVEAL_FOR_HUNT' && rotated.abilityData?.huntingAI != null;
  if (isHuntingPlayer0) {
    return {
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      anim: { type: 'SKILL_HUNT', msgs: rotated.log.slice(-3), targetIdx: 0 },
      queue: [],
    };
  }

  if (rotated.phase === 'DISCARD_PHASE' && !isLocalCurrentTurn(rotated)) {
    return {
      type: MP_REMOTE_REPLAY.SET_STATE,
      gs: clearRemoteReplayHints({ ...rotated, phase: 'ACTION', abilityData: {} }),
    };
  }

  // 两人一绳建立链条：本地触发方在选目标时已显式注入 CARD_TRANSFER 飞行动画（App.jsx damageLinkSelectTarget），
  // 远端没有对应 _visualEvents，需按日志增量重建，否则只有触发方看得到链条发动特效
  const damageLinkEstablishMsg = logDelta.find(m => (
    typeof m === 'string' && m.includes('【两人一绳】') && m.includes('间架起链条')
  ));
  if (damageLinkEstablishMsg && !isDrawAnimationState) {
    const damageLinkPair = (rotated.players || []).flatMap((player, idx) => {
      const partnerIdx = player?.damageLink?.partner;
      if (!player?.damageLink?.active || partnerIdx == null || partnerIdx <= idx) return [];
      const partner = rotated.players[partnerIdx];
      if (!partner?.damageLink?.active || partner.damageLink.partner !== idx) return [];
      return [{ fromPid: idx, toPid: partnerIdx }];
    })[0] || {};
    const queue = appendFinalStatePatch(
      [cardTransferStep({ ...damageLinkPair, effect: 'damageLink', durationMs: 1900, msgs: [damageLinkEstablishMsg] })],
      rotated,
      ['players', 'discard', 'log', 'phase', 'abilityData'],
    );
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue,
      // 飞行期间锁定建立前的 players，避免常驻链条抢在发动动画之前出现
      visualLock: { players: previousGs?.players || null },
    });
  }

  if (!isDrawAnimationState) {
    const replay = buildInspectionReplay(previousGs || buildMaskedActionState(rotated), rotated, { buildAnimQueue, copyPlayers });
    const replayQueue = replay.inspectionEvents.length
      ? replay.queue
      : bindAnimLogChunks(replay.queue, { statLogs: logDelta });
    if (replayQueue.length) {
      const queue = appendFinalStatePatch(
        replayQueue,
        rotated,
        ['players', 'discard', 'log', 'phase', 'abilityData'],
      );
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.ANIM_QUEUE,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(rotated),
        queue,
        inspectionEvents: replay.inspectionEvents,
      });
    }
  }

  return withConsumedVisualEvents({
    type: MP_REMOTE_REPLAY.SET_STATE,
    gs: clearRemoteReplayHints(rotated),
  });
}
