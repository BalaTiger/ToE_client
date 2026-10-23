import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
import { collectPublicRuleEvents } from '../src/authority/events.js';
import { collectSafePresentationEvents } from '../src/authority/presentationPublicEvents.js';
import { orderPresentationEntries } from '../src/authority/presentationOrdering.js';
import { addDamageLink } from '../src/game/damageLinks.js';
import { executeRuleResolution } from '../src/execution.js';
import { applyInspectionForSanLoss, submitLossEvents } from '../src/game/effectEngine.js';
import { appendStatChangeResult } from '../src/game/statChangeEngine.js';

const secret = 'PRIVATE-LIFECYCLE';
const card = (id, type = 'selfHealHP', extra = {}) => ({ id: `${secret}:${id}`, name: id,
  key: 'A1', letter: 'A', number: 1, type, val: 1, privateMetadata: secret, ...extra });
const host = { handleForCard: (seat, id) => createHash('sha256').update(`${seat}:${id}`).digest('hex') };
function initial(source = card('area', 'allDiscard')) {
  return createPrivateMatch({ id: 'discard-lifecycle', seed: 12, now: 0, state: {
    _isMP: true, _intentEngine: true, phase: 'DRAW_REVEAL', currentTurn: 0, turn: 1, _turnKey: 1,
    players: Array.from({ length: 4 }, (_, id) => ({ id, role: '邪祀者', name: `P${id}`, hp: 8, san: 8,
      isDead: false, hand: [card(`hand-${id}`)], godZone: [], zoneCards: [], peekMemories: {} })),
    deck: [card('next')], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: {},
    drawReveal: { drawerIdx: 0, needsDecision: true, card: source },
  } });
}
const act = (match, type, seat = 0) => resolveCommand(match, { permission: 'player', seat }, {
  version: 2, matchId: match.id, revision: match.revision, decisionId: match.decision.id,
  actionId: `a-${match.revision}`, type, payload: {},
}, { now: 1, actions: migratedActions }).match;

test('real earthquake preserves authored discard batch before balance stats and distinct destroyed destinations', () => {
  const start = initial();
  start.state.players[1].hand = [card('balance', 'lifeBalance')];
  start.state.players[2].hand = [card('slime', 'tsathogguaSlime', { isTsathogguaSlime: true })];
  start.state.players[3].hand = [card('blank', 'blankZone')];
  const saved = structuredClone(start), next = act(start, 'draw.keep');
  assert.deepEqual(start, saved);
  const cueIndex = next.publicEvents.findIndex(event => event.type === 'cardsDiscarded');
  assert.ok(cueIndex >= 0);
  const cue = next.publicEvents[cueIndex];
  assert.equal(cue.kind, 'earthquake');
  assert.deepEqual(cue.discards.map(item => [item.seat, item.destination]), [[0, 'discard'], [1, 'discard'], [2, 'destroyed']]);
  assert.ok(next.publicEvents.findIndex(event => event.type === 'statChanged' && event.kind === 'HP_LOSS') > cueIndex);
  assert.equal(next.publicEvents.filter(event => event.type === 'statChanged' && event.kind === 'HP_LOSS').length, 1);
  assert.equal(next.random.draws, 4);
  assert.equal(next.state.discard.some(item => item.type === 'tsathogguaSlime'), false);
  const view = projectMatch(next, { permission: 'observer' }, host);
  assert.equal(JSON.stringify(view).includes(secret), false);
  assert.equal(JSON.stringify(view.events).includes('afterPlayers'), false);
});

test('forced random discard has an explicit movement before its actual combined HP consequence', () => {
  const start = initial(card('forced', 'selfDamageDiscardHP'));
  start.state.players[0].hand = [card('balance', 'lifeBalance')];
  const next = act(start, 'draw.keep');
  const index = next.publicEvents.findIndex(event => event.type === 'cardsDiscarded');
  assert.equal(next.publicEvents[index].kind, 'forcedRandomDiscard');
  const stats = next.publicEvents.filter(event => event.type === 'statChanged' && event.kind === 'HP_LOSS');
  assert.equal(stats.length, 1);
  assert.equal(stats[0].fromHp, 8); assert.equal(stats[0].hp, 4);
  assert.ok(next.publicEvents.indexOf(stats[0]) > index);
  assert.equal(next.random.draws, 1);
});

test('ordinary defeat reveals only cards committed to public discard and a face-free destruction count', () => {
  const start = initial(card('lethal', 'selfDamageHP', { val: 5 }));
  start.state.players[0].hp = 1;
  start.state.players[0].hand.push(card('slime', 'tsathogguaSlime', { isTsathogguaSlime: true }));
  start.state.players[0].godZone = [card('public god', 'god', { isGod: true, godKey: 'CTH' })];
  const next = act(start, 'draw.keep');
  const deathIndex = next.publicEvents.findIndex(event => event.type === 'statChanged' && event.kind === 'PLAYER_DEFEATED');
  const settlementIndex = next.publicEvents.findIndex(event => event.type === 'deathCardsRemoved');
  assert.ok(settlementIndex > deathIndex);
  const nextTurnIndex = next.publicEvents.findIndex(event => event.type === 'turnStarted');
  if (nextTurnIndex >= 0) assert.ok(settlementIndex < nextTurnIndex);
  assert.equal(JSON.stringify(next.state).includes('_deathSettlementReceipt'), false);
  assert.equal(next.publicEvents[deathIndex].cardSettlementPending, true);
  assert.equal(next.publicEvents[deathIndex].revealedRole, '邪祀者');
  const cue = next.publicEvents[settlementIndex];
  assert.deepEqual(cue.discardedCards.map(item => item.name), ['hand-0', 'public god']);
  assert.equal(cue.destroyedCount, 1);
  assert.equal(cue.deathCards, undefined);
  const view = projectMatch(next, { permission: 'observer' }, host);
  assert.equal(JSON.stringify(view).includes(secret), false);
  const publicCue = view.events.find(event => event.type === 'deathCardsRemoved');
  assert.ok(publicCue.discardedCards.every(item => view.discard.some(discarded => discarded.id === item.id)));
});

test('unconfirmed private death cards and hunt-owned loot never become public death faces', () => {
  for (const extra of [{}, { settlementOwner: 'huntResult', discardAfter: [card('private')] }]) {
    const entries = collectSafePresentationEvents({}, { _statEvents: [{ id: 'death', type: 'PLAYER_DEFEATED', target: 0,
      deathCards: [card('private')], ...extra }] });
    assert.equal(entries.some(entry => entry.event.type === 'deathCardsRemoved'), false);
  }
});

test('actual link expiry follows its heals and identifies only the expiring same-pair relation', () => {
  const start = initial(); Object.assign(start.state, { phase: 'ACTION', drawReveal: null });
  executeRuleResolution({ random: () => 0, namespace: 'links', now: 0 }, () => {
    addDamageLink(start.state.players, 0, 1, { id: `${secret}:expired`, expiryOwner: 1 });
    addDamageLink(start.state.players, 0, 1, { id: `${secret}:stays`, expiryOwner: 0 });
  });
  const before = projectMatch(start, { permission: 'player', seat: 2 }, host);
  const next = act(start, 'turn.end');
  const events = projectMatch(next, { permission: 'player', seat: 2 }, host).events;
  const index = events.findIndex(event => event.type === 'damageLinkExpired');
  assert.ok(index >= 0);
  assert.equal(events.filter((event, i) => i < index && event.kind === 'HP_GAIN').length, 2);
  const expired = events[index];
  assert.ok(before.players[0].damageLinks.some(link => link.id === expired.linkId));
  const after = projectMatch(next, { permission: 'player', seat: 2 }, host);
  assert.equal(after.players[0].damageLinks.length, 1);
  assert.notEqual(after.players[0].damageLinks[0].id, expired.linkId);
  assert.equal(JSON.stringify(after).includes(secret), false);
});

test('explicit cue edges order same-stat-slot facts and reject contradictory producer graphs', () => {
  const entries = [{ sourceEventId: 'draw', slot: 0 },
    { sourceEventId: 'shuffle', slot: 0, beforeEventIds: ['draw'] },
    { sourceEventId: 'dream', slot: 0, beforeEventIds: ['shuffle'] }];
  assert.deepEqual(orderPresentationEntries(entries).map(entry => entry.sourceEventId), ['dream', 'shuffle', 'draw']);
  assert.throws(() => orderPresentationEntries([{ sourceEventId: 'a', slot: 1, beforeEventIds: ['b'] },
    { sourceEventId: 'b', slot: 0 }]), /Conflicting/);
  assert.throws(() => orderPresentationEntries([{ sourceEventId: 'a', slot: 0, beforeEventIds: ['b'] },
    { sourceEventId: 'b', slot: 0, beforeEventIds: ['a'] }]), /Cyclic/);
});

test('pending movement uses producer stat watermarks without exposing internal ordering data', () => {
  const before = initial().state;
  const after = { ...before, _statEvents: [
    { id: 'cost', type: 'SAN_LOSS', target: 0, from: { san: 8 }, to: { san: 7 } },
    { id: 'gain', type: 'HP_GAIN', target: 1, from: { hp: 8 }, to: { hp: 9 } },
  ], _pendingPublicEvents: [{ type: 'publicTokensGranted', targetSeat: 1, kind: 'blackGoat', cards: [],
    presentationOrder: 'beforeStats', presentationAfterStatIds: ['cost'], presentationEventId: 'receipt' }] };
  const events = collectPublicRuleEvents(before, after);
  assert.deepEqual(events.slice(0, 3).map(event => event.kind || event.type), ['SAN_LOSS', 'blackGoat', 'HP_GAIN']);
  assert.equal(JSON.stringify(events).includes('presentationAfterStatIds'), false);
});

test('inspection records its actual discard face and destination before the explicit balance consequence', () => {
  for (const type of ['lifeBalance', 'tsathogguaSlime']) {
    const record = initial(); const before = record.state;
    Object.assign(before, { phase: 'ACTION', drawReveal: null });
    before.players[1].san = 6;
    before.players[1].hand = [card(`inspection-${type}`, type, { isTsathogguaSlime: type === 'tsathogguaSlime' })];
    let randomCalls = 0;
    const after = executeRuleResolution({ random: () => { randomCalls++; return 0; }, now: 0, namespace: `inspection:${type}` }, () => {
      const gs = structuredClone(before);
      const loss = submitLossEvents({ players: gs.players, deck: gs.deck, discard: gs.discard,
        log: gs.log, currentTurn: 0, events: [{ targetIdx: 1, lostSan: 1 }], statEventSeq: 1 });
      const next = { ...gs, ...appendStatChangeResult(gs, loss) };
      const result = applyInspectionForSanLoss(1, next.players[1].san, 0, next.players, next.deck, next.discard,
        next.log, { ...next, inspectionDeck: [{ name: 'persecution', effect: 'discardRandom', value: 1 }] });
      return { ...next, ...result.inspectionMeta, players: result.P, deck: result.D, discard: result.Disc, log: result.log };
    });
    const events = collectPublicRuleEvents(before, after);
    const index = events.findIndex(event => event.type === 'inspectionRevealed');
    assert.ok(index > events.findIndex(event => event.kind === 'SAN_LOSS'));
    assert.deepEqual(events[index].discards.map(item => [item.seat, item.destination]),
      [[1, type === 'lifeBalance' ? 'discard' : 'destroyed']]);
    if (type === 'lifeBalance') assert.ok(events.findIndex(event => event.kind === 'HP_LOSS') > index);
    record.state = after; record.publicEvents = events.map((event, i) => ({ ...event, id: `inspection:${i}`, visibility: 'public' }));
    const view = projectMatch(record, { permission: 'observer' }, host);
    const cue = view.events.find(event => event.type === 'inspectionRevealed');
    assert.equal(cue.discards[0].card.name, `inspection-${type}`);
    assert.equal(JSON.stringify(view).includes(secret), false); assert.equal(randomCalls, 1);
  }
});
