import { useEffect, useRef } from 'react';
import {
  buildAiTurnRecoveryState,
  stripAiExecutionFields,
} from '../game/aiTurnPresentation';

export const AI_TURN_DELAY_MS = 2100;
export const AI_TURN_WATCHDOG_MS = 20_000;

export function shouldScheduleAiTurn({
  gs,
  hasActiveAnimation,
  showTutorial,
  softGuidePauseActive,
  isMultiplayer,
}) {
  return !!(
    gs &&
    gs.phase === 'AI_TURN' &&
    !gs.gameOver &&
    !hasActiveAnimation &&
    !showTutorial &&
    !softGuidePauseActive &&
    !isMultiplayer
  );
}

export function scheduleAiTurn({
  snapshot,
  onExecute,
  onTimeout,
  delayMs = AI_TURN_DELAY_MS,
  watchdogMs = AI_TURN_WATCHDOG_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const executionTimer = setTimer(() => onExecute(snapshot), delayMs);
  const watchdogTimer = setTimer(() => onTimeout(snapshot), watchdogMs);
  return () => {
    clearTimer(executionTimer);
    clearTimer(watchdogTimer);
  };
}

export function executeAiTurnStep({
  snapshot,
  runAiStep,
  isDebugMode,
  startNextTurn,
}) {
  try {
    const rawResult = runAiStep(snapshot, { isDebugMode });
    const newGs = stripAiExecutionFields(rawResult);
    return { ok: true, rawResult, newGs };
  } catch (error) {
    const recoveryGs = buildAiTurnRecoveryState({
      snapshot,
      error,
      stage: 'execution',
      startNextTurn,
    });
    return { ok: false, error, recoveryGs };
  }
}

export function useAiTurnController({
  gs,
  hasActiveAnimation,
  showTutorial,
  softGuidePauseActive,
  isMultiplayer,
  onExecute,
  onTimeout,
}) {
  const executeRef = useRef(onExecute);
  const timeoutRef = useRef(onTimeout);
  useEffect(() => {
    executeRef.current = onExecute;
  }, [onExecute]);
  useEffect(() => {
    timeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!shouldScheduleAiTurn({
      gs,
      hasActiveAnimation,
      showTutorial,
      softGuidePauseActive,
      isMultiplayer,
    })) {
      return undefined;
    }

    return scheduleAiTurn({
      snapshot: gs,
      onExecute: snapshot => executeRef.current(snapshot),
      onTimeout: snapshot => timeoutRef.current(snapshot),
    });
  // Keep the scheduled snapshot stable for the whole logical AI turn. Depending
  // on the complete state object would restart the 2.1s delay for unrelated
  // updates such as the hounds timer and could starve AI execution indefinitely.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gs?.currentTurn,
    gs?.phase,
    gs?._turnKey,
    gs?.gameOver,
    hasActiveAnimation,
    showTutorial,
    softGuidePauseActive,
    isMultiplayer,
  ]);
}
