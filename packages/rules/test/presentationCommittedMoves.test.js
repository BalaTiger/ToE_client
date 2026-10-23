import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { migratedActions } from '../src/authority/coverage.js';
import { projectMatch } from '../src/authority/view.js';
import { collectSafeIncomePresentationEvents } from '../src/authority/presentationIncomeEvents.js';
import { FIXED_ZONE_CARD_VARIANTS_BY_KEY, GOD_DEFS, createBlackGoatYoungCard } from '../src/constants/card.js';
import { DEFAULT_EXPANSION_KEY } from '../src/game/setup.js';
import { ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST } from '../src/game/coreUtils.js';
import { executeRuleResolution } from '../src/execution.js';
import { createCardReceiptEvent } from '../src/game/cardReceiptEvents.js';

function zone(type, id) {
  const [key, variants] = Object.entries(FIXED_ZONE_CARD_VARIANTS_BY_KEY).find(([, cards]) => cards.some(card => card.type === type));
  const definition = variants.find(card => card.type === type && card.expansion === DEFAULT_EXPANSION_KEY)
    || variants.find(card => card.type === type);
  return { ...definition, id, key, letter: key[0], number: Number(key[1]), isZone: true };
}
const god = (godKey, id) => ({ ...GOD_DEFS[godKey], id, key: godKey, isGod: true });
function initial(patch = {}) {
  return createPrivateMatch({ id: 'committed-moves', seed: 7, now: 0, state: {
    _isMP: true, _intentEngine: true, currentTurn: 0, turn: 1, _turnKey: 1, phase: 'ACTION',
    players: [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST].map((role, id) => ({
      id, role, name: `P${id}`, hp: 9, san: 10, isDead: false, hand: [], godZone: [], zoneCards: [],
      godName: null, godLevel: 0, peekMemories: {},
    })),
    deck: [zone('selfHealHP', 'future')], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: {},
    ...patch,
  } });
}
function act(match, seat, type, payload = {}) {
  const result = resolveCommand(match, { permission: 'player', seat }, { version: 2, matchId: match.id,
    revision: match.revision, decisionId: match.decision.id, actionId: `move:${match.revision}`, type, payload },
  { now: 1, actions: migratedActions });
  assert.equal(result.match.revision, match.revision + 1, JSON.stringify(result.acknowledgement));
  return result.match;
}
const events = (match, type) => match.publicEvents.filter(event => event.type === type);
const handleForCard = (seat, id) => createHash('sha256').update(`${seat}:${id}`).digest('hex');
const view = (match, seat = null) => projectMatch(match, seat === null ? { permission: 'observer' } : { permission: 'player', seat },
  { actions: migratedActions, handleForCard });

for (const winner of [0, 1, null]) {
  test(`sealed cave duel reports actual card counts before the original card income (${winner ?? 'tie'})`, () => {
    const numbered = (number, id) => {
      const [key, cards] = Object.entries(FIXED_ZONE_CARD_VARIANTS_BY_KEY).find(([key]) => key.endsWith(String(number)));
      return { ...cards[0], id, key, letter: key[0], number, isZone: true };
    };
    const sourceCard = numbered(winner === 1 ? 1 : 4, 'duel-source');
    const targetCard = numbered(winner === 0 ? 1 : 4, 'duel-target');
    const originalCard = zone('caveDuel', 'duel-original');
    let match = initial({ phase: 'DRAW_REVEAL', drawReveal: { card: originalCard, drawerIdx: 0 }, abilityData: {} });
    match.state.players[0].hand = [sourceCard]; match.state.players[1].hand = [targetCard];
    match = act(match, 0, 'draw.keep');
    match = act(match, 0, 'caveDuel.selectTarget', { targetSeat: 1 });
    match = act(match, 0, 'caveDuel.commit', { cardIndex: 0 });
    assert.equal(events(match, 'caveDuelRevealed').length, 0);
    const next = act(match, 1, 'caveDuel.commit', { cardIndex: 0 });
    const receipt = events(next, 'caveDuelRevealed')[0];
    assert.equal(receipt.winnerSeat, winner);
    assert.deepEqual([receipt.sourceCount, receipt.targetCount], winner === 0 ? [2, 0] : winner === 1 ? [0, 2] : [1, 1]);
    assert.deepEqual([receipt.sourceCard.id, receipt.targetCard.id], [sourceCard.id, targetCard.id]);
    assert.equal(next.state.players[0].hand.length, receipt.sourceCount + 1);
    assert.equal(next.state.players[1].hand.length, receipt.targetCount);
    assert.equal(next.random.draws, 0);
    const physical = [...next.state.deck, ...next.state.discard, ...next.state.players.flatMap(player => player.hand)];
    for (const card of [sourceCard, targetCard, originalCard]) assert.equal(physical.filter(item => item.id === card.id).length, 1);
    for (const seat of [0, 1, null]) {
      const projected = view(next, seat).events, duel = projected.findIndex(event => event.type === 'caveDuelRevealed');
      const income = projected.findIndex(event => event.type === 'cardIncomeCommitted');
      assert.ok(duel >= 0 && income > duel);
      assert.equal(projected[duel].sourceCount, receipt.sourceCount);
      assert.equal(projected[duel].targetCount, receipt.targetCount);
      assert.equal(projected[duel].sourceCard.id, handleForCard(seat, sourceCard.id));
    }
  });
}

test('multiply and SHU publish only their newly generated public tokens after the target commits', () => {
  let multiply = initial(); multiply.state.players[0].hand = [createBlackGoatYoungCard()];
  multiply = act(multiply, 0, 'multiply.begin');
  assert.deepEqual(events(multiply, 'publicTokensGranted'), []);
  multiply = act(multiply, 0, 'multiply.selectTarget', { targetSeat: 1 });
  const grant = events(multiply, 'publicTokensGranted').at(-1);
  assert.equal(grant.sourceSeat, 0); assert.equal(grant.targetSeat, 1); assert.equal(grant.kind, 'blackGoat');
  assert.deepEqual(grant.cards.map(card => card.id), multiply.state.players[1].hand.map(card => card.id));
  assert.equal(grant.cards.length, 1);
  let shu = initial({ phase: 'SHU_SELECT_TARGET', abilityData: { shuChooserIdx: 0, shuOffspringCount: 3 } });
  shu = act(shu, 0, 'shu.selectTarget', { targetSeat: 2 });
  assert.deepEqual(events(shu, 'publicTokensGranted')[0].cards.map(card => card.id), shu.state.players[2].hand.map(card => card.id));
  assert.equal(view(shu).events.find(event => event.type === 'publicTokensGranted').cards.length, 3);
});

test('a redirected multiply grants only its actual target, after the already committed APO SAN cost', () => {
  let match = initial({ apophisNight: { active: true, threshold: 6, count: 0, limit: 12 } });
  match.state.players[0].hand = [createBlackGoatYoungCard()];
  match = act(match, 0, 'multiply.begin');
  match = act(match, 0, 'multiply.selectTarget', { targetSeat: 1 });
  const grant = events(match, 'publicTokensGranted')[0];
  assert.equal(grant.targetSeat, 2); assert.equal(match.state.players[1].hand.length, 0);
  assert.equal(match.state.players[2].hand[0].id, grant.cards[0].id);
  assert.ok(match.publicEvents.findIndex(event => event.type === 'statChanged') < match.publicEvents.indexOf(grant));
});

test('rose-thorn commits exact counts and recipient-only received faces', () => {
  let match = initial({ phase: 'ROSE_THORN_SELECT_TARGET', abilityData: { roseThornSource: 0, roseThornTargets: [1] } });
  match.state.players[0].hand = [zone('selfHealHP', 'rose-secret-a'), zone('selfHealSAN', 'rose-secret-b')];
  match.state.players[0].hand[0].privateMetadata = 'never-share-me';
  match.state.players[1].hand = [zone('selfHealHP', 'target-existing')];
  match = act(match, 0, 'roseThorn.selectTarget', { targetSeat: 1 });
  const receipt = events(match, 'hiddenHandTransferred')[0];
  assert.equal(receipt.count, 2); assert.equal(receipt.sourceCount, 0); assert.equal(receipt.targetCount, 3);
  for (const seat of [null, 0, 1, 2]) {
    const projected = view(match, seat).events.find(event => event.type === 'hiddenHandTransferred');
    assert.equal(Object.hasOwn(projected, 'receivedCards'), seat === 1);
    if (seat === 1) assert.deepEqual(projected.receivedCards.map(card => card.id),
      ['rose-secret-a', 'rose-secret-b'].map(id => handleForCard(seat, id)));
    assert.equal(JSON.stringify(projected).includes('never-share-me'), false);
    assert.equal(JSON.stringify(projected).includes('targetReceivedCards'), false);
  }
});

test('grave retrieval uses the actual discarded card rather than a stale ability copy', () => {
  const actual = god('NYA', 'grave-public');
  let match = initial({ phase: 'GRAVE_DIG_SELECT', discard: [actual],
    abilityData: { playerIndex: 0, godCards: [{ ...actual, name: 'stale-copy' }] } });
  match = act(match, 0, 'grave.choose', { cardIndex: 0 });
  const receipt = events(match, 'publicCardRetrieved')[0];
  assert.equal(receipt.card.name, actual.name); assert.equal(receipt.source, 'discard');
  assert.equal(match.state.discard.length, 0); assert.equal(match.state.players[0].hand[0].id, actual.id);
  assert.equal(view(match).events.find(event => event.type === 'publicCardRetrieved').card.id, handleForCard(null, actual.id));
});

test('public first-pick and tortoise publish one receipt per actual gained card', () => {
  const a = zone('selfHealHP', 'pick-a'), b = zone('selfHealSAN', 'pick-b');
  let pick = initial({ phase: 'FIRST_COME_PICK_SELECT', abilityData: { revealedCards: [a, b], pickOrder: [0, 1], pickIndex: 0 } });
  pick = act(pick, 0, 'publicPick.choose', { cardIndex: 1 });
  assert.deepEqual(events(pick, 'cardIncomeCommitted').map(event => event.card.id), ['pick-b']);
  assert.equal(pick.state.players[0].hand[0].id, 'pick-b');
  const same = { ...a, id: 'pick-a2' };
  let tortoise = initial({ phase: 'TORTOISE_ORACLE_SELECT',
    abilityData: { playerIndex: 0, revealedCards: [a, same, b], selectableKeys: [a.letter] } });
  tortoise = act(tortoise, 0, 'tortoise.choose', { key: a.letter });
  assert.deepEqual(events(tortoise, 'cardIncomeCommitted').filter(event => event.destination === 'hand').map(event => event.card.id), ['pick-a', 'pick-a2']);
  assert.deepEqual(events(tortoise, 'cardIncomeCommitted').filter(event => event.destination === 'discard').map(event => event.card.id), ['pick-b']);
  assert.equal(tortoise.state.discard.some(card => card.id === b.id), true);
});

test('whole-hand exchange is one atomic receipt, before the delayed revealed card income', () => {
  const swap = zone('swapAllHands', 'swap-drawn');
  let match = initial({ phase: 'DRAW_REVEAL', drawReveal: { card: swap, drawerIdx: 0, needsDecision: true } });
  match.state.players[0].hand = [zone('selfHealHP', 'source-private')];
  match.state.players[1].hand = [zone('selfHealSAN', 'target-private-a'), zone('selfHealSAN', 'target-private-b')];
  match = act(match, 0, 'draw.keep');
  assert.equal(events(match, 'handsSwapped').length, 0);
  match = act(match, 0, 'zoneSwap.selectTarget', { targetSeat: 1 });
  const [receipt] = events(match, 'handsSwapped');
  assert.equal(events(match, 'handsSwapped').length, 1);
  assert.equal(receipt.sourceCount, 2); assert.equal(receipt.targetCount, 1);
  assert.deepEqual(match.state.players[0].hand.map(card => card.id), ['target-private-a', 'target-private-b', 'swap-drawn']);
  assert.ok(match.publicEvents.indexOf(receipt) < match.publicEvents.findIndex(event => event.type === 'cardIncomeCommitted'));
  for (const seat of [null, 0, 1, 2]) {
    const projected = view(match, seat).events.find(event => event.type === 'handsSwapped');
    const received = seat === 0 ? ['target-private-a', 'target-private-b'] : seat === 1 ? ['source-private'] : null;
    assert.equal(Object.hasOwn(projected, 'receivedCards'), !!received);
    if (received) assert.deepEqual(projected.receivedCards.map(card => card.id), received.map(id => handleForCard(seat, id)));
    assert.equal(JSON.stringify(projected).includes('sourceReceivedCards'), false);
    assert.equal(JSON.stringify(projected).includes('targetReceivedCards'), false);
  }
});

test('blank-zone generation reports its actual hand or zone destination independently of the drawn-card income', () => {
  for (const heldCount of [0, 4]) {
    let match = initial({ phase: 'DRAW_REVEAL', drawReveal: { card: zone('placeBlankZone', 'blank-source'), drawerIdx: 0, needsDecision: true } });
    match.state.players[0].hand = Array.from({ length: heldCount }, (_, index) => zone('selfHealHP', `held-${index}`));
    match = act(match, 0, 'draw.keep');
    const generated = events(match, 'cardIncomeCommitted').find(event => event.source === 'generated');
    assert.equal(generated.destination, heldCount === 0 ? 'hand' : 'zone');
    assert.equal(generated.card.key, 'BLANK');
    assert.equal(match.state.players[0][heldCount === 0 ? 'hand' : 'zoneCards'].some(card => card.id === generated.card.id), true);
    assert.equal(events(match, 'cardIncomeCommitted').filter(event => event.card.id === 'blank-source').length, 1);
    assert.ok(match.publicEvents.indexOf(generated) < match.publicEvents.findIndex(event => event.card?.id === 'blank-source'
      && event.type === 'cardIncomeCommitted'));
  }
});

test('god worship, held-god use, keep and discard expose only actual destination receipts', () => {
  for (const choice of ['worship', 'keepHand', 'discard']) {
    let match = initial({ phase: 'GOD_CHOICE', abilityData: { drawerIdx: 2, godCard: god('NYA', `god-${choice}`) } });
    match = act(match, 2, 'god.choose', { choice });
    const receipt = events(match, 'cardIncomeCommitted').find(event => event.card.id === `god-${choice}`);
    assert.equal(receipt.destination, { worship: 'godZone', keepHand: 'hand', discard: 'discard' }[choice]);
    assert.equal(receipt.source, 'reveal');
    if (choice === 'worship') assert.ok(match.publicEvents.indexOf(receipt)
      < match.publicEvents.findIndex(event => event.type === 'godStatusChanged'));
  }
  let held = initial(); held.state.players[0].hand = [god('NYA', 'held-god')];
  const priorId = view(held, 0).players[0].hand[0].id;
  held = act(held, 0, 'god.useHand', { cardIndex: 0 });
  const receipt = view(held, 0).events.find(event => event.type === 'cardIncomeCommitted');
  assert.equal(receipt.source, 'hand'); assert.equal(receipt.destination, 'godZone'); assert.equal(receipt.card.id, priorId);
});

test('conversion discards the old public god zone before SAN cost, then commits the new god before its highlight', () => {
  const old = god('NYA', 'old-faith'), next = god('CTH', 'new-faith');
  let match = initial({ phase: 'GOD_CHOICE', abilityData: { drawerIdx: 0, godCard: next } });
  Object.assign(match.state.players[0], { godName: 'NYA', godLevel: 1, godZone: [old] });
  match = act(match, 0, 'god.choose', { choice: 'worship' });
  const removal = events(match, 'publicCardsDiscarded')[0], income = events(match, 'cardIncomeCommitted')[0];
  assert.deepEqual(removal.cards.map(card => card.id), ['old-faith']);
  const cost = match.publicEvents.findIndex(event => event.type === 'statChanged');
  assert.ok(match.publicEvents.indexOf(removal) < cost);
  assert.ok(match.publicEvents.indexOf(income) > cost);
  assert.ok(match.publicEvents.indexOf(income) < match.publicEvents.findIndex(event => event.type === 'godStatusChanged'));
  assert.deepEqual(match.state.players[0].godZone.map(card => card.id), ['new-faith']);
  assert.equal(match.state.discard.some(card => card.id === 'old-faith'), true);
});

test('income extraction does not inspect private snapshots and ignores legacy count-only swap visuals', () => {
  const forbidden = () => { throw new Error('Private snapshot accessed'); };
  const receipt = { id: 'receipt', type: 'cardEffect', effectKey: 'authorityCardReceipt',
    payload: { receipt: { type: 'handsSwapped', sourceSeat: 0, targetSeat: 1,
      sourceReceivedCards: [zone('selfHealHP', 'received')], targetReceivedCards: [] } } };
  for (const key of ['playersBefore', 'playersAfter', 'beforePlayers', 'afterPlayers', 'msgs']) Object.defineProperty(receipt, key, { get: forbidden });
  const state = { _visualEvents: [receipt, { id: 'legacy', type: 'cardMove', effect: 'fullHandSwap' }] };
  for (const key of ['players', 'deck', 'discard', 'log']) Object.defineProperty(state, key, { get: forbidden });
  const result = collectSafeIncomePresentationEvents({}, state);
  assert.equal(result.length, 1); assert.equal(result[0].event.type, 'handsSwapped');
  assert.deepEqual(collectSafeIncomePresentationEvents(state, state), []);
});

test('receipt creation and extraction consume no rule entropy and retain no private card metadata', () => {
  const card = { ...zone('selfHealHP', 'public-card'), privatePayload: { token: 'secret-canary' } };
  const receipt = executeRuleResolution({ random: () => { throw new Error('Unexpected RNG'); }, now: 1, namespace: 'receipt' },
    () => createCardReceiptEvent({ type: 'cardIncomeCommitted', seat: 0, card, destination: 'hand', source: 'reveal' }));
  const [entry] = collectSafeIncomePresentationEvents({}, { _visualEvents: [receipt] });
  assert.equal(entry.event.card.id, card.id);
  assert.equal(JSON.stringify(entry.event).includes('secret-canary'), false);
});
