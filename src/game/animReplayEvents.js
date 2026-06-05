import { bindAnimLogChunks, isDrawLikeLog, isTurnStartLog } from './animLogs';
import { buildBewitchForcedCardQueue, buildInspectionAwareAnimQueue } from './animQueueHelpers';
import { appendFinalStatePatch } from './animStatePatch';

export function isStatAnimationStep(step) {
  if (!step) return false;
  if (Array.isArray(step.statEvents) && step.statEvents.length) return true;
  if (['HP_DAMAGE', 'HP_HEAL', 'SAN_DAMAGE', 'SAN_HEAL', 'HP_SAN_HEAL'].includes(step.type)) return true;
  if (step.type === 'STATE_PATCH' && Array.isArray(step._logChunk) && step._logChunk.length) return true;
  if (step.type === 'TURN_BOUNDARY_PAUSE') return true;
  return false;
}

export function buildInspectionReplay(oldGs, newGs, { buildAnimQueue, copyPlayers } = {}) {
  return buildInspectionAwareAnimQueue(oldGs, newGs, { buildAnimQueue, copyPlayers });
}

export function isLaterDrawBoundaryLog(line) {
  return (
    isTurnStartLog(line) ||
    isDrawLikeLog(line) ||
    /摸到|收入了/.test(line || '')
  );
}

function findEventMsgIndex(logDelta = [], event) {
  const logs = Array.isArray(logDelta) ? logDelta : [];
  const eventMsgs = Array.isArray(event?.msgs) ? event.msgs.filter(Boolean) : [];
  if (!eventMsgs.length) return -1;
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (eventMsgs.includes(logs[i])) return i;
  }
  return -1;
}

export function isFreshActionReplayEvent(event, logDelta = []) {
  const logs = Array.isArray(logDelta) ? logDelta : [];
  const eventIdx = findEventMsgIndex(logs, event);
  if (eventIdx >= 0) {
    return !logs.slice(eventIdx + 1).some(isLaterDrawBoundaryLog);
  }
  return !logs.some(isLaterDrawBoundaryLog);
}

export function isFreshBewitchReplayEvent(event, logDelta = []) {
  return isFreshActionReplayEvent(event, logDelta);
}

export function findFreshBewitchReplayLog(logDelta = []) {
  const logs = Array.isArray(logDelta) ? logDelta : [];
  let idx = -1;
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (/【蛊惑】/.test(logs[i] || '')) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  return logs.slice(idx + 1).some(isLaterDrawBoundaryLog) ? null : logs[idx];
}

export function hasFreshRandomTargetEvents(newGs, oldGs) {
  const oldSeq = oldGs?._randomTargetSeq || 0;
  return (newGs?._randomTargetEvents || []).some(event => event?.seq > oldSeq);
}

export function buildRandomTargetReplay({
  oldGs,
  newGs,
  logDelta = [],
  buildAnimQueue,
  copyPlayers,
  finalFields = ['players', 'discard', 'log', 'phase', 'abilityData'],
} = {}) {
  if (!hasFreshRandomTargetEvents(newGs, oldGs)) {
    return { queue: [], inspectionEvents: [], inspectionSeq: oldGs?._inspectionSeq || 0 };
  }
  const inspectionReplay = buildInspectionReplay(oldGs, newGs, { buildAnimQueue, copyPlayers });
  const queue = appendFinalStatePatch(
    bindAnimLogChunks(inspectionReplay.queue, { statLogs: logDelta }),
    newGs,
    finalFields,
  );
  return {
    queue,
    inspectionEvents: inspectionReplay.inspectionEvents,
    inspectionSeq: inspectionReplay.inspectionSeq,
  };
}

export function buildBewitchGiftReplay({
  oldGs,
  newGs,
  bewitchEvent,
  logDelta = [],
  visualStatQueue = [],
  buildAnimQueue,
  copyPlayers,
} = {}) {
  if (!bewitchEvent) return { queue: [], inspectionEvents: [], inspectionSeq: oldGs?._inspectionSeq || 0 };
  const inspectionReplay = buildInspectionReplay(oldGs, newGs, { buildAnimQueue, copyPlayers });
  const fallbackStatQueue = bindAnimLogChunks(
    inspectionReplay.queue,
    { statLogs: logDelta },
  );
  const statQueue = visualStatQueue.length
    ? [...visualStatQueue, ...fallbackStatQueue.filter(step => !isStatAnimationStep(step))]
    : fallbackStatQueue;
  const targetIdx = bewitchEvent.targetIdx;
  const queue = buildBewitchForcedCardQueue(
    bewitchEvent.sourceIdx ?? newGs?.currentTurn,
    targetIdx,
    bewitchEvent.card,
    bewitchEvent.targetName || newGs?.players?.[targetIdx]?.name,
    statQueue,
    bewitchEvent.msgs || logDelta,
  );
  return {
    queue,
    inspectionEvents: inspectionReplay.inspectionEvents,
    inspectionSeq: inspectionReplay.inspectionSeq,
    statQueue,
  };
}
