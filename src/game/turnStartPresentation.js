import { bindAnimLogChunks, subtractLogOccurrences } from './animLogs';
import { statePatchStep } from './animQueueHelpers';
import { cardLogText, copyPlayers } from './coreUtils';
import { buildStatEvents, statEventsToAnimQueue } from './statEvents';
import { buildTurnStartStepFromVisualEvents, getTurnBannerVisualEventId } from './visualEvents';
import {
  buildTurnStartPreDrawEffectQueue,
  getTurnStartDrawerIdx,
  markTurnStartAnimationStage,
  splitTurnStartAnimationStages,
  TURN_START_ANIMATION_STAGE,
} from './turnAnimState';

export function maxStatEventSeqFromSteps(steps = []) {
  return (Array.isArray(steps) ? steps : []).reduce((max, step) => {
    const localMax = (Array.isArray(step?.statEvents) ? step.statEvents : []).reduce(
      (value, event) => Number.isFinite(event?.seq) ? Math.max(value, event.seq) : value,
      0,
    );
    return Math.max(max, localMax);
  }, 0);
}

export function maxKnownStatEventSeq(state) {
  const explicit = Number.isFinite(state?._statEventSeq) ? state._statEventSeq : 0;
  const fromEvents = (Array.isArray(state?._statEvents) ? state._statEvents : []).reduce(
    (max, event) => Number.isFinite(event?.seq) ? Math.max(max, event.seq) : max,
    0,
  );
  const fromVisual = (Array.isArray(state?._visualEvents) ? state._visualEvents : []).reduce(
    (max, event) => {
      const local = (Array.isArray(event?.statEvents) ? event.statEvents : []).reduce(
        (value, statEvent) => Number.isFinite(statEvent?.seq) ? Math.max(value, statEvent.seq) : value,
        0,
      );
      return Math.max(max, local);
    },
    0,
  );
  return Math.max(explicit, fromEvents, fromVisual);
}

export function maxStatEventSeqForLogs(state, logs = []) {
  const logSet = new Set((Array.isArray(logs) ? logs : []).filter(Boolean));
  if (!logSet.size) return 0;
  return (Array.isArray(state?._statEvents) ? state._statEvents : []).reduce(
    (max, event) => event?.logHint && logSet.has(event.logHint) && Number.isFinite(event?.seq)
      ? Math.max(max, event.seq)
      : max,
    0,
  );
}

export function getTurnStartStatLogs(state) {
  const log = Array.isArray(state?.log) ? state.log : [];
  const turnStartLogs = Array.isArray(state?._turnStartLogs) ? state._turnStartLogs : [];
  if (!turnStartLogs.length) return [];
  const turnStartIndex = log.lastIndexOf(turnStartLogs[0]);
  if (turnStartIndex < 0) return [];
  const delta = log.slice(turnStartIndex);
  const drawLogs = Array.isArray(state?._drawLogs) ? state._drawLogs : [];
  const firstDrawIndex = drawLogs.length ? delta.findIndex(line => line === drawLogs[0]) : -1;
  const beforeDrawLogs = firstDrawIndex >= 0 ? delta.slice(0, firstDrawIndex) : delta;
  return subtractLogOccurrences(beforeDrawLogs, turnStartLogs);
}

export function statEventSeqBeforeTurnStartStats(state, fallbackSeq = 0) {
  const statLogs = new Set(getTurnStartStatLogs(state));
  if (!statLogs.size) return fallbackSeq;
  const seqs = (Array.isArray(state?._statEvents) ? state._statEvents : [])
    .filter(event => event?.logHint && statLogs.has(event.logHint) && Number.isFinite(event.seq))
    .map(event => event.seq);
  if (!seqs.length) return fallbackSeq;
  return Math.min(fallbackSeq, Math.max(0, Math.min(...seqs) - 1));
}

export function parseBewitchGiftLabel(logLine = '') {
  const bracketLabel = logLine.match(/赠予 \[([^\]]+)\]/)?.[1];
  if (bracketLabel) return bracketLabel.trim();
  const plainLabel = logLine.match(/赠予 ([^，。！!]+)/)?.[1];
  return plainLabel?.trim() || '';
}

export function findCardInPlayerZonesByLabel(players = [], label = '') {
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

export function appendLogTailWithOverlap(base = [], tail = []) {
  const left = Array.isArray(base) ? base.filter(line => line != null) : [];
  const right = Array.isArray(tail) ? tail.filter(line => line != null) : [];
  if (!right.length) return left;
  const max = Math.min(left.length, right.length);
  let overlap = 0;
  for (let count = max; count > 0; count--) {
    let same = true;
    for (let index = 0; index < count; index++) {
      if (left[left.length - count + index] !== right[index]) {
        same = false;
        break;
      }
    }
    if (same) {
      overlap = count;
      break;
    }
  }
  return [...left, ...right.slice(overlap)];
}

export function appendMissingLogLines(base = [], extra = []) {
  const result = Array.isArray(base) ? base.filter(line => line != null) : [];
  const extraLines = Array.isArray(extra) ? extra.filter(line => line != null) : [];
  if (!extraLines.length) return result;
  const available = new Map();
  result.forEach(line => available.set(line, (available.get(line) || 0) + 1));
  const consumed = new Map();
  extraLines.forEach(line => {
    const used = consumed.get(line) || 0;
    if (used < (available.get(line) || 0)) {
      consumed.set(line, used + 1);
    } else {
      result.push(line);
      available.set(line, (available.get(line) || 0) + 1);
    }
  });
  return result;
}

export function buildCompleteGameOverLog(state, visibleLog = []) {
  if (!state?.gameOver) return Array.isArray(state?.log) ? state.log : [];
  let log = Array.isArray(state.log) ? [...state.log] : [];
  const visible = Array.isArray(visibleLog) ? visibleLog : [];
  if (visible.length > log.length) log = appendLogTailWithOverlap(log, visible);
  log = appendMissingLogLines(log, [
    ...(state._turnStartLogs || []),
    ...(state._drawLogs || []),
    ...(state._statLogs || []),
  ]);
  const reason = state.gameOver?.reason;
  if (reason && !log.includes(reason)) log = [...log, reason];
  return log;
}

export function buildVisibleLogForLocalViewer(log, state) {
  const base = Array.isArray(log) ? log : [];
  const swapEvents = (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .filter(event => event?.type === 'swapCards' && event.targetIdx === 0 && event.takenCard && event.givenCard);
  if (!swapEvents.length) return base;
  let result = [...base];
  swapEvents.forEach(event => {
    const sourceName = event.sourceName || state?.players?.[event.sourceIdx]?.name || '对方';
    const sourceLabel = event.sourceLabel || `${sourceName}（寻宝者）`;
    const privateLines = [
      `你的手牌${cardLogText(event.takenCard, { alwaysShowName: true })}被暗抽`,
      `${sourceLabel}给你一张${cardLogText(event.givenCard, { alwaysShowName: true })}`,
    ];
    if (privateLines.every(line => result.includes(line))) return;
    const localName = state?.players?.[0]?.name;
    const startIndex = result.findIndex(line => (
      typeof line === 'string'
      && line.includes('【掉包】')
      && (line.includes('对 你') || (localName && line.includes(`对 ${localName}`)))
    ));
    if (startIndex >= 0) {
      result = [...result.slice(0, startIndex + 1), ...privateLines, ...result.slice(startIndex + 1)];
    }
  });
  return result;
}

export function buildTurnStartStatQueue(state) {
  if (!state?._preTurnPlayers || !state?._playersBeforeThisDraw) return [];
  const statLogs = getTurnStartStatLogs(state);
  const statEvents = buildStatEvents(
    state._preTurnPlayers,
    state._playersBeforeThisDraw,
    statLogs,
    { reason: '回合开始', seq: 1, includeDefeat: false },
  );
  if (!statEvents.length) return [];
  const queue = bindAnimLogChunks(
    statEventsToAnimQueue(statEvents, state._preTurnPlayers, statLogs),
    { statLogs },
  );
  if (statLogs.some(line => typeof line === 'string' && line.includes('黑山羊幼仔'))) {
    queue.unshift({ type: 'BLACK_GOAT_PULSE', targetPid: state.currentTurn, msgs: [] });
  }
  return queue;
}

export function buildTurnStartIntroQueue(state, name) {
  if (!state?._playersBeforeThisDraw) return [];
  const preDrawQueue = buildTurnStartPreDrawEffectQueue({
    oldGs: { ...state, players: state._preTurnPlayers || state.players, _statEventSeq: 0 },
    newGs: state,
  });
  const turnStartStatQueue = preDrawQueue.length ? preDrawQueue : buildTurnStartStatQueue(state);
  const queue = [];
  if (turnStartStatQueue.length) {
    queue.push({
      type: 'VISUAL_LOCK',
      players: state._preTurnPlayers || state._playersBeforeThisDraw,
      zhuLight: state.zhuLight || null,
    });
  }
  const canonicalTurnBanner = buildTurnStartStepFromVisualEvents(state);
  queue.push({
    type: 'YOUR_TURN',
    turnStartStage: TURN_START_ANIMATION_STAGE.TURN_BANNER,
    ...(canonicalTurnBanner || {}),
    visualEventId: canonicalTurnBanner?.visualEventId || getTurnBannerVisualEventId(state),
    name: name || canonicalTurnBanner?.name || state.players?.[state.currentTurn]?.name || '???',
    msgs: canonicalTurnBanner?.msgs || state._turnStartLogs,
  });
  queue.push(...turnStartStatQueue);
  if (turnStartStatQueue.length) queue.push(statePatchStep({ players: state._playersBeforeThisDraw }));
  return queue;
}

export function splitGodEncounterReplayLogs(effectMsgs = []) {
  const logs = (Array.isArray(effectMsgs) ? effectMsgs : [])
    .filter(line => typeof line === 'string' && line.length);
  const inspectionStart = logs.findIndex(line => line.includes('的SAN检定结果为'));
  if (inspectionStart < 0) return { encounterLogs: logs, inspectionLogs: [] };
  return {
    encounterLogs: logs.slice(0, inspectionStart),
    inspectionLogs: logs.slice(inspectionStart),
  };
}

export function hideTurnStartDecisionForReplay(prev, replay, newGs, { getVisualDiscard } = {}) {
  if (!prev) return prev;
  const replayPlayers = replay?.visualLock?.players || replay?.beforeDrawPlayers || newGs?._playersBeforeThisDraw;
  return {
    ...prev,
    ...(replayPlayers ? { players: copyPlayers(replayPlayers) } : {}),
    ...(newGs && typeof getVisualDiscard === 'function' ? { discard: getVisualDiscard(newGs) } : {}),
    ...(replay?.visualLock?.zhuLight !== undefined ? { zhuLight: replay.visualLock.zhuLight } : {}),
    phase: 'ACTION',
    drawReveal: null,
    abilityData: {},
  };
}

export function withTurnStartActorLabel(replay, state, { actorName = null, forceActorName = false } = {}) {
  if (!replay) return replay;
  const drawerPid = replay.drawerPid ?? getTurnStartDrawerIdx(state);
  const displayName = actorName || state?.players?.[drawerPid]?.name || replay.drawerName || '???';
  if (!forceActorName) return replay;
  const labelTurnStartStep = step => step?.type === 'YOUR_TURN' ? { ...step, name: displayName } : step;
  const labelDrawCardStep = step => step?.type === 'DRAW_CARD' && step === replay.drawCardStep
    ? { ...step, triggerName: displayName, targetPid: drawerPid }
    : step;
  const labelStep = step => labelDrawCardStep(labelTurnStartStep(step));
  const queue = (replay.queue || []).map(labelStep);
  const startQueue = (replay.startQueue || []).map(labelStep);
  return {
    ...replay,
    drawerName: displayName,
    turnStartStep: replay.turnStartStep ? labelStep(replay.turnStartStep) : replay.turnStartStep,
    drawCardStep: replay.drawCardStep ? labelStep(replay.drawCardStep) : replay.drawCardStep,
    stageQueues: splitTurnStartAnimationStages(queue),
    queue,
    startAnim: replay.startAnim ? labelStep(replay.startAnim) : replay.startAnim,
    startQueue,
  };
}

export function normalizeVisibleTurnStartQueue(queue = []) {
  if (!Array.isArray(queue) || !queue.length) return [];
  const stages = splitTurnStartAnimationStages(queue);
  const turnBoundaryQueue = stages[TURN_START_ANIMATION_STAGE.TURN_BOUNDARY];
  const turnBannerQueue = stages[TURN_START_ANIMATION_STAGE.TURN_BANNER];
  const turnStartQueue = stages[TURN_START_ANIMATION_STAGE.TURN_START];
  const drawQueue = stages[TURN_START_ANIMATION_STAGE.DRAW];
  const combinedStartQueue = [...turnBannerQueue, ...turnStartQueue];
  const turnIndex = combinedStartQueue.findIndex(step => step?.type === 'YOUR_TURN');
  if (turnIndex <= 0) return [...turnBoundaryQueue, ...combinedStartQueue, ...drawQueue];
  const leadingLocks = combinedStartQueue.slice(0, turnIndex).filter(step => step?.type === 'VISUAL_LOCK');
  const visibleBeforeTurn = combinedStartQueue.slice(0, turnIndex).filter(step => step?.type !== 'VISUAL_LOCK');
  return [
    ...turnBoundaryQueue,
    ...leadingLocks,
    combinedStartQueue[turnIndex],
    ...visibleBeforeTurn,
    ...combinedStartQueue.slice(turnIndex + 1),
    ...drawQueue,
  ];
}

export function markTurnBoundaryPresentation(queue = []) {
  return markTurnStartAnimationStage(queue, TURN_START_ANIMATION_STAGE.TURN_BOUNDARY);
}
