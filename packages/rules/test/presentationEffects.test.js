import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
import { collectSafePresentationEvents } from '../src/authority/presentationPublicEvents.js';

const secret = 'PRIVATE-PRESENTATION-CANARY';
function make(card) {
  return createPrivateMatch({ id: 'area', seed: 17, now: 0, state: {
    _isMP: true, _intentEngine: true, phase: 'DRAW_REVEAL', currentTurn: 0, turn: 1, _turnKey: 1,
    players: Array.from({ length: 4 }, (_, id) => ({ id, role: '邪祀者', name: `P${id}`, hp: 6, san: 8,
      isDead: false, hand: [{ id: `${secret}:${id}`, name: secret, type: 'selfHealHP', val: 1 }],
      godZone: [], zoneCards: [], peekMemories: {}, godEncounters: 0 })),
    deck: [], discard: [{ id: `${secret}:discard`, name: '旧弃牌', type: 'selfHealHP', val: 1 }],
    inspectionDeck: [], inspectionDiscard: [], log: [secret], abilityData: {},
    drawReveal: { drawerIdx: 0, needsDecision: true, card: { id: `${secret}:source`, isZone: true,
      key: 'A1', letter: 'A', number: 1, privateMetadata: secret, ...card } },
  } });
}
function keep(record) {
  return resolveCommand(record, { permission: 'player', seat: 0 }, { version: 2, matchId: record.id,
    revision: record.revision, decisionId: record.decision.id, actionId: 'keep', type: 'draw.keep', payload: {} },
  { now: 1, actions: migratedActions }).match;
}
for (const [name, type, kind, statKind] of [
  ['地下泉', 'allHealHP', 'undergroundSpring', 'HP_GAIN'],
  ['惊扰蝙蝠', 'adjDamageHP', 'startledBats', 'HP_LOSS'],
  ['夜风呼啸', 'allDamageBoth', 'nightWind', 'HP_LOSS'],
  ['活火山', 'allDamageHP', 'volcano', 'HP_LOSS'],
]) {
  test(`actual ${name} emits its original scene cue before its once-only explicit stats`, () => {
    const result = keep(make({ name, type, val: 1 }));
    const cueIndex = result.publicEvents.findIndex(event => event.type === 'areaEffectStarted');
    const cue = result.publicEvents[cueIndex];
    assert.equal(cue.kind, kind);
    assert.equal(cue.seat, 0);
    assert.equal(JSON.stringify(cue).includes(secret), false);
    const statEvents = result.publicEvents.filter(event => event.type === 'statChanged');
    assert.ok(statEvents.some(event => event.kind === statKind));
    if (kind === 'nightWind') assert.ok(statEvents.some(event => event.kind === 'SAN_LOSS'));
    assert.ok(result.publicEvents.findIndex(event => event.type === 'statChanged') > cueIndex);
    const ids = statEvents.map(event => `${event.seat}:${event.kind}:${event.fromHp}:${event.hp}:${event.fromSan}:${event.san}`);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(result.random.draws, 0);
  });
}

test('actual geomagnetic cue reveals only the generated public restore face, never discard permutation', () => {
  const result = keep(make({ name: '地磁反转', type: 'geomagneticReversal' }));
  assert.equal(result.state.geomagneticReversalActive, true);
  for (const viewer of [{ permission: 'player', seat: 0 }, { permission: 'player', seat: 1 }, { permission: 'observer' }]) {
    const view = projectMatch(result, viewer, { handleForCard: () => 'opaque' });
    const cue = view.events.find(event => event.type === 'areaEffectStarted');
    assert.equal(cue.kind, 'geomagneticReversal');
    assert.equal(cue.restoreCard.type, 'geomagneticRestore');
    assert.equal(cue.restoreCard.id, `${cue.id}:restore`);
    assert.equal(JSON.stringify(cue).includes(secret), false);
    assert.equal(cue.beforeDiscard, undefined);
    assert.equal(cue.afterDiscard, undefined);
  }
});

test('actual poison distribution emits only public target counts and hit order, no random stream', () => {
  const result = keep(make({ name: '群蛇陷阱', type: 'snakePoisonTrap' }));
  const cue = result.publicEvents.find(event => event.type === 'areaEffectStarted');
  assert.equal(cue.kind, 'snakeTrap');
  assert.equal(cue.rayCount, 4);
  assert.equal(cue.hits.length, 4);
  assert.equal(cue.assignments.reduce((sum, item) => sum + item.count, 0), 4);
  cue.assignments.forEach(item => assert.equal(result.state.players[item.seat].poisonStacks, item.count));
  assert.equal(result.random.draws, 4);
  assert.equal(JSON.stringify(cue).includes(secret), false);
});

test('actual etherealize cue carries the committed public stack count only', () => {
  const result = keep(make({ name: '半物质化', type: 'etherealize' }));
  const cue = result.publicEvents.find(event => event.type === 'areaEffectStarted');
  assert.equal(cue.kind, 'etherealizeGain');
  assert.equal(cue.stackCount, 1);
  assert.equal(result.state.players[0].etherealizeStacks, 1);
  assert.equal(JSON.stringify(cue).includes(secret), false);
});

test('area extraction rejects unknown effects and nested scalar fields without reading snapshots', () => {
  const known = { id: 'effect', type: 'cardEffect', effectKey: 'snakeTrap', actorIdx: 0,
    beforePlayers: [{ isDead: false, hand: [secret] }, { isDead: true, hand: [secret] }],
    afterPlayers: [{ hp: 0, san: 0, hand: [secret] }], msgs: [secret],
    payload: { assignmentList: [{ idx: 0, count: 1, private: secret }, { idx: { secret }, count: 2 }],
      assignmentHits: [{ idx: 0, private: secret }], seed: secret } };
  const entries = collectSafePresentationEvents({}, { _visualEvents: [known, { ...known, id: 'unknown', effectKey: 'untrusted' }] });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].event, { type: 'areaEffectStarted', kind: 'snakeTrap', seat: 0, rayCount: 1,
    assignments: [{ seat: 0, count: 1 }], hits: [0] });
  assert.equal(JSON.stringify(entries).includes(secret), false);
});
