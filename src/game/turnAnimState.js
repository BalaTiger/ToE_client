import { cardLogText } from './coreUtils';
import { isLocalCurrentTurn } from './rotateState';
import { bindAnimLogChunks } from './animLogs';
import { buildAnimQueue } from './animQueueCore';
import { cardTransferStep, statePatchStep } from './animQueueHelpers';

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
