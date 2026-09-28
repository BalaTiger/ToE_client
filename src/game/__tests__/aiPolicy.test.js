import { describe, expect, it, vi } from 'vitest';
import { chooseAiAction, createAiObservationState, evaluateAiState } from '../aiPolicy';
import { runAiPreview } from '../aiPreviewRuntime';
import { ensureStatEventId } from '../statEventIdentity';
import { createBlackGoatYoungCard } from '../../constants/card';
import { makeGs, makePlayer, makeZoneCard } from './factory';

describe('shared AI policy', () => {
  it('uses observation data rather than hidden hands, roles, deck order and animation snapshots', () => {
    const gs = makeGs({ players: [makePlayer(), makePlayer({ role: '追猎者', hand: [makeZoneCard('A1')] })],
      deck: [makeZoneCard('D4')], abilityData: { sourceCard: makeZoneCard('B1') },
      _playersBeforeDraw: [{ hand: [makeZoneCard('C1')] }] });
    const first = createAiObservationState(gs, 0);
    gs.players[1].hand = [makeZoneCard('B3')]; gs.players[1].role = '邪祀者';
    gs.deck = [makeZoneCard('C2')];
    expect(createAiObservationState(gs, 0)).toEqual(first);
    expect(first.abilityData).toEqual({});
    expect(first._playersBeforeDraw).toBeUndefined();
  });

  it('a faction win outranks the death of its own actor and any resource score', () => {
    const gs = makeGs({ players: [makePlayer({ role: '邪祀者' }), makePlayer()] });
    const action = chooseAiAction({ state: gs, actorIdx: 0, actions: ['win', 'live'],
      simulate: (state, choice) => {
        if (choice === 'win') { state.players[0].isDead = true; state.players[0].hp = 0; state.players[1].san = 0; }
        return state;
      }, evaluate: (_state, choice) => choice === 'live' ? 1000000 : -1000000 });
    expect(action).toBe('win');
  });

  it('recognizes treasure victory only at an explicitly allowed declaration boundary', () => {
    const gs = makeGs({ players: [makePlayer({ hand: ['A1', 'B2', 'C3', 'D4'].map(key => makeZoneCard(key)) }), makePlayer()] });
    expect(evaluateAiState(gs, 0)[0]).toBe(0);
    expect(evaluateAiState(gs, 0, { allowTreasureDeclaration: true })[0]).toBe(1);
    gs.proliferatingZQueue = [{ drawerIdx: 1, gainOwnerIdx: 0 }];
    expect(evaluateAiState(gs, 0, { allowTreasureDeclaration: true })[0]).toBe(0);
    gs.proliferatingZQueue = [];
    gs._aiPreviewIncomplete = true;
    expect(evaluateAiState(gs, 0, { allowTreasureDeclaration: true })[0]).toBe(0);
  });

  it('isolates live state, random draws and generated identities, even when preview throws', () => {
    const original = Math.random;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.73);
    try {
      const beforeCard = createBlackGoatYoungCard();
      const beforeStat = ensureStatEventId({ type: 'HP_LOSS' });
      expect(() => runAiPreview(() => {
        Math.random(); createBlackGoatYoungCard(); ensureStatEventId({ type: 'HP_LOSS' });
        throw new Error('preview failure');
      })).toThrow('preview failure');
      expect(random).not.toHaveBeenCalled();
      expect(Math.random()).toBe(0.73);
      const afterCard = createBlackGoatYoungCard();
      const afterStat = ensureStatEventId({ type: 'HP_LOSS' });
      expect(Number(afterCard.id.split('-').at(-1))).toBe(Number(beforeCard.id.split('-').at(-1)) + 1);
      expect(Number(afterStat.id.split(':').at(-1))).toBe(Number(beforeStat.id.split(':').at(-1)) + 1);
      const state = makeGs({ players: [makePlayer(), makePlayer()] });
      const before = structuredClone(state);
      chooseAiAction({ state, actorIdx: 0, actions: ['damage'], simulate: s => { s.players[0].hp--; return s; } });
      expect(state).toEqual(before);
    } finally { random.mockRestore(); }
    expect(Math.random).toBe(original);
  });
});
