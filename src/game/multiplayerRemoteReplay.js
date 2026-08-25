import { bindAnimLogChunks } from './animLogs';
import { mergeApophisTargetQueue } from './apophisAnimQueue';
import { cardTransferStep, prepareWorshipHighlight } from './animQueueHelpers';
import {
  buildInspectionReplay,
  buildRandomTargetReplay,
  hasFreshRandomTargetEvents,
  isFreshActionReplayEvent,
  isFreshBewitchReplayEvent,
} from './animReplayEvents';
import { appendFinalStatePatch, finalStatePatch } from './animStatePatch';
import { isLocalCurrentTurn, isLocalSeatIndex, localDisplayName } from './rotateState';
import {
  compileFreshBewitchVisualTransaction,
  compileFreshHuntVisualTransaction,
  compileFreshSwapVisualTransaction,
} from './identitySkillVisualTransaction';
import {
  buildTurnStartPreDrawEffectQueue,
  buildSkippedTurnReplayQueue,
  buildTsathogguaSlimeGrantQueue,
  buildTurnStartDrawReplayQueue,
  getTurnStartDrawBaselineLog,
  getTurnStartDrawerIdx,
  withClearedReplayAnimFields,
} from './turnAnimState';
import {
  clearVisualEvents,
  getVisualEventIdsFromState,
  getCardEffectVisualEvents,
  getBewitchGiftVisualEvent,
  getSwapCardsVisualEvent,
  getSphinxResultVisualEvent,
  getAnimTransactionVisualEvent,
  VISUAL_EVENT,
  pruneConsumedVisualEvents,
} from './visualEvents';
import {
  ANIMATION_QUEUE_AUTHORITY,
  compileFreshVisualEventQueue as compileCanonicalVisualEventQueue,
  compileFreshVisualEventsToAnimSteps,
  compileRuleVisualEventsToAnimTransaction,
  compileVisualEventToAnimSteps,
  compileVisualEventToAnimTransaction,
} from './visualEventTransactionCompiler';

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
    // A kept "Bottom Bounce" drawn by Tsathoggua slime immediately leaves
    // DRAW_REVEAL and waits for its full-hand-swap target.  It is still part
    // of the turn-start draw presentation, so remote viewers must replay the
    // turn banner and this extra draw before the later fixed draw arrives.
    || (
      state.phase === 'ZONE_SWAP_SELECT_TARGET'
      && state.abilityData?.fromTsathogguaSlime
      && (state._drawnCard || state._aiDrawnCard || state.abilityData?.zoneSwapCard)
    )
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
  const skippedTurnQueue = buildSkippedTurnReplayQueue(rotated, { bannersOnly: true });
  if (!Array.isArray(rotated?._turnStartLogs) || !rotated._turnStartLogs.length) {
    if (skippedTurnQueue.length) {
      return {
        type: MP_REMOTE_REPLAY.ANIM_QUEUE,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(rotated),
        queue: skippedTurnQueue,
      };
    }
    return { type: MP_REMOTE_REPLAY.SET_STATE, gs: clearRemoteReplayHints(rotated) };
  }
  const preDrawQueue = buildTurnStartPreDrawEffectQueue({ oldGs: previousGs, newGs: rotated });
  const turnStartAnim = {
    type: 'YOUR_TURN',
    ...(drawerPid === 0 ? {} : { name: drawerName }),
    msgs: rotated._turnStartLogs,
  };
  if (skippedTurnQueue.length) {
    return {
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue: [...skippedTurnQueue, turnStartAnim, ...preDrawQueue],
    };
  }
  return {
    type: MP_REMOTE_REPLAY.START_ANIM,
    maskedGs: buildMaskedActionState(rotated),
    pendingGs: clearRemoteReplayHints(rotated),
    anim: turnStartAnim,
    queue: preDrawQueue,
  };
}

function buildMaskedActionState(state) {
  return { ...state, phase: 'ACTION', drawReveal: null, abilityData: {} };
}

function withApophisTargetReplay(queue = [], previousGs, rotated, compileFreshVisualEventQueue) {
  return mergeApophisTargetQueue(queue, previousGs || buildMaskedActionState(rotated), rotated, compileFreshVisualEventQueue);
}

function clearRemoteReplayHints(state) {
  return state ? withClearedReplayAnimFields(clearVisualEvents({ ...state, _mpTimedOutDrawDiscard: null })) : state;
}

function compileRemoteStateEffects(rotated, previousGs, compileFreshVisualEventQueue, excludedTypes = []) {
  const transaction = compileRuleVisualEventsToAnimTransaction(rotated, previousGs, {
    compileFreshVisualEventQueue,
    hidePrivateCards: true,
  });
  const excluded = new Set(excludedTypes);
  const canonicalQueue = (transaction?.queue || []).filter(step => !excluded.has(step?.type));
  return canonicalQueue;
}

function prepareExactTransactionQueue(event) {
  const exactQueue = [...(event?.queue || [])];
  if (!exactQueue.length) return [];
  if (Array.isArray(event.beforePlayers) || Array.isArray(event.beforeDiscard)) {
    exactQueue[0] = {
      ...exactQueue[0],
      visualSetupTiming: 'queueStart',
      visualSetupPatch: {
        ...(exactQueue[0].visualSetupPatch || {}),
        ...(Array.isArray(event.beforePlayers) ? { players: event.beforePlayers } : {}),
        ...(Array.isArray(event.beforeDiscard) ? { discard: event.beforeDiscard } : {}),
        ...(event.zhuLight ? { zhuLight: event.zhuLight } : {}),
      },
    };
  }
  return exactQueue;
}

function buildExactAnimTransactionReplayAction(events, rotated, previousGs, compileFreshVisualEventQueue) {
  const exactEvents = (Array.isArray(events) ? events : [events]).filter(event => (
    event?.type === VISUAL_EVENT.ANIM_TRANSACTION && Array.isArray(event.queue) && event.queue.length
  ));
  if (!exactEvents.length) return null;

  const transactionIds = exactEvents.map(event => event.id).filter(Boolean);
  const coveredEventIds = new Set(exactEvents.flatMap(event => event.coveredEventIds || []));
  const exactEventIds = new Set(transactionIds);
  const uncoveredEvents = (Array.isArray(rotated?._visualEvents) ? rotated._visualEvents : []).filter(event => (
    event?.id && !exactEventIds.has(event.id) && !coveredEventIds.has(event.id)
  ));
  const uncoveredTransactions = uncoveredEvents.map(event => ({
    event,
    transaction: compileVisualEventToAnimTransaction(event, rotated, previousGs, {
      compileFreshVisualEventQueue,
      logDelta: getLogDelta(previousGs, rotated),
    }),
  }));
  const compiledUncovered = uncoveredTransactions.filter(item => item.transaction?.queue?.length);
  const uncompiledEventIds = uncoveredTransactions
    .filter(item => !item.transaction?.queue?.length)
    .map(item => item.event.id);
  const explicitTailQueue = compiledUncovered.flatMap(item => item.transaction.queue);
  const consumedVisualEventIds = [...new Set([
    ...transactionIds,
    ...coveredEventIds,
    ...compiledUncovered.flatMap(item => item.transaction.eventIds || [item.event.id]),
  ].filter(Boolean))];
  const exactQueue = exactEvents.flatMap(prepareExactTransactionQueue);
  if (uncoveredEvents.length && import.meta.env?.DEV) {
    console.warn('[animTransaction] uncovered visual events will replay after the exact queue', {
      transactionIds,
      uncoveredEventIds: uncoveredEvents.map(event => event.id),
      uncompiledEventIds,
    });
  }

  return {
    type: MP_REMOTE_REPLAY.ANIM_QUEUE,
    queueAuthority: ANIMATION_QUEUE_AUTHORITY.QUEUE,
    maskedGs: buildMaskedActionState(rotated),
    pendingGs: clearRemoteReplayHints(rotated),
    queue: appendFinalStatePatch(
      [...exactQueue, ...explicitTailQueue],
      rotated,
      ['players', 'discard', 'log', 'phase', 'abilityData', 'currentTurn', 'drawReveal'],
    ),
    consumedVisualEventIds,
    ...(uncoveredEvents.length ? { uncoveredVisualEventIds: uncoveredEvents.map(event => event.id) } : {}),
    ...(uncompiledEventIds.length ? { uncompiledVisualEventIds: uncompiledEventIds } : {}),
    visualLock: {
      ...(Array.isArray(exactEvents[0].beforePlayers) ? { players: exactEvents[0].beforePlayers } : {}),
      ...(exactEvents[0].zhuLight ? { zhuLight: exactEvents[0].zhuLight } : {}),
    },
  };
}

function getLogDelta(previousGs, rotated) {
  const prevLog = Array.isArray(previousGs?.log) ? previousGs.log : [];
  const nextLog = Array.isArray(rotated?.log) ? rotated.log : [];
  let start = 0;
  while (start < prevLog.length && start < nextLog.length && prevLog[start] === nextLog[start]) start += 1;
  return nextLog.slice(start);
}

function buildTreasureDodgeResolutionReplay({ previousGs, rotated, compileFreshVisualEventQueue }) {
  if (!['TREASURE_DODGE_DECISION', 'TREASURE_AOE_DODGE_DECISION'].includes(previousGs?.phase)) return null;
  const previousIds = new Set(getVisualEventIdsFromState(previousGs));
  const resultEvent = (rotated?._visualEvents || []).find(event => (
    event?.type === VISUAL_EVENT.DICE_RESULT
    && event?.id
    && !previousIds.has(event.id)
    && (event?.mode === 'treasureDodge' || event?.mode === 'treasureAoeDodge')
  ));
  if (!resultEvent) return null;

  const drawerIdx = previousGs.drawReveal?.drawerIdx
    ?? previousGs.abilityData?.drawerIdx
    ?? previousGs.currentTurn
    ?? 0;
  const card = previousGs.drawReveal?.card || null;
  const d1 = Number(resultEvent.d1);
  const effectQueue = compileRemoteStateEffects(
    rotated,
    previousGs,
    compileFreshVisualEventQueue,
    ['DRAW_CARD', 'DICE_ROLL'],
  );
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
      rollerName: resultEvent.actorName || localDisplayName(drawerIdx, rotated.players?.[drawerIdx]?.name || '该玩家'),
      dodgeSuccess: !!resultEvent.dodgeSuccess,
      msgs: resultEvent.msgs || [],
    }, ...effectQueue, ...(transferStep ? [transferStep] : [])],
    rotated,
    ['players', 'deck', 'discard', 'log', 'phase', 'drawReveal', 'abilityData'],
  );
}

function buildTimedOutDrawDiscardStep(rotated, previousGs) {
  const visualEventStep = compileFreshVisualEventsToAnimSteps(rotated, null, [VISUAL_EVENT.TIMED_OUT_DRAW_DISCARD])[0];
  if (visualEventStep) return visualEventStep;
  return compileFreshVisualEventsToAnimSteps(rotated, previousGs, [VISUAL_EVENT.TIMED_OUT_DRAW_DISCARD])[0] || null;
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

function prepareRemoteWorshipFromHandQueue(queue, rotated, logDelta) {
  const worshipMsg = (logDelta || []).find(line => (
    typeof line === 'string'
    && line.includes('从手牌')
    && (line.includes('信仰') || line.includes('改信'))
  ));
  if (!worshipMsg) return queue;
  const targetPid = (rotated?.players || []).findIndex(player => (
    player?.godName && player?.name && worshipMsg.includes(player.name)
  ));
  if (targetPid < 0) return queue;
  return prepareWorshipHighlight(queue, {
    targetPid,
    godKey: rotated.players[targetPid].godName,
    players: rotated.players,
    msgs: [worshipMsg],
  });
}

function buildResolvedGodChoiceDiscardStep(rotated, previousGs) {
  return compileFreshVisualEventsToAnimSteps(
    rotated,
    previousGs,
    [VISUAL_EVENT.GOD_GIFT_DISCARD],
  )[0] || null;
}

function buildResolvedDrawChoiceQueue(rotated, previousGs, logDelta, compileFreshVisualEventQueue) {
  const previousDraw = previousGs?.drawReveal;
  const card = previousDraw?.card;
  if (previousGs?.phase !== 'DRAW_REVEAL' || !card || !previousDraw.needsDecision || previousDraw.forcedKeep || rotated?.drawReveal?.card) return null;
  const drawerIdx = previousDraw.drawerIdx ?? previousGs.currentTurn ?? 0;
  const drawerName = previousDraw.drawerName || previousGs.players?.[drawerIdx]?.name || rotated.players?.[drawerIdx]?.name || '???';
  const inHand = (rotated.players?.[drawerIdx]?.hand || []).some(candidate => isSameCard(candidate, card));
  const inDiscard = (rotated.discard || []).some(candidate => isSameCard(candidate, card));
  if (!inHand && !inDiscard) return null;
  const effectQueue = compileRemoteStateEffects(rotated, previousGs, compileFreshVisualEventQueue);
  const resolutionStep = inHand
    ? cardTransferStep({
        fromPid: drawerIdx,
        dest: 'player',
        toPid: drawerIdx,
        count: 1,
        sourceAnchor: 'playerArea',
        effect: 'draw',
        cards: [card],
        msgs: [],
      })
    : {
        type: 'DISCARD',
        card,
        triggerName: localDisplayName(drawerIdx, drawerName),
        targetPid: drawerIdx,
        msgs: [],
      };
  return [resolutionStep, ...effectQueue];
}

export function buildMpRemoteReplayAction({
  rotated,
  previousGs,
  roleRevealed,
  compileFreshVisualEventQueue = compileCanonicalVisualEventQueue,
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
  const withConsumedVisualEvents = action => {
    // Remote replay planning has already compiled state-only visual events and
    // assembled any stage/state-patch tail. Playback must execute that exact
    // result instead of compiling the same state a second time.
    const plannedAction = [MP_REMOTE_REPLAY.ANIM_QUEUE, MP_REMOTE_REPLAY.START_ANIM]
      .includes(action?.type)
      ? { ...action, queueAuthority: ANIMATION_QUEUE_AUTHORITY.QUEUE }
      : action;
    const actionEventIds = Array.isArray(action?.consumedVisualEventIds)
      ? action.consumedVisualEventIds
      : visualEventIds;
    return actionEventIds.length
      ? { ...plannedAction, consumedVisualEventIds: actionEventIds }
      : plannedAction;
  };
  if (!roleRevealed && !rotated.gameOver) {
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ROLE_REVEAL,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: rotated,
      role: rotated.players?.[0]?.role,
    });
  }

  // Exact transactions are already fully ordered by the rule/orchestration
  // layer. They always take precedence over every state-diff compatibility
  // branch, including resolved draw and god-choice inference.
  const exactTransactionAction = buildExactAnimTransactionReplayAction(
    (rotated._visualEvents || []).filter(event => event?.type === VISUAL_EVENT.ANIM_TRANSACTION),
    rotated,
    previousGs,
    compileFreshVisualEventQueue,
  );
  if (exactTransactionAction) return withConsumedVisualEvents(exactTransactionAction);

  const previousVisualEventIds = new Set(getVisualEventIdsFromState(previousGs));
  const freshGodGiftKeepEvent = (rotated._visualEvents || []).find(event => (
    event?.type === VISUAL_EVENT.GOD_GIFT_KEEP
    && event?.id
    && !previousVisualEventIds.has(event.id)
  ));
  if (freshGodGiftKeepEvent) {
    const transaction = compileRuleVisualEventsToAnimTransaction(rotated, previousGs, {
      compileFreshVisualEventQueue,
      hidePrivateCards: true,
    });
    if (transaction?.queue?.length) {
      const queue = appendFinalStatePatch(
        transaction.queue,
        rotated,
        ['players', 'deck', 'discard', 'log', 'phase', 'drawReveal', 'abilityData'],
      );
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.ANIM_QUEUE,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(rotated),
        queue,
        visualLock: {
          players: freshGodGiftKeepEvent.playersBefore || previousGs?.players || null,
          zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
        },
        consumedVisualEventIds: transaction.eventIds,
      });
    }
  }

  const logDelta = getLogDelta(previousGs, rotated);
  const timedOutDrawDiscardStep = buildTimedOutDrawDiscardStep(rotated, previousGs);
  const handLimitDiscardSteps = compileFreshVisualEventsToAnimSteps(rotated, null, [VISUAL_EVENT.HAND_LIMIT_DISCARD]);
  const preTurnSteps = [
    ...handLimitDiscardSteps,
    ...buildTsathogguaSlimeGrantQueue(rotated),
  ];
  const isDrawAnimationState = hasDrawAnimationState(rotated);
  const previousPendingZhuHide = isPendingZhuHideState(previousGs);
  const resolvedDrawChoiceQueue = buildResolvedDrawChoiceQueue(rotated, previousGs, logDelta, compileFreshVisualEventQueue);
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
  const resolvedGodChoiceDiscardStep = buildResolvedGodChoiceDiscardStep(rotated, previousGs);
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
      compileRemoteStateEffects(rotated, previousGs, compileFreshVisualEventQueue)
        .filter(step => !(step?.type === 'DRAW_CARD' && isSameCard(step.card, resolvedGodChoiceCard))),
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
  const animTransactionEvent = getAnimTransactionVisualEvent(rotated);
  if (animTransactionEvent) {
    const endlessCorridorReplayEvent = animTransactionEvent;
    const isExactTransaction = animTransactionEvent.type === 'animTransaction';
    const endlessCorridorQueue = [...(animTransactionEvent.queue || [])];
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
      buildQueue: compileFreshVisualEventQueue,
      buildFullHandSwapTransferQueue: buildFullHandSwapTransferQueueFromLogs,
      effectOldGs: { ...rotated, players: rotated._playersBeforeThisDraw || previousGs?.players || rotated.players, log: getTurnStartDrawBaselineLog(rotated) },
    });
    const tailQueue = !isExactTransaction && replay.drawnCard && !isTurnEndCthDecisionDraw && !isEndTurnReplayDecisionDraw ? replay.queue : [];
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
    const shouldPlayDream = !rotated._cthDreamShown
      && ((isCthRestDraw && !rotated.abilityData?.cthDreamShown)
        || (hasCthRestDraws && queue.some(step => step?.type === 'DRAW_CARD')));
    if (shouldPlayDream) {
      queue.unshift({
        type: 'CTH_RLYEH_DREAM',
        targetPid: cthDreamTargetPid,
        msgs: Array.isArray(cthDreamMsgs) ? cthDreamMsgs.filter(Boolean) : [],
      });
    }
    const pendingGs = {
      ...rotated,
      ...(shouldPlayDream ? { _cthDreamShown: true } : {}),
      ...(shouldPlayDream ? {
        abilityData: {
          ...(rotated.abilityData || {}),
          cthDreamPending: undefined,
          cthDreamShown: true,
        },
      } : {}),
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
    compileFreshVisualEventQueue,
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
    const replay = buildRandomTargetReplay({ oldGs, newGs: rotated, logDelta });
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
    const swapReplay = compileFreshSwapVisualTransaction(rotated, previousGs, {
      hidePrivateCards: hideSwapCards,
    });
    const swapLandingPatch = Array.isArray(swapEvent.afterPlayers)
      ? [finalStatePatch({
          players: swapEvent.afterPlayers,
          discard: swapEvent.afterDiscard || swapBeforeDiscard || rotated.discard,
        }, ['players', 'discard'])]
      : [];
    const queue = [
      ...(swapReplay?.transaction?.queue || []),
      ...swapLandingPatch,
      ...handLimitDiscardSteps,
      finalStatePatch(
        { ...rotated, drawReveal: null },
        ['players', 'discard', 'log', 'drawReveal', 'phase', 'abilityData'],
      ),
    ];
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints({ ...rotated, drawReveal: null }),
      queue,
      consumedVisualEventIds: swapReplay?.transaction?.eventIds || [],
      visualLock: {
        players: swapBeforePlayers,
        zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
      },
    });
  }
  const huntReplay = !isDrawAnimationState
    ? compileFreshHuntVisualTransaction(rotated, previousGs)
    : null;
  if (huntReplay) {
    const { transaction, freshHuntEvents } = huntReplay;
    if (
      freshHuntEvents.every(event => event.type === VISUAL_EVENT.HUNT_REVEAL)
      && freshHuntEvents.every(event => event.targetIdx === 0)
    ) {
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.SET_STATE,
        gs: clearRemoteReplayHints(rotated),
      });
    }
    if (transaction.queue.length) {
      const firstHuntEvent = freshHuntEvents[0];
      if (transaction.queue.length === 1) {
        return withConsumedVisualEvents({
          type: MP_REMOTE_REPLAY.START_ANIM,
          maskedGs: buildMaskedActionState(rotated),
          pendingGs: clearRemoteReplayHints(rotated),
          anim: transaction.queue[0],
          queue: [],
          consumedVisualEventIds: transaction.eventIds,
        });
      }
      const queue = appendFinalStatePatch(
        transaction.queue,
        rotated,
        ['players', 'discard', 'log', 'phase', 'abilityData'],
      );
      return withConsumedVisualEvents({
        type: MP_REMOTE_REPLAY.ANIM_QUEUE,
        maskedGs: buildMaskedActionState(rotated),
        pendingGs: clearRemoteReplayHints(rotated),
        queue,
        consumedVisualEventIds: transaction.eventIds,
        visualLock: {
          players: firstHuntEvent.beforePlayers || previousGs?.players || null,
          zhuLight: previousGs?.zhuLight || rotated.zhuLight || null,
        },
      });
    }
  }
  const sphinxResultEvent = getSphinxResultVisualEvent(rotated);
  // A sphinx result is an explicit public reveal event. It may share one
  // state-sync packet with a later turn/draw boundary, so log freshness must
  // not suppress it. Event ids are pruned above and provide replay dedupe.
  if (sphinxResultEvent) {
    const resultQueue = compileVisualEventToAnimSteps(sphinxResultEvent, rotated, previousGs || buildMaskedActionState(rotated), { compileFreshVisualEventQueue });
    const queue = appendFinalStatePatch(
      withApophisTargetReplay(resultQueue, previousGs, rotated, compileFreshVisualEventQueue),
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
    const bewitchReplay = compileFreshBewitchVisualTransaction(rotated, oldGs, {
      compileFreshVisualEventQueue,
    });
    const patchedQueue = appendFinalStatePatch(bewitchReplay?.transaction?.queue || [], rotated);
    return withConsumedVisualEvents({
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: clearRemoteReplayHints(rotated),
      queue: patchedQueue,
      consumedVisualEventIds: bewitchReplay?.transaction?.eventIds || [],
      inspectionEvents: bewitchReplay?.inspectionEvents || [],
    });
  }
  const previousCardEffectIds = new Set(getCardEffectVisualEvents(previousGs).map(event => event?.id).filter(Boolean));
  const cardEffectSteps = !isDrawAnimationState
    ? getCardEffectVisualEvents(rotated)
      .filter(event => event?.id && !previousCardEffectIds.has(event.id) && isFreshActionReplayEvent(event, logDelta))
      .flatMap(event => compileVisualEventToAnimSteps(event, rotated, previousGs))
    : [];
  if (cardEffectSteps.length) {
    const queue = appendFinalStatePatch(
      withApophisTargetReplay(cardEffectSteps, previousGs, rotated, compileFreshVisualEventQueue),
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
      buildQueue: compileFreshVisualEventQueue,
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
      buildQueue: compileFreshVisualEventQueue,
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

  if (rotated.phase === 'DISCARD_PHASE' && !isLocalCurrentTurn(rotated)) {
    return {
      type: MP_REMOTE_REPLAY.SET_STATE,
      gs: clearRemoteReplayHints({ ...rotated, phase: 'ACTION', abilityData: {} }),
    };
  }

  // 两人一绳建立链条：本地触发方在选目标时已显式注入 CARD_TRANSFER 飞行动画（App.jsx damageLinkSelectTarget），
  // 远端没有对应 _visualEvents，需按日志增量重建，否则只有触发方看得到链条发动特效
  const damageLinkEvent = (rotated._visualEvents || []).find(event => (
    event?.type === VISUAL_EVENT.CARD_MOVE && event?.effect === 'damageLink'
  ));
  if (damageLinkEvent && !isDrawAnimationState) {
    const queue = appendFinalStatePatch(
      compileVisualEventToAnimSteps(damageLinkEvent, rotated, previousGs),
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
    const inspectionBaseline = previousGs || buildMaskedActionState(rotated);
    const previousInspectionSeq = inspectionBaseline?._inspectionSeq || 0;
    const previousVisualEventIds = new Set((inspectionBaseline?._visualEvents || [])
      .map(event => event?.id).filter(Boolean));
    const hasFreshInspection = (rotated?._visualEvents || [])
      .some(event => event?.type === VISUAL_EVENT.INSPECTION
        && event?.id && !previousVisualEventIds.has(event.id));
    const replay = hasFreshInspection
      ? buildInspectionReplay(inspectionBaseline, rotated)
      : { queue: [], inspectionEvents: [], inspectionSeq: previousInspectionSeq };
    const rawReplayQueue = replay.inspectionEvents.length
      ? replay.queue
      : bindAnimLogChunks(
          compileRemoteStateEffects(rotated, previousGs || buildMaskedActionState(rotated), compileFreshVisualEventQueue),
          { statLogs: logDelta },
        );
    const replayQueue = prepareRemoteWorshipFromHandQueue(rawReplayQueue, rotated, logDelta);
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
