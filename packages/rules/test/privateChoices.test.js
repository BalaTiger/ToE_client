import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
const card = (id, number) => ({ id, name: id, number, key: `A${number}`, letter: 'A', isZone: true, type: 'selfHealHP', val: 1 });
function initial(phase, abilityData) {
  return createPrivateMatch({ id: 'private', seed: 16, now: 0, state: {
    _isMP: true, _intentEngine: true, currentTurn: 0, phase, turn: 1, _turnKey: 1, abilityData,
    players: ['寻宝者', '追猎者', '邪祀者'].map((role, id) => ({ id, role, name: `P${id}`, hp: 10, san: 10,
      isDead: false, hand: [card(`own-${id}-1`, 1), card(`own-${id}-4`, 4)], godZone: [], zoneCards: [], peekMemories: {} })),
    deck: [card('deck-hidden', 2)], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [],
  } });
}
const wire = (match, type, payload, actionId = `a${match.revision}`) => ({
  version: 2, matchId: match.id, revision: match.revision, decisionId: match.decision.id, actionId, type, payload });
const run = (match, seat, command) => resolveCommand(match, { permission: 'player', seat }, command,
  { now: 1, actions: migratedActions });
const act = (match, seat, type, payload) => run(match, seat, wire(match, type, payload)).match;
const view = (match, seat) => projectMatch(match, seat === null ? { permission: 'observer' } : { permission: 'player', seat },
  { actions: migratedActions, handleForCard: (_seat, id) => `opaque:${id}` });

test('stone exposes privately and validates a complete unique permutation before applying exact top/bottom ordering', () => {
  const cards = [card('stone-a', 1), card('stone-b', 2), card('stone-c', 3), card('stone-d', 4)];
  const start = initial('DECIPHER_STONE_CARVING', { playerIndex: 1, revealedCards: cards });
  assert.equal(view(start, 1).privateReveals.length, 4);
  for (const seat of [0, 2, null]) assert.equal(view(start, seat).privateReveals, undefined);
  for (const payload of [
    { handIndex: 0, topIndices: [1, 1], bottomIndices: [2] },
    { handIndex: 0, topIndices: [1], bottomIndices: [8, 3] },
    { handIndex: 0, topIndices: [1], bottomIndices: [] },
  ]) assert.throws(() => act(start, 1, 'stone.arrange', payload), /illegal_action/);
  const next = act(start, 1, 'stone.arrange', { handIndex: 1, topIndices: [0, 3], bottomIndices: [2] });
  assert.equal(next.state.players[1].hand.at(-1).id, 'stone-b');
  assert.deepEqual(next.state.deck.map(c => c.id), ['stone-d', 'stone-a', 'deck-hidden', 'stone-c']);
  assert.equal(view(next, 0).privateReveals, undefined);
});

for (const firstSeat of [0, 1]) test(`sealed cave duel accepts seat ${firstSeat} first, hides its choice and resolves once`, () => {
  const start = initial('CAVE_DUEL_SELECT_TARGET', { caveDuelSource: 0, caveDuelTargets: [1, 2] });
  const selected = act(start, 0, 'caveDuel.selectTarget', { targetSeat: 1 });
  assert.equal(selected.state.phase, 'CAVE_DUEL_SELECT_CARD');
  const first = wire(selected, 'caveDuel.commit', { cardIndex: firstSeat === 0 ? 1 : 0 }, 'first');
  const second = wire(selected, 'caveDuel.commit', { cardIndex: firstSeat === 0 ? 0 : 1 }, 'second');
  const waiting = run(selected, firstSeat, first).match;
  assert.deepEqual(waiting.decision, selected.decision);
  assert.equal(view(waiting, firstSeat).duel.lockedCardIndex, first.payload.cardIndex);
  for (const seat of [1 - firstSeat, 2, null]) {
    assert.equal(view(waiting, seat).duel.lockedCardIndex, undefined);
    assert.equal(JSON.stringify(view(waiting, seat)).includes('choices'), false);
    assert.deepEqual(view(waiting, seat).events, []);
  }
  assert.throws(() => act(waiting, firstSeat, 'caveDuel.commit', { cardIndex: 0 }), /not_your_decision/);
  const completed = run(waiting, 1 - firstSeat, second).match;
  assert.equal(completed.state._sealedDuel, null); assert.equal(completed.state.phase, 'ACTION');
  assert.equal(completed.state.players[0].hand.length, 3); assert.equal(completed.state.players[1].hand.length, 1);
  const reveals = view(completed, null).events.filter(event => event.type === 'caveDuelRevealed');
  assert.equal(reveals.length, 1);
  assert.equal(reveals[0].sourceCard.name, 'own-0-4');
  assert.equal(reveals[0].targetCard.name, 'own-1-1');
  assert.equal(run(completed, 1 - firstSeat, second).acknowledgement.duplicate, true);
  assert.equal(completed.publicEvents.filter(event => event.type === 'caveDuelRevealed').length, 1);
});

test('peek uses one server random choice, persists only its scoped grant and revokes at the next decision', () => {
  const start = initial('PEEK_HAND_SELECT_TARGET', { peekHandSource: 0, peekHandTargets: [1] });
  assert.throws(() => act(start, 0, 'peek.selectTarget', { targetSeat: 2 }), /illegal_action/);
  assert.throws(() => act(start, 1, 'peek.selectTarget', { targetSeat: 1 }), /not_your_decision/);
  const command = wire(start, 'peek.selectTarget', { targetSeat: 1 });
  const next = run(start, 0, command).match;
  assert.equal(next.random.draws, 1); assert.equal(view(next, 0).peeks.length, 1);
  for (const seat of [1, 2, null]) assert.deepEqual(view(next, seat).peeks, []);
  assert.equal(view(next, 0).players[1].hand, undefined);
  assert.equal(run(next, 0, command).acknowledgement.duplicate, true);
  const advanced = act(next, 0, 'turn.end', {});
  assert.deepEqual(view(advanced, 0).peeks, []);
  assert.equal(advanced.grants.length, 0);
});
