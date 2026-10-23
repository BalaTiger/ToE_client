import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch } from '../src/authority/command.js';
import { projectMatch } from '../src/authority/view.js';
import { initializeRules } from '../src/initialization.js';
import { addDamageLink } from '../src/game/damageLinks.js';
import { executeRuleResolution } from '../src/execution.js';

const host = { handleForCard: seat => `opaque-${seat}` };
const viewers = [0, 1, 2].map(seat => ({ permission: 'player', seat }))
  .concat({ permission: 'observer' });
const make = () => createPrivateMatch({ id: 'presentation', seed: 42, now: 100, state: {
  expansionKey: '地神的潜影', phase: 'ACTION', currentTurn: 0, turn: 1,
  players: [
    { name: 'A', role: 'private-role-a', hp: 10, san: 10, poisonStacks: 2,
      hand: [{ id: 'raw-card-a', name: 'private-card-a' }], privateCheckpoint: 'private-player-data' },
    { name: 'B', role: 'private-role-b', hp: 10, san: 10, poisonStacks: 0,
      hand: [{ id: 'raw-card-b', name: 'private-card-b' }] },
    { name: 'C', role: 'private-role-c', hp: 0, san: 10, isDead: true, hand: [] },
  ],
  deck: [{ id: 'raw-deck-card', name: 'private-deck' }],
  inspectionDeck: [{ id: 'raw-inspection-card', name: 'private-inspection' }],
  discard: [], inspectionDiscard: [],
  abilityData: { privateDecision: 'private-decision' }, log: ['private-log'],
  _visualEvents: [{ beforePlayers: 'private-visual-graph' }],
  rawgs: { secret: 'private-raw-state' }, random: { seed: 'private-state-random' },
} });

test('projects the actual initialized expansion key for players and observers', () => {
  const { state } = initializeRules({ mode: 'offline', seed: 32, now: 100,
    namespace: 'presentation:init', expansionKey: '地神的潜影' });
  assert.equal(state.expansionKey, '地神的潜影');
  const match = createPrivateMatch({ id: 'initialized', state, seed: 32, now: 100 });
  for (const viewer of [{ permission: 'player', seat: 0 }, { permission: 'observer' }]) {
    assert.equal(projectMatch(match, viewer, host).expansionKey, state.expansionKey);
  }
});

test('public presentation fields preserve every viewer privacy boundary without mutating the match', () => {
  const match = make();
  const before = structuredClone(match);
  for (const viewer of viewers) {
    const view = projectMatch(match, viewer, host);
    assert.equal(view.expansionKey, '地神的潜影');
    assert.deepEqual(view.players.map(player => player.poisonStacks), [2, 0, undefined]);
    for (const index of [0, 1, 2]) {
      if (viewer.permission === 'player' && viewer.seat === index) continue;
      assert.equal(view.players[index].hand, undefined);
      assert.equal(view.players[index].role, undefined);
    }
    for (const key of ['rawgs', 'state', 'deck', 'inspectionDeck', 'abilityData', 'log', '_visualEvents', 'random']) {
      assert.equal(Object.hasOwn(view, key), false, key);
    }
    const json = JSON.stringify(view);
    for (const secret of ['raw-card-', 'raw-deck-card', 'raw-inspection-card', 'private-deck',
      'private-inspection', 'private-decision', 'private-log', 'private-visual-graph',
      'private-raw-state', 'private-state-random', 'private-player-data']) {
      assert.equal(json.includes(secret), false, secret);
    }
  }
  assert.deepEqual(match, before);
});

test('presentation fields retain the scalar allowlist and cannot expose nested objects', () => {
  const match = make();
  match.state.expansionKey = { secret: 'nested-expansion-secret' };
  match.state.players[0].poisonStacks = { secret: 'nested-poison-secret' };
  for (const viewer of viewers) {
    const view = projectMatch(match, viewer, host);
    assert.equal(Object.hasOwn(view, 'expansionKey'), false);
    assert.equal(Object.hasOwn(view.players[0], 'poisonStacks'), false);
    assert.equal(JSON.stringify(view).includes('nested-'), false);
  }
});

test('public rest dice expose only the already rolled scalar values', () => {
  const match = make();
  match.publicEvents = [{ id: 'rest:1', type: 'restRolled', visibility: 'public', seat: 1, d1: 2, d2: 5,
    deck: ['secret-rest-deck'], players: [{ hand: ['secret-rest-hand'] }], seed: 'secret-rest-seed' },
  { id: 'rest:private', type: 'restRolled', visibility: 'private', seat: 0, d1: 1, d2: 6 },
  { id: 'rest:nested', type: 'restRolled', visibility: 'public', seat: 0, d1: { secret: 'nested-dice' }, d2: 3 }];
  for (const viewer of viewers) {
    const events = projectMatch(match, viewer, host).events;
    assert.deepEqual(events, [{ id: 'rest:1', type: 'restRolled', seat: 1, d1: 2, d2: 5 },
      { id: 'rest:nested', type: 'restRolled', seat: 0, d2: 3 }]);
    assert.equal(JSON.stringify(events).includes('secret'), false);
  }
});

test('safe compound animation events expose no private graphs, identities or nested metadata', () => {
  const match = make();
  const secret = 'NEVER-ON-WIRE';
  const extra = { players: [{ hand: [secret] }], seed: secret, _visualEvents: [secret], statEventIds: [secret] };
  match.publicEvents = [
    { id: 'skill', type: 'skillStarted', kind: 'hunt', sourceSeat: 0, targetSeat: 1 },
    { id: 'swap', type: 'swapCommitted', sourceSeat: 0, targetSeat: 1, count: 1 },
    { id: 'loot', type: 'huntLootTransferred', sourceSeat: 1, targetSeat: 0, count: 2 },
    { id: 'result', type: 'huntResolved', sourceSeat: 0, targetSeat: 1, outcome: 'survived' },
    { id: 'attack', type: 'huntAttack', sourceSeat: 0, targetSeat: 1, card: { id: secret, name: '公开攻击', private: secret } },
    { id: 'gift', type: 'bewitchGiven', sourceSeat: 0, targetSeat: 1, card: { id: secret, name: '公开赠牌', private: secret } },
    { id: 'inspection', type: 'inspectionRevealed', seat: 1, inspectionCard: { id: secret, name: '自残', effect: 'selfDamageHP', value: 2, private: secret } },
    { id: 'immortal', type: 'immortalRevealed', seat: 1, cards: [{ id: secret, name: '公开检定牌', private: secret }], succeeded: true },
    { id: 'link', type: 'damageLinkEstablished', sourceSeat: 0, targetSeat: 1 },
    { id: 'break', type: 'damageLinkBroken', pair: [0, 1], linkId: secret },
  ].map(event => ({ ...event, ...extra, visibility: 'public' }));
  match.publicEvents.push({ id: 'private', type: 'immortalRevealed', visibility: 'private', seat: 1, cards: [{ name: secret }] });
  for (const viewer of viewers) {
    const events = projectMatch(match, viewer, host).events;
    assert.equal(events.length, 10);
    assert.equal(JSON.stringify(events).includes(secret), false);
    assert.equal(JSON.stringify(events).includes('statEventIds'), false);
    assert.deepEqual(events.find(event => event.type === 'damageLinkBroken'), {
      id: 'break', type: 'damageLinkBroken', pair: [0, 1],
    });
    assert.equal(events.find(event => event.type === 'inspectionRevealed').inspectionCard.effect, 'selfDamageHP');
    assert.equal(events.find(event => event.type === 'immortalRevealed').cards[0].id, 'immortal:reveal:0');
  }
});

test('active public damage links use reciprocal opaque presentation IDs only', () => {
  const match = make();
  executeRuleResolution({ random: () => 0.2, namespace: 'view-link', now: 0 },
    () => addDamageLink(match.state.players, 0, 1, { id: 'raw-private-link-id' }));
  for (const viewer of viewers) {
    const view = projectMatch(match, viewer, host);
    assert.equal(view.players[0].damageLinks[0].partner, 1);
    assert.equal(view.players[1].damageLinks[0].partner, 0);
    assert.equal(view.players[0].damageLinks[0].id, view.players[1].damageLinks[0].id);
    assert.equal(JSON.stringify(view).includes('raw-private-link-id'), false);
  }
});

test('announced double treasure winners expose only map-selected faces and leave every other private hand hidden', () => {
  const match = make();
  for (const seat of [0, 1]) match.state.players[seat].hand = ['A', 'B', 'C', 'D'].map((letter, index) => ({
    id: `raw-map-${seat}-${index}`, name: `map-${seat}-${letter}`, letter, number: index + 1, privateMetadata: 'secret-map',
  })).concat({ id: 'raw-extra', name: 'unused-duplicate', letter: 'A', number: 1 },
    { id: 'raw-god', name: 'unneeded-god', isGod: true });
  match.state.players[2].hand = [{ id: 'raw-loser', name: 'private-loser' }];
  match.state.gameOver = { winner: '寻宝者', winnerIdx: 1, winnerIdx2: 0 };
  for (const viewer of viewers) {
    const view = projectMatch(match, viewer, host);
    assert.deepEqual(view.treasureWinners.map(winner => winner.seat), [1, 0]);
    assert.deepEqual(view.treasureWinners.map(winner => winner.cards.length), [4, 4]);
    const json = JSON.stringify(view.treasureWinners);
    for (const secret of ['raw-', 'secret-map', 'unused-duplicate', 'unneeded-god', 'private-loser']) assert.equal(json.includes(secret), false);
    for (const seat of [0, 1, 2]) if (seat !== viewer.seat || viewer.permission !== 'player') assert.equal(view.players[seat].hand, undefined);
  }
  delete match.state.gameOver;
  assert.equal(projectMatch(match, { permission: 'observer' }, host).treasureWinners, undefined);
  match.state.gameOver = { winner: '追猎者', winnerIdx: 1, winnerIdx2: 0 };
  assert.equal(projectMatch(match, { permission: 'observer' }, host).treasureWinners, undefined);
});

test('burial and Zhu hidden moves give faces only to their entitled owner', () => {
  const match = make(), card = { id: 'raw-hidden', name: 'PRIVATE-MOVE', privateMetadata: 'PRIVATE-META' };
  match.publicEvents = [
    { id: 'bury', type: 'buriedToDeck', seat: 0, count: 1, cards: [card], destination: 'deckBottom' },
    { id: 'zhu', type: 'zhuCardHidden', seat: 1, card, source: 'sphinx' },
  ].map(event => ({ ...event, visibility: 'public', random: 'SECRET', players: ['SECRET'] }));
  for (const viewer of viewers) {
    const events = projectMatch(match, viewer, host).events;
    assert.equal(events[0].cards[0].name, viewer.seat === 0 ? 'PRIVATE-MOVE' : undefined);
    assert.equal(events[1].card.name, viewer.seat === 1 ? 'PRIVATE-MOVE' : undefined);
    if (viewer.seat !== 0) assert.deepEqual(events[0].cards, [{ _back: true }]);
    if (viewer.seat !== 1) assert.deepEqual(events[1].card, { _back: true });
    for (const secret of ['raw-hidden', 'PRIVATE-META', 'SECRET']) assert.equal(JSON.stringify(events).includes(secret), false);
  }
});

test('stone moves disclose no top/bottom distribution or card identity outside the actual actor', () => {
  const match = make(), secret = 'PRIVATE-STONE-METADATA';
  const cards = [0, 1, 2].map(index => ({ id: `raw-stone-${index}`, name: `stone-face-${index}`,
    privateMetadata: secret, desc: { secret }, players: [secret] }));
  const event = { id: 'stone', type: 'stoneCardsArranged', visibility: 'public', seat: 1,
    handCount: 2, returnedCount: 2, keptCard: cards[0], random: secret, topCards: cards.slice(1), bottomCards: [] };
  for (const viewer of viewers) {
    match.publicEvents = [event];
    const first = projectMatch(match, viewer, host).events[0];
    match.publicEvents = [{ ...event, topCards: [], bottomCards: cards.slice(1) }];
    const second = projectMatch(match, viewer, host).events[0];
    if (viewer.permission === 'player' && viewer.seat === 1) {
      assert.equal(first.keptCard.name, 'stone-face-0');
      assert.deepEqual(first.topCards.map(card => card.name), ['stone-face-1', 'stone-face-2']);
      assert.deepEqual(second.bottomCards.map(card => card.name), ['stone-face-1', 'stone-face-2']);
    } else {
      assert.deepEqual(first, { id: 'stone', type: 'stoneCardsArranged', seat: 1, handCount: 2,
        returnedCount: 2, keptCard: { _back: true } });
      assert.deepEqual(first, second, 'changing only the private return distribution is unobservable');
    }
    const json = JSON.stringify([first, second]);
    for (const forbidden of ['raw-stone-', secret, 'privateMetadata', 'players', 'random']) assert.equal(json.includes(forbidden), false);
  }
  match.publicEvents = [{ ...event, visibility: 'private' }, { ...event, seat: null }];
  assert.deepEqual(projectMatch(match, { permission: 'observer' }, host).events, []);
});

test('unfinished swap take receipts disclose their intermediate counts and card only to the authenticated actor', () => {
  const match = make(), secret = 'PRIVATE-SWAP-METADATA';
  const event = { id: 'take', type: 'swapTakeCommitted', visibility: 'public', sourceSeat: 0, targetSeat: 1,
    sourceCount: 2, targetCount: 0, blind: true,
    card: { id: 'raw-taken', name: 'taken-face', privateMetadata: secret, desc: { secret } },
    random: secret, baselineHands: [secret], players: [secret], sourceEventId: secret };
  match.publicEvents = [event];
  const baseline = structuredClone(match);
  for (const viewer of [...viewers, { permission: 'observer', seat: 0 }, { permission: 'player', seat: 99 }]) {
    const view = projectMatch(match, viewer, host);
    if (viewer.permission === 'player' && viewer.seat === 0) {
      assert.deepEqual(view.events, [{ id: 'take', type: 'swapTakeCommitted', sourceSeat: 0, targetSeat: 1,
        sourceCount: 2, targetCount: 0, blind: true, card: { name: 'taken-face', id: 'opaque-0' } }]);
    } else assert.deepEqual(view.events, [], 'no take cue or intermediate count is sent to another viewer');
    for (const forbidden of ['raw-taken', secret, 'baselineHands', 'sourceEventId']) assert.equal(JSON.stringify(view).includes(forbidden), false);
  }
  assert.deepEqual(match, baseline);
  match.publicEvents = [{ ...event, sourceSeat: null }];
  assert.deepEqual(projectMatch(match, { permission: 'observer' }, host).events, []);
});
