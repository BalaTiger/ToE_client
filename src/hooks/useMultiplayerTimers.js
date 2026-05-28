import { useEffect, useRef, useState } from 'react';
import { cardLogText } from '../game/coreUtils';

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
    if (!isMultiplayer || !gs || gs.gameOver || gs.phase !== 'DISCARD_PHASE' || !isLocalCurrentTurn(gs)) return;
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
  }, [isMultiplayer, gs?.phase, gs?.currentTurn, gs?._turnKey, gs?.gameOver, playTickSound]);

  return mpDiscardSec;
}

export function useMpTurnTimer({
  isMultiplayer,
  gs,
  isLocalCurrentTurn,
  isMpCthDecisionPhase,
  isMpDecisionPhase = false,
  playTickSound,
  setGs,
}) {
  const [mpTurnSec, setMpTurnSec] = useState(null);
  const mpTurnIntervalRef = useRef(null);
  const mpTurnTimeoutRef = useRef(null);
  const mpTurnStartRef = useRef(null);
  const mpTurnPausedElapsedRef = useRef(null);

  useEffect(() => {
    if (!isMultiplayer || !gs || gs.gameOver || !isLocalCurrentTurn(gs)) return;
    mpTurnPausedElapsedRef.current = null;
    mpTurnStartRef.current = Date.now();
    const intervalId = startSecondCountdown({
      seconds: 45,
      warningAt: 10,
      setSeconds: setMpTurnSec,
      intervalRef: mpTurnIntervalRef,
      playTickSound,
    });
    mpTurnTimeoutRef.current = setTimeout(() => setGs(p => p ? { ...p, _mpEndTurn: true } : p), 45000);
    return () => {
      clearTimeout(mpTurnTimeoutRef.current);
      mpTurnTimeoutRef.current = null;
      clearInterval(intervalId);
      setMpTurnSec(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, gs?.currentTurn, gs?._turnKey, gs?.gameOver, playTickSound]);

  useEffect(() => {
    if (!isMultiplayer || gs?.phase !== 'DISCARD_PHASE') return;
    clearTimeout(mpTurnTimeoutRef.current);
    mpTurnTimeoutRef.current = null;
    clearInterval(mpTurnIntervalRef.current);
    setMpTurnSec(null);
  }, [isMultiplayer, gs?.phase]);

  useEffect(() => {
    if (!isMpCthDecisionPhase && !isMpDecisionPhase) return;
    clearTimeout(mpTurnTimeoutRef.current);
    mpTurnTimeoutRef.current = null;
    clearInterval(mpTurnIntervalRef.current);
    setMpTurnSec(null);
  }, [isMpCthDecisionPhase, isMpDecisionPhase]);

  useEffect(() => {
    if (!isMultiplayer || (gs?.phase !== 'HUNT_WAIT_REVEAL' && !isMpDecisionPhase)) return;
    const elapsed = mpTurnStartRef.current ? Date.now() - mpTurnStartRef.current : 0;
    mpTurnPausedElapsedRef.current = elapsed;
    clearTimeout(mpTurnTimeoutRef.current);
    mpTurnTimeoutRef.current = null;
    clearInterval(mpTurnIntervalRef.current);
  }, [isMultiplayer, gs?.phase, isMpDecisionPhase]);

  useEffect(() => {
    if (!isMultiplayer || !gs || gs.gameOver) return;
    if (gs.phase === 'HUNT_WAIT_REVEAL') return;
    if (isMpDecisionPhase) return;
    if (mpTurnPausedElapsedRef.current === null) return;
    if (!isLocalCurrentTurn(gs)) return;
    const elapsedBefore = mpTurnPausedElapsedRef.current;
    mpTurnPausedElapsedRef.current = null;
    const remMs = Math.max(0, 45000 - elapsedBefore);
    const remSec = Math.round(remMs / 1000);
    if (remSec <= 0) {
      setGs(p => p ? { ...p, _mpEndTurn: true } : p);
      return;
    }
    mpTurnStartRef.current = Date.now() - elapsedBefore;
    startSecondCountdown({
      seconds: remSec,
      warningAt: 10,
      setSeconds: setMpTurnSec,
      intervalRef: mpTurnIntervalRef,
      playTickSound,
    });
    mpTurnTimeoutRef.current = setTimeout(() => setGs(p => p ? { ...p, _mpEndTurn: true } : p), remMs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, gs?.phase, gs?.currentTurn, gs?.gameOver, isMpDecisionPhase, playTickSound]);

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
        setGs({ ...gs, log: L, phase: 'HUNT_CONFIRM', abilityData: { ...gs.abilityData, revCard: rc } });
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
