import { describe, expect, it } from 'vitest';
import { TURN_FLOW_STAGE, TURN_RULE_PHASES } from '../turnFlowStages';
import {
  TURN_FLOW_DIRECTIVE,
  TURN_FLOW_RESUME,
  enterTurnFlowStage,
  enterTurnBoundary,
  normalizeTurnOpeningFlowState,
  resolveTurnFlowAfterEvent,
  setTurnFlowResume,
  transitionTurnFlowStage,
} from '../turnFlowManager';

describe('turnFlowManager', () => {
  it('changes only flow metadata and never compiles or consumes presentation data', () => {
    const visualEvents = [{ id: 'event-1', type: 'cardGain' }];
    const animationQueue = [{ type: 'DRAW' }];
    const log = ['existing log'];
    const state = { phase: 'DRAW_REVEAL', _visualEvents: visualEvents, animationQueue, log };

    const next = transitionTurnFlowStage(state, TURN_FLOW_STAGE.DRAW);

    expect(next).toMatchObject({ phase: 'DRAW_REVEAL', _turnFlowStage: TURN_FLOW_STAGE.DRAW });
    expect(next._visualEvents).toBe(visualEvents);
    expect(next.animationQueue).toBe(animationQueue);
    expect(next.log).toBe(log);
    expect(next).not.toHaveProperty('_consumedVisualEventIds');
  });

  it('models the rule boundary separately from the five interactive phases', () => {
    const animationQueue = [{ type: 'TURN_BOUNDARY_PAUSE' }];
    const state = {
      phase: 'ACTION',
      _turnFlowStage: TURN_FLOW_STAGE.END_TURN,
      _turnFlowResume: { kind: TURN_FLOW_RESUME.END_TURN_REPLAY },
      animationQueue,
    };

    const next = enterTurnBoundary(state);

    expect(TURN_RULE_PHASES).toEqual(['turnStart', 'draw', 'action', 'discard', 'endTurn']);
    expect(next._turnFlowStage).toBe(TURN_FLOW_STAGE.TURN_BOUNDARY);
    expect(next._turnFlowResume).toBeNull();
    expect(next.animationQueue).toBe(animationQueue);
  });

  it.each(['SPHINX_GUESS', 'GOD_CHOICE', 'TSG_SLIME_BALANCE'])(
    'holds the %s interaction inside its current rule stage',
    phase => {
      const state = { phase, _turnFlowStage: TURN_FLOW_STAGE.END_TURN };
      const resolved = resolveTurnFlowAfterEvent(state, { continueRest: true });

      expect(resolved).toEqual({ state, directive: TURN_FLOW_DIRECTIVE.HOLD_INTERACTION });
    },
  );

  it('enters action only after a draw-stage event has settled', () => {
    const visualEvents = [{ id: 'draw-effect' }];
    const state = { phase: 'ACTION', _turnFlowStage: TURN_FLOW_STAGE.DRAW, _visualEvents: visualEvents };

    const resolved = resolveTurnFlowAfterEvent(state);

    expect(resolved.directive).toBe(TURN_FLOW_DIRECTIVE.APPLY_STATE);
    expect(resolved.state._turnFlowStage).toBe(TURN_FLOW_STAGE.ACTION);
    expect(resolved.state._visualEvents).toBe(visualEvents);
  });

  it('uses the end-turn stage as the authoritative fallback when event markers are lost', () => {
    const state = { phase: 'ACTION', abilityData: {}, _turnFlowStage: TURN_FLOW_STAGE.END_TURN };

    expect(resolveTurnFlowAfterEvent(state)).toEqual({
      state,
      directive: TURN_FLOW_DIRECTIVE.ADVANCE_END_TURN,
    });
  });

  it('preserves continuation priority while adapting legacy event metadata', () => {
    const state = {
      phase: 'ACTION',
      abilityData: { continueTurnStartDraw: true, fromEndTurnReplay: true },
      proliferatingZQueue: [{}],
      _turnFlowStage: TURN_FLOW_STAGE.END_TURN,
    };

    expect(resolveTurnFlowAfterEvent(state, { continueRest: true }).directive)
      .toBe(TURN_FLOW_DIRECTIVE.RESUME_CTH_REST_DRAW);
    expect(resolveTurnFlowAfterEvent(state).directive)
      .toBe(TURN_FLOW_DIRECTIVE.RESUME_TURN_START_DRAW);
    expect(resolveTurnFlowAfterEvent({ ...state, abilityData: { fromEndTurnReplay: true } }).directive)
      .toBe(TURN_FLOW_DIRECTIVE.RESUME_END_TURN_REPLAY);
    expect(resolveTurnFlowAfterEvent({ ...state, abilityData: {} }).directive)
      .toBe(TURN_FLOW_DIRECTIVE.RESUME_PROLIFERATING_Z);
  });

  it('resumes a CTH rest draw from authoritative state even when a caller hint is lost', () => {
    const state = {
      phase: 'ACTION',
      abilityData: { fromRest: true, cthDrawsRemaining: 0 },
      _turnFlowStage: TURN_FLOW_STAGE.END_TURN,
    };

    expect(resolveTurnFlowAfterEvent(state).directive)
      .toBe(TURN_FLOW_DIRECTIVE.RESUME_CTH_REST_DRAW);
  });

  it('supports explicit resume metadata without coupling it to an animation queue', () => {
    const state = setTurnFlowResume(
      enterTurnFlowStage({ phase: 'ACTION' }, TURN_FLOW_STAGE.END_TURN),
      TURN_FLOW_RESUME.END_TURN_REPLAY,
      { cursor: 2 },
    );

    expect(resolveTurnFlowAfterEvent(state).directive)
      .toBe(TURN_FLOW_DIRECTIVE.RESUME_END_TURN_REPLAY);
    expect(state._turnFlowResume).toEqual({ kind: TURN_FLOW_RESUME.END_TURN_REPLAY, cursor: 2 });
    expect(state).not.toHaveProperty('animationQueue');
  });

  it.each([
    ['NYA_BORROW', {}, TURN_FLOW_STAGE.TURN_START],
    ['TSG_SLIME_BALANCE', { _pendingTurnStartEventIds: ['poisonDamage'] }, TURN_FLOW_STAGE.TURN_START],
    ['DRAW_REVEAL', {}, TURN_FLOW_STAGE.DRAW],
    ['GOD_CHOICE', {}, TURN_FLOW_STAGE.DRAW],
    ['SPHINX_GUESS', {}, TURN_FLOW_STAGE.DRAW],
    ['ACTION', {}, TURN_FLOW_STAGE.ACTION],
    ['AI_TURN', {}, TURN_FLOW_STAGE.ACTION],
  ])('normalizes turn-opening phase %s to %s', (phase, abilityData, expectedStage) => {
    const state = { phase, abilityData, _visualEvents: [{ id: phase }] };
    const next = normalizeTurnOpeningFlowState(state);

    expect(next._turnFlowStage).toBe(expectedStage);
    expect(next._visualEvents).toBe(state._visualEvents);
  });
});
