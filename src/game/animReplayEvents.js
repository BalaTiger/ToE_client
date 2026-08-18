import { bindAnimLogChunks, isDrawLikeLog, isTurnStartLog } from './animLogs';
import { buildBewitchForcedCardQueue, buildInspectionAwareAnimQueue } from './animQueueHelpers';
import { appendFinalStatePatch } from './animStatePatch';
import { copyPlayers } from './coreUtils';
import { createAnimTransactionEvent, getVisualEvents, VISUAL_EVENT } from './visualEvents';

export function createCthRlyehDreamStep(targetPid = 0, msgs = []) {
  return {
    type: 'CTH_RLYEH_DREAM',
    targetPid,
    msgs: Array.isArray(msgs) ? msgs.filter(Boolean) : [],
  };
}

export function createCthRestDrawReplayEvent({
  beforePlayers,
  beforeDiscard,
  zhuLight,
  actorName,
  cthDraws,
  cthDrawLogs,
  preSteps = [],
  statSteps = [],
  playDream = true,
} = {}) {
  const draws = (Array.isArray(cthDraws) ? cthDraws : []).filter(Boolean);
  if (!draws.length) return null;
  const logs = Array.isArray(cthDrawLogs) ? cthDrawLogs.filter(Boolean) : [];
  const triggerLabel = actorName || '你';
  const drawSteps = draws.map(card => ({
    type: 'DRAW_CARD',
    card,
    triggerName: triggerLabel,
    targetPid: 0,
    msgs: logs.filter(line => line.includes(card.name) || (card.key && line.includes(card.key))),
  }));
  return createAnimTransactionEvent({
    actorIdx: 0,
    actorName: actorName || '你',
    context: 'cthRlyehDream',
    barrier: 'turnBoundary',
    queue: [
      ...(Array.isArray(preSteps) ? preSteps : []),
      ...(playDream ? [createCthRlyehDreamStep(0, logs)] : []),
      ...drawSteps,
      ...(Array.isArray(statSteps) ? statSteps : []),
    ],
    msgs: logs,
    beforePlayers: copyPlayers(beforePlayers || []),
    beforeDiscard: [...(beforeDiscard || [])],
    zhuLight: zhuLight || null,
  });
}

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
  const oldVisualEventIds = new Set(getVisualEvents(oldGs).map(event => event?.id).filter(Boolean));
  if (getVisualEvents(newGs).some(event => (
    (event?.type === VISUAL_EVENT.RANDOM_TARGET || event?.type === VISUAL_EVENT.THROW_STONE) &&
    event?.id &&
    !oldVisualEventIds.has(event.id)
  ))) return true;
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
  queueOptions = {},
  buildAnimQueue,
  copyPlayers,
} = {}) {
  if (!bewitchEvent) return { queue: [], inspectionEvents: [], inspectionSeq: oldGs?._inspectionSeq || 0 };
  const encounterGs = bewitchEvent.encounterState
    ? { ...oldGs, ...bewitchEvent.encounterState }
    : null;
  const encounterReplay = encounterGs
    ? buildInspectionReplay(oldGs, encounterGs, { buildAnimQueue, copyPlayers })
    : { queue: [], inspectionEvents: [], inspectionSeq: oldGs?._inspectionSeq || 0 };
  const acceptanceReplay = buildInspectionReplay(encounterGs || oldGs, newGs, { buildAnimQueue, copyPlayers });
  const encounterLogDelta = encounterGs
    ? (encounterGs.log || []).slice((oldGs?.log || []).length)
    : [];
  const acceptanceLogDelta = encounterGs
    ? (newGs?.log || []).slice((encounterGs.log || []).length)
    : logDelta;
  const encounterQueue = bindAnimLogChunks(encounterReplay.queue, { statLogs: encounterLogDelta });
  const acceptanceQueue = bindAnimLogChunks(acceptanceReplay.queue, { statLogs: acceptanceLogDelta });
  const fallbackStatQueue = [...encounterQueue, ...acceptanceQueue];
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
    {
      ...queueOptions,
      playersAfter: newGs?.players,
      zhuLightBefore: oldGs?.zhuLight || null,
      zhuLightAfter: newGs?.zhuLight || null,
      ...(encounterGs && !visualStatQueue.length ? { encounterQueue, acceptanceQueue } : {}),
    },
  );
  const inspectionEvents = [...encounterReplay.inspectionEvents, ...acceptanceReplay.inspectionEvents];
  return {
    queue,
    inspectionEvents,
    inspectionSeq: Math.max(encounterReplay.inspectionSeq || 0, acceptanceReplay.inspectionSeq || 0),
    statQueue,
    encounterQueue,
    acceptanceQueue,
  };
}
