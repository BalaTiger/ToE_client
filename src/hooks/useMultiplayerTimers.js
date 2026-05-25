import { useEffect, useRef, useState } from 'react';

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
