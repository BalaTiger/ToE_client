import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
import { FIXED_ZONE_CARD_VARIANTS_BY_KEY, createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../src/constants/card.js';

const secret = 'HAND-LIMIT-PRIVATE-CANARY';
function card(type, id) {
  const [key, variants] = Object.entries(FIXED_ZONE_CARD_VARIANTS_BY_KEY).find(([, cards]) => cards.some(item => item.type === type));
  return { ...variants.find(item => item.type === type), id, key, letter: key[0], number: Number(key[1]), isZone: true };
}
function fixture(discarded) {
  return createPrivateMatch({ id: 'hand-limit', seed: 37, now: 0, state: {
    _isMP: true, _intentEngine: true, currentTurn: 0, turn: 1, _turnKey: 1, phase: 'DISCARD_PHASE',
    players: ['邪祀者', '追猎者', '寻宝者'].map((role, id) => ({ id, role, name: `P${id}`, hp: 9, san: 10,
      isDead: false, hand: id === 0 ? [...Array.from({ length: 4 }, (_, index) => card('selfHealHP', `${secret}-${index}`)), ...discarded] : [],
      godZone: [], zoneCards: [], peekMemories: {} })),
    deck: [card('selfHealHP', 'future'), card('selfHealHP', secret)], discard: [],
    inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: {},
  } });
}
function command(match, count) {
  return { version: 2, matchId: match.id, revision: match.revision, decisionId: match.decision.id,
    actionId: 'discard-once', type: 'turn.discard', payload: { cardIndices: Array.from({ length: count }, (_, index) => 4 + index) } };
}
function apply(match, request) {
  return resolveCommand(match, { permission: 'player', seat: 0 }, request, { now: 1, actions: migratedActions });
}
function projection(match, seat) {
  return projectMatch(match, seat === null ? { permission: 'observer' } : { permission: 'player', seat },
    { actions: migratedActions, handleForCard: (_seat, id) => `opaque-${id}` });
}

test('hand-limit discard commits only the removed cards, destroys public tokens and replays no income on retry', () => {
  const moved = [card('selfHealHP', 'ordinary'), { ...createBlackGoatYoungCard(), id: 'goat' },
    { ...createTsathogguaSlimeCard(), id: 'slime' }];
  const start = fixture(moved), saved = structuredClone(start), request = command(start, moved.length);
  const { match: next } = apply(start, request);
  assert.deepEqual(start, saved);
  assert.equal(next.random.draws, 0);
  assert.equal(next.state.players[0].hand.length, 4);
  assert.deepEqual(next.state.discard.map(item => item.id), ['ordinary']);
  const physical = [...next.state.deck, ...next.state.discard, ...next.state.players.flatMap(player => player.hand)];
  assert.equal(physical.filter(item => item.id === 'ordinary').length, 1);
  assert.equal(physical.some(item => ['goat', 'slime'].includes(item.id)), false);
  for (const seat of [0, 1, null]) {
    const view = projection(next, seat), receipts = view.events.filter(event => event.type === 'cardsDiscarded' && event.kind === 'handLimit');
    assert.equal(receipts.length, 1);
    assert.deepEqual(receipts[0].discards.map(item => [item.card.name, item.destination]),
      moved.toReversed().map(item => [item.name, item.id === 'ordinary' ? 'discard' : 'destroyed']));
    assert.ok(receipts[0].discards.every(item => item.card.id.startsWith('opaque-')));
    const beforeTurn = view.events.indexOf(receipts[0]);
    assert.ok(view.events.findIndex(event => event.type === 'turnStarted') > beforeTurn);
    assert.equal(JSON.stringify(receipts).includes(secret), false);
  }
  const retry = apply(next, request);
  assert.equal(retry.acknowledgement.duplicate, true);
  assert.deepEqual(retry.match, next);
});

test('discarding a life balance commits its public move before its actual HP loss and the next turn draw', () => {
  const start = fixture([card('lifeBalance', 'balance')]), next = apply(start, command(start, 1)).match;
  assert.equal(next.state.players[0].hp, 6);
  assert.equal(next.random.draws, 0);
  assert.equal(next.state.discard.filter(item => item.id === 'balance').length, 1);
  for (const seat of [0, 1, null]) {
    const events = projection(next, seat).events;
    const receipt = events.findIndex(event => event.type === 'cardsDiscarded' && event.kind === 'handLimit');
    const damage = events.findIndex(event => event.kind === 'HP_LOSS');
    const turn = events.findIndex(event => event.type === 'turnStarted');
    assert.ok(receipt >= 0 && damage > receipt && turn > damage);
    assert.equal(events[damage].fromHp, 9); assert.equal(events[damage].hp, 6);
  }
});

for (const destroyed of [false, true]) {
  test(`torch discard commits its actual ${destroyed ? 'token destruction' : 'balance card discard'} before consequences`, () => {
    const moved = destroyed ? { ...createBlackGoatYoungCard(), id: 'torch-goat' } : card('lifeBalance', 'torch-balance');
    const start = fixture([moved]); start.state.phase = 'IGNITE_TORCH_DISCARD';
    start.state.abilityData = { playerIndex: 0 };
    const saved = structuredClone(start), request = { ...command(start, 1), type: 'torch.discard', payload: { cardIndex: 4 } };
    const next = apply(start, request).match;
    assert.deepEqual(start, saved);
    assert.equal(next.random.draws, 0);
    assert.equal(next.state.players[0].hand.length, 4);
    assert.equal(next.state.discard.some(item => item.id === moved.id), !destroyed);
    assert.equal(next.state.players[0].hp, destroyed ? 9 : 6);
    for (const seat of [0, 1, null]) {
      const events = projection(next, seat).events;
      const receipt = events.findIndex(event => event.type === 'cardsDiscarded' && event.kind === 'torch');
      assert.ok(receipt >= 0);
      assert.deepEqual(events[receipt].discards.map(item => [item.seat, item.card.id, item.destination]),
        [[0, `opaque-${moved.id}`, destroyed ? 'destroyed' : 'discard']]);
      if (!destroyed) assert.ok(events.findIndex(event => event.kind === 'HP_LOSS') > receipt, JSON.stringify(events));
      assert.equal(JSON.stringify(events[receipt]).includes(secret), false);
    }
    assert.equal(apply(next, request).acknowledgement.duplicate, true);
  });
}

for (const choice of ['balanceDiscard', 'derivedDiscard', 'damage']) {
  test(`same-abyss existing canonical path preserves its actual ${choice} presentation`, () => {
    const held = choice === 'derivedDiscard' ? { ...createBlackGoatYoungCard(), id: 'abyss-goat' } : card('lifeBalance', 'abyss-balance');
    const start = fixture([]); start.state.currentTurn = 1; start.state.phase = 'SAME_ABYSS_SELECT';
    start.state.players[0].hand = [held]; start.state.abilityData = { actorIdx: 1, targetIdx: 0, _turnOwner: 1 };
    const saved = structuredClone(start), request = { ...command(start, 0), type: 'sameAbyss.choose',
      payload: { choice: choice === 'damage' ? 'damage' : 'discard' } };
    const next = apply(start, request).match;
    assert.deepEqual(start, saved);
    assert.equal(next.random.draws, 0);
    assert.equal(next.state.players[0].hp, choice === 'damage' ? 5 : choice === 'balanceDiscard' ? 6 : 9);
    assert.equal(next.state.players[0].hand.length, choice === 'damage' ? 1 : 0);
    assert.equal(next.state.discard.some(item => item.id === held.id), choice === 'balanceDiscard');
    for (const seat of [0, 1, null]) {
      const events = projection(next, seat).events;
      const receipt = events.findIndex(event => event.type === 'cardsDiscarded' && event.kind === 'forcedRandomDiscard');
      if (choice === 'damage') assert.equal(receipt, -1);
      else {
        assert.ok(receipt >= 0);
        assert.deepEqual(events[receipt].discards.map(item => [item.card.id, item.destination]),
          [[`opaque-${held.id}`, choice === 'derivedDiscard' ? 'destroyed' : 'discard']]);
      }
      if (choice !== 'derivedDiscard') assert.ok(events.findIndex(event => event.kind === 'HP_LOSS') > receipt);
    }
  });
}

test('albino creature exposes its actual held fire card and sampled target before HP/SAN without moving the card', () => {
  const fire = card('igniteTorch', 'albino-fire'), start = fixture([]);
  start.state.phase = 'ALBINO_CREATURE_SELECT_CARD'; start.state.players[0].hand = [fire];
  start.state.abilityData = { playerIndex: 0, fireCardIds: [fire.id] };
  const saved = structuredClone(start), request = { ...command(start, 0), type: 'albino.reveal', payload: { cardIndex: 0 } };
  const next = apply(start, request).match;
  assert.deepEqual(start, saved);
  assert.equal(next.random.draws, 1);
  assert.deepEqual(next.state.players[0].hand, [fire]);
  assert.equal(next.state.discard.some(item => item.id === fire.id), false);
  for (const seat of [0, 1, null]) {
    const events = projection(next, seat).events;
    const reveal = events.findIndex(event => event.type === 'cardRevealed' && event.reason === 'albinoCreature');
    const target = events.findIndex(event => event.type === 'targetSelected' && event.reason === 'albinoCreature');
    const losses = events.flatMap((event, index) => event.type === 'statChanged' ? [index] : []);
    assert.ok(reveal >= 0 && target > reveal && losses.length === 2 && losses.every(index => index > target));
    assert.equal(events[reveal].card.id, `opaque-${fire.id}`);
    assert.ok(losses.every(index => events[index].seat === events[target].targetSeat));
    assert.equal(next.state.players[events[target].targetSeat].hp, 7);
    assert.equal(next.state.players[events[target].targetSeat].san, 8);
    assert.equal(JSON.stringify(events).includes(secret), false);
  }
  assert.equal(apply(next, request).acknowledgement.duplicate, true);
});
