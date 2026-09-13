import { describe, expect, it } from 'vitest';
import { resolveAiHandLimitDiscards } from './aiHandLimitDiscard';
import { chooseAiHandLimitDiscardIndex } from './aiDiscardChoices';
import { aiStep } from './aiTurn';
import { resolveHeadlessEtherealize } from './headlessSimulator';
import { addDamageLink } from './damageLinks';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from './coreUtils';
import { makeGs, makePlayer, makeZoneCard } from './__tests__/factory';

const life = () => makeZoneCard('B1', 2);
const knownPlayer = overrides => makePlayer({ roleRevealed: true, ...overrides });

describe('actual AI hand-limit settlement', () => {
  it('applies the public hand-limit decrease to both selection and actual settlement', () => {
    const gs = makeGs({
      _isMP: true,
      players: [
        knownPlayer({ hp: 3, handLimitDecrease: 1, hand: [life(), makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('B2')] }),
        knownPlayer({ role: ROLE_HUNTER }),
      ],
    });
    expect(chooseAiHandLimitDiscardIndex(gs, 0)).toBeGreaterThan(0);
    const result = resolveAiHandLimitDiscards(gs, 0);
    expect(result.discardedCards).toHaveLength(1);
    expect(result.state.players[0].hand).toHaveLength(3);
    expect(result.state.players[0].hp).toBe(3);
    expect(result.state.players[0].handLimitDecrease).toBe(1);
  });

  it('uses an explicit effective limit without subtracting the decrease twice', () => {
    const gs = makeGs({
      _isMP: true,
      players: [
        knownPlayer({ hp: 3, handLimitDecrease: 2, hand: [life(), makeZoneCard('A1'), makeZoneCard('B2')] }),
        knownPlayer({ role: ROLE_HUNTER }),
      ],
    });
    const result = resolveAiHandLimitDiscards(gs, 0, { handLimit: 2 });
    expect(result.discardedCards).toHaveLength(1);
    expect(result.state.players[0].hand).toHaveLength(2);
    expect(result.state.players[0].hp).toBe(3);
    expect(result.state.players[0].handLimitDecrease).toBe(2);
  });

  it('applies unavoidable life-balance loss and death before advancing a turn', () => {
    const gs = makeGs({
      _isMP: true,
      players: [
        knownPlayer({ role: ROLE_HUNTER, hp: 3, hand: Array.from({ length: 5 }, life) }),
        knownPlayer({ role: ROLE_TREASURE, hp: 8, hand: [] }),
      ],
    });
    const before = structuredClone(gs);
    const result = resolveAiHandLimitDiscards(gs, 0);
    expect(result.discardedCards).toHaveLength(1);
    expect(result.state.players[0]).toMatchObject({ hp: 0, isDead: true, hand: [] });
    expect(result.state.currentTurn).toBe(0);
    expect(result.state.gameOver?.winner).toBe(ROLE_TREASURE);
    expect(result.visualEvents.map(event => event.type)).toEqual(['handLimitDiscard', 'statEvents']);
    expect(result.state._statEvents.some(event => event.type === 'HP_LOSS' && event.target === 0)).toBe(true);
    expect(gs).toEqual(before);
  });

  it('preserves ordinary card order while resolving the selected discard', () => {
    const hand = [life(), makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('B2'), makeZoneCard('C3')];
    const gs = makeGs({
      _isMP: true,
      players: [knownPlayer({ hp: 3, hand }), knownPlayer({ role: ROLE_HUNTER })],
    });
    const result = resolveAiHandLimitDiscards(gs, 0);
    const removedId = result.discardedCards[0].id;
    expect(result.state.players[0].hand.map(card => card.id)).toEqual(hand.filter(card => card.id !== removedId).map(card => card.id));
    expect(result.state.players[0].hp).toBe(3);
    expect(result.state.players[0].isDead).toBe(false);
  });

  it('after a discard reaction resumes remaining discards without another hunt or rest', () => {
    const gs = makeGs({
      _isMP: true, _headless: true, phase: 'AI_TURN', currentTurn: 0,
      players: [
        knownPlayer({ name: 'hunter', role: ROLE_HUNTER, hp: 10, hand: Array.from({ length: 6 }, life) }),
        knownPlayer({ name: 'target', role: ROLE_TREASURE, hp: 10, etherealizeStacks: 1, hand: [makeZoneCard('D1')] }),
        knownPlayer({ name: 'third', role: ROLE_CULTIST, hp: 10, hand: [] }),
      ],
      deck: [makeZoneCard('B2')],
    });
    addDamageLink(gs.players, 0, 1);
    const first = resolveAiHandLimitDiscards(gs, 0);
    expect(first.damageDecision?.phase).toBe('ETHEREALIZE_DECISION');
    expect(first.state.players[0].hand).toHaveLength(5);
    expect(first.state._aiFinishingTurn).toBe(true);
    const settledReaction = resolveHeadlessEtherealize(first.state, { useEtherealize: false });
    expect(settledReaction.players[0].hp).toBe(4);
    const next = aiStep(settledReaction, { allAi: true });
    const owner = next.players[0];
    expect(owner.hand).toHaveLength(4);
    expect(next._playersBeforeNextDraw[0].hp).toBe(1);
    expect(next.log.filter(line => line.includes('hunter 弃 '))).toHaveLength(2);
    expect(next.log.some(line => line.includes('hunter（追猎者）对'))).toBe(false);
    expect(next.log.some(line => line.includes('hunter 选择【休息】'))).toBe(false);
    expect(next.currentTurn).not.toBe(0);
    expect(next._aiFinishingTurn).toBeUndefined();
  });
});
