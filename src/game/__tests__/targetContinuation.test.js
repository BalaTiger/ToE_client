import { describe, expect, it } from 'vitest';
import {
  buildTargetContinuationAbilityData,
  buildTargetContinuationState,
} from '../targetContinuation';

function createState(overrides = {}) {
  return {
    players: [
      { name: 'local', isDead: false },
      { name: 'ai', isDead: false },
    ],
    deck: ['deck'],
    discard: ['discard'],
    log: ['log'],
    currentTurn: 0,
    phase: 'TARGET',
    abilityData: {},
    _drawnCard: { id: 'drawn' },
    _turnStartLogs: ['pending animation'],
    ...overrides,
  };
}

describe('buildTargetContinuationAbilityData', () => {
  it('keeps only continuation metadata, including a zero remaining draw count', () => {
    const pendingInspectionContinuation = { kind: 'resume' };
    expect(buildTargetContinuationAbilityData({
      _turnOwner: 2,
      fromRest: true,
      fromEndTurnReplay: true,
      fromTsathogguaSlime: true,
      continueTurnStartDraw: true,
      pendingTsathogguaSlime: { targetIdx: 1 },
      pendingTsathogguaSlimes: [{ targetIdx: 2 }],
      cthDrawsRemaining: 0,
      pendingSanInspection: { targetIdx: 3 },
      pendingInspectionContinuation,
      pendingGodChoice: { godCard: { id: 'god' } },
      targetIdx: 4,
      selectedCard: { id: 'temporary' },
    })).toEqual({
      _turnOwner: 2,
      fromRest: true,
      fromEndTurnReplay: true,
      fromTsathogguaSlime: true,
      continueTurnStartDraw: true,
      pendingTsathogguaSlime: { targetIdx: 1 },
      pendingTsathogguaSlimes: [{ targetIdx: 2 }],
      cthDrawsRemaining: 0,
      pendingSanInspection: { targetIdx: 3 },
      pendingInspectionContinuation,
      pendingGodChoice: { godCard: { id: 'god' } },
    });
  });
});

describe('buildTargetContinuationState', () => {
  it('resumes an alive single-player AI seat and clears turn animation fields', () => {
    const state = createState({ currentTurn: 1 });
    const next = buildTargetContinuationState({ baseState: state });

    expect(next.phase).toBe('AI_TURN');
    expect(next._drawnCard).toBeNull();
    expect(next._turnStartLogs).toEqual([]);
  });

  it('returns to action for rest continuation or a dead AI seat', () => {
    const restState = createState({
      currentTurn: 1,
      abilityData: { fromRest: true },
    });
    expect(buildTargetContinuationState({ baseState: restState }).phase).toBe('ACTION');

    const deadPlayers = restState.players.map((player, index) => (
      index === 1 ? { ...player, isDead: true } : player
    ));
    const deadState = createState({ currentTurn: 1, players: deadPlayers });
    expect(buildTargetContinuationState({ baseState: deadState }).phase).toBe('ACTION');
  });

  it('prioritizes a pending god choice and carries its decision fields', () => {
    const godCard = { id: 'god' };
    const pendingGodChoice = {
      godCard,
      playerIdx: 1,
      fromEndTurnReplay: true,
    };
    const state = createState({
      currentTurn: 1,
      abilityData: { pendingGodChoice },
    });
    const next = buildTargetContinuationState({ baseState: state });

    expect(next.phase).toBe('GOD_CHOICE');
    expect(next.abilityData).toEqual(pendingGodChoice);
  });

  it('honors an explicit phase and can retain animation fields', () => {
    const state = createState({ currentTurn: 1 });
    const next = buildTargetContinuationState({
      baseState: state,
      phase: 'CUSTOM_PHASE',
      clearTurnAnim: false,
      extraPatch: { marker: true },
    });

    expect(next.phase).toBe('CUSTOM_PHASE');
    expect(next._drawnCard).toEqual({ id: 'drawn' });
    expect(next.marker).toBe(true);
  });
});
