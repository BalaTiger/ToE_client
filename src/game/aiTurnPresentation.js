const EXECUTION_ONLY_FIELDS = [
  '_aiDrawnCard',
  '_aiName',
  '_playersBeforeNextDraw',
  '_aiHuntEvents',
  '_playersBeforeSkillAction',
  '_preSkillLogs',
  '_preSkillDiscard',
  '_animAiDrawnCard',
  '_animDiscardedDrawnCard',
  '_animMultiplyEvent',
  '_animSphinxReveal',
  '_aiTurnIntroShown',
  '_aiTurnDiscardShown',
];

const PRESENTATION_ONLY_FIELDS = [
  ...EXECUTION_ONLY_FIELDS,
  '_playersBeforeEndTurnReplay',
  '_discardBeforeEndTurnReplay',
  '_cthRestDraws',
  '_cthRestDrawLogs',
  '_playersBeforeCthDraws',
  '_aiHandLimitDiscards',
  '_aiHandLimitBeforePlayers',
  '_aiHandLimitBeforeDiscard',
  '_aiHandLimitBeforeLog',
];

function omitFields(value, fields) {
  const result = { ...value };
  fields.forEach(field => {
    delete result[field];
  });
  return result;
}

export function stripAiExecutionFields(rawResult) {
  return omitFields(rawResult, EXECUTION_ONLY_FIELDS);
}

export function stripAiPresentationFields(rawResult) {
  return omitFields(rawResult, PRESENTATION_ONLY_FIELDS);
}

export function clearPendingAnimDeathPlayers(players) {
  return (players || []).map(player =>
    player?._pendingAnimDeath
      ? { ...player, _pendingAnimDeath: false }
      : player
  );
}

export function finalizeAiPresentationState(state) {
  if (!state) return state;
  return {
    ...state,
    players: clearPendingAnimDeathPlayers(state.players),
  };
}

export function buildRoseThornSnapshot(players) {
  return (players || []).map((player, idx) => ({
    idx,
    marked: [
      ...(player?.hand || [])
        .filter(card => card?.roseThornHolderId === idx)
        .map(card => card.id),
      ...(player?.godZone || [])
        .filter(card => card?.roseThornHolderId === idx)
        .map(card => card.id),
    ].filter(id => id != null),
  }));
}

export function collectExplicitAiTurnLogs(state, queue) {
  return [
    ...(state?._turnStartLogs || []),
    ...(state?._drawLogs || []),
    ...(state?._statLogs || []),
    ...(queue || []).flatMap(step => Array.isArray(step?.msgs) ? step.msgs : []),
  ];
}

export function buildAiHuntWaitPresentation({
  previousState,
  rawResult,
  nextState,
  isDrawnCardActuallyDiscarded,
  buildActorTurnStartReplay,
  buildTurnStartIntroQueue,
}) {
  const oldLog = Array.isArray(previousState.log) ? previousState.log : [];
  const nextLog = Array.isArray(nextState.log) ? nextState.log : oldLog;
  const { currentTurnLogs } = splitTransitionLogs(oldLog, nextLog);
  const actorName = previousState.players?.[previousState.currentTurn]?.name || '???';
  const hasTurnStartDraw = !!previousState._playersBeforeThisDraw;
  const shouldReplayTurnStart = hasTurnStartDraw && !previousState._aiTurnIntroShown;
  const drawnCard = hasTurnStartDraw
    ? (
        rawResult._animAiDrawnCard
        ?? rawResult._aiDrawnCard
        ?? previousState._aiDrawnCard
        ?? previousState._drawnCard
        ?? null
      )
    : null;
  const discardedDrawnCard = hasTurnStartDraw
    ? isDrawnCardActuallyDiscarded(rawResult, drawnCard)
    : false;
  const fakeState = (players, log = previousState.log) => ({
    ...previousState,
    players,
    log,
    _statEvents: previousState._statEvents || [],
    _statEventSeq: previousState._statEventSeq || 0,
  });
  const queue = [];
  const externalVisualLocks = [];
  const drawBaselineLog = getTurnStartDrawBaselineLog(previousState);
  const turnStartReplay = shouldReplayTurnStart
    ? buildActorTurnStartReplay(previousState, {
        oldGs: {
          ...previousState,
          players: previousState._playersBeforeThisDraw,
          log: drawBaselineLog,
        },
        effectOldGs: {
          ...previousState,
          players: previousState._playersBeforeThisDraw,
          log: drawBaselineLog,
        },
        actorName,
        forceActorName: true,
      })
    : null;
  const usedTurnStartReplay = !!turnStartReplay?.queue?.length;

  if (usedTurnStartReplay) {
    if (turnStartReplay.visualLock) {
      externalVisualLocks.push(turnStartReplay.visualLock);
    }
    queue.push(...turnStartReplay.queue);
  } else if (!previousState._aiTurnIntroShown) {
    queue.push(...buildTurnStartIntroQueue(previousState, actorName));
  }

  if (!usedTurnStartReplay && !previousState._aiTurnIntroShown && drawnCard) {
    queue.push({
      type: 'DRAW_CARD',
      card: drawnCard,
      triggerName: actorName,
      targetPid: previousState.currentTurn,
      msgs: previousState._drawLogs,
    });
  }

  if (!usedTurnStartReplay && !previousState._aiTurnIntroShown && previousState._playersBeforeThisDraw && drawnCard) {
    const drawFullHandSwapQueue = buildFullHandSwapTransferQueueFromLogs(
      [
        ...(previousState._drawLogs || []),
        ...(previousState._statLogs || []),
      ],
      previousState._playersBeforeThisDraw
    );
    const drawEffectQueueBase = bindAnimLogChunks(
      buildAnimQueue(
        fakeState(previousState._playersBeforeThisDraw, drawBaselineLog),
        previousState
      ),
      { statLogs: previousState._statLogs }
    );
    const drawEffectQueue = drawFullHandSwapQueue.length
      ? [
          ...drawFullHandSwapQueue,
          ...drawEffectQueueBase.filter(step => step.type !== 'CARD_TRANSFER'),
        ]
      : drawEffectQueueBase;
    queue.push(...drawEffectQueue);
    if (drawEffectQueue.length) {
      externalVisualLocks.push({
        players: previousState._playersBeforeThisDraw,
        zhuLight: previousState.zhuLight || null,
      });
      queue.push(statePatchStep({
        players: previousState.players,
        discard: discardedDrawnCard
          ? removeCardsFromDiscard(previousState.discard, [drawnCard])
          : previousState.discard,
      }));
    }
  }

  if (
    !usedTurnStartReplay
    && !previousState._aiTurnDiscardShown
    && discardedDrawnCard
    && drawnCard
  ) {
    queue.push({
      type: 'DISCARD',
      card: drawnCard,
      triggerName: actorName,
      targetPid: previousState.currentTurn,
    });
    queue.push(statePatchStep({
      players: previousState.players,
      discard: previousState.discard,
    }));
  }

  const newMessages = nextLog.slice(oldLog.length);
  const fullHandSwapQueue = buildFullHandSwapTransferQueueFromLogs(
    newMessages,
    previousState.players,
    {
      playersBefore: rawResult._playersBeforeSkillAction || previousState.players,
      zhuLight: previousState.zhuLight || null,
    }
  );
  const huntEventQueue = (rawResult._aiHuntEvents || []).flatMap(event =>
    buildAiHuntEventAnimQueue(event, actorName)
  );
  const consumedApophisTargetSeq = Math.max(
    0,
    ...(rawResult._aiHuntEvents || [])
      .map(event => event?.apophisTargetEvent?.seq || 0)
      .filter(Boolean)
  );
  const actionBaselinePlayers = rawResult._playersBeforeSkillAction
    || previousState.players;
  const actionOldState = consumedApophisTargetSeq
    ? {
        ...previousState,
        players: actionBaselinePlayers,
        _apophisTargetSeq: Math.max(
          previousState._apophisTargetSeq || 0,
          consumedApophisTargetSeq
        ),
      }
    : { ...previousState, players: actionBaselinePlayers };
  const actionStatQueueBase = buildAnimQueue(
    actionOldState,
    fakeState(nextState.players, nextLog)
  );
  const hasRoseThornGiftAllHand = newMessages.some(message =>
    typeof message === 'string'
    && message.includes('【玫瑰倒刺】')
    && message.includes('将全部手牌交给了')
  );
  const actionStatQueue = fullHandSwapQueue.length
    ? [
        ...fullHandSwapQueue,
        ...actionStatQueueBase.filter(step => step.type !== 'CARD_TRANSFER'),
      ]
    : hasRoseThornGiftAllHand
      ? actionStatQueueBase.filter(step => step.type !== 'CARD_TRANSFER')
      : actionStatQueueBase;

  if (rawResult._playersBeforeSkillAction) {
    queue.push(statePatchStep({
      players: rawResult._playersBeforeSkillAction,
      discard: rawResult._preSkillDiscard || nextState.discard,
      msgs: rawResult._preSkillLogs || [],
    }));
    queue.push({
      type: 'VISUAL_LOCK',
      players: rawResult._playersBeforeSkillAction,
      zhuLight: previousState.zhuLight || null,
    });
    queue.push({ type: 'TURN_BOUNDARY_PAUSE' });
  }

  const hasFullHandSwap = newMessages.some(message =>
    typeof message === 'string' && message.includes('交换了全部手牌')
  );
  if (huntEventQueue.length) {
    if (hasFullHandSwap) {
      const statTypes = new Set([
        'GUILLOTINE',
        'DEATH',
        'HP_DAMAGE',
        'HP_HEAL',
        'SAN_HEAL',
        'HP_SAN_HEAL',
        'SAN_DAMAGE',
      ]);
      const huntStatHitSet = new Set(
        huntEventQueue.flatMap(step =>
          statTypes.has(step.type) ? (step.hitIndices || []) : []
        )
      );
      queue.push(
        ...actionStatQueue.filter(step =>
          !(
            statTypes.has(step.type)
            && (step.hitIndices || []).some(index => huntStatHitSet.has(index))
          )
        ),
        ...huntEventQueue
      );
    } else {
      queue.push(
        ...getAiPreHuntActionSteps(
          actionStatQueue,
          newMessages,
          huntEventQueue
        ),
        ...huntEventQueue
      );
    }
  } else if (actionStatQueue.length) {
    queue.push(...actionStatQueue);
  }

  const explicitCurrentLogs = collectExplicitAiTurnLogs(previousState, queue);
  const residualLogs = subtractLogOccurrences(
    currentTurnLogs,
    explicitCurrentLogs
  );

  return {
    queue: appendAnimLogChunkToQueueEnd(queue, residualLogs),
    nextState: finalizeAiPresentationState(nextState),
    roseThornSnapshot: buildRoseThornSnapshot(nextState.players),
    externalVisualLocks,
    shouldMaskDiscardedTurnDraw: usedTurnStartReplay,
  };
}

export function buildAiTurnRecoveryState({
  snapshot,
  error,
  stage,
  startNextTurn,
  skillUsed = false,
}) {
  const suffix = error?.message ? `（${error.message}）` : '';
  const actorName = snapshot?.players?.[snapshot.currentTurn]?.name || '该AI';
  const stageText = stage === 'presentation' ? '动画结算异常' : '回合处理异常';
  const safeLog = [
    ...(Array.isArray(snapshot?.log) ? snapshot.log : []),
    `${actorName} 的${stageText}${suffix}，系统强制结束其回合`,
  ];
  return startNextTurn({
    ...snapshot,
    log: safeLog,
    currentTurn: snapshot.currentTurn,
    skillUsed,
    restUsed: false,
    huntAbandoned: [],
  });
}
import {
  buildAiHuntEventAnimQueue,
  buildAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
  getAiPreHuntActionSteps,
} from './animQueueCore';
import { statePatchStep } from './animQueueHelpers';
import {
  appendAnimLogChunkToQueueEnd,
  bindAnimLogChunks,
  splitTransitionLogs,
  subtractLogOccurrences,
} from './animLogs';
import { removeCardsFromDiscard } from './coreUtils';
import { getTurnStartDrawBaselineLog } from './turnAnimState';
