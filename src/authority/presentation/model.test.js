import { describe, expect, it } from 'vitest';
import { createAuthorityPresentation, UNKNOWN_ROLE_INFO } from './model.js';

function fixture() {
  return { version: 2, matchId: 'm', revision: 8, viewerSeat: 2, currentSeat: 0, phase: 'ACTION', turn: 3,
    expansionKey: '地神的潜影', deckCount: 42, inspectionDeckCount: 7, discard: [], inspectionDiscard: [],
    turnFlags: { skillUsed: true, abandonedTargets: [1] },
    players: [
      { seat: 0, name: 'A', hp: 9, san: 8, handCount: 3, role: 'hidden-role', hand: [{ id: 'secret-card', name: 'secret' }],
        publicTokens: [{ id: 'token', name: '黑暗子嗣', isBlackGoatYoung: true }] },
      { seat: 1, name: 'B', hp: 7, san: 6, handCount: 1, roleRevealed: true, role: '追猎者', revealHand: true,
        hand: [{ id: 'public-card', name: '公开牌' }], poisonStacks: 2 },
      { seat: 2, name: 'You', hp: 5, san: 4, handCount: 2, role: '寻宝者', hand: [{ id: 'opaque-0', name: 'first' }, { id: 'opaque-1', name: 'second' }] },
    ], decision: { id: 'd8', deadline: 20000, actions: [{ type: 'swap.selectTarget', targetSeats: [0, 1] }] },
    events: [{ id: 'e', type: 'statChanged', seat: 0, fromHp: 10, hp: 9, fromSan: 8, san: 8 }], peeks: [],
  };
}

describe('authority recipient presentation', () => {
  it('rotates safe reciprocal link endpoints and removes private relationship fields', () => {
    const source = fixture();
    source.players[0].damageLinks = [{ id: 'public-link:0:2:0', partner: 2, active: true, seed: 'secret' }];
    source.players[2].damageLinks = [{ id: 'public-link:0:2:0', partner: 0, active: true, seed: 'secret' }];
    const model = createAuthorityPresentation(source);
    expect(model.players[0].damageLinks).toEqual([{ id: 'public-link:0:2:0', partner: 1, active: true }]);
    expect(model.players[1].damageLinks).toEqual([{ id: 'public-link:0:2:0', partner: 0, active: true }]);
    expect(JSON.stringify(model.players[0].damageLinks)).not.toContain('secret');
  });
  it('rotates seats for display and provides the exact inverse without changing card order', () => {
    const source = fixture(), before = structuredClone(source), model = createAuthorityPresentation(source);
    expect(model.players.map(player => player.seat)).toEqual([2, 0, 1]);
    expect(model.players.map(player => player.id)).toEqual([0, 1, 2]);
    expect(model.toDisplaySeat(0)).toBe(1);
    expect(model.toServerSeat(1)).toBe(0);
    expect(model.toServerSeat(99)).toBeNull();
    expect(model.currentTurn).toBe(1);
    expect(model.me.hand.map(card => card.id)).toEqual(['opaque-0', 'opaque-1']);
    expect(model.displayStats).toEqual([{ hp: 5, san: 4 }, { hp: 9, san: 8 }, { hp: 7, san: 6 }]);
    expect(model.actions[0].targetSeats).toEqual([1, 2]);
    expect(model.events[0].seat).toBe(1);
    expect(model.gs.huntAbandoned).toEqual([2]);
    expect(source).toEqual(before);
  });

  it('renders unknown cards as local backs, keeps public tokens, and never invents a hidden role', () => {
    const model = createAuthorityPresentation(fixture()), opponent = model.players[1];
    expect(opponent.hand).toHaveLength(3);
    expect(opponent.hand.filter(card => card._back)).toHaveLength(2);
    expect(opponent.hand.at(-1).id).toBe('token');
    expect(opponent.role).toBeUndefined();
    expect(opponent.roleKnown).toBe(false);
    expect(opponent.roleInfo).toEqual(UNKNOWN_ROLE_INFO);
    expect(JSON.stringify(model)).not.toContain('secret-card');
    expect(JSON.stringify(model)).not.toContain('hidden-role');
    expect(model.players[2].hand[0].id).toBe('public-card');
    expect(model.players[2].poisonStacks).toBe(2);
  });

  it('uses explicit pile counts and creates only allowlisted display context', () => {
    const source = fixture();
    Object.assign(source, { abilityData: { secret: 'raw-ability' }, deck: [{ name: 'raw-deck' }], random: { seed: 'raw-seed' }, log: ['raw-log'],
      hunt: { targetSeat: 0, revealedCard: { id: 'h', name: 'revealed', secret: 'raw-card' } },
      gameOver: { winner: '寻宝者', winnerIdx: 2, winnerIdx2: 0, reason: 'won' } });
    const model = createAuthorityPresentation(source, { offline: true });
    expect(model.gs.deckCount).toBe(42);
    expect(model.gs.inspectionDeckCount).toBe(7);
    expect(model.gs.deck).toBeUndefined();
    expect(model.gs.inspectionDeck).toBeUndefined();
    expect(model.gs._isMP).toBe(false);
    expect(model.gs.abilityData).toEqual({ huntTi: 1, revCard: { id: 'h', name: 'revealed' } });
    expect(model.gs.gameOver).toEqual({ winner: '寻宝者', winnerIdx: 0, winnerIdx2: 1, reason: 'won' });
    for (const forbidden of ['raw-ability', 'raw-deck', 'raw-seed', 'raw-log', 'raw-card']) expect(JSON.stringify(model)).not.toContain(forbidden);
    expect(Object.isFrozen(model.gs.players[0].hand)).toBe(true);
  });

  it('drops private presentation on an equal-revision observer projection', () => {
    const source = fixture();
    source.peeks = [{ targetSeat: 0, cards: [{ id: 'peek-secret' }] }];
    source.litDeck = [{ deckIndex: 0, card: { id: 'lit-secret' } }];
    expect(createAuthorityPresentation(source).peeks).toHaveLength(1);
    const observer = createAuthorityPresentation({ ...source, viewerSeat: null });
    expect(observer.me).toBeNull();
    expect(observer.players.map(player => player.seat)).toEqual([0, 1, 2]);
    expect(observer.actions).toEqual([]);
    expect(observer.peeks).toEqual([]);
    expect(observer.litDeck).toEqual([]);
    expect(JSON.stringify(observer)).not.toContain('opaque-0');
    expect(observer.players[2].hand.every(card => card._back)).toBe(true);
  });

  it('never reveals the blind draw face and exposes private reveals only to its current decision', () => {
    const source = fixture();
    source.draw = { owner: 2, hidden: true, card: { id: 'blind-secret' } };
    source.privateReveals = [{ id: 'private-stone' }];
    const model = createAuthorityPresentation(source);
    expect(model.draw).toEqual({ owner: 0, forcedKeep: false, hidden: true });
    expect(model.gs.drawReveal.card._back).toBe(true);
    expect(model.privateReveals).toEqual([]);
    expect(JSON.stringify(model)).not.toContain('blind-secret');
    expect(JSON.stringify(model)).not.toContain('private-stone');
  });
});
