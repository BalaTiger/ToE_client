import { useEffect, useRef, useState } from 'react';
import { dedupeInferredDiscardTransfers } from '../game/animQueueHelpers';
import { getVisualEventIdsFromState, markConsumedVisualEvents } from '../game/visualEvents';

export function useAnimationQueue({
  gs,
  copyPlayers,
  setGs,
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
}) {
  const [anim, setAnim] = useState(null);
  const [animExiting, setAnimExiting] = useState(false);
  const animQueueRef = useRef([]);
  const pendingGsRef = useRef(null);
  const animCallbackRef = useRef(null);
  const visualTimelineTimersRef = useRef([]);

  function revealAnimLogs(animStep) {
    if (!animStep) return;
    if (Array.isArray(animStep._logChunk) && animStep._logChunk.length) {
      appendVisibleLog(animStep._logChunk);
    }
  }

  function clearVisualTimelineTimers() {
    visualTimelineTimersRef.current.forEach(clearTimeout);
    visualTimelineTimersRef.current = [];
  }

  function applyVisualPatch(patch = {}) {
    if (Object.prototype.hasOwnProperty.call(patch, 'players')) {
      const players = patch.players ? copyPlayers(patch.players) : null;
      visualStateLocks.lock({ players });
      if (setVisualPlayersOverride) setVisualPlayersOverride(players);
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

  function scheduleVisualTimeline(animStep) {
    clearVisualTimelineTimers();
    const timeline = Array.isArray(animStep?.visualTimeline) ? animStep.visualTimeline : [];
    timeline.forEach(item => {
      const at = Math.max(0, item?.atMs || 0);
      const patch = item?.patch || {};
      if (at <= 0) {
        applyVisualPatch(patch);
        return;
      }
      visualTimelineTimersRef.current.push(setTimeout(() => applyVisualPatch(patch), at));
    });
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
        setAnim(null);
        const currentGs = pendingGsRef.current || gs;
        pendingGsRef.current = null;
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
        setAnim(displayStep);
        revealAnimLogs(displayStep);
      }
    } else {
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
      const nextVisualEventIds = getVisualEventIdsFromState(next);
      if (nextVisualEventIds.length && consumedVisualEventIdsRef?.current) {
        markConsumedVisualEvents(consumedVisualEventIdsRef.current, nextVisualEventIds.map(id => ({ id, type: 'consumed' })));
      }
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
      clearVisualTimelineTimers();
      visualStateLocks.clear({turnHighlight:true,players:true,zhuLight:true,hiddenZhuCardId:true});
      if (setVisualPlayersOverride) setVisualPlayersOverride(null);
      setAnim(null);
    }
  }

  useEffect(() => {
    if (!anim) return;
    if (anim.type === 'EARTHQUAKE') {
      try { console.log('[EQ-DEBUG] anim EARTHQUAKE became active: discardEvents =', anim.discardEvents?.length, ', visualTimeline =', anim.visualTimeline?.length, ', durationMs =', anim.durationMs); } catch { /* noop */ }
    }
    scheduleVisualTimeline(anim);
    const isCard = anim.type === 'DRAW_CARD';
    const dur = Number.isFinite(anim.durationMs)
      ? anim.durationMs
      : isCard
        ? CARD_REVEAL_DURATION
        : Math.round((ANIM_DURATION[anim.type] || ANIM_DURATION.default) * ANIM_SPEED_SCALE);
    let gapTimer = null;
    const t1 = setTimeout(() => {
      if (isCard) {
        gapTimer = setTimeout(advanceQueue, ANIM_STEP_GAP);
      } else {
        setAnimExiting(true);
        gapTimer = setTimeout(advanceQueue, ANIM_STEP_GAP);
      }
    }, dur);
    return () => {
      clearTimeout(t1);
      if (gapTimer) clearTimeout(gapTimer);
      clearVisualTimelineTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim]);

  function triggerAnimQueue(queue, nextGs, callback) {
    if (Array.isArray(queue) && queue.some(s => s?.type === 'EARTHQUAKE')) {
      try { console.log('[EQ-DEBUG] triggerAnimQueue received queue =', queue.map(s => s.type), '| hasCallback =', !!callback, '| nextGs.phase =', nextGs?.phase); } catch { /* noop */ }
    }
    const normalizedQueue = dedupeInferredDiscardTransfers(queue);
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
        setGs(finalGs);
      }
    } : callback;

    visibleLogAuthorityRef.current = Array.isArray(nextGs?.log) ? nextGs.log : (Array.isArray(visibleLogAuthorityRef.current) ? visibleLogAuthorityRef.current : []);
    const preparedQueue = prepareAnimQueueLogs(normalizedQueue, nextGs, visibleLogRef.current);
    const setupStep = preparedQueue.find(step => step?.visualSetupPatch && step.visualSetupTiming === 'queueStart');
    if (setupStep) {
      applyVisualPatch(setupStep.visualSetupPatch);
    }
    visualStateLocks.lock({turnHighlight:gs?.currentTurn ?? null});
    const playableQueue = [...preparedQueue];
    while (playableQueue[0]?.type === 'VISUAL_LOCK') {
      const visualLock = playableQueue.shift();
      visualStateLocks.lock({
        players: visualLock.players,
        zhuLight: visualLock.zhuLight,
        hiddenZhuCardId: visualLock.hiddenZhuCardId,
        turnHighlight: visualLock.turnHighlight,
      });
    }
    if (!playableQueue.length) {
      pendingGsRef.current = nextGs;
      animQueueRef.current = [];
      animCallbackRef.current = wrappedCallback;
      advanceQueue();
      return;
    }
    const firstTurnHighlight = resolveTurnHighlightForStep(playableQueue[0], nextGs, gs?.players || []);
    if (firstTurnHighlight != null) visualStateLocks.lock({turnHighlight:firstTurnHighlight});
    if (playableQueue[0].visualSetupPatch) applyVisualPatch(playableQueue[0].visualSetupPatch);
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
    triggerAnimQueue,
    advanceQueue,
  };
}
