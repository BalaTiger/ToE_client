import {
  buildAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
} from '../game/animQueueCore';
import {
  buildMpRemoteReplayAction,
  MP_REMOTE_REPLAY,
} from '../game/multiplayerRemoteReplay';
import { rotateGsForViewer } from '../game/rotateState';
import { getVisualEventIdsFromState } from '../game/visualEvents';
import { getZhuTopGuard } from '../game/zhuPower';

const ANIMATED_REPLAY_TYPES = new Set([
  MP_REMOTE_REPLAY.ROLE_REVEAL,
  MP_REMOTE_REPLAY.DICE_ROLL,
  MP_REMOTE_REPLAY.START_ANIM,
  MP_REMOTE_REPLAY.ANIM_QUEUE,
]);

export function isMultiplayerReplayBusy({
  roleRevealAnim,
  anim,
  animExiting,
  animQueueRef,
  pendingGsRef,
}) {
  return !!roleRevealAnim
    || !!anim
    || !!animExiting
    || animQueueRef.current.length > 0
    || !!pendingGsRef.current;
}

export function getPendingZhuHideCardForState(state) {
  if (!state || state.gameOver) return null;
  const cardIds = state.zhuLight?.cardIds || [];
  if (state.phase === 'DRAW_REVEAL') {
    const card = state.drawReveal?.card;
    return card?.id
      && !state.drawReveal?.zhuResolved
      && cardIds.includes(card.id)
      ? card
      : null;
  }
  if (state.phase === 'GOD_CHOICE') {
    const card = state.abilityData?.godCard;
    return card?.id
      && !state.abilityData?.zhuResolved
      && cardIds.includes(card.id)
      ? card
      : null;
  }
  if (state.phase === 'SPHINX_GUESS') {
    const card = state.deck?.[0];
    return card?.id && cardIds.includes(card.id) ? card : null;
  }
  if (state.phase === 'ZHU_HIDE_AI_DRAW') {
    return state.abilityData?.zhuGuard?.card
      || getZhuTopGuard(state, state.deck)?.card
      || null;
  }
  return null;
}

export function isLocalZhuHideDecisionPhase(state) {
  if (!getPendingZhuHideCardForState(state)) return false;
  return state?.zhuLight?.ownerIdx === 0
    || state?.players?.[0]?.godName === 'ZHU';
}

export function getMultiplayerReplayStateSignature(state) {
  const abilityData = state?.abilityData || {};
  const drawReveal = state?.drawReveal || {};
  return [
    drawReveal.card?.id || '',
    drawReveal.zhuResolved ? 'zhuDrawDone' : '',
    abilityData.godCard?.id || '',
    abilityData.zhuResolved ? 'zhuGodDone' : '',
    abilityData.zhuIntroShown ? 'zhuIntro' : '',
    (state?.zhuLight?.cardIds || []).join(','),
  ].join('|');
}

function enqueuePendingRawState(rawState, replayAction, context) {
  if (ANIMATED_REPLAY_TYPES.has(replayAction?.type)) {
    context.pendingMpRawQueueRef.current = [
      ...context.pendingMpRawQueueRef.current,
      rawState,
    ];
    return;
  }
  context.pendingMpLatestStateRawRef.current = rawState;
}

function maskApophisBadgeForReplayStart(replayAction, latestState) {
  const maskedState = replayAction?.maskedGs;
  if (!maskedState) return maskedState;
  const hasEclipse = replayAction?.anim?.type === 'APOPHIS_ECLIPSE'
    || (
      Array.isArray(replayAction?.queue)
      && replayAction.queue.some(step => step?.type === 'APOPHIS_ECLIPSE')
    );
  if (!hasEclipse) return maskedState;
  return {
    ...maskedState,
    apophisNight: latestState?.apophisNight || null,
  };
}

function triggerReplayAnimationQueue(context, replayAction, queue) {
  const eventIds = replayAction?.consumedVisualEventIds || [];
  if (eventIds.length) {
    context.triggerAnimQueue(queue, replayAction.pendingGs, undefined, { eventIds });
  } else {
    context.triggerAnimQueue(queue, replayAction.pendingGs);
  }
}

export function applyMultiplayerReplayAction(
  replayAction,
  rotatedState,
  context
) {
  if (replayAction?.type === MP_REMOTE_REPLAY.ROLE_REVEAL) {
    context.mpRoleRevealedRef.current = true;
    context.mpOpeningRoleRevealPendingRef.current = true;
    context.syncVisibleLog(rotatedState.log || [], rotatedState);
    context.setGs(replayAction.maskedGs);
    context.setAnim(null);
    context.setRoleRevealAnim({
      role: replayAction.role,
      pendingGs: replayAction.pendingGs,
    });
    return;
  }
  if (replayAction?.type === MP_REMOTE_REPLAY.DICE_ROLL) {
    const maskedGs = maskApophisBadgeForReplayStart(
      replayAction,
      context.latestGsRef.current
    );
    context.setGs(maskedGs);
    context.receivedGsRef.current = true;
    context.suppressNextBroadcastRef.current = true;
    triggerReplayAnimationQueue(context, replayAction, [replayAction.anim].filter(Boolean));
    return;
  }
  if (replayAction?.type === MP_REMOTE_REPLAY.ANIM_QUEUE) {
    context.markInspectionEventsSeen(replayAction.inspectionEvents);
    if (replayAction.visualLock) {
      context.visualStateLocks.lock(replayAction.visualLock);
    }
    context.setGs(maskApophisBadgeForReplayStart(
      replayAction,
      context.latestGsRef.current
    ));
    context.receivedGsRef.current = true;
    context.suppressNextBroadcastRef.current = true;
    triggerReplayAnimationQueue(context, replayAction, replayAction.queue);
    return;
  }
  if (replayAction?.type === MP_REMOTE_REPLAY.START_ANIM) {
    context.markInspectionEventsSeen(replayAction.inspectionEvents);
    if (replayAction.visualLock) {
      context.visualStateLocks.lock(replayAction.visualLock);
    }
    context.setGs(maskApophisBadgeForReplayStart(
      replayAction,
      context.latestGsRef.current
    ));
    context.receivedGsRef.current = true;
    context.suppressNextBroadcastRef.current = true;
    // START_ANIM used to bypass triggerAnimQueue, so the local drawer missed
    // queue normalization such as DRAW_BACKGROUND_CAMERA_PRE while remote
    // viewers received it through ANIM_QUEUE. Route both replay shapes through
    // the same entry point to keep every client on an identical timeline.
    triggerReplayAnimationQueue(
      context,
      replayAction,
      [replayAction.anim, ...(replayAction.queue || [])].filter(Boolean),
    );
    return;
  }
  if (replayAction?.type === MP_REMOTE_REPLAY.SET_STATE) {
    context.setGs(replayAction.gs);
  }
}

export function processIncomingMultiplayerStateSync({
  rawState,
  allowBuffer = true,
  currentState,
  roleRevealAnim,
  anim,
  animExiting,
  context,
}) {
  if (!rawState) return 'ignored';
  const myIndex = context.myPlayerIndexRef.current;
  const rotatedState = rotateGsForViewer(rawState, myIndex);
  const previousState = context.latestGsRef.current || currentState;
  // A replay delta can intentionally keep the public game state unchanged and
  // carry only a newly-created visual event (endless corridor and CTH rest
  // draws both use this shape).  Do not let the stale-state fast path discard
  // such packets, otherwise the following turn-state packet overtakes the
  // missing presentation on remote clients.
  const hasFreshVisualEvents = getVisualEventIdsFromState(rotatedState)
    .some(id => !context.consumedVisualEventIdsRef.current.has(id));
  const localIsTerminal = !!previousState?.gameOver
    || previousState?.phase === 'GOD_RESURRECTION';
  const incomingIsTerminal = !!rotatedState?.gameOver
    || rotatedState?.phase === 'GOD_RESURRECTION';
  if (localIsTerminal && !incomingIsTerminal) return 'ignored';
  if (previousState?.gameOver && rotatedState?.gameOver) return 'ignored';
  if (
    !hasFreshVisualEvents
    && previousState
    && rotatedState._turnKey === previousState._turnKey
    && rotatedState.currentTurn === previousState.currentTurn
    && rotatedState.phase === previousState.phase
    && (rotatedState.log?.length || 0)
      <= (previousState.log?.length || 0)
    && getMultiplayerReplayStateSignature(rotatedState)
      === getMultiplayerReplayStateSignature(previousState)
  ) {
    return 'ignored';
  }
  if (
    context.mpOpeningRoleRevealPendingRef.current
    && !rotatedState.gameOver
  ) {
    return 'ignored';
  }
  const replayAction = buildMpRemoteReplayAction({
    rotated: rotatedState,
    previousGs: previousState,
    roleRevealed: context.mpRoleRevealedRef.current,
    buildAnimQueue,
    buildFullHandSwapTransferQueueFromLogs,
    consumedVisualEventIds: context.consumedVisualEventIdsRef.current,
  });
  if (
    allowBuffer
    && isMultiplayerReplayBusy({
      roleRevealAnim,
      anim,
      animExiting,
      animQueueRef: context.animQueueRef,
      pendingGsRef: context.pendingGsRef,
    })
  ) {
    enqueuePendingRawState(rawState, replayAction, context);
    return 'buffered';
  }
  context.receivedGsRef.current = true;
  context.animQueueRef.current = [];
  context.pendingGsRef.current = null;
  context.setAnimExiting(false);
  context.clearDamageAnimations();
  context.setAnim(null);
  applyMultiplayerReplayAction(replayAction, rotatedState, context);
  return 'applied';
}
