import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { advanceAutomaticRules } from '../src/authority/automatic.js';
import { initializeRules } from '../src/initialization.js';
const card = id => ({ id, name: id, isZone: true, type: 'selfHealHP', val: 1, key: 'A1', letter: 'A', number: 1 });
function initial(extra = {}) {
  return createPrivateMatch({ id: 'turn', seed: 12, now: 0, state: { _isMP: true, _intentEngine: true,
    phase: 'ACTION', currentTurn: 0, turn: 1, _turnKey: 1,
    players: ['寻宝者', '追猎者', '邪祀者'].map((role, id) => ({ id, role, name: `P${id}`, hp: 7, san: 10,
      isDead: false, hand: [], godZone: [], zoneCards: [], peekMemories: {} })),
    deck: Array.from({ length: 8 }, (_item, index) => card(`deck-${index}`)), discard: [],
    inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: {}, ...extra,
  } });
}
const act = (match, seat, type, payload = {}) => resolveCommand(match, { permission: 'player', seat }, {
  version: 2, matchId: match.id, revision: match.revision, decisionId: match.decision.id,
  actionId: `intent:${match.revision}`, type, payload,
}, { now: 1, actions: migratedActions }).match;

test('end turn advances canonical owner and next draw without an animation completion command', () => {
  const start = initial();
  assert.throws(() => act(start, 1, 'turn.end'), /not_your_decision/);
  const next = act(start, 0, 'turn.end');
  assert.equal(next.state.currentTurn, 1); assert.equal(next.state.turn, 2);
  assert.equal(next.state.phase, 'DRAW_REVEAL'); assert.equal(next.state.drawReveal.card.id, 'deck-0');
  assert.equal(next.state.deck.length, 7); assert.equal(next.state._authorityEnd, null);
});

test('hand-limit discard validates exact unique owned indices before running end-turn rules', () => {
  const start = initial(); start.state.players[0].hand = Array.from({ length: 6 }, (_item, index) => card(`hand-${index}`));
  const choice = act(start, 0, 'turn.end'); assert.equal(choice.state.phase, 'DISCARD_PHASE');
  for (const indices of [[0], [0, 0], [0, 9], ['0', 1]]) {
    assert.throws(() => act(choice, 0, 'turn.discard', { cardIndices: indices }), /illegal_action/);
  }
  const next = act(choice, 0, 'turn.discard', { cardIndices: [1, 4] });
  assert.deepEqual(next.state.players[0].hand.map(c => c.id), ['hand-0', 'hand-2', 'hand-3', 'hand-5']);
  assert.deepEqual(next.state.discard.map(c => c.id), ['hand-4', 'hand-1']);
  assert.equal(next.state.currentTurn, 1); assert.equal(next.state.drawReveal.card.id, 'deck-0');
});

test('rest samples server dice, applies the actual recovery and cannot accept forged healing', () => {
  const start = initial();
  assert.throws(() => act(start, 0, 'turn.rest', { heal: 20 }), /invalid_command/);
  const next = act(start, 0, 'turn.rest');
  const { d1, d2 } = next.state._restRoll;
  assert.equal(next.random.draws, 2); assert.equal(next.state.players[0].hp, 7 + Math.max(d1, d2));
  assert.equal(next.state.players[0].isResting, true); assert.equal(next.state.currentTurn, 1);
  assert.deepEqual(next.publicEvents[0], { type: 'restRolled', seat: 0, d1, d2,
    visibility: 'public', id: 'turn:event:1:0' });
  assert.ok(next.publicEvents.findIndex(event => event.type === 'statChanged' && event.seat === 0) > 0);
  assert.equal(next.publicEvents.filter(event => event.type === 'restRolled').length, 1);
  assert.equal(next.state._pendingPublicEvents, undefined);
});

test('CTH rest draws pause at each real human choice and resume the private server cursor to the next turn', () => {
  const start = initial(); Object.assign(start.state.players[0], { godName: 'CTH', godLevel: 2, isResting: true });
  const first = act(start, 0, 'turn.end');
  assert.equal(first.state.currentTurn, 0); assert.equal(first.state.drawReveal.card.id, 'deck-0');
  assert.equal(first.state.abilityData.cthDrawsRemaining, 1);
  const second = act(first, 0, 'draw.discard');
  assert.equal(second.state.drawReveal.card.id, 'deck-1'); assert.equal(second.state.abilityData.cthDrawsRemaining, 0);
  const done = act(second, 0, 'draw.discard');
  assert.equal(done.state.currentTurn, 1); assert.equal(done.state.drawReveal.card.id, 'deck-2');
  assert.equal(done.state._authorityEnd, null); assert.equal(done.state.discard.length, 2);
});

test('reverse-order passive runs once before selecting the next living seat', () => {
  const start = initial(); start.state.players[0].pendingTurnDirectionReversals = 1;
  const next = act(start, 0, 'turn.end');
  assert.equal(next.state.turnDirection, -1); assert.equal(next.state.currentTurn, 2);
  assert.equal(next.state.players[0].pendingTurnDirectionReversals, undefined);
});

test('an already-applied forced reveal never offers a second keep command', () => {
  const start = initial({ phase: 'DRAW_REVEAL', drawReveal: { card: { ...card('forced'), forced: true },
    drawerIdx: 0, needsDecision: false } });
  assert.throws(() => act(start, 0, 'draw.keep'), /not_your_decision/);
  const normalized = advanceAutomaticRules(start.state);
  assert.equal(normalized.phase, 'ACTION'); assert.equal(normalized.players[0].hp, 7);
});

test('offline AI seats enter the same human-intent draw phase, without legacy automatic keep or discard', () => {
  const { state } = initializeRules({ mode: 'offline', seed: 16, now: 0, namespace: 'offline-test' });
  const start = initial({ ...state, gameOver: null, currentTurn: 0, phase: 'ACTION', drawReveal: null,
    deck: [card('explicit-bot-draw')], discard: [], abilityData: {} });
  const next = act(start, 0, 'turn.end');
  assert.equal(next.state.currentTurn, 1); assert.equal(next.state.phase, 'DRAW_REVEAL');
  assert.equal(next.state.drawReveal.card.id, 'explicit-bot-draw');
});
