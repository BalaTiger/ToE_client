import { buildFullHandSwapTransferQueueFromLogs } from '../game/animQueueCore';
import {
  buildMpRemoteReplayAction,
  MP_REMOTE_REPLAY,
} from '../game/multiplayerRemoteReplay';
import { rotateGsForViewer } from '../game/rotateState';
import { getVisualEventIdsFromState } from '../game/visualEvents';
import { getZhuTopGuard } from '../game/zhuPower';
import {
  ANIMATION_QUEUE_AUTHORITY,
  compileFreshVisualEventQueue,
} from '../game/visualEventTransactionCompiler';
import {
  isResolvedMpHuntWaitState,
  rememberMpHuntRevealConfirmation,
} from './multiplayerHuntReplayGuard';

const ANIMATED_REPLAY_TYPES = new Set([
  MP_REMOTE_REPLAY.ROLE_REVEAL,
  MP_REMOTE_REPLAY.DICE_ROLL,
  MP_REMOTE_REPLAY.START_ANIM,
  MP_REMOTE_REPLAY.ANIM_QUEUE,
]);

// Socket.IO preserves delivery order on this connection. A new animated full
// snapshot supersedes the earlier plain snapshot, while subsequent plain
// decisions must remain after the FIFO replay. Remember only exact animated
// packets so a duplicate cannot retire that later decision. There is no wire
// sequence number: phases and turn numbers cannot determine packet freshness.
const RECENT_ANIMATED_RAW_LIMIT = 16;

function getWireValueSignature(value) {
  // Canonical JSON matches wire values even when object keys are reordered.
  // Store bounded strings rather than mutable snapshots or lossy hashes.
  return JSON.stringify(value, (_key, value) => (
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
      : value
  ));
}

function getAnimatedRawSignature(rawState) {
  return getVisualEventIdsFromState(rawState).length
    ? getWireValueSignature(rawState)
    : null;
}

function rememberAnimatedRawSignature(signature, context) {
  if (!signature || !context.recentMpAnimatedRawSignaturesRef) return;
  const recent = context.recentMpAnimatedRawSignaturesRef.current || [];
  context.recentMpAnimatedRawSignaturesRef.current = [
    ...recent.slice(-(RECENT_ANIMATED_RAW_LIMIT - 1)), signature,
  ];
}

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
    context.pendingMpLatestStateRawRef.current = null;
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
  const transactionMeta = {
    ...(eventIds.length ? { eventIds } : {}),
    authority: replayAction?.queueAuthority || ANIMATION_QUEUE_AUTHORITY.QUEUE,
    preserveQueueOrder: true,
  };
  // Every animated remote replay action is fully planned before execution.
  // Never let the local playback boundary recompile the synchronized state.
  context.triggerAnimQueue(queue, replayAction.pendingGs, undefined, transactionMeta);
}

export function applyMultiplayerReplayAction(
  replayAction,
  rotatedState,
  context
) {
  if (replayAction?.type === MP_REMOTE_REPLAY.ROLE_REVEAL) {
    context.mpRoleRevealedRef.current = true;
    context.mpOpeningRoleRevealPendingRef.current = true;
    context.restoreVisibleLog(rotatedState._initialLog || [], rotatedState);
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
  replayingQueuedAnimation = false,
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
  // Preserve a target animation accepted before its confirmation in the FIFO.
  // New inbound and cached plain waits may not reopen that resolved prompt,
  // even while its accepted reveal is queued or playing.
  if (isResolvedMpHuntWaitState(
    rotatedState,
    context.completedMpHuntRevealPromptIdsRef?.current,
  ) && !(!allowBuffer && replayingQueuedAnimation && hasFreshVisualEvents)) return 'ignored';
  const localIsTerminal = !!previousState?.gameOver
    || previousState?.phase === 'GOD_RESURRECTION';
  const incomingIsTerminal = !!rotatedState?.gameOver
    || rotatedState?.phase === 'GOD_RESURRECTION';
  if (localIsTerminal && !incomingIsTerminal) return 'ignored';
  if (previousState?.gameOver && rotatedState?.gameOver) return 'ignored';
  if (
    !hasFreshVisualEvents
    && !rotatedState.gameOver
    && previousState
    && rotatedState._turnKey === previousState._turnKey
    && rotatedState.currentTurn === previousState.currentTurn
    && rotatedState.phase === previousState.phase
    && (rotatedState.log?.length || 0)
      <= (previousState.log?.length || 0)
    && getMultiplayerReplayStateSignature(rotatedState)
      === getMultiplayerReplayStateSignature(previousState)
    // Same phase/log length is insufficient for decision snapshots: a new
    // prompt or revealed card can share already-consumed visual event IDs.
    // Compare complete wire decision values; allow the planner to apply them
    // without replaying those consumed events.
    && getWireValueSignature(rotatedState.abilityData || {})
      === getWireValueSignature(previousState.abilityData || {})
    && getWireValueSignature(rotatedState.drawReveal || null)
      === getWireValueSignature(previousState.drawReveal || null)
  ) {
    return 'ignored';
  }
  if (
    context.mpOpeningRoleRevealPendingRef.current
    && !rotatedState.gameOver
  ) {
    return 'ignored';
  }
  const incomingSignature = allowBuffer ? getAnimatedRawSignature(rawState) : null;
  if (
    incomingSignature
    && context.recentMpAnimatedRawSignaturesRef?.current?.includes(incomingSignature)
  ) {
    return 'ignored';
  }
  const replayAction = buildMpRemoteReplayAction({
    rotated: rotatedState,
    previousGs: previousState,
    roleRevealed: context.mpRoleRevealedRef.current,
    compileFreshVisualEventQueue,
    buildFullHandSwapTransferQueueFromLogs,
    consumedVisualEventIds: context.consumedVisualEventIdsRef.current,
  });
  // Record on acceptance, before buffering: the visible state can remain in
  // HUNT_WAIT_REVEAL until this confirmation's presentation finishes.
  rememberMpHuntRevealConfirmation(
    rotatedState,
    context.completedMpHuntRevealPromptIdsRef?.current,
  );
  if (allowBuffer && ANIMATED_REPLAY_TYPES.has(replayAction?.type)) {
    rememberAnimatedRawSignature(incomingSignature, context);
  }
  if (
    allowBuffer
    && (context.pendingMpRawQueueRef.current.length > 0 || isMultiplayerReplayBusy({
      roleRevealAnim,
      anim,
      animExiting,
      animQueueRef: context.animQueueRef,
      pendingGsRef: context.pendingGsRef,
    }))
  ) {
    enqueuePendingRawState(rawState, replayAction, context);
    return 'buffered';
  }
  // This is a newer direct delivery, not our own replay drain. Any earlier
  // cached plain snapshot has been superseded. Draining must preserve the
  // later plain decision which arrived after the queued animated packet.
  if (allowBuffer) context.pendingMpLatestStateRawRef.current = null;
  context.receivedGsRef.current = true;
  context.animQueueRef.current = [];
  context.pendingGsRef.current = null;
  context.setAnimExiting(false);
  context.clearDamageAnimations();
  context.setAnim(null);
  applyMultiplayerReplayAction(replayAction, rotatedState, context);
  return 'applied';
}
