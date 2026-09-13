import { describe, expect, it } from 'vitest';
import {
  chooseAiPublicCardIndex,
  chooseAiTortoiseKey,
  getTortoiseSelectableKeys,
  simulateAiPublicCardGain,
} from '../aiPublicChoices';
import { getBestCaveDuelCardIndex } from '../caveDuel';
import { chooseAiStoneCardIndex } from '../aiStoneChoice';
import { applyFx } from '../effectEngine';
import { advanceHeadlessGame } from '../headlessSimulator';
import { isMpAiTakeoverRelevant, resolveMpAiTakeoverState } from '../multiplayerAiTakeover';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

function game(hand, role = ROLE_TREASURE) {
  return makeGs({ players: [
    makePlayer({ hand, role }),
    makePlayer({ role: role === ROLE_HUNTER ? ROLE_TREASURE : ROLE_HUNTER, roleRevealed: true }),
    makePlayer({ role: ROLE_CULTIST, roleRevealed: true }),
  ] });
}

describe('public AI choices use successor states', () => {
  it('takes the missing treasure axes despite a harmful printed draw effect', () => {
    const state = game(['A1', 'B2', 'C3'].map(key => makeZoneCard(key)));
    const cards = [
      makeZoneCard('B1', 0, { type: 'selfHealHP', val: 4 }),
      makeZoneCard('D4', 0, { type: 'selfDamageHP', val: 10 }),
      makeGodCard(),
    ];
    const original = structuredClone(state);

    expect(chooseAiPublicCardIndex({ state, actorIdx: 0, cards })).toBe(1);
    const outcome = simulateAiPublicCardGain(structuredClone(state), 0, cards[1]);
    expect(outcome.players[0].hp).toBe(10);
    expect(outcome.players[0].hand).toHaveLength(4);
    expect(state).toEqual(original);
  });

  it('evaluates an additional gain cost supplied by the rule adapter', () => {
    const state = game([], ROLE_HUNTER);
    const cards = [makeGodCard(), makeZoneCard('A1')];
    expect(chooseAiPublicCardIndex({
      state, actorIdx: 0, cards,
      simulateGain: (snapshot, { card }) => {
        simulateAiPublicCardGain(snapshot, 0, card);
        if (card.isGod) {
          snapshot.players[0].hp = 0;
          snapshot.players[0].isDead = true;
        }
        return snapshot;
      },
    })).toBe(1);
    expect(state.players[0].hp).toBe(10);
  });

  it('uses the four revealed matches instead of a zero-card tortoise option', () => {
    const state = game([makeZoneCard('A1')], ROLE_HUNTER);
    const revealedCards = ['B1', 'C1', 'D1', 'D1'].map(key => makeZoneCard(key));
    const original = structuredClone(state);
    expect(chooseAiTortoiseKey({ state, actorIdx: 0, revealedCards })).toBe('1');
    expect(state).toEqual(original);
  });

  it('only selects a legal most-frequent letter or number', () => {
    const state = game(['A1', 'A2', 'B1'].map(key => makeZoneCard(key)), ROLE_HUNTER);
    expect(getTortoiseSelectableKeys(state.players[0].hand)).toEqual(['A', '1']);
    expect(chooseAiTortoiseKey({
      state, actorIdx: 0,
      revealedCards: ['B2', 'B2', 'B2', 'A3'].map(key => makeZoneCard(key)),
    })).toBe('A');
    expect(chooseAiTortoiseKey({ state, actorIdx: 0, selectableKeys: [] })).toBeNull();
  });
});

describe('cave duel AI visibility and comparison', () => {
  function choose(state) {
    return getBestCaveDuelCardIndex(state.players[0].hand, {
      state, actorIdx: 0, opponentIdx: 1,
    });
  }

  it('plays 1 against a public unnumbered card instead of losing with 4', () => {
    const state = game([makeZoneCard('A4'), makeZoneCard('A1')], ROLE_HUNTER);
    state.players[1].hand = [makeGodCard()];
    state.players[1].revealHand = true;
    const original = structuredClone(state);
    expect(choose(state)).toBe(1);
    expect(state).toEqual(original);
  });

  it('uses an unnumbered card to beat a public 4', () => {
    const state = game([makeGodCard(), makeZoneCard('A3')], ROLE_HUNTER);
    state.players[1].hand = [makeZoneCard('B4')];
    state.players[1].revealHand = true;
    expect(choose(state)).toBe(0);
  });

  it('uses remembered cards that remain in the opposing hand', () => {
    const state = game([makeZoneCard('A4'), makeZoneCard('A1')], ROLE_HUNTER);
    const remembered = makeGodCard();
    state.players[1].hand = [remembered];
    state.players[0].peekMemories = { 1: [remembered] };
    expect(choose(state)).toBe(1);
  });

  it('ignores hidden cards, deck order, and a sealed opposing selection', () => {
    const first = game([makeZoneCard('A4'), makeZoneCard('A1')], ROLE_HUNTER);
    first.players[1].hand = [makeGodCard()];
    first.abilityData = { sourceCard: first.players[1].hand[0], sourceCardIndex: 0 };
    first.deck = [makeZoneCard('D4')];
    const second = structuredClone(first);
    second.players[1].hand = [makeZoneCard('B3')];
    second.abilityData.sourceCard = second.players[1].hand[0];
    second.deck = [makeGodCard()];
    expect(choose(first)).toBe(choose(second));
    expect(choose(first)).toBe(0);
  });

  it('ignores stale peek memories and preserves the original hand-only API', () => {
    const state = game([makeZoneCard('A4'), makeZoneCard('A1')], ROLE_HUNTER);
    state.players[0].peekMemories = { 1: [makeGodCard()] };
    state.players[1].hand = [makeZoneCard('B3')];
    expect(choose(state)).toBe(0);
    expect(getBestCaveDuelCardIndex([
      makeZoneCard('A2'), makeGodCard(), makeZoneCard('A4'),
    ])).toBe(2);
    expect(getBestCaveDuelCardIndex([])).toBe(-1);
  });
});

describe('public choice gameplay entry points', () => {
  it('executes the selected missing stone-carving card through applyFx', () => {
    const state = game(['A1', 'B2', 'C3'].map(key => makeZoneCard(key)));
    const missing = makeZoneCard('D4', 0, { type: 'selfDamageHP', val: 10 });
    state.deck = [makeZoneCard('B1'), missing, makeGodCard()];
    const result = applyFx({ type: 'decipherStoneCarving', name: '解读石刻' },
      0, null, state.players, state.deck, state.discard, state, false, [], true);
    expect(result.P[0].hand).toContainEqual(missing);
    expect(result.P[0].hp).toBe(10);
  });

  it('executes the tortoise policy through applyFx', () => {
    const state = game([makeZoneCard('A1')], ROLE_HUNTER);
    state.deck = ['B1', 'C1', 'D1', 'D1'].map(key => makeZoneCard(key));
    const result = applyFx({ type: 'revealTopCards', val: 4, name: '灵龟卜祝' },
      0, null, state.players, state.deck, state.discard, state, false, [], true);
    expect(result.P[0].hand).toHaveLength(5);
    expect(result.Disc).toHaveLength(0);
  });

  it('accounts for actual stone-carving SAN loss and opposing cultist victory', () => {
    const state = game([], ROLE_HUNTER);
    state.players[0].san = 1;
    expect(chooseAiStoneCardIndex({ state, actorIdx: 0,
      cards: [makeGodCard(), makeZoneCard('A1')],
    })).toBe(1);
    expect(state.players[0].san).toBe(1);
  });

  it('resumes every first-come picker in headless play', () => {
    const state = { ...game(['A1', 'B2', 'C3'].map(key => makeZoneCard(key))),
      _headless: true, _isMP: true, phase: 'FIRST_COME_PICK_SELECT',
      abilityData: { type: 'firstComePick', pickOrder: [0, 1], pickIndex: 0,
        revealedCards: [makeZoneCard('B1'), makeZoneCard('D4')] },
    };
    const first = advanceHeadlessGame(state);
    expect(first.status).toBe('advanced');
    expect(first.state.players[0].hand.some(card => card.key === 'D4')).toBe(true);
    expect(first.state.abilityData.pickIndex).toBe(1);
    const second = advanceHeadlessGame(first.state);
    expect(second.state.phase).toBe('AI_TURN');
    expect(second.state.players[1].hand).toHaveLength(1);
  });

  it('resumes the tortoise choice and paused cave duel in headless play', () => {
    const state = { ...game([makeZoneCard('A1')], ROLE_HUNTER),
      _headless: true, _isMP: true, phase: 'TORTOISE_ORACLE_SELECT',
      abilityData: { type: 'tortoiseOracleSelect', playerIndex: 0, selectableKeys: ['A', '1'],
        revealedCards: ['B1', 'C1', 'D1', 'D1'].map(key => makeZoneCard(key)) },
    };
    const selected = advanceHeadlessGame(state).state;
    expect(selected.players[0].hand).toHaveLength(5);
    expect(selected.phase).toBe('AI_TURN');
    selected.phase = 'CAVE_DUEL_WAIT_REVEAL';
    selected.players[0].hand = [makeZoneCard('A4'), makeZoneCard('A1')];
    const opponentGod = makeGodCard();
    selected.players[1].hand = [opponentGod];
    selected.players[1].revealHand = true;
    selected.abilityData = { caveDuelSource: 0, caveDuelTarget: 1 };
    const duel = advanceHeadlessGame(selected).state;
    expect(duel.players[0].hand).toContainEqual(opponentGod);
    expect(duel.phase).toBe('AI_TURN');
  });

  it('allows a disconnected first-come picker outside the active turn to choose', () => {
    const state = { ...game([], ROLE_HUNTER), _isMP: true, phase: 'FIRST_COME_PICK_SELECT',
      abilityData: { type: 'firstComePick', pickOrder: [1, 0], pickIndex: 0,
        revealedCards: [makeZoneCard('B1'), makeZoneCard('D4')] },
    };
    state.players[1].hand = ['A1', 'B2', 'C3'].map(key => makeZoneCard(key));
    expect(isMpAiTakeoverRelevant(state, 0)).toBe(false);
    expect(isMpAiTakeoverRelevant(state, 1)).toBe(true);
    const result = resolveMpAiTakeoverState(state, 1, { getHandLimitForPlayer: () => 4 });
    expect(result.players[1].hand.some(card => card.key === 'D4')).toBe(true);
    expect(result.abilityData.pickIndex).toBe(1);
  });

  it('keeps a stone-carving SAN interruption pending in headless and takeover play', () => {
    const state = { ...game([], ROLE_HUNTER), _headless: true, _isMP: true,
      phase: 'DECIPHER_STONE_CARVING', currentTurn: 1,
      abilityData: { type: 'decipherStoneCarving', playerIndex: 0, revealedCards: [makeGodCard()] },
    };
    state.players[0].etherealizeStacks = 1;
    const headless = advanceHeadlessGame(state).state;
    expect(headless.phase).toBe('ETHEREALIZE_DECISION');
    expect(headless.players[0].san).toBe(10);
    expect(headless.players[0].hand).toHaveLength(1);
    const takeover = resolveMpAiTakeoverState(state, 0, { getHandLimitForPlayer: () => 4 });
    expect(takeover.phase).toBe('ETHEREALIZE_DECISION');
    expect(takeover.currentTurn).toBe(1);
  });
});
