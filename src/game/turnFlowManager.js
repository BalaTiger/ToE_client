import { TURN_FLOW_STAGE } from './turnFlowStages';

export const TURN_FLOW_RESUME = Object.freeze({
  CTH_REST_DRAW: 'cthRestDraw',
  TURN_START_DRAW: 'turnStartDraw',
  END_TURN_REPLAY: 'endTurnReplay',
  PROLIFERATING_Z: 'proliferatingZ',
});

export const TURN_FLOW_DIRECTIVE = Object.freeze({
  HOLD_INTERACTION: 'holdInteraction',
  RESUME_CTH_REST_DRAW: 'resumeCthRestDraw',
  RESUME_TURN_START_DRAW: 'resumeTurnStartDraw',
  RESUME_END_TURN_REPLAY: 'resumeEndTurnReplay',
  RESUME_PROLIFERATING_Z: 'resumeProliferatingZ',
  ADVANCE_END_TURN: 'advanceEndTurn',
  APPLY_STATE: 'applyState',
});

const SETTLED_INTERACTION_PHASES = new Set(['ACTION', 'AI_TURN']);

export function enterTurnFlowStage(state, stage, { resume = undefined } = {}) {
  if (!state) return state;
  return {
    ...state,
    _turnFlowStage: stage,
    _turnFlowResume: resume ?? null,
  };
}

export function setTurnFlowResume(state, kind, data = {}) {
  if (!state) return state;
  return {
    ...state,
    _turnFlowResume: kind ? { kind, ...data } : null,
  };
}

export function clearTurnFlowResume(state) {
  if (!state || state._turnFlowResume == null) return state;
  return { ...state, _turnFlowResume: null };
}

// Begin the non-interactive rules handoff. Domain cleanup remains in the rule
// engine; same-named animation stages only present the resulting visual events.
export function enterTurnBoundary(state) {
  return enterTurnFlowStage(state, TURN_FLOW_STAGE.TURN_BOUNDARY);
}

export function transitionTurnFlowStage(state, stage, { phase = undefined, clearResume = true } = {}) {
  if (!state) return state;
  return {
    ...state,
    _turnFlowStage: stage,
    ...(phase === undefined ? {} : { phase }),
    ...(clearResume ? { _turnFlowResume: null } : {}),
  };
}

export function normalizeTurnOpeningFlowState(state) {
  if (!state || state.gameOver) return state;
  const phase = state.phase;
  if (SETTLED_INTERACTION_PHASES.has(phase)) {
    return transitionTurnFlowStage(state, TURN_FLOW_STAGE.ACTION);
  }
  if (phase === 'NYA_BORROW' || state.abilityData?._pendingTurnStartEventIds) {
    return enterTurnFlowStage(state, TURN_FLOW_STAGE.TURN_START);
  }
  return enterTurnFlowStage(state, TURN_FLOW_STAGE.DRAW);
}

function getResumeKind(state, hints) {
  if (hints.continueRest || state?.abilityData?.fromRest) return TURN_FLOW_RESUME.CTH_REST_DRAW;
  if (hints.continueTurnStartDraw || state?.abilityData?.continueTurnStartDraw) {
    return TURN_FLOW_RESUME.TURN_START_DRAW;
  }
  if (state?.abilityData?.fromEndTurnReplay || state?._turnFlowResume?.kind === TURN_FLOW_RESUME.END_TURN_REPLAY) {
    return TURN_FLOW_RESUME.END_TURN_REPLAY;
  }
  if (state?.proliferatingZQueue?.length || state?._turnFlowResume?.kind === TURN_FLOW_RESUME.PROLIFERATING_Z) {
    return TURN_FLOW_RESUME.PROLIFERATING_Z;
  }
  return state?._turnFlowResume?.kind || null;
}

// Rules-only completion resolver. It never creates or reorders animation
// steps. The presentation bridge may play a queue first, then execute the
// returned directive with the returned authoritative state.
export function resolveTurnFlowAfterEvent(state, hints = {}) {
  if (!state) return { state, directive: TURN_FLOW_DIRECTIVE.APPLY_STATE };
  const phase = state.phase;
  if (phase && !SETTLED_INTERACTION_PHASES.has(phase)) {
    return { state, directive: TURN_FLOW_DIRECTIVE.HOLD_INTERACTION };
  }

  const resumeKind = getResumeKind(state, hints);
  if (resumeKind === TURN_FLOW_RESUME.CTH_REST_DRAW) {
    return { state, directive: TURN_FLOW_DIRECTIVE.RESUME_CTH_REST_DRAW };
  }
  if (resumeKind === TURN_FLOW_RESUME.TURN_START_DRAW) {
    return { state, directive: TURN_FLOW_DIRECTIVE.RESUME_TURN_START_DRAW };
  }
  if (resumeKind === TURN_FLOW_RESUME.END_TURN_REPLAY) {
    return { state, directive: TURN_FLOW_DIRECTIVE.RESUME_END_TURN_REPLAY };
  }
  if (resumeKind === TURN_FLOW_RESUME.PROLIFERATING_Z) {
    return { state, directive: TURN_FLOW_DIRECTIVE.RESUME_PROLIFERATING_Z };
  }
  if (state._turnFlowStage === TURN_FLOW_STAGE.END_TURN) {
    return { state, directive: TURN_FLOW_DIRECTIVE.ADVANCE_END_TURN };
  }
  if (state._turnFlowStage === TURN_FLOW_STAGE.DRAW) {
    return {
      state: transitionTurnFlowStage(state, TURN_FLOW_STAGE.ACTION, { phase }),
      directive: TURN_FLOW_DIRECTIVE.APPLY_STATE,
    };
  }
  return { state, directive: TURN_FLOW_DIRECTIVE.APPLY_STATE };
}
