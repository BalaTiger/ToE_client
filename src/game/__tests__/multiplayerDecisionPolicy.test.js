import { describe, expect, it } from 'vitest';
import {
  getBuryAliveLocalPendingTarget,
  getDefaultHandCardIndexForMpDecision,
  getDefaultTargetForMpDecision,
  getMpDecisionKey,
  getRandomHandCardIndex,
  isLocalCaveDuelCardDecisionPhase,
  isMpBlockingDecisionPhase,
} from '../multiplayerDecisionPolicy';

const player = (name, hand = []) => ({ name, hand, godZone: [], zoneCards: [], isDead: false });

describe('multiplayer decision policy', () => {
  it('changes the decision key when a decision-bearing field changes', () => {
    const state = {
      phase: 'CAVE_DUEL_SELECT_CARD',
      currentTurn: 0,
      _turnKey: 'turn-1',
      log: [],
      abilityData: { caveDuelSource: 0, caveDuelTarget: 1 },
    };

    expect(getMpDecisionKey(state)).not.toBe(getMpDecisionKey({
      ...state,
      abilityData: { ...state.abilityData, caveDuelTarget: 2 },
    }));
  });

  it('chooses only live legal default targets', () => {
    const state = {
      phase: 'CAVE_DUEL_SELECT_TARGET',
      players: [player('你'), { ...player('倒下者', [{}]), isDead: true }, player('贝拉', [{}])],
      abilityData: { caveDuelTargets: [1, 2] },
    };

    expect(getDefaultTargetForMpDecision(state)).toBe(2);
  });

  it('uses the shared cave-duel heuristic and permits deterministic random choice', () => {
    const state = {
      phase: 'CAVE_DUEL_SELECT_CARD',
      players: [player('你', [{ number: 2 }, { number: 5 }, { isGod: true }])],
    };

    expect(getDefaultHandCardIndexForMpDecision(state)).toBe(1);
    expect(getRandomHandCardIndex(state.players[0].hand, () => 0.75)).toBe(2);
    expect(getRandomHandCardIndex([], () => 0.75)).toBe(-1);
  });

  it('identifies local and shared blocking decisions from state only', () => {
    const caveState = {
      _isMP: true,
      phase: 'CAVE_DUEL_WAIT_REVEAL',
      abilityData: { caveDuelSource: 0, caveDuelTarget: 1, sourceCard: null, targetCard: { id: 'target' } },
    };
    const buryState = {
      _isMP: true,
      phase: 'BURY_ALIVE_SELECT',
      abilityData: { targets: [0, 1], buryAliveChoices: [null, { id: 'chosen' }] },
    };

    expect(isLocalCaveDuelCardDecisionPhase(caveState)).toBe(true);
    expect(isMpBlockingDecisionPhase(caveState)).toBe(true);
    expect(getBuryAliveLocalPendingTarget(buryState)).toBe(0);
    expect(isMpBlockingDecisionPhase(buryState)).toBe(true);
  });
});
