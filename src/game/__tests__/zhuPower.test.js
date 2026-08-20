import { describe, expect, it } from 'vitest';
import {
  buildZhuRevealAbilityData,
  getZhuDrawHiddenCardId,
  getZhuLightOffsets,
  getZhuLightInvariantViolations,
  getZhuLitDeckCards,
  getZhuTopGuard,
  reconcileZhuLight,
  refreshZhuLightAtOwnerTurn,
  requestZhuReveal,
  ZHU_REVEAL_SOURCE,
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
    const light = refreshZhuLightAtOwnerTurn(players, deck, 0, null);
    expect(light).toMatchObject({ ownerIdx: 0, level: 2, cardIds: ['card-1', 'card-2', 'card-3'] });
    expect(getZhuLitDeckCards(light, deck).map(item => item.deckIndex)).toEqual([1, 2, 3]);
  });

  it('does not create a first light list before the owner turn starts', () => {
    const deck = makeDeck();
    const players = [
      makePlayer({ godName: 'ZHU', godLevel: 2 }),
      makePlayer(),
    ];
    expect(reconcileZhuLight(players, deck, null)).toBeNull();
  });

  it('引燃火把免疫时不点亮烛九阴牌', () => {
    const deck = makeDeck();
    const players = [
      makePlayer({ godName: 'ZHU', godLevel: 2, godPowerImmuneThisTurn: true }),
      makePlayer(),
    ];
    expect(refreshZhuLightAtOwnerTurn(players, deck, 0, null)).toBeNull();
  });

  it('keeps only still-in-deck lit cards outside the owner turn', () => {
    const deck = makeDeck();
    const players = [
      makePlayer({ godName: 'ZHU', godLevel: 3 }),
      makePlayer(),
    ];
    const previous = refreshZhuLightAtOwnerTurn(players, deck, 0, null);
    const shiftedDeck = deck.slice(2);
    const light = reconcileZhuLight(players, shiftedDeck, previous);
    expect(light.cardIds).toEqual(['card-2', 'card-3', 'card-4']);
  });

  it('reconciliation never lights new positions or changes the visual nonce', () => {
    const deck = makeDeck();
    const players = [makePlayer({ godName: 'ZHU', godLevel: 1 }), makePlayer()];
    const refreshed = refreshZhuLightAtOwnerTurn(players, deck, 0, null);
    const shiftedDeck = deck.slice(2);

    expect(reconcileZhuLight(players, shiftedDeck, refreshed)).toEqual({
      ownerIdx: 0,
      level: 1,
      cardIds: ['card-2'],
      lightNonce: 1,
    });
  });

  it('a reveal guard cannot retrigger owner-turn lighting after earlier draws', () => {
    const deck = makeDeck();
    const players = [makePlayer({ godName: 'ZHU', godLevel: 1 }), makePlayer()];
    const refreshed = refreshZhuLightAtOwnerTurn(players, deck, 0, null);
    const shiftedDeck = deck.slice(2);
    const guard = getZhuTopGuard({ players, deck: shiftedDeck, currentTurn: 0, zhuLight: refreshed }, shiftedDeck);

    expect(guard.card.id).toBe('card-2');
    expect(guard.zhuLight).toEqual(refreshed);
    expect(guard.zhuLight.cardIds).not.toContain('card-4');
  });

  it('adds newly lit cards to existing lit cards on retrigger', () => {
    const deck = makeDeck();
    const players = [
      makePlayer({ godName: 'ZHU', godLevel: 2 }),
      makePlayer(),
    ];
    const previous = { ownerIdx: 0, level: 1, cardIds: ['card-5', 'missing-card'], lightNonce: 3 };
    const light = refreshZhuLightAtOwnerTurn(players, deck, 0, previous);
    expect(light).toMatchObject({
      ownerIdx: 0,
      level: 2,
      cardIds: ['card-5', 'card-1', 'card-2', 'card-3'],
      lightNonce: 4,
    });
  });

  it('clears light when Zhu faith is lost', () => {
    const deck = makeDeck();
    const previous = { ownerIdx: 0, level: 1, cardIds: ['card-2'] };
    const players = [
      makePlayer({ godName: null, godLevel: 0 }),
      makePlayer(),
    ];
    expect(reconcileZhuLight(players, deck, previous)).toBeNull();
  });

  it('guards and moves a lit top deck card to the bottom', () => {
    const deck = makeDeck();
    const players = [
      makePlayer({ godName: 'ZHU', godLevel: 3 }),
      makePlayer(),
    ];
    const zhuLight = refreshZhuLightAtOwnerTurn(players, deck, 0, null);
    const guard = getZhuTopGuard({ players, deck, currentTurn: 0, zhuLight }, deck);
    expect(guard.card.id).toBe('card-0');
    expect(moveTopDeckCardToBottom(deck).map(card => card.id)).toEqual(['card-1', 'card-2', 'card-3', 'card-4', 'card-5', 'card-0']);
  });

  it('creates one structured reveal decision for source-specific continuation', () => {
    const deck = makeDeck();
    const players = [makePlayer({ godName: 'ZHU', godLevel: 3 }), makePlayer()];
    const zhuLight = refreshZhuLightAtOwnerTurn(players, deck, 0, null);
    const request = requestZhuReveal({ players, deck, currentTurn: 1, zhuLight }, {
      deck,
      drawerIdx: 1,
      source: ZHU_REVEAL_SOURCE.CTH_REST,
      continuation: { remaining: 2 },
    });
    const abilityData = buildZhuRevealAbilityData(request, { fromRest: true });

    expect(abilityData).toMatchObject({
      drawerIdx: 1,
      fromRest: true,
      zhuDecision: {
        ownerIdx: 0,
        drawerIdx: 1,
        cardId: 'card-0',
        source: ZHU_REVEAL_SOURCE.CTH_REST,
        continuation: { remaining: 2 },
      },
    });
  });

  it('the reveal gateway bypasses normal-deck light during geomagnetic reversal', () => {
    const deck = makeDeck();
    const players = [makePlayer({ godName: 'ZHU', godLevel: 3 })];
    const zhuLight = refreshZhuLightAtOwnerTurn(players, deck, 0, null);
    expect(requestZhuReveal({ players, deck, currentTurn: 0, zhuLight, geomagneticReversalActive: true })).toBeNull();
    expect(requestZhuReveal(
      { players, deck, currentTurn: 0, zhuLight, geomagneticReversalActive: true },
      { source: ZHU_REVEAL_SOURCE.SPHINX, respectGeomagnetic: false },
    )).not.toBeNull();
  });

  it('reports malformed persistent light state during development checks', () => {
    const deck = makeDeck();
    const players = [makePlayer({ godName: 'ZHU', godLevel: 2 })];
    expect(getZhuLightInvariantViolations(players, deck, {
      ownerIdx: 1,
      level: 1,
      cardIds: ['card-1', 'card-1', 'missing-card'],
    })).toEqual([
      'ownerIdx does not match the eligible ZHU owner',
      'level does not match the ZHU owner',
      'cardIds contains duplicates',
      'cardIds contains a card outside the deck',
    ]);
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

  it('hides a lit deck card as soon as its draw travel animation starts', () => {
    const zhuLight = { ownerIdx: 0, level: 3, cardIds: ['card-0'], lightNonce: 7 };
    const card = { id: 'card-0', name: '亮出的牌' };

    expect(getZhuDrawHiddenCardId({ type: 'DRAW_CARD', card }, zhuLight)).toBe('card-0');
    expect(getZhuDrawHiddenCardId({ type: 'DRAW_CARD', card, sourcePile: 'deck' }, zhuLight)).toBe('card-0');
  });

  it('does not hide Zhu deck cards for non-deck or inspection reveals', () => {
    const zhuLight = { ownerIdx: 0, level: 3, cardIds: ['card-0'], lightNonce: 7 };
    const card = { id: 'card-0', name: '亮出的牌' };

    expect(getZhuDrawHiddenCardId({ type: 'DRAW_CARD', card, sourcePile: 'discard' }, zhuLight)).toBeNull();
    expect(getZhuDrawHiddenCardId({ type: 'DRAW_CARD', card: { ...card, effect: 'selfHarm' } }, zhuLight)).toBeNull();
    expect(getZhuDrawHiddenCardId({ type: 'CARD_TRANSFER', card }, zhuLight)).toBeNull();
  });
});
