import { describe, expect, it } from 'vitest';
import {
  buildCthRestDrawFinishedState,
  consumeCthRestDrawRemaining,
  getCthRestDrawRemaining,
} from '../cthRestDrawFlow';
import { makeGs, makePlayer } from './factory';

describe('cthRestDrawFlow', () => {
  it('reads remaining CTH rest draws from abilityData', () => {
    expect(getCthRestDrawRemaining(makeGs({ abilityData: { cthDrawsRemaining: 2 } }))).toBe(2);
    expect(getCthRestDrawRemaining(makeGs({ abilityData: {} }))).toBe(0);
    expect(getCthRestDrawRemaining(null)).toBe(0);
  });

  it('consumes exactly one guarded CTH reveal without going below zero', () => {
    expect(consumeCthRestDrawRemaining(makeGs({ abilityData: { cthDrawsRemaining: 2 } }))).toBe(1);
    expect(consumeCthRestDrawRemaining(makeGs({ abilityData: { cthDrawsRemaining: 1 } }))).toBe(0);
    expect(consumeCthRestDrawRemaining(makeGs({ abilityData: { cthDrawsRemaining: 0 } }))).toBe(0);
  });

  it('builds the state used after all CTH rest draws are resolved', () => {
    const player = makePlayer();
    const state = makeGs({
      phase: 'DRAW_REVEAL',
      abilityData: { fromRest: true, cthDrawsRemaining: 0 },
    });

    expect(buildCthRestDrawFinishedState({
      stateLike: state,
      players: [player],
      deck: ['deck-card'],
      discard: ['discard-card'],
      log: ['done'],
    })).toEqual(expect.objectContaining({
      players: [player],
      deck: ['deck-card'],
      discard: ['discard-card'],
      log: ['done'],
      abilityData: {},
    }));
  });
});
