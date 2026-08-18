import { getEndTurnEvents } from './endTurnEvents';
import { createHandLimitDiscardEvent } from './visualEvents';
import { statePatchStep } from './animQueueHelpers';
import { buildPlayerTurnDrawQueue } from './turnAnimState';
import { cardLogText } from './coreUtils';
import { TURN_FLOW_STAGE } from './turnFlowStages';
import { enterTurnBoundary, transitionTurnFlowStage } from './turnFlowManager';
import {
  splitKeptDestroyedDiscarded,
  applyHandDiscardSideEffectsWithAnim as defaultApplyHandDiscardSideEffectsWithAnim,
} from './handLimitDiscard';

/**
 * Pure helper for the shared "hand-limit discard -> end of turn" transition.
 *
 * The caller is responsible for removing the cards from the actor's hand and
 * supplying the post-removal players snapshot. This function handles the
 * recurring boilerplate: black-goat/slime destruction, discard side effects,
 * end-turn event detection, MP hand-limit discard event creation, and either
 * the Phase-C scheduler kickoff state or the next-turn animation queue.
 *
 * React side effects (setGs, triggerAnimQueue, kickoffEndTurnSeq) stay outside.
 */
export function resolvePostDiscardEndTurn(baseGs, {
  playersAfterDiscard,
  discarded,
  logPrefix = '弃置',
  actorIndex = 0,
  advanceTurn,
  applyHandDiscardSideEffectsWithAnim = defaultApplyHandDiscardSideEffectsWithAnim,
  mpEndTurnDiscardResolved = undefined,
} = {}) {
  if (!baseGs) throw new Error('resolvePostDiscardEndTurn requires baseGs');
  if (!advanceTurn) throw new Error('resolvePostDiscardEndTurn requires advanceTurn');
  if (typeof applyHandDiscardSideEffectsWithAnim !== 'function') {
    throw new Error('resolvePostDiscardEndTurn requires applyHandDiscardSideEffectsWithAnim');
  }
  if (!Array.isArray(playersAfterDiscard)) {
    throw new Error('resolvePostDiscardEndTurn requires playersAfterDiscard array');
  }

  const { kept, destroyed } = splitKeptDestroyedDiscarded(discarded);

  let P = playersAfterDiscard;
  let D = [...baseGs.deck];
  let Disc = [...baseGs.discard, ...kept];
  let L = [...baseGs.log];
  let balanceQueue = [];
  let balanceStatePatch = {};

  if (kept.length) {
    L.push(`${logPrefix}：${kept.map(c => cardLogText(c, { alwaysShowName: true })).join(' ')}`);
    const balance = applyHandDiscardSideEffectsWithAnim({
      baseGs,
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      ownerIdx: actorIndex,
      cards: kept,
      reason: '手牌上限弃牌',
    });
    P = balance.players;
    D = balance.deck;
    Disc = balance.discard;
    L = balance.log;
    balanceQueue = balance.queue;
    balanceStatePatch = balance.statePatch;
  }

  if (destroyed.length) {
    L.push(`衍生牌 ×${destroyed.length} 被销毁`);
  }

  const discardAnimMsgs = discarded.length ? L.slice(-discarded.length - 1) : [];
  const handLimitDiscardEvent = baseGs._isMP
    ? createHandLimitDiscardEvent({
        playerIdx: actorIndex,
        playerName: P[actorIndex]?.name || '该玩家',
        cards: discarded,
        msgs: discardAnimMsgs,
      })
    : null;

  const postDiscardGs = transitionTurnFlowStage({
    ...baseGs,
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    currentTurn: actorIndex,
    abilityData: {},
    _mpEndTurnDiscardResolved: mpEndTurnDiscardResolved,
    ...balanceStatePatch,
  }, TURN_FLOW_STAGE.END_TURN);

  const endTurnEvents = getEndTurnEvents(P, actorIndex);
  if (endTurnEvents.length) {
    const seedQueue = discarded.length
      ? [{ type: 'DISCARD', cards: discarded, count: discarded.length, targetPid: actorIndex, msgs: discardAnimMsgs }, ...balanceQueue, statePatchStep({ players: P, discard: Disc })]
      : [];
    const kickoffGs = {
      ...postDiscardGs,
      ...(handLimitDiscardEvent ? { _visualEvents: [handLimitDiscardEvent] } : {}),
    };
    return {
      decision: 'SCHEDULE_EVENTS',
      postDiscardGs,
      kickoffGs,
      seedQueue,
      handLimitDiscardEvent,
    };
  }

  let newGs = advanceTurn(enterTurnBoundary(postDiscardGs));
  if (handLimitDiscardEvent) {
    newGs = {
      ...newGs,
      _visualEvents: [handLimitDiscardEvent, ...(newGs._visualEvents || [])],
    };
  }

  const seedQueue = discarded.length
    ? [{ type: 'DISCARD', cards: discarded, count: discarded.length, targetPid: actorIndex, msgs: discardAnimMsgs }, ...balanceQueue, statePatchStep({ players: P, discard: Disc })]
    : [];
  const queue = buildPlayerTurnDrawQueue(postDiscardGs, newGs, seedQueue);

  return {
    decision: 'APPLY_NEXT_TURN',
    postDiscardGs,
    newGs,
    queue,
    handLimitDiscardEvent,
  };
}

