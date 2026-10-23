import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
import { drawAuthorityCard } from '../src/authority/automatic.js';
import { collectSafeComplexPresentationEvents } from '../src/authority/presentationComplexEvents.js';
import { executeRuleResolution } from '../src/execution.js';

const secret = 'DECK-MOVE-PRIVATE-CANARY';
const card = id => ({ id, name: `private-${id}`, type: 'healHP', val: 1,
  key: 'A2', letter: 'A', number: 2, isZone: true, privateMetadata: secret });
function initial() {
  return { _intentEngine: true, _isMP: true, phase: 'ACTION', currentTurn: 0, turn: 1, _turnKey: 1,
    players: ['邪祀者', '追猎者', '寻宝者'].map((role, id) => ({ id, role, name: `P${id}`,
      hp: 10, san: 10, hand: [], godZone: [], zoneCards: [], peekMemories: {}, isDead: false })),
    deck: [card('raw-top'), card('raw-next'), card('raw-bottom')], discard: [],
    inspectionDeck: [], inspectionDiscard: [], abilityData: {}, log: [], _visualEvents: [], _statEvents: [] };
}
const record = state => createPrivateMatch({ id: 'deck-moves', state, seed: 233, now: 0 });
function command(match, seat, type, payload) {
  const message = { version: 2, matchId: match.id, revision: match.revision,
    decisionId: match.decision.id, actionId: `move-${match.revision}`, type, payload };
  return resolveCommand(match, { permission: 'player', seat }, message,
    { now: 1, source: 'offline', actions: migratedActions }).match;
}
function projected(match, seat) {
  const handles = new Map();
  return projectMatch(match, Number.isInteger(seat) ? { permission: 'player', seat } : { permission: 'observer' },
    { actions: migratedActions, handleForCard: (_seat, id) => {
      if (!handles.has(id)) handles.set(id, `opaque-${handles.size}`);
      return handles.get(id);
    } });
}
const types = match => match.publicEvents.map(event => event.kind || event.type);
function buryState() {
  const state = initial(); state.phase = 'BURY_ALIVE_SELECT';
  state.players[0].hand = [card('raw-owner'), card('raw-retained')];
  state.players[1].hand = [card('raw-other')];
  state.abilityData = { targets: [0, 1], buryAliveChoices: [null, null, null] };
  return state;
}
test('bury.commit publishes no move until all choices lock, then actual target order reaches deck bottom exactly once', () => {
  const start = record(buryState()), first = command(start, 0, 'bury.commit', { cardIndex: 0 });
  assert.deepEqual(first.state.deck, start.state.deck);
  assert.deepEqual(first.state.players.map(player => player.hand), start.state.players.map(player => player.hand));
  assert.equal(first.publicEvents.some(event => event.type === 'buriedToDeck'), false);
  const done = command(first, 1, 'bury.commit', { cardIndex: 0 });
  assert.deepEqual(done.state.deck.slice(-2).map(item => item.id), ['raw-owner', 'raw-other']);
  assert.deepEqual(done.state.players.map(player => player.hand.length), [1, 0, 0]);
  const moves = done.publicEvents.filter(event => event.type === 'buriedToDeck');
  assert.deepEqual(moves.map(event => [event.seat, event.sourceCount]), [[0, 1], [1, 0]]);
  assert.deepEqual(done.random, start.random);
  assert.ok(types(done).indexOf('buriedToDeck') < types(done).indexOf('cardCountChanged'));
});
test('bury faces belong only to that owner; opponents and observer see backs with no physical IDs or nested metadata', () => {
  const done = command(command(record(buryState()), 0, 'bury.commit', { cardIndex: 0 }), 1, 'bury.commit', { cardIndex: 0 });
  for (const viewer of [0, 1, 2, null]) {
    const events = projected(done, viewer).events.filter(event => event.type === 'buriedToDeck');
    assert.equal(events.length, 2);
    for (const event of events) {
      if (viewer === event.seat) assert.equal(event.cards[0].name, `private-raw-${event.seat === 0 ? 'owner' : 'other'}`);
      else assert.deepEqual(event.cards, [{ _back: true }]);
      assert.equal(JSON.stringify(event).includes(secret), false);
      assert.equal(JSON.stringify(event).includes('presentation'), false);
      assert.equal(JSON.stringify(event).includes('"id":"raw-'), false);
    }
  }
});
function zhuState(sphinx = false) {
  const state = initial(); Object.assign(state.players[0], { godName: 'ZHU', godLevel: 1 });
  state.zhuLight = { ownerIdx: 0, level: 1, cardIds: [state.deck[0].id], lightNonce: 1 };
  if (sphinx) { state.phase = 'SPHINX_GUESS'; state.abilityData = { playerIndex: 1 }; return state; }
  return executeRuleResolution({ namespace: 'zhu-guard', random: () => .9, now: 0 }, () => drawAuthorityCard(state, 1));
}
for (const sphinx of [false, true]) {
  const action = sphinx ? 'zhu.hideSphinx' : 'zhu.hide';
  test(`${action}: actual top-to-bottom move precedes replacement reveal, with authorized owner face only`, () => {
    const start = record(zhuState(sphinx)), done = command(start, 0, action, { hide: true });
    assert.equal(done.state.deck.at(-1).id, 'raw-top');
    assert.equal(done.state.zhuLight.cardIds.includes('raw-top'), false);
    assert.equal(done.publicEvents.filter(event => event.type === 'zhuCardHidden').length, 1);
    assert.equal(done.random.draws, start.random.draws);
    if (!sphinx) assert.deepEqual(types(done).slice(0, 2), ['zhuCardHidden', 'cardRevealed']);
    else assert.equal(done.state.phase, 'SPHINX_GUESS');
    for (const viewer of [0, 1, 2, null]) {
      const event = projected(done, viewer).events.find(item => item.type === 'zhuCardHidden');
      if (viewer === 0) assert.equal(event.card.name, 'private-raw-top');
      else assert.deepEqual(event.card, { _back: true });
      assert.equal(JSON.stringify(event).includes(secret), false);
      assert.equal(JSON.stringify(event).includes('presentation'), false);
    }
  });
  test(`${action}: declining leaves no move cue and consumes no extra entropy`, () => {
    const start = record(zhuState(sphinx)), done = command(start, 0, action, { hide: false });
    assert.equal(done.publicEvents.some(event => event.type === 'zhuCardHidden'), false);
    assert.equal(done.random.draws, start.random.draws);
    if (sphinx) assert.deepEqual(done.state.deck, start.state.deck);
    else assert.equal(done.state.drawReveal.card.id, 'raw-top');
  });
}
test('black goat pulse is emitted by actual token count before HP/SAN, after banner, before draw', () => {
  const state = initial(); state.players[1].hand = [{ id: 'public-goat', isBlackGoatYoung: true, type: 'blackGoatYoung', name: '黑山羊幼仔' }];
  const start = record(state), done = command(start, 0, 'turn.end', {});
  assert.deepEqual(types(done).slice(0, 5), ['turnStarted', 'blackGoatPulse', 'HP_LOSS', 'SAN_LOSS', 'cardRevealed']);
  const pulse = projected(done, null).events.find(event => event.type === 'blackGoatPulse');
  assert.equal(pulse.seat, 1); assert.equal(pulse.count, 1);
  assert.deepEqual([done.state.players[1].hp, done.state.players[1].san], [9, 9]);
  assert.equal(done.random.draws, start.random.draws);
});
test('no token and no actual deck move cannot manufacture cues from final snapshots', () => {
  const before = initial(), after = structuredClone(before);
  after.deck.reverse(); after.players[1].hand = [card('unrelated')];
  assert.deepEqual(collectSafeComplexPresentationEvents(before, after), []);
  const done = command(record(before), 0, 'turn.end', {});
  assert.equal(done.publicEvents.some(event => event.type === 'blackGoatPulse'), false);
});

for (const correct of [true, false]) test(`sphinx ${correct ? 'correct' : 'wrong'} publishes one actual income after reveal and before penalty`, () => {
  const state = initial(); state.phase = 'SPHINX_GUESS'; state.abilityData = { playerIndex: 0 };
  const start = record(state), done = command(start, 0, 'sphinx.guess', { isZone: correct });
  const income = done.publicEvents.filter(event => event.type === 'cardIncomeCommitted');
  assert.equal(income.length, 1);
  assert.equal(income[0].card.id, 'raw-top');
  assert.equal(income[0].destination, correct ? 'hand' : 'discard');
  assert.equal((correct ? done.state.players[0].hand : done.state.discard)[0].id, 'raw-top');
  assert.deepEqual(types(done).slice(0, correct ? 2 : 3), correct
    ? ['sphinxRevealed', 'cardIncomeCommitted'] : ['sphinxRevealed', 'cardIncomeCommitted', 'HP_LOSS']);
  assert.equal(done.state.players[0].hp, correct ? 10 : 7);
  assert.equal(done.random.draws, start.random.draws);
  const wire = projected(done, null).events.find(event => event.type === 'cardIncomeCommitted');
  assert.equal(wire.card.name, 'private-raw-top');
  assert.equal(JSON.stringify(wire).includes(secret), false);
});
test('sphinx treasure dodge has already discarded guessed card once; later dice never duplicate that income', () => {
  const state = initial(); state.players[0].role = '寻宝者'; state.phase = 'SPHINX_GUESS'; state.abilityData = { playerIndex: 0 };
  const guessed = command(record(state), 0, 'sphinx.guess', { isZone: false });
  assert.equal(guessed.state.phase, 'TREASURE_DODGE_DECISION');
  assert.equal(guessed.publicEvents.filter(event => event.type === 'cardIncomeCommitted').length, 1);
  const done = command(guessed, 0, 'sphinx.dodge', { use: false });
  assert.equal(done.publicEvents.filter(event => event.type === 'cardIncomeCommitted').length, 1);
  assert.equal(done.state.discard.filter(item => item.id === 'raw-top').length, 1);
});
test('resting skipped seat wakes once before the following real turn and draw', () => {
  const state = initial(); state.players[1].isResting = true;
  const start = record(state), done = command(start, 0, 'turn.end', {});
  assert.equal(done.state.players[1].isResting, false);
  assert.equal(done.state.currentTurn, 2);
  assert.deepEqual(types(done).slice(0, 3), ['playerRestChanged', 'turnStarted', 'cardRevealed']);
  assert.equal(done.publicEvents.filter(event => event.type === 'playerRestChanged').length, 1);
  const wake = projected(done, null).events.find(event => event.type === 'playerRestChanged');
  assert.equal(wake.seat, 1); assert.equal(wake.isResting, false);
  assert.equal(done.random.draws, start.random.draws);
});
test('multiple resting seats retain actual wake order through recursive journal reset', () => {
  const state = initial(); state.players[1].isResting = true; state.players[2].isResting = true;
  const done = command(record(state), 0, 'turn.end', {});
  assert.equal(done.state.currentTurn, 0);
  assert.deepEqual(done.publicEvents.filter(event => event.type === 'playerRestChanged').map(event => event.seat), [1, 2]);
  assert.deepEqual(types(done).slice(0, 4), ['playerRestChanged', 'playerRestChanged', 'turnStarted', 'cardRevealed']);
});
