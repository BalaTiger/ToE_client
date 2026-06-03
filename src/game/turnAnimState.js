import { cardLogText } from './coreUtils';
import { isLocalCurrentTurn, localDisplayName } from './rotateState';
import { bindAnimLogChunks } from './animLogs';
import { buildAnimQueue, buildFullHandSwapTransferQueueFromLogs } from './animQueueCore';
import { cardTransferStep, statePatchStep } from './animQueueHelpers';
import {
  buildDrawCardStepFromVisualEvents,
  buildStatStepsFromVisualEvents,
  buildTurnStartStepFromVisualEvents,
} from './visualEvents';

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
  if (isLocalCurrentTurn(newGs) && newGs.drawReveal?.card) {
    queue.push(
      { type: 'YOUR_TURN', msgs: newGs._turnStartLogs },
      { type: 'DRAW_CARD', card: newGs.drawReveal.card, triggerName: '你', targetPid: 0, msgs: newGs._drawLogs }
    );
    const statQ = bindAnimLogChunks(buildAnimQueue(oldGs, newGs), { statLogs: newGs._statLogs });
    queue.push(...statQ);
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

export function buildTurnStartDrawReplayQueue({
  oldGs,
  newGs,
  effectOldGs,
  timedOutDrawDiscardStep = null,
  buildQueue = buildAnimQueue,
  buildFullHandSwapTransferQueue = buildFullHandSwapTransferQueueFromLogs,
} = {}) {
  const drawnCard = getTurnStartDrawnCard(newGs);
  if (!drawnCard) {
    return {
      drawnCard: null,
      beforeDrawPlayers: newGs?.players || oldGs?.players || [],
      drawEffectQ: [],
      queue: [],
      startAnim: timedOutDrawDiscardStep || null,
      startQueue: [],
      visualLock: null,
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
  const drawEffectQBase = bindAnimLogChunks(
    buildQueue(fallbackOldGs, newGs),
    { statLogs: newGs?._statLogs },
  );
  const visualStatQ = buildStatStepsFromVisualEvents(newGs, beforeDrawPlayers);
  const filteredDrawEffectQBase = filterFallbackDrawEffects(drawEffectQBase, newGs, visualStatQ);
  const drawEffectQWithVisualStats = visualStatQ.length
    ? [...visualStatQ, ...filteredDrawEffectQBase.filter(step => !isStatAnimationStep(step))]
    : filteredDrawEffectQBase;
  const drawEffectQ = drawFullHandSwapQ.length
    ? [...drawFullHandSwapQ, ...drawEffectQWithVisualStats.filter(step => step.type !== 'CARD_TRANSFER')]
    : drawEffectQWithVisualStats;
  const queue = [
    ...(timedOutDrawDiscardStep ? [timedOutDrawDiscardStep] : []),
    turnStartStep,
    drawCardStep,
    ...drawEffectQ,
  ];
  const startAnim = timedOutDrawDiscardStep || turnStartStep;
  const startQueue = [
    ...(timedOutDrawDiscardStep ? [turnStartStep] : []),
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
    visualLock: newGs?._playersBeforeThisDraw
      ? { players: beforeDrawPlayers, zhuLight: oldGs?.zhuLight || newGs?.zhuLight || null }
      : null,
  };
}
