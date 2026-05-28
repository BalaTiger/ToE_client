import { describe, expect, it } from 'vitest';
import {
  buildZhuLight,
  getZhuLightOffsets,
  getZhuLitDeckCards,
  getZhuTopGuard,
  moveTopDeckCardToBottom,
  removeZhuLightCard,
} from '../zhuPower';
import { makePlayer, makeZoneCard } from './factory';

function makeDeck(count = 6) {
  return Array.from({ length: count }, (_, i) => makeZoneCard(`A${(i % 4) + 1}`, 0, { id: `card-${i}` }));
}

describe('zhuPower', () => {
  it('maps god level to lit deck offsets', () => {
    expect(getZhuLightOffsets(1)).toEqual([2]);
    expect(getZhuLightOffsets(2)).toEqual([1, 2, 3]);
    expect(getZhuLightOffsets(3)).toEqual([0, 1, 2, 3, 4]);
  });

  it('lights cards by owner level at the owner turn start', () => {
    const deck = makeDeck();
    const players = [
      makePlayer({ godName: 'ZHU', godLevel: 2 }),
      makePlayer(),
    ];
    const light = buildZhuLight(players, deck, 0, null);
    expect(light).toMatchObject({ ownerIdx: 0, level: 2, cardIds: ['card-1', 'card-2', 'card-3'] });
    expect(getZhuLitDeckCards(light, deck).map(item => item.deckIndex)).toEqual([1, 2, 3]);
  });

  it('does not create a first light list before the owner turn starts', () => {
    const deck = makeDeck();
    const players = [
      makePlayer({ godName: 'ZHU', godLevel: 2 }),
      makePlayer(),
    ];
    expect(buildZhuLight(players, deck, 1, null)).toBeNull();
  });

  it('引燃火把免疫时不点亮烛九阴牌', () => {
    const deck = makeDeck();
    const players = [
      makePlayer({ godName: 'ZHU', godLevel: 2, godPowerImmuneThisTurn: true }),
      makePlayer(),
    ];
    expect(buildZhuLight(players, deck, 0, null)).toBeNull();
  });

  it('keeps only still-in-deck lit cards outside the owner turn', () => {
    const deck = makeDeck();
    const players = [
      makePlayer({ godName: 'ZHU', godLevel: 3 }),
      makePlayer(),
    ];
    const previous = buildZhuLight(players, deck, 0, null);
    const shiftedDeck = deck.slice(2);
    const light = buildZhuLight(players, shiftedDeck, 1, previous);
    expect(light.cardIds).toEqual(['card-2', 'card-3', 'card-4']);
  });

  it('clears light when Zhu faith is lost', () => {
    const deck = makeDeck();
    const previous = { ownerIdx: 0, level: 1, cardIds: ['card-2'] };
    const players = [
      makePlayer({ godName: null, godLevel: 0 }),
      makePlayer(),
    ];
    expect(buildZhuLight(players, deck, 1, previous)).toBeNull();
  });

  it('guards and moves a lit top deck card to the bottom', () => {
    const deck = makeDeck();
    const players = [
      makePlayer({ godName: 'ZHU', godLevel: 3 }),
      makePlayer(),
    ];
    const zhuLight = buildZhuLight(players, deck, 0, null);
    const guard = getZhuTopGuard({ players, deck, currentTurn: 0, zhuLight }, deck);
    expect(guard.card.id).toBe('card-0');
    expect(moveTopDeckCardToBottom(deck).map(card => card.id)).toEqual(['card-1', 'card-2', 'card-3', 'card-4', 'card-5', 'card-0']);
  });

  it('removes a lit card id from the light list', () => {
    const zhuLight = { ownerIdx: 0, level: 3, cardIds: ['card-0', 'card-1', 'card-2'], lightNonce: 7 };
    expect(removeZhuLightCard(zhuLight, { id: 'card-1' })).toEqual({
      ownerIdx: 0,
      level: 3,
      cardIds: ['card-0', 'card-2'],
      lightNonce: 7,
    });
  });
});
