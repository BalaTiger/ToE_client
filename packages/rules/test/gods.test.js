import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { drawAuthorityCard, advanceAutomaticRules } from '../src/authority/automatic.js';
import { executeRuleResolution } from '../src/execution.js';
import { discardDeadDrawerGod } from '../src/game/deadGodEncounter.js';

test('a terminal SAN-zero encounter retains its drawn god exactly once even while the drawer remains alive', () => {
  const match = initial('APO'), source = { ...god('APO'), type: 'god' };
  Object.assign(match.state, { phase: 'ACTION', currentTurn: 0, abilityData: {}, deck: [source] });
  Object.assign(match.state.players[0], { san: 1, godEncounters: 10 });
  const next = executeRuleResolution({ cursor: match.random, now: 0, namespace: 'san-zero' },
    () => advanceAutomaticRules(drawAuthorityCard(match.state, 0)));
  assert.ok(next.gameOver); assert.equal(next.players[0].isDead, false);
  assert.equal(next.discard.filter(card => card.id === source.id).length, 1);
  assert.equal(next.deck.length, 0);
  const twice = discardDeadDrawerGod({ players: next.players, drawerIdx: 0, godCard: source, discard: next.discard });
  assert.equal(twice.discard.filter(card => card.id === source.id).length, 1);
});

test('promoting a pending god response consumes its matching queued frame once', () => {
  const match = initial(), choice = { godCard: god('CTH'), drawerIdx: 1, godEncounterCost: 0 };
  Object.assign(match.state, { phase: 'ACTION', abilityData: { pendingGodChoice: choice },
    _decisionContinuations: [{ phase: 'GOD_CHOICE', abilityData: choice }] });
  const ready = advanceAutomaticRules(match.state);
  assert.equal(ready.phase, 'GOD_CHOICE'); assert.equal(ready._decisionContinuations.length, 0);
  const next = choose({ ...match, state: ready }, 'discard');
  assert.equal(next.state.discard.filter(card => card.id === choice.godCard.id).length, 1);
  assert.equal(next.state._decisionContinuations.length, 0);
});

test('settling one encounter consumes aliases and resumes a distinct queued encounter before leaving the turn', () => {
  const match = initial(), current = { godCard: god('CTH'), drawerIdx: 1, godEncounterCost: 0 };
  const other = { godCard: god('APO'), drawerIdx: 0, godEncounterCost: 0 };
  match.state._decisionContinuations = [{ phase: 'GOD_CHOICE', abilityData: current }, { phase: 'GOD_CHOICE', abilityData: other }];
  const next = choose(match, 'discard');
  assert.equal(next.state.phase, 'GOD_CHOICE'); assert.equal(next.state.abilityData.godCard.id, other.godCard.id);
  assert.equal(next.state._decisionContinuations.length, 0);
  const done = choose(next, 'discard', 0);
  assert.equal(done.state.phase, 'ACTION');
  for (const card of [current.godCard, other.godCard]) assert.equal(done.state.discard.filter(item => item.id === card.id).length, 1);
});
const god = key => ({ id: `gift-${key}`, name: key, godKey: key, isGod: true, power: key });
function initial(key = 'CTH') {
  return createPrivateMatch({ id: 'faith', seed: 5, now: 0, state: {
    _isMP: true, _intentEngine: true, phase: 'GOD_CHOICE', currentTurn: 1, turn: 1, _turnKey: 1,
    players: ['寻宝者', '邪祀者', '追猎者'].map((role, id) => ({ id, role, name: `P${id}`, hp: 10, san: 10,
      isDead: false, godZone: [], zoneCards: [], hand: [], godEncounters: 1, peekMemories: {} })),
    deck: [], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: { godCard: god(key), drawerIdx: 1 },
  } });
}
function act(match, seat, type, payload) {
  return resolveCommand(match, { permission: 'player', seat }, { version: 2, matchId: match.id, revision: match.revision,
    decisionId: match.decision.id, actionId: `a${match.revision}`, type, payload }, { now: 1, actions: migratedActions }).match;
}
const choose = (match, choice, seat = 1) => act(match, seat, 'god.choose', { choice });

test('borrowed cultist identity grants the same legal keep privilege as the shared god chooser', () => {
  const start = initial(); start.state.players[1].role = '追猎者'; start.state.players[1]._nyaBorrow = '邪祀者';
  const next = choose(start, 'keepHand');
  assert.equal(next.state.players[1].hand.filter(card => card.id === 'gift-CTH').length, 1);
  assert.equal(next.state.players[1].godName ?? null, null);
});

test('god choices are seat-owned and reject invented faith/levels/cards and invalid keep privileges', () => {
  const start = initial();
  assert.throws(() => choose(start, 'worship', 0), /not_your_decision/);
  assert.throws(() => act(start, 1, 'god.choose', { choice: 'worship', level: 3 }), /invalid_command/);
  assert.throws(() => choose(start, 'upgrade'), /illegal_action/);
  const kept = choose(start, 'keepHand');
  assert.equal(kept.state.players[1].hand[0].id, 'gift-CTH'); assert.equal(kept.state.players[1].roleRevealed, true);
  start.state.players[1].role = '追猎者'; assert.throws(() => choose(start, 'keepHand'), /illegal_action/);
});

test('worship, upgrade and conversion use the same faith settlement and keep SAN/level limits authoritative', () => {
  const start = initial();
  const worship = choose(start, 'worship');
  assert.equal(worship.state.players[1].godName, 'CTH'); assert.equal(worship.state.players[1].godLevel, 1);
  assert.equal(worship.state.players[1].san, 10);
  const upgrade = initial(); Object.assign(upgrade.state.players[1], { godName: 'CTH', godLevel: 2, godZone: [god('CTH')] });
  const upgraded = choose(upgrade, 'upgrade');
  assert.equal(upgraded.state.players[1].godLevel, 3); assert.equal(upgraded.state.players[1].godZone.length, 2);
  upgrade.state.players[1].godLevel = 3; assert.throws(() => choose(upgrade, 'upgrade'), /illegal_action/);
  const convert = initial(); Object.assign(convert.state.players[1], { godName: 'NYA', godLevel: 1, godZone: [god('NYA')] });
  const converted = choose(convert, 'worship');
  assert.equal(converted.state.players[1].san, 9); assert.equal(converted.state.players[1].godName, 'CTH');
  assert.equal(converted.state.discard[0].godKey, 'NYA');
});

test('competing followers are abandoned by rules, including their actual SAN penalty', () => {
  const start = initial(); Object.assign(start.state.players[2], { godName: 'CTH', godLevel: 1, godZone: [god('CTH')] });
  const next = choose(start, 'worship');
  assert.equal(next.state.players[2].godName, null); assert.equal(next.state.players[2].godLevel, 0);
  assert.equal(next.state.players[2].san, 9); assert.equal(next.state.players[1].godName, 'CTH');
});

test('SHU defers an owned target intent, validates immunity and grants real generated cards once', () => {
  const start = initial('SHU');
  const prompted = choose(start, 'worship');
  assert.equal(prompted.state.phase, 'SHU_SELECT_TARGET');
  assert.equal(prompted.state.players[0].hand.length, 0);
  assert.throws(() => act(prompted, 0, 'shu.selectTarget', { targetSeat: 0 }), /not_your_decision/);
  prompted.state.players[2].godPowerImmuneThisTurn = true;
  assert.throws(() => act(prompted, 1, 'shu.selectTarget', { targetSeat: 2 }), /illegal_action/);
  const next = act(prompted, 1, 'shu.selectTarget', { targetSeat: 0 });
  assert.equal(next.state.phase, 'ACTION'); assert.ok(next.state.players[0].hand.length > 0);
  assert.equal(next.state.players[0].hand.every(c => c.isBlackGoatYoung || c.type === 'blackGoatYoung'), true);
});

test('end-turn replay keep restores one existing god card instead of duplicating it', () => {
  const start = initial(); start.state.players[1].hand = [god('CTH')];
  start.state.abilityData.fromEndTurnReplay = true;
  start.state._endTurnReplay = { actorIndex: 1, cards: ['gift-CTH'], index: 0 };
  // The end-turn driver owns its registry frame; the action only advances the
  // replay cursor and resumes it when one exists.
  start.state._authorityEnd = { owner: 1, events: [], cursor: 0 };
  const next = choose(start, 'keepHand');
  assert.equal(next.state.players[1].hand.filter(c => c.id === 'gift-CTH').length, 1);
});
