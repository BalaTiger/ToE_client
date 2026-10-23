import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
const card = (id, letter = 'A', number = 1, extra = {}) => ({ id, name: id, isZone: true, key: `${letter}${number}`, letter, number, type: 'selfHealHP', val: 1, ...extra });
const god = (id, key) => ({ id, name: key, godKey: key, isGod: true, power: key });
function initial(roles = ['寻宝者', '追猎者', '邪祀者']) {
  return createPrivateMatch({ id: 'skills', seed: 3, now: 0, state: {
    _isMP: true, _intentEngine: true, phase: 'ACTION', currentTurn: 0, turn: 1, _turnKey: 1, globalOnlySwapOwner: null,
    players: roles.map((role, id) => ({ id, role, name: `P${id}`, hp: 10, san: 10, isDead: false,
      hand: [card(`hand-${id}`)], godZone: [], zoneCards: [], peekMemories: {}, godEncounters: 0 })),
    deck: [], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: {},
  } });
}
const wire = (match, type, payload = {}) => ({ version: 2, matchId: match.id, revision: match.revision,
  decisionId: match.decision.id, actionId: `a${match.revision}`, type, payload });
const run = (match, seat, command) => resolveCommand(match, { permission: 'player', seat }, command,
  { now: 1, actions: migratedActions });
const act = (match, seat, type, payload = {}) => run(match, seat, wire(match, type, payload)).match;
const view = (match, seat) => projectMatch(match, seat === null ? { permission: 'observer' } : { permission: 'player', seat },
  { actions: migratedActions, handleForCard: (_seat, id) => `opaque:${id}` });

test('proliferation grants one new young without consuming the held young and cannot be repeated', () => {
  let match = initial(); match.state.players[0].hand = [{ id: 'original-young', isBlackGoatYoung: true, type: 'blackGoatYoung' }];
  match = act(match, 0, 'multiply.begin'); match = act(match, 0, 'multiply.selectTarget', { targetSeat: 1 });
  assert.equal(match.state.players[0].hand[0].id, 'original-young');
  const young = match.state.players[1].hand.filter(card => card.isBlackGoatYoung);
  assert.equal(young.length, 1); assert.notEqual(young[0].id, 'original-young');
  assert.throws(() => act(match, 0, 'multiply.begin'), /not_your_decision/);
  assert.throws(() => act(match, 0, 'skill.begin'), /not_your_decision/);
});

test('private swap is server-random, once-only and preserves the nonactor checkpoint until give/cancel', () => {
  let match = initial(); match.state.players[1].hand.push(card('other', 'B', 2));
  const baseline = match.state.players.map(player => player.hand.map(c => c.id));
  match = act(match, 0, 'skill.begin'); match = act(match, 0, 'swap.selectTarget', { targetSeat: 1 });
  const command = wire(match, 'swap.takeBlind');
  const taken = run(match, 0, command).match;
  assert.equal(taken.random.draws, 1); assert.equal(taken.state.skillUsed, true);
  assert.equal(view(taken, 0).players[0].hand.length, 2);
  assert.equal(view(taken, 1).players[1].hand.length, 2);
  assert.equal(view(taken, null).players[0].handCount, 1);
  assert.equal(JSON.stringify(view(taken, 1)).includes('takenId'), false);
  assert.equal(run(taken, 0, command).acknowledgement.duplicate, true);
  const cancelled = act(taken, 0, 'skill.cancel');
  assert.deepEqual(cancelled.state.players.map(player => player.hand.map(c => c.id).sort()), baseline.map(ids => [...ids].sort()));
  assert.equal(cancelled.state.skillUsed, true);
  assert.throws(() => act(cancelled, 0, 'skill.begin'), /not_your_decision/);
  const given = act(taken, 0, 'swap.give', { cardIndex: 0 });
  assert.equal(given.state._privateSwap, null); assert.equal(view(given, 1).players[1].hand.length, 2);
  assert.equal(given.state.players[1].hand.some(c => c.id === 'hand-0'), true);
});

test('double treasure swap wins are derived from real post-exchange hands in canonical seat order', () => {
  let match = initial(['寻宝者', '寻宝者', '邪祀者']);
  match.state.players[0].hand = [card('a1', 'A', 1), card('b2', 'B', 2), card('c3', 'C', 3), card('a2', 'A', 2)];
  match.state.players[1].hand = [card('b1', 'B', 1), card('c4', 'C', 4), card('d3', 'D', 3), card('d4', 'D', 4)];
  match.state.players[1].revealHand = true;
  match = act(match, 0, 'skill.begin'); match = act(match, 0, 'swap.selectTarget', { targetSeat: 1 });
  match = act(match, 0, 'swap.takeVisible', { cardIndex: 3 });
  assert.equal(match.state.gameOver, undefined);
  const done = act(match, 0, 'swap.give', { cardIndex: 3 });
  assert.equal(done.state.gameOver.winnerIdx, 0); assert.equal(done.state.gameOver.winnerIdx2, 1);
});

function huntStart(publicHand = false) {
  let match = initial(['追猎者', '寻宝者', '邪祀者']);
  match.state.players[1].hp = 3; match.state.players[1].revealHand = publicHand;
  match.state.players[1].hand = Array.from({ length: 5 }, (_item, index) => card(`victim-${index}`, 'A', (index % 4) + 1));
  match = act(match, 0, 'skill.begin'); match = act(match, 0, 'hunt.selectTarget', { targetSeat: 1 });
  assert.throws(() => act(match, 0, 'hunt.reveal', { cardIndex: 0 }), /not_your_decision/);
  return act(match, 1, 'hunt.reveal', { cardIndex: 0 });
}
test('hunt validates the match and server damage, settles death and hidden loot without revealing other cards', () => {
  const match = huntStart();
  assert.throws(() => act(match, 0, 'hunt.attack', { cardIndex: 0, damage: 99 }), /invalid_command/);
  const done = act(match, 0, 'hunt.attack', { cardIndex: 0 });
  assert.equal(done.state.players[1].isDead, true); assert.equal(done.state.players[1].hand.length, 0);
  assert.equal(done.state.players[0].hand.length, 3); assert.equal(done.state.discard.length, 3);
  const events = view(done, 2).events, json = JSON.stringify(events);
  assert.equal(json.includes('victim-0'), true);
  // The remainder actually entered public discard. Only the privately won
  // cards must stay hidden; their earlier revealed card is already public.
  for (const card of done.state.players[0].hand.filter(card => card.id !== 'victim-0')) {
    assert.equal(json.includes(card.name), false);
  }
  assert.equal(view(done, 2).players[0].hand, undefined);
});
test('public hunt loot asks for exactly three unique actual cards, then settles the remainder once', () => {
  const attacked = act(huntStart(true), 0, 'hunt.attack', { cardIndex: 0 });
  assert.equal(attacked.state.phase, 'HUNT_SELECT_CARD_FROM_PUBLIC');
  assert.throws(() => act(attacked, 0, 'hunt.loot', { cardIndices: [0, 0, 1] }), /illegal_action/);
  const done = act(attacked, 0, 'hunt.loot', { cardIndices: [0, 2, 4] });
  assert.deepEqual(done.state.players[0].hand.map(c => c.id).sort(), ['victim-0', 'victim-2', 'victim-4']);
  assert.equal(done.state.players[1].hand.length, 0); assert.equal(done.state.discard.length, 3);
});

test('a winning hunt still requires the human to choose only three public loot cards before final settlement', () => {
  const start = huntStart(true); start.state.players[2].role = '追猎者';
  const attacked = act(start, 0, 'hunt.attack', { cardIndex: 0 });
  assert.equal(attacked.state.phase, 'HUNT_SELECT_CARD_FROM_PUBLIC'); assert.equal(attacked.state.gameOver ?? null, null);
  assert.equal(attacked.state._pendingHuntWin.winner, '追猎者');
  const done = act(attacked, 0, 'hunt.loot', { cardIndices: [0, 2, 4] });
  assert.equal(done.state.players[0].hand.length, 3); assert.equal(done.state.gameOver.winner, '追猎者');
  assert.equal(done.state.players[1].hand.length, 0); assert.equal(done.state.discard.length, 3);
});
test('a redirected hunt completes the reaction and does not loot the original living target', () => {
  const match = huntStart(); match.state.players[1].etherealizeStacks = 1;
  const attacked = act(match, 0, 'hunt.attack', { cardIndex: 0 });
  assert.equal(attacked.state.phase, 'ETHEREALIZE_DECISION');
  const choosing = act(attacked, 1, 'etherealize.answer', { use: true });
  const done = act(choosing, 1, 'etherealize.redirect', { targetSeat: 2 });
  assert.equal(done.state.players[1].hp, 3); assert.equal(done.state.players[2].hp, 7);
  assert.equal(done.state._huntPending, null); assert.equal(done.state.players[0].hand.length, 0);
});

test('bewitch applies the actual zone effect and gives ownership only after its rules finish', () => {
  let match = initial(['邪祀者', '寻宝者', '追猎者']);
  match.state.players[0].hand = [card('gift', 'A', 1, { type: 'selfDamageHP', val: 2 })];
  match = act(match, 0, 'skill.begin'); match = act(match, 0, 'bewitch.chooseCard', { cardIndex: 0 });
  const done = act(match, 0, 'bewitch.selectTarget', { targetSeat: 1 });
  assert.equal(done.state.players[1].hp, 8); assert.equal(done.state.players[1].hand.at(-1).id, 'gift');
  assert.equal(done.state.players[0].hand.length, 0); assert.equal(done.state.skillUsed, true);
  const hpEvents = view(done, null).events.filter(event => event.type === 'statChanged' && event.seat === 1);
  assert.ok(hpEvents.some(event => event.hp === 8 && event.fromHp === 10));
  assert.equal(done.state._visualEvents.length, 0); assert.equal(done.state._statEvents.length, 0);
});
test('bewitch god gift settles encounter and forced conversion under the server instead of a client result', () => {
  let match = initial(['邪祀者', '寻宝者', '追猎者']);
  match.state.players[0].hand = [god('gift', 'CTH')];
  Object.assign(match.state.players[1], { godName: 'NYA', godLevel: 1, godZone: [god('old-faith', 'NYA')] });
  match = act(match, 0, 'skill.begin'); match = act(match, 0, 'bewitch.chooseCard', { cardIndex: 0 });
  const done = act(match, 0, 'bewitch.selectTarget', { targetSeat: 1 });
  assert.equal(done.state.players[1].godName, 'CTH'); assert.equal(done.state.players[1].san, 8);
  assert.equal(done.state.discard.some(c => c.id === 'old-faith'), true);
  assert.equal(done.state.players[0].hand.length, 0); assert.equal(done.state.currentTurn, 0);
});
