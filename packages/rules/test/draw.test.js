import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { drawActions } from '../src/authority/draw.js';
import { projectMatch } from '../src/authority/view.js';
import { collectPublicRuleEvents } from '../src/authority/events.js';
import { playerDrawCard } from '../src/game/turnEngine.js';
import { executeRuleResolution } from '../src/execution.js';

test('a dead drawer consumes neither a physical card nor entropy while its turn is being skipped', () => {
  const match = initial(); match.state.players[1].isDead = true; match.state.players[1].hp = 0;
  match.state.deck = [makeCard()]; const before = structuredClone(match);
  const result = executeRuleResolution({ cursor: match.random, now: 0, namespace: 'dead-draw' },
    () => playerDrawCard(match.state.players, match.state.deck, match.state.discard, 1, match.state));
  assert.equal(result.drawnCard, null); assert.deepEqual(result.D, before.state.deck);
  assert.deepEqual(result.Disc, before.state.discard); assert.deepEqual(match.random, before.random);
});
const makeCard = (type = 'selfDamageHP') => ({ id: 'zone', name: 'test card', type, val: 2, key: 'A1',
  isZone: true, letter: 'A', number: 1, polarity: 'negative', effectScope: 'self' });
function initial(card = makeCard(), extra = {}) {
  return createPrivateMatch({ id: 'draw', seed: 7, now: 0, state: { _isMP: true, _intentEngine: true,
    currentTurn: 1, turn: 1, _turnKey: 1, phase: 'DRAW_REVEAL',
    players: ['寻宝者', '寻宝者', '追猎者'].map((role, id) => ({ id, role, name: `P${id}`, hp: 10, san: 10,
      isDead: false, hand: [], godZone: [], zoneCards: [], peekMemories: {} })),
    deck: [], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: {},
    drawReveal: { card, drawerIdx: 1, needsDecision: true }, ...extra,
  } });
}
function command(match, type, payload = {}, id = `a${match.revision}`) {
  return { version: 2, matchId: match.id, revision: match.revision,
    decisionId: match.decision.id, actionId: id, type, payload };
}
function act(match, seat, type, payload = {}) {
  return resolveCommand(match, { permission: 'player', seat }, command(match, type, payload), { now: 1, actions: drawActions }).match;
}
const project = (match, seat) => projectMatch(match, seat === null ? { permission: 'observer' } : { permission: 'player', seat },
  { actions: drawActions, handleForCard: (_seat, id) => `opaque:${id}` });

test('an unimplemented canonical card effect rejects transactionally instead of silently settling as no effect', () => {
  const match = initial(makeCard('unimplemented-private-effect'));
  match.state.players[1].role = '邪祀者';
  const before = structuredClone(match);
  assert.throws(() => act(match, 1, 'draw.keep'), { code: 'unsupported_effect' });
  assert.deepEqual(match, before);
});

test('public draw animations cannot expose the identity of a blind card to its drawer before their decision', () => {
  const match = initial({ ...makeCard('selfHealHP'), name: 'blind-identity-canary' });
  match.state.drawReveal.blindZoneIdentity = true;
  const before = { ...match.state, phase: 'ACTION', drawReveal: null };
  match.publicEvents = collectPublicRuleEvents(before, match.state).map((event, index) => ({ ...event, id: `draw-event:${index}`, visibility: 'public' }));
  assert.equal(JSON.stringify(project(match, 1)).includes('blind-identity-canary'), false);
  assert.equal(JSON.stringify(project(match, 0)).includes('blind-identity-canary'), true);
  const done = act(match, 1, 'draw.discard');
  assert.equal(JSON.stringify(project(done, 1)).includes('blind-identity-canary'), true);
  assert.equal(project(done, 1).events.filter(event => event.type === 'cardRevealed').length, 1);
});

test('only the actual drawer can decide; client rolls, cards and forced discards are rejected', () => {
  const start = initial();
  assert.throws(() => act(start, 0, 'draw.keep'), /not_your_decision/);
  assert.throws(() => act(start, 1, 'draw.keep', { roll: 6 }), /invalid_command/);
  start.state.drawReveal.forcedKeep = true;
  assert.throws(() => act(start, 1, 'draw.discard'), /illegal_action/);
  assert.deepEqual(project(start, 1).decision.actions.map(a => a.type), ['draw.keep']);
});

test('discard clears blind identity exactly once and retains semantic continuation without animation', () => {
  const start = initial({ ...makeCard(), blindZoneIdentity: true });
  start.state.drawReveal.blindZoneIdentity = true; start.state.drawReveal.fromRest = true;
  start.state.abilityData.cthDrawsRemaining = 2; start.state.players[1].blindNextZoneDecision = true;
  start.state.deck = [{ ...makeCard(), id: 'next-rest-draw' }];
  assert.equal(project(start, 1).draw.hidden, true); assert.equal(project(start, 1).draw.card, undefined);
  assert.equal(project(start, 0).draw.card.name, 'test card');
  const wire = command(start, 'draw.discard');
  const result = resolveCommand(start, { permission: 'player', seat: 1 }, wire, { now: 1, actions: drawActions });
  const done = result.match;
  assert.equal(done.state.discard.length, 1); assert.equal(done.state.discard[0].blindZoneIdentity, undefined);
  assert.equal(done.state.players[1].blindNextZoneDecision, false); assert.equal(done.state.players[1].hp, 10);
  assert.deepEqual(done.state._ruleContinuation, { kind: 'restDraw', owner: 1 });
  assert.equal(done.state.abilityData.cthDrawsRemaining, 1);
  assert.equal(done.state.drawReveal.card.id, 'next-rest-draw');
  assert.equal(resolveCommand(done, { permission: 'player', seat: 1 }, wire, { now: 1, actions: drawActions }).acknowledgement.duplicate, true);
});

test('all affected treasure seats answer a sealed window and the wide effect applies once after both replies', () => {
  const start = initial({ ...makeCard('allDamageHP'), effectScope: 'all' });
  const prompted = act(start, 1, 'draw.keep'), baseline = prompted.decision;
  assert.equal(prompted.state.players[2].hp, 10);
  const firstCommand = command(prompted, 'treasureDodge.reply', { use: false }, 'first');
  const secondCommand = command(prompted, 'treasureDodge.reply', { use: false }, 'second');
  const first = resolveCommand(prompted, { permission: 'player', seat: 0 }, firstCommand, { now: 1, actions: drawActions }).match;
  assert.deepEqual(first.decision, baseline); assert.equal(first.state.players[2].hp, 10);
  assert.deepEqual(project(first, 0).decision.actions, []);
  assert.equal(JSON.stringify(project(first, 1)).includes('answers'), false);
  assert.throws(() => act(first, 0, 'treasureDodge.reply', { use: true }), /not_your_decision/);
  const done = resolveCommand(first, { permission: 'player', seat: 1 }, secondCommand, { now: 1, actions: drawActions }).match;
  assert.deepEqual(done.state.players.map(p => p.hp), [8, 8, 8]);
  assert.equal(done.state.players[1].hand.length, 1); assert.equal(done.state._treasureDodge, undefined);
  assert.equal(done.state.drawReveal, null); assert.equal(done.state.phase, 'ACTION');
});

test('conditional moldy-food roll is sampled once and declining dodge cannot reroll it', () => {
  const start = initial({ ...makeCard('moldyFood'), dodgeable: true });
  let next = act(start, 1, 'draw.keep');
  const count = next.random.draws;
  assert.equal(count, 1);
  if (next.state._treasureDodge) {
    const roll = next.state._pendingMoldyFoodRoll;
    next = act(next, 1, 'treasureDodge.reply', { use: false });
    assert.equal(next.state._moldyFoodDiceRoll.d1, roll);
    assert.equal(next.random.draws, count);
  }
  assert.equal(next.state._pendingMoldyFoodRoll, undefined);
  assert.equal(next.state.players[1].hand.length, 1);
});
