import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';

function initial() {
  return createPrivateMatch({ id: 'dodge-order', seed: 7, now: 0, state: {
    _isMP: true, _intentEngine: true, currentTurn: 0, turn: 1, _turnKey: 1, phase: 'DRAW_REVEAL',
    players: ['寻宝者', '追猎者', '邪祀者'].map((role, id) => ({ id, role, name: `P${id}`, hp: 10, san: 10,
      isDead: false, hand: [], godZone: [], zoneCards: [], peekMemories: {} })),
    deck: [], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: {},
    drawReveal: { card: { id: 'raw-negative', name: 'negative', type: 'selfDamageHP', val: 2, key: 'A1',
      isZone: true, letter: 'A', number: 1, polarity: 'negative', effectScope: 'self', dodgeable: true },
    drawerIdx: 0, needsDecision: true },
  } });
}
function act(record, type, payload = {}, random) {
  return resolveCommand(record, { permission: 'player', seat: 0 }, { version: 2, matchId: record.id,
    revision: record.revision, decisionId: record.decision.id, actionId: `dodge:${record.revision}`, type, payload },
  { now: 1, actions: migratedActions, random }).match;
}
for (const roll of [1, 6]) test(`actual treasure dodge roll ${roll} precedes consequences, keep and real income for every viewer`, () => {
  const pending = act(initial(), 'draw.keep');
  assert.equal(pending.state.phase, 'TREASURE_DODGE_DECISION');
  let draws = 0;
  const done = act(pending, 'treasureDodge.reply', { use: true }, () => { draws++; return (roll - 0.5) / 6; });
  assert.equal(draws, 1); assert.equal(done.state.players[0].hp, roll === 6 ? 10 : 8);
  for (const viewer of [{ permission: 'player', seat: 0 }, { permission: 'player', seat: 1 }, { permission: 'observer' }]) {
    const events = projectMatch(done, viewer, { handleForCard: () => 'opaque' }).events;
    const dice = events.findIndex(event => event.type === 'diceRolled');
    const kept = events.findIndex(event => event.type === 'cardRevealed' && event.reason === 'keep');
    const income = events.findIndex(event => event.type === 'cardIncomeCommitted');
    assert.equal(events[dice].roll, roll); assert.ok(dice < kept && kept < income);
    if (roll === 1) assert.ok(dice < events.findIndex(event => event.kind === 'HP_LOSS'));
    else assert.equal(events.some(event => event.kind === 'HP_LOSS'), false);
    assert.equal(JSON.stringify(events).includes('presentationAfter'), false);
    assert.equal(JSON.stringify(events).includes('raw-negative'), false);
  }
});
test('sphinx reveal and failed dodge each precede their actual HP consequence', () => {
  const start = initial(); Object.assign(start.state, { phase: 'SPHINX_GUESS', drawReveal: null,
    abilityData: { playerIndex: 0 }, deck: [{ id: 'raw-sphinx', name: 'normal', type: 'treasure' }] });
  const pending = act(start, 'sphinx.guess', { isZone: true });
  const done = act(pending, 'sphinx.dodge', { use: true }, () => 0);
  const events = projectMatch(done, { permission: 'observer' }, { handleForCard: () => 'opaque' }).events;
  assert.deepEqual(events.filter(event => ['sphinxRevealed', 'diceRolled', 'statChanged'].includes(event.type))
    .map(event => event.kind || event.type), ['sphinxRevealed', 'diceRolled', 'HP_LOSS']);
  start.state.players[0].role = '邪祀者';
  const direct = act(start, 'sphinx.guess', { isZone: true });
  assert.deepEqual(direct.publicEvents.filter(event => ['sphinxRevealed', 'statChanged'].includes(event.type))
    .map(event => event.kind || event.type), ['sphinxRevealed', 'HP_LOSS']);
});
