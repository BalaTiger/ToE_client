import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRuleResolution } from '../src/execution.js';
import { advanceAutomaticRules } from '../src/authority/automatic.js';
import { appendCommittedPublicEvent } from '../src/authority/incomeEvents.js';
import { collectPublicRuleEvents } from '../src/authority/events.js';
import { createPrivateMatch } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
import { submitLossEvents } from '../src/game/effectEngine.js';
import { buildStatChangeStatePatch } from '../src/game/statChangeEngine.js';
import { checkWin } from '../src/game/victory.js';

const secret = 'PRIVATE-METADATA-CANARY';
const futureSecret = 'PRIVATE-FUTURE-DECK-CANARY';
const card = id => ({ id, name: `choice-${id}`, type: 'healHP', val: 1, isZone: true,
  key: 'A2', letter: 'A', number: 2, privateMetadata: secret });
function initial(phase, { terminal = false } = {}) {
  const state = { _intentEngine: true, _isMP: true, currentTurn: 1, turn: 3, _turnKey: 3, phase,
    players: ['邪祀者', '追猎者', '寻宝者'].map((role, id) => ({ id, name: `P${id}`, role,
      hp: id === 0 ? 1 : 10, san: 10, isDead: terminal && id === 2,
      hand: [], godZone: [], zoneCards: [], peekMemories: {} })),
    deck: [{ ...card('future'), name: futureSecret }], discard: [], inspectionDeck: [], inspectionDiscard: [],
    abilityData: { playerIndex: 0 }, drawReveal: null, log: [], _statEvents: [], _visualEvents: [] };
  if (phase === 'DRAW_REVEAL') state.drawReveal = { card: card('draw'), drawerIdx: 0, needsDecision: true };
  else if (phase === 'GOD_CHOICE') state.abilityData = { godCard: { ...card('god'), isGod: true, godKey: 'TSG' }, drawerIdx: 0 };
  else {
    state.abilityData.revealedCards = [card('pool-a'), card('pool-b')];
    if (phase === 'TORTOISE_ORACLE_SELECT') state.abilityData.selectableKeys = ['A'];
    if (phase === 'FIRST_COME_PICK_SELECT') Object.assign(state.abilityData, { pickOrder: [0], pickIndex: 0 });
  }
  return state;
}
function locations(state) {
  return [...state.deck, ...state.discard, ...state.players.flatMap(player => [...player.hand, ...player.godZone, ...player.zoneCards])];
}
function reserved(state) {
  return [state.drawReveal?.card, state.abilityData.godCard, ...(state.abilityData.revealedCards || []),
    ...(state._decisionContinuations || []).map(frame => frame.abilityData.godCard), state._clockContinuation?.drawReveal?.card].filter(Boolean);
}
function killAndSettle(before, { alreadyDiscarded = false } = {}) {
  let calls = 0;
  const after = executeRuleResolution({ namespace: 'dead-chooser', now: 0, random: () => { calls++; return .9; } }, () => {
    let state = structuredClone(before);
    const damage = submitLossEvents({ players: state.players, deck: state.deck, discard: state.discard, log: state.log,
      currentTurn: state.currentTurn, statEventSeq: 1, events: [{ targetIdx: 0, lostHp: 1, source: 'death fixture' }] });
    state = { ...state, ...buildStatChangeStatePatch(state, damage), gameOver: checkWin(state.players, true) };
    if (alreadyDiscarded) {
      const pending = state.drawReveal?.card || state.abilityData.godCard;
      state.discard.push(pending);
      state = appendCommittedPublicEvent(state, { type: 'cardIncomeCommitted', seat: 0, card: pending,
        destination: 'discard', source: 'reveal' });
    }
    return advanceAutomaticRules(state, before);
  });
  return { after, events: collectPublicRuleEvents(before, after), calls };
}
function view(state, events, viewer) {
  const match = createPrivateMatch({ id: 'dead-chooser', state, seed: 7, now: 0 });
  match.publicEvents = events.map((event, index) => ({ ...event, id: `event-${index}`, visibility: 'public' }));
  const handles = new Map();
  return projectMatch(match, viewer === null ? { permission: 'observer' } : { permission: 'player', seat: viewer },
    { actions: migratedActions, handleForCard: (_seat, id) => {
      if (!handles.has(id)) handles.set(id, `opaque-${handles.size}`);
      return handles.get(id);
    } });
}
for (const terminal of [false, true]) for (const phase of ['DRAW_REVEAL', 'GOD_CHOICE', 'DECIPHER_STONE_CARVING', 'TORTOISE_ORACLE_SELECT', 'FIRST_COME_PICK_SELECT']) {
  test(`${terminal ? 'terminal' : 'nonterminal'} ${phase}: actual dead-chooser discard is conserved, ordered and public only after commit`, () => {
    const before = initial(phase, { terminal });
    const { after, events, calls } = killAndSettle(before);
    assert.equal(after.players[0].isDead, true);
    assert.equal(!!after.gameOver, terminal);
    assert.equal(calls, 0);
    const baseline = [...locations(before), ...reserved(before)].map(item => item.id).sort();
    assert.deepEqual(locations(after).map(item => item.id).sort(), baseline);
    const incomes = events.filter(event => event.type === 'cardIncomeCommitted');
    assert.deepEqual(incomes.map(event => event.card.id), reserved(before).map(item => item.id));
    for (const income of incomes) {
      assert.equal(income.seat, 0);
      assert.equal(income.destination, 'discard');
      assert.ok(events.indexOf(income) > events.findIndex(event => event.defeated));
    }
    for (const viewer of [0, 1, null]) {
      const prior = view(before, [], viewer), next = view(after, events, viewer);
      if (phase === 'DECIPHER_STONE_CARVING') {
        assert.equal(JSON.stringify(prior).includes('choice-pool-a'), viewer === 0);
      }
      const wireIncome = next.events.filter(event => event.type === 'cardIncomeCommitted');
      assert.deepEqual(wireIncome.map(event => event.card.name), reserved(before).map(item => item.name));
      assert.equal(JSON.stringify(next).includes(secret), false);
      assert.equal(JSON.stringify(next).includes(futureSecret), false);
      assert.equal(JSON.stringify(wireIncome).includes('presentation'), false);
      assert.ok(wireIncome.every(event => event.card.id.startsWith('opaque-')));
    }
    const clean = { ...after }; delete clean._pendingPublicEvents;
    const again = executeRuleResolution({ namespace: 'repeat', now: 1, random: () => { throw Error('unexpected RNG'); } },
      () => advanceAutomaticRules(clean));
    assert.equal((again._pendingPublicEvents || []).length, 0);
    assert.deepEqual(locations(again).map(item => item.id), locations(after).map(item => item.id));
  });
}
test('already committed clock discard is not duplicated by dead-chooser cleanup', () => {
  const before = initial('DRAW_REVEAL');
  const { after, events, calls } = killAndSettle(before, { alreadyDiscarded: true });
  assert.equal(events.filter(event => event.type === 'cardIncomeCommitted').length, 1);
  assert.equal(after.discard.filter(item => item.id === 'draw').length, 1);
  assert.equal(calls, 0);
});
test('a live private chooser produces no discard receipt and retains its private reservation', () => {
  const before = initial('DECIPHER_STONE_CARVING');
  const after = executeRuleResolution({ namespace: 'live-choice', now: 0, random: () => { throw Error('unexpected RNG'); } },
    () => advanceAutomaticRules(structuredClone(before)));
  assert.equal((after._pendingPublicEvents || []).length, 0);
  assert.deepEqual(after.discard, []);
  assert.deepEqual(after.abilityData.revealedCards, before.abilityData.revealedCards);
});
test('a dead first-pick chooser passes the still-reserved public pool to a remaining live picker without discard', () => {
  const before = initial('FIRST_COME_PICK_SELECT'); before.abilityData.pickOrder = [0, 2];
  const { after, events } = killAndSettle(before);
  assert.equal(after.phase, 'FIRST_COME_PICK_SELECT');
  assert.equal(after.abilityData.pickIndex, 1);
  assert.deepEqual(after.abilityData.revealedCards, before.abilityData.revealedCards);
  assert.equal(events.some(event => event.type === 'cardIncomeCommitted'), false);
});
test('terminal clock and god-frame aliases emit one receipt per actual physical discard', () => {
  const before = initial('DRAW_REVEAL', { terminal: true });
  const pendingGod = { ...card('frame-god'), isGod: true, godKey: 'TSG' };
  before._clockContinuation = { drawReveal: { card: before.drawReveal.card, drawerIdx: 0 } };
  before._decisionContinuations = [{ phase: 'GOD_CHOICE', abilityData: { godCard: pendingGod, drawerIdx: 0 } }];
  const { after, events } = killAndSettle(before);
  assert.deepEqual(events.filter(event => event.type === 'cardIncomeCommitted').map(event => event.card.id), ['draw', 'frame-god']);
  assert.equal(new Set(locations(after).map(item => item.id)).size, locations(after).length);
});
