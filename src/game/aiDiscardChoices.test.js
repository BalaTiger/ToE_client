import { describe, expect, it } from 'vitest';
import {
  chooseAiHandLimitDiscardIndex,
  chooseAiHuntDiscardIndex,
  chooseAiSameAbyssAction,
  getSameAbyssDiscardCount,
  simulateAiDiscardAction,
} from './aiDiscardChoices';
import { createAiObservationState } from './aiPolicy';
import { addDamageLink } from './damageLinks';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from './coreUtils';
import { makeGs, makePlayer, makeZoneCard } from './__tests__/factory';

const life = () => makeZoneCard('B1', 2);
const soul = () => makeZoneCard('B3', 0, { name: '灵魂天平', type: 'soulBalance' });
const knownPlayer = overrides => makePlayer({ roleRevealed: true, ...overrides });
const game = players => makeGs({ players, currentTurn: 0, _isMP: true });
const discard = (hand, indices, extra = {}) => ({
  type: 'discard', cardIndices: indices, cardIds: indices.map(index => hand[index].id), ...extra,
});

describe('AI shared discard decisions', () => {
  it('same-abyss ties allow the legal zero-card discard at full health', () => {
    const gs = game([
      knownPlayer({ hand: Array.from({ length: 5 }, () => makeZoneCard('A1')) }),
      knownPlayer({ hp: 10, hand: Array.from({ length: 5 }, () => makeZoneCard('B2')) }),
    ]);
    gs.abilityData = { actorIdx: 0, targetIdx: 1, discardCount: 0, actorHandCount: 5 };
    const before = structuredClone(gs);
    expect(chooseAiSameAbyssAction(gs, 1, 0)).toMatchObject({
      type: 'discard', cardIndices: [], cardIds: [],
    });
    expect(gs).toEqual(before);
  });

  it('same-abyss recomputes the current counts and includes an incoming source card', () => {
    const gs = game([
      knownPlayer({ hand: [makeZoneCard('A1'), makeZoneCard('A2')] }),
      knownPlayer({ hand: [makeZoneCard('B1'), makeZoneCard('B2'), makeZoneCard('B3')] }),
    ]);
    gs.abilityData = { actorHandCount: 0, discardCount: 99 };
    expect(getSameAbyssDiscardCount(gs, 1, 0)).toBe(1);
    expect(getSameAbyssDiscardCount(gs, 1, 0, { incomingCardCount: 1 })).toBe(0);
    gs.players[0].hand.push(makeZoneCard('C3'));
    expect(getSameAbyssDiscardCount(gs, 1, 0)).toBe(0);
    expect(chooseAiSameAbyssAction(gs, 1, 0)?.cardIndices).toEqual([]);
  });

  it('does not count the incoming abyss card twice once it is already in the source hand', () => {
    const incoming = makeZoneCard('D4');
    const gs = game([
      knownPlayer({ role: ROLE_HUNTER, hand: [incoming] }),
      knownPlayer({ hp: 3, hand: [makeZoneCard('A1'), makeZoneCard('B2')] }),
    ]);
    gs.abilityData = { sameAbyssIncomingCardId: incoming.id, sameAbyssIncomingCount: 1 };
    expect(getSameAbyssDiscardCount(gs, 1, 0)).toBe(1);
    const action = chooseAiSameAbyssAction(gs, 1, 0);
    expect(action).toMatchObject({ type: 'discard', incomingCardCount: 0 });
    expect(action.cardIds).toHaveLength(1);
    expect(getSameAbyssDiscardCount(gs, 1, 0, { incomingCardCount: 1 })).toBe(0);
  });

  it('same-abyss chooses four HP over discarding two lethal life balances', () => {
    const gs = game([
      knownPlayer({ role: ROLE_HUNTER, hand: [] }),
      knownPlayer({ role: ROLE_TREASURE, hp: 5, hand: [life(), life()] }),
      knownPlayer({ role: ROLE_CULTIST, hand: [] }),
    ]);
    expect(chooseAiSameAbyssAction(gs, 1, 0)?.type).toBe('hp');
  });

  it('hand-limit discards a safe duplicate instead of the oldest lethal balance', () => {
    const hand = [life(), makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('B2'), makeZoneCard('C3')];
    const gs = game([
      knownPlayer({ role: ROLE_TREASURE, hp: 3, hand }),
      knownPlayer({ role: ROLE_HUNTER, hand: [] }),
    ]);
    const before = structuredClone(gs);
    const index = chooseAiHandLimitDiscardIndex(gs, 0);
    expect([2, 3]).toContain(index);
    const result = simulateAiDiscardAction(gs, 0, discard(hand, [index]));
    expect(result.players[0]).toMatchObject({ hp: 3, isDead: false });
    expect(result.players[0].hand.map(card => card.id)).toEqual(hand.filter((_, i) => i !== index).map(card => card.id));
    expect(gs).toEqual(before);
  });

  it('soul-balance discard respects faction victory before card retention', () => {
    const hand = [soul(), makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('B2'), makeZoneCard('C3')];
    const gs = game([
      knownPlayer({ role: ROLE_CULTIST, san: 3, hand }),
      knownPlayer({ role: ROLE_HUNTER, hand: [] }),
    ]);
    expect(chooseAiHandLimitDiscardIndex(gs, 0)).toBe(0);
    gs.players[0].role = ROLE_TREASURE;
    gs.players.push(knownPlayer({ role: ROLE_CULTIST }));
    expect(chooseAiHandLimitDiscardIndex(gs, 0)).not.toBe(0);
  });

  it('matches the prey using an ordinary card instead of a suicidal balance', () => {
    const revealed = makeZoneCard('D1');
    const gs = game([
      knownPlayer({ role: ROLE_HUNTER, hp: 3, hand: [life(), makeZoneCard('A1')] }),
      knownPlayer({ role: ROLE_TREASURE, hp: 3, hand: [revealed] }),
      knownPlayer({ role: ROLE_CULTIST, hand: [] }),
    ]);
    expect(chooseAiHuntDiscardIndex(gs, 0, revealed, 1)).toBe(1);
    const lethal = simulateAiDiscardAction(gs, 0, discard(gs.players[0].hand, [0], { type: 'hunt', targetIdx: 1 }));
    expect(lethal.players[0].isDead).toBe(true);
    expect(lethal.players[1].isDead).toBe(true);
    const safe = simulateAiDiscardAction(gs, 0, discard(gs.players[0].hand, [1], { type: 'hunt', targetIdx: 1 }));
    expect(safe.players[0]).toMatchObject({ hp: 3, isDead: false });
    expect(safe.players[1].isDead).toBe(true);
  });

  it('may abandon when its sole matching card kills the hunter without winning', () => {
    const revealed = makeZoneCard('D1');
    const gs = game([
      knownPlayer({ role: ROLE_HUNTER, hp: 3, hand: [life()] }),
      knownPlayer({ role: ROLE_TREASURE, hp: 8, hand: [revealed] }),
    ]);
    expect(chooseAiHuntDiscardIndex(gs, 0, revealed, 1)).toBe(-1);
    expect(chooseAiHuntDiscardIndex(gs, 0, revealed, 1, { allowAbandon: false })).toBe(0);
  });

  it('uses real rope-break losses, including the extra damage to the discarder', () => {
    const hand = [life(), makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('B2'), makeZoneCard('C3')];
    const gs = game([
      knownPlayer({ role: ROLE_TREASURE, hp: 6, hand }),
      knownPlayer({ role: ROLE_HUNTER, hp: 10, hand: [] }),
    ]);
    addDamageLink(gs.players, 0, 1);
    const result = simulateAiDiscardAction(gs, 0, discard(hand, [0]));
    expect(result.players[0]).toMatchObject({ hp: 0, isDead: true });
    expect(result.players[1].hp).toBe(7);
    expect(chooseAiHandLimitDiscardIndex(gs, 0)).not.toBe(0);
  });

  it('finishes the new discard obligation if a rope death empties the source hand', () => {
    const hand = [life(), makeZoneCard('B2')];
    const gs = game([
      knownPlayer({ role: ROLE_HUNTER, hp: 2, hand: [makeZoneCard('A1')] }),
      knownPlayer({ role: ROLE_TREASURE, hp: 10, hand }),
      knownPlayer({ role: ROLE_CULTIST, hp: 10 }),
    ]);
    addDamageLink(gs.players, 0, 1);
    const result = simulateAiDiscardAction(gs, 1, discard(hand, [0], {
      sameAbyss: true, sameAbyssSourceIdx: 0,
    }));
    expect(result.players[0].isDead).toBe(true);
    expect(result.players[1]).toMatchObject({ hp: 4, isDead: false, hand: [] });
  });

  it('resolves legal redirect branches instead of treating unspent damage as free', () => {
    const gs = game([
      knownPlayer({ role: ROLE_HUNTER }),
      knownPlayer({ role: ROLE_TREASURE, hp: 3, etherealizeStacks: 1 }),
      knownPlayer({ role: ROLE_CULTIST }),
    ]);
    const outcome = simulateAiDiscardAction(gs, 1, { type: 'hp' });
    expect(outcome.phase).not.toBe('ETHEREALIZE_DECISION');
    expect(outcome.players[1]).toMatchObject({ hp: 3, etherealizeStacks: 0 });
    expect(outcome.players[0].hp + outcome.players[2].hp).toBe(16);
  });

  it('abandons a hunt when a legal opposing redirect can kill the three-HP hunter', () => {
    const revealed = makeZoneCard('C1');
    const gs = game([
      knownPlayer({ role: ROLE_HUNTER, hp: 3, hand: [makeZoneCard('B1')] }),
      knownPlayer({ role: ROLE_CULTIST, hp: 7, etherealizeStacks: 1, hand: [revealed] }),
      knownPlayer({ role: ROLE_TREASURE, hp: 10 }),
    ]);
    expect(chooseAiHuntDiscardIndex(gs, 0, revealed, 1)).toBe(-1);
  });

  it('still hunts when every possible redirect hits an enemy and the hunter is safe', () => {
    const revealed = makeZoneCard('C1');
    const gs = game([
      knownPlayer({ role: ROLE_TREASURE, hp: 10 }),
      knownPlayer({ role: ROLE_HUNTER, hp: 3, hand: [makeZoneCard('B1'), makeZoneCard('A2')] }),
      knownPlayer({ role: ROLE_TREASURE, hp: 10 }),
      knownPlayer({ role: ROLE_CULTIST, hp: 7, etherealizeStacks: 1, hand: [revealed] }),
    ]);
    gs.currentTurn = 1;
    expect(chooseAiHuntDiscardIndex(gs, 1, revealed, 3)).toBe(0);
  });

  it('does not read a hidden deck to choose between discard candidates', () => {
    const hand = [life(), makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('B2'), makeZoneCard('C3')];
    const gs = game([
      knownPlayer({ role: ROLE_TREASURE, hp: 3, hand }),
      knownPlayer({ role: ROLE_HUNTER }),
    ]);
    gs.deck = [{ id: 'secret-1', isGod: true, godKey: 'SHU' }];
    const first = chooseAiHandLimitDiscardIndex(gs, 0);
    gs.deck = [makeZoneCard('D4')];
    expect(chooseAiHandLimitDiscardIndex(gs, 0)).toBe(first);
    const observation = createAiObservationState(gs, 0);
    expect(observation.deck).toEqual([]);
  });
});
