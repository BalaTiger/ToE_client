import { bindAnimLogChunks } from './animLogs';
import { buildBewitchForcedCardQueue, fullHandSwapSteps, statePatchStep } from './animQueueHelpers';
import { cardLogText } from './coreUtils';
import { isLocalCurrentTurn, isLocalSeatIndex, localDisplayName } from './rotateState';
import {
  buildDrawCardStepFromVisualEvents,
  buildStatStepsFromVisualEvents,
  buildTimedOutDrawDiscardStepFromVisualEvents,
  buildTurnStartStepFromVisualEvents,
  clearVisualEvents,
  getVisualEventIdsFromState,
  getBewitchGiftVisualEvent,
  getSwapCardsVisualEvent,
  getHuntRevealVisualEvent,
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

export function getTurnStartDrawBaselineLog(state) {
  const log = Array.isArray(state?.log) ? state.log : [];
  const animatedLogCount = [
    ...(state?._turnStartLogs || []),
    ...(state?._drawLogs || []),
    ...(state?._statLogs || []),
  ].length;
  return animatedLogCount > 0 ? log.slice(0, Math.max(0, log.length - animatedLogCount)) : log;
}

function getDrawnCard(state) {
  return state?.phase === 'GOD_CHOICE'
    ? state.abilityData?.godCard
    : state?.drawReveal?.card;
}

function hasDrawAnimationState(state) {
  if (state?.gameOver) return false;
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

function buildMaskedActionState(state) {
  return { ...state, phase: 'ACTION', drawReveal: null, abilityData: {} };
}

function clearRemoteReplayHints(state) {
  return state ? clearVisualEvents({ ...state, _mpTimedOutDrawDiscard: null }) : state;
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

function hasDrawStatEvidence(state, visualStatQ = []) {
  return visualStatQ.length > 0 || (Array.isArray(state?._statLogs) && state._statLogs.length > 0);
}

function filterFallbackDrawEffects(queue, state, visualStatQ = []) {
  return hasDrawStatEvidence(state, visualStatQ)
    ? queue
    : queue.filter(step => !isStatAnimationStep(step));
}

function buildDrawEffectQueue({
  rotated,
  previousGs,
  buildAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
}) {
  const beforeDrawPlayers = rotated._playersBeforeThisDraw || previousGs?.players || rotated.players;
  const drawFullHandSwapQ = buildFullHandSwapTransferQueueFromLogs(
    [...(rotated._drawLogs || []), ...(rotated._statLogs || [])],
    beforeDrawPlayers,
  );
  const drawEffectQBase = bindAnimLogChunks(
    buildAnimQueue({ ...rotated, players: beforeDrawPlayers, log: getTurnStartDrawBaselineLog(rotated) }, rotated),
    { statLogs: rotated._statLogs },
  );
  const visualStatQ = buildStatStepsFromVisualEvents(rotated, beforeDrawPlayers);
  const filteredDrawEffectQBase = filterFallbackDrawEffects(drawEffectQBase, rotated, visualStatQ);
  const drawEffectQWithVisualStats = visualStatQ.length
    ? [...visualStatQ, ...filteredDrawEffectQBase.filter(step => !isStatAnimationStep(step))]
    : filteredDrawEffectQBase;
  const drawEffectQ = drawFullHandSwapQ.length
    ? [...drawFullHandSwapQ, ...drawEffectQWithVisualStats.filter(step => step.type !== 'CARD_TRANSFER')]
    : drawEffectQWithVisualStats;
  return { beforeDrawPlayers, drawEffectQ };
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
  const isDrawAnimationState = hasDrawAnimationState(rotated);
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
  if (bewitchEvent && !isDrawAnimationState) {
    const fallbackStatQueue = bindAnimLogChunks(
      buildAnimQueue(previousGs || buildMaskedActionState(rotated), rotated),
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
    const targetIdx = huntRevealEvent.targetIdx ?? rotated.abilityData?.huntTi ?? 1;
    const targetName = rotated.players?.[targetIdx]?.name || huntRevealEvent.targetName || '对方';
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      anim: {
        type: 'DRAW_CARD',
        card: huntRevealEvent.card,
        triggerName: localDisplayName(targetIdx, targetName),
        targetPid: targetIdx,
        skipTravel: true,
        msgs: huntRevealEvent.msgs || logDelta,
      },
      queue: [],
    });
  }
  const bewitchMsg = logDelta.find(line => /【蛊惑】/.test(line || ''));
  if (bewitchMsg && !isDrawAnimationState) {
    const targetName = bewitchMsg.match(/对 (.+?) 【蛊惑】/)?.[1];
    const targetIdx = targetName ? rotated.players?.findIndex(p => p?.name === targetName) : -1;
    const giftLabel = bewitchMsg.match(/赠予 \[([^\]]+)\]/)?.[1] || bewitchMsg.match(/赠予 ([^，。]+)/)?.[1];
    const giftCard = findCardByLabel(rotated.players, giftLabel);
    const statQueue = bindAnimLogChunks(
      buildAnimQueue(previousGs || buildMaskedActionState(rotated), rotated),
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
    const drawnCard = getDrawnCard(rotated);
    if (!drawnCard) return { type: MP_REMOTE_REPLAY.SET_STATE, gs: rotated };
    const drawerPid = rotated.currentTurn;
    const drawerName = rotated.players?.[drawerPid]?.name || '???';
    const turnStartStep = buildTurnStartStepFromVisualEvents(rotated) || { type: 'YOUR_TURN', name: drawerName, msgs: rotated._turnStartLogs };
    const drawCardStep = buildDrawCardStepFromVisualEvents(rotated) || { type: 'DRAW_CARD', card: drawnCard, triggerName: drawerName, targetPid: drawerPid, msgs: rotated._drawLogs };
    const { beforeDrawPlayers, drawEffectQ } = buildDrawEffectQueue({
      rotated,
      previousGs,
      buildAnimQueue,
      buildFullHandSwapTransferQueueFromLogs,
    });
    const queue = [
      ...(timedOutDrawDiscardStep ? [timedOutDrawDiscardStep] : []),
      turnStartStep,
      drawCardStep,
      ...drawEffectQ,
    ];
    if (drawEffectQ.length) queue.push(statePatchStep({ players: rotated.players, discard: rotated.discard }));
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue,
      visualLock: rotated._playersBeforeThisDraw
        ? { players: beforeDrawPlayers, zhuLight: previousGs?.zhuLight || rotated.zhuLight || null }
        : null,
    });
  }

  const localDraw = hasDrawAnimationState(rotated) && isLocalCurrentTurn(rotated);
  if (localDraw) {
    const drawnCard = getDrawnCard(rotated);
    if (!drawnCard) return { type: MP_REMOTE_REPLAY.SET_STATE, gs: rotated };
    const turnStartStep = buildTurnStartStepFromVisualEvents(rotated) || { type: 'YOUR_TURN', msgs: rotated._turnStartLogs };
    const drawCardStep = buildDrawCardStepFromVisualEvents(rotated) || { type: 'DRAW_CARD', card: drawnCard, triggerName: '你', targetPid: 0, msgs: rotated._drawLogs };
    const visualStatQ = buildStatStepsFromVisualEvents(rotated, rotated._playersBeforeThisDraw || previousGs?.players || rotated.players);
    const fallbackEffectQ = bindAnimLogChunks(
      buildAnimQueue({ ...previousGs, players: rotated._playersBeforeThisDraw || previousGs?.players }, rotated),
      { statLogs: rotated._statLogs },
    );
    const filteredFallbackEffectQ = filterFallbackDrawEffects(fallbackEffectQ, rotated, visualStatQ);
    const drawEffectQ = visualStatQ.length
      ? [...visualStatQ, ...filteredFallbackEffectQ.filter(step => !isStatAnimationStep(step))]
      : filteredFallbackEffectQ;
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      anim: timedOutDrawDiscardStep || turnStartStep,
      queue: [
        ...(timedOutDrawDiscardStep ? [turnStartStep] : []),
        drawCardStep,
        ...drawEffectQ,
      ],
      visualLock: rotated._playersBeforeThisDraw
        ? { players: rotated._playersBeforeThisDraw, zhuLight: previousGs?.zhuLight || rotated.zhuLight || null }
        : null,
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
      gs: { ...rotated, phase: 'ACTION', abilityData: {} },
    };
  }

  return withConsumedVisualEvents({ type: MP_REMOTE_REPLAY.SET_STATE, gs: rotated });
}
