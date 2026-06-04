import { useEffect, useRef, useState } from 'react';
import { cardLogText } from '../game/coreUtils';
import { createHuntRevealEvent } from '../game/visualEvents';

function startSecondCountdown({ seconds, warningAt, setSeconds, intervalRef, playTickSound }) {
  setSeconds(seconds);
  const intervalId = setInterval(() => {
    setSeconds(s => {
      const next = s === null || s <= 1 ? 0 : s - 1;
      if (next === 0) clearInterval(intervalId);
      if (next > 0 && next <= warningAt) playTickSound();
      return next;
    });
  }, 1000);
  intervalRef.current = intervalId;
  return intervalId;
}

export function getMpTurnTimerOwnerKey(gs) {
  if (!gs) return '';
  return `${gs._turnKey ?? 'turn'}:${gs.currentTurn ?? 'none'}`;
}

export function getMpTurnTimerMode({
  isMultiplayer,
  gs,
  isLocalCurrentTurn,
  isMpCthDecisionPhase,
  isMpDecisionPhase = false,
  isTurnTimerSuspended = false,
}) {
  if (!isMultiplayer || !gs || gs.gameOver || !isLocalCurrentTurn(gs)) return 'stopped';
  if (gs.phase === 'DISCARD_PHASE' || isMpCthDecisionPhase) return 'stopped';
  if (isTurnTimerSuspended || gs.phase === 'HUNT_WAIT_REVEAL' || isMpDecisionPhase) return 'paused';
  return gs.phase === 'ACTION' ? 'running' : 'stopped';
}

export function shouldRunMpDiscardTimer({
  isMultiplayer,
  gs,
  isLocalCurrentTurn,
}) {
  return !!(
    isMultiplayer &&
    gs &&
    !gs.gameOver &&
    gs.phase === 'DISCARD_PHASE' &&
    isLocalCurrentTurn(gs) &&
    !gs._mpEndTurnDiscardResolved
  );
}

export function useMpCthDecisionTimer({
  isMpCthDecisionPhase,
  gs,
  playTickSound,
  setGs,
}) {
  const [mpCthSec, setMpCthSec] = useState(null);
  const mpCthIntervalRef = useRef(null);
  const mpCthDecisionTimerRef = useRef(null);

  useEffect(() => {
    if (!isMpCthDecisionPhase || !gs || gs.gameOver) return;
    setMpCthSec(15);
    mpCthIntervalRef.current = setInterval(() => {
      setMpCthSec(s => {
        const next = s === null || s <= 1 ? 0 : s - 1;
        if (next === 0) clearInterval(mpCthIntervalRef.current);
        if (next > 0 && next <= 5) playTickSound();
        return next;
      });
    }, 1000);
    mpCthDecisionTimerRef.current = setTimeout(() => setGs(p => p ? { ...p, _mpAutoCthDecision: true } : p), 15000);
    return () => {
      clearTimeout(mpCthDecisionTimerRef.current);
      mpCthDecisionTimerRef.current = null;
      clearInterval(mpCthIntervalRef.current);
      setMpCthSec(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMpCthDecisionPhase, gs?.phase, gs?.drawReveal?.card?.id, gs?.abilityData?.godCard?.id, gs?.gameOver, playTickSound]);

  return mpCthSec;
}

export function useMpDiscardTimer({
  isMultiplayer,
  gs,
  isLocalCurrentTurn,
  playTickSound,
  setGs,
}) {
  const [mpDiscardSec, setMpDiscardSec] = useState(null);
  const mpDiscardIntervalRef = useRef(null);

  useEffect(() => {
    if (!shouldRunMpDiscardTimer({ isMultiplayer, gs, isLocalCurrentTurn })) return;
    setMpDiscardSec(15);
    mpDiscardIntervalRef.current = setInterval(() => {
      setMpDiscardSec(s => {
        const next = s === null || s <= 1 ? 0 : s - 1;
        if (next === 0) clearInterval(mpDiscardIntervalRef.current);
        if (next > 0 && next <= 10) playTickSound();
        return next;
      });
    }, 1000);
    const timeoutId = setTimeout(() => setGs(p => p ? { ...p, _mpAutoDiscard: true } : p), 15000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(mpDiscardIntervalRef.current);
      setMpDiscardSec(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, gs?.phase, gs?.currentTurn, gs?._turnKey, gs?._mpEndTurnDiscardResolved, gs?.gameOver, playTickSound]);

  return mpDiscardSec;
}

export function useMpTurnTimer({
  isMultiplayer,
  gs,
  isLocalCurrentTurn,
  isMpCthDecisionPhase,
  isMpDecisionPhase = false,
  isTurnTimerSuspended = false,
  playTickSound,
  setGs,
}) {
  const [mpTurnSec, setMpTurnSec] = useState(null);
  const mpTurnIntervalRef = useRef(null);
  const mpTurnTimeoutRef = useRef(null);
  const mpTurnStartRef = useRef(null);
  const mpTurnPausedElapsedRef = useRef(null);
  const mpTurnOwnerRef = useRef(null);

  useEffect(() => {
    const clearTurnTimer = () => {
      clearTimeout(mpTurnTimeoutRef.current);
      mpTurnTimeoutRef.current = null;
      clearInterval(mpTurnIntervalRef.current);
      mpTurnIntervalRef.current = null;
      setMpTurnSec(null);
    };
    const mode = getMpTurnTimerMode({
      isMultiplayer,
      gs,
      isLocalCurrentTurn,
      isMpCthDecisionPhase,
      isMpDecisionPhase,
      isTurnTimerSuspended,
    });
    const ownerKey = getMpTurnTimerOwnerKey(gs);
    if (mode === 'stopped') {
      clearTurnTimer();
      mpTurnStartRef.current = null;
      mpTurnPausedElapsedRef.current = null;
      mpTurnOwnerRef.current = null;
      return clearTurnTimer;
    }
    if (mode === 'paused') {
      if (mpTurnStartRef.current && mpTurnOwnerRef.current === ownerKey) {
        mpTurnPausedElapsedRef.current = Date.now() - mpTurnStartRef.current;
      }
      clearTurnTimer();
      return clearTurnTimer;
    }

    const pausedElapsed = mpTurnOwnerRef.current === ownerKey ? mpTurnPausedElapsedRef.current : null;
    const elapsedBefore = Math.max(0, pausedElapsed || 0);
    const remMs = Math.max(0, 45000 - elapsedBefore);
    mpTurnPausedElapsedRef.current = null;
    mpTurnOwnerRef.current = ownerKey;
    mpTurnStartRef.current = Date.now() - elapsedBefore;
    if (remMs <= 0) {
      setGs(p => p ? { ...p, _mpEndTurn: true } : p);
      return clearTurnTimer;
    }
    const intervalId = startSecondCountdown({
      seconds: Math.max(1, Math.ceil(remMs / 1000)),
      warningAt: 10,
      setSeconds: setMpTurnSec,
      intervalRef: mpTurnIntervalRef,
      playTickSound,
    });
    mpTurnTimeoutRef.current = setTimeout(() => setGs(p => p ? { ...p, _mpEndTurn: true } : p), remMs);
    return () => {
      clearTimeout(mpTurnTimeoutRef.current);
      mpTurnTimeoutRef.current = null;
      clearInterval(intervalId);
      mpTurnIntervalRef.current = null;
      setMpTurnSec(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, gs?.phase, gs?.currentTurn, gs?._turnKey, gs?.gameOver, isMpCthDecisionPhase, isMpDecisionPhase, isTurnTimerSuspended, playTickSound]);

  return mpTurnSec;
}

export function useMpHuntRevealTimer({
  isMultiplayer,
  gs,
  isLocalHuntTarget,
  me,
  playTickSound,
  setGs,
}) {
  const [mpHuntSec, setMpHuntSec] = useState(null);
  const mpHuntIntervalRef = useRef(null);
  const huntRevealTimerRef = useRef(null);

  useEffect(() => {
    if (!isMultiplayer || !gs || gs.gameOver) return;
    if (gs.phase !== 'HUNT_WAIT_REVEAL') return;
    const intervalId = startSecondCountdown({
      seconds: 20,
      warningAt: 10,
      setSeconds: setMpHuntSec,
      intervalRef: mpHuntIntervalRef,
      playTickSound,
    });
    if (isLocalHuntTarget) {
      const timeoutId = setTimeout(() => {
        const hand = me?.hand || [];
        if (!hand.length) return;
        const rc = hand[0 | Math.random() * hand.length];
        const L = [...gs.log, `(超时) ${me?.name || '该玩家'} 随机亮出 ${cardLogText(rc, { alwaysShowName: true })}`];
        const huntRevealEvent = createHuntRevealEvent({
          sourceIdx: gs.currentTurn ?? 0,
          targetIdx: gs.abilityData?.huntTi ?? 0,
          card: rc,
          msgs: L.slice(gs.log.length),
        });
        setGs({
          ...gs,
          log: L,
          phase: 'HUNT_CONFIRM',
          abilityData: { ...gs.abilityData, revCard: rc },
          ...(huntRevealEvent ? { _visualEvents: [huntRevealEvent] } : { _visualEvents: [] }),
        });
      }, 20000);
      huntRevealTimerRef.current = timeoutId;
    }
    return () => {
      clearTimeout(huntRevealTimerRef.current);
      huntRevealTimerRef.current = null;
      clearInterval(intervalId);
      setMpHuntSec(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs?.phase, gs?.currentTurn, gs?.abilityData?.huntTi, isLocalHuntTarget, isMultiplayer]);

  return mpHuntSec;
}

export function useMpDecisionTimer({
  isMultiplayer,
  gs,
  isLocalDecisionActive,
  decisionKey,
  playTickSound,
  onTimeout,
}) {
  const [mpDecisionSec, setMpDecisionSec] = useState(null);
  const mpDecisionIntervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!isMultiplayer || !gs || gs.gameOver || !isLocalDecisionActive) return;
    const intervalId = startSecondCountdown({
      seconds: 20,
      warningAt: 10,
      setSeconds: setMpDecisionSec,
      intervalRef: mpDecisionIntervalRef,
      playTickSound,
    });
    timeoutRef.current = setTimeout(() => {
      onTimeoutRef.current?.();
    }, 20000);
    return () => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      clearInterval(intervalId);
      setMpDecisionSec(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, gs?.phase, gs?.currentTurn, gs?.gameOver, decisionKey, isLocalDecisionActive, playTickSound]);

  return mpDecisionSec;
}
