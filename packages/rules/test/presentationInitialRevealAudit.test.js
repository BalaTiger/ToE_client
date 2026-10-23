import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_ZONE_CARD_VARIANTS_BY_KEY, INSPECTION_DECK } from '../src/constants/card.js';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
import { collectSafeDrawPresentationEvents } from '../src/authority/presentationDrawEvents.js';
import { withRuleContext } from '../src/runtime.js';

// Targeted causal-order regressions. The reproduced pre-repair observations are
// preserved in QA root initial-reveal-audit-baseline.json. These tests now assert
// the repaired contract, not the presence of the old defects.
const secret = 'PRIVATE-INITIAL-REVEAL-CANARY';
function zone(key, name) {
  const definition = FIXED_ZONE_CARD_VARIANTS_BY_KEY[key].find(card => card.name === name);
  assert.ok(definition, name);
  return { ...definition, id: `raw-${name}`, key, letter: key[0], number: +key[1],
    isZone: true, privateMetadata: secret };
}
const optional = () => zone('A2', '蚂蚁虽小');
const forced = () => zone('A1', '坠落');
const sprain = () => zone('D4', '扭伤');
const god = () => ({ id: 'raw-cth', name: '克苏鲁', type: 'god', godKey: 'CTH', isGod: true,
  privateMetadata: secret });
function initial(cards, { restLevel = 0 } = {}) {
  const state = {
    _isMP: true, _intentEngine: true, phase: 'ACTION', currentTurn: 0, turn: 1, _turnKey: 1,
    players: ['寻宝者', '追猎者', '邪祀者'].map((role, id) => ({ id, role, name: `P${id}`,
      hp: 10, san: 7, isDead: false, hand: [], godZone: [], zoneCards: [],
      peekMemories: {}, godEncounters: 1 })),
    deck: [...cards, optional(), { ...optional(), id: secret, name: secret }], discard: [],
    inspectionDeck: [{ ...INSPECTION_DECK.find(card => card.name === '自残'), id: 'raw-inspection' }],
    inspectionDiscard: [], log: [secret], abilityData: {},
  };
  if (restLevel) Object.assign(state.players[0], { godName: 'CTH', godLevel: restLevel, isResting: true });
  return createPrivateMatch({ id: 'reveal-audit', seed: 12, now: 0, state });
}
function endTurn(record) {
  return resolveCommand(record, { permission: 'player', seat: 0 }, {
    version: 2, matchId: record.id, revision: record.revision, decisionId: record.decision.id,
    actionId: 'audit-end', type: 'turn.end', payload: {},
  }, { now: 1, actions: migratedActions }).match;
}
function view(record, seat = 1) {
  return projectMatch(record, { permission: 'player', seat }, {
    actions: migratedActions, handleForCard: (_seat, id) => `opaque-${id}`,
  });
}
const causalOrder = projected => projected.events.map(event => event.kind || event.type);

test('control: an optional normal draw publishes its face after the turn banner and retains the real choice', () => {
  const next = endTurn(initial([optional()])), projected = view(next);
  assert.deepEqual(causalOrder(projected), ['turnStarted', 'cardRevealed']);
  assert.equal(projected.events[1].card.name, '蚂蚁虽小');
  assert.equal(projected.phase, 'DRAW_REVEAL');
  assert.ok(projected.decision.actions.some(action => action.type === 'draw.keep'));
});

for (const makeCard of [forced, sprain]) {
  test(`normal ${makeCard().name} reveals after the turn banner and before its HP consequence`, () => {
    const next = endTurn(initial([makeCard()])), projected = view(next);
    assert.deepEqual(causalOrder(projected), ['turnStarted', 'cardRevealed', 'HP_LOSS', 'cardIncomeCommitted', 'cardCountChanged']);
    assert.equal(projected.events[1].card.name, makeCard().name);
    assert.equal(projected.phase, 'ACTION');
    assert.equal(next.state.players[1].hp, 10 - makeCard().val);
    const incomes = projected.events.filter(event => event.type === 'cardIncomeCommitted');
    assert.equal(incomes.length, 1);
    assert.equal(incomes[0].destination, 'hand');
    assert.equal(incomes[0].card.id, `opaque-${makeCard().id}`);
    assert.equal(next.state.players[1].hand.filter(card => card.id === makeCard().id).length, 1);
    assert.equal(next.random.draws, 0);
    assert.equal(projected.decision.actions.some(action => action.type === 'draw.keep'), false);
  });
}

test('two forced CTH rest draws each reveal before their own effect and precede the next player turn', () => {
  const next = endTurn(initial([forced(), sprain()], { restLevel: 2 })), projected = view(next, 0);
  assert.deepEqual(causalOrder(projected), ['cthulhuDream', 'cardRevealed', 'HP_LOSS', 'cardIncomeCommitted', 'cardRevealed', 'HP_LOSS',
    'cardIncomeCommitted', 'turnStarted', 'cardRevealed', 'cardCountChanged']);
  assert.deepEqual(projected.events.filter(event => event.type === 'cardRevealed').map(event => event.card.name), ['坠落', '扭伤', '蚂蚁虽小']);
  assert.deepEqual(next.state.players[0].hand.map(card => card.name), ['坠落', '扭伤']);
  assert.equal(next.state.players[0].hp, 6);
  assert.equal(next.state.currentTurn, 1);
  assert.equal(next.random.draws, 0);
  assert.deepEqual(projected.events.filter(event => event.type === 'cardIncomeCommitted')
    .map(event => [event.card.name, event.destination, event.seat]), [['坠落', 'hand', 0], ['扭伤', 'hand', 0]]);
});

test('turn-opening poison stays after its banner and before the forced draw and its separate damage', () => {
  const start = initial([forced()]);
  start.state.players[1].poisonStacks = 1;
  const next = endTurn(start), projected = view(next);
  assert.deepEqual(causalOrder(projected), ['turnStarted', 'HP_LOSS', 'cardRevealed', 'HP_LOSS', 'cardIncomeCommitted', 'cardCountChanged']);
  assert.equal(projected.events[1].hp, 9);
  assert.equal(projected.events[2].card.name, '坠落');
  assert.equal(projected.events[3].hp, 6);
});

for (const restLevel of [0, 1]) {
  test(`${restLevel ? 'CTH rest' : 'normal'} empty-hand cave duel commits its one actual card after its reveal`, () => {
    const card = zone('D2', '穴居人战争'), start = initial([card], { restLevel });
    const saved = structuredClone(start), next = endTurn(start), owner = restLevel ? 0 : 1;
    assert.deepEqual(start, saved);
    assert.equal(next.random.draws, 0);
    assert.equal(next.state.players[owner].hand.filter(item => item.id === card.id).length, 1);
    assert.equal([...next.state.deck, ...next.state.discard, ...next.state.players.flatMap(player => player.hand)]
      .filter(item => item.id === card.id).length, 1);
    for (const seat of [0, 1, 2]) {
      const projected = view(next, seat), receipts = projected.events.filter(event => event.type === 'cardIncomeCommitted');
      assert.equal(receipts.length, 1);
      assert.deepEqual([receipts[0].seat, receipts[0].card.id, receipts[0].destination], [owner, `opaque-${card.id}`, 'hand']);
      const reveal = projected.events.findIndex(event => event.type === 'cardRevealed' && event.card.name === card.name);
      const income = projected.events.findIndex(event => event.type === 'cardIncomeCommitted');
      assert.ok(reveal >= 0 && income > reveal);
      if (restLevel) assert.ok(projected.events.findIndex(event => event.type === 'turnStarted') > income);
      assert.equal(JSON.stringify(projected).includes(secret), false);
    }
    assert.equal(view(next, owner).decision.actions.some(action => ['draw.keep', 'target.choose'].includes(action.type)), false);
  });
}

for (const restLevel of [0, 1]) {
  test(`${restLevel ? 'CTH rest' : 'normal'} initial god reveal precedes its SAN loss, inspection and HP consequence`, () => {
    const next = endTurn(initial([god()], { restLevel })), owner = restLevel ? 0 : 1;
    const projected = view(next, owner);
    assert.deepEqual(causalOrder(projected), [...(restLevel ? ['cthulhuDream'] : ['turnStarted']),
      'cardRevealed', 'SAN_LOSS', 'inspectionRevealed', 'HP_LOSS']);
    assert.equal(projected.events.filter(event => event.type === 'cardRevealed').length, 1);
    assert.equal(projected.godEncounter.card.name, '克苏鲁');
    assert.equal(projected.godEncounter.owner, owner);
    assert.equal(projected.phase, 'GOD_CHOICE');
    assert.ok(projected.decision.actions.some(action => action.type === 'god.choose'));
    assert.equal(next.state.players[owner].san, 5);
    assert.equal(next.state.players[owner].hp, 8);
  });
}

test('a terminal god encounter preserves its cause reveal before SAN depletion without offering a dead choice', () => {
  const start = initial([god()]);
  start.state.players[1].san = 1;
  const next = endTurn(start), projected = view(next);
  assert.ok(projected.gameOver);
  const reveal = projected.events.findIndex(event => event.type === 'cardRevealed' && event.card.isGod);
  const loss = projected.events.findIndex(event => event.kind === 'SAN_LOSS');
  assert.ok(reveal >= 0 && loss > reveal);
  assert.equal(projected.decision.actions.some(action => action.type === 'god.choose'), false);
  assert.equal(next.state.discard.filter(card => card.id === 'raw-cth').length, 1);
});

test('audit transitions preserve input and safe projections without exposing hidden decks or card metadata', () => {
  for (const options of [{}, { restLevel: 2 }]) {
    const start = initial([forced(), sprain()], options), saved = structuredClone(start);
    const next = endTurn(start);
    assert.deepEqual(start, saved);
    for (const seat of [0, 1, 2]) {
      const encoded = JSON.stringify(view(next, seat));
      assert.equal(encoded.includes(secret), false);
      assert.equal(encoded.includes('privateMetadata'), false);
      assert.equal(encoded.includes('_visualEvents'), false);
    }
  }
});

test('canonical blind draw hides the initial face from its drawer while peers retain the public reveal', () => {
  const start = initial([optional()]);
  start.state.players[1].blindNextZoneDecision = true;
  const next = endTurn(start), drawer = view(next, 1), peer = view(next, 0);
  assert.equal(drawer.draw.hidden, true);
  assert.equal(drawer.draw.card, undefined);
  assert.equal(drawer.events.some(event => event.type === 'cardRevealed'), false);
  assert.equal(peer.events.filter(event => event.type === 'cardRevealed').length, 1);
  assert.equal(peer.events.find(event => event.type === 'cardRevealed').card.name, '蚂蚁虽小');
});

test('draw extraction reads only canonical reveal payloads, dedupes identities and consumes no entropy', () => {
  const cause = { id: 'draw-cause', type: 'drawCard', playerIdx: 0,
    card: { ...forced(), privateMetadata: secret }, statEventIds: ['hp'],
    presentationAfterStatIds: ['prior'], sourcePile: 'discard',
    playersBefore: [{ hand: [secret], role: secret }], log: [secret] };
  const after = { _visualEvents: [cause, structuredClone(cause)], _statEvents: [
    { id: 'prior', type: 'SAN_LOSS', target: 0 }, { id: 'hp', type: 'HP_LOSS', target: 0 },
  ], deck: [secret], players: [{ hand: [secret] }] };
  const saved = structuredClone(after);
  const entries = withRuleContext({ random: () => { throw new Error('Unexpected entropy'); } },
    () => collectSafeDrawPresentationEvents({}, after));
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].beforeStatIds, ['hp']);
  assert.deepEqual(entries[0].afterStatIds, ['prior']);
  assert.equal(entries[0].sourceCardId, 'raw-坠落');
  assert.equal(entries[0].event.card.id, undefined);
  assert.equal(entries[0].event.sourcePile, 'discard');
  assert.equal(JSON.stringify(entries).includes(secret), false);
  assert.deepEqual(after, saved);
  assert.deepEqual(collectSafeDrawPresentationEvents(after, saved), []);
  assert.deepEqual(collectSafeDrawPresentationEvents({}, { players: after.players, drawReveal: { card: forced() } }), []);
});

test('malformed/anonymous canonical draw records cannot expose nested card data or invalid seats', () => {
  const after = { _visualEvents: [
    { type: 'drawCard', playerIdx: 0, card: forced() },
    { id: 'invalid-seat', type: 'drawCard', playerIdx: -1, card: forced() },
    { id: 'nested-card', type: 'drawCard', playerIdx: 0, card: { name: { secret }, id: secret } },
  ] };
  assert.deepEqual(collectSafeDrawPresentationEvents({}, after), []);
});
