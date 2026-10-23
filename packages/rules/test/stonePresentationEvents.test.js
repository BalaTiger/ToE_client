import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
import { resolvePublicChoiceState } from '../src/game/publicChoiceResolution.js';
import { getTreasureDeclarationWin } from '../src/game/victory.js';

const card = (id, number) => ({ id, name: `私有石刻-${id}`, number, key: `A${number}`, letter: 'A', isZone: true,
  type: 'selfHealHP', val: 1, rawSecret: 'never-serialize-this', privateGraph: { hand: ['never-serialize-this'] } });
function fixture({ god = false, san = 10 } = {}) {
  const cards = [card('raw-stone-a', 1), card('raw-stone-b', 2), card('raw-stone-c', 3)];
  if (god) cards[1] = { ...cards[1], isZone: false, isGod: true, godKey: 'CTH', name: '私有邪神牌' };
  return createPrivateMatch({ id: 'stone-move', seed: 16, now: 0, state: {
    _isMP: true, _intentEngine: true, currentTurn: 0, phase: 'DECIPHER_STONE_CARVING', turn: 1, _turnKey: 1,
    abilityData: { playerIndex: 1, revealedCards: cards },
    players: ['寻宝者', '追猎者', '邪祀者'].map((role, id) => ({ id, role, name: `P${id}`, hp: 10, san: id === 1 ? san : 10,
      isDead: false, hand: [card(`raw-own-${id}`, 4)], godZone: [], zoneCards: [], peekMemories: {} })),
    deck: [card('raw-hidden-deck', 4)], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [],
  } });
}
const command = (match, payload) => ({ version: 2, matchId: match.id, revision: match.revision,
  decisionId: match.decision.id, actionId: 'arrange-once', type: 'stone.arrange', payload });
const run = (match, wire, actions = migratedActions) => resolveCommand(match, { permission: 'player', seat: 1 }, wire, { now: 1, actions });
const handleForCard = (seat, id) => createHmac('sha256', 'test-only-key').update(`${seat}:${id}`).digest('hex');
const projected = (match, seat) => projectMatch(match, seat === null ? { permission: 'observer' } : { permission: 'player', seat },
  { actions: migratedActions, handleForCard });
const oldActions = { ...migratedActions, 'stone.arrange': { ...migratedActions['stone.arrange'], apply: (state, seat, payload) => {
  const next = resolvePublicChoiceState(state, payload);
  const win = next.phase === 'ACTION' ? getTreasureDeclarationWin(next.players, seat) : null;
  if (win) { next.players[seat].roleRevealed = true; next.gameOver = win; }
  return next;
} } };

test('stone actual command emits one recipient-scoped committed move, keeping all other views ignorant of faces and top/bottom distribution', () => {
  const start = fixture(), payload = { handIndex: 1, topIndices: [2], bottomIndices: [0] };
  const wire = command(start, payload), next = run(start, wire).match;
  const raw = next.publicEvents.find(event => event.type === 'stoneCardsArranged');
  assert.ok(raw, 'actual stone.arrange needs a move receipt');
  assert.equal(raw.keptCard.id, 'raw-stone-b'); assert.equal(raw.handCount, 2); assert.equal(raw.returnedCount, 2);
  assert.deepEqual(raw.topCards.map(item => item.id), ['raw-stone-c']);
  assert.deepEqual(raw.bottomCards.map(item => item.id), ['raw-stone-a']);
  assert.equal(next.state.players[1].hand.at(-1).id, raw.keptCard.id);
  assert.deepEqual(next.state.deck.map(item => item.id), ['raw-stone-c', 'raw-hidden-deck', 'raw-stone-a']);
  const actor = projected(next, 1), receipt = actor.events.find(event => event.type === 'stoneCardsArranged');
  assert.equal(receipt.keptCard.id, handleForCard(1, 'raw-stone-b'));
  assert.equal(receipt.topCards[0].id, handleForCard(1, 'raw-stone-c'));
  assert.equal(receipt.bottomCards[0].id, handleForCard(1, 'raw-stone-a'));
  assert.equal(actor.privateReveals, undefined, 'the temporary decision grant is gone after commit');
  for (const seat of [0, 2, null]) {
    const other = projected(next, seat), event = other.events.find(item => item.type === 'stoneCardsArranged');
    assert.deepEqual(event.keptCard, { _back: true }); assert.equal(event.returnedCount, 2);
    assert.equal(Object.hasOwn(event, 'topCards'), false); assert.equal(Object.hasOwn(event, 'bottomCards'), false);
    assert.equal(other.privateReveals, undefined);
    assert.equal(JSON.stringify(other).includes('私有石刻-raw-stone'), false);
  }
  for (const seat of [0, 1, 2, null]) {
    const json = JSON.stringify(projected(next, seat));
    assert.equal(json.includes('never-serialize-this'), false);
    assert.equal(json.includes('"id":"raw-'), false);
    for (const key of ['deck', 'random', 'abilityData', 'log']) assert.equal(Object.hasOwn(projected(next, seat), key), false);
  }
  const replay = run(next, wire);
  assert.equal(replay.acknowledgement.duplicate, true);
  assert.deepEqual(replay.match, next);
});

test('stone receipt follows exact canonical return ordering for either end without changing old state, clocks, or RNG', () => {
  const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const god of [false, true]) for (const indices of permutations) for (const split of [0, 1, 2]) {
    const start = fixture({ god }), payload = { handIndex: indices[0], topIndices: indices.slice(1, 1 + split), bottomIndices: indices.slice(1 + split) };
    const wire = command(start, payload), current = run(start, wire).match, old = run(start, wire, oldActions).match;
    assert.deepEqual(current.state, old.state); assert.deepEqual(current.random, old.random);
    assert.deepEqual(current.decision, old.decision); assert.deepEqual(current.turnClock, old.turnClock);
    const receipt = current.publicEvents.find(event => event.type === 'stoneCardsArranged');
    assert.deepEqual(receipt.topCards.map(item => item.id), [...payload.topIndices].reverse().map(i => start.state.abilityData.revealedCards[i].id));
    assert.deepEqual(receipt.bottomCards.map(item => item.id), [...payload.bottomIndices].reverse().map(i => start.state.abilityData.revealedCards[i].id));
    assert.deepEqual(current.publicEvents.filter(event => event.type !== 'stoneCardsArranged').map(({ id, ...event }) => event),
      old.publicEvents.map(({ id, ...event }) => event));
  }
});

test('stone god income is receipted before its SAN cost and retains the original final result', () => {
  const start = fixture({ god: true, san: 1 }), wire = command(start, { handIndex: 1, topIndices: [0], bottomIndices: [2] });
  const next = run(start, wire).match, old = run(start, wire, oldActions).match;
  assert.deepEqual(next.state, old.state); assert.deepEqual(next.random, old.random);
  const receipt = next.publicEvents.findIndex(event => event.type === 'stoneCardsArranged');
  const stat = next.publicEvents.findIndex(event => event.type === 'statChanged' && event.seat === 1);
  assert.ok(receipt >= 0 && stat > receipt, 'actual income/move is presented before the god SAN cost');
  assert.equal(next.publicEvents[receipt].handCount, 2);
});
