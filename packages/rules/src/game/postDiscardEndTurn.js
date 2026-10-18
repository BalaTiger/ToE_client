import { END_TURN_EVENT, getEndTurnEvents } from './endTurnEvents.js';
import { createHandLimitDiscardEvent } from './visualEvents.js';
import { statePatchStep, discardStep } from './animQueueHelpers.js';
import { buildPlayerTurnDrawQueue } from './turnAnimState.js';
import { cardLogText } from './coreUtils.js';
import { TURN_FLOW_STAGE } from './turnFlowStages.js';
import { enterTurnBoundary, transitionTurnFlowStage } from './turnFlowManager.js';
import {
  splitKeptDestroyedDiscarded,
  applyHandDiscardSideEffectsWithAnim as defaultApplyHandDiscardSideEffectsWithAnim,
} from './handLimitDiscard.js';

// A restored snapshot has already committed the discard, but its local
// animation callback/scheduler no longer exists. Resume only the simple,
// non-interactive boundary whose remaining effects can be identified safely.
export function canResumePostDiscardEndTurn(state) {
  if (!state?._isMP || state.gameOver || state.currentTurn !== 0
    || state.phase !== 'DISCARD_PHASE' || state._turnFlowStage !== TURN_FLOW_STAGE.END_TURN
    || state._endTurnReplay || state._turnFlowResume || state.drawReveal
    || Object.keys(state.abilityData || {}).length) return false;
  const actor = state.players?.[0];
  if (!actor || actor.isDead) return false;
  const limit = Math.max(0, (actor._nyaHandLimit ?? 4) - (actor.handLimitDecrease || 0));
  if (!state._tsgSlimeGrantedAtTurnEnd && (actor.hand?.length || 0) > limit) return false;
  return getEndTurnEvents(state.players, 0).every(event => event.id === END_TURN_EVENT.TSG_SLIME_GRANT);
}

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
  const discardAnimMsgs = [];
  let balanceQueue = [];
  let balanceStatePatch = {};

  if (kept.length) {
    const msg = `${logPrefix}：${kept.map(c => cardLogText(c, { alwaysShowName: true })).join(' ')}`;
    L.push(msg);
    discardAnimMsgs.push(msg);
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
    const msg = `衍生牌 ×${destroyed.length} 被销毁`;
    L.push(msg);
    discardAnimMsgs.push(msg);
  }

  const handLimitDiscardEvent = discarded.length
    ? createHandLimitDiscardEvent({
        playerIdx: actorIndex,
      playerName: P[actorIndex]?.name || '该玩家',
      cards: discarded,
      msgs: discardAnimMsgs,
      beforePlayers: baseGs.players,
      beforeDiscard: baseGs.discard,
      afterDiscard: Disc,
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
    // The timeout flag is a local command, consumed by this resolution. It
    // must not travel with the replay and trigger another client's handler.
    _mpAutoDiscard: undefined,
  }, TURN_FLOW_STAGE.END_TURN);

  const endTurnEvents = getEndTurnEvents(P, actorIndex);
  if (endTurnEvents.length) {
    const seedQueue = discarded.length
      ? [discardStep({ card: discarded[0], cards: discarded, count: discarded.length, targetPid: actorIndex, visualEventId: handLimitDiscardEvent?.id, msgs: discardAnimMsgs, playersBefore: baseGs.players, discardBefore: baseGs.discard, discardAfter: Disc }), ...balanceQueue, statePatchStep({ players: P, discard: Disc })]
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
    ? [discardStep({ card: discarded[0], cards: discarded, count: discarded.length, targetPid: actorIndex, visualEventId: handLimitDiscardEvent?.id, msgs: discardAnimMsgs, playersBefore: baseGs.players, discardBefore: baseGs.discard, discardAfter: Disc }), ...balanceQueue, statePatchStep({ players: P, discard: Disc })]
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
