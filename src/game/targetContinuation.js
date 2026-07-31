import { isAiSeat } from './rotateState';
import { withClearedTurnAnimFields } from './turnAnimState';

export function buildTargetContinuationAbilityData(abilityData = {}) {
  return {
    ...(abilityData?._turnOwner != null ? { _turnOwner: abilityData._turnOwner } : {}),
    ...(abilityData?.fromRest ? { fromRest: true } : {}),
    ...(abilityData?.fromEndTurnReplay ? { fromEndTurnReplay: true } : {}),
    ...(abilityData?.fromTsathogguaSlime ? { fromTsathogguaSlime: true } : {}),
    ...(abilityData?.continueTurnStartDraw ? { continueTurnStartDraw: true } : {}),
    ...(abilityData?.pendingTsathogguaSlime ? { pendingTsathogguaSlime: abilityData.pendingTsathogguaSlime } : {}),
    ...(abilityData?.pendingTsathogguaSlimes ? { pendingTsathogguaSlimes: abilityData.pendingTsathogguaSlimes } : {}),
    ...(abilityData?.cthDrawsRemaining != null ? { cthDrawsRemaining: abilityData.cthDrawsRemaining } : {}),
    ...(abilityData?.pendingSanInspection ? { pendingSanInspection: abilityData.pendingSanInspection } : {}),
    ...(abilityData?.pendingInspectionContinuation ? { pendingInspectionContinuation: abilityData.pendingInspectionContinuation } : {}),
    ...(abilityData?.pendingGodChoice ? { pendingGodChoice: abilityData.pendingGodChoice } : {}),
  };
}

export function buildTargetContinuationState({
  baseState,
  players = baseState?.players,
  deck = baseState?.deck,
  discard = baseState?.discard,
  log = baseState?.log,
  turnOwner = baseState?.currentTurn,
  abilityData = baseState?.abilityData,
  phase = null,
  clearTurnAnim = true,
  canResumeAi = true,
  extraPatch = {},
} = {}) {
  if (!baseState) return baseState;

  const nextPhase = phase || (
    abilityData?.pendingGodChoice?.godCard
      ? 'GOD_CHOICE'
      : canResumeAi
        && isAiSeat(baseState, turnOwner)
        && !players?.[turnOwner]?.isDead
        && !abilityData?.fromRest
        ? 'AI_TURN'
        : 'ACTION'
  );
  const nextAbilityData = abilityData?.pendingGodChoice?.godCard
    ? {
        ...abilityData.pendingGodChoice,
        ...buildTargetContinuationAbilityData(abilityData.pendingGodChoice),
      }
    : buildTargetContinuationAbilityData(abilityData);
  const nextState = {
    ...baseState,
    players,
    deck,
    discard,
    log,
    currentTurn: turnOwner,
    phase: nextPhase,
    abilityData: nextAbilityData,
    ...extraPatch,
  };

  return clearTurnAnim ? withClearedTurnAnimFields(nextState) : nextState;
}
