import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
const card = (id, extra = {}) => ({ id, name: id, isZone: true, key: 'A1', letter: 'A', number: 1, type: 'selfHealHP', val: 1, ...extra });
function match(role) {
  return createPrivateMatch({ id: 'present', seed: 3, now: 0, state: {
    _isMP: true, _intentEngine: true, phase: 'ACTION', currentTurn: 0, turn: 1, _turnKey: 1,
    players: [role, '寻宝者', '邪祀者'].map((role, id) => ({ id, role, name: `P${id}`, hp: 10, san: 10,
      isDead: false, hand: [card(`private-${id}`)], godZone: [], zoneCards: [], peekMemories: {}, godEncounters: 0 })),
    deck: [], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: {},
  } });
}
function act(record, seat, type, payload = {}) {
  return resolveCommand(record, { permission: 'player', seat }, { version: 2, matchId: record.id,
    revision: record.revision, decisionId: record.decision.id, actionId: `action:${record.revision}`, type, payload },
  { now: 1, actions: migratedActions }).match;
}

test('swap presentation starts on its actual target and commits only after the private exchange finishes', () => {
  let record = act(match('寻宝者'), 0, 'skill.begin');
  record = act(record, 0, 'swap.selectTarget', { targetSeat: 1 });
  assert.deepEqual(record.publicEvents.at(-1), { type: 'skillStarted', kind: 'swap', sourceSeat: 0, targetSeat: 1,
    visibility: 'public', id: 'present:event:2:0' });
  const taken = act(record, 0, 'swap.takeBlind');
  assert.equal(taken.publicEvents.some(event => event.type === 'swapCommitted'), false);
  assert.equal(taken.publicEvents.some(event => event.type === 'cardCountChanged'), false);
  const given = act(taken, 0, 'swap.give', { cardIndex: 0 });
  const event = given.publicEvents.find(event => event.type === 'swapCommitted');
  assert.equal(event.count, 1);
  const host = { handleForCard: (seat, id) => `opaque:${seat}:${String(id).slice(-1)}` };
  const forSeat = seat => projectMatch(given, { permission: 'player', seat }, host).events.find(item => item.type === 'swapCommitted');
  assert.equal(forSeat(0).takeAlreadyPresented, true);
  assert.equal(forSeat(1).takeAlreadyPresented, false);
  for (const seat of [0, 1]) {
    assert.equal(forSeat(seat).takenCard.name, taken.state.players[0].hand.at(-1).name);
    assert.equal(forSeat(seat).givenCard.name, 'private-0');
  }
  const outsider = forSeat(2);
  assert.equal(outsider.takenCard, undefined);
  assert.equal(outsider.givenCard, undefined);
  assert.equal(JSON.stringify(outsider).includes('private-'), false);
  const observer = projectMatch(given, { permission: 'observer' }, host).events.find(item => item.type === 'swapCommitted');
  assert.equal(observer.takenCard, undefined);
  assert.equal(observer.givenCard, undefined);
  assert.equal(event.sourceCount, given.state.players[0].hand.length);
  assert.equal(event.targetCount, given.state.players[1].hand.length);
  assert.equal(given.random.draws, 1);
});

test('hunt publishes discard before damage, outcome, mixed public loot, then actual remaining death discard', () => {
  let record = match('追猎者');
  record.state.players[1].hp = 3;
  record.state.players[1].hand = Array.from({ length: 5 }, (_, index) => card(`victim-private-${index}`));
  record = act(record, 0, 'skill.begin');
  record = act(record, 0, 'hunt.selectTarget', { targetSeat: 1 });
  record = act(record, 1, 'hunt.reveal', { cardIndex: 0 });
  const beforeLength = record.publicEvents.length;
  const done = act(record, 0, 'hunt.attack', { cardIndex: 0 });
  const events = done.publicEvents.slice(beforeLength);
  assert.equal(events[0].type, 'huntAttack');
  assert.equal(events[0].card.id, 'private-0');
  const stat = events.findIndex(event => event.type === 'statChanged');
  const result = events.findIndex(event => event.type === 'huntResolved');
  const loot = events.findIndex(event => event.type === 'huntLootTransferred');
  assert.ok(stat > 0 && result > stat && loot > result);
  assert.equal(events[result].outcome, 'defeated');
  assert.equal(events[loot].count, 3);
  const outsider = projectMatch(done, { permission: 'observer' }, { handleForCard: () => 'opaque' }).events.slice(beforeLength);
  const publicLoot = outsider.find(event => event.type === 'huntLootTransferred');
  assert.equal(publicLoot.cards.length, 3);
  assert.ok(publicLoot.cards.every(item => item._back === true || item.name === 'victim-private-0'));
  assert.equal(publicLoot.receivedCards, undefined); assert.equal(publicLoot.sentCards, undefined);
  const discarded = outsider.findIndex(event => event.type === 'deathCardsRemoved');
  assert.ok(discarded > outsider.findIndex(event => event.type === 'huntLootTransferred'));
  assert.equal(outsider[discarded].discardedCards.length, 2);
  const hunter = projectMatch(done, { permission: 'player', seat: 0 }, { handleForCard: () => 'opaque' }).events
    .find(event => event.type === 'huntLootTransferred');
  assert.deepEqual(hunter.receivedCards.map(item => item.name), done.state.players[0].hand.map(item => item.name));
  const victim = projectMatch(done, { permission: 'player', seat: 1 }, { handleForCard: () => 'opaque' }).events
    .find(event => event.type === 'huntLootTransferred');
  assert.deepEqual(victim.sentCards, hunter.receivedCards);
  assert.equal(publicLoot.sourceCount, 2); assert.equal(publicLoot.targetCount, 3);
  assert.equal(events.find(event => event.kind === 'PLAYER_DEFEATED').cardSettlementPending, true);
  assert.equal(done.random.draws, 3);
});

test('public hunt loot remains an explicit legal choice and publishes actual chosen faces without extra randomness', () => {
  let record = match('追猎者');
  Object.assign(record.state.players[1], { hp: 3, revealHand: true,
    hand: Array.from({ length: 5 }, (_, index) => card(`public-victim-${index}`)) });
  record = act(record, 0, 'skill.begin'); record = act(record, 0, 'hunt.selectTarget', { targetSeat: 1 });
  record = act(record, 1, 'hunt.reveal', { cardIndex: 0 }); record = act(record, 0, 'hunt.attack', { cardIndex: 0 });
  assert.equal(record.state.phase, 'HUNT_SELECT_CARD_FROM_PUBLIC');
  assert.equal(record.publicEvents.some(event => event.type === 'deathCardsRemoved'), false);
  const done = act(record, 0, 'hunt.loot', { cardIndices: [0, 2, 4] });
  const events = projectMatch(done, { permission: 'observer' }, { handleForCard: () => 'opaque' }).events;
  const loot = events.find(event => event.type === 'huntLootTransferred');
  assert.deepEqual(loot.cards.map(item => item.name), ['public-victim-4', 'public-victim-2', 'public-victim-0']);
  assert.equal(loot.receivedCards, undefined); assert.equal(loot.sentCards, undefined);
  assert.deepEqual(events.find(event => event.type === 'deathCardsRemoved').discardedCards.map(item => item.name),
    ['public-victim-1', 'public-victim-3']);
  assert.equal(done.random.draws, 0);
});

test('an abandoned hunt records its result without inventing damage or card motion', () => {
  let record = act(match('追猎者'), 0, 'skill.begin');
  record = act(record, 0, 'hunt.selectTarget', { targetSeat: 1 });
  record = act(record, 1, 'hunt.reveal', { cardIndex: 0 });
  const beforeLength = record.publicEvents.length;
  const done = act(record, 0, 'hunt.attack', { cardIndex: null });
  assert.deepEqual(done.publicEvents.slice(beforeLength).map(event => [event.type, event.outcome]), [['huntResolved', 'abandoned']]);
  assert.equal(done.random.draws, 0);
});

test('a bewitch gift is explicitly public before its own damage and retains the rules income boundary', () => {
  let record = match('邪祀者');
  record.state.players[0].hand = [card('public-gift', { type: 'selfDamageHP', val: 2 })];
  record = act(record, 0, 'skill.begin');
  record = act(record, 0, 'bewitch.chooseCard', { cardIndex: 0 });
  const beforeLength = record.publicEvents.length;
  const done = act(record, 0, 'bewitch.selectTarget', { targetSeat: 1 });
  const events = done.publicEvents.slice(beforeLength);
  assert.equal(events[0].type, 'bewitchGiven');
  assert.equal(events[0].card.id, 'public-gift');
  assert.equal(events[0].sourceSeat, 0); assert.equal(events[0].targetSeat, 1);
  assert.ok(events.findIndex(event => event.type === 'statChanged') > 0);
  assert.equal(done.state.players[1].hp, 8);
  assert.equal(done.state.players[1].hand.at(-1).id, 'public-gift');
});

test('a damage-link target commits an explicit public establishment without exposing either hand', () => {
  const record = match('邪祀者');
  record.state.phase = 'DAMAGE_LINK_SELECT_TARGET';
  record.state.abilityData = { damageLinkSource: 0, damageLinkTargets: [1] };
  const done = act(record, 0, 'damageLink.selectTarget', { targetSeat: 1 });
  const event = done.publicEvents.find(event => event.type === 'damageLinkEstablished');
  assert.equal(event.sourceSeat, 0); assert.equal(event.targetSeat, 1);
  assert.equal(JSON.stringify(event).includes('private-'), false);
  assert.equal(done.state.players[0].damageLinks[0].partner, 1);
  assert.equal(done.random.draws, 0);
});
