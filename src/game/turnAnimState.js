import { copyPlayers, removeCardsFromDiscard } from './coreUtils';
import { isAiSeat, localDisplayName } from './rotateState';
import { bindAnimLogChunks } from './animLogs';
import { buildAnimQueue, buildFullHandSwapTransferQueueFromLogs } from './animQueueCore';
import { buildInspectionEventFlow, cardTransferStep, prepareWorshipHighlight, statePatchStep } from './animQueueHelpers';
import {
  getVisualEvents,
  VISUAL_EVENT,
  buildTurnStartStepFromVisualEvents,
  buildTsathogguaSlimeGrantSteps,
  isPreDrawTurnStartStatEvent,
} from './visualEvents';
import { statEventsToAnimQueue } from './statEvents';
import { compileRuleVisualEventsToAnimTransaction } from './visualEventTransactionCompiler';

export const EMPTY_TURN_ANIM_FIELDS = Object.freeze({
  _aiDrawnCard: null,
  _drawnCard: null,
  _drawSourcePile: null,
  _discardedDrawnCard: false,
  _playersBeforeThisDraw: null,
  _turnStartLogs: [],
  _drawLogs: [],
  _turnDrawEvents: [], // legacy-visual-allow: clear compatibility input after replay
  _statLogs: [],
  _statEvents: [],
  _preTurnPlayers: null,
  _tsgSlimeGrantEvents: null, // legacy-visual-allow: old save/peer cleanup
  _earthquakeBeforePlayers: null,
  _earthquakeBeforeDiscard: null,
  _earthquakeDiscardEvents: null,
});

// A turn transition keeps the ownership banner separate from rule-bearing
// turn-start effects. A face-down player may therefore show TURN_BANNER while
// executing no TURN_START or DRAW stage at all.
export const TURN_START_ANIMATION_STAGE = Object.freeze({
  TURN_BOUNDARY: 'turnBoundary',
  TURN_BANNER: 'turnBanner',
  TURN_START: 'turnStart',
  DRAW: 'draw',
});

export function markTurnStartAnimationStage(queue = [], stage) {
  return (Array.isArray(queue) ? queue : []).filter(Boolean).map(step => ({
    ...step,
    turnStartStage: step?.turnStartStage || stage,
  }));
}

export function splitTurnStartAnimationStages(queue = []) {
  const stages = {
    [TURN_START_ANIMATION_STAGE.TURN_BOUNDARY]: [],
    [TURN_START_ANIMATION_STAGE.TURN_BANNER]: [],
    [TURN_START_ANIMATION_STAGE.TURN_START]: [],
    [TURN_START_ANIMATION_STAGE.DRAW]: [],
  };
  (Array.isArray(queue) ? queue : []).forEach(step => {
    const stage = step?.turnStartStage === TURN_START_ANIMATION_STAGE.TURN_BOUNDARY
      ? TURN_START_ANIMATION_STAGE.TURN_BOUNDARY
      : step?.turnStartStage === TURN_START_ANIMATION_STAGE.TURN_BANNER
        ? TURN_START_ANIMATION_STAGE.TURN_BANNER
      : step?.turnStartStage === TURN_START_ANIMATION_STAGE.DRAW
        ? TURN_START_ANIMATION_STAGE.DRAW
        : TURN_START_ANIMATION_STAGE.TURN_START;
    stages[stage].push(step);
  });
  return stages;
}

export function scopeTurnStartVisualEvents(events = []) {
  return (Array.isArray(events) ? events : []).filter(event => !!event?.turnStartStage);
}

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
  const explicitEvents = getVisualEvents(state)
    .filter(event => event?.type === VISUAL_EVENT.TSG_SLIME_GRANT);
  const explicitKeys = new Set(explicitEvents.map(event => `${event?.ownerIdx}:${event?.count}`));
  const events = (Array.isArray(state?._tsgSlimeGrantEvents) ? state._tsgSlimeGrantEvents : [])
    .filter(event => !explicitKeys.has(`${event?.ownerIdx}:${event?.count}`));
  const queue = buildGodPowerBlockedBoundaryQueue(state);
  explicitEvents.forEach(event => queue.push(...buildTsathogguaSlimeGrantSteps(event, state)));
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
    ...(event?.id ? { visualEventId: event.id } : {}),
  };
}

function getGodPowerBlockedBoundaryEvents(state) {
  const log = Array.isArray(state?.log) ? state.log : [];
  const turnStartLine = Array.isArray(state?._turnStartLogs) ? state._turnStartLogs[0] : null;
  const turnStartIdx = turnStartLine ? log.lastIndexOf(turnStartLine) : -1;
  if (turnStartIdx < 0) return [];
  return getVisualEvents(state)
    .filter(event => event?.type === VISUAL_EVENT.GOD_POWER_BLOCKED)
    .filter(event => {
      const msgs = Array.isArray(event?.msgs) ? event.msgs : [];
      return msgs.some(msg => {
        const idx = log.indexOf(msg);
        return idx >= 0 && idx < turnStartIdx;
      });
    });
}

function buildGodPowerBlockedBoundaryQueue(state) {
  return getGodPowerBlockedBoundaryEvents(state)
    .map(event => godPowerBlockedStepFromEvent(event, state));
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
  if (state?.phase === 'ZONE_SWAP_SELECT_TARGET') return state.abilityData?.zoneSwapCard || null;
  return state?.phase === 'GOD_CHOICE'
    ? state.abilityData?.godCard
    : state?.drawReveal?.card;
}

function sameDrawCard(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.id != null && b.id != null) return a.id === b.id;
  return [a.key, a.godKey, a.name, a.type].filter(Boolean).join(':') ===
    [b.key, b.godKey, b.name, b.type].filter(Boolean).join(':');
}

function addCardToHandSnapshot(players = [], playerIdx = 0, card = null) {
  if (!Array.isArray(players) || !card || !players[playerIdx]) return players;
  return copyPlayers(players).map((player, idx) => idx === playerIdx ? {
    ...player,
    hand: (player.hand || []).some(candidate => sameDrawCard(candidate, card))
      ? [...(player.hand || [])]
      : [...(player.hand || []), card],
  } : player);
}

function normalizeTurnDrawEvents(state, fallbackCard, drawerPid, drawerName) {
  const allExplicitEvents = getVisualEvents(state)
    .filter(event => event?.type === VISUAL_EVENT.DRAW_CARD && event?.card);
  const currentDrawerEvents = allExplicitEvents.filter(event => event.playerIdx === drawerPid);
  const explicitEvents = (currentDrawerEvents.length ? currentDrawerEvents : allExplicitEvents)
    .map(event => ({
      ...event,
      drawerIdx: event.playerIdx ?? drawerPid,
      drawerName: event.playerName || drawerName,
      msgs: Array.isArray(event.msgs) ? event.msgs : [],
    }));
  if (explicitEvents.length) return explicitEvents;
  // Compatibility only: old saves/peers may still carry draw snapshots.
  const events = (Array.isArray(state?._turnDrawEvents) ? state._turnDrawEvents : [])
    .filter(event => event?.card)
    .map(event => ({
      ...event,
      drawerIdx: event.drawerIdx ?? drawerPid,
      drawerName: event.drawerName || drawerName,
      msgs: Array.isArray(event.msgs) ? event.msgs : [],
    }));
  if (fallbackCard && !events.some(event => sameDrawCard(event.card, fallbackCard))) {
    events.push({
      card: fallbackCard,
      drawerIdx: drawerPid,
      drawerName,
      sourcePile: state?.drawReveal?.sourcePile || state?._drawSourcePile || (state?.geomagneticReversalActive ? 'discard' : 'deck'),
      msgs: state?._drawLogs || [],
    });
  }
  return events;
}

const DECK_RESHUFFLE_LOG = '牌堆耗尽，重洗弃牌堆';

function deckReshuffleStep(msgs = []) {
  const reshuffleMsgs = (Array.isArray(msgs) ? msgs : []).filter(msg => msg === DECK_RESHUFFLE_LOG);
  return reshuffleMsgs.length ? { type: 'DECK_RESHUFFLE', msgs: reshuffleMsgs } : null;
}

function withoutDeckReshuffleLog(msgs = []) {
  return (Array.isArray(msgs) ? msgs : []).filter(msg => msg !== DECK_RESHUFFLE_LOG);
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

function getFirstInspectionStatSeq(inspectionEvents = []) {
  const firstEvent = (inspectionEvents || []).find(Boolean);
  if (!firstEvent) return null;
  const seqs = [
    firstEvent?.statEventSeq,
    ...(Array.isArray(firstEvent?.statEvents) ? firstEvent.statEvents.map(statEvent => statEvent?.seq) : []),
  ].filter(seq => seq != null);
  if (!seqs.length) return null;
  return Math.min(...seqs);
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

function getCurrentTurnResolutionLogs(state) {
  const log = Array.isArray(state?.log) ? state.log : [];
  const turnStartLines = Array.isArray(state?._turnStartLogs) ? state._turnStartLogs : [];
  const turnStartIdx = turnStartLines.length ? log.lastIndexOf(turnStartLines[0]) : -1;
  return turnStartIdx >= 0 ? log.slice(turnStartIdx) : log;
}

function buildFilteredStatStepsFromVisualEvents(state, players, shouldKeepEvent, excludedMsgs = new Set()) {
  const event = getVisualEvents(state).findLast(ev => ev?.type === VISUAL_EVENT.STAT_EVENTS && Array.isArray(ev.statEvents) && ev.statEvents.length);
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

function isPoisonTurnStartStatEvent(event) {
  return event?.reason === '中毒' || String(event?.logHint || '').includes('【中毒】');
}

function getFreshStatEventsFromState(oldGs, newGs) {
  const oldSeq = oldGs?._statEventSeq || 0;
  const visualEvents = getVisualEvents(newGs);
  const stagedTurnStartEvents = visualEvents.filter(event => !!event?.turnStartStage);
  const authoritativeEvents = stagedTurnStartEvents.length
    ? stagedTurnStartEvents
    : visualEvents;
  const visualStatEvents = authoritativeEvents
    .filter(ev => ev?.type === VISUAL_EVENT.STAT_EVENTS && Array.isArray(ev.statEvents) && ev.statEvents.length)
    .flatMap(ev => ev.statEvents)
    .filter(ev => ev && (ev.seq == null || ev.seq > oldSeq));
  // startNextTurn emits a complete staged transaction, including an explicit
  // absence of statEvents when the new turn did not change HP/SAN. In that
  // path _statEvents is only retained as a cross-turn history/watermark. Falling
  // back to it against a React callback's older gs snapshot reclassifies the
  // previous action (notably rest healing) as a fresh draw effect.
  if (stagedTurnStartEvents.length || visualStatEvents.length) return visualStatEvents;
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
  const playersBefore = Array.isArray(event.playersBefore) ? event.playersBefore : null;
  const playersAfter = Array.isArray(event.playersAfter) ? event.playersAfter : null;
  return {
    type: 'TSG_SLIME_POP',
    targetPid: event.playerIdx ?? event.targetPid ?? 0,
    count: event.count || (Array.isArray(event.cards) ? event.cards.length : 1),
    cards: Array.isArray(event.cards) ? event.cards : [],
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
    ...(playersBefore ? { visualSetupPatch: { players: playersBefore } } : {}),
    ...(playersBefore && playersAfter ? {
      visualTimeline: [
        { atMs: 0, patch: { players: playersBefore } },
        // The bubble is visibly gone by this point; commit the consumed hand
        // snapshot before the next draw/god/inspection animation starts.
        { atMs: 620, patch: { players: playersAfter } },
      ],
    } : {}),
  };
}

export function buildTurnStartPreDrawEffectQueue({
  oldGs,
  newGs,
  buildQueue = buildAnimQueue,
  consumedVisualEventIds = null,
} = {}) {
  const beforeDrawPlayers = newGs?._playersBeforeThisDraw || newGs?.players || oldGs?.players || [];
  const preTurnPlayers = newGs?._preTurnPlayers || oldGs?.players || beforeDrawPlayers;
  const preDrawMsgs = getTurnStartPreDrawMsgs(newGs);
  const preDrawMsgSet = new Set(preDrawMsgs);
  const statEventKey = ev => [ev?.seq ?? '', ev?.type ?? '', ev?.target ?? '', ev?.logHint ?? ''].join(':');
  const statEventsByKey = new Map();
  [
    ...getFreshStatEventsFromState(oldGs, newGs),
    ...(Array.isArray(newGs?._statEvents) ? newGs._statEvents : []),
  ]
    .filter(isPreDrawTurnStartStatEvent)
    .filter(ev => !ev?.logHint || preDrawMsgSet.has(ev.logHint))
    .forEach(ev => statEventsByKey.set(statEventKey(ev), ev));
  const statEvents = [...statEventsByKey.values()];
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
  const poisonEvents = statEvents.filter(isPoisonTurnStartStatEvent);
  if (poisonEvents.length) {
    queue.push(...statEventsToAnimQueue(poisonEvents, preTurnPlayers, eventMsgs(poisonEvents, preDrawMsgs)));
  }
  const linkHealEvents = statEvents.filter(isLinkHealTurnStartStatEvent);
  if (linkHealEvents.length) {
    queue.push(...statEventsToAnimQueue(linkHealEvents, preTurnPlayers, eventMsgs(linkHealEvents, preDrawMsgs)));
  }
  const explicitInspectionEvents = getVisualEvents(newGs)
    .filter(event => (
      event?.type === VISUAL_EVENT.INSPECTION &&
      event?.turnStartStage === TURN_START_ANIMATION_STAGE.TURN_START
    ));
  const explicitInspectionSeqs = new Set(
    explicitInspectionEvents.map(event => event?.legacySeq).filter(seq => seq != null)
  );
  if (explicitInspectionEvents.length) {
    const inspectionTransaction = compileRuleVisualEventsToAnimTransaction(newGs, oldGs, {
      eventIds: explicitInspectionEvents.map(event => event.id).filter(Boolean),
      buildAnimQueue: buildQueue,
      players: beforeDrawPlayers,
      ...(consumedVisualEventIds ? { consumedEventIds: consumedVisualEventIds } : {}),
    });
    queue.push(...(inspectionTransaction?.queue || []));
  }
  // Compatibility only: old saves/peers may carry `_inspectionEvents` without
  // canonical visual events. Never reconstruct an inspection already owned by
  // an explicit event, or it will be emitted once here and once by the staged
  // transaction compiler.
  const inspectionEvents = getFreshInspectionEvents(oldGs, newGs)
    .filter(event => !explicitInspectionSeqs.has(event?.seq))
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

export function buildSkippedTurnReplayQueue(state, { buildQueue = buildAnimQueue, bannersOnly = false } = {}) {
  const replays = Array.isArray(state?._skippedTurnReplays) ? state._skippedTurnReplays : [];
  return replays.flatMap(replay => {
    const turnBanner = {
      type: 'YOUR_TURN',
      turnStartStage: TURN_START_ANIMATION_STAGE.TURN_BANNER,
      name: localDisplayName(replay.playerIdx, replay.playerName || state?.players?.[replay.playerIdx]?.name || '???'),
      msgs: replay.turnStartLogs || [],
    };
    // A decision gate only needs the skipped player's visible turn boundary.
    // Replaying state patches or draw/effect steps can restore an already
    // skipped phase while the decision UI is waiting to open.
    if (bannersOnly) return [turnBanner];
    const cthReplay = replay.cthReplay;
    const preCthPlayers = cthReplay?.beforePlayers || replay.afterPlayers || state?.players || [];
    const preCthLog = cthReplay?.beforeLog || replay.afterLog || replay.beforeLog || [];
    const oldGs = {
      ...state,
      players: replay.beforePlayers || state?.players || [],
      log: replay.beforeLog || [],
      _statEventSeq: replay.beforeStatSeq || 0,
      _inspectionSeq: replay.beforeInspectionSeq || 0,
    };
    const newGs = {
      ...state,
      currentTurn: replay.playerIdx,
      players: preCthPlayers,
      log: preCthLog,
      _preTurnPlayers: replay.beforePlayers || state?._preTurnPlayers,
      _playersBeforeThisDraw: replay.afterPlayers || state?._playersBeforeThisDraw,
      _turnStartLogs: replay.turnStartLogs || [],
      _drawLogs: [],
      _statLogs: [],
      _statEventSeq: cthReplay?.beforeStatSeq ?? replay.afterStatSeq ?? replay.beforeStatSeq ?? 0,
      _inspectionSeq: replay.afterInspectionSeq || replay.beforeInspectionSeq || 0,
    };
    const effectQueue = buildTurnStartPreDrawEffectQueue({ oldGs, newGs, buildQueue });
    const consumedLogs = new Set([
      ...(replay.turnStartLogs || []),
      ...effectQueue.flatMap(step => Array.isArray(step?.msgs) ? step.msgs : []),
    ]);
    const deltaLogs = preCthLog.slice((replay.beforeLog || []).length);
    const remainingLogs = withoutLogLines(deltaLogs, consumedLogs);
    const queue = [
      turnBanner,
      ...(!replay.restingSkip ? effectQueue : []),
      statePatchStep({ players: preCthPlayers, log: preCthLog, msgs: remainingLogs }),
    ];
    if (cthReplay?.draws?.length) {
      const dreamLog = (cthReplay.drawLogs || []).find(msg => typeof msg === 'string' && msg.includes('梦访拉莱耶'));
      queue.push({
        type: 'CTH_RLYEH_DREAM',
        targetPid: replay.playerIdx,
        msgs: dreamLog ? [dreamLog] : [],
      });
      cthReplay.draws.forEach(card => {
        const drawMsg = (cthReplay.drawLogs || []).find(msg =>
          typeof msg === 'string' && (msg.includes(card.name) || (card.key && msg.includes(card.key)))
        );
        queue.push({
          type: 'DRAW_CARD',
          card,
          triggerName: replay.playerName || state?.players?.[replay.playerIdx]?.name || '???',
          targetPid: replay.playerIdx,
          msgs: drawMsg ? [drawMsg] : [],
        });
      });
      const cthEffectOldGs = {
        ...state,
        currentTurn: replay.playerIdx,
        players: cthReplay.beforePlayers,
        discard: cthReplay.beforeDiscard,
        log: cthReplay.beforeLog,
        _statEventSeq: cthReplay.beforeStatSeq || 0,
      };
      const cthEffectNewGs = {
        ...state,
        currentTurn: replay.playerIdx,
        players: cthReplay.afterPlayers,
        discard: cthReplay.afterDiscard,
        log: cthReplay.afterLog,
        _statEventSeq: cthReplay.afterStatSeq || cthReplay.beforeStatSeq || 0,
      };
      queue.push(...bindAnimLogChunks(buildQueue(cthEffectOldGs, cthEffectNewGs), {
        statLogs: cthReplay.drawLogs || [],
      }));
      queue.push(statePatchStep({
        players: cthReplay.afterPlayers,
        discard: cthReplay.afterDiscard,
        log: cthReplay.afterLog,
      }));
    }
    queue.push({ type: 'TURN_BOUNDARY_PAUSE' });
    return queue;
  });
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
  consumedVisualEventIds = null,
  buildQueue = buildAnimQueue,
  buildFullHandSwapTransferQueue = buildFullHandSwapTransferQueueFromLogs,
} = {}) {
  const boundarySteps = [
    ...(timedOutDrawDiscardStep ? [timedOutDrawDiscardStep] : []),
    ...(Array.isArray(preTurnSteps) ? preTurnSteps.filter(Boolean) : []),
  ];
  const drawnCard = getTurnStartDrawnCard(newGs);
  if (!drawnCard) {
    const turnStartStageQueue = markTurnStartAnimationStage(
      boundarySteps,
      TURN_START_ANIMATION_STAGE.TURN_START,
    );
    return {
      drawnCard: null,
      beforeDrawPlayers: newGs?.players || oldGs?.players || [],
      drawEffectQ: [],
      stageQueues: {
        [TURN_START_ANIMATION_STAGE.TURN_START]: turnStartStageQueue,
        [TURN_START_ANIMATION_STAGE.DRAW]: [],
      },
      queue: turnStartStageQueue,
      startAnim: turnStartStageQueue[0] || null,
      startQueue: turnStartStageQueue.slice(1),
      visualLock: null,
      inspectionEvents: [],
    };
  }
  const drawerPid = getTurnStartDrawerIdx(newGs);
  const drawerName = newGs?.players?.[drawerPid]?.name || '???';
  const explicitTurnDrawEvents = getVisualEvents(newGs)
    .filter(event => event?.type === VISUAL_EVENT.DRAW_CARD && event?.card && event.playerIdx === drawerPid);
  const reshuffleVisualEvents = getVisualEvents(newGs)
    .filter(event => event?.type === VISUAL_EVENT.DECK_RESHUFFLE);
  const hasExplicitTurnDrawEvents = explicitTurnDrawEvents.length > 0;
  const hasStructuredTurnDrawEvents = hasExplicitTurnDrawEvents
    || (Array.isArray(newGs?._turnDrawEvents) && newGs._turnDrawEvents.some(event => event?.card));
  const turnDrawEvents = normalizeTurnDrawEvents(newGs, drawnCard, drawerPid, drawerName);
  const beforeDrawPlayers = newGs?._playersBeforeThisDraw || oldGs?.players || newGs?.players || [];
  const turnStartPreDrawQ = buildTurnStartPreDrawEffectQueue({
    oldGs,
    newGs,
    buildQueue,
    consumedVisualEventIds,
  });
  const hasTurnStartPreDrawQ = turnStartPreDrawQ.length > 0;
  const turnStartStatePatch = hasTurnStartPreDrawQ
    ? statePatchStep({
        players: beforeDrawPlayers,
        // Keep the AI's current-turn draw decision hidden until the dedicated
        // draw/discard animations play. If the drawn card was discarded, strip
        // it from the visible discard pile during pre-draw animations.
        discard: (() => {
          if (!newGs?._playersBeforeThisDraw || !newGs?._discardedDrawnCard) return newGs?.discard;
          const drawnCard = getTurnStartDrawnCard(newGs);
          return drawnCard ? removeCardsFromDiscard(newGs.discard, [drawnCard]) : newGs?.discard;
        })(),
      })
    : null;
  const turnStartStepBase = buildTurnStartStepFromVisualEvents(newGs) || {
    type: 'YOUR_TURN',
    turnStartStage: TURN_START_ANIMATION_STAGE.TURN_BANNER,
    ...(drawerPid === 0 ? {} : { name: drawerName }),
    msgs: newGs?._turnStartLogs,
  };
  const turnStartStep = {
    ...turnStartStepBase,
    // The discard pile is presentation state while this transaction plays.
    // Pin its pre-draw snapshot at queue start, then let the STATE_PATCH after
    // DISCARD reveal the resolved pile. This keeps the turn banner/draw reveal
    // from exposing a discarded card early without inferring from temp fields.
    visualSetupPatch: {
      ...(turnStartStepBase.visualSetupPatch || {}),
      discard: [...(oldGs?.discard || [])],
    },
    visualSetupTiming: 'queueStart',
  };
  const drawCardStep = {
    type: 'DRAW_CARD',
    card: drawnCard,
    triggerName: localDisplayName(drawerPid, drawerName),
    targetPid: drawerPid,
    sourcePile: newGs?.drawReveal?.sourcePile || newGs?._drawSourcePile || (newGs?.geomagneticReversalActive ? 'discard' : 'deck'),
    msgs: withoutDeckReshuffleLog(newGs?._drawLogs),
  };
  const hasEventBoundReshuffle = reshuffleVisualEvents.length > 0
    || turnDrawEvents.some(event => deckReshuffleStep(event.msgs));
  const reshuffleLandingStep = statePatchStep({
    // The rule state has already completed the following draw, while the
    // presentation is still between reshuffle and draw. Restore the cards
    // that visibly moved out of the old discard pile so the draw animation
    // starts from a non-empty deck.
    deck: [...(oldGs?.discard || [])],
    discard: [],
  });
  const drawCardSteps = hasStructuredTurnDrawEvents
    ? turnDrawEvents.flatMap((event, eventIdx) => {
      const explicitReshuffleSteps = reshuffleVisualEvents
        .filter(reshuffle => reshuffle?.drawEventId === event?.id)
        .map(reshuffle => ({
          type: 'DECK_RESHUFFLE',
          visualEventId: reshuffle.id,
          msgs: reshuffle.msgs || [],
        }));
      const reshuffleStep = explicitReshuffleSteps.length ? null : deckReshuffleStep(event.msgs);
      const drawStep = {
        type: 'DRAW_CARD',
        ...(event?.id ? { visualEventId: event.id } : {}),
        _drawEventId: event?.id || `legacy-draw-${eventIdx}`,
        card: event.card,
        triggerName: localDisplayName(event.drawerIdx ?? drawerPid, event.drawerName || drawerName),
        targetPid: event.drawerIdx ?? drawerPid,
        sourcePile: event.sourcePile || newGs?.drawReveal?.sourcePile || newGs?._drawSourcePile || (newGs?.geomagneticReversalActive ? 'discard' : 'deck'),
        msgs: withoutDeckReshuffleLog(event.msgs),
        // 同步结算的邪神遭遇（黏液额外摸牌）把其视觉事件 id 记在
        // godEncounter.visualEventIds 上；给翻牌步骤标记来源摸牌事件下标，
        // 后面才能把遭遇块精确插到这张牌翻牌之后。
      };
      const steps = [];
      if (eventIdx === 0 && !hasEventBoundReshuffle) {
        const fallbackReshuffleStep = deckReshuffleStep(newGs?._drawLogs);
        if (fallbackReshuffleStep) steps.push(fallbackReshuffleStep, reshuffleLandingStep);
      }
      if (event.slimePop) {
        steps.push(tsgSlimePopStepFromEvent({
          ...event.slimePop,
          targetPid: event.slimePop.targetPid ?? event.drawerIdx ?? drawerPid,
        }));
      }
      steps.push(...explicitReshuffleSteps);
      if (explicitReshuffleSteps.length) steps.push(reshuffleLandingStep);
      if (reshuffleStep) steps.push(reshuffleStep, reshuffleLandingStep);
      steps.push(drawStep);
      return steps;
    })
    : (() => {
      const fallbackReshuffleStep = deckReshuffleStep(newGs?._drawLogs);
      return [
        fallbackReshuffleStep,
        ...(fallbackReshuffleStep ? [reshuffleLandingStep] : []),
        drawCardStep,
      ].filter(Boolean);
    })();
  // A previous player's god choice can remain in the accumulated game log. Only
  // inspect this turn's section, otherwise an earlier "放弃邪神的馈赠" makes a
  // newly drawn and worshipped god play a bogus discard animation.
  const drawResolutionLogs = [
    ...(newGs?._drawLogs || []),
    ...(newGs?._statLogs || []),
    ...getCurrentTurnResolutionLogs(newGs),
  ];
  const drawnGodKeptInHand = isGodDrawnCard(drawnCard) &&
    (newGs?.players?.[drawerPid]?.hand || []).some(card => sameDrawCard(card, drawnCard));
  const godDrawResolution = isGodDrawnCard(drawnCard)
    ? (drawnGodKeptInHand ? 'hand' : getGodDrawResolution(drawResolutionLogs, drawerName))
    : null;
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
  const eventOwnedKeepDraws = turnDrawEvents.filter(event => (
    event?.id &&
    event?.keptInHand &&
    !isGodDrawnCard(event.card) &&
    Array.isArray(event.playersAfterKeep)
  ));
  const eventOwnedKeepEventById = new Map(eventOwnedKeepDraws.map(event => [event.id, event]));
  const eventOwnedKeepStepsByDrawId = new Map(eventOwnedKeepDraws.map(event => [
    event.id,
    [
      cardTransferStep({
        fromPid: event.drawerIdx ?? drawerPid,
        dest: 'player',
        toPid: event.drawerIdx ?? drawerPid,
        count: 1,
        sourceAnchor: 'playerArea',
        effect: 'draw',
        cards: [event.card],
      }),
      statePatchStep({ players: event.playersAfterKeep }),
    ],
  ]));
  const drawKeepTransferStep = shouldPlayDrawKeepTransfer && !eventOwnedKeepStepsByDrawId.size
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
  // End-turn god-power blocks are presented by the boundary queue before the
  // next player's turn banner. Carry their ids into the draw-effect baseline so
  // the generic replay builder cannot mistake the same cardless event for a
  // fresh draw effect and play the shield again after YOUR_TURN.
  const boundaryGodPowerBlockedIds = new Set(
    getGodPowerBlockedBoundaryEvents(newGs).map(event => event?.id).filter(Boolean)
  );
  const newVisualEvents = Array.isArray(newGs?._visualEvents) ? newGs._visualEvents : [];
  const hasStagedTurnStartEvents = newVisualEvents.some(event => !!event?.turnStartStage);
  const currentTurnLog = Array.isArray(newGs?.log) ? newGs.log : [];
  const currentTurnStartLine = newGs?._turnStartLogs?.[0];
  const currentTurnStartIndex = currentTurnStartLine ? currentTurnLog.lastIndexOf(currentTurnStartLine) : -1;
  const currentTurnMsgSet = new Set(currentTurnStartIndex >= 0 ? currentTurnLog.slice(currentTurnStartIndex) : [
    ...(newGs?._drawLogs || []),
    ...(newGs?._statLogs || []),
  ]);
  const belongsToCurrentTurn = event => (
    (event?.card && sameDrawCard(event.card, drawnCard)) ||
    (Array.isArray(event?.msgs) && event.msgs.some(msg => currentTurnMsgSet.has(msg)))
  );
  const staleVisualEvents = newVisualEvents
    .filter(event => (
      boundaryGodPowerBlockedIds.has(event?.id) ||
      event?.type === VISUAL_EVENT.GOD_STATUS_CHANGED ||
      (event?.card && !sameDrawCard(event?.card, drawnCard)) ||
      // Once a complete staged turn transaction exists, untagged events belong
      // to the action/end-turn history that produced it. Treat them as baseline
      // even when they have no card/log hint (for example an endless-corridor
      // throwStone event); otherwise the next draw compiles that action again.
      (hasStagedTurnStartEvents && !event?.turnStartStage && !belongsToCurrentTurn(event))
    ));
  const baselineVisualEvents = [
    ...staleVisualEvents,
  ].filter((event, index, events) => (
    !event?.id || events.findIndex(candidate => candidate?.id === event.id) === index
  ));
  const drawStatLogSet = new Set((Array.isArray(newGs?._statLogs) ? newGs._statLogs : []).filter(Boolean));
  const drawStatSeqs = (Array.isArray(newGs?._statEvents) ? newGs._statEvents : [])
    .filter(event => event?.seq != null && event?.logHint && drawStatLogSet.has(event.logHint))
    .map(event => event.seq);
  const visualDrawStatSeqs = getFreshStatEventsFromState(oldGs, newGs)
    .filter(event => event?.seq != null && !isPreDrawTurnStartStatEvent(event))
    .map(event => event.seq);
  const effectiveDrawStatSeqs = drawStatSeqs.length ? drawStatSeqs : visualDrawStatSeqs;
  const hasAuthoritativeTurnStartEvents = getVisualEvents(newGs).some(event => !!event?.turnStartStage);
  const drawOldStatSeq = effectiveDrawStatSeqs.length
    ? Math.max(0, Math.min(...effectiveDrawStatSeqs) - 1)
    // An explicit staged transaction with no stat event means "no HP/SAN
    // change in this turn", not "infer every event newer than oldGs". Advance
    // the fallback compiler to the retained watermark so callback closures from
    // the previous action cannot replay already committed stat history.
    : hasAuthoritativeTurnStartEvents
      ? Math.max(
          oldGs?._statEventSeq || 0,
          newGs?._statEventSeq || 0,
          ...(Array.isArray(newGs?._statEvents) ? newGs._statEvents : []).map(event => event?.seq || 0),
        )
      : null;
  // 只回退到「本次摸牌新产生」的随机目标事件之前。_randomTargetEvents 会随 gs 跨回合
  // 残留（如上一回合行动阶段打出的投掷石块），若按全部事件回退水位，会把旧事件重新
  // 判定为新事件，在翻牌动画后重播骰子/转盘/石块飞行。旧水位取标量与旧事件列表的较大
  // 值，与 buildAnimQueue 对 _statEvents 的防御口径一致。
  const oldRandomTargetSeq = Math.max(
    oldGs?._randomTargetSeq || 0,
    ...(Array.isArray(oldGs?._randomTargetEvents) ? oldGs._randomTargetEvents : []).map(event => event?.seq || 0),
  );
  const randomTargetEvents = Array.isArray(newGs?._randomTargetEvents) ? newGs._randomTargetEvents : [];
  // Some queued AI-turn entry points build oldGs from the already-resolved
  // next state. Rewind only for a random-target event that the currently drawn
  // card can actually have produced. Otherwise retained events from an older
  // turn (for example 钻地魔虫 before a later 霉变食物 draw) must advance the
  // baseline watermark instead of being replayed beside the new dice roll.
  const drawCanCreateRandomTarget = drawnCard?.type === 'throwStone'
    || drawnCard?.type === 'allDamageHPRandomExtra';
  const currentDrawRandomTargetSeq = drawCanCreateRandomTarget
    ? Math.max(0, ...randomTargetEvents
      .filter(event => event?.sourceIdx === drawerPid && event?.label === drawnCard?.name)
      .map(event => event?.seq || 0))
    : 0;
  const latestRetainedRandomTargetSeq = Math.max(
    oldRandomTargetSeq,
    ...randomTargetEvents.map(event => event?.seq || 0),
  );
  const drawOldRandomTargetSeq = currentDrawRandomTargetSeq > 0
    ? Math.max(0, currentDrawRandomTargetSeq - 1)
    : latestRetainedRandomTargetSeq;
  const currentMoldySeq = newGs?._moldyFoodDiceRoll?.seq ?? newGs?._moldyFoodDiceSeq;
  const hasCurrentDrawMoldyLog = [
    ...(newGs?._drawLogs || []),
    ...(newGs?._statLogs || []),
  ].some(line => typeof line === 'string' && line.startsWith('【霉变食物】') && line.includes('掷出'));
  // AI draw replay is often built from the already-resolved turn state. In that
  // path effectOldGs carries the current roll watermark too, so buildAnimQueue
  // mistakes this draw's moldy-food roll for an event it has already presented.
  // Rewind only when the current draw metadata owns a moldy-food result; stale
  // rolls from earlier turns have no matching _drawLogs/_statLogs entry here.
  const drawOldMoldySeq = hasCurrentDrawMoldyLog && currentMoldySeq != null
    ? Math.max(0, currentMoldySeq - 1)
    : null;
  // 摸牌效果的基线状态代表「摸牌效果发生之前」，不应携带本次摸牌产生的视觉事件
  // （如地动山摇 earthquake）。清掉后，buildAnimQueue 才会把它判定为新事件并播放首次动画。
  const fallbackOldGs = {
    ...fallbackOldGsRaw,
    ...(drawOldStatSeq != null ? { _statEventSeq: drawOldStatSeq } : {}),
    ...(drawOldRandomTargetSeq != null ? { _randomTargetSeq: drawOldRandomTargetSeq } : {}),
    ...(drawOldMoldySeq != null ? {
      _moldyFoodDiceSeq: drawOldMoldySeq,
      _moldyFoodDiceRoll: null,
    } : {}),
    // Keep card-effect events that belong to older cards in the baseline. Remote
    // snapshots may still carry them after their replay hints were consumed; if
    // they are cleared here, the next draw mistakes them for fresh effects and
    // replays the previous card's bespoke animation before the decision modal.
    _visualEvents: baselineVisualEvents,
  };
  // 新鲜度判据与迁移适配器（animationTransaction.prepareAnimationTransaction）对齐：
  // 调用方提供 consumed 注册表时，它是「已播放」的唯一权威来源，previousState 传 null——
  // AI 回合开始回放常从结算后的同一 state 派生 oldGs（仅回滚 players/log），其中仍带着
  // 本轮 startNextTurn 刚产出的 staged 事件，若按 previousState 的 id 集合判定，会把本轮
  // 事件误判为「已播放」而丢弃（如群蛇陷阱的 SNAKE_TRAP）。未提供注册表的 legacy 调用方
  // （测试/headless/远端重播，均传入真正的回合前 oldGs）保持 previousIds 行为不变。
  const stagedTurnStartTransaction = hasAuthoritativeTurnStartEvents
    ? compileRuleVisualEventsToAnimTransaction(newGs, consumedVisualEventIds ? null : oldGs, {
        visualEventScope: 'turnStart',
        buildAnimQueue: buildQueue,
        players: beforeDrawPlayers,
        ...(consumedVisualEventIds ? { consumedEventIds: consumedVisualEventIds } : {}),
      })
    : null;
  const stagedDrawEffectQueue = (stagedTurnStartTransaction?.queue || []).filter(step => (
    step?.type !== 'YOUR_TURN'
    // The primary turn draw is built separately above, but event-owned reveal
    // draws (inspection and Sphinx) are distinct cards and must stay in their
    // canonical transaction. Dropping the Sphinx reveal here previously led
    // App to recreate it from `_animSphinxReveal`, bypassing turn ownership.
    && (step?.type !== 'DRAW_CARD'
      || step?.inspectionSeq != null
      || step?.inspectionGainSeq != null
      || step?.triggerName === '斯芬克斯')
    && step?.turnStartStage !== TURN_START_ANIMATION_STAGE.TURN_BOUNDARY
    && step?.turnStartStage !== TURN_START_ANIMATION_STAGE.TURN_START
  ));
  const inspectionEvents = hasAuthoritativeTurnStartEvents ? [] : getFreshInspectionEvents(oldGs, newGs);
  const preDrawMsgs = getTurnStartPreDrawMsgs(newGs);
  const turnStartInspectionEvents = inspectionEvents.filter(ev => {
    const lines = getInspectionLogLines([ev]);
    return lines.size && [...lines].some(line => preDrawMsgs.includes(line));
  });
  const turnStartInspectionSeqs = new Set(turnStartInspectionEvents.map(ev => ev?.seq).filter(seq => seq != null));
  const drawInspectionEvents = inspectionEvents.filter(ev => !turnStartInspectionSeqs.has(ev?.seq));
  const inspectionStatSeqs = getInspectionStatSeqs(inspectionEvents);
  const inspectionLogLines = getInspectionLogLines(inspectionEvents);
  const firstDrawInspectionStatSeq = getFirstInspectionStatSeq(drawInspectionEvents);
  const drawEffectQBase = hasAuthoritativeTurnStartEvents
    ? stagedDrawEffectQueue
    : filterConsumedTurnStartSteps(bindAnimLogChunks(
        buildQueue(fallbackOldGs, newGs),
        { statLogs: withoutLogLines(newGs?._statLogs, inspectionLogLines) },
      ), preDrawMsgs);
  // visualStatQ 只兜底 fallback 队列「漏掉」的属性事件。若事件已被 fallback 中卡牌专属
  // 复合步骤（如惊扰蝙蝠 STARTLED_BATS + 其尾随的 HP_DAMAGE）按序覆盖，再前置一份会让
  // HP 扣减特效抢在专属动画之前播放，且专属动画自己的属性步骤还会被下方过滤器剥掉。
  const fallbackHandledStatSeqs = new Set(
    (Array.isArray(drawEffectQBase) ? drawEffectQBase : [])
      .flatMap(step => (Array.isArray(step?.statEvents) ? step.statEvents : []))
      .map(event => event?.seq)
      .filter(seq => seq != null)
  );
  const visualStatQ = buildFilteredStatStepsFromVisualEvents(
    newGs,
    beforeDrawPlayers,
    statEvent => (
      !fallbackHandledStatSeqs.has(statEvent?.seq) &&
      (statEvent?.seq == null || statEvent.seq > (fallbackOldGs?._statEventSeq || 0)) &&
      !inspectionStatSeqs.has(statEvent?.seq) &&
      (firstDrawInspectionStatSeq == null || statEvent?.seq == null || statEvent.seq < firstDrawInspectionStatSeq) &&
      !isPreDrawTurnStartStatEvent(statEvent)
    ),
    inspectionLogLines
  );
  const filteredDrawEffectQBase = filterFallbackDrawEffects(drawEffectQBase, newGs, visualStatQ);
  const drawEffectQWithVisualStats = visualStatQ.length
    ? [...visualStatQ, ...filteredDrawEffectQBase.filter(step => !isStatAnimationStep(step))]
    : filteredDrawEffectQBase;
  const inspectionQ = [];
  if (drawInspectionEvents.length) {
    const firstInspection = drawInspectionEvents[0];
    // Attribute changes caused by the drawn card can happen immediately before
    // its first SAN inspection (night wind is the canonical case). Mark those
    // stat events as part of the pre-inspection interval so the first damage
    // animation owns the real target values and the post-inspection tail does
    // not replay the same HP/SAN loss a second time.
    const firstInspectionBeforeLogs = new Set(
      (firstInspection?.beforeLog || []).filter(line => typeof line === 'string')
    );
    const replayStatEvents = [
      ...(Array.isArray(newGs?._statEvents) ? newGs._statEvents : []),
      ...getFreshStatEventsFromState(oldGs, newGs),
      ...getVisualEvents(newGs).flatMap(event => (
        Array.isArray(event?.statEvents) ? event.statEvents : []
      )),
    ].filter((event, index, events) => (
      event?.seq == null || events.findIndex(candidate => (
        candidate?.seq === event.seq &&
        candidate?.type === event.type &&
        candidate?.target === event.target
      )) === index
    ));
    const preInspectionStatEvents = replayStatEvents
      .filter(event => {
        if (event?.seq == null || event.seq <= (fallbackOldGs?._statEventSeq || 0)) return false;
        if (event?.logHint && firstInspectionBeforeLogs.has(event.logHint)) return true;
        const targetBeforeInspection = firstInspection?.beforePlayers?.[event?.target];
        if (!targetBeforeInspection || !event?.to) return false;
        const hpMatches = event.to.hp == null || event.to.hp === targetBeforeInspection.hp;
        const sanMatches = event.to.san == null || event.to.san === targetBeforeInspection.san;
        return hpMatches && sanMatches;
      });
    const preInspectionStatSeq = preInspectionStatEvents.length
      ? Math.max(...preInspectionStatEvents.map(event => event.seq || 0))
      : (firstInspection?.beforeStatEventSeq || 0);
    const replayInspectionEvents = drawInspectionEvents.map((event, index) => (
      index === 0 && preInspectionStatSeq > (event?.beforeStatEventSeq || 0)
        ? { ...event, beforeStatEventSeq: preInspectionStatSeq }
        : event
    ));
    const inspectionFlow = buildInspectionEventFlow(
      {
        // Start at the actual pre-effect baseline. The flow itself advances to
        // firstInspection.before*, which preserves encounter/card effects that
        // caused the first SAN check instead of silently treating them as done.
        players: copyPlayers(fallbackOldGs?.players || beforeDrawPlayers),
        log: [...(fallbackOldGs?.log || getTurnStartDrawBaselineLog(newGs))],
        discard: [...(fallbackOldGs?.discard || oldGs?.discard || [])],
        _statEventSeq: fallbackOldGs?._statEventSeq || 0,
        _statEvents: replayStatEvents,
      },
      replayInspectionEvents,
      { buildAnimQueue: buildQueue, copyPlayers }
    );
    const maxInspectionSeq = Math.max(oldGs?._inspectionSeq || 0, ...drawInspectionEvents.map(ev => ev?.seq || 0));
    const tailQueue = buildQueue(
      {
        ...fallbackOldGs,
        players: inspectionFlow.players,
        log: inspectionFlow.log,
        _statEventSeq: inspectionFlow.statEventSeq,
        _inspectionSeq: maxInspectionSeq,
        // Card-effect visuals that occurred before the first inspection were
        // already emitted in the pre-inspection segment. Carry their ids into
        // the tail baseline; otherwise the tail treats night wind as a fresh
        // visual event and emits its HP/SAN damage steps again.
        _visualEvents: Array.isArray(newGs?._visualEvents)
          ? newGs._visualEvents
          : (Array.isArray(fallbackOldGs?._visualEvents) ? fallbackOldGs._visualEvents : []),
        // This tail continues the same draw resolution. Preserve the consumed
        // roll watermark so a moldy-food result retained in newGs is not
        // treated as a fresh event after an inspection boundary.
        _moldyFoodDiceSeq: Math.max(
          fallbackOldGs?._moldyFoodDiceSeq || fallbackOldGs?._moldyFoodDiceRoll?.seq || 0,
          newGs?._moldyFoodDiceSeq || newGs?._moldyFoodDiceRoll?.seq || 0,
        ),
      },
      newGs
    );
    inspectionQ.push(...inspectionFlow.queue, ...tailQueue);
  }
  // Inspection flow already rebuilds the complete interval from the state
  // before the first inspection through the resolved tail. Prepending the
  // generic draw-effect queue replays the same SAN/discard diffs against the
  // final snapshot, making inspection reveals and consecutive discards appear
  // before the encounter/worship steps (and sometimes twice).
  const firstInspectionBeforeLogs = new Set(
    (drawInspectionEvents[0]?.beforeLog || []).filter(line => typeof line === 'string')
  );
  const preInspectionExplicitQ = inspectionQ.length
    ? drawEffectQWithVisualStats.filter(step => (
      step?.type !== 'STATE_PATCH' &&
      step?.type !== 'DRAW_CARD' &&
      !isStatAnimationStep(step) &&
      (step?.msgs || []).some(msg => firstInspectionBeforeLogs.has(msg))
    ))
    : [];
  const preInspectionExplicitTypes = new Set(preInspectionExplicitQ.map(step => step?.type));
  const drawEffectQWithInspections = inspectionQ.length
    ? [
        ...preInspectionExplicitQ,
        ...inspectionQ.filter(step => !preInspectionExplicitTypes.has(step?.type)),
      ]
    : drawEffectQWithVisualStats;
  const drawEffectQWithoutEarlyKeepTransfer = drawKeepTransferStep
    ? drawEffectQWithInspections.filter(step => !(step?.type === 'CARD_TRANSFER' && step?.effect === 'draw'))
    : drawEffectQWithInspections;
  const unprimedDrawEffectQ = drawFullHandSwapQ.length
    ? [...drawFullHandSwapQ, ...drawEffectQWithoutEarlyKeepTransfer.filter(step => step.type !== 'CARD_TRANSFER')]
    : drawEffectQWithoutEarlyKeepTransfer;
  // A god worshipped directly from the turn-start draw is replayed from the
  // pre-draw player snapshot. Prime the highlight with only the resolved god
  // badge fields, while retaining the old hand so later AI actions (swap, hunt,
  // etc.) cannot leak into this earlier visual moment.
  const resolvedDrawer = newGs?.players?.[drawerPid];
  const worshipBadgePlayers = godDrawResolution === 'godZone' && resolvedDrawer
    ? beforeDrawPlayers.map((player, idx) => idx === drawerPid
      ? {
        ...player,
        godName: resolvedDrawer.godName,
        godLevel: resolvedDrawer.godLevel,
        godEncounters: resolvedDrawer.godEncounters,
        godEncounterCount: resolvedDrawer.godEncounterCount,
        lastGodEncounterSanLoss: resolvedDrawer.lastGodEncounterSanLoss,
        lastGodEncounterCreatedSkull: resolvedDrawer.lastGodEncounterCreatedSkull,
        lastGodEncounterPatchEnabled: resolvedDrawer.lastGodEncounterPatchEnabled,
        godZone: [...(resolvedDrawer.godZone || [])],
        hasBelievedGod: resolvedDrawer.hasBelievedGod,
      }
      : player)
    : null;
  const drawEffectQRaw = worshipBadgePlayers
    ? prepareWorshipHighlight(unprimedDrawEffectQ, {
      targetPid: drawerPid,
      godKey: resolvedDrawer.godName || drawnCard?.godKey,
      players: worshipBadgePlayers,
    })
    : unprimedDrawEffectQ;
  const hasEventBoundSlimePop = turnDrawEvents.some(event => event?.slimePop);
  const drawEffectQ = hasEventBoundSlimePop
    ? drawEffectQRaw.filter(step => step?.type !== 'TSG_SLIME_POP')
    : drawEffectQRaw;
  const drawEffectQWithDeath = drawEffectQ;
  // Re-assert the pre-worship player snapshot when the god card starts its
  // reveal. Some turn-start paths commit the resolved AI snapshot after the
  // banner, which used to let the god-power badge appear during the flip. The
  // GOD_HIGHLIGHT step below remains the single frame that reveals the badge
  // and starts the panel burst.
  const drawCardStepsWithWorshipBaseline = worshipBadgePlayers
    ? drawCardSteps.map(step => (
      step?.type === 'DRAW_CARD' && sameDrawCard(step.card, drawnCard)
        ? {
          ...step,
          visualSetupPatch: {
            ...(step.visualSetupPatch || {}),
            players: beforeDrawPlayers,
          },
        }
        : step
    ))
    : drawCardSteps;
  // Multiple reveal draws can occur in one draw phase (for example a slime
  // extra draw followed by the fixed draw). A forced card's bespoke effect
  // belongs immediately after that card's reveal, not after every later reveal.
  const immediateEarthquakeQ = [];
  let deferredDrawEffectQ = [];
  drawEffectQWithDeath.forEach(step => {
    if (step?.type === 'EARTHQUAKE') immediateEarthquakeQ.push(step);
    else deferredDrawEffectQ.push(step);
  });
  const orderedDrawCardSteps = immediateEarthquakeQ.length
    ? drawCardStepsWithWorshipBaseline.flatMap(step => {
        if (step?.type !== 'DRAW_CARD' || step?.card?.type !== 'allDiscard' || !immediateEarthquakeQ.length) return [step];
        return [step, immediateEarthquakeQ.shift()];
      })
    : drawCardStepsWithWorshipBaseline;
  deferredDrawEffectQ.push(...immediateEarthquakeQ);
  // 黏液额外摸到邪神牌时，遭遇邪神（SAN 扣减 + SAN 检定 + 放弃/信仰）是同步结算的。
  // 规则层已把遭遇产出的视觉事件 id 记录在摸牌事件的 godEncounter.visualEventIds 上
  // （含 GOD_GIFT_DISCARD 弃牌事件），这里按 id 精确归队，插到该邪神牌翻牌之后、
  // 下一张摸牌之前，而不是推迟到所有翻牌之后。
  const ownedEventIdsByDrawId = new Map();
  turnDrawEvents.forEach((event, eventIdx) => {
    const ids = event?.godEncounter?.visualEventIds;
    const drawId = event?.id || `legacy-draw-${eventIdx}`;
    if (Array.isArray(ids) && ids.length) ownedEventIdsByDrawId.set(drawId, new Set(ids));
  });
  let drawOwnedEffectGroups = null;
  if (ownedEventIdsByDrawId.size) {
    drawOwnedEffectGroups = new Map();
    deferredDrawEffectQ = deferredDrawEffectQ.filter(step => {
      const eventId = step?.visualEventId;
      if (!eventId) return true;
      for (const [drawId, ids] of ownedEventIdsByDrawId) {
        if (!ids.has(eventId)) continue;
        if (!drawOwnedEffectGroups.has(drawId)) drawOwnedEffectGroups.set(drawId, []);
        drawOwnedEffectGroups.get(drawId).push(step);
        return false;
      }
      return true;
    });
  }
  // Sphinx's result event is owned by the draw that revealed the D4 trigger.
  // Keep the whole block beside that draw even when slime creates several draws
  // in one turn. Its dodge die belongs after the wrong-result reveal and before
  // the event-owned HP loss.
  const sphinxEventById = new Map(newVisualEvents
    .filter(event => event?.type === VISUAL_EVENT.SPHINX_RESULT && event?.id)
    .map(event => [event.id, event]));
  const sphinxDrawIdByEventId = new Map();
  sphinxEventById.forEach((event, eventId) => {
    const owner = turnDrawEvents.find(drawEvent => (
      drawEvent?.id &&
      (drawEvent.drawerIdx ?? drawerPid) === event.actorIdx &&
      sameDrawCard(drawEvent.card, event.sourceCard)
    ));
    if (owner?.id) sphinxDrawIdByEventId.set(eventId, owner.id);
  });
  if (sphinxDrawIdByEventId.size) {
    if (!drawOwnedEffectGroups) drawOwnedEffectGroups = new Map();
    const sphinxStepsByEventId = new Map();
    deferredDrawEffectQ = deferredDrawEffectQ.filter(step => {
      const eventId = step?.visualEventId;
      if (!sphinxDrawIdByEventId.has(eventId)) return true;
      if (!sphinxStepsByEventId.has(eventId)) sphinxStepsByEventId.set(eventId, []);
      sphinxStepsByEventId.get(eventId).push(step);
      return false;
    });
    sphinxStepsByEventId.forEach((steps, eventId) => {
      const event = sphinxEventById.get(eventId);
      const diceStep = buildTreasureDodgeDiceStepFromLogs(event?.msgs || [], drawerName);
      const ownedSteps = [...steps];
      if (diceStep) {
        const resultTransferIdx = ownedSteps.findIndex(step => (
          step?.type === 'CARD_TRANSFER' && step?.effect === 'sphinxResult'
        ));
        let insertAt = resultTransferIdx >= 0 ? resultTransferIdx + 1 : 0;
        while (ownedSteps[insertAt]?.type === 'STATE_PATCH') insertAt += 1;
        ownedSteps.splice(insertAt, 0, diceStep);
      }
      const drawId = sphinxDrawIdByEventId.get(eventId);
      drawOwnedEffectGroups.set(drawId, [
        ...(drawOwnedEffectGroups.get(drawId) || []),
        ...ownedSteps,
      ]);
    });
  }
  const hasOwnedSphinxResult = sphinxDrawIdByEventId.size > 0;
  const multipleTurnDraws = turnDrawEvents.length > 1;
  const deferredEventOwnedKeepSteps = [];
  const isSphinxDrawCard = card => card?.type === 'sphinxGuess' || card?.name === '斯芬克斯';
  const orderedDrawCardStepsWithOwnedFlows = orderedDrawCardSteps.flatMap(step => {
    if (step?.type !== 'DRAW_CARD' || step?._drawEventId == null) return [step];
    const keepSteps = eventOwnedKeepStepsByDrawId.get(step._drawEventId) || [];
    const keepEvent = eventOwnedKeepEventById.get(step._drawEventId);
    const effectSteps = drawOwnedEffectGroups?.get(step._drawEventId) || [];
    const immediateKeep = multipleTurnDraws || isSphinxDrawCard(step.card);
    if (!immediateKeep && keepSteps.length) {
      deferredEventOwnedKeepSteps.push(
        keepSteps[0],
        statePatchStep({ players: keepEvent?.playersAfterResolution || keepEvent?.playersAfterKeep }),
      );
    }
    return [
      step,
      ...(immediateKeep ? keepSteps : []),
      ...effectSteps,
    ];
  });
  const legacySphinxKeepSteps = drawKeepTransferStep && isSphinxDrawCard(drawnCard)
    ? [
        drawKeepTransferStep,
        statePatchStep({ players: addCardToHandSnapshot(beforeDrawPlayers, drawerPid, drawnCard) }),
      ]
    : [];
  const deferredLegacyKeepStep = legacySphinxKeepSteps.length ? null : drawKeepTransferStep;
  const hasDrawEffectVisualStep = drawEffectQWithDeath.some(step => step?.type !== 'STATE_PATCH');
  const drawEffectStatePatch = hasDrawEffectVisualStep
    ? statePatchStep({ players: newGs?.players, discard: newGs?.discard })
    : null;
  const turnBoundaryStageQueue = markTurnStartAnimationStage([
    ...boundarySteps,
  ], TURN_START_ANIMATION_STAGE.TURN_BOUNDARY);
  const turnBannerStageQueue = markTurnStartAnimationStage([
    turnStartStep,
  ], TURN_START_ANIMATION_STAGE.TURN_BANNER);
  const turnStartStageQueue = markTurnStartAnimationStage([
    ...turnStartPreDrawQ,
    ...(turnStartStatePatch ? [turnStartStatePatch] : []),
  ], TURN_START_ANIMATION_STAGE.TURN_START);
  const drawStageQueue = markTurnStartAnimationStage([
    ...orderedDrawCardStepsWithOwnedFlows,
    ...(discardDrawnStep ? [discardDrawnStep] : []),
    ...(discardRestoreStep ? [discardRestoreStep] : []),
    ...legacySphinxKeepSteps,
    ...(treasureDodgeDiceStep && !hasOwnedSphinxResult ? [treasureDodgeDiceStep] : []),
    ...deferredDrawEffectQ,
    ...deferredEventOwnedKeepSteps,
    ...(deferredLegacyKeepStep ? [deferredLegacyKeepStep] : []),
    ...(drawEffectStatePatch ? [drawEffectStatePatch] : []),
  ], TURN_START_ANIMATION_STAGE.DRAW);
  const stageQueues = {
    [TURN_START_ANIMATION_STAGE.TURN_BOUNDARY]: turnBoundaryStageQueue,
    [TURN_START_ANIMATION_STAGE.TURN_BANNER]: turnBannerStageQueue,
    [TURN_START_ANIMATION_STAGE.TURN_START]: turnStartStageQueue,
    [TURN_START_ANIMATION_STAGE.DRAW]: drawStageQueue,
  };
  const queue = [...turnBoundaryStageQueue, ...turnBannerStageQueue, ...turnStartStageQueue, ...drawStageQueue];
  const startAnim = queue[0] || null;
  const startQueue = queue.slice(1);
  return {
    drawnCard,
    drawerPid,
    drawerName,
    beforeDrawPlayers,
    turnStartStep,
    drawCardStep,
    drawEffectQ: drawEffectQWithDeath,
    stageQueues,
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
