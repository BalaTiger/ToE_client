import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSafePresentationEvents, collectFreshPresentationStats } from '../src/authority/presentationPublicEvents.js';
import { executeRuleResolution } from '../src/execution.js';
import { withRuleContext } from '../src/runtime.js';
import { applyInspectionForSanLoss, submitLossEvents } from '../src/game/effectEngine.js';
import { appendStatChangeResult } from '../src/game/statChangeEngine.js';
import { addDamageLink } from '../src/game/damageLinks.js';
import { createInspectionVisualEvent, createStatEventsEvent } from '../src/game/visualEvents.js';
import { collectPublicRuleEvents } from '../src/authority/events.js';

const secret = 'PRIVATE-CANARY';
const card = (name, id = name) => ({ id, name, key: 'A1', number: 1, letter: 'A', type: 'treasure',
  privateMetadata: secret });
const players = () => Array.from({ length: 4 }, (_, id) => ({ id, name: `P${id}`, role: '寻宝者',
  hp: 10, san: 6, isDead: false, hand: [card(secret)], godZone: [], zoneCards: [], peekMemories: {} }));
const state = () => ({ players: players(), deck: [card(secret), card(`${secret}-future`)], discard: [],
  inspectionDeck: [], inspectionDiscard: [], log: [secret], currentTurn: 0, turn: 1, phase: 'ACTION',
  _visualEvents: [], _statEvents: [], _statEventSeq: 0 });
const resolve = fn => executeRuleResolution({ random: () => 0.25, now: 0, namespace: 'public-presentation-test' }, fn);
function inspect(gs, inspectionCard) {
  const result = applyInspectionForSanLoss(1, gs.players[1].san, 0, gs.players, gs.deck,
    gs.discard, gs.log, { ...gs, inspectionDeck: [inspectionCard] });
  return { ...gs, ...result.inspectionMeta, players: result.P, deck: result.D, discard: result.Disc, log: result.log };
}
const eventPayloads = entries => entries.map(entry => entry.event);
const noSecrets = entries => assert.equal(JSON.stringify(entries).includes(secret), false);

test('actual inspection dark draw publishes only its inspection face and a card-back count', () => {
  const before = state();
  const after = resolve(() => inspect(structuredClone(before), {
    id: secret, name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive',
    hand: [card(secret)], abilityData: { secret }, random: secret,
  }));
  assert.equal(after.players[1].hand.length, 2);
  assert.ok(JSON.stringify(after).includes(secret));
  const entries = collectSafePresentationEvents(before, after);
  assert.deepEqual(eventPayloads(entries), [{ type: 'inspectionRevealed', seat: 1,
    inspectionCard: { name: '揭开真相', effect: 'drawCard', type: 'positive', value: 1 }, hiddenDrawCount: 1 }]);
  noSecrets(entries);
  assert.deepEqual(entries[0].statEventIds, []);
});

test('actual SAN loss precedes inspection, whose own HP consequence follows its reveal', () => {
  const before = state();
  const after = resolve(() => {
    const gs = structuredClone(before);
    const loss = submitLossEvents({ players: gs.players, deck: gs.deck, discard: gs.discard,
      log: gs.log, currentTurn: 0, events: [{ targetIdx: 1, lostSan: 1 }], statEventSeq: 1 });
    return inspect({ ...gs, ...appendStatChangeResult(gs, loss) },
      { name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' });
  });
  const [entry] = collectSafePresentationEvents(before, after);
  const cause = after._statEvents.find(stat => stat.type === 'SAN_LOSS');
  const consequence = after._statEvents.find(stat => stat.type === 'HP_LOSS');
  assert.ok(cause && consequence);
  assert.deepEqual(entry.afterStatIds, [cause.id]);
  assert.deepEqual(entry.beforeStatIds, [consequence.id]);
  assert.deepEqual(entry.statEventIds, [consequence.id]);
  assert.equal(entry.event.type, 'inspectionRevealed');
  assert.equal(Object.hasOwn(entry.event, 'statEvents'), false);
  noSecrets(collectSafePresentationEvents(before, after));
});

test('nested inspection ownership and transaction order survive duplicate generic stat wrappers', () => {
  const after = resolve(() => {
    const gs = state();
    const one = { id: 'stat-one', type: 'HP_LOSS', target: 1, seq: 1, from: { hp: 10 }, to: { hp: 8 } };
    const two = { id: 'stat-two', type: 'SAN_GAIN', target: 2, seq: 2, from: { san: 3 }, to: { san: 4 } };
    const first = createInspectionVisualEvent({ target: 1, card: { name: '自残', effect: 'selfDamageHP', value: 2 },
      beforeStatEventSeq: 0, statEvents: [one], beforePlayers: gs.players, afterLog: [secret] });
    const second = createInspectionVisualEvent({ target: 2, card: { name: '超人意志', effect: 'healSAN', value: 1 },
      beforeStatEventSeq: 1, statEvents: [two], beforePlayers: gs.players });
    return { ...gs, _statEvents: [one, two], _visualEvents: [
      { id: 'later', type: 'bewitchGift', transactionId: 'action', order: 2, settlementEvents: [second] },
      { id: 'earlier', type: 'bewitchGift', transactionId: 'action', order: 1, settlementEvents: [first] },
      createStatEventsEvent({ statEvents: [one, two] }),
    ] };
  });
  const entries = collectSafePresentationEvents({}, after);
  assert.deepEqual(entries.map(entry => entry.event.seat), [1, 2]);
  assert.deepEqual(entries.map(entry => entry.statEventIds), [['stat-one'], ['stat-two']]);
  assert.deepEqual(entries[1].afterStatIds, ['stat-one']);
  assert.deepEqual(collectSafePresentationEvents(structuredClone(after), after), []);
  noSecrets(entries);
});

test('zero-damage inspection keeps its position without inventing a stat animation', () => {
  const after = resolve(() => ({ _statEvents: [
    { id: 'cause', type: 'SAN_LOSS', seq: 3 }, { id: 'later', type: 'HP_GAIN', seq: 4 },
  ], _visualEvents: [createInspectionVisualEvent({ target: 0,
    card: { name: '暂时的平静', effect: 'nothing', value: 0 }, beforeStatEventSeq: 3, statEvents: [] })] }));
  const [entry] = collectSafePresentationEvents({}, after);
  assert.deepEqual(entry.statEventIds, []);
  assert.deepEqual(entry.afterStatIds, ['cause']);
  assert.deepEqual(entry.beforeStatIds, ['later']);
});

test('actual chained links expose endpoints and precise stat anchors, never link/player private data', () => {
  const before = state();
  const after = resolve(() => {
    const gs = structuredClone(before);
    addDamageLink(gs.players, 1, 2, { id: `${secret}-link-1` });
    addDamageLink(gs.players, 2, 3, { id: `${secret}-link-2` });
    const loss = submitLossEvents({ players: gs.players, deck: gs.deck, discard: gs.discard,
      log: gs.log, currentTurn: 0, events: [{ targetIdx: 1, lostHp: 1 }], statEventSeq: 1 });
    return { ...gs, ...appendStatChangeResult(gs, loss) };
  });
  const entries = collectSafePresentationEvents(before, after);
  assert.deepEqual(entries.map(entry => entry.event.pair), [[1, 2], [2, 3]]);
  assert.equal(new Set(entries.map(entry => entry.event.linkId)).size, 2);
  for (const entry of entries) {
    const raw = after._statEvents.find(stat => stat.id === entry.sourceEventId);
    assert.equal(raw.type, 'DAMAGE_LINK_BREAK');
    assert.deepEqual(entry.statEventIds, [raw.id]);
    const beforeStats = after._statEvents.filter(stat => stat.phaseOrder < raw.phaseOrder).map(stat => stat.id);
    const afterStats = after._statEvents.filter(stat => stat.phaseOrder > raw.phaseOrder).map(stat => stat.id);
    beforeStats.forEach(id => assert.ok(entry.afterStatIds.includes(id)));
    afterStats.forEach(id => assert.ok(entry.beforeStatIds.includes(id)));
    assert.equal(entry.afterStatIds.some(id => entry.beforeStatIds.includes(id)), false);
  }
  // Raw link identity is server-only lookup metadata, never the public DTO.
  noSecrets(eventPayloads(entries));
});

for (const succeeds of [true, false]) {
  test(`actual immortality ${succeeds ? 'success' : 'failure'} reveals only its explicit cards after lethal loss`, () => {
    const before = state();
    const after = resolve(() => {
      const gs = structuredClone(before);
      Object.assign(gs.players[1], { hp: 2, godName: 'VRI', godLevel: 1 });
      gs.deck = Array.from({ length: 8 }, (_, index) => ({ ...card(`Public ${index}`, `${secret}-id-${index}`),
        ...(index === 0 && !succeeds ? { isGod: true, godKey: 'CTH' } : {}) }));
      const loss = submitLossEvents({ players: gs.players, deck: gs.deck, discard: gs.discard,
        log: gs.log, currentTurn: 0, events: [{ targetIdx: 1, lostHp: 3 }], statEventSeq: 1 });
      const result = { ...gs, ...appendStatChangeResult(gs, loss) };
      // The same reveal can also appear in the top-level visual journal.
      const source = result._statEvents.find(stat => stat.vritraImmortalReveal)?.vritraImmortalReveal;
      assert.ok(source);
      result._visualEvents.unshift(structuredClone(source));
      return result;
    });
    const entries = collectSafePresentationEvents(before, after).filter(entry => entry.event.type === 'immortalRevealed');
    assert.equal(entries.length, 1);
    const [entry] = entries;
    const damage = after._statEvents.find(stat => stat.vritraImmortalReveal);
    const outcome = after._statEvents.find(stat => stat.type === (succeeds ? 'HP_GAIN' : 'PLAYER_DEFEATED'));
    assert.equal(entry.event.type, 'immortalRevealed');
    assert.equal(entry.event.succeeded, succeeds);
    assert.ok(entry.event.cards.length > 0);
    assert.ok(entry.event.cards.every(face => !Object.hasOwn(face, 'id') && !Object.hasOwn(face, 'privateMetadata')));
    assert.ok(entry.afterStatIds.includes(damage.id));
    assert.ok(entry.beforeStatIds.includes(outcome.id));
    assert.deepEqual(entry.statEventIds, [damage.id]);
    assert.deepEqual(collectSafePresentationEvents(after, structuredClone(after)), []);
    noSecrets(entries);
  });
}

test('extraction reads no hidden snapshots and consumes no entropy or mutable state', () => {
  const after = resolve(() => inspect(state(), { name: '失眠', effect: 'disableRest', value: 1,
    type: 'negative', durationTurns: 1, extra: secret }));
  const saved = structuredClone(after);
  const entries = withRuleContext({ random: () => { throw new Error('Unexpected entropy'); } },
    () => collectSafePresentationEvents({}, after));
  assert.deepEqual(after, saved);
  assert.equal(entries[0].event.inspectionCard.durationTurns, 1);
  const changedSnapshots = { players: [{ hp: 0, isDead: true, hand: [] }], deck: [], log: ['death'] };
  assert.deepEqual(collectSafePresentationEvents(state(), changedSnapshots), []);
  noSecrets(entries);
});

test('malformed seats, anonymous events and nested non-scalar card fields fail closed', () => {
  const result = collectSafePresentationEvents({}, { _visualEvents: [
    { type: 'inspection', target: 0, card: { effect: 'drawCard' } },
    { id: 'bad-seat', type: 'inspection', target: -1, card: { effect: 'drawCard' } },
    { id: 'bad-card', type: 'vritraImmortalReveal', targetIdx: 0, cards: [{ name: { secret }, id: secret }] },
  ], _statEvents: [{ id: 'bad-pair', type: 'DAMAGE_LINK_BREAK', pair: [1, 1], players: [secret] }] });
  assert.deepEqual(result, []);
});

test('fresh raw stat collection preserves the journal and inserts explicit nested members at owner neighbours', () => {
  const stat = id => ({ id, type: 'HP_LOSS', target: 1, privateSnapshot: secret });
  const old = stat('old'), first = stat('first'), nested = stat('nested'), last = stat('last');
  const after = { _statEvents: [old, first, last], _visualEvents: [
    { id: 'owner', type: 'inspection', statEvents: [first, nested, last] },
    { id: 'wrapper', type: 'statEvents', statEvents: [first, nested, last] },
  ] };
  const issues = [];
  const result = collectFreshPresentationStats({ _statEvents: [old] }, after, { onOrderConflict: issue => issues.push(issue) });
  assert.deepEqual(result.map(item => item.id), ['first', 'nested', 'last']);
  assert.equal(result[1], nested); // SERVER ONLY raw records, not wire projections.
  assert.deepEqual(issues, []);
  assert.deepEqual(collectFreshPresentationStats(after, structuredClone(after)), []);
});

test('real combined HP/SAN damage with a link reports local phase conflict without globally sorting stats', () => {
  const after = resolve(() => {
    const gs = state();
    addDamageLink(gs.players, 1, 2);
    const loss = submitLossEvents({ players: gs.players, deck: gs.deck, discard: gs.discard,
      log: gs.log, currentTurn: 0, events: [{ targetIdx: 1, lostHp: 1, lostSan: 1 }], statEventSeq: 1 });
    return { ...gs, ...appendStatChangeResult(gs, loss) };
  });
  const issues = [];
  const result = collectFreshPresentationStats({}, after, { onOrderConflict: issue => issues.push(issue) });
  assert.deepEqual(result.map(stat => stat.id), after._statEvents.map(stat => stat.id));
  assert.ok(issues.some(issue => issue.code === 'STAT_JOURNAL_PHASE_ORDER_CONFLICT'));
  const [issue] = issues.filter(item => item.code === 'STAT_JOURNAL_PHASE_ORDER_CONFLICT');
  const [earlier, later] = issue.statEventIds.map(id => after._statEvents.find(stat => stat.id === id));
  assert.ok(earlier.phaseOrder > later.phaseOrder);
  assert.equal(later.type, 'SAN_LOSS');
  const ordered = collectFreshPresentationStats({}, after, { orderOwnedPhases: true });
  assert.deepEqual(ordered.map(stat => stat.phaseOrder), [0, 0, 1, 2, 2]);
  const events = collectPublicRuleEvents(state(), after);
  assert.deepEqual(events.filter(event => ['statChanged', 'damageLinkBroken'].includes(event.type))
    .map(event => event.kind || event.type), ['HP_LOSS', 'SAN_LOSS', 'damageLinkBroken', 'HP_LOSS', 'HP_LOSS']);
  assert.equal(JSON.stringify(events).includes('statEventIds'), false);
});

test('public collector keeps SAN cause before inspection and its explicit HP consequence after it', () => {
  const before = state();
  const after = resolve(() => {
    const gs = structuredClone(before);
    const loss = submitLossEvents({ players: gs.players, deck: gs.deck, discard: gs.discard,
      log: gs.log, currentTurn: 0, events: [{ targetIdx: 1, lostSan: 1 }], statEventSeq: 1 });
    return inspect({ ...gs, ...appendStatChangeResult(gs, loss) },
      { name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' });
  });
  const events = collectPublicRuleEvents(before, after);
  assert.deepEqual(events.map(event => event.kind || event.type), ['SAN_LOSS', 'inspectionRevealed', 'HP_LOSS']);
  noSecrets(events);
});

test('local linked phase normalization never reorders independent settlements', () => {
  const stat = (id, phaseOrder, type = 'HP_LOSS') => ({ id, type, phaseOrder, target: 1 });
  const a = [stat('a2', 2), stat('ab', 1, 'DAMAGE_LINK_BREAK'), stat('a0', 0)];
  const b = [stat('b2', 2), stat('bb', 1, 'DAMAGE_LINK_BREAK'), stat('b0', 0)];
  const result = collectFreshPresentationStats({}, { _statEvents: [...a, ...b],
    _visualEvents: [{ id: 'a', type: 'statEvents', statEvents: a }, { id: 'b', type: 'statEvents', statEvents: b }] },
  { orderOwnedPhases: true });
  assert.deepEqual(result.map(event => event.id), ['a0', 'ab', 'a2', 'b0', 'bb', 'b2']);
});
