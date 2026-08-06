import { useEffect, useRef, useState } from 'react';
import { dedupeInferredDiscardTransfers } from '../game/animQueueHelpers';
import { ensureVisualEventState, markConsumedVisualEvents } from '../game/visualEvents';
import { attachApophisNightTimeline, mergeApophisTargetQueue } from '../game/apophisAnimQueue';
import { buildAnimQueue } from '../game/animQueueCore';
import {
  applyStatAnimationImpact,
  primeDisplayStatsForStatQueue,
  validateStatAnimationContinuity,
} from '../game/statEvents';
import {
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
  compileRuleVisualEventsToAnimTransaction,
  getAnimationQueueVisualEventIds,
  mergeAnimationTransactionQueue,
} from '../game/visualEventTransactionCompiler';

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
  clearPendingAnimDeathFlags,
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

  function commitDeathPresentation(animStep) {
    if (animStep?.type !== 'DEATH' || !Array.isArray(animStep.hitIndices) || !animStep.hitIndices.length) return;
    const deathIndices = new Set(animStep.hitIndices);
    const clearDeaths = players => (players || []).map((player, index) => (
      deathIndices.has(index) && player?._pendingAnimDeath
        ? { ...player, _pendingAnimDeath: false }
        : player
    ));

    // DEATH begins after the guillotine/petrify effect. Dim the panel when
    // its death broadcast appears, without waiting for a chained action.
    setGs(prev => prev?.players ? { ...prev, players: clearDeaths(prev.players) } : prev);
    if (setVisualPlayersOverride) {
      setVisualPlayersOverride(prev => prev ? clearDeaths(prev) : prev);
    }
    visualStateLocks.updatePlayers?.(clearDeaths);
    if (pendingGsRef.current?.players) {
      pendingGsRef.current = {
        ...pendingGsRef.current,
        players: clearDeaths(pendingGsRef.current.players),
      };
    }
    animQueueRef.current = animQueueRef.current.map(step => (
      step?.players ? { ...step, players: clearDeaths(step.players) } : step
    ));
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
      '_inspectionEvents',
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
    setAnimExiting(false);
    if (animQueueRef.current.length > 0) {
      const next = animQueueRef.current.shift();
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
        commitDeathPresentation(displayStep);
      }
    } else {
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
      if (callback) {
        const pendingBeforeCallback = pendingGsRef.current;
        const callbackBeforeCallback = animCallbackRef.current;
        callback();
        const callbackStartedNextQueue =
          pendingGsRef.current !== pendingBeforeCallback ||
          animCallbackRef.current !== callbackBeforeCallback ||
          animQueueRef.current.length > 0;
        if (callbackStartedNextQueue) {
          return;
        }
      } else if (normalizedNext) {
        setVisualDiscard(getVisualDiscardForState(normalizedNext));
        syncDisplayStatsFromState(normalizedNext);
        if (suppressNextBroadcastRef.current) {
          suppressNextBroadcastRef.current = false;
          receivedGsRef.current = true;
        }
        setGs(prev => {
          if (prev?.gameOver || prev?.phase === 'PLAYER_WIN_PENDING' || prev?.phase === 'TREASURE_WIN') return prev;
          const preservePendingDeathPid = normalizedNext?.phase === 'HUNT_SELECT_CARD_FROM_PUBLIC'
            ? (normalizedNext?.abilityData?.huntTi ?? null)
            : null;
          if (normalizedNext?.players) {
            return { ...normalizedNext, players: clearPendingAnimDeathFlags(normalizedNext.players, preservePendingDeathPid) };
          }
          return normalizedNext;
        });
      }
      pendingGsRef.current = null;
      animCallbackRef.current = null;
      visualStateLocks.clear({turnHighlight:true,players:true,zhuLight:true,hiddenZhuCardId:true});
      if (setVisualPlayersOverride) setVisualPlayersOverride(null);
      setAnim(null);
      sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.QUEUE_COMPLETED);
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
      if (
        active.id !== playbackId ||
        active.firedCueIds.has(cue.id) ||
        !canFireAnimationCue(queueLifecycleRef.current, cue.kind)
      ) return;
      active.firedCueIds.add(cue.id);
      if (cue.kind === 'visual') applyVisualPatch(cue.patch);
      else if (cue.kind === 'impact' && setDisplayStats) {
        setDisplayStats(prev => applyStatAnimationImpact(prev, anim));
      } else if (cue.kind === 'exit') {
        sendQueueLifecycleEvent(ANIMATION_QUEUE_EVENT.STEP_EXITED);
        setAnimExiting(true);
      } else if (cue.kind === 'advance') {
        advanceQueue();
      }
    };
    const cues = getPendingAnimationCues(
      buildAnimationPlaybackCues(anim, ANIM_STEP_GAP),
      playback.elapsedMs,
      playback.firedCueIds,
    );
    cues.forEach(cue => {
      timers.push(setTimeout(() => fireCue(cue), cue.delayMs));
    });
    return () => {
      timers.forEach(clearTimeout);
      const active = playbackRef.current;
      if (active.id === playbackId && Number.isFinite(active.runningSinceMs)) {
        active.elapsedMs = advanceAnimationElapsed(active.elapsedMs, active.runningSinceMs, Date.now());
        active.runningSinceMs = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim, paused]);

  function triggerAnimQueue(queue, nextGs, callback, transactionMeta = null) {
    if (Array.isArray(queue) && queue.some(s => s?.type === 'EARTHQUAKE')) {
      try { console.log('[EQ-DEBUG] triggerAnimQueue received queue =', queue.map(s => s.type), '| hasCallback =', !!callback, '| nextGs.phase =', nextGs?.phase); } catch { /* noop */ }
    }
    // Bespoke target-action queues do not all originate from buildAnimQueue.
    // Normalize at the common playback boundary so the black-night roll is
    // always shown before the selected action's own visual effects.
    const transactionState = nextGs ? ensureVisualEventState(nextGs) : null;
    const ruleTransaction = transactionState
      ? compileRuleVisualEventsToAnimTransaction(transactionState, null, {
        consumedEventIds: consumedVisualEventIdsRef?.current,
        buildAnimQueue,
        ...(Array.isArray(transactionMeta?.eventIds) ? { eventIds: transactionMeta.eventIds } : {}),
        ...(transactionMeta?.visualEventScope ? { visualEventScope: transactionMeta.visualEventScope } : {}),
      })
      : null;
    const transactionQueue = mergeAnimationTransactionQueue(queue, ruleTransaction);
    const apophisOrderedQueue = nextGs
      ? mergeApophisTargetQueue(transactionQueue, gs, nextGs)
      : transactionQueue;
    const schemaPreparation = prepareAnimationQueueSteps(dedupeInferredDiscardTransfers(apophisOrderedQueue));
    reportSchemaIssues('input normalization failed', schemaPreparation.issues);
    const normalizedQueue = attachApophisNightTimeline(
      addDrawBackgroundCameraPrelude(schemaPreparation.steps),
      gs?.apophisNight,
      nextGs?.apophisNight,
    );
    const hasDeathAnim = normalizedQueue.some(a => a.type === 'DEATH' || a.type === 'GUILLOTINE');
    const pendingDeathPlayers = nextGs?.players?.filter(p => p._pendingAnimDeath)?.map((_, i) => i) || [];
    if (
      nextGs?.phase === 'AI_TURN' &&
      Array.isArray(normalizedQueue) &&
      normalizedQueue.some(step => step?.type === 'YOUR_TURN' || step?.type === 'DRAW_CARD')
    ) {
      logAiTurnQueueDebug('triggerAnimQueue:start', {
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
        if (hasDeathAnim && pendingDeathPlayers.length) {
          setGs({ ...normalizedNextGs });
        } else {
          setGs(normalizedNextGs);
        }
      }
      return;
    }

    const wrappedCallback = hasDeathAnim && pendingDeathPlayers.length ? () => {
      const preservePendingDeathPid = nextGs?.phase === 'HUNT_SELECT_CARD_FROM_PUBLIC'
        ? (nextGs?.abilityData?.huntTi ?? null)
        : null;
      const cleanedPlayers = clearPendingAnimDeathFlags(nextGs.players, preservePendingDeathPid);
      const finalGs = normalizePendingState({ ...nextGs, players: cleanedPlayers });
      if (callback) {
        callback();
      } else {
        if (finalGs.log) syncVisibleLog(finalGs.log);
        syncDisplayStatsFromState(finalGs);
        setGs(finalGs);
      }
    } : callback;

    visibleLogAuthorityRef.current = Array.isArray(nextGs?.log) ? nextGs.log : (Array.isArray(visibleLogAuthorityRef.current) ? visibleLogAuthorityRef.current : []);
    const timedQueue = normalizedQueue.map(step => resolveAnimationStepTiming(step, {
      durationByType: ANIM_DURATION,
      speedScale: ANIM_SPEED_SCALE,
      cardRevealDuration: CARD_REVEAL_DURATION,
    }));
    reportSchemaIssues('timed queue validation failed', validateAnimationQueueSteps(timedQueue));
    const preparedQueue = prepareAnimQueueLogs(timedQueue, nextGs, visibleLogRef.current)
      .map(step => ({ ...step, _playbackId: ++playbackIdRef.current }));
    pendingVisualEventIdsRef.current = [...new Set([
      ...getAnimationQueueVisualEventIds(preparedQueue),
      ...(Array.isArray(ruleTransaction?.eventIds) ? ruleTransaction.eventIds : []),
      ...(Array.isArray(transactionMeta?.eventIds) ? transactionMeta.eventIds : []),
    ].filter(Boolean))];
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
    commitDeathPresentation(firstStep);
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
    triggerAnimQueue,
    advanceQueue,
  };
}
