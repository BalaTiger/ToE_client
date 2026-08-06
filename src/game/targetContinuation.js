import { isAiSeat } from './rotateState';
import { withClearedTurnAnimFields } from './turnAnimState';

export const TARGET_CONTINUATION_ROUTE = Object.freeze({
  REST_DRAW: 'REST_DRAW',
  TURN_START_DRAW: 'TURN_START_DRAW',
  END_TURN_REPLAY: 'END_TURN_REPLAY',
  PROLIFERATING_Z: 'PROLIFERATING_Z',
  DECISION: 'DECISION',
  APPLY_STATE: 'APPLY_STATE',
});

const TARGET_CONTINUATION_ACTION_PHASES = new Set(['ACTION', 'AI_TURN']);
const TARGET_CONTINUATION_DECISION_PHASES = new Set([
  'TSG_SLIME_BALANCE',
  'ETHEREALIZE_DECISION',
  'ETHEREALIZE_SELECT_TARGET',
]);

export function getTargetContinuationRoute(state, {
  continueRest = false,
  continueTurnStartDraw = false,
} = {}) {
  if (continueRest) return TARGET_CONTINUATION_ROUTE.REST_DRAW;
  if (state?.phase === 'NYA_BORROW') return TARGET_CONTINUATION_ROUTE.DECISION;
  if (continueTurnStartDraw || state?.abilityData?.continueTurnStartDraw) {
    return TARGET_CONTINUATION_ROUTE.TURN_START_DRAW;
  }

  const phase = state?.phase;
  if (TARGET_CONTINUATION_ACTION_PHASES.has(phase) && state?.abilityData?.fromEndTurnReplay) {
    return TARGET_CONTINUATION_ROUTE.END_TURN_REPLAY;
  }
  if (TARGET_CONTINUATION_ACTION_PHASES.has(phase) && state?.proliferatingZQueue?.length) {
    return TARGET_CONTINUATION_ROUTE.PROLIFERATING_Z;
  }
  if (TARGET_CONTINUATION_DECISION_PHASES.has(phase)) {
    return TARGET_CONTINUATION_ROUTE.DECISION;
  }
  return TARGET_CONTINUATION_ROUTE.APPLY_STATE;
}

export function buildTargetContinuationAbilityData(abilityData = {}) {
  return {
    ...(abilityData?._turnOwner != null ? { _turnOwner: abilityData._turnOwner } : {}),
    ...(abilityData?.fromRest ? { fromRest: true } : {}),
    ...(abilityData?.fromEndTurnReplay ? { fromEndTurnReplay: true } : {}),
    ...(abilityData?.fromTsathogguaSlime ? { fromTsathogguaSlime: true } : {}),
    ...(abilityData?.continueTurnStartDraw ? { continueTurnStartDraw: true } : {}),
    ...(abilityData?._tsgExtraDrawReady ? { _tsgExtraDrawReady: true } : {}),
    ...(abilityData?.pendingTsathogguaSlime ? { pendingTsathogguaSlime: abilityData.pendingTsathogguaSlime } : {}),
    ...(abilityData?.pendingTsathogguaSlimes ? { pendingTsathogguaSlimes: abilityData.pendingTsathogguaSlimes } : {}),
    ...(abilityData?.cthDrawsRemaining != null ? { cthDrawsRemaining: abilityData.cthDrawsRemaining } : {}),
    ...(abilityData?.pendingSanInspection ? { pendingSanInspection: abilityData.pendingSanInspection } : {}),
    ...(abilityData?.pendingInspectionContinuation ? { pendingInspectionContinuation: abilityData.pendingInspectionContinuation } : {}),
    ...(abilityData?.pendingGodChoice ? { pendingGodChoice: abilityData.pendingGodChoice } : {}),
    ...(abilityData?._pendingTurnStartPoison ? { _pendingTurnStartPoison: true } : {}),
    ...(abilityData?._pendingTurnStartLinkHeals ? { _pendingTurnStartLinkHeals: abilityData._pendingTurnStartLinkHeals } : {}),
    ...(abilityData?._pendingTurnStartEventIds ? { _pendingTurnStartEventIds: abilityData._pendingTurnStartEventIds } : {}),
    ...(abilityData?.pendingSlimeBalanceDecisions?.length ? { pendingSlimeBalanceDecisions: abilityData.pendingSlimeBalanceDecisions } : {}),
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
