import { cardLogText, copyPlayers } from './coreUtils';
import { localDisplayName } from './rotateState';
import { bindAnimLogChunks } from './animLogs';
import { buildAnimQueue, buildFullHandSwapTransferQueueFromLogs } from './animQueueCore';
import { buildInspectionEventFlow, cardTransferStep, statePatchStep } from './animQueueHelpers';
import {
  buildDrawCardStepFromVisualEvents,
  buildTurnStartStepFromVisualEvents,
  getVisualEvents,
  VISUAL_EVENT,
} from './visualEvents';
import { statEventsToAnimQueue } from './statEvents';

export const EMPTY_TURN_ANIM_FIELDS = Object.freeze({
  _aiDrawnCard: null,
  _drawnCard: null,
  _discardedDrawnCard: false,
  _playersBeforeThisDraw: null,
  _turnStartLogs: [],
  _drawLogs: [],
  _statLogs: [],
  _statEvents: [],
  _preTurnPlayers: null,
  _tsgSlimeGrantEvents: null,
  _earthquakeBeforePlayers: null,
  _earthquakeBeforeDiscard: null,
  _earthquakeDiscardEvents: null,
});

export function withClearedTurnAnimFields(state, extra = {}) {
  return { ...state, ...EMPTY_TURN_ANIM_FIELDS, ...extra };
}

export function withClearedReplayAnimFields(state, extra = {}) {
  return withClearedTurnAnimFields(state, {
    _statEvents: Array.isArray(state?._statEvents) ? state._statEvents : [],
    ...extra,
  });
}

export function buildLocalCthDecisionState(baseState, {
  players,
  deck,
  discard,
  log,
  drawnCard,
  remainingDraws,
  needGodChoice = false,
  preStatLogs = [],
  statLogs = [],
  extraState = {},
}) {
  const drawLogs = [`你 摸到 ${cardLogText(drawnCard, { alwaysShowName: true })}`, ...(needGodChoice ? [] : preStatLogs)];
  if (needGodChoice) {
    return {
      ...baseState,
      players,
      deck,
      discard,
      log,
      currentTurn: 0,
      phase: 'GOD_CHOICE',
      abilityData: { godCard: drawnCard, fromRest: true, cthDrawsRemaining: remainingDraws, drawerIdx: 0 },
      drawReveal: null,
      selectedCard: null,
      _turnStartLogs: [],
      _drawLogs: drawLogs,
      _statLogs: [],
      ...extraState,
    };
  }
  return {
    ...baseState,
    players,
    deck,
    discard,
    log,
    currentTurn: 0,
    phase: 'DRAW_REVEAL',
    drawReveal: { card: drawnCard, msgs: [], needsDecision: true, forcedKeep: false, drawerIdx: 0, drawerName: players[0].name, fromRest: true },
    selectedCard: null,
    abilityData: { fromRest: true, cthDrawsRemaining: remainingDraws },
    _turnStartLogs: [],
    _drawLogs: drawLogs,
    _statLogs: statLogs,
    ...extraState,
  };
}

export function buildPlayerTurnDrawQueue(oldGs, newGs, seedQueue = []) {
  const queue = [...(Array.isArray(seedQueue) ? seedQueue : [])];
  queue.push(...buildTsathogguaSlimeGrantQueue(newGs));
  const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
  if (replay.drawnCard) {
    queue.push(...replay.queue);
  }
  return queue;
}

export function buildTsathogguaSlimeGrantQueue(state) {
  const events = Array.isArray(state?._tsgSlimeGrantEvents) ? state._tsgSlimeGrantEvents : [];
  const queue = [];
  events.forEach(ev => {
    if (!ev || ev.ownerIdx == null || !ev.count) return;
    queue.push(
      {
        type: 'VISUAL_LOCK',
        players: ev.playersBefore,
        zhuLight: state?.zhuLight || null,
      },
      cardTransferStep({
        fromPid: ev.ownerIdx,
        dest: 'player',
        toPid: ev.ownerIdx,
        count: ev.count,
        sourceAnchor: 'playerArea',
        effect: 'tsgSlime',
        durationMs: 950,
        cards: ev.cards,
        msgs: ev.msgs || [],
      }),
      statePatchStep({ players: ev.playersAfter }),
      { type: 'TURN_BOUNDARY_PAUSE', durationMs: 180 }
    );
  });
  return queue;
}

export function getTurnStartDrawBaselineLog(state) {
  const log = Array.isArray(state?.log) ? state.log : [];
  const animatedLogCount = [
    ...(state?._turnStartLogs || []),
    ...(state?._drawLogs || []),
    ...(state?._statLogs || []),
  ].length;
  return animatedLogCount > 0 ? log.slice(0, Math.max(0, log.length - animatedLogCount)) : log;
}

export function getTurnStartDrawnCard(state) {
  return state?.phase === 'GOD_CHOICE'
    ? state.abilityData?.godCard
    : state?.drawReveal?.card;
}

export function getTurnStartDrawerIdx(state) {
  if (state?.phase === 'GOD_CHOICE') {
    return state.abilityData?.drawerIdx ?? state.currentTurn ?? 0;
  }
  return state?.drawReveal?.drawerIdx ?? state?.currentTurn ?? 0;
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

function getFreshInspectionEvents(oldGs, newGs) {
  const oldSeq = oldGs?._inspectionSeq || 0;
  return (newGs?._inspectionEvents || []).filter(ev => ev?.seq > oldSeq);
}

function getInspectionStatSeqs(inspectionEvents = []) {
  return new Set(
    inspectionEvents
      .flatMap(ev => [
        ev?.statEventSeq,
        ...(Array.isArray(ev?.statEvents) ? ev.statEvents.map(statEvent => statEvent?.seq) : []),
      ])
      .filter(seq => seq != null)
  );
}

function getInspectionLogLines(inspectionEvents = []) {
  const lines = [];
  inspectionEvents.forEach(ev => {
    const beforeLog = Array.isArray(ev?.beforeLog) ? ev.beforeLog : [];
    const afterLog = Array.isArray(ev?.afterLog) ? ev.afterLog : [];
    let prefix = 0;
    while (prefix < beforeLog.length && prefix < afterLog.length && beforeLog[prefix] === afterLog[prefix]) prefix += 1;
    lines.push(...afterLog.slice(prefix));
  });
  return new Set(lines.filter(line => typeof line === 'string' && line.length));
}

function withoutLogLines(lines = [], excluded = new Set()) {
  if (!excluded?.size) return lines;
  return (Array.isArray(lines) ? lines : []).filter(line => !excluded.has(line));
}

function buildFilteredStatStepsFromVisualEvents(state, players, shouldKeepEvent, excludedMsgs = new Set()) {
  const event = getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.STAT_EVENTS && Array.isArray(ev.statEvents) && ev.statEvents.length);
  if (!event) return [];
  const statEvents = event.statEvents.filter(statEvent => shouldKeepEvent(statEvent));
  if (!statEvents.length) return [];
  return statEventsToAnimQueue(statEvents, players || state?.players || [], withoutLogLines(event.msgs || [], excludedMsgs));
}

export function buildTurnStartDrawReplayQueue({
  oldGs,
  newGs,
  effectOldGs,
  timedOutDrawDiscardStep = null,
  preTurnSteps = [],
  buildQueue = buildAnimQueue,
  buildFullHandSwapTransferQueue = buildFullHandSwapTransferQueueFromLogs,
} = {}) {
  const boundarySteps = [
    ...(timedOutDrawDiscardStep ? [timedOutDrawDiscardStep] : []),
    ...(Array.isArray(preTurnSteps) ? preTurnSteps.filter(Boolean) : []),
  ];
  const drawnCard = getTurnStartDrawnCard(newGs);
  if (!drawnCard) {
    return {
      drawnCard: null,
      beforeDrawPlayers: newGs?.players || oldGs?.players || [],
      drawEffectQ: [],
      queue: [...boundarySteps],
      startAnim: boundarySteps[0] || null,
      startQueue: boundarySteps.slice(1),
      visualLock: null,
      inspectionEvents: [],
    };
  }
  const drawerPid = getTurnStartDrawerIdx(newGs);
  const drawerName = newGs?.players?.[drawerPid]?.name || '???';
  const beforeDrawPlayers = newGs?._playersBeforeThisDraw || oldGs?.players || newGs?.players || [];
  const turnStartStep = buildTurnStartStepFromVisualEvents(newGs) || {
    type: 'YOUR_TURN',
    ...(drawerPid === 0 ? {} : { name: drawerName }),
    msgs: newGs?._turnStartLogs,
  };
  const drawCardStep = buildDrawCardStepFromVisualEvents(newGs) || {
    type: 'DRAW_CARD',
    card: drawnCard,
    triggerName: localDisplayName(drawerPid, drawerName),
    targetPid: drawerPid,
    msgs: newGs?._drawLogs,
  };
  const drawFullHandSwapQ = buildFullHandSwapTransferQueue(
    [...(newGs?._drawLogs || []), ...(newGs?._statLogs || [])],
    beforeDrawPlayers,
  );
  const fallbackOldGs = effectOldGs || {
    ...(oldGs || newGs || {}),
    players: beforeDrawPlayers,
    log: getTurnStartDrawBaselineLog(newGs),
  };
  const inspectionEvents = getFreshInspectionEvents(oldGs, newGs);
  const inspectionStatSeqs = getInspectionStatSeqs(inspectionEvents);
  const inspectionLogLines = getInspectionLogLines(inspectionEvents);
  const drawEffectQBase = bindAnimLogChunks(
    buildQueue(fallbackOldGs, newGs),
    { statLogs: withoutLogLines(newGs?._statLogs, inspectionLogLines) },
  );
  const visualStatQ = buildFilteredStatStepsFromVisualEvents(
    newGs,
    beforeDrawPlayers,
    statEvent => !inspectionStatSeqs.has(statEvent?.seq),
    inspectionLogLines
  );
  const filteredDrawEffectQBase = filterFallbackDrawEffects(drawEffectQBase, newGs, visualStatQ);
  const drawEffectQWithVisualStats = visualStatQ.length
    ? [...visualStatQ, ...filteredDrawEffectQBase.filter(step => !isStatAnimationStep(step))]
    : filteredDrawEffectQBase;
  const inspectionQ = [];
  if (inspectionEvents.length) {
    const firstInspection = inspectionEvents[0];
    const inspectionFlow = buildInspectionEventFlow(
      {
        players: copyPlayers(firstInspection?.beforePlayers || beforeDrawPlayers),
        log: [...(firstInspection?.beforeLog || getTurnStartDrawBaselineLog(newGs))],
      },
      inspectionEvents,
      { buildAnimQueue: buildQueue, copyPlayers }
    );
    const maxInspectionSeq = Math.max(oldGs?._inspectionSeq || 0, ...inspectionEvents.map(ev => ev?.seq || 0));
    const tailQueue = buildQueue(
      {
        players: inspectionFlow.players,
        log: inspectionFlow.log,
        _statEventSeq: inspectionFlow.statEventSeq,
        _inspectionSeq: maxInspectionSeq,
      },
      newGs
    );
    inspectionQ.push(...inspectionFlow.queue, ...tailQueue);
  }
  const drawEffectQWithInspections = inspectionQ.length
    ? [...drawEffectQWithVisualStats, ...inspectionQ]
    : drawEffectQWithVisualStats;
  const drawEffectQ = drawFullHandSwapQ.length
    ? [...drawFullHandSwapQ, ...drawEffectQWithInspections.filter(step => step.type !== 'CARD_TRANSFER')]
    : drawEffectQWithInspections;
  const queue = [
    ...boundarySteps,
    turnStartStep,
    drawCardStep,
    ...drawEffectQ,
  ];
  const startAnim = boundarySteps[0] || turnStartStep;
  const startQueue = [
    ...(boundarySteps.length ? [...boundarySteps.slice(1), turnStartStep] : []),
    drawCardStep,
    ...drawEffectQ,
  ];
  return {
    drawnCard,
    drawerPid,
    drawerName,
    beforeDrawPlayers,
    turnStartStep,
    drawCardStep,
    drawEffectQ,
    queue,
    startAnim,
    startQueue,
    inspectionEvents,
    visualLock: newGs?._playersBeforeThisDraw
      ? { players: beforeDrawPlayers, zhuLight: oldGs?.zhuLight || newGs?.zhuLight || null }
      : null,
  };
}
