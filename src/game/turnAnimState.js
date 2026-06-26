import { cardLogText, copyPlayers } from './coreUtils';
import { isAiSeat, localDisplayName } from './rotateState';
import { bindAnimLogChunks } from './animLogs';
import { buildAnimQueue, buildFullHandSwapTransferQueueFromLogs } from './animQueueCore';
import { buildInspectionEventFlow, cardTransferStep, statePatchStep } from './animQueueHelpers';
import {
  getVisualEvents,
  VISUAL_EVENT,
  buildTurnStartStepFromVisualEvents,
  buildDrawCardStepFromVisualEvents,
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
    _apophisTargetEvent: null,
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
  const queue = buildGodPowerBlockedBoundaryQueue(state);
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

function godPowerBlockedStepFromEvent(event, state) {
  const playerIdx = event?.playerIdx ?? 0;
  const playerName = event?.playerName || state?.players?.[playerIdx]?.name || '该玩家';
  return {
    type: 'GOD_POWER_BLOCKED',
    targetPid: playerIdx,
    name: localDisplayName(playerIdx, playerName),
    msgs: Array.isArray(event?.msgs) ? event.msgs : [],
  };
}

function buildGodPowerBlockedBoundaryQueue(state) {
  const log = Array.isArray(state?.log) ? state.log : [];
  const turnStartLine = Array.isArray(state?._turnStartLogs) ? state._turnStartLogs[0] : null;
  const turnStartIdx = turnStartLine ? log.lastIndexOf(turnStartLine) : -1;
  if (turnStartIdx < 0) return [];
  const events = getVisualEvents(state)
    .filter(event => event?.type === VISUAL_EVENT.GOD_POWER_BLOCKED)
    .filter(event => {
      const msgs = Array.isArray(event?.msgs) ? event.msgs : [];
      return msgs.some(msg => {
        const idx = log.indexOf(msg);
        return idx >= 0 && idx < turnStartIdx;
      });
    });
  if (events.length) {
    try { console.log('[BUG1-DIAG] boundaryQueue godPowerBlocked', { currentTurn: state?.currentTurn, turnStartLine, ids: events.map(e => e.id), playerIdx: events.map(e => e.playerIdx) }); } catch { /* noop */ }
  }
  return events.map(event => godPowerBlockedStepFromEvent(event, state));
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
  if (state?._drawnCard || state?._aiDrawnCard) return state._drawnCard || state._aiDrawnCard;
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

export function shouldReplaySinglePlayerAiTurnStart(state) {
  return (
    (state?.phase === 'AI_TURN' || state?.phase === 'AI_GOD_CHOICE') &&
    isAiSeat(state, state?.currentTurn) &&
    Array.isArray(state?._turnStartLogs) &&
    state._turnStartLogs.length > 0
  );
}

export function buildSinglePlayerAiTurnStartReplayContext(currentGs, nextGs) {
  if (!shouldReplaySinglePlayerAiTurnStart(nextGs)) return null;
  const actorName = nextGs.players?.[nextGs.currentTurn]?.name || '???';
  return {
    actorName,
    oldGs: currentGs,
    effectOldGs: {
      ...(currentGs || {}),
      players: nextGs._playersBeforeThisDraw || currentGs?.players || nextGs.players,
    },
  };
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
  return visualStatQ.length > 0 ||
    (Array.isArray(state?._statLogs) && state._statLogs.length > 0) ||
    (Array.isArray(state?._statEvents) && state._statEvents.length > 0);
}

function filterFallbackDrawEffects(queue, state, visualStatQ = []) {
  if (hasDrawStatEvidence(state, visualStatQ)) return queue;
  return queue.filter(step => {
    if (step?.type === 'DICE_ROLL' && step.diceMode === 'moldyFood') return true;
    return !isStatAnimationStep(step);
  });
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

function buildTreasureDodgeDiceStepFromLogs(logs = [], drawerName = '???') {
  const line = (Array.isArray(logs) ? logs : []).find(msg =>
    typeof msg === 'string' &&
    msg.includes('（寻宝者）') &&
    msg.includes('掷出') &&
    (msg.includes('成功规避负面效果') || msg.includes('未能规避，触发负面效果'))
  );
  if (!line) return null;
  const match = line.match(/^(.+?)（寻宝者）.*?掷出 (\d+) 点，(.+?)！?$/);
  if (!match) return null;
  const d1 = Number(match[2]);
  if (!Number.isFinite(d1)) return null;
  return {
    type: 'DICE_ROLL',
    d1,
    d2: 0,
    heal: 0,
    rollerName: match[1] || drawerName,
    dodgeSuccess: match[3].includes('成功规避负面效果'),
  };
}

function isGodDrawnCard(card) {
  return !!card && (card.isGod || card.type === 'god' || !!card.godKey);
}

function getGodDrawResolution(logs = [], drawerName = '') {
  const lines = Array.isArray(logs) ? logs : [];
  const godHandLog = lines.some(msg => typeof msg === 'string' && msg.includes('将邪神牌收入手牌'));
  const godDiscardLog = lines.some(msg => typeof msg === 'string' && msg.includes('放弃了邪神的馈赠'));
  if (godHandLog) return 'hand';
  if (godDiscardLog) return 'discard';
  const playerPrefix = drawerName ? `${drawerName} ` : '';
  const godZoneLog = lines.some(msg => typeof msg === 'string' && (
    msg.startsWith(`${playerPrefix}信仰了 `) ||
    msg.startsWith(`${playerPrefix}改信新神`) ||
    msg.includes('邪神之力升至')
  ));
  if (godZoneLog) return 'godZone';
  return null;
}

function buildFilteredStatStepsFromVisualEvents(state, players, shouldKeepEvent, excludedMsgs = new Set()) {
  const event = getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.STAT_EVENTS && Array.isArray(ev.statEvents) && ev.statEvents.length);
  if (!event) return [];
  const statEvents = event.statEvents.filter(statEvent => shouldKeepEvent(statEvent));
  if (!statEvents.length) return [];
  return statEventsToAnimQueue(statEvents, players || state?.players || [], withoutLogLines(event.msgs || [], excludedMsgs));
}

function isBlackGoatTurnStartStatEvent(event) {
  return event?.reason === '黑山羊幼仔' || String(event?.logHint || '').includes('黑山羊幼仔');
}

function isLinkHealTurnStartStatEvent(event) {
  return event?.reason === '两人一绳' || String(event?.logHint || '').includes('【两人一绳】');
}

function isPreDrawTurnStartStatEvent(event) {
  return isBlackGoatTurnStartStatEvent(event) || isLinkHealTurnStartStatEvent(event);
}

function getFreshStatEventsFromState(oldGs, newGs) {
  const oldSeq = oldGs?._statEventSeq || 0;
  const visualEvent = getVisualEvents(newGs).find(ev => ev?.type === VISUAL_EVENT.STAT_EVENTS && Array.isArray(ev.statEvents) && ev.statEvents.length);
  if (visualEvent) return visualEvent.statEvents.filter(Boolean);
  return Array.isArray(newGs?._statEvents)
    ? newGs._statEvents.filter(ev => ev && (ev.seq == null || ev.seq > oldSeq))
    : [];
}

function getTurnStartPreDrawMsgs(state) {
  const log = Array.isArray(state?.log) ? state.log : [];
  const turnStartLogs = Array.isArray(state?._turnStartLogs) ? state._turnStartLogs : [];
  if (!turnStartLogs.length) return [];
  const turnStartIdx = log.lastIndexOf(turnStartLogs[0]);
  if (turnStartIdx < 0) return [];
  const delta = log.slice(turnStartIdx);
  const drawLogs = Array.isArray(state?._drawLogs) ? state._drawLogs : [];
  const firstDrawIdx = drawLogs.length ? delta.findIndex(line => line === drawLogs[0]) : -1;
  const beforeDrawLogs = firstDrawIdx >= 0 ? delta.slice(0, firstDrawIdx) : delta;
  return withoutLogLines(beforeDrawLogs, new Set(turnStartLogs));
}

function eventMsgs(events = [], fallbackMsgs = []) {
  const hints = [...new Set(events.map(ev => ev?.logHint).filter(Boolean))];
  return hints.length ? hints : fallbackMsgs;
}

function blackGoatPulseStep(events = []) {
  const first = events.find(ev => ev?.target != null);
  if (!first) return null;
  const loss = Math.max(
    1,
    Number(first?.from?.hp ?? 0) - Number(first?.to?.hp ?? first?.from?.hp ?? 0),
    Number(first?.from?.san ?? 0) - Number(first?.to?.san ?? first?.from?.san ?? 0)
  );
  return { type: 'BLACK_GOAT_PULSE', targetPid: first.target, count: loss, msgs: [] };
}

function tsgSlimePopStepFromEvent(event) {
  if (!event) return null;
  return {
    type: 'TSG_SLIME_POP',
    targetPid: event.playerIdx ?? 0,
    count: event.count || (Array.isArray(event.cards) ? event.cards.length : 1),
    cards: Array.isArray(event.cards) ? event.cards : [],
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
  };
}

export function buildTurnStartPreDrawEffectQueue({ oldGs, newGs, buildQueue = buildAnimQueue } = {}) {
  const beforeDrawPlayers = newGs?._playersBeforeThisDraw || newGs?.players || oldGs?.players || [];
  const preTurnPlayers = newGs?._preTurnPlayers || oldGs?.players || beforeDrawPlayers;
  const preDrawMsgs = getTurnStartPreDrawMsgs(newGs);
  const statEvents = getFreshStatEventsFromState(oldGs, newGs)
    .filter(isPreDrawTurnStartStatEvent)
    .filter(ev => !ev?.logHint || preDrawMsgs.includes(ev.logHint));
  const queue = [];
  const preDrawBlockedSteps = getVisualEvents(newGs)
    .filter(event => event?.type === VISUAL_EVENT.GOD_POWER_BLOCKED)
    .filter(event => (event?.msgs || []).some(msg => preDrawMsgs.includes(msg)))
    .map(event => godPowerBlockedStepFromEvent(event, newGs));
  queue.push(...preDrawBlockedSteps);
  const slimePopSteps = getVisualEvents(newGs)
    .filter(event => event?.type === VISUAL_EVENT.TSG_SLIME_POP)
    .filter(event => (event?.msgs || []).some(msg => preDrawMsgs.includes(msg)))
    .map(tsgSlimePopStepFromEvent)
    .filter(Boolean);
  queue.push(...slimePopSteps);
  const blackGoatEvents = statEvents.filter(isBlackGoatTurnStartStatEvent);
  if (blackGoatEvents.length) {
    const pulse = blackGoatPulseStep(blackGoatEvents);
    if (pulse) queue.push(pulse);
    const goatMsgs = eventMsgs(blackGoatEvents, preDrawMsgs);
    const hpEvents = blackGoatEvents.filter(ev => ev?.type === 'HP_LOSS' || ev?.type === 'HP_SAN_LOSS');
    const sanEvents = blackGoatEvents.filter(ev => ev?.type === 'SAN_LOSS' || ev?.type === 'HP_SAN_LOSS');
    if (hpEvents.length) queue.push(...statEventsToAnimQueue(hpEvents, preTurnPlayers, goatMsgs));
    if (sanEvents.length) queue.push(...statEventsToAnimQueue(sanEvents, preTurnPlayers, goatMsgs));
  }
  const linkHealEvents = statEvents.filter(isLinkHealTurnStartStatEvent);
  if (linkHealEvents.length) {
    queue.push(...statEventsToAnimQueue(linkHealEvents, preTurnPlayers, eventMsgs(linkHealEvents, preDrawMsgs)));
  }
  const inspectionEvents = getFreshInspectionEvents(oldGs, newGs)
    .filter(ev => {
      const lines = getInspectionLogLines([ev]);
      if (!lines.size) return false;
      return [...lines].some(line => preDrawMsgs.includes(line));
    });
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
    queue.push(...inspectionFlow.queue);
  }
  return queue;
}

function filterConsumedTurnStartSteps(queue = [], consumedMsgs = []) {
  const consumedMsgSet = new Set(consumedMsgs.filter(Boolean));
  return (Array.isArray(queue) ? queue : []).filter(step => {
    if (Array.isArray(step?.statEvents) && step.statEvents.some(isPreDrawTurnStartStatEvent)) return false;
    if (step?.type === 'BLACK_GOAT_PULSE') return false;
    if (step?.type === 'GOD_POWER_BLOCKED' && (step.msgs || []).some(msg => consumedMsgSet.has(msg))) return false;
    if (step?.type === 'TSG_SLIME_POP' && (step.msgs || []).some(msg => consumedMsgSet.has(msg))) return false;
    return true;
  });
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
  const turnStartPreDrawQ = buildTurnStartPreDrawEffectQueue({ oldGs, newGs, buildQueue });
  const hasTurnStartPreDrawQ = turnStartPreDrawQ.length > 0;
  const turnStartStatePatch = hasTurnStartPreDrawQ
    ? statePatchStep({ players: beforeDrawPlayers, discard: newGs?.discard })
    : null;
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
    sourcePile: newGs?.drawReveal?.sourcePile || newGs?._drawSourcePile || (newGs?.geomagneticReversalActive ? 'discard' : 'deck'),
    msgs: newGs?._drawLogs,
  };
  const drawResolutionLogs = [...(newGs?._drawLogs || []), ...(newGs?._statLogs || []), ...(newGs?.log || [])];
  const godDrawResolution = isGodDrawnCard(drawnCard) ? getGodDrawResolution(drawResolutionLogs, drawerName) : null;
  const discardedDrawnCard = !!newGs?._discardedDrawnCard || godDrawResolution === 'discard';
  const discardDrawnStep = discardedDrawnCard
    ? {
      type: 'DISCARD',
      card: drawnCard,
      triggerName: localDisplayName(drawerPid, drawerName),
      targetPid: drawerPid,
    }
    : null;
  const discardRestoreStep = discardedDrawnCard
    ? statePatchStep({ players: newGs?.players, discard: newGs?.discard })
    : null;
  const shouldPlayDrawKeepTransfer = !!drawnCard &&
    !discardedDrawnCard &&
    !newGs?.drawReveal?.card &&
    newGs?.phase !== 'GOD_CHOICE' &&
    (!isGodDrawnCard(drawnCard) || godDrawResolution === 'hand');
  const drawKeepTransferStep = shouldPlayDrawKeepTransfer
    ? cardTransferStep({
      fromPid: drawerPid,
      dest: 'player',
      toPid: drawerPid,
      count: 1,
      sourceAnchor: 'playerArea',
      effect: 'draw',
      cards: [drawnCard],
    })
    : null;
  const drawFullHandSwapQ = buildFullHandSwapTransferQueue(
    [...(newGs?._drawLogs || []), ...(newGs?._statLogs || [])],
    beforeDrawPlayers,
  );
  const treasureDodgeDiceStep = buildTreasureDodgeDiceStepFromLogs(
    [...(newGs?._drawLogs || []), ...(newGs?._statLogs || [])],
    drawerName,
  );
  const fallbackOldGsRaw = effectOldGs || {
    ...(oldGs || newGs || {}),
    players: beforeDrawPlayers,
    log: getTurnStartDrawBaselineLog(newGs),
  };
  const drawStatLogSet = new Set((Array.isArray(newGs?._statLogs) ? newGs._statLogs : []).filter(Boolean));
  const drawStatSeqs = (Array.isArray(newGs?._statEvents) ? newGs._statEvents : [])
    .filter(event => event?.seq != null && event?.logHint && drawStatLogSet.has(event.logHint))
    .map(event => event.seq);
  const drawOldStatSeq = drawStatSeqs.length
    ? Math.max(0, Math.min(...drawStatSeqs) - 1)
    : null;
  // 摸牌效果的基线状态代表「摸牌效果发生之前」，不应携带本次摸牌产生的视觉事件
  // （如地动山摇 earthquake）。清掉后，buildAnimQueue 才会把它判定为新事件并播放首次动画。
  const fallbackOldGs = {
    ...fallbackOldGsRaw,
    ...(drawOldStatSeq != null ? { _statEventSeq: drawOldStatSeq } : {}),
    ...(Array.isArray(fallbackOldGsRaw?._visualEvents) && fallbackOldGsRaw._visualEvents.length ? { _visualEvents: [] } : {}),
  };
  const inspectionEvents = getFreshInspectionEvents(oldGs, newGs);
  const preDrawMsgs = getTurnStartPreDrawMsgs(newGs);
  const turnStartInspectionEvents = inspectionEvents.filter(ev => {
    const lines = getInspectionLogLines([ev]);
    return lines.size && [...lines].some(line => preDrawMsgs.includes(line));
  });
  const turnStartInspectionSeqs = new Set(turnStartInspectionEvents.map(ev => ev?.seq).filter(seq => seq != null));
  const drawInspectionEvents = inspectionEvents.filter(ev => !turnStartInspectionSeqs.has(ev?.seq));
  const inspectionStatSeqs = getInspectionStatSeqs(inspectionEvents);
  const inspectionLogLines = getInspectionLogLines(inspectionEvents);
  const drawEffectQBase = filterConsumedTurnStartSteps(bindAnimLogChunks(
    buildQueue(fallbackOldGs, newGs),
    { statLogs: withoutLogLines(newGs?._statLogs, inspectionLogLines) },
  ), preDrawMsgs);
  const visualStatQ = buildFilteredStatStepsFromVisualEvents(
    newGs,
    beforeDrawPlayers,
    statEvent => !inspectionStatSeqs.has(statEvent?.seq) && !isPreDrawTurnStartStatEvent(statEvent),
    inspectionLogLines
  );
  const filteredDrawEffectQBase = filterFallbackDrawEffects(drawEffectQBase, newGs, visualStatQ);
  const drawEffectQWithVisualStats = visualStatQ.length
    ? [...visualStatQ, ...filteredDrawEffectQBase.filter(step => !isStatAnimationStep(step))]
    : filteredDrawEffectQBase;
  const inspectionQ = [];
  if (drawInspectionEvents.length) {
    const firstInspection = drawInspectionEvents[0];
    const inspectionFlow = buildInspectionEventFlow(
      {
        players: copyPlayers(firstInspection?.beforePlayers || beforeDrawPlayers),
        log: [...(firstInspection?.beforeLog || getTurnStartDrawBaselineLog(newGs))],
      },
      drawInspectionEvents,
      { buildAnimQueue: buildQueue, copyPlayers }
    );
    const maxInspectionSeq = Math.max(oldGs?._inspectionSeq || 0, ...drawInspectionEvents.map(ev => ev?.seq || 0));
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
  const hasDrawEffectVisualStep = drawEffectQ.some(step => step?.type !== 'STATE_PATCH');
  const drawEffectStatePatch = hasDrawEffectVisualStep
    ? statePatchStep({ players: newGs?.players, discard: newGs?.discard })
    : null;
  const queue = [
    ...boundarySteps,
    turnStartStep,
    ...turnStartPreDrawQ,
    ...(turnStartStatePatch ? [turnStartStatePatch] : []),
    drawCardStep,
    ...(discardDrawnStep ? [discardDrawnStep] : []),
    ...(discardRestoreStep ? [discardRestoreStep] : []),
    ...(treasureDodgeDiceStep ? [treasureDodgeDiceStep] : []),
    ...drawEffectQ,
    ...(drawKeepTransferStep ? [drawKeepTransferStep] : []),
    ...(drawEffectStatePatch ? [drawEffectStatePatch] : []),
  ];
  const startAnim = boundarySteps[0] || turnStartStep;
  const startQueue = [
    ...(boundarySteps.length ? [...boundarySteps.slice(1), turnStartStep] : []),
    ...turnStartPreDrawQ,
    ...(turnStartStatePatch ? [turnStartStatePatch] : []),
    drawCardStep,
    ...(discardDrawnStep ? [discardDrawnStep] : []),
    ...(discardRestoreStep ? [discardRestoreStep] : []),
    ...(treasureDodgeDiceStep ? [treasureDodgeDiceStep] : []),
    ...drawEffectQ,
    ...(drawKeepTransferStep ? [drawKeepTransferStep] : []),
    ...(drawEffectStatePatch ? [drawEffectStatePatch] : []),
  ];
  if (newGs?.phase === 'GOD_CHOICE') {
    try {
      console.log('[BUG2-DIAG] turnStart god-draw queue', {
        drawnCard: drawnCard?.name,
        queueTypes: queue.map(s => s?.type),
        drawEffectTypes: drawEffectQ.map(s => s?.type),
        statEvents: (Array.isArray(newGs?._statEvents) ? newGs._statEvents : []).map(e => ({ type: e?.type, target: e?.target, seq: e?.seq })),
        statLogs: newGs?._statLogs,
        drawLogs: newGs?._drawLogs,
      });
    } catch { /* noop */ }
  }
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
    visualLock: hasTurnStartPreDrawQ && newGs?._preTurnPlayers
      ? { players: newGs._preTurnPlayers, zhuLight: oldGs?.zhuLight || newGs?.zhuLight || null }
      : newGs?._playersBeforeThisDraw
      ? { players: beforeDrawPlayers, zhuLight: oldGs?.zhuLight || newGs?.zhuLight || null }
      : null,
  };
}
