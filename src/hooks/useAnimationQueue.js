import { useEffect, useRef, useState } from 'react';

export function useAnimationQueue({
  gs,
  copyPlayers,
  setGs,
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
  turnHighlightLockRef,
  visualPlayersLockRef,
  suppressNextBroadcastRef,
  receivedGsRef,
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

  function revealAnimLogs(animStep) {
    if (!animStep) return;
    if (Array.isArray(animStep._logChunk) && animStep._logChunk.length) {
      appendVisibleLog(animStep._logChunk);
    }
  }

  function advanceQueue() {
    setAnimExiting(false);
    if (animQueueRef.current.length > 0) {
      const next = animQueueRef.current.shift();
      if (next.type === 'STATE_PATCH') {
        revealAnimLogs(next);
        visualPlayersLockRef.current = null;
        setVisualDiscard([...(next.discard || [])]);
        setGs(prev => prev ? { ...prev, players: copyPlayers(next.players || prev.players), discard: [...(next.discard || prev.discard)] } : prev);
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
        if (nextTurnHighlight != null) turnHighlightLockRef.current = nextTurnHighlight;
        setAnim(next);
        revealAnimLogs(next);
      }
    } else {
      const next = pendingGsRef.current;
      const callback = animCallbackRef.current;
      pendingGsRef.current = null;
      animCallbackRef.current = null;
      turnHighlightLockRef.current = null;
      visualPlayersLockRef.current = null;
      setAnim(null);
      if (next?.log) syncVisibleLog(next.log);
      if (callback) {
        callback();
      } else if (next) {
        setVisualDiscard(getVisualDiscardForState(next));
        if (suppressNextBroadcastRef.current) {
          suppressNextBroadcastRef.current = false;
          receivedGsRef.current = true;
        }
        setGs(prev => {
          if (prev?.gameOver || prev?.phase === 'PLAYER_WIN_PENDING' || prev?.phase === 'TREASURE_WIN') return prev;
          const preservePendingDeathPid = next?.phase === 'HUNT_SELECT_CARD_FROM_PUBLIC'
            ? (next?.abilityData?.huntTi ?? null)
            : null;
          if (next?.players) {
            return { ...next, players: clearPendingAnimDeathFlags(next.players, preservePendingDeathPid) };
          }
          return next;
        });
      }
    }
  }

  useEffect(() => {
    if (!anim) return;
    const isCard = anim.type === 'DRAW_CARD';
    const dur = isCard ? CARD_REVEAL_DURATION : Math.round((ANIM_DURATION[anim.type] || ANIM_DURATION.default) * ANIM_SPEED_SCALE);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim]);

  function triggerAnimQueue(queue, nextGs, callback) {
    const hasDeathAnim = queue.some(a => a.type === 'DEATH' || a.type === 'GUILLOTINE');
    const pendingDeathPlayers = nextGs?.players?.filter(p => p._pendingAnimDeath)?.map((_, i) => i) || [];

    if (!queue.length) {
      if (callback) {
        if (nextGs?.log) syncVisibleLog(nextGs.log);
        callback();
      } else {
        if (nextGs?.log) syncVisibleLog(nextGs.log);
        if (hasDeathAnim && pendingDeathPlayers.length) {
          setGs({ ...nextGs });
        } else {
          setGs(nextGs);
        }
      }
      return;
    }

    const wrappedCallback = hasDeathAnim && pendingDeathPlayers.length ? () => {
      const preservePendingDeathPid = nextGs?.phase === 'HUNT_SELECT_CARD_FROM_PUBLIC'
        ? (nextGs?.abilityData?.huntTi ?? null)
        : null;
      const cleanedPlayers = clearPendingAnimDeathFlags(nextGs.players, preservePendingDeathPid);
      const finalGs = { ...nextGs, players: cleanedPlayers };
      if (callback) {
        callback();
      } else {
        if (finalGs.log) syncVisibleLog(finalGs.log);
        setGs(finalGs);
      }
    } : callback;

    visibleLogAuthorityRef.current = Array.isArray(nextGs?.log) ? nextGs.log : (Array.isArray(visibleLogAuthorityRef.current) ? visibleLogAuthorityRef.current : []);
    const preparedQueue = prepareAnimQueueLogs(queue, nextGs, visibleLogRef.current);
    turnHighlightLockRef.current = gs?.currentTurn ?? null;
    const firstTurnHighlight = resolveTurnHighlightForStep(preparedQueue[0], nextGs, gs?.players || []);
    if (firstTurnHighlight != null) turnHighlightLockRef.current = firstTurnHighlight;
    pendingGsRef.current = nextGs;
    animQueueRef.current = [...preparedQueue.slice(1)];
    animCallbackRef.current = wrappedCallback;
    setAnim(preparedQueue[0]);
    revealAnimLogs(preparedQueue[0]);
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
