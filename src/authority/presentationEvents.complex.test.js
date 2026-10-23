import { describe, expect, it } from 'vitest';
import { createAuthorityAnimationTransaction, createAuthorityEventBuffer } from './presentationEvents';
import { prepareAnimationQueueSteps } from '../game/animationStepSchema';
import { applyStatAnimationImpact, primeDisplayStatsForStatQueue } from '../game/statEvents';

const back = id => ({ id, _back: true, _authorityHidden: true });
const a = { id: 'a', name: 'Known A', letter: 'A', number: 1 };
const b = { id: 'b', name: 'Known B', letter: 'B', number: 1 };
const god = { id: 'god', name: 'Public god', isGod: true, godKey: 'CTH' };
const slime = { id: 'slime', name: 'Public slime', isTsathogguaSlime: true };
const goat = { id: 'goat', name: 'Public goat', isBlackGoatYoung: true };
const players = [
  { id: 0, seat: 1, name: 'Self', hp: 6, san: 5, hand: [a], handCount: 1, handVisible: true, godZone: [], zoneCards: [], isDead: false },
  { id: 1, seat: 0, name: 'Opponent', hp: 6, san: 6, hand: [back('opponent')], handCount: 1, handVisible: false, godZone: [], zoneCards: [], isDead: false },
];
const model = { me: players[0], gs: { players, discard: [], phase: 'ACTION' },
  toDisplaySeat: seat => Number.isInteger(seat) ? [1, 0][seat] : null };
const loss = { id: 'loss', type: 'statChanged', seat: 1, kind: 'HP_LOSS', fromHp: 6, hp: 4, fromSan: 5, san: 5 };
const lastPatch = step => step.visualTimeline.at(-1).patch;
const compile = (events, next = model, previous = model.gs) => {
  const result = createAuthorityAnimationTransaction(events, next, previous);
  expect(prepareAnimationQueueSteps(result.queue).issues).toEqual([]);
  return result;
};

describe('complex public facts use original animation contracts', () => {
  it('keeps stone owner destinations private and all viewers on the original 780ms flight', () => {
    const ownerEvent = { id: 'stone', type: 'stoneCardsArranged', seat: 1, keptCard: b,
      topCards: [a], bottomCards: [god], handCount: 2, returnedCount: 2 };
    const owner = compile([ownerEvent, loss]);
    expect(owner.queue[0]).toMatchObject({ type: 'CARD_TRANSFER', durationMs: 780 });
    expect(owner.queue[0].transfers.map(transfer => transfer.dest)).toEqual(['player', 'deckTop', 'deckBottom']);
    expect(owner.queue[0].transfers.every(transfer => transfer.faceUp && transfer.effect === 'decipherStone')).toBe(true);
    expect(lastPatch(owner.queue[0]).players[0].hand).toEqual([a, b]);
    expect(owner.queue[0].visualTimeline[0].atMs).toBe(780);

    const publicEvent = { id: 'stone', type: 'stoneCardsArranged', seat: 0, keptCard: { _back: true },
      handCount: 2, returnedCount: 2 };
    const opponent = compile([publicEvent, loss]);
    expect(opponent.queue[0].durationMs).toBe(owner.queue[0].durationMs);
    expect(opponent.queue[0].transfers.map(transfer => transfer.dest)).toEqual(['player', 'deck', 'deck']);
    expect(opponent.queue[0].transfers.every(transfer => !transfer.faceUp && transfer.cards[0]._back)).toBe(true);
    expect(JSON.stringify(opponent.queue[0])).not.toContain('deckTop');
    expect(JSON.stringify(opponent.queue[0])).not.toContain('deckBottom');
  });

  it.each([true, false])('commits explicit resting=%s through the original player presentation field without stats', isResting => {
    const transaction = compile([{ id: 'rest-flip', type: 'playerRestChanged', seat: 0, isResting }, loss]);
    expect(transaction.queue[0]).toMatchObject({ type: 'TURN_BOUNDARY_PAUSE', durationMs: 0 });
    expect(lastPatch(transaction.queue[0]).players[1]).toMatchObject({ isResting, hp: 6, san: 6 });
    expect(transaction.queue[0]).not.toHaveProperty('statEvents');
  });

  it.each([
    ['burrowingWorm', 'BURROWING_WORM'], ['apophisEclipse', 'APOPHIS_ECLIPSE'],
    ['cthulhuDream', 'CTH_RLYEH_DREAM'], ['endlessCorridorStarted', 'ENDLESS_CORRIDOR_TUNNEL'],
    ['godPowerBlocked', 'GOD_POWER_BLOCKED'],
  ])('plays explicit %s without adding stat writes', (type, overlay) => {
    const transaction = compile([{ id: type, type, seat: 0 }, loss]);
    expect(transaction.queue.map(step => step.type)).toEqual([overlay, 'HP_DAMAGE']);
    expect(transaction.queue[0].targetPid).toBe(1);
    expect(transaction.queue[0]).not.toHaveProperty('statEvents');
  });

  it('preserves worm global impacts before its explicit extra target and hit', () => {
    const transaction = compile([
      { id: 'worm', type: 'burrowingWorm', seat: 1 }, loss,
      { id: 'worm-target', type: 'burrowingWormTarget', sourceSeat: 1, targetSeat: 0 },
      { ...loss, id: 'extra', seat: 0, fromHp: 6, hp: 2 },
    ]);
    expect(transaction.queue.map(step => step.type)).toEqual(['BURROWING_WORM', 'HP_DAMAGE', 'RANDOM_TARGET', 'HP_DAMAGE']);
    expect(transaction.queue[2]).toMatchObject({ sourceIdx: 0, targetIdx: 1 });
    expect(transaction.queue[2]).not.toHaveProperty('roll');
  });

  it('uses the public throw result for dice, target, projectile and only then its stat', () => {
    const transaction = compile([
      { id: 'throw', type: 'throwStone', sourceSeat: 0, targetSeat: 1, roll: 5, distance: 3, damage: 2 }, loss,
    ]);
    expect(transaction.queue.map(step => step.type)).toEqual(['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE', 'HP_DAMAGE']);
    expect(transaction.queue[0]).toMatchObject({ diceMode: 'throwStone', d1: 5, d2: 0 });
    expect(transaction.queue[1]).toMatchObject({ sourceIdx: 1, targetIdx: 0, roll: 5, distance: 3, damage: 2 });
    expect(transaction.queue[2]).toMatchObject({ sourceIdx: 1, targetIdx: 0, damage: 2 });
  });

  it('keeps night dice, SAN consequence, inspection and resolved action in producer order', () => {
    const transaction = compile([
      { id: 'night', type: 'apophisTarget', sourceSeat: 1, selectedSeat: 1, targetSeat: 0, roll: 2, changed: true },
      { ...loss, kind: 'SAN_LOSS', fromHp: 6, hp: 6, fromSan: 5, san: 4 },
      { id: 'inspection', type: 'inspectionRevealed', seat: 1, inspectionCard: a },
      { id: 'skill', type: 'skillStarted', kind: 'hunt', sourceSeat: 1, targetSeat: 0 },
    ]);
    expect(transaction.queue.map(step => step.type)).toEqual(['DICE_ROLL', 'SAN_DAMAGE', 'DRAW_CARD', 'SKILL_HUNT']);
    expect(transaction.queue[0]).toMatchObject({ diceMode: 'apophisNight', apophisChanged: true });
  });

  it('highlights only explicitly committed public god affiliation', () => {
    const transaction = compile([{ id: 'faith', type: 'godStatusChanged', seat: 0, godKey: 'CTH', godLevel: 2, godZoneCards: [god] }, loss]);
    expect(transaction.queue[0]).toMatchObject({ type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'CTH' });
    expect(lastPatch(transaction.queue[0]).players[1]).toMatchObject({ godName: 'CTH', godLevel: 2, godZone: [god], hp: 6 });
  });

  it('reshuffles only the prior public discard and keeps the next draw origin', () => {
    const transaction = compile([{ id: 'shuffle', type: 'deckReshuffled', count: 2 },
      { id: 'draw', type: 'cardRevealed', seat: 1, reason: 'draw', sourcePile: 'deck', card: b }], model,
    { ...model.gs, discard: [a, god] });
    expect(transaction.queue.map(step => step.type)).toEqual(['DECK_RESHUFFLE', 'CARD_TRANSFER', 'DRAW_CARD']);
    expect(transaction.queue[1]).toMatchObject({ sourceAnchor: 'discard', dest: 'deck', count: 2, faceUp: false });
    expect(transaction.queue[1]).not.toHaveProperty('cards');
    expect(lastPatch(transaction.queue[1]).discard).toEqual([]);
  });

  it('uses explicit reshuffle count even when the displayed discard is stale', () => {
    const transaction = compile([{ id: 'shuffle', type: 'deckReshuffled', count: 4 }], model, { ...model.gs, discard: [a] });
    expect(transaction.queue[1].count).toBe(4);
  });

  it('reveals only the corridor receipt hand and skips travel on its held-card replay', () => {
    const transaction = compile([{ id: 'corridor', type: 'endlessCorridorStarted', seat: 0, cards: [b, god] },
      { id: 'replay', type: 'cardRevealed', seat: 0, reason: 'endTurnReplay', card: b }]);
    expect(lastPatch(transaction.queue[0]).players[1]).toMatchObject({ hand: [b, god], handVisible: true, revealHand: true });
    expect(lastPatch(transaction.queue[0]).players[0].hand).toEqual([a]);
    expect(transaction.queue[1]).toMatchObject({ type: 'DRAW_CARD', skipTravel: true });
    expect(transaction.queue[1]).not.toHaveProperty('sourcePile');
  });

  it('consumes only the explicitly named etherealize stack before later redirected damage', () => {
    const transaction = compile([{ id: 'consume', type: 'etherealizeConsumed', sourceSeat: 0, targetSeat: 1,
      lostHp: 2, lostSan: 0, stacksBefore: 2, stacksAfter: 1 }, loss]);
    expect(transaction.queue[0]).toMatchObject({ type: 'ETHEREALIZE_CONSUME', targetIdx: 1 });
    expect(lastPatch(transaction.queue[0]).players[1]).toMatchObject({ etherealizeStacks: 1, hp: 6, san: 6 });
    expect(transaction.queue[0]).not.toHaveProperty('statEvents');
  });

  it('discards only the named old public god cards before conversion SAN cost', () => {
    const prior = { ...model.gs, players: [{ ...players[0], godZone: [god, b] }, players[1]] };
    const transaction = compile([{ id: 'conversion', type: 'publicCardsDiscarded', seat: 1, source: 'godZone', cards: [god] },
      { ...loss, kind: 'SAN_LOSS', fromSan: 5, san: 4 }], model, prior);
    expect(transaction.queue[0]).toMatchObject({ type: 'CARD_TRANSFER', sourceAnchor: 'godPower', dest: 'discard', cards: [god] });
    expect(lastPatch(transaction.queue[0]).players[0]).toMatchObject({ hand: [a], godZone: [b], san: 5 });
    expect(lastPatch(transaction.queue[0]).discard).toEqual([god]);
  });

  it.each(['blackGoat', 'tsathogguaSlime'])('commits newly generated public %s tokens before stat consequences', kind => {
    const card = kind === 'blackGoat' ? goat : slime;
    const transaction = compile([{ id: kind, type: 'publicTokensGranted', kind, sourceSeat: 1, targetSeat: 0, cards: [card] }, loss]);
    expect(transaction.queue[0]).toMatchObject({ type: 'CARD_TRANSFER', fromPid: 0, toPid: 1, cards: [card], faceUp: true });
    expect(lastPatch(transaction.queue[0]).players[1].hand).toEqual([back('opponent'), card]);
    expect(lastPatch(transaction.queue[0]).players[0].hand).toEqual([a]);
  });

  it('retrieves the explicitly named public discard card without removing other discard cards', () => {
    const transaction = compile([{ id: 'grave', type: 'publicCardRetrieved', source: 'discard', seat: 1, card: god }, loss],
      model, { ...model.gs, discard: [a, god] });
    expect(lastPatch(transaction.queue[0]).discard).toEqual([a]);
    expect(lastPatch(transaction.queue[0]).players[0].hand).toEqual([a, god]);
    expect(transaction.queue[0].visualTimeline[0].atMs).toBe(400);
  });
});

describe('recipient-scoped transfer receipts', () => {
  it('uses the exact burial count when the private choice came from an all-public-token hand', () => {
    const prior = { ...model.gs, players: [players[0], { ...players[1], hand: [goat, slime], handCount: 2 }] };
    const transaction = compile([{ id: 'burial', type: 'buriedToDeck', seat: 0, count: 1, sourceCount: 1,
      destination: 'deckBottom', cards: [{ _back: true }] }], model, prior);
    expect(transaction.queue[0]).toMatchObject({ type: 'BURY_TO_DECK', fromPid: 1 });
    expect(lastPatch(transaction.queue[0]).players[1].hand).toHaveLength(1);
    expect(lastPatch(transaction.queue[0]).players[1].hand[0]._back).toBe(true);
    expect(transaction.queue[0].visualTimeline[0].atMs).toBe(1150);
  });

  it('keeps hidden loot faces private while committing received cards to the actual hunter', () => {
    const prior = { ...model.gs, players: [players[0], { ...players[1], hand: [back('hidden'), god], handCount: 2 }] };
    const transaction = compile([{ id: 'loot', type: 'huntLootTransferred', sourceSeat: 0, targetSeat: 1,
      count: 2, sourceCount: 0, targetCount: 3, cards: [back('loot-slot'), god], receivedCards: [b, god] }], model, prior);
    expect(transaction.queue[0].transfers.map(item => item.faceUp)).toEqual([false, true]);
    expect(JSON.stringify(transaction.queue[0].transfers)).not.toContain('Known B');
    expect(lastPatch(transaction.queue[0]).players[0].hand).toEqual([a, b, god]);
    expect(lastPatch(transaction.queue[0]).players[1].hand).toEqual([]);
  });

  it('removes only the source-private sent loot card without exposing it in flight', () => {
    const prior = { ...model.gs, players: [{ ...players[0], hand: [a, b], handCount: 2 }, players[1]] };
    const transaction = compile([{ id: 'loot-source', type: 'huntLootTransferred', sourceSeat: 1, targetSeat: 0,
      count: 1, sourceCount: 1, targetCount: 2, cards: [back('loot-slot')], sentCards: [b] }], model, prior);
    expect(lastPatch(transaction.queue[0]).players[0].hand).toEqual([a]);
    expect(JSON.stringify(transaction.queue[0].transfers)).not.toContain('Known B');
  });

  it('plays inspection discarded and destroyed cards after reveal, before explicit damage', () => {
    const prior = { ...model.gs, players: [{ ...players[0], hand: [a, slime], handCount: 2 }, players[1]] };
    const transaction = compile([{ id: 'inspect', type: 'inspectionRevealed', seat: 1, inspectionCard: b,
      discards: [{ seat: 1, card: a, destination: 'discard' }, { seat: 1, card: slime, destination: 'destroyed' }] }, loss], model, prior);
    expect(transaction.queue.map(step => step.type)).toEqual(['DRAW_CARD', 'DISCARD', 'DISCARD', 'HP_DAMAGE']);
    expect(transaction.queue[2].destination).toBe('destroyed');
    expect(lastPatch(transaction.queue[2])).toMatchObject({ discard: [a] });
    expect(lastPatch(transaction.queue[2]).players[0].hand).toEqual([]);
  });

  it('moves a whole hand to its recipient without leaking it to other seats', () => {
    const receipt = { id: 'rose', type: 'hiddenHandTransferred', sourceSeat: 0, targetSeat: 1, count: 1,
      sourceCount: 0, targetCount: 2, receivedSeat: 1, receivedCards: [b] };
    const own = compile([receipt, loss]);
    expect(lastPatch(own.queue[0]).players[0].hand).toEqual([a, b]);
    expect(lastPatch(own.queue[0]).players[1].hand).toEqual([]);
    const observerPlayers = players.map(player => ({ ...player, handVisible: false, hand: [back(`${player.id}`)] }));
    const observer = { ...model, me: null, gs: { ...model.gs, players: observerPlayers } };
    const redacted = compile([{ ...receipt, receivedSeat: undefined, receivedCards: undefined }], observer, observer.gs);
    expect(JSON.stringify(redacted.queue)).not.toContain('Known B');
    expect(lastPatch(redacted.queue[0]).players[0].hand.every(card => card._back)).toBe(true);
  });

  it('swaps unequal hands atomically and does not transfer newly received cards back', () => {
    const prior = { ...model.gs, players: [{ ...players[0], hand: [a, god], handCount: 2 }, players[1]] };
    const transaction = compile([{ id: 'swap-all', type: 'handsSwapped', sourceSeat: 1, targetSeat: 0,
      sourceCount: 1, targetCount: 2, receivedSeat: 1, receivedCards: [b] }, loss], model, prior);
    expect(lastPatch(transaction.queue[0]).players[0].hand).toEqual([b]);
    expect(lastPatch(transaction.queue[0]).players[1].hand).toHaveLength(2);
    expect(lastPatch(transaction.queue[0]).players[1].hand.every(card => card._back)).toBe(true);
    expect(transaction.queue[0].transfers.map(transfer => transfer.count)).toEqual([2, 1]);
    expect(prior.players[0].hand).toEqual([a, god]);
  });

  it.each(['zone', 'godZone', 'discard'])('commits an explicit hand-to-%s receipt only in its own fields', destination => {
    const transaction = compile([{ id: destination, type: 'cardIncomeCommitted', seat: 1, source: 'hand', destination, card: a }, loss]);
    const patch = lastPatch(transaction.queue[0]);
    expect(patch.players[0]).toMatchObject({ hand: [], handCount: 0, hp: 6, san: 5 });
    expect(destination === 'discard' ? patch.discard : patch.players[0][destination === 'zone' ? 'zoneCards' : 'godZone']).toEqual([a]);
    expect(transaction.queue[0]).toMatchObject({ sourceAnchor: 'hand', fromPid: 0, dest: destination });
  });

  it('commits an empty whole-hand exchange without inventing a one-card flight', () => {
    const transaction = compile([{ id: 'empty-swap', type: 'handsSwapped', sourceSeat: 1, targetSeat: 0, sourceCount: 0, targetCount: 0 }]);
    expect(transaction.queue).toHaveLength(1);
    expect(transaction.queue[0]).toMatchObject({ type: 'TURN_BOUNDARY_PAUSE', durationMs: 0 });
    expect(lastPatch(transaction.queue[0]).players.every(player => player.hand.length === 0)).toBe(true);
  });
});

describe('slime special stat ownership and explicit terminal settlement', () => {
  const pop = { id: 'pop', type: 'tsgSlimePopped', seat: 1, count: 1, poppedCards: [slime], fromHp: 4, hp: 5, fromSan: 5, san: 4 };
  it('advances slime balance exactly once between surrounding generic impacts', () => {
    const prior = { ...model.gs, players: [{ ...players[0], hand: [a, slime], handCount: 2 }, players[1]] };
    const transaction = compile([loss, pop, { ...loss, id: 'next-loss', fromHp: 5, hp: 3, fromSan: 4, san: 4 }], model, prior);
    expect(transaction.queue.map(step => step.type)).toEqual(['HP_DAMAGE', 'TSG_SLIME_POP', 'HP_DAMAGE']);
    expect(transaction.queue[1]).not.toHaveProperty('statEvents');
    let stats = primeDisplayStatsForStatQueue([{ hp: 3, san: 4 }, { hp: 6, san: 6 }], transaction.queue);
    expect(stats[0]).toEqual({ hp: 6, san: 5 });
    for (const step of transaction.queue) stats = applyStatAnimationImpact(stats, step);
    expect(stats[0]).toEqual({ hp: 3, san: 4 });
    expect(lastPatch(transaction.queue[1]).players[0].hand).toEqual([a]);
    expect(() => createAuthorityAnimationTransaction([loss, pop, { ...loss, id: 'duplicated', fromHp: 4, hp: 3 }], model, prior)).toThrow('Discontinuous');
  });

  it('keeps safe hands until the named death receipt, revealing only discarded faces', () => {
    const prior = { ...model.gs, players: [{ ...players[0], hand: [a, b], handCount: 2, godZone: [god] }, players[1]] };
    const transaction = compile([
      { id: 'dead', type: 'statChanged', seat: 1, kind: 'PLAYER_DEFEATED', cause: 'hpDepleted', cardSettlementPending: true, revealedRole: 'adventurer' },
      { id: 'death-cards', type: 'deathCardsRemoved', seat: 1, discardedCards: [a, god], destroyedCount: 1 },
    ], model, prior);
    const discard = transaction.queue.find(step => step.type === 'DISCARD' && step.destination === 'discard');
    const destroyed = transaction.queue.find(step => step.destination === 'destroyed');
    expect(discard.visualSetupPatch.players[0]).toMatchObject({ isDead: true, hand: [a, b], godZone: [god] });
    expect(discard.cards).toEqual([a, god]);
    expect(destroyed.cards.every(card => card._back && !card.name)).toBe(true);
    expect(lastPatch(destroyed).players[0]).toMatchObject({ hand: [], godZone: [], handCount: 0 });
    expect(lastPatch(discard).discard).toEqual([a, god]);
  });

  it('primes a leading slime impact before the following generic loss', () => {
    const transaction = compile([pop, { ...loss, id: 'after-pop', fromHp: 5, hp: 3, fromSan: 4, san: 4 }]);
    let stats = primeDisplayStatsForStatQueue([{ hp: 3, san: 4 }, { hp: 6, san: 6 }], transaction.queue);
    expect(stats[0]).toEqual({ hp: 4, san: 5 });
    for (const step of transaction.queue) stats = applyStatAnimationImpact(stats, step);
    expect(stats[0]).toEqual({ hp: 3, san: 4 });
  });

  it('expires exactly one of two links between the same seats without stat writes', () => {
    const prior = { ...model.gs, players: players.map((player, index) => ({ ...player, damageLinks: [
      { id: 'public-link:a', partner: 1 - index, active: true }, { id: 'public-link:b', partner: 1 - index, active: true },
    ] })) };
    const transaction = compile([{ id: 'expire', type: 'damageLinkExpired', pair: [1, 0], linkId: 'public-link:a' }], model, prior);
    expect(transaction.queue).toHaveLength(1);
    expect(transaction.queue[0].visualSetupPatch.players[0].damageLinks).toEqual([{ id: 'public-link:b', partner: 1, active: true }]);
    expect(transaction.queue[0]).not.toHaveProperty('statEvents');
    expect(transaction.queue[0]).toMatchObject({ durationMs: 720, damageLinkBreak: { mode: 'fade' } });
    const broken = compile([{ id: 'break', type: 'damageLinkBroken', pair: [1, 0], linkId: 'public-link:a' }], model, prior);
    expect(broken.queue[0]).toMatchObject({ durationMs: 560, damageLinkBreak: { mode: 'break' } });
  });
});

describe('bounded event reservation across long sessions', () => {
  it('accepts each new event once across more than 256 updates and ignores stale frames', () => {
    const initial = { matchId: 'm', revision: 0, viewerSeat: 1, players, events: [] };
    const buffer = createAuthorityEventBuffer(initial);
    let latest = initial;
    const history = [];
    for (let revision = 1; revision <= 800; revision += 1) {
      const event = { id: `event:${revision}`, type: 'turnStarted', seat: 1 };
      history.push(event);
      latest = { ...initial, revision, events: history.slice(-256) };
      expect(buffer.receive(latest)).toEqual({ restore: false, events: [event] });
      expect(buffer.receive({ ...latest })).toBeNull();
      expect(buffer.receive(initial)).toBeNull();
    }
    expect(buffer.receive({ ...latest, viewerSeat: null })).toEqual({ restore: true, events: [] });
    expect(buffer.receive({ ...latest, viewerSeat: null })).toBeNull();
    expect(buffer.receive({ ...latest, viewerSeat: null, matchId: 'new' })).toEqual({ restore: true, events: [] });
  });
});
