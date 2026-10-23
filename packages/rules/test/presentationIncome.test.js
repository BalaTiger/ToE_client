import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
import { keepDraw } from '../src/authority/draw.js';
import { executeRuleResolution } from '../src/execution.js';
import { FIXED_ZONE_CARD_VARIANTS_BY_KEY } from '../src/constants/card.js';
import { DEFAULT_EXPANSION_KEY } from '../src/game/setup.js';
import { ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST } from '../src/game/coreUtils.js';

function physicalCard(type, id = 'income-card') {
  const [key, variants] = Object.entries(FIXED_ZONE_CARD_VARIANTS_BY_KEY).find(([, cards]) =>
    cards.some(card => card.type === type && card.expansion === DEFAULT_EXPANSION_KEY));
  const definition = variants.find(card => card.type === type && card.expansion === DEFAULT_EXPANSION_KEY);
  return { ...definition, id, key, letter: key[0], number: Number(key[1]), isZone: true };
}
function initial(type = 'selfHealHP') {
  return createPrivateMatch({ id: 'income', seed: 7, now: 0, state: {
    _isMP: true, _intentEngine: true, currentTurn: 1, turn: 1, _turnKey: 1, phase: 'DRAW_REVEAL',
    players: [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST].map((role, id) => ({
      id, role, name: `P${id}`, hp: 9, san: 10, isDead: false,
      hand: [], godZone: [], zoneCards: [], peekMemories: {},
    })),
    deck: [], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: {},
    drawReveal: { card: physicalCard(type), drawerIdx: 1, needsDecision: true },
  } });
}
const command = (match, type, payload = {}) => ({ version: 2, matchId: match.id,
  revision: match.revision, decisionId: match.decision.id, actionId: `income:${match.revision}`, type, payload });
const resolve = (match, seat, wire) => resolveCommand(match, { permission: 'player', seat }, wire,
  { now: 1, actions: migratedActions });
const act = (match, seat, type, payload = {}) => resolve(match, seat, command(match, type, payload)).match;
const incomes = match => match.publicEvents.filter(event => event.type === 'cardIncomeCommitted');
function bewitchInitial(type = 'selfHealHP') {
  const match = initial(type), card = match.state.drawReveal.card;
  Object.assign(match.state, { currentTurn: 0, phase: 'ACTION', drawReveal: null });
  [ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE].forEach((role, seat) => { match.state.players[seat].role = role; });
  match.state.players[0].hand = [card];
  return match;
}
function give(match) {
  let next = act(match, 0, 'skill.begin');
  next = act(next, 0, 'bewitch.chooseCard', { cardIndex: 0 });
  return act(next, 0, 'bewitch.selectTarget', { targetSeat: 1 });
}

test('a real kept heal publishes its committed hand destination after its effect, exactly once on retries', () => {
  const before = initial(), wire = command(before, 'draw.keep');
  const done = resolve(before, 1, wire).match;
  assert.equal(before.state.players[1].hand.length, 0);
  assert.equal(done.state.players[1].hp, 10);
  assert.equal(done.state.players[1].hand[0].id, 'income-card');
  const [income] = incomes(done);
  assert.equal(incomes(done).length, 1);
  assert.deepEqual(income, { type: 'cardIncomeCommitted', seat: 1, card: physicalCard('selfHealHP'),
    destination: 'hand', source: 'reveal', visibility: 'public', id: income.id });
  assert.ok(done.publicEvents.indexOf(income) > done.publicEvents.findIndex(event => event.type === 'statChanged'));
  assert.equal(done.random.draws, before.random.draws);
  const duplicate = resolve(done, 1, wire);
  assert.equal(duplicate.acknowledgement.duplicate, true);
  assert.equal(duplicate.match, done);
  assert.equal(incomes(duplicate.match).length, 1);
});

test('a kept lethal card publishes the actual discard destination after the drawer dies', () => {
  const before = initial('selfDamageHP'); before.state.players[1].hp = 1;
  before.state.deck = [physicalCard('selfHealHP', 'future-card')];
  const done = act(before, 1, 'draw.keep');
  assert.equal(done.state.players[1].isDead, true);
  assert.equal(done.state.players[1].hand.length, 0);
  assert.equal(done.state.discard.filter(card => card.id === 'income-card').length, 1);
  assert.equal(incomes(done).length, 1);
  assert.equal(incomes(done)[0].destination, 'discard');
  assert.equal(incomes(done)[0].seat, 1);
  assert.ok(done.publicEvents.indexOf(incomes(done)[0]) > done.publicEvents.findIndex(event => event.defeated));
});

test('a sealed dodge window emits no income until every affected treasure has answered', () => {
  const before = initial('allDamageHP'); before.state.players[2].role = ROLE_TREASURE;
  const prompted = act(before, 1, 'draw.keep');
  assert.deepEqual(incomes(prompted), []);
  assert.equal(prompted.state.players[1].hand.length, 0);
  const first = act(prompted, 0, 'treasureDodge.reply', { use: false });
  assert.deepEqual(incomes(first), []);
  assert.equal(first.state.players[1].hp, 9);
  const done = act(first, 2, 'treasureDodge.reply', { use: false });
  assert.equal(done.state.players[1].hp, 5);
  assert.equal(incomes(done).length, 1);
  assert.equal(incomes(done)[0].destination, 'hand');
  assert.equal(done.state.players[1].hand[0].id, 'income-card');
});

for (const type of ['caveDuel', 'swapAllHands']) {
  test(`${type} cannot claim income while its target selection is pending`, () => {
    const before = initial(type);
    before.state.players.forEach((player, seat) => { player.hand = [physicalCard('selfHealHP', `held-${seat}`)]; });
    const pending = act(before, 1, 'draw.keep');
    assert.deepEqual(incomes(pending), []);
    assert.equal(pending.state.abilityData.pendingZoneIncome.card.id, 'income-card');
    assert.equal(pending.state.abilityData.pendingZoneIncome.presentationSource, 'reveal');
    assert.equal(pending.state.players.some(player => player.hand.some(card => card.id === 'income-card')), false);
  });
}

test('a pending damage reaction cannot claim income before the responding player decides', () => {
  const before = initial('allDamageHP'); before.state.players[2].etherealizeStacks = 1;
  const dodge = act(before, 1, 'draw.keep');
  const pending = act(dodge, 0, 'treasureDodge.reply', { use: false });
  assert.equal(pending.state.phase, 'ETHEREALIZE_DECISION');
  assert.deepEqual(incomes(pending), []);
  assert.equal(pending.state.abilityData.pendingZoneIncome.card.id, 'income-card');
  assert.equal(pending.state.abilityData.pendingZoneIncome.presentationSource, 'reveal');
  assert.equal(pending.state.players[1].hand.length, 0);
});

test('replaying an already held zone card does not announce a new physical income', () => {
  const before = initial();
  before.state.players[1].hand = [before.state.drawReveal.card];
  before.state.drawReveal.fromEndTurnReplay = true;
  const after = executeRuleResolution({ cursor: before.random, now: 1, namespace: 'income-replay' },
    () => keepDraw(structuredClone(before.state)));
  assert.equal(after.players[1].hp, 10);
  assert.equal(after.players[1].hand.length, 1);
  assert.deepEqual(after._pendingPublicEvents.filter(event => event.type === 'cardIncomeCommitted'), []);
});

test('a public bewitch heal commits target income only after gift reveal and actual recovery', () => {
  const before = bewitchInitial(), done = give(before), [income] = incomes(done);
  assert.equal(done.state.players[0].hand.length, 0);
  assert.equal(done.state.players[1].hp, 10);
  assert.equal(done.state.players[1].hand[0].id, 'income-card');
  assert.equal(incomes(done).length, 1);
  assert.equal(income.seat, 1); assert.equal(income.destination, 'hand');
  const givenIndex = done.publicEvents.findIndex(event => event.type === 'bewitchGiven');
  const statIndex = done.publicEvents.findIndex(event => event.type === 'statChanged');
  assert.ok(givenIndex >= 0 && givenIndex < statIndex && statIndex < done.publicEvents.indexOf(income));
  assert.equal(done.random.draws, before.random.draws);
});

test('a lethal public bewitch card commits to discard rather than the defeated target hand', () => {
  const before = bewitchInitial('selfDamageHP'); before.state.players[1].hp = 1;
  const done = give(before);
  assert.equal(done.state.players[1].isDead, true);
  assert.equal(done.state.players[1].hand.length, 0);
  assert.equal(done.state.discard.filter(card => card.id === 'income-card').length, 1);
  assert.equal(incomes(done).length, 1);
  assert.equal(incomes(done)[0].destination, 'discard');
  assert.equal(incomes(done)[0].seat, 1);
});

test('a bewitch hand swap exposes no income before its real choice and commits once afterwards', () => {
  const before = bewitchInitial('swapAllHands');
  before.state.players[1].hand = [physicalCard('selfHealHP', 'target-held')];
  before.state.players[2].hand = [physicalCard('selfDamageHP', 'other-held')];
  const pending = give(before);
  assert.equal(pending.state.phase, 'ZONE_SWAP_SELECT_TARGET');
  assert.deepEqual(incomes(pending), []);
  assert.equal(pending.state.abilityData.pendingZoneIncome.presentationSource, 'reveal');
  const wire = command(pending, 'zoneSwap.selectTarget', { targetSeat: 2 });
  const done = resolve(pending, 1, wire).match;
  assert.deepEqual(done.state.players[1].hand.map(card => card.id), ['other-held', 'income-card']);
  assert.deepEqual(done.state.players[2].hand.map(card => card.id), ['target-held']);
  assert.equal(incomes(done).length, 1);
  assert.equal(incomes(done)[0].destination, 'hand');
  assert.equal(incomes(done)[0].seat, 1);
  assert.equal(resolve(done, 1, wire).acknowledgement.duplicate, true);
  assert.equal(incomes(resolve(done, 1, wire).match).length, 1);
});

test('income projection keeps only its public face and destination, never internal provenance or private metadata', () => {
  const before = initial(); before.state.drawReveal.card.privateMetadata = 'income-private-canary';
  const done = act(before, 1, 'draw.keep');
  const view = projectMatch(done, { permission: 'observer' }, {
    actions: migratedActions, handleForCard: (_seat, id) => `opaque:${id}`,
  });
  const [income] = view.events.filter(event => event.type === 'cardIncomeCommitted');
  assert.equal(income.destination, 'hand'); assert.equal(income.source, 'reveal');
  assert.equal(income.card.name, physicalCard('selfHealHP').name);
  assert.equal(JSON.stringify(view).includes('income-private-canary'), false);
  assert.equal(JSON.stringify(view).includes('presentationSource'), false);
});
