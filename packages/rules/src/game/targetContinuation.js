import { isAiSeat } from './rotateState.js';
import { withClearedTurnAnimFields } from './turnAnimState.js';
import { bindTurnFlowEvents, resolveTurnFlowAfterEvent, TURN_FLOW_DIRECTIVE } from './turnFlowManager.js';
import { popDecisionContinuation } from './decisionContinuations.js';
import { discardDeadDrawerGod } from './deadGodEncounter.js';
import { checkWin } from './victory.js';

export const TARGET_CONTINUATION_ROUTE = Object.freeze({
  REST_DRAW: 'REST_DRAW',
  TURN_START_DRAW: 'TURN_START_DRAW',
  END_TURN_REPLAY: 'END_TURN_REPLAY',
  ADVANCE_END_TURN: 'ADVANCE_END_TURN',
  PROLIFERATING_Z: 'PROLIFERATING_Z',
  DECISION: 'DECISION',
  APPLY_STATE: 'APPLY_STATE',
  ADVANCE_DEAD_TURN: 'ADVANCE_DEAD_TURN',
});

export function resolveTargetContinuation(state, {
  continueRest = false,
  continueTurnStartDraw = false,
} = {}) {
  if (state && !state.gameOver && ['ACTION', 'AI_TURN'].includes(state.phase)
    && state.players?.[state.currentTurn]?.isDead) {
    return { state, route: TARGET_CONTINUATION_ROUTE.ADVANCE_DEAD_TURN };
  }
  const resolved = resolveTurnFlowAfterEvent(state, { continueRest, continueTurnStartDraw });
  const route = {
    [TURN_FLOW_DIRECTIVE.HOLD_INTERACTION]: TARGET_CONTINUATION_ROUTE.DECISION,
    [TURN_FLOW_DIRECTIVE.RESUME_CTH_REST_DRAW]: TARGET_CONTINUATION_ROUTE.REST_DRAW,
    [TURN_FLOW_DIRECTIVE.RESUME_TURN_START_DRAW]: TARGET_CONTINUATION_ROUTE.TURN_START_DRAW,
    [TURN_FLOW_DIRECTIVE.RESUME_END_TURN_REPLAY]: TARGET_CONTINUATION_ROUTE.END_TURN_REPLAY,
    [TURN_FLOW_DIRECTIVE.RESUME_PROLIFERATING_Z]: TARGET_CONTINUATION_ROUTE.PROLIFERATING_Z,
    [TURN_FLOW_DIRECTIVE.ADVANCE_END_TURN]: TARGET_CONTINUATION_ROUTE.ADVANCE_END_TURN,
    [TURN_FLOW_DIRECTIVE.APPLY_STATE]: TARGET_CONTINUATION_ROUTE.APPLY_STATE,
  }[resolved.directive] || TARGET_CONTINUATION_ROUTE.APPLY_STATE;
  return { ...resolved, route };
}

export function getTargetContinuationRoute(state, options = {}) {
  return resolveTargetContinuation(state, options).route;
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
    ...(abilityData?.pendingZoneIncome ? { pendingZoneIncome: abilityData.pendingZoneIncome } : {}),
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

  let queuedDecision = phase ? { frame: null, remaining: baseState._decisionContinuations || [] }
    : popDecisionContinuation(baseState);
  let cancelledVisualEvents = extraPatch._visualEvents || baseState._visualEvents || [];
  let cancelledGodChoice = false;
  const cancelDeadChoice = choice => {
    const drawerIdx = choice?.drawerIdx ?? choice?.playerIndex ?? turnOwner;
    if (!choice?.godCard || !players?.[drawerIdx]?.isDead) return false;
    const cancelled = discardDeadDrawerGod({ players, discard, godCard: choice.godCard,
      drawerIdx, visualEvents: cancelledVisualEvents, presentationState: { ...baseState, ...extraPatch } });
    discard = cancelled.discard;
    cancelledVisualEvents = bindTurnFlowEvents(baseState, cancelled.visualEvents);
    cancelledGodChoice = true;
    return true;
  };
  while (queuedDecision.frame?.phase === 'GOD_CHOICE' && cancelDeadChoice(queuedDecision.frame.abilityData)) {
    queuedDecision = popDecisionContinuation({ _decisionContinuations: queuedDecision.remaining });
  }
  if (!phase && cancelDeadChoice(abilityData?.pendingGodChoice)) {
    const { pendingGodChoice: _cancelled, ...remainingAbilityData } = abilityData;
    abilityData = remainingAbilityData;
  }
  const legacyGodChoice = abilityData?.pendingGodChoice?.godCard
    ? abilityData.pendingGodChoice
    : null;
  const resumedDecisionPhase = queuedDecision.frame?.phase === 'GOD_CHOICE'
    && isAiSeat(baseState, turnOwner)
    && !baseState?._isMP
    ? 'AI_GOD_CHOICE'
    : queuedDecision.frame?.phase;
  const legacyGodChoicePhase = legacyGodChoice
    && isAiSeat(baseState, turnOwner)
    && !baseState?._isMP
    ? 'AI_GOD_CHOICE'
    : 'GOD_CHOICE';
  const nextPhase = phase || resumedDecisionPhase || (
    legacyGodChoice
      ? legacyGodChoicePhase
      : canResumeAi
        && isAiSeat(baseState, turnOwner)
        && !players?.[turnOwner]?.isDead
        && !abilityData?.fromRest
        ? 'AI_TURN'
        : 'ACTION'
  );
  const nextAbilityData = queuedDecision.frame
    ? {
        ...queuedDecision.frame.abilityData,
        ...buildTargetContinuationAbilityData(queuedDecision.frame.abilityData),
        ...(abilityData?.pendingZoneIncome ? { pendingZoneIncome: abilityData.pendingZoneIncome } : {}),
      }
    : legacyGodChoice
    ? {
        ...legacyGodChoice,
        ...buildTargetContinuationAbilityData(legacyGodChoice),
        ...(abilityData?.pendingZoneIncome ? { pendingZoneIncome: abilityData.pendingZoneIncome } : {}),
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
    _decisionContinuations: queuedDecision.remaining,
    ...extraPatch,
    ...(cancelledGodChoice ? {
      _visualEvents: cancelledVisualEvents,
      gameOver: baseState.gameOver || checkWin(players, baseState._isMP),
    } : {}),
  };

  return clearTurnAnim ? withClearedTurnAnimFields(nextState) : nextState;
}
