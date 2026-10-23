import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';

const card = id => ({ id, name: id, isZone: true, key: 'A1', letter: 'A', number: 1, type: 'selfHealHP', val: 1,
  privateMarker: 'HOST-ONLY-CANARY' });
const wire = (record, type, payload = {}) => ({ version: 2, matchId: record.id, revision: record.revision,
  decisionId: record.decision.id, actionId: `action-${record.revision}`, type, payload });
const apply = (record, command) => resolveCommand(record, { permission: 'player', seat: 0 }, command,
  { now: 1, actions: migratedActions });
const project = (record, seat) => projectMatch(record, seat === null ? { permission: 'observer' } : { permission: 'player', seat },
  { actions: migratedActions, handleForCard: (viewer, id) => `opaque:${viewer}:${id}` });

for (const blind of [true, false]) {
  test(`actual ${blind ? 'blind' : 'visible'} swap take emits one actor-only receipt and keeps every nonactor checkpoint`, () => {
    const first = createPrivateMatch({ id: `swap-take-${blind}`, seed: 5, now: 0, state: {
      _isMP: true, _intentEngine: true, phase: blind ? 'SWAP_STEAL_CARD' : 'SWAP_SELECT_TARGET_CARD',
      currentTurn: 0, turn: 1, _turnKey: 1, globalOnlySwapOwner: null,
      players: ['寻宝者', '追猎者', '邪祀者'].map((role, id) => ({ id, role, name: `P${id}`, hp: 10, san: 10,
        isDead: false, hand: id === 0 ? [card('own')] : [card(`target-${id}-a`), card(`target-${id}-b`)],
        revealHand: id === 1 && !blind, godZone: [], zoneCards: [], peekMemories: {} })),
      deck: [], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: { swapTi: 1 },
    } });
    const saved = structuredClone(first), request = wire(first, blind ? 'swap.takeBlind' : 'swap.takeVisible', blind ? {} : { cardIndex: 1 });
    const result = apply(first, request), taken = result.match, moved = taken.state.players[0].hand.at(-1);
    assert.deepEqual(first, saved);
    assert.equal(taken.random.draws, blind ? 1 : 0);
    assert.equal(taken.state.players[0].hand.length, 2); assert.equal(taken.state.players[1].hand.length, 1);
    const physical = taken.state.players.flatMap(player => player.hand).map(item => item.id);
    assert.equal(new Set(physical).size, physical.length);
    assert.deepEqual([...physical].sort(), first.state.players.flatMap(player => player.hand).map(item => item.id).sort());
    const host = taken.publicEvents.filter(event => event.type === 'swapTakeCommitted');
    assert.equal(host.length, 1); assert.equal(host[0].card.id, moved.id);
    const actor = project(taken, 0), receipts = actor.events.filter(event => event.type === 'swapTakeCommitted');
    assert.equal(receipts.length, 1); assert.equal(receipts[0].sourceSeat, 0); assert.equal(receipts[0].targetSeat, 1);
    assert.equal(receipts[0].card.id, `opaque:0:${moved.id}`); assert.equal(receipts[0].blind, blind);
    assert.equal(receipts[0].sourceCount, 2); assert.equal(receipts[0].targetCount, 1);
    assert.equal(JSON.stringify(receipts).includes('HOST-ONLY-CANARY'), false);
    assert.equal(JSON.stringify(receipts).includes('presentationAfterStatIds'), false);
    for (const seat of [1, 2, null]) {
      const before = project(first, seat), after = project(taken, seat);
      assert.equal(after.events.some(event => event.type === 'swapTakeCommitted'), false);
      assert.deepEqual(after.players.map(player => [player.handCount, player.hand]), before.players.map(player => [player.handCount, player.hand]));
    }
    const retried = apply(taken, request);
    assert.equal(retried.acknowledgement.duplicate, true); assert.deepEqual(retried.match, taken);
    const given = apply(taken, wire(taken, 'swap.give', { cardIndex: 0 })).match;
    assert.equal(project(given, 0).events.find(event => event.type === 'swapCommitted').takeAlreadyPresented, true);
    assert.equal(given.publicEvents.filter(event => event.type === 'swapTakeCommitted').length, 1);
    const cancelled = apply(taken, wire(taken, 'skill.cancel')).match;
    assert.deepEqual(cancelled.state.players.map(player => player.hand.map(item => item.id).sort()),
      first.state.players.map(player => player.hand.map(item => item.id).sort()));
    assert.equal(cancelled.state.skillUsed, true);
  });
}
