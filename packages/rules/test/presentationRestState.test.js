import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { collectPublicRuleEvents } from '../src/authority/events.js';
import { projectMatch } from '../src/authority/view.js';
import { applyInspectionForSanLoss, submitLossEvents } from '../src/game/effectEngine.js';
import { appendStatChangeResult } from '../src/game/statChangeEngine.js';
import { executeRuleResolution } from '../src/execution.js';

function initial() {
  return createPrivateMatch({ id: 'rest-state', seed: 9, now: 0, state: {
    _isMP: true, _intentEngine: true, currentTurn: 0, turn: 1, _turnKey: 1, phase: 'ACTION',
    players: Array.from({ length: 3 }, (_, id) => ({ id, name: `P${id}`, role: '邪祀者', hp: 8, san: 8,
      isDead: false, isResting: false, hand: [], godZone: [], zoneCards: [], peekMemories: {} })),
    deck: [{ id: 'next', name: 'next', type: 'selfHealHP', val: 1 }], discard: [], inspectionDeck: [], inspectionDiscard: [],
    log: [], abilityData: {},
  } });
}
function act(record, type) {
  return resolveCommand(record, { permission: 'player', seat: 0 }, { version: 2, matchId: record.id,
    revision: record.revision, decisionId: record.decision.id, actionId: 'rest', type, payload: {} },
  { now: 1, actions: migratedActions }).match;
}
test('actual rest records its new posture after healing and before the next turn cause', () => {
  const before = initial(), after = act(before, 'turn.rest'), events = after.publicEvents;
  const index = events.findIndex(event => event.type === 'playerRestChanged');
  assert.ok(index > events.findIndex(event => event.kind === 'HP_GAIN'));
  assert.ok(index < events.findIndex(event => event.type === 'turnStarted'));
  assert.equal(events[index].isResting, true); assert.equal(events[index].seat, 0);
  assert.equal(before.state.players[0].isResting, false); assert.equal(after.state.players[0].isResting, true);
  assert.equal(after.random.draws, 2);
});
for (const resting of [false, true]) test(`actual inspection flip changes ${resting} only after its explicit reveal`, () => {
  const record = initial(), before = record.state; before.players[1].isResting = resting; before.players[1].san = 6;
  const after = executeRuleResolution({ random: () => 0.2, namespace: 'rest-flip', now: 0 }, () => {
    const gs = structuredClone(before);
    const loss = submitLossEvents({ players: gs.players, deck: gs.deck, discard: gs.discard,
      log: gs.log, currentTurn: 0, events: [{ targetIdx: 1, lostSan: 1 }], statEventSeq: 1 });
    const damaged = { ...gs, ...appendStatChangeResult(gs, loss) };
    const result = applyInspectionForSanLoss(1, damaged.players[1].san, 0, damaged.players, damaged.deck, damaged.discard,
      damaged.log, { ...damaged, inspectionDeck: [{ name: 'flip', effect: 'flip', privateMetadata: 'SECRET' }] });
    return { ...damaged, ...result.inspectionMeta, players: result.P, deck: result.D, discard: result.Disc, log: result.log };
  });
  const events = collectPublicRuleEvents(before, after);
  assert.deepEqual(events.map(event => event.kind || event.type), ['SAN_LOSS', 'inspectionRevealed', 'playerRestChanged']);
  assert.equal(events[2].isResting, !resting);
  record.state = after; record.publicEvents = events.map((event, i) => ({ ...event, id: `flip:${i}`, visibility: 'public' }));
  assert.equal(JSON.stringify(projectMatch(record, { permission: 'observer' }, { handleForCard: () => 'opaque' })).includes('SECRET'), false);
});
test('actual adjacent-rest effect records each affected posture without using the final snapshot', () => {
  const record = initial(); record.state.players[1].isResting = true;
  Object.assign(record.state, { phase: 'DRAW_REVEAL', drawReveal: { drawerIdx: 0, needsDecision: true,
    card: { id: 'adj-rest', name: 'adj rest', type: 'adjRest', val: 1, isZone: true } } });
  const after = act(record, 'draw.keep');
  const events = after.publicEvents.filter(event => event.type === 'playerRestChanged');
  assert.deepEqual(events.map(event => [event.seat, event.isResting]), [[0, true], [2, true], [1, false]]);
  assert.equal(after.random.draws, 0);
});
