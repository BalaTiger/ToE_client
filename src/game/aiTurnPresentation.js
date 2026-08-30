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
  '_aiActionTransactionId',
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
  '_aiHandLimitStatEventSeqs',
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

// AI actions may resolve a whole SAN-inspection chain synchronously.  The
// action prelude is rendered against the snapshot immediately before the
// first inspection, so it must not also compile stat events owned by that
// inspection (or anything settled after it).  Otherwise the HP loss from
// 自残 is played before the card reveal and the inspection flow's copy is
// subsequently removed as a duplicate.
export function scopeAiReplayMetadataBeforeInspection(metadata = {}, firstInspection = null) {
  if (!firstInspection) return metadata;
  const explicitBoundary = Number(firstInspection.beforeStatEventSeq);
  const inspectionSeqs = (Array.isArray(firstInspection.statEvents) ? firstInspection.statEvents : [])
    .map(event => Number(event?.seq))
    .filter(Number.isFinite);
  const fallbackBoundary = inspectionSeqs.length ? Math.min(...inspectionSeqs) - 1 : null;
  const boundary = Number.isFinite(explicitBoundary) ? explicitBoundary : fallbackBoundary;
  if (!Number.isFinite(boundary)) return metadata;
  const statEvents = (Array.isArray(metadata?.statEvents) ? metadata.statEvents : [])
    .filter(event => !Number.isFinite(Number(event?.seq)) || Number(event.seq) <= boundary);
  return {
    ...metadata,
    statEvents,
    statEventSeq: statEvents.reduce(
      (max, event) => Number.isFinite(Number(event?.seq)) ? Math.max(max, Number(event.seq)) : max,
      0,
    ),
  };
}

// A canonical action queue can own inspections directly (for example a black-
// night SAN check) or through a parent settlement event.  Return every
// inspection already represented by that queue so callers can advance the
// shared inspection watermark before considering compatibility replay paths.
export function collectInspectionEventsCoveredByQueue(visualEvents = [], queue = []) {
  const coveredIds = new Set(getAnimationQueueVisualEventIds(queue));
  const covered = [];
  const seen = new Set();
  const add = event => {
    if (!event) return;
    const key = event.id || `inspection-seq:${event.legacySeq ?? event.seq ?? covered.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    covered.push(event);
  };

  (Array.isArray(visualEvents) ? visualEvents : []).forEach(event => {
    if (event?.type === 'inspection' && event.id && coveredIds.has(event.id)) add(event);
    if (!event?.id || !coveredIds.has(event.id)) return;
    (Array.isArray(event.settlementEvents) ? event.settlementEvents : [])
      .filter(settlementEvent => settlementEvent?.type === 'inspection')
      .forEach(add);
  });
  return covered;
}

function collectOwnedAiHuntVisualEvents(visualEvents = [], rawHuntEvents = []) {
  const attempts = (Array.isArray(rawHuntEvents) ? rawHuntEvents : []).filter(event => (
    event?.attemptId || event?.phaseGroupId
  ));
  const attemptIds = new Set(attempts.flatMap(event => (
    [event?.attemptId, event?.phaseGroupId].filter(Boolean)
  )));
  const huntEvents = (Array.isArray(visualEvents) ? visualEvents : []).filter(event => (
    (event?.type === 'huntResult' || event?.type === 'huntTarget')
    && (attemptIds.has(event?.attemptId) || attemptIds.has(event?.phaseGroupId))
  ));
  const targetEventIds = new Set([
    ...attempts.map(event => event?.targetResolutionEventId).filter(Boolean),
    ...huntEvents.map(event => event?.targetResolutionEventId).filter(Boolean),
  ]);
  const targetEvents = visualEvents.filter(event => (
    event?.type === 'apophisTarget' && targetEventIds.has(event?.id)
  ));
  const resolvedTargetEventIds = new Set(targetEvents.map(event => event.id));
  const inspectionEvents = visualEvents.filter(event => (
    event?.type === 'inspection' && resolvedTargetEventIds.has(event?.causedByEventId)
  ));
  const ownedEventIds = new Set([
    ...targetEvents,
    ...inspectionEvents,
    ...huntEvents,
  ].map(event => event?.id).filter(Boolean));
  return {
    events: visualEvents.filter(event => ownedEventIds.has(event?.id)),
    huntEvents,
    targetEvents,
    inspectionEvents,
    eventIds: [...ownedEventIds],
  };
}

// A chained hunt owns its own per-attempt snapshots.  The transaction before
// the first hunt must therefore stop at the rule-layer pre-skill snapshot;
// comparing the action start with the completed AI turn leaks later hunt
// discards into worship/rest animations and the first hunt then appears to
// "restore" those cards.
export function scopeAiPreHuntReplayMetadata(state, rawResult = {}) {
  const unscopedAction = scopeAiActionReplayMetadata(state);
  const actionTransactionId = rawResult?._aiActionTransactionId || null;
  const transactionVisualEvents = actionTransactionId
    ? unscopedAction.visualEvents.filter(event => event?.transactionId === actionTransactionId)
    : unscopedAction.visualEvents;
  const transactionStatSeqs = new Set(transactionVisualEvents
    .flatMap(event => Array.isArray(event?.statEvents) ? event.statEvents : [])
    .map(event => event?.seq)
    .filter(seq => seq != null));
  const action = actionTransactionId
    ? {
        ...unscopedAction,
        visualEvents: transactionVisualEvents,
        statEvents: unscopedAction.statEvents.filter(event => (
          event?.seq != null && transactionStatSeqs.has(event.seq)
        )),
      }
    : unscopedAction;
  const ownedHuntEvents = collectOwnedAiHuntVisualEvents(
    action.visualEvents,
    rawResult?._aiHuntEvents || [],
  );
  const ownedEventIds = new Set(ownedHuntEvents.eventIds);
  const firstHuntEventIndex = action.visualEvents.findIndex(event => ownedEventIds.has(event?.id));
  if (firstHuntEventIndex < 0) {
    return {
      ...action,
      players: state?.players || [],
      discard: state?.discard || [],
      hasHuntBoundary: false,
    };
  }

  const visualEvents = action.visualEvents
    .slice(0, firstHuntEventIndex)
    .filter(event => !ownedEventIds.has(event?.id));
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

export function getAiActionQueueCoverage(
  state,
  queue,
  getQueueEventIds,
  consumedEventIds = null,
  { previousState = null, eventIds: ownedEventIds = null } = {},
) {
  const isConsumed = id => !!id && (
    consumedEventIds?.has?.(id)
    || (Array.isArray(consumedEventIds) && consumedEventIds.includes(id))
  );
  // Explicit ownership is authoritative even when the same serialized event
  // is already present in a previous snapshot (for example after reconnect).
  // The previous-state diff remains only as a compatibility fallback for
  // callers that have not migrated to transaction/event-id ownership yet.
  const previousIds = new Set(
    (Array.isArray(previousState?._visualEvents) ? previousState._visualEvents : [])
      .map(event => event?.id)
      .filter(Boolean),
  );
  const ownedIds = ownedEventIds == null
    ? null
    : new Set((ownedEventIds instanceof Set
      ? [...ownedEventIds]
      : Array.isArray(ownedEventIds) ? ownedEventIds : []).filter(Boolean));
  const candidateVisualEvents = ownedIds
    ? (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    : scopeAiActionReplayMetadata(state).visualEvents;
  const visualEvents = candidateVisualEvents
    .filter(event => (
      !isConsumed(event?.id)
      && (ownedIds || !previousState || !previousIds.has(event?.id))
      && (!ownedIds || ownedIds.has(event?.id))
    ));
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
    const drawEffectEventIds = (previousState._visualEvents || [])
      .filter(event => (
        event?.id
        && event.turnStartStage === 'draw'
        && !['drawCard', 'deckReshuffle'].includes(event.type)
      ))
      .map(event => event.id);
    const drawEffectTransaction = drawEffectEventIds.length
      ? compileRuleVisualEventsToAnimTransaction(previousState, null, { eventIds: drawEffectEventIds })
      : null;
    const drawEffectQueueBase = bindAnimLogChunks(
      drawEffectTransaction?.queue || [],
      { statLogs: previousState._statLogs },
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
  const consumedApophisTargetSeq = huntPresentation.targetEventIds.length
    ? (nextState?._apophisTargetSeq || 0)
    : 0;
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
  const actionReplayState = {
      ...fakeState(preHuntReplay.players, nextLog),
      // AI worship-from-hand is resolved in the rule layer before the hunt
      // wait state is returned.  Keep the authoritative action events here so
      // GOD_STATUS_CHANGED can compose highlight, abandoned-god transfer and
      // its SAN settlement into one transaction ahead of the hunt animation.
      discard: preHuntReplay.discard,
      _visualEvents: preHuntReplay.visualEvents,
      _statEvents: preHuntReplay.statEvents,
      _statEventSeq: preHuntReplay.statEventSeq,
    };
  const actionStatQueueBase = compileFreshVisualEventReplay(actionOldState, actionReplayState).queue;
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
      queue.push(...actionStatQueue, ...huntEventQueue);
    }
  } else if (actionStatQueue.length) {
    queue.push(...actionStatQueue);
  }

  const explicitCurrentLogs = collectExplicitAiTurnLogs(previousState, queue);
  const residualLogs = subtractLogOccurrences(
    currentTurnLogs,
    explicitCurrentLogs
  );
  const finalQueue = appendAnimLogChunkToQueueEnd(queue, residualLogs);
  const actionTransactionId = rawResult?._aiActionTransactionId || null;
  const stateVisualEvents = Array.isArray(nextState?._visualEvents) ? nextState._visualEvents : [];
  const stateVisualEventsById = new Map(
    stateVisualEvents.map(event => [event?.id, event]).filter(([id]) => !!id),
  );
  const actionTransactionEventIds = actionTransactionId
    ? stateVisualEvents
        .filter(event => event?.transactionId === actionTransactionId && event?.id)
        .map(event => event.id)
    : [];
  // A combined wait presentation may still contain a staged turn-start replay.
  // Those events are a separate declared transaction, not part of the AI
  // action transaction, so include only staged ids that the queue binds
  // explicitly rather than claiming every staged event retained on the state.
  const queuedTurnStartEventIds = getAnimationQueueVisualEventIds(finalQueue)
    .filter(id => !!stateVisualEventsById.get(id)?.turnStartStage);
  const eventIds = [...new Set([
    ...actionTransactionEventIds,
    ...(huntPresentation.eventIds || []),
    ...queuedTurnStartEventIds,
  ])];

  return {
    queue: finalQueue,
    nextState,
    actionTransactionId,
    eventIds,
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
    _inspectionSeq: inspectionSeq,
  };
}

export function buildOwnedAiHuntEventQueue({
  rawHuntEvents = [],
  state,
  actorName,
} = {}) {
  const metadata = scopeAiActionReplayMetadata(state);
  const owned = collectOwnedAiHuntVisualEvents(metadata.visualEvents, rawHuntEvents);
  const transaction = owned.events.length
    ? compileRuleVisualEventsToAnimTransaction(state, null, {
        eventIds: owned.events.map(event => event.id),
      })
    : null;
  const compiledHuntAttempts = new Set(owned.huntEvents.flatMap(event => (
    [event?.attemptId, event?.phaseGroupId].filter(Boolean)
  )));
  const pendingPromptQueue = rawHuntEvents.flatMap(rawEvent => {
    if (rawEvent?.targetOnly) return [];
    if (compiledHuntAttempts.has(rawEvent?.attemptId) || compiledHuntAttempts.has(rawEvent?.phaseGroupId)) {
      return [];
    }
    return buildAiHuntEventAnimQueue(rawEvent, actorName, { includeApophisTarget: false });
  });

  return {
    queue: [...(transaction?.queue || []), ...pendingPromptQueue],
    transactionId: transaction?.id || null,
    eventIds: transaction?.eventIds || [],
    targetEventIds: owned.targetEvents.map(event => event.id),
    inspectionEvents: owned.inspectionEvents,
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

// Rule resolution has already succeeded when queue composition fails. Preserve
// that authoritative result and drop only the failed action presentation
// payload; forcing startNextTurn here would turn a visual defect into a rules
// mutation and can discard an already-settled hunt.
export function buildAiPresentationRecoveryState({
  snapshot,
  resolvedState,
  error,
} = {}) {
  if (!resolvedState) return snapshot;
  const actorName = snapshot?.players?.[snapshot.currentTurn]?.name || '该AI';
  const suffix = error?.message ? `（${error.message}）` : '';
  const visualEvents = Array.isArray(resolvedState?._visualEvents)
    ? resolvedState._visualEvents.filter(event => !!event?.turnStartStage)
    : [];
  return {
    ...resolvedState,
    _visualEvents: visualEvents,
    _apophisTargetEvent: null,
    log: [
      ...(Array.isArray(resolvedState?.log) ? resolvedState.log : []),
      `${actorName} 的行动动画已降级${suffix}，规则结算继续`,
    ],
  };
}
import {
  buildAiHuntEventAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
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
import {
  compileFreshVisualEventReplay,
  compileRuleVisualEventsToAnimTransaction,
  getAnimationQueueVisualEventIds,
} from './visualEventTransactionCompiler';
