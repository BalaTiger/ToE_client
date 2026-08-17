import { describe, expect, it } from 'vitest';
import {
  splitKeptDestroyedDiscarded,
  discardCardsFromHand,
  discardCardsFromHandFromRight,
  applyHandDiscardSideEffectsWithAnim,
} from '../handLimitDiscard';
import { makePlayer, makeGs, makeZoneCard } from './factory';

describe('splitKeptDestroyedDiscarded', () => {
  it('keeps normal cards, destroys every derived type, and preserves the animation list', () => {
    const normal = makeZoneCard('A1');
    const goat = makeZoneCard('A2', 0, { type: 'blackGoatYoung', name: '黑山羊幼仔' });
    const slime = makeZoneCard('A3', 0, { type: 'tsathogguaSlime', name: '黄液' });
    const restore = makeZoneCard('A4', 0, { type: 'geomagneticRestore', name: '反转复原' });
    const result = splitKeptDestroyedDiscarded([normal, goat, slime, restore]);
    expect(result.kept).toEqual([normal]);
    expect(result.destroyed).toEqual([goat, slime, restore]);
    expect(result.animationCards).toEqual([normal, goat, slime, restore]);
  });

  it('returns empty arrays for empty input', () => {
    const result = splitKeptDestroyedDiscarded();
    expect(result.kept).toEqual([]);
    expect(result.destroyed).toEqual([]);
    expect(result.animationCards).toEqual([]);
  });
});

describe('discardCardsFromHand', () => {
  it('removes cards by indices and returns them in removal order', () => {
    const c0 = makeZoneCard('A1');
    const c1 = makeZoneCard('A2');
    const c2 = makeZoneCard('A3');
    const player = makePlayer({ hand: [c0, c1, c2] });
    const { players, discarded } = discardCardsFromHand([player], 0, [0, 2]);

    expect(players[0].hand).toEqual([c1]);
    expect(discarded).toEqual([c2, c0]);
  });

  it('ignores out-of-range indices', () => {
    const c0 = makeZoneCard('A1');
    const player = makePlayer({ hand: [c0] });
    const { players, discarded } = discardCardsFromHand([player], 0, [-1, 5, 0]);
    expect(players[0].hand).toEqual([]);
    expect(discarded).toEqual([c0]);
  });
});

describe('discardCardsFromHandFromRight', () => {
  it('pops the requested count from the right', () => {
    const c0 = makeZoneCard('A1');
    const c1 = makeZoneCard('A2');
    const c2 = makeZoneCard('A3');
    const player = makePlayer({ hand: [c0, c1, c2] });
    const { players, discarded } = discardCardsFromHandFromRight([player], 0, 2);

    expect(players[0].hand).toEqual([c0]);
    expect(discarded).toEqual([c2, c1]);
  });

  it('does not pop more cards than available', () => {
    const player = makePlayer({ hand: [makeZoneCard('A1')] });
    const { players, discarded } = discardCardsFromHandFromRight([player], 0, 5);
    expect(players[0].hand).toEqual([]);
    expect(discarded).toHaveLength(1);
  });
});

describe('applyHandDiscardSideEffectsWithAnim', () => {
  it('returns empty queue when no side effects are triggered', () => {
    const player = makePlayer({ hand: [makeZoneCard('A1')] });
    const baseGs = makeGs({ players: [player] });
    const result = applyHandDiscardSideEffectsWithAnim({
      baseGs,
      players: [player],
      deck: [],
      discard: [],
      log: [],
      ownerIdx: 0,
      cards: [makeZoneCard('A2')],
      reason: '手牌上限弃牌',
    });
    expect(result.queue).toEqual([]);
    expect(result.statePatch).toEqual({});
  });

  it('applies life balance damage and builds a stat animation queue', () => {
    const player = makePlayer({ hp: 10 });
    const baseGs = makeGs({ players: [player] });
    const balanceCard = makeZoneCard('A1', 0, { type: 'lifeBalance', name: '生命天平' });

    const result = applyHandDiscardSideEffectsWithAnim({
      baseGs,
      players: [player],
      deck: [],
      discard: [],
      log: [],
      ownerIdx: 0,
      cards: [balanceCard],
      reason: '手牌上限弃牌',
    });

    expect(result.players[0].hp).toBe(7);
    expect(result.log.some(l => l.includes('生命天平'))).toBe(true);
    expect(result.statePatch._statEvents).toHaveLength(1);
    expect(result.queue.length).toBeGreaterThan(0);
  });
});
