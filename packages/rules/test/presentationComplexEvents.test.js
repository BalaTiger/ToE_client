import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSafeComplexPresentationEvents } from '../src/authority/presentationComplexEvents.js';
import { collectSafeDrawPresentationEvents } from '../src/authority/presentationDrawEvents.js';
import { collectFreshPresentationStats } from '../src/authority/presentationPublicEvents.js';
import { collectPublicRuleEvents } from '../src/authority/events.js';
import { applyFx } from '../src/game/effectEngine.js';
import { resolveApophisTarget } from '../src/game/apophisNight.js';
import { resolveHeadlessSlimeBalance, resolveHeadlessEtherealize } from '../src/game/headlessSimulator.js';
import { resolveGodEncounter } from '../src/game/turnEngine.js';
import { advanceAutomaticRules, beginAuthorityEndTurn, drawAuthorityCard } from '../src/authority/automatic.js';
import { createTsathogguaSlimeCard, FIXED_ZONE_CARD_VARIANTS_BY_KEY } from '../src/constants/card.js';
import { executeRuleResolution } from '../src/execution.js';
import { withRuleContext } from '../src/runtime.js';
import { createPrivateMatch } from '../src/authority/command.js';
import { projectMatch } from '../src/authority/view.js';
import { migratedActions } from '../src/authority/coverage.js';

const secret = 'COMPLEX-PRIVATE-CANARY';
const zone = (key, name) => ({ ...FIXED_ZONE_CARD_VARIANTS_BY_KEY[key].find(card => card.name === name),
  id: name, key, letter: key[0], number: +key[1], isZone: true });
const optional = () => zone('A2', '蚂蚁虽小');
function state() {
  return { _intentEngine: true, _isMP: true, currentTurn: 0, turn: 1, _turnKey: 1, phase: 'ACTION',
    players: ['寻宝者', '追猎者', '邪祀者'].map((role, id) => ({ id, name: `P${id}`, role,
      hp: 10, san: 7, hand: [], godZone: [], zoneCards: [], peekMemories: {}, isDead: false })),
    deck: [optional(), { ...optional(), id: 'future', privateMetadata: secret }], discard: [], log: [secret],
    inspectionDeck: [], inspectionDiscard: [], abilityData: {}, _visualEvents: [], _statEvents: [] };
}
function resolve(callback, random = () => .9) {
  return executeRuleResolution({ namespace: 'complex-test', now: 0, random }, callback);
}
function effect(before, card, random) {
  return resolve(() => {
    const result = applyFx(card, 0, null, before.players, before.deck, before.discard, before);
    return { ...before, ...result.statePatch, players: result.P, deck: result.D, discard: result.Disc };
  }, random);
}
const payloads = (before, after) => collectSafeComplexPresentationEvents(before, after).map(entry => entry.event);
const types = (before, after) => collectPublicRuleEvents(before, after).map(event => event.kind || event.type);

test('worm explicit phase group anchors sweep before global HP, random target between global and extra HP', () => {
  const before = state(); let randomCalls = 0;
  const after = effect(before, { name: '钻地魔虫', type: 'allDamageHPRandomExtra', val: 2 }, () => { randomCalls++; return .9; });
  const entries = collectSafeComplexPresentationEvents(before, after);
  assert.deepEqual(entries.map(entry => entry.event), [
    { type: 'burrowingWorm', seat: 0 }, { type: 'burrowingWormTarget', sourceSeat: 0, targetSeat: 2 },
  ]);
  const stats = collectFreshPresentationStats(before, after);
  assert.deepEqual(after.players.map(player => player.hp), [8, 8, 6]);
  assert.equal(randomCalls, 1);
  assert.ok(stats.slice(0, 3).every(stat => entries[0].beforeStatIds.includes(stat.id) && entries[1].afterStatIds.includes(stat.id)));
  assert.deepEqual(entries[1].beforeStatIds, [stats[3].id]);
  assert.deepEqual(types(before, after), ['burrowingWorm', 'HP_LOSS', 'HP_LOSS', 'HP_LOSS', 'burrowingWormTarget', 'HP_LOSS']);
});

test('actual throw-stone roll and target cue precede its exact HP result with no duplicated random cue', () => {
  const before = state(); let calls = 0;
  const after = effect(before, { name: '投掷石块', type: 'throwStone' }, () => { calls++; return .9; });
  assert.deepEqual(payloads(before, after), [{ type: 'throwStone', sourceSeat: 0, targetSeat: 2, roll: 6, distance: 1, damage: 5 }]);
  assert.equal(after.players[2].hp, 5);
  assert.equal(calls, 2);
  assert.deepEqual(types(before, after), ['throwStone', 'HP_LOSS']);
});

test('lethal worm sweep still has exact consequence ownership when no random survivor remains', () => {
  const before = state(); before.players.forEach(player => { player.hp = 1; });
  const after = effect(before, { name: '钻地魔虫', type: 'allDamageHPRandomExtra', val: 2 }, () => { throw new Error('no survivor should consume RNG'); });
  assert.ok(after.players.every(player => player.isDead));
  const [entry] = collectSafeComplexPresentationEvents(before, after);
  assert.equal(entry.event.type, 'burrowingWorm');
  assert.ok(entry.beforeStatIds.length >= 3);
  assert.equal(types(before, after)[0], 'burrowingWorm');
});

test('APO worship emits public god status before eclipse and does not expose night internals', () => {
  const before = state();
  const after = resolve(() => {
    const result = resolveGodEncounter(0, { id: 'apo', name: '阿波菲斯', isGod: true, godKey: 'APO' },
      structuredClone(before.players), [...before.deck], [], before, false, { explicitAction: 'worship' });
    return { ...before, ...result.statePatch, players: result.P, deck: result.D, discard: result.Disc };
  });
  const events = payloads(before, after);
  assert.deepEqual(events, [{ type: 'godStatusChanged', seat: 0, godKey: 'APO', godLevel: 1 },
    { type: 'apophisEclipse', seat: 0 }]);
  assert.equal(after.apophisNight.active, true);
  assert.ok(types(before, after).indexOf('godStatusChanged') < types(before, after).indexOf('apophisEclipse'));
});

test('ordinary turn-start slime pop is ordered after banner and before its first extra card', () => {
  const before = state(); Object.assign(before.players[1], { godName: 'TSG', godLevel: 1, hand: [createTsathogguaSlimeCard()] });
  const after = resolve(() => advanceAutomaticRules(beginAuthorityEndTurn(before)));
  assert.deepEqual(types(before, after).slice(0, 3), ['turnStarted', 'tsgSlimePopped', 'cardRevealed']);
});

test('actual APO target shift uses resolved target and roll, before immediate SAN cost', () => {
  const before = { ...state(), apophisNight: { active: true, threshold: 2, count: 0, limit: 12 } };
  before.players[0].san = 10;
  const after = resolve(() => {
    const copy = structuredClone(before);
    const result = resolveApophisTarget({ gs: copy, players: copy.players, deck: copy.deck, discard: copy.discard,
      log: copy.log, actorIdx: 0, selectedIdx: 1, legalTargets: [1, 2] });
    return { ...copy, ...result.statePatch, players: result.players };
  }, () => 0);
  assert.deepEqual(payloads(before, after), [{ type: 'apophisTarget', sourceSeat: 0, selectedSeat: 1, targetSeat: 2, roll: 1, changed: true }]);
  assert.equal(after.players[0].san, 9);
  assert.deepEqual(types(before, after), ['apophisTarget', 'SAN_LOSS']);
});

test('APO no-shift dice precede following action HP even though the roll itself owns no stats', () => {
  const before = { ...state(), apophisNight: { active: true, threshold: 2, count: 0, limit: 12 } };
  const after = resolve(() => {
    const copy = structuredClone(before);
    const night = resolveApophisTarget({ gs: copy, players: copy.players, deck: copy.deck, discard: copy.discard,
      log: copy.log, actorIdx: 0, selectedIdx: 1, legalTargets: [1, 2] });
    const targeted = { ...copy, ...night.statePatch, players: night.players };
    const result = applyFx(zone('A1', '坠落'), 0, null, targeted.players, targeted.deck, targeted.discard, targeted);
    return { ...targeted, ...result.statePatch, players: result.P };
  });
  assert.equal(payloads(before, after)[0].changed, false);
  assert.deepEqual(types(before, after), ['apophisTarget', 'HP_LOSS']);
});

test('CTH dream is emitted once by mandatory rest slot, before the first actual draw', () => {
  const before = state();
  Object.assign(before.players[0], { godName: 'CTH', godLevel: 2, isResting: true });
  const after = resolve(() => advanceAutomaticRules(beginAuthorityEndTurn(before)));
  assert.equal(after.phase, 'DRAW_REVEAL');
  assert.equal(after.abilityData.cthDrawsRemaining, 1);
  assert.deepEqual(types(before, after).slice(0, 2), ['cthulhuDream', 'cardRevealed']);
  assert.equal(payloads(before, after).filter(event => event.type === 'cthulhuDream').length, 1);
});

test('actual empty-deck reshuffle precedes the draw without exposing next deck cards', () => {
  const before = { ...state(), deck: [], discard: [optional(), { ...optional(), id: 'second', privateMetadata: secret }] };
  const after = resolve(() => drawAuthorityCard(before, 0));
  assert.deepEqual(types(before, after).slice(0, 2), ['deckReshuffled', 'cardRevealed']);
  assert.equal(after.deck.length, 1);
  assert.equal(payloads(before, after)[0].count, 2);
  assert.equal(JSON.stringify(payloads(before, after)).includes(secret), false);
});

test('corridor actual held card is revealed after tunnel, not a new deck travel', () => {
  const before = state();
  before.players[0].hand = [optional(), zone('A3', '无尽通道')];
  const after = resolve(() => advanceAutomaticRules(beginAuthorityEndTurn(before)));
  assert.equal(after.phase, 'DRAW_REVEAL');
  assert.deepEqual(after.deck, before.deck);
  assert.deepEqual(types(before, after).slice(0, 2), ['endlessCorridorStarted', 'cardRevealed']);
  assert.deepEqual(payloads(before, after)[0].cards.map(card => card.id), before.players[0].hand.map(card => card.id));
  const [draw] = collectSafeDrawPresentationEvents(before, after);
  assert.equal(draw.event.reason, 'endTurnReplay');
  assert.equal(draw.event.sourcePile, undefined);
});

test('TSG end-turn grant carries actual public token receipts before next turn', () => {
  const before = state(); Object.assign(before.players[0], { godName: 'TSG', godLevel: 1 });
  const after = resolve(() => advanceAutomaticRules(beginAuthorityEndTurn(before)));
  const [grant] = payloads(before, after);
  assert.equal(grant.type, 'publicTokensGranted');
  assert.equal(grant.kind, 'tsathogguaSlime');
  assert.deepEqual(grant.cards.map(card => card.id), after.players[0].hand.map(card => card.id));
  assert.ok(types(before, after).indexOf('tsathogguaSlime') < types(before, after).indexOf('turnStarted'));
});

test('TSG continuation consumes exactly the public token, then reveals its extra draw', () => {
  const before = state(); Object.assign(before.players[0], { godName: 'TSG', godLevel: 1 });
  before.players[0].hand = [{ ...createTsathogguaSlimeCard(), privateMetadata: secret }];
  before._ruleContinuation = { kind: 'turnStartDraw', owner: 0 };
  const after = resolve(() => advanceAutomaticRules(before));
  const [pop] = payloads(before, after);
  assert.equal(pop.type, 'tsgSlimePopped');
  assert.deepEqual(pop.poppedCards.map(card => card.id), before.players[0].hand.map(card => card.id));
  assert.equal(after.players[0].hand.length, 0);
  assert.deepEqual(types(before, after).slice(0, 2), ['tsgSlimePopped', 'cardRevealed']);
});

test('TSG balance explicit before/after is committed at actual mutation and owns no unrelated damage', () => {
  const before = state();
  Object.assign(before.players[0], { hp: 3, san: 9, hand: [createTsathogguaSlimeCard()] });
  before.phase = 'TSG_SLIME_BALANCE'; before.abilityData = { targetIdx: 0, afterHp: 3, afterSan: 9 };
  const after = resolve(() => resolveHeadlessSlimeBalance(before, true, { fallbackPhase: 'ACTION' }));
  const [entry] = collectSafeComplexPresentationEvents(before, after);
  assert.deepEqual([entry.event.fromHp, entry.event.hp, entry.event.fromSan, entry.event.san], [3, 6, 9, 6]);
  assert.deepEqual([after.players[0].hp, after.players[0].san], [6, 6]);
  assert.deepEqual(entry.statEventIds, []);
  assert.equal(collectFreshPresentationStats(before, after).length, 0);
});

test('extractor ignores private graphs, malformed seats/faces and duplicates without RNG or mutation', () => {
  const after = state();
  after._visualEvents = [{ id: 'blocked', type: 'godPowerBlocked', playerIdx: 0, playersAfter: secret, log: [secret] },
    { id: 'pop', type: 'tsgSlimePop', playerIdx: 1, cards: [{ name: secret }, { ...createTsathogguaSlimeCard(), privateMetadata: secret }] },
    { id: 'badseat', type: 'cthulhuDream', playerIdx: 99 },
    { id: 'badgod', type: 'godStatusChanged', playerIdx: 0, godKey: secret, godLevel: 1 },
    { id: 'badroll', type: 'throwStone', sourceIdx: 0, targetIdx: 1, roll: 7, distance: 1, damage: 1 }];
  after._visualEvents.push(after._visualEvents[0]);
  const frozen = structuredClone(after);
  const entries = withRuleContext({ random: () => { throw new Error('extractor used RNG'); } }, () => collectSafeComplexPresentationEvents({}, after));
  assert.deepEqual(entries.map(entry => entry.event.type), ['godPowerBlocked', 'tsgSlimePopped']);
  assert.equal(JSON.stringify(entries).includes(secret), false);
  assert.deepEqual(after, frozen);
  assert.deepEqual(collectSafeComplexPresentationEvents(after, after), []);
});

function redirectState({ chain = false } = {}) {
  const before = state(); before.phase = 'ETHEREALIZE_DECISION';
  before.players[1].etherealizeStacks = 2;
  if (chain) before.players[2].etherealizeStacks = 1;
  const loss = { targetIdx: 1, lostHp: 2, lostSan: 0, source: 'canonical damage', order: 0, adjacentTargets: [0, 2] };
  before.abilityData = { ...loss, type: 'etherealizeRedirect', pendingLosses: [loss], pendingIndex: 0, _turnOwner: 0 };
  return before;
}
test('explicit etherealize target consumes a layer before redirected HP, while source HP remains intact', () => {
  const before = redirectState();
  const after = resolve(() => resolveHeadlessEtherealize(before, { useEtherealize: true, redirectTargetIdx: 2 }, { fallbackPhase: 'ACTION' }));
  assert.deepEqual(payloads(before, after), [{ type: 'etherealizeConsumed', sourceSeat: 1, targetSeat: 2,
    lostHp: 2, lostSan: 0, stacksBefore: 2, stacksAfter: 1 }]);
  assert.deepEqual(types(before, after), ['etherealizeConsumed', 'HP_LOSS']);
  assert.deepEqual(after.players.map(player => player.hp), [10, 10, 8]);
});
test('recursive etherealize consumes only the first layer before the second target decides; no HP is guessed', () => {
  const before = redirectState({ chain: true });
  const after = resolve(() => resolveHeadlessEtherealize(before, { useEtherealize: true, redirectTargetIdx: 2 }, { fallbackPhase: 'ACTION' }));
  assert.equal(after.phase, 'ETHEREALIZE_DECISION');
  assert.equal(after.abilityData.targetIdx, 2);
  assert.deepEqual(after.players.map(player => player.hp), [10, 10, 10]);
  assert.deepEqual(types(before, after), ['etherealizeConsumed']);
});
test('automatic etherealize uses the same real consumption producer; declining produces no consume cue', () => {
  const before = redirectState();
  const automatic = resolve(() => resolveHeadlessEtherealize(before, null, { fallbackPhase: 'ACTION' }));
  assert.equal(payloads(before, automatic)[0].type, 'etherealizeConsumed');
  const declined = resolve(() => resolveHeadlessEtherealize(before, { useEtherealize: false }, { fallbackPhase: 'ACTION' }));
  assert.deepEqual(payloads(before, declined), []);
  assert.equal(declined.players[1].etherealizeStacks, 2);
  assert.equal(declined.players[1].hp, 8);
});

test('complex wire projection HMACs explicit public token/corridor faces and strips graph/provenance canaries', () => {
  const after = state(), publicCard = { ...optional(), id: 'raw-public', privateMetadata: secret };
  const publicToken = { ...createTsathogguaSlimeCard(), id: 'raw-token', privateMetadata: secret };
  after.players[1].hand = [{ ...optional(), id: 'raw-private', name: secret }];
  after._visualEvents = [
    { id: 'pop', type: 'tsgSlimePop', playerIdx: 0, cards: [publicToken], playersAfter: secret },
    { id: 'corridor', type: 'endlessCorridorStarted', playerIdx: 0, revealedCards: [publicCard], log: secret },
    { id: 'grant', type: 'tsgSlimeGrant', playerIdx: 0, cards: [publicToken], random: secret },
  ];
  const record = createPrivateMatch({ id: 'complex-projection', state: after, seed: 1, now: 0 });
  record.publicEvents = collectPublicRuleEvents(state(), after).map((event, index) => ({ ...event, id: `wire-${index}`, visibility: 'public' }));
  const handles = new Map();
  const projected = projectMatch(record, { permission: 'observer' }, { actions: migratedActions,
    handleForCard: (_seat, id) => { if (!handles.has(id)) handles.set(id, `opaque-${handles.size}`); return handles.get(id); } });
  assert.equal(JSON.stringify(projected).includes(secret), false);
  assert.equal(JSON.stringify(projected).includes('raw-'), false);
  assert.equal(JSON.stringify(projected.events).includes('presentation'), false);
  assert.equal(projected.events.find(event => event.type === 'endlessCorridorStarted').cards[0].name, publicCard.name);
  assert.equal(projected.events.find(event => event.type === 'tsgSlimePopped').poppedCards[0].id,
    projected.events.find(event => event.type === 'publicTokensGranted').cards[0].id);
});
