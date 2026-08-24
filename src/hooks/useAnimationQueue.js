import { useEffect, useRef, useState } from 'react';
import { dedupeInferredDiscardTransfers } from '../game/animQueueHelpers';
import { markConsumedVisualEvents } from '../game/visualEvents';
import { attachApophisNightTimeline, normalizeApophisQueueForPlayback } from '../game/apophisAnimQueue';
import {
  applyStatAnimationImpact,
  primeDisplayStatsForStatQueue,
  validateStatAnimationContinuity,
} from '../game/statEvents';
import {
  assertCompleteThrowStoneTransactions,
  prepareAnimationQueueSteps,
  validateAnimationQueueSteps,
} from '../game/animationStepSchema';
import {
  ANIMATION_QUEUE_EVENT,
  ANIMATION_QUEUE_PHASE,
  canFireAnimationCue,
  createAnimationQueueState,
  transitionAnimationQueue,
} from '../game/animationQueueMachine';
import {
  advanceAnimationElapsed,
  buildAnimationPlaybackCues,
  getPendingAnimationCues,
  resolveAnimationStepTiming,
} from '../game/animationTiming';
import {
  ANIMATION_QUEUE_AUTHORITY,
  getAnimationQueueVisualEventIds,
} from '../game/visualEventTransactionCompiler';

// Diagnostic tracing is opt-in so normal games do not pay for verbose queue
// logging. Enable in a development console with:
//   globalThis.__TOE_TRACE_ANIM = true
export function isAnimationTraceEnabled() {
  try {
    if (globalThis.__TOE_TRACE_ANIM) return true;
    // The in-app browser may expose a non-extensible global object, so allow
    // diagnostics to be enabled without mutating window from a console.
    if (typeof location !== 'undefined') {
      const params = new URLSearchParams(location.search || '');
      if (params.get('toeTraceAnim') === '1') return true;
    }
    if (typeof localStorage !== 'undefined' && localStorage.getItem('toeTraceAnim') === '1') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function traceAnimationQueue(stage, payload = {}) {
  if (!isAnimationTraceEnabled()) return;
  try {
    // Serialize the payload so browser console collectors retain the fields
    // (many render a plain object only as "Object").
    console.log('[ANIM-TRACE]', stage, JSON.stringify(payload));
  } catch {
    // Diagnostic logging must never affect playback.
  }
}
export {
  collectPendingVisualEventIds,
  getRuleEventCompileIds,
  getRuleEventCompileState,
} from '../game/animationTransaction';

export function useAnimationQueue({
  gs,
  copyPlayers,
  setGs,
  setDisplayStats,
  setVisualPlayersOverride,
  setVisualDiscard,
  syncVisibleLog,
  appendVisibleLog,
  getVisualDiscardForState,
  resolveTurnHighlightForStep,
  prepareAnimQueueLogs,
  startNextTurn,
  applyNextTurnGs,
  cthContinueRestDraws,
  visibleLogRef,
  visibleLogAuthorityRef,
  visualStateLocks,
  suppressNextBroadcastRef,
  receivedGsRef,
  consumedVisualEventIdsRef,
  normalizePendingGs = state => state,
  ANIM_STEP_GAP,
  CARD_REVEAL_DURATION,
  ANIM_DURATION,
  ANIM_SPEED_SCALE,
  paused = false,
}) {
  const [anim, setAnim] = useState(null);
  const [animExiting, setAnimExiting] = useState(false);
  const animQueueRef = useRef([]);
  const pendingGsRef = useRef(null);
  const animCallbackRef = useRef(null);
  const playbackRef = useRef({ id: null, elapsedMs: 0, runningSinceMs: null, firedCueIds: new Set() });
  const playbackIdRef = useRef(0);
  const queueLifecycleRef = useRef(createAnimationQueueState());
  const pendingVisualEventIdsRef = useRef([]);

  function sendQueueLifecycleEvent(type) {
    queueLifecycleRef.current = transitionAnimationQueue(queueLifecycleRef.current, type);
    return queueLifecycleRef.current;
  }

  function reportSchemaIssues(stage, issues = []) {
    if (!issues.length || !import.meta.env?.DEV) return;
    console.error(`[animation-schema] ${stage}`, issues);
  }

  function revealAnimLogs(animStep) {
    if (!animStep) return;
    if (Array.isArray(animStep._logChunk) && animStep._logChunk.length) {
      appendVisibleLog(animStep._logChunk);
    }
  }

  function applyVisualPatch(patch = {}) {
    if (Object.prototype.hasOwnProperty.call(patch, 'players')) {
      const players = patch.players ? copyPlayers(patch.players) : null;
      visualStateLocks.lock({ players });
      if (setVisualPlayersOverride) setVisualPlayersOverride(players);
      // Player snapshots own cards/status/identity presentation. Numeric
      // HP/SAN are exclusively advanced by their stat animation impact.
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'discard')) {
      setVisualDiscard([...(patch.discard || [])]);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'zhuLight')) {
      visualStateLocks.lock({ zhuLight: patch.zhuLight || null });
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'hiddenZhuCardId')) {
      visualStateLocks.lock({ hiddenZhuCardId: patch.hiddenZhuCardId || null });
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'turnHighlight')) {
      visualStateLocks.lock({ turnHighlight: patch.turnHighlight });
    }
  }

  function applyStatePatch(prev, patchStep) {
    if (!prev) return prev;
    const has = key => Object.prototype.hasOwnProperty.call(patchStep, key);
    const patch = {};
    if (has('players')) patch.players = copyPlayers(patchStep.players || prev.players);
    if (has('discard')) patch.discard = [...(patchStep.discard || [])];
    if (has('deck')) patch.deck = [...(patchStep.deck || [])];
    if (has('log')) patch.log = [...(patchStep.log || [])];
    if (has('abilityData')) patch.abilityData = { ...(patchStep.abilityData || {}) };
    [
      'phase',
      'currentTurn',
      'drawReveal',
      'selectedCard',
      'zhuLight',
      'skillUsed',
      'restUsed',
      'huntAbandoned',
      'godFromHandUsed',
      'godTriggeredThisTurn',
      'globalOnlySwapOwner',
      'apophisNight',
      '_statEventSeq',
      '_statEvents',
      '_inspectionSeq',
      '_apophisTargetSeq',
      '_apophisTargetEvent',
    ].forEach(key => {
      if (has(key)) patch[key] = patchStep[key];
    });
    return { ...prev, ...patch };
  }

  const normalizePendingState = state => (state ? normalizePendingGs(state) : state);

  function logAiTurnQueueDebug(stage, payload = {}) {
    try {
      console.log(`[AI-TURN-DEBUG] ${stage}`, payload);
    } catch {
      // noop
    }
  }

  function syncDisplayStatsFromState(state) {
    if (!setDisplayStats || !Array.isArray(state?.players)) return;
    setDisplayStats(state.players.map(player => ({ hp: player.hp, san: player.san })));
  }

  function shouldUseDrawBackgroundCamera(step) {
    return step?.type === 'DRAW_CARD' && !step?.card?.effect && !step?.disableDrawBackgroundCamera;
  }

  function addDrawBackgroundCameraPrelude(queue = []) {
    const result = [];
    queue.forEach(step => {
      if (shouldUseDrawBackgroundCamera(step) && result[result.length - 1]?.type !== 'DRAW_BACKGROUND_CAMERA_PRE') {
        result.push({ type: 'DRAW_BACKGROUND_CAMERA_PRE' });
      }
      result.push(step);
    });
    return result;
  }

  function advanceQueue() {
    traceAnimationQueue('advance:enter', {
      activeAnim: anim?.type || null,
      activePlaybackId: anim?._playbackId || null,
      queueLength: animQueueRef.current.length,
      queueHead: animQueueRef.current[0]?.type || null,
      pendingPhase: pendingGsRef.current?.phase || null,
      pendingTurn: pendingGsRef.current?.currentTurn ?? null,
      lifecycle: queueLifecycleRef.current.phase,
    });
    setAnimExiting(false);
    if (animQueueRef.current.length > 0) {
      const next = animQueueRef.current.shift();
      traceAnimationQueue('advance:step', {
        step: next?.type || null,
        playbackId: next?._playbackId || null,
        remaining: animQueueRef.current.length,
        pendingPhase: pendingGsRef.current?.phase || null,
        pendingTurn: pendingGsRef.current?.currentTurn ?? null,
      });
      if (next.type === 'STATE_PATCH') {
        revealAnimLogs(next);
        visualStateLocks.clear({players:true,zhuLight:true});
        if (Object.prototype.hasOwnProperty.call(next, 'players') && setVisualPlayersOverride) {
          setVisualPlayersOverride(copyPlayers(next.players || []));
        }
        if (Object.prototype.hasOwnProperty.call(next, 'discard')) {
          setVisualDiscard([...(next.discard || [])]);
        }
        setGs(prev => applyStatePatch(prev, next));
        advanceQueue();
      } else if (next.type === 'VISUAL_LOCK') {
        visualStateLocks.lock({
          players: next.players,
          zhuLight: next.zhuLight,
          hiddenZhuCardId: next.hiddenZhuCardId,
          turnHighlight: next.turnHighlight,
        });
        advanceQueue();
      } else if (next.type === 'CTH_CONTINUE') {
        sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.COMMIT_STARTED);
        setAnim(null);
        const currentGs = pendingGsRef.current || gs;
        pendingGsRef.current = null;
        animCallbackRef.current = null;
        sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.QUEUE_COMPLETED);
        const cthDrawsRemaining = next.data?.cthDrawsRemaining || 0;
        if (cthDrawsRemaining > 0) {
          cthContinueRestDraws(currentGs);
        } else {
          const nextGs = startNextTurn({ ...currentGs, currentTurn: 0, abilityData: {} });
          applyNextTurnGs(nextGs);
        }
      } else {
        const nextTurnHighlight = resolveTurnHighlightForStep(next, pendingGsRef.current || gs, gs?.players || []);
        if (nextTurnHighlight != null) visualStateLocks.lock({turnHighlight:nextTurnHighlight});
        if (next.visualSetupPatch) applyVisualPatch(next.visualSetupPatch);
        if (next?.type === 'EARTHQUAKE') { try { console.log('[EQ-DEBUG] advanceQueue: setting EARTHQUAKE as active anim; remainingQueue =', animQueueRef.current.map(s => s.type)); } catch { /* noop */ } }
        const displayStep = next.type === 'YOUR_TURN' && nextTurnHighlight === 0
          ? { ...next, local: true }
          : next;
        sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.STEP_ADVANCED);
        setAnim(displayStep);
        revealAnimLogs(displayStep);
      }
    } else {
      traceAnimationQueue('advance:commit', {
        pendingPhase: pendingGsRef.current?.phase || null,
        pendingTurn: pendingGsRef.current?.currentTurn ?? null,
        hasCallback: !!animCallbackRef.current,
        lifecycle: queueLifecycleRef.current.phase,
      });
      sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.COMMIT_STARTED);
      const next = pendingGsRef.current;
      const normalizedNext = normalizePendingState(next);
      if (next?.phase === 'AI_TURN' || normalizedNext?.phase === 'AI_TURN') {
        logAiTurnQueueDebug('advanceQueue:complete', {
          pendingTurn: next?.currentTurn,
          pendingName: next?.players?.[next?.currentTurn]?.name,
          pendingTurnStartLogs: next?._turnStartLogs,
          pendingDrawnCard: next?._drawnCard?.name || next?.drawReveal?.card?.name || next?.abilityData?.godCard?.name || null,
          pendingHasPlayersBeforeThisDraw: !!next?._playersBeforeThisDraw,
          normalizedTurnStartLogs: normalizedNext?._turnStartLogs,
          normalizedDrawnCard: normalizedNext?._drawnCard?.name || normalizedNext?.drawReveal?.card?.name || normalizedNext?.abilityData?.godCard?.name || null,
          normalizedHasPlayersBeforeThisDraw: !!normalizedNext?._playersBeforeThisDraw,
        });
      }
      const callback = animCallbackRef.current;
      if (next?.log) syncVisibleLog(next.log);
      const nextVisualEventIds = pendingVisualEventIdsRef.current;
      if (nextVisualEventIds.length && consumedVisualEventIdsRef?.current) {
        markConsumedVisualEvents(consumedVisualEventIdsRef.current, nextVisualEventIds.map(id => ({ id, type: 'consumed' })));
      }
      pendingVisualEventIdsRef.current = [];
      let callbackFailed = false;
      if (callback) {
        const pendingBeforeCallback = pendingGsRef.current;
        const callbackBeforeCallback = animCallbackRef.current;
        traceAnimationQueue('advance:callback-start', {
          pendingPhase: pendingBeforeCallback?.phase || null,
          pendingTurn: pendingBeforeCallback?.currentTurn ?? null,
          queueLength: animQueueRef.current.length,
        });
        try {
          callback();
        } catch (error) {
          callbackFailed = true;
          traceAnimationQueue('advance:callback-error', {
            message: error?.message || String(error),
            queueLength: animQueueRef.current.length,
            pendingPhase: pendingGsRef.current?.phase || null,
            pendingTurn: pendingGsRef.current?.currentTurn ?? null,
          });
          // The rule state has already been resolved. A presentation failure in
          // the chained queue must not strand the previous turn's visual locks
          // or leave the game permanently stuck at the callback boundary.
          console.error('[animation-transaction] chained presentation callback failed; committing resolved state', error);
        }
        const callbackStartedNextQueue =
          pendingGsRef.current !== pendingBeforeCallback ||
          animCallbackRef.current !== callbackBeforeCallback ||
          animQueueRef.current.length > 0;
        traceAnimationQueue('advance:callback-end', {
          callbackFailed,
          callbackStartedNextQueue,
          queueLength: animQueueRef.current.length,
          queueHead: animQueueRef.current[0]?.type || null,
          pendingPhase: pendingGsRef.current?.phase || null,
          pendingTurn: pendingGsRef.current?.currentTurn ?? null,
        });
        if (!callbackFailed && callbackStartedNextQueue) {
          return;
        }
      }
      if (callbackFailed) {
        animQueueRef.current = [];
        pendingVisualEventIdsRef.current = [];
      }
      if ((!callback || callbackFailed) && normalizedNext) {
        setVisualDiscard(getVisualDiscardForState(normalizedNext));
        syncDisplayStatsFromState(normalizedNext);
        if (suppressNextBroadcastRef.current) {
          suppressNextBroadcastRef.current = false;
          receivedGsRef.current = true;
        }
        setGs(prev => {
          if (prev?.gameOver || prev?.phase === 'PLAYER_WIN_PENDING' || prev?.phase === 'TREASURE_WIN') return prev;
          return normalizedNext;
        });
      }
      pendingGsRef.current = null;
      animCallbackRef.current = null;
      visualStateLocks.clear({turnHighlight:true,players:true,zhuLight:true,hiddenZhuCardId:true});
      if (setVisualPlayersOverride) setVisualPlayersOverride(null);
      setAnim(null);
      sendQueueLifecycleEvent(callbackFailed
        ? ANIMATION_QUEUE_EVENT.INTERRUPTED
        : ANIMATION_QUEUE_EVENT.QUEUE_COMPLETED);
    }
  }

  useEffect(() => {
    if (!anim) return;
    if (anim.type === 'EARTHQUAKE') {
      try { console.log('[EQ-DEBUG] anim EARTHQUAKE became active: discardEvents =', anim.discardEvents?.length, ', visualTimeline =', anim.visualTimeline?.length, ', durationMs =', anim.durationMs); } catch { /* noop */ }
    }
    const playbackId = anim._playbackId || anim;
    if (playbackRef.current.id !== playbackId) {
      playbackRef.current = { id: playbackId, elapsedMs: 0, runningSinceMs: null, firedCueIds: new Set() };
    }
    const playback = playbackRef.current;
    if (paused) {
      sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.PAUSED);
      return;
    }
    sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.RESUMED);
    playback.runningSinceMs = Date.now();
    const timers = [];
    const fireCue = cue => {
      const active = playbackRef.current;
      const skipReason = active.id !== playbackId
        ? 'stale-playback'
        : active.firedCueIds.has(cue.id)
          ? 'already-fired'
          : !canFireAnimationCue(queueLifecycleRef.current, cue.kind)
            ? `lifecycle-${queueLifecycleRef.current.phase}`
            : null;
      if (skipReason) {
        traceAnimationQueue('cue:skip', {
          animType: anim?.type || null,
          playbackId,
          cueId: cue.id,
          cueKind: cue.kind,
          reason: skipReason,
          lifecycle: queueLifecycleRef.current.phase,
          queueLength: animQueueRef.current.length,
          queueHead: animQueueRef.current[0]?.type || null,
        });
        return;
      }
      active.firedCueIds.add(cue.id);
      if (cue.kind === 'visual') applyVisualPatch(cue.patch);
      else if (cue.kind === 'impact' && setDisplayStats) {
        setDisplayStats(prev => applyStatAnimationImpact(prev, anim));
      } else if (cue.kind === 'exit') {
        sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.STEP_EXITED);
        setAnimExiting(true);
      } else if (cue.kind === 'advance') {
        traceAnimationQueue('cue:advance', {
          animType: anim?.type || null,
          playbackId: anim?._playbackId || null,
          atMs: cue.atMs,
          elapsedMs: playback.elapsedMs,
          queueLength: animQueueRef.current.length,
          lifecycle: queueLifecycleRef.current.phase,
        });
        try {
          advanceQueue();
        } catch (error) {
          traceAnimationQueue('cue:advance-error', {
            animType: anim?.type || null,
            playbackId: anim?._playbackId || null,
            message: error?.message || String(error),
            queueLength: animQueueRef.current.length,
            pendingPhase: pendingGsRef.current?.phase || null,
            pendingTurn: pendingGsRef.current?.currentTurn ?? null,
          });
          throw error;
        }
      }
    };
    const cues = getPendingAnimationCues(
      buildAnimationPlaybackCues(anim, ANIM_STEP_GAP),
      playback.elapsedMs,
      playback.firedCueIds,
    );
    traceAnimationQueue('playback:start', {
      animType: anim.type,
      playbackId: playbackId,
      durationMs: anim.durationMs ?? null,
      elapsedMs: playback.elapsedMs,
      pendingCues: cues.map(cue => ({ id: cue.id, kind: cue.kind, delayMs: cue.delayMs })),
      queueLength: animQueueRef.current.length,
      pendingPhase: pendingGsRef.current?.phase || null,
      pendingTurn: pendingGsRef.current?.currentTurn ?? null,
      lifecycle: queueLifecycleRef.current.phase,
    });
    cues.forEach(cue => {
      timers.push(setTimeout(() => fireCue(cue), cue.delayMs));
    });
    return () => {
      timers.forEach(clearTimeout);
      const active = playbackRef.current;
      if (active.id === playbackId && Number.isFinite(active.runningSinceMs)) {
        active.elapsedMs = advanceAnimationElapsed(active.elapsedMs, active.runningSinceMs, Date.now());
        traceAnimationQueue('playback:cleanup', {
          animType: anim?.type || null,
          playbackId,
          elapsedMs: active.elapsedMs,
          queueLength: animQueueRef.current.length,
          pendingPhase: pendingGsRef.current?.phase || null,
          pendingTurn: pendingGsRef.current?.currentTurn ?? null,
          lifecycle: queueLifecycleRef.current.phase,
        });
        active.runningSinceMs = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim, paused]);

  function playAnimationTransaction(transaction) {
    if (!transaction || transaction.authority !== ANIMATION_QUEUE_AUTHORITY.QUEUE || !Array.isArray(transaction.queue)) {
      throw new TypeError('[animation-transaction] playback requires a queue-authoritative transaction');
    }
    const {
      queue,
      nextState: nextGs,
      callback,
      eventIds = [],
      preserveQueueOrder = false,
    } = transaction;
    traceAnimationQueue('transaction:start', {
      context: transaction.context || null,
      queue: queue.map(step => step?.type || null),
      nextPhase: nextGs?.phase || null,
      nextTurn: nextGs?.currentTurn ?? null,
      hasCallback: !!callback,
      eventIds: eventIds.length,
    });
    if (Array.isArray(queue) && queue.some(s => s?.type === 'EARTHQUAKE')) {
      try { console.log('[EQ-DEBUG] playAnimationTransaction received queue =', queue.map(s => s.type), '| hasCallback =', !!callback, '| nextGs.phase =', nextGs?.phase); } catch { /* noop */ }
    }
    // Bespoke target-action queues do not all originate from the visual-event compiler.
    // Normalize at the common playback boundary so the black-night roll is
    // always shown before the selected action's own visual effects.
    const apophisOrderedQueue = nextGs
      ? normalizeApophisQueueForPlayback(queue, gs, nextGs, { preserveQueueOrder })
      : queue;
    const dedupedQueue = dedupeInferredDiscardTransfers(apophisOrderedQueue);
    assertCompleteThrowStoneTransactions(dedupedQueue);
    const schemaPreparation = prepareAnimationQueueSteps(dedupedQueue);
    reportSchemaIssues('input normalization failed', schemaPreparation.issues);
    const normalizedQueue = attachApophisNightTimeline(
      addDrawBackgroundCameraPrelude(schemaPreparation.steps),
      gs?.apophisNight,
      nextGs?.apophisNight,
    );
    if (
      nextGs?.phase === 'AI_TURN' &&
      Array.isArray(normalizedQueue) &&
      normalizedQueue.some(step => step?.type === 'YOUR_TURN' || step?.type === 'DRAW_CARD')
    ) {
      logAiTurnQueueDebug('playAnimationTransaction:start', {
        turn: nextGs.currentTurn,
        name: nextGs.players?.[nextGs.currentTurn]?.name,
        queue: normalizedQueue.map(step => step?.type),
        hasCallback: !!callback,
        turnStartLogs: nextGs._turnStartLogs,
        drawnCard: nextGs._drawnCard?.name || nextGs.drawReveal?.card?.name || nextGs.abilityData?.godCard?.name || null,
        hasPlayersBeforeThisDraw: !!nextGs._playersBeforeThisDraw,
      });
    }

    if (!normalizedQueue.length) {
      if (callback) {
        if (nextGs?.log) syncVisibleLog(nextGs.log);
        callback();
      } else {
        const normalizedNextGs = normalizePendingState(nextGs);
        if (nextGs?.log) syncVisibleLog(nextGs.log);
        syncDisplayStatsFromState(normalizedNextGs);
        setGs(normalizedNextGs);
      }
      return;
    }

    const wrappedCallback = callback;

    visibleLogAuthorityRef.current = Array.isArray(nextGs?.log) ? nextGs.log : (Array.isArray(visibleLogAuthorityRef.current) ? visibleLogAuthorityRef.current : []);
    const timedQueue = normalizedQueue.map(step => resolveAnimationStepTiming(step, {
      durationByType: ANIM_DURATION,
      speedScale: ANIM_SPEED_SCALE,
      cardRevealDuration: CARD_REVEAL_DURATION,
    }));
    reportSchemaIssues('timed queue validation failed', validateAnimationQueueSteps(timedQueue));
    const preparedQueue = prepareAnimQueueLogs(timedQueue, nextGs, visibleLogRef.current)
      .map(step => ({ ...step, _playbackId: ++playbackIdRef.current }));
    pendingVisualEventIdsRef.current = eventIds.length
      ? [...new Set(eventIds)]
      : getAnimationQueueVisualEventIds(preparedQueue);
    const continuityIssues = validateStatAnimationContinuity(preparedQueue);
    if (continuityIssues.length && import.meta.env?.DEV) {
      console.warn('[stat-presentation] discontinuous stat animation queue', continuityIssues);
    }
    if (setDisplayStats) {
      setDisplayStats(prev => primeDisplayStatsForStatQueue(prev, preparedQueue));
    }
    const setupStep = preparedQueue.find(step => step?.visualSetupPatch && step.visualSetupTiming === 'queueStart');
    if (setupStep) {
      applyVisualPatch(setupStep.visualSetupPatch);
    }
    visualStateLocks.lock({turnHighlight:gs?.currentTurn ?? null});
    const playableQueue = [...preparedQueue];
    while (playableQueue[0]?.type === 'VISUAL_LOCK') {
      const visualLock = playableQueue.shift();
      applyVisualPatch({
        ...(Object.prototype.hasOwnProperty.call(visualLock, 'players') ? { players: visualLock.players } : {}),
        ...(Object.prototype.hasOwnProperty.call(visualLock, 'zhuLight') ? { zhuLight: visualLock.zhuLight } : {}),
        ...(Object.prototype.hasOwnProperty.call(visualLock, 'hiddenZhuCardId') ? { hiddenZhuCardId: visualLock.hiddenZhuCardId } : {}),
        ...(Object.prototype.hasOwnProperty.call(visualLock, 'turnHighlight') ? { turnHighlight: visualLock.turnHighlight } : {}),
      });
    }
    if (!playableQueue.length) {
      if (queueLifecycleRef.current.phase !== ANIMATION_QUEUE_PHASE.IDLE) {
        sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.INTERRUPTED);
      }
      sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.QUEUE_STARTED);
      pendingGsRef.current = nextGs;
      animQueueRef.current = [];
      animCallbackRef.current = wrappedCallback;
      advanceQueue();
      return;
    }
    const firstTurnHighlight = resolveTurnHighlightForStep(playableQueue[0], nextGs, gs?.players || []);
    if (firstTurnHighlight != null) visualStateLocks.lock({turnHighlight:firstTurnHighlight});
    if (playableQueue[0].visualSetupPatch) applyVisualPatch(playableQueue[0].visualSetupPatch);
    if (queueLifecycleRef.current.phase !== ANIMATION_QUEUE_PHASE.IDLE) {
      sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.INTERRUPTED);
    }
    sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.QUEUE_STARTED);
    pendingGsRef.current = nextGs;
    animQueueRef.current = [...playableQueue.slice(1)];
    animCallbackRef.current = wrappedCallback;
    const firstStep = playableQueue[0].type === 'YOUR_TURN' && firstTurnHighlight === 0
      ? { ...playableQueue[0], local: true }
      : playableQueue[0];
    setAnim(firstStep);
    revealAnimLogs(firstStep);
  }

  return {
    anim,
    setAnim,
    animExiting,
    setAnimExiting,
    animQueueRef,
    pendingGsRef,
    animCallbackRef,
    pendingVisualEventIdsRef,
    queueLifecycleRef,
    playAnimationTransaction,
    advanceQueue,
  };
}
