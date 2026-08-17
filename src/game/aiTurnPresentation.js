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

export function shouldBuildQueuedAiTurnStartReplay({
  nextState,
  fromTurn = null,
  isAiSeat,
  getTurnStartDrawnCard,
}) {
  if (!nextState) return false;
  if (!isAiSeat(nextState, nextState.currentTurn)) return false;
  if (fromTurn != null && nextState.currentTurn === fromTurn) return false;
  return !!(nextState._turnStartLogs || []).length
    || !!getTurnStartDrawnCard(nextState);
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

// aiStep may return the completed current action together with the already
// resolved next turn. Keep the latter's staged events out of the current
// action replay; they are presented by the queued turn-start transaction.
export function scopeAiActionReplayMetadata(state, {
  excludedVisualEventIds = null,
  excludedStatEventSeqs = null,
} = {}) {
  const visualEvents = Array.isArray(state?._visualEvents) ? state._visualEvents : [];
  const excludedVisualIds = new Set(excludedVisualEventIds instanceof Set
    ? [...excludedVisualEventIds]
    : (Array.isArray(excludedVisualEventIds) ? excludedVisualEventIds : []));
  const excludedStatSeqSet = new Set(excludedStatEventSeqs instanceof Set
    ? [...excludedStatEventSeqs]
    : (Array.isArray(excludedStatEventSeqs) ? excludedStatEventSeqs : []));
  const explicitlyExcludedEvents = visualEvents.filter(event => event?.id && excludedVisualIds.has(event.id));
  explicitlyExcludedEvents.forEach(event => {
    (Array.isArray(event?.statEvents) ? event.statEvents : []).forEach(statEvent => {
      if (statEvent?.seq != null) excludedStatSeqSet.add(statEvent.seq);
    });
  });
  const turnStartStatSeqs = new Set(
    visualEvents
      .filter(event => !!event?.turnStartStage)
      .flatMap(event => Array.isArray(event?.statEvents) ? event.statEvents : [])
      .map(event => event?.seq)
      .filter(seq => seq != null)
  );
  const actionVisualEvents = visualEvents.filter(event => (
    !event?.turnStartStage
    && (!event?.id || !excludedVisualIds.has(event.id))
  ));
  const actionStatEvents = (Array.isArray(state?._statEvents) ? state._statEvents : [])
    .filter(event => event?.seq == null || (
      !turnStartStatSeqs.has(event.seq)
      && !excludedStatSeqSet.has(event.seq)
    ));
  const actionStatEventSeq = actionStatEvents.reduce(
    (max, event) => Number.isFinite(event?.seq) ? Math.max(max, event.seq) : max,
    0
  );
  return {
    visualEvents: actionVisualEvents,
    statEvents: actionStatEvents,
    statEventSeq: actionStatEventSeq,
  };
}

// A chained hunt owns its own per-attempt snapshots.  The transaction before
// the first hunt must therefore stop at the rule-layer pre-skill snapshot;
// comparing the action start with the completed AI turn leaks later hunt
// discards into worship/rest animations and the first hunt then appears to
// "restore" those cards.
export function scopeAiPreHuntReplayMetadata(state, rawResult = {}) {
  const action = scopeAiActionReplayMetadata(state);
  const firstHuntEventIndex = action.visualEvents.findIndex(event => event?.type === 'huntResult');
  if (firstHuntEventIndex < 0) {
    return {
      ...action,
      players: state?.players || [],
      discard: state?.discard || [],
      hasHuntBoundary: false,
    };
  }

  const preHuntVisualEvents = action.visualEvents.slice(0, firstHuntEventIndex);
  const inspectionEvents = Array.isArray(state?._inspectionEvents) ? state._inspectionEvents : [];
  const huntOwnedInspectionSeqs = new Set(
    (rawResult?._aiHuntEvents || [])
      .flatMap(event => collectApophisInspectionChain(inspectionEvents, event))
      .map(event => event?.seq)
      .filter(seq => seq != null),
  );
  const visualEvents = preHuntVisualEvents.filter(event => {
    if (event?.type === 'apophisTarget') return false;
    return event?.type !== 'inspection' || !huntOwnedInspectionSeqs.has(event?.legacySeq);
  });
  const ownedStatSeqs = new Set(visualEvents.flatMap(event => [
    ...(Array.isArray(event?.statEvents) ? event.statEvents : []),
    ...(Array.isArray(event?.faithSettlement?.abandonedFollowers)
      ? event.faithSettlement.abandonedFollowers.flatMap(transition => {
          const before = Number(transition?.statEventSeqBefore);
          const after = Number(transition?.statEventSeqAfter);
          if (!Number.isFinite(before) || !Number.isFinite(after)) return [];
          return action.statEvents.filter(statEvent => (
            Number.isFinite(statEvent?.seq)
            && statEvent.seq > before
            && statEvent.seq <= after
          ));
        })
      : []),
    ...(() => {
      const transition = event?.faithSettlement?.previousFaithExit;
      const before = Number(transition?.statEventSeqBefore);
      const after = Number(transition?.statEventSeqAfter);
      if (!Number.isFinite(before) || !Number.isFinite(after)) return [];
      return action.statEvents.filter(statEvent => (
        Number.isFinite(statEvent?.seq)
        && statEvent.seq > before
        && statEvent.seq <= after
      ));
    })(),
  ]).map(statEvent => statEvent?.seq).filter(seq => seq != null));
  const statEvents = ownedStatSeqs.size
    ? action.statEvents.filter(event => ownedStatSeqs.has(event?.seq))
    : [];

  return {
    visualEvents,
    statEvents,
    statEventSeq: statEvents.reduce(
      (max, event) => Number.isFinite(event?.seq) ? Math.max(max, event.seq) : max,
      0
    ),
    players: rawResult._playersBeforeSkillAction || state?.players || [],
    discard: rawResult._preSkillDiscard || state?.discard || [],
    hasHuntBoundary: true,
  };
}

export function bindVisualEventToSteps(steps, event) {
  const queue = Array.isArray(steps) ? steps : [];
  if (!event?.id) return queue;
  return queue.map(step => step?.visualEventId
    ? step
    : { ...step, visualEventId: event.id });
}

function stepOwnsRestSettlement(step, restMsg) {
  if (!step || !restMsg) return false;
  const explicitLogs = [
    ...(Array.isArray(step._logChunk) ? step._logChunk : []),
    ...(Array.isArray(step.msgs) ? step.msgs : []),
  ];
  if (explicitLogs.includes(restMsg)) return true;
  return (Array.isArray(step.statEvents) ? step.statEvents : []).some(event => (
    event?.logHint === restMsg || event?.reason === '休息'
  ));
}

export function insertAiRestDiceBeforeSettlement(queue, restDiceStep, restMsg) {
  const steps = Array.isArray(queue) ? queue : [];
  if (!restDiceStep) return steps;
  const settlementIndex = steps.findIndex(step => stepOwnsRestSettlement(step, restMsg));
  const insertAt = settlementIndex < 0 ? steps.length : settlementIndex;
  return [
    ...steps.slice(0, insertAt),
    restDiceStep,
    ...steps.slice(insertAt),
  ];
}

export function shouldPrependAiSkillSnapshot({
  playersBeforeSkillAction,
  actionMsgs = [],
  visualEvents = [],
} = {}) {
  if (!playersBeforeSkillAction) return false;
  const hasCompleteHandWorshipTransition = (Array.isArray(visualEvents) ? visualEvents : []).some(event => (
    event?.type === 'godStatusChanged'
    && Array.isArray(event.playersBefore)
    && Array.isArray(event.playersAfter)
    && (event.msgs || []).some(msg => (
      typeof msg === 'string'
      && msg.includes('从手牌信仰')
      && actionMsgs.includes(msg)
    ))
  ));
  // The GOD_STATUS_CHANGED queue owns the pre-faith snapshot, highlight and
  // post-faith state. Prepending the already-settled skill snapshot would make
  // the god tag appear before that transaction and then roll back on setup.
  if (hasCompleteHandWorshipTransition) return false;
  return true;
}

export function getAiActionQueueCoverage(state, queue, getQueueEventIds, consumedEventIds = null) {
  const isConsumed = id => !!id && (
    consumedEventIds?.has?.(id)
    || (Array.isArray(consumedEventIds) && consumedEventIds.includes(id))
  );
  const visualEvents = scopeAiActionReplayMetadata(state).visualEvents
    .filter(event => !isConsumed(event?.id));
  const eventIds = visualEvents
    .map(event => event?.id)
    .filter(Boolean);
  const coveredEventIds = typeof getQueueEventIds === 'function'
    ? getQueueEventIds(queue)
    : [];
  const coveredSet = new Set(coveredEventIds);
  // A statEvents wrapper can be intentionally suppressed when another visual
  // event owns the same stat sequence. Treat it as covered only when that
  // owning event is actually represented in the submitted queue.
  visualEvents
    .filter(event => event?.type === 'statEvents' && event?.id)
    .forEach(statEvent => {
      const seqs = (statEvent.statEvents || []).map(event => event?.seq).filter(seq => seq != null);
      const owner = visualEvents.find(event => (
        event?.type !== 'statEvents'
        && event?.id
        && coveredSet.has(event.id)
        && seqs.length
        && seqs.every(seq => (event.statEvents || []).some(owned => owned?.seq === seq))
      ));
      if (owner) coveredSet.add(statEvent.id);
    });
  return {
    eventIds,
    coveredEventIds: eventIds.filter(id => coveredSet.has(id)),
    uncoveredEventIds: eventIds.filter(id => !coveredSet.has(id)),
  };
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
      queue.push({ type: 'VISUAL_LOCK', ...turnStartReplay.visualLock });
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
  const huntPresentation = buildOwnedAiHuntEventQueue({
    rawHuntEvents: rawResult._aiHuntEvents || [],
    state: nextState,
    actorName,
  });
  const huntEventQueue = huntPresentation.queue;
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
  const preHuntReplay = scopeAiPreHuntReplayMetadata(nextState, rawResult);
  const actionStatQueueBase = buildAnimQueue(
    actionOldState,
    {
      ...fakeState(preHuntReplay.players, nextLog),
      // AI worship-from-hand is resolved in the rule layer before the hunt
      // wait state is returned.  Keep the authoritative action events here so
      // GOD_STATUS_CHANGED can compose highlight, abandoned-god transfer and
      // its SAN settlement into one transaction ahead of the hunt animation.
      discard: preHuntReplay.discard,
      _visualEvents: preHuntReplay.visualEvents,
      _statEvents: preHuntReplay.statEvents,
      _statEventSeq: preHuntReplay.statEventSeq,
    }
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

  if (shouldPrependAiSkillSnapshot({
    playersBeforeSkillAction: rawResult._playersBeforeSkillAction,
    restMsg: null,
    actionMsgs: newMessages,
    visualEvents: scopeAiActionReplayMetadata(nextState).visualEvents,
  })) {
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
    nextState,
    roseThornSnapshot: buildRoseThornSnapshot(nextState.players),
    externalVisualLocks,
    inspectionEvents: huntPresentation.inspectionEvents,
  };
}

// `_animSphinxReveal` is a legacy presentation hint and can describe the
// already-resolved next turn when aiStep returns two turn segments at once.
// Action playback must therefore be selected from the scoped rule event, not
// from that top-level hint.  The event is also the canonical reveal payload.
export function getAiActionSphinxResultEvent(state) {
  return scopeAiActionReplayMetadata(state).visualEvents
    .find(event => event?.type === 'sphinxResult') || null;
}

// aiStep can return the completed action and the already-resolved next turn in
// one state. Build action-only replay endpoints here so a state-diff fallback
// cannot append the following turn's stat or inspection effects.
export function buildScopedAiActionReplayState({
  state,
  players,
  discard,
  log,
  inspectionEvents = [],
  metadata = null,
} = {}) {
  const actionMetadata = metadata || scopeAiActionReplayMetadata(state);
  const scopedInspectionEvents = (Array.isArray(inspectionEvents) ? inspectionEvents : [])
    .filter(Boolean);
  const inspectionSeq = scopedInspectionEvents.reduce(
    (max, event) => Number.isFinite(event?.seq) ? Math.max(max, event.seq) : max,
    0,
  );
  return {
    ...(state || {}),
    ...(Array.isArray(players) ? { players } : {}),
    ...(Array.isArray(discard) ? { discard } : {}),
    ...(Array.isArray(log) ? { log } : {}),
    _visualEvents: actionMetadata.visualEvents,
    _statEvents: actionMetadata.statEvents,
    _statEventSeq: actionMetadata.statEventSeq,
    _inspectionEvents: scopedInspectionEvents, // legacy-visual-allow: compatibility presentation baseline
    _inspectionSeq: inspectionSeq,
  };
}

function inspectionBelongsToApophisTarget(inspectionEvent, apophisTargetEvent) {
  if (!inspectionEvent || !apophisTargetEvent?.log) return false;
  if (inspectionEvent.target !== apophisTargetEvent.actorIdx) return false;
  const beforeLog = Array.isArray(inspectionEvent.beforeLog) ? inspectionEvent.beforeLog : [];
  return beforeLog.at(-1) === apophisTargetEvent.log;
}

function isLogPrefix(prefix, fullLog) {
  if (!Array.isArray(prefix) || !Array.isArray(fullLog) || prefix.length > fullLog.length) return false;
  return prefix.every((line, index) => line === fullLog[index]);
}

function collectApophisInspectionChain(inspectionEvents, rawHuntEvent) {
  const firstIndex = inspectionEvents.findIndex(event => (
    inspectionBelongsToApophisTarget(event, rawHuntEvent?.apophisTargetEvent)
  ));
  if (firstIndex < 0) return [];
  const huntBeforeLog = Array.isArray(rawHuntEvent?.beforeLog) ? rawHuntEvent.beforeLog : null;
  if (!huntBeforeLog) return [inspectionEvents[firstIndex]];
  const chain = [];
  for (let index = firstIndex; index < inspectionEvents.length; index += 1) {
    const event = inspectionEvents[index];
    if (!isLogPrefix(event?.afterLog, huntBeforeLog)) break;
    chain.push(event);
  }
  return chain;
}

export function buildOwnedAiHuntEventQueue({
  rawHuntEvents = [],
  state,
  actorName,
  buildQueue = buildAnimQueue,
} = {}) {
  const metadata = scopeAiActionReplayMetadata(state);
  const huntVisualEvents = metadata.visualEvents.filter(event => event?.type === 'huntResult');
  const apophisVisualEvents = metadata.visualEvents.filter(event => event?.type === 'apophisTarget');
  const inspectionVisualEvents = metadata.visualEvents.filter(event => event?.type === 'inspection');
  const inspectionEvents = Array.isArray(state?._inspectionEvents) ? state._inspectionEvents : [];
  const ownedInspectionEvents = [];
  let huntVisualEventIndex = 0;

  const queue = rawHuntEvents.flatMap(rawEvent => {
    const huntVisualEvent = rawEvent?.targetOnly ? null : huntVisualEvents[huntVisualEventIndex++];
    const huntEvent = {
      ...rawEvent,
      ...(huntVisualEvent?.id ? { id: huntVisualEvent.id } : {}),
    };
    const rawApophisEvent = rawEvent?.apophisTargetEvent;
    const apophisEvent = rawApophisEvent
      ? apophisVisualEvents.find(event => event?.legacySeq === rawApophisEvent.seq)
      : null;
    const apophisQueue = apophisEvent
      ? buildApophisTargetSteps(apophisEvent, state).filter(step => step?.type !== 'SKILL_HUNT')
      : [];
    const relatedInspections = rawApophisEvent
      ? collectApophisInspectionChain(inspectionEvents, rawEvent)
      : [];
    ownedInspectionEvents.push(...relatedInspections);
    const inspectionQueue = relatedInspections.flatMap(inspectionEvent => {
      const flow = buildInspectionEventFlow(
        {
          players: inspectionEvent.beforePlayers || state?.players || [],
          log: inspectionEvent.beforeLog || state?.log || [],
          discard: inspectionEvent.beforeDiscard || state?.discard || [],
          _statEventSeq: inspectionEvent.beforeStatEventSeq || 0,
        },
        [inspectionEvent],
        { buildAnimQueue: buildQueue, copyPlayers },
      );
      const visualEvent = inspectionVisualEvents.find(event => event?.legacySeq === inspectionEvent.seq);
      return visualEvent ? bindVisualEventToSteps(flow.queue, visualEvent) : flow.queue;
    });
    const huntQueue = rawEvent?.targetOnly
      ? []
      : bindVisualEventToSteps(
          buildAiHuntEventAnimQueue(huntEvent, actorName, { includeApophisTarget: false }),
          huntEvent,
        );
    return [...apophisQueue, ...inspectionQueue, ...huntQueue];
  });

  return {
    queue,
    inspectionEvents: ownedInspectionEvents.filter((event, index, events) => (
      events.findIndex(candidate => candidate?.seq === event?.seq) === index
    )),
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
import { buildInspectionEventFlow, statePatchStep } from './animQueueHelpers';
import {
  appendAnimLogChunkToQueueEnd,
  bindAnimLogChunks,
  splitTransitionLogs,
  subtractLogOccurrences,
} from './animLogs';
import { copyPlayers, removeCardsFromDiscard } from './coreUtils';
import { getTurnStartDrawBaselineLog } from './turnAnimState';
import { buildApophisTargetSteps } from './visualEvents';
