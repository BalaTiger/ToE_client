import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { advanceRuleTime } from '../src/authority/time.js';
import { advanceAutomaticRules } from '../src/authority/automatic.js';
import { migratedActions } from '../src/authority/coverage.js';
import { INSPECTION_DECK, createTsathogguaSlimeCard } from '../src/constants/card.js';
const revealed = { id: 'pending', isZone: true, name: 'pending', type: 'selfHealHP', val: 1 };
function initial(extra = {}, options = {}) {
  return createPrivateMatch({ id: 'clock', seed: 3, now: 100, ...options, state: {
    _isMP: true, _intentEngine: true, phase: 'ACTION', currentTurn: 0, turn: 1, _turnKey: 1,
    players: ['寻宝者', '追猎者', '邪祀者'].map((role, id) => ({ id, role, name: `P${id}`, hp: 10, san: 10,
      isDead: false, hand: [], godZone: [], zoneCards: [], peekMemories: {} })),
    deck: [], discard: [], inspectionDeck: INSPECTION_DECK.filter(card => card.effect !== 'houndsOfTindalos'),
    inspectionDiscard: [], abilityData: {}, log: [], ...extra,
  } });
}
function act(record, type, now, actions, payload = {}, seat = 0) {
  return resolveCommand(record, { permission: 'player', seat }, { version: 2, matchId: record.id, revision: record.revision,
    decisionId: record.decision.id, actionId: `a${record.revision}`, type, payload }, { now, actions }).match;
}
test('45-second action budget survives same-phase intents and pauses across a separate 20-second decision', () => {
  const actions = {
    stay: { phases: ['ACTION'], payloadKeys: [], authorize: () => true, apply: state => state },
    pause: { phases: ['ACTION'], payloadKeys: [], authorize: () => true, apply: state => ({ ...state, phase: 'CHOICE' }) },
    resume: { phases: ['CHOICE'], payloadKeys: [], authorize: () => true, apply: state => ({ ...state, phase: 'ACTION' }) },
  };
  const first = initial(); assert.equal(first.decision.deadline, 45100);
  const stay = act(first, 'stay', 10100, actions); assert.equal(stay.decision.deadline, 45100);
  const paused = act(stay, 'pause', 15100, actions);
  assert.equal(paused.turnClock.remainingMs, 30000); assert.equal(paused.decision.deadline, 35100);
  const resumed = act(paused, 'resume', 30100, actions);
  assert.equal(resumed.turnClock.remainingMs, 30000); assert.equal(resumed.decision.deadline, 60100);
});
test('discard and CTH draw/god windows retain 15 seconds while nested reactions retain 20 seconds', () => {
  assert.equal(initial({ phase: 'DISCARD_PHASE' }).decision.deadline, 15100);
  assert.equal(initial({ phase: 'DRAW_REVEAL', drawReveal: { card: revealed, fromRest: true } }).decision.deadline, 15100);
  assert.equal(initial({ phase: 'GOD_CHOICE', abilityData: { fromRest: true } }).decision.deadline, 15100);
  assert.equal(initial({ phase: 'ETHEREALIZE_DECISION', abilityData: { fromRest: true } }).decision.deadline, 20100);
});
test('hounds bite for exactly four HP after 15 active seconds and return one real inspection card once', () => {
  const first = initial({ houndsOfTindalosActive: true, houndsOfTindalosElapsed: 0 });
  const waiting = advanceRuleTime(first, 10100);
  assert.equal(waiting.houndsClock.remainingMs, 5000); assert.equal(waiting.state.players[0].hp, 10); assert.equal(waiting.revision, 0);
  assert.throws(() => act(waiting, 'turn.end', 15100, migratedActions), /host_clock_due/);
  const bitten = advanceRuleTime(waiting, 15100);
  assert.equal(bitten.state.players[0].hp, 6); assert.equal(bitten.state.houndsOfTindalosActive, false);
  assert.equal(bitten.state.inspectionDeck.filter(card => card.effect === 'houndsOfTindalos').length, 1);
  assert.equal(bitten.turnClock.remainingMs, 30000); assert.equal(bitten.revision, 1);
  assert.equal(advanceRuleTime(bitten, 99999), bitten); assert.equal(bitten.state.players[0].hp, 6);
});
test('online hounds pause outside ACTION and do not count a sealed decision as action time', () => {
  const first = initial({ phase: 'CAVE_DUEL_SELECT_CARD', houndsOfTindalosActive: true }, { durationMs: 100000 });
  assert.equal(advanceRuleTime(first, 20100), first);
  const resumed = act(first, 'resume', 20100, { resume: { phases: ['CAVE_DUEL_SELECT_CARD'], payloadKeys: [], authorize: () => true,
    apply: state => ({ ...state, phase: 'ACTION' }) } });
  assert.equal(resumed.houndsClock.remainingMs, 15000);
  assert.equal(advanceRuleTime(resumed, 35099).state.players[0].hp, 10);
  assert.equal(advanceRuleTime(resumed, 35100).state.players[0].hp, 6);
});
test('offline hounds interrupt a real draw decision for slime and then restore the same decision without repeating damage', () => {
  const first = initial({ _isMP: false, phase: 'DRAW_REVEAL', drawReveal: { card: revealed, drawerIdx: 0, needsDecision: true },
    houndsOfTindalosActive: true });
  first.state.players[0].hand = [createTsathogguaSlimeCard()];
  const paused = advanceRuleTime(first, 15100);
  assert.equal(paused.state.phase, 'TSG_SLIME_BALANCE'); assert.equal(paused.state.players[0].hp, 6);
  const resumed = act(paused, 'slime.answer', 15101, migratedActions, { use: true });
  assert.equal(resumed.state.phase, 'DRAW_REVEAL'); assert.equal(resumed.state.drawReveal.card.id, 'pending');
  assert.equal(resumed.state.players[0].hp, 8); assert.equal(resumed.state.players[0].san, 8);
  assert.equal(resumed.houndsClock, null);
});
test('a lethal offline clock cleans up its pending drawn card and commits the final result without a browser callback', () => {
  const first = initial({ _isMP: false, phase: 'DRAW_REVEAL', drawReveal: { card: revealed, drawerIdx: 0, needsDecision: true },
    houndsOfTindalosActive: true }); first.state.players[0].hp = 4;
  const done = advanceRuleTime(first, 15100);
  assert.equal(done.state.players[0].isDead, true); assert.equal(done.state.gameOver.winner, 'LOSE');
  assert.equal(done.state.discard.filter(card => card.id === 'pending').length, 1);
  assert.equal(done.state.players.every(player => player.revealHand && player.roleRevealed), true);
});

test('a dead turn owner does not erase a living SHU chooser or their pending income', () => {
  const record = initial({ phase: 'SHU_SELECT_TARGET', abilityData: { shuChooserIdx: 1, shuCount: 1 } });
  record.state.players[0].isDead = true;
  const next = advanceAutomaticRules(record.state);
  assert.equal(next.phase, 'SHU_SELECT_TARGET'); assert.equal(next.abilityData.shuChooserIdx, 1);
});

test('burial drops a dead responder while preserving the living responder and settles their locked card once', () => {
  const record = initial({ currentTurn: 2, phase: 'BURY_ALIVE_SELECT', abilityData: { targets: [0, 1] } });
  record.state.players[0].isDead = true; record.state.players[1].hand = [{ id: 'buried' }];
  const waiting = advanceAutomaticRules(record.state);
  assert.equal(waiting.phase, 'BURY_ALIVE_SELECT'); assert.deepEqual(waiting.abilityData.targets, [1]);
  waiting.abilityData.buryAliveChoices = [null, { cardId: 'buried', index: 0 }];
  const next = advanceAutomaticRules(waiting);
  assert.equal(next.deck.filter(card => card.id === 'buried').length, 1);
  assert.equal(next.players[1].hand.length, 0);
});

test('a clock interrupting an existing slime choice cannot restore stale HP through its saved reaction frame', () => {
  const first = initial({ _isMP: false, phase: 'TSG_SLIME_BALANCE', houndsOfTindalosActive: true,
    abilityData: { type: 'tsgSlimeBalance', targetIdx: 0, afterHp: 8, afterSan: 10, _turnOwner: 0 } });
  first.state.players[0].hp = 8; first.state.players[0].hand = [createTsathogguaSlimeCard()];
  const interrupted = advanceRuleTime(first, 15100);
  const restored = act(interrupted, 'slime.answer', 15101, migratedActions, { use: false });
  assert.equal(restored.state.phase, 'TSG_SLIME_BALANCE'); assert.equal(restored.state.abilityData.afterHp, 4);
  const done = act(restored, 'slime.answer', 15102, migratedActions, { use: true });
  assert.equal(done.state.players[0].hp, 7); assert.equal(done.state.players[0].san, 7);
});

test('a dead private stone picker discards each reserved physical card once before turn advancement', () => {
  const first = initial({ currentTurn: 2, phase: 'DECIPHER_STONE_CARVING',
    abilityData: { playerIndex: 0, revealedCards: [{ id: 'reserved-a' }, { id: 'reserved-b' }] } });
  first.state.players[0].isDead = true;
  const next = advanceAutomaticRules(first.state);
  assert.deepEqual(next.discard.map(card => card.id), ['reserved-a', 'reserved-b']);
});

test('terminal encounter discards unowned reserved cards exactly once and clears decisions without discarding a replayed held card', () => {
  const first = initial({ gameOver: { winner: 'LOSE_ALL', reason: 'SAN zero' },
    drawReveal: { card: { id: 'fatal-god', isGod: true, godKey: 'VRI' } },
    abilityData: { godCard: { id: 'fatal-god', isGod: true }, revealedCards: [{ id: 'reserved' }] },
    _decisionContinuations: [{ phase: 'GOD_CHOICE', abilityData: { godCard: { id: 'held-replay', isGod: true } } }] });
  first.state.players[0].hand = [{ id: 'held-replay', isGod: true }];
  const next = advanceAutomaticRules(first.state), repeated = advanceAutomaticRules(next);
  assert.deepEqual(next.discard.map(card => card.id), ['fatal-god', 'reserved']);
  assert.equal(next.players[0].hand.length, 1); assert.equal(next.drawReveal, null); assert.deepEqual(next.abilityData, {});
  assert.deepEqual(repeated.discard, next.discard); assert.deepEqual(repeated._decisionContinuations, []);
});
