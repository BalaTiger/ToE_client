import { bindAnimLogChunks, isDrawLikeLog, isTurnStartLog } from './animLogs';
import { buildBewitchForcedCardQueue, buildInspectionAwareAnimQueue, fullHandSwapSteps, statePatchStep } from './animQueueHelpers';
import { cardLogText, copyPlayers } from './coreUtils';
import { isLocalCurrentTurn, isLocalSeatIndex, localDisplayName } from './rotateState';
import {
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
  getBewitchGiftVisualEvent,
  getSwapCardsVisualEvent,
  getHuntRevealVisualEvent,
  buildHuntRevealStepFromVisualEvent,
  getHuntTargetVisualEvent,
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

function buildZhuHideWaitAction(rotated) {
  const drawerPid = getTurnStartDrawerIdx(rotated);
  const drawerName = rotated?.players?.[drawerPid]?.name || '???';
  if (!Array.isArray(rotated?._turnStartLogs) || !rotated._turnStartLogs.length) {
    return { type: MP_REMOTE_REPLAY.SET_STATE, gs: clearRemoteReplayHints(rotated) };
  }
  return {
    type: MP_REMOTE_REPLAY.START_ANIM,
    maskedGs: buildMaskedActionState(rotated),
    pendingGs: clearRemoteReplayHints(rotated),
    anim: {
      type: 'YOUR_TURN',
      ...(drawerPid === 0 ? {} : { name: drawerName }),
      msgs: rotated._turnStartLogs,
    },
    queue: [],
  };
}

function buildMaskedActionState(state) {
  return { ...state, phase: 'ACTION', drawReveal: null, abilityData: {} };
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

function isStatAnimationStep(step) {
  if (!step) return false;
  if (Array.isArray(step.statEvents) && step.statEvents.length) return true;
  if (['HP_DAMAGE', 'HP_HEAL', 'SAN_DAMAGE', 'SAN_HEAL', 'HP_SAN_HEAL'].includes(step.type)) return true;
  if (step.type === 'STATE_PATCH' && Array.isArray(step._logChunk) && step._logChunk.length) return true;
  if (step.type === 'TURN_BOUNDARY_PAUSE') return true;
  return false;
}

function isLaterDrawBoundaryLog(line) {
  return (
    isTurnStartLog(line) ||
    isDrawLikeLog(line) ||
    /摸到|收入了/.test(line || '')
  );
}

function findFreshBewitchLog(logDelta = []) {
  const logs = Array.isArray(logDelta) ? logDelta : [];
  let idx = -1;
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (/【蛊惑】/.test(logs[i] || '')) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const laterLogs = logs.slice(idx + 1);
  const crossedIntoLaterDraw = laterLogs.some(isLaterDrawBoundaryLog);
  return crossedIntoLaterDraw ? null : logs[idx];
}

function isFreshBewitchVisualEvent(event, logDelta = []) {
  const logs = Array.isArray(logDelta) ? logDelta : [];
  const eventMsgs = Array.isArray(event?.msgs) ? event.msgs.filter(Boolean) : [];
  let eventIdx = -1;
  if (eventMsgs.length) {
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      if (eventMsgs.includes(logs[i])) {
        eventIdx = i;
        break;
      }
    }
  }
  if (eventIdx >= 0) {
    return !logs.slice(eventIdx + 1).some(isLaterDrawBoundaryLog);
  }
  return !logs.some(isLaterDrawBoundaryLog);
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
  if (hadVisualEventsBeforePrune && visualEventIds.length === 0 && !hasDrawAnimationState(rotated)) {
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

  const lastLog = rotated.log?.[rotated.log.length - 1] || '';
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

  const logDelta = getLogDelta(previousGs, rotated);
  const timedOutDrawDiscardStep = buildTimedOutDrawDiscardStep(rotated, previousGs, logDelta);
  const handLimitDiscardSteps = buildHandLimitDiscardStepsFromVisualEvents(rotated);
  const isDrawAnimationState = hasDrawAnimationState(rotated);
  const previousPendingZhuHide = isPendingZhuHideState(previousGs);
  if (isPendingZhuHideState(rotated)) {
    return withConsumedVisualEvents(buildZhuHideWaitAction(rotated));
  }
  const swapEvent = getSwapCardsVisualEvent(rotated);
  if (swapEvent) {
    const queue = [
      { type: 'SKILL_SWAP', msgs: swapEvent.msgs || logDelta },
      ...fullHandSwapSteps({
        fromPid: swapEvent.sourceIdx,
        toPid: swapEvent.targetIdx,
        fromCount: swapEvent.sourceCount || 1,
        toCount: swapEvent.targetCount || 1,
        msgs: swapEvent.msgs || logDelta,
        playersBefore: previousGs?.players || null,
        zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
      }),
      statePatchStep({ players: rotated.players, discard: rotated.discard, log: rotated.log, drawReveal: null, phase: rotated.phase, abilityData: rotated.abilityData }),
    ];
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints({ ...rotated, drawReveal: null }),
      queue,
    });
  }
  const bewitchEvent = getBewitchGiftVisualEvent(rotated);
  if (bewitchEvent && !isDrawAnimationState && isFreshBewitchVisualEvent(bewitchEvent, logDelta)) {
    const oldGs = previousGs || buildMaskedActionState(rotated);
    const fallbackStatQueue = bindAnimLogChunks(
      buildInspectionAwareAnimQueue(oldGs, rotated, { buildAnimQueue, copyPlayers }).queue,
      { statLogs: logDelta },
    );
    const visualStatQ = buildStatStepsFromVisualEvents(rotated, previousGs?.players || rotated.players);
    const statQueue = visualStatQ.length
      ? [...visualStatQ, ...fallbackStatQueue.filter(step => !isStatAnimationStep(step))]
      : fallbackStatQueue;
    const queue = buildBewitchForcedCardQueue(
      bewitchEvent.sourceIdx ?? rotated.currentTurn,
      bewitchEvent.targetIdx,
      bewitchEvent.card,
      bewitchEvent.targetName || rotated.players?.[bewitchEvent.targetIdx]?.name,
      statQueue,
      bewitchEvent.msgs || logDelta,
    );
    if (queue.length) queue.push(statePatchStep({ players: rotated.players, discard: rotated.discard, log: rotated.log }));
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue,
    });
  }
  const huntEvent = getHuntTargetVisualEvent(rotated);
  if (huntEvent && !isDrawAnimationState && rotated.phase !== 'PLAYER_REVEAL_FOR_HUNT') {
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      anim: { type: 'SKILL_HUNT', msgs: huntEvent.msgs || logDelta, targetIdx: huntEvent.targetIdx },
      queue: [],
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
  const bewitchMsg = findFreshBewitchLog(logDelta);
  if (bewitchMsg && !isDrawAnimationState) {
    const targetName = bewitchMsg.match(/对 (.+?) 【蛊惑】/)?.[1];
    const targetIdx = targetName ? rotated.players?.findIndex(p => p?.name === targetName) : -1;
    const giftLabel = bewitchMsg.match(/赠予 \[([^\]]+)\]/)?.[1] || bewitchMsg.match(/赠予 ([^，。]+)/)?.[1];
    const giftCard = findCardByLabel(rotated.players, giftLabel);
    const oldGs = previousGs || buildMaskedActionState(rotated);
    const statQueue = bindAnimLogChunks(
      buildInspectionAwareAnimQueue(oldGs, rotated, { buildAnimQueue, copyPlayers }).queue,
      { statLogs: logDelta },
    );
    const queue = giftCard && targetIdx >= 0
      ? buildBewitchForcedCardQueue(rotated.currentTurn, targetIdx, giftCard, rotated.players?.[targetIdx]?.name, statQueue, logDelta)
      : [{ type: 'SKILL_BEWITCH', msgs: logDelta, targetIdx: targetIdx >= 0 ? targetIdx : 1 }, ...statQueue];
    if (queue.length) queue.push(statePatchStep({ players: rotated.players, discard: rotated.discard, log: rotated.log }));
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue,
    });
  }

  const nonSelfDraw = hasDrawAnimationState(rotated) && !isLocalCurrentTurn(rotated);
  if (nonSelfDraw && !isLocalSeatIndex(rotated.drawReveal?.drawerIdx ?? rotated.currentTurn)) {
    const beforeDrawPlayers = rotated._playersBeforeThisDraw || previousGs?.players || rotated.players;
    const replay = buildTurnStartDrawReplayQueue({
      oldGs: previousGs,
      newGs: rotated,
      timedOutDrawDiscardStep,
      preTurnSteps: handLimitDiscardSteps,
      buildQueue: buildAnimQueue,
      buildFullHandSwapTransferQueue: buildFullHandSwapTransferQueueFromLogs,
      effectOldGs: { ...rotated, players: beforeDrawPlayers, log: getTurnStartDrawBaselineLog(rotated) },
    });
    if (!replay.drawnCard) return { type: MP_REMOTE_REPLAY.SET_STATE, gs: rotated };
    const queue = previousPendingZhuHide
      ? [replay.drawCardStep, ...replay.drawEffectQ]
      : [...replay.queue];
    if (replay.drawEffectQ.length) queue.push(statePatchStep({ players: rotated.players, discard: rotated.discard }));
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue,
      visualLock: replay.visualLock,
    });
  }

  const localDraw = hasDrawAnimationState(rotated) && isLocalCurrentTurn(rotated);
  if (localDraw) {
    const beforeDrawPlayers = rotated._playersBeforeThisDraw || previousGs?.players || rotated.players;
    const replay = buildTurnStartDrawReplayQueue({
      oldGs: previousGs,
      newGs: rotated,
      timedOutDrawDiscardStep,
      preTurnSteps: handLimitDiscardSteps,
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
      });
    }
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      anim: replay.startAnim,
      queue: replay.startQueue,
      visualLock: replay.visualLock,
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

  return withConsumedVisualEvents({
    type: MP_REMOTE_REPLAY.SET_STATE,
    gs: clearRemoteReplayHints(rotated),
  });
}
