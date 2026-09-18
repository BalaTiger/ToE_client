import { describe, expect, it, vi } from 'vitest';
import { aiStep } from '../aiTurn';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { makeGs, makePlayer, makeZoneCard } from './factory';

describe('AI effect-before-income', () => {
  it.each([
    ['buryAlive', '活埋'],
    ['igniteTorch', '引燃火把'],
  ])('does not spend a %s gift as its own effect cost', (type, name) => {
    const card = makeZoneCard('A4', 0, { id: `gift-${type}`, type, name });
    const state = makeGs({ currentTurn: 1, phase: 'AI_TURN', players: [
      makePlayer({ role: ROLE_HUNTER, roleRevealed: true }),
      makePlayer({ role: ROLE_CULTIST, roleRevealed: true, hand: [card] }),
    ], deck: [makeZoneCard('B1', 0)] });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const next = aiStep(state, { allAi: true });
      const gift = next._visualEvents?.find(event => event.type === 'bewitchGift');
      expect(gift).toBeDefined();
      expect(gift.playersAfter[0].hand).toContainEqual(card);
      expect(gift.discardAfter).not.toContainEqual(card);
      expect(next.deck).not.toContainEqual(card);
    } finally {
      random.mockRestore();
    }
  });

  it('finishes a rose gift before receiving its source card or checking numbered-hand victory', () => {
    const card = makeZoneCard('D3', 0, { id: 'pending-rose', type: 'roseThornGiftAllHand' });
    const oldHand = [makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('C4')];
    const owner = makePlayer({ role: ROLE_TREASURE, hand: oldHand });
    const state = makeGs({ currentTurn: 1, phase: 'ROSE_THORN_SELECT_TARGET', players: [
      makePlayer({ role: ROLE_HUNTER }), owner,
      makePlayer({ role: ROLE_CULTIST }),
    ], abilityData: { roseThornSource: 1, roseThornTargets: [0],
      pendingZoneIncome: { card, ownerId: owner.id } } });
    const next = aiStep(state, { allAi: true });
    expect(next.players[1].hand).toEqual([card]);
    expect(next.players[0].hand.map(held => held.id)).toEqual(oldHand.map(held => held.id));
    expect(next.abilityData.pendingZoneIncome).toBeUndefined();
    expect(next.gameOver).toBeFalsy();
    expect(next._visualEvents.map(event => event.effect)).toEqual(['roseThornGiftAllHand', 'zoneIncome']);
  });
});
