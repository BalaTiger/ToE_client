import { cardLogText } from './coreUtils';
import { isLocalCurrentTurn } from './rotateState';
import { bindAnimLogChunks } from './animLogs';
import { buildAnimQueue } from './animQueueCore';

export const EMPTY_TURN_ANIM_FIELDS = Object.freeze({
  _playersBeforeThisDraw: null,
  _turnStartLogs: [],
  _drawLogs: [],
  _statLogs: [],
  _preTurnPlayers: null,
  _preTurnStatLogs: [],
});

export function withClearedTurnAnimFields(state, extra = {}) {
  return { ...state, ...EMPTY_TURN_ANIM_FIELDS, ...extra };
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
