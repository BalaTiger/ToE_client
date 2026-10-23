import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPrivateMatch, resolveCommand } from '../../packages/rules/src/authority/command.js';
import { migratedActions } from '../../packages/rules/src/authority/coverage.js';
import { projectMatch } from '../../packages/rules/src/authority/view.js';
import { drawAuthorityCard } from '../../packages/rules/src/authority/automatic.js';
import { executeRuleResolution } from '../../packages/rules/src/execution.js';
import { GOD_DEFS, FIXED_ZONE_CARD_VARIANTS_BY_KEY, createTsathogguaSlimeCard } from '../../packages/rules/src/constants/card.js';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../../packages/rules/src/game/coreUtils.js';
import { createAuthorityPresentation } from './presentation/model';
import { createAuthorityAnimationTransaction } from './presentationEvents';
import { prepareAnimationQueueSteps } from '../game/animationStepSchema';
import { applyStatAnimationImpact, primeDisplayStatsForStatQueue } from '../game/statEvents';

const secret = 'PRIVATE-INTEGRATION-CANARY';
const card = (id, type = 'selfHealHP', extra = {}) => ({ id: `${secret}:${id}`, name: id,
  key: 'A1', letter: 'A', number: 1, isZone: true, type, val: 1, privateMetadata: secret, ...extra });
const god = (key, id) => ({ ...GOD_DEFS[key], id: `${secret}:${id}`, key, isGod: true, privateMetadata: secret });
function zone(type, id, name) {
  const matches = item => item.type === type && (!name || item.name === name);
  const [key, variants] = Object.entries(FIXED_ZONE_CARD_VARIANTS_BY_KEY).find(([, list]) => list.some(matches));
  return { ...variants.find(matches), key, letter: key[0], number: Number(key[1]), isZone: true,
    id: `${secret}:${id}`, privateMetadata: secret };
}
function initial(patch = {}) {
  return createPrivateMatch({ id: 'presentation-integration', seed: 12, now: 0, state: {
    _isMP: true, _intentEngine: true, phase: 'ACTION', currentTurn: 0, turn: 1, _turnKey: 1,
    players: [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST, ROLE_HUNTER].map((role, id) => ({ id, role, name: `P${id}`,
      hp: 8, san: 8, isDead: false, hand: [card(`held-${id}`)], godZone: [], zoneCards: [], peekMemories: {} })),
    deck: [card('next')], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [], abilityData: {}, ...patch,
  } });
}
function act(match, type, payload = {}, seat = 0, ports = {}) {
  const result = resolveCommand(match, { permission: 'player', seat }, { version: 2, matchId: match.id,
    revision: match.revision, decisionId: match.decision.id, actionId: `action:${match.revision}`, type, payload },
  { now: 1, actions: migratedActions, ...ports });
  expect(result.match.revision, JSON.stringify(result.acknowledgement)).toBe(match.revision + 1);
  return result.match;
}
const host = { actions: migratedActions, handleForCard: (seat, id) => createHash('sha256').update(`${seat}:${id}`).digest('hex') };
function compile(before, after, seat) {
  const viewer = seat === null ? { permission: 'observer' } : { permission: 'player', seat };
  const previousView = projectMatch(before, viewer, host), previous = createAuthorityPresentation(previousView);
  const view = projectMatch(after, viewer, host), model = createAuthorityPresentation(view);
  const priorIds = new Set((previousView.events || []).map(event => event.id));
  const events = view.events.filter(event => !priorIds.has(event.id));
  const transaction = createAuthorityAnimationTransaction(events, model, previous.gs);
  const prepared = prepareAnimationQueueSteps(transaction.queue);
  expect(prepared.issues).toEqual([]);
  expect(JSON.stringify(transaction)).not.toContain(secret);
  let stats = primeDisplayStatsForStatQueue(model.gs.players.map(player => ({ hp: player.hp, san: player.san })), transaction.queue);
  expect(stats).toEqual(previous.gs.players.map(player => ({ hp: player.hp, san: player.san })));
  for (const step of transaction.queue) stats = applyStatAnimationImpact(stats, step);
  expect(stats).toEqual(model.gs.players.map(player => ({ hp: player.hp, san: player.san })));
  return { transaction, previous, model, events };
}
const lastPlayers = queue => queue.flatMap(step => [step.visualSetupPatch?.players,
  ...(step.visualTimeline || []).map(cue => cue.patch?.players)]).filter(Boolean).at(-1);

describe.each([0, 1, null])('canonical rule to safe original animation queue, viewer %s', seat => {
  it.each([true, false])('plays blind=%s swap taking only for its actor, then gives without a repeated take', blind => {
    const before = initial({ phase: blind ? 'SWAP_STEAL_CARD' : 'SWAP_SELECT_TARGET_CARD', abilityData: { swapTi: 1 } });
    before.state.players[1].hand.push(card('taken-target'));
    before.state.players[1].revealHand = !blind;
    let randomCalls = 0;
    const taken = act(before, blind ? 'swap.takeBlind' : 'swap.takeVisible', blind ? {} : { cardIndex: 1 }, 0,
      { random: () => { randomCalls++; return 0.75; } });
    expect(randomCalls).toBe(blind ? 1 : 0);
    const take = compile(before, taken, seat);
    if (seat === 0) {
      expect(take.transaction.queue).toHaveLength(1);
      const flight = take.transaction.queue[0];
      expect(flight).toMatchObject({ type: 'CARD_TRANSFER', fromPid: take.model.toDisplaySeat(1), toPid: 0,
        sourceAnchor: 'hand', dest: 'player', count: 1, durationMs: 700, flightDurationMs: 700, faceUp: !blind });
      expect(flight.visualTimeline[0].atMs).toBe(700);
      if (blind) expect(flight.cards[0]).toMatchObject({ _back: true });
      else expect(flight.cards[0].name).toBe('taken-target');
      expect(flight.visualSetupPatch.players[0].handCount).toBe(1);
      expect(lastPlayers(take.transaction.queue)[0].hand.map(item => item.name)).toEqual(['held-0', 'taken-target']);
      expect(lastPlayers(take.transaction.queue)[take.model.toDisplaySeat(1)].handCount).toBe(1);
    } else {
      expect(take.events.some(event => event.type === 'swapTakeCommitted')).toBe(false);
      expect(take.transaction.queue.some(step => step.type === 'CARD_TRANSFER')).toBe(false);
      expect(take.model.gs.players.map(player => [player.handCount, player.hand]))
        .toEqual(take.previous.gs.players.map(player => [player.handCount, player.hand]));
    }
    const give = compile(taken, act(taken, 'swap.give', { cardIndex: 0 }), seat);
    expect(give.events.some(event => event.type === 'swapTakeCommitted')).toBe(false);
    const exchange = give.transaction.queue.find(step => step.type === 'CARD_TRANSFER');
    expect(exchange.transfers).toHaveLength(seat === 0 ? 1 : 2);
    if (seat === 0) expect(exchange.transfers[0]).toMatchObject({ fromPid: 0, toPid: take.model.toDisplaySeat(1) });
    expect(lastPlayers(give.transaction.queue)[give.model.toDisplaySeat(0)].handCount).toBe(1);
    expect(lastPlayers(give.transaction.queue)[give.model.toDisplaySeat(1)].handCount).toBe(2);
  });

  it('commits stone income and private rearrangement on the original shared-duration paths', () => {
    const before = initial({ phase: 'DECIPHER_STONE_CARVING', abilityData: { playerIndex: 0,
      revealedCards: [card('stone-kept'), card('stone-bottom'), card('stone-top')] } });
    const { transaction, model, events } = compile(before, act(before, 'stone.arrange',
      { handIndex: 0, topIndices: [2], bottomIndices: [1] }), seat);
    const receipt = events.find(event => event.type === 'stoneCardsArranged');
    expect(receipt).toMatchObject({ returnedCount: 2, handCount: 2 });
    const flight = transaction.queue.find(step => step.type === 'CARD_TRANSFER');
    expect(flight.durationMs).toBe(780);
    expect(flight.visualTimeline[0].atMs).toBe(780);
    expect(flight.transfers.map(transfer => transfer.dest)).toEqual(seat === 0
      ? ['player', 'deckTop', 'deckBottom'] : ['player', 'deck', 'deck']);
    if (seat === 0) expect(flight.transfers.map(transfer => transfer.cards[0].name)).toEqual(['stone-kept', 'stone-top', 'stone-bottom']);
    else {
      expect(receipt).not.toHaveProperty('topCards');
      expect(receipt).not.toHaveProperty('bottomCards');
      expect(flight.transfers.every(transfer => transfer.cards[0]._back && !transfer.faceUp)).toBe(true);
    }
    expect(lastPlayers(transaction.queue)[model.toDisplaySeat(0)].handCount).toBe(2);
  });

  it('reveals albino fire before its explicit random target and actual HP/SAN impact', () => {
    const before = initial({ phase: 'ALBINO_CREATURE_SELECT_CARD', abilityData: { playerIndex: 0, fireCardIds: [] } });
    before.state.abilityData.fireCardIds = [before.state.players[0].hand[0].id];
    let randomCalls = 0;
    const { transaction, model } = compile(before, act(before, 'albino.reveal', { cardIndex: 0 }, 0,
      { random: () => { randomCalls++; return 0.3; } }), seat);
    expect(randomCalls).toBe(1);
    const queue = transaction.queue;
    const reveal = queue.findIndex(step => step.type === 'DRAW_CARD');
    const target = queue.findIndex(step => step.type === 'RANDOM_TARGET');
    expect(reveal).toBeGreaterThanOrEqual(0);
    expect(target).toBeGreaterThan(reveal);
    expect(queue[target]).toMatchObject({ sourceIdx: model.toDisplaySeat(0), targetIdx: model.toDisplaySeat(1), label: '白化生物' });
    expect(queue.findIndex(step => step.type === 'HP_DAMAGE')).toBeGreaterThan(target);
    expect(queue.findIndex(step => step.type === 'SAN_DAMAGE')).toBeGreaterThan(target);
  });

  it('commits the actual rest marker and its later automatic clearing from explicit receipts', () => {
    const before = initial();
    const { transaction, model } = compile(before, act(before, 'turn.rest', {}, 0, { random: () => 0 }), seat);
    expect(lastPlayers(transaction.queue)[model.toDisplaySeat(0)].isResting).toBe(true);
    const beforeSkip = initial();
    beforeSkip.state.players[1].isResting = true;
    const skipped = compile(beforeSkip, act(beforeSkip, 'turn.end'), seat);
    expect(lastPlayers(skipped.transaction.queue)[skipped.model.toDisplaySeat(1)].isResting).toBe(false);
  });

  it.each([false, true])('commits actual sealed duel hands at the original landing (tie=%s)', tie => {
    const start = initial({ phase: 'CAVE_DUEL_SELECT_TARGET', abilityData: { caveDuelSource: 0, caveDuelTargets: [1] } });
    start.state.players[0].hand = [card('duel-source', 'selfHealHP', { number: tie ? 1 : 4 })];
    start.state.players[1].hand = [card('duel-target')];
    const selected = act(start, 'caveDuel.selectTarget', { targetSeat: 1 });
    const before = act(selected, 'caveDuel.commit', { cardIndex: 0 });
    const { transaction, model } = compile(before, act(before, 'caveDuel.commit', { cardIndex: 0 }, 1), seat);
    expect(transaction.queue.filter(step => step.type === 'CAVE_DUEL')).toHaveLength(1);
    expect(transaction.queue.some(step => step.type === 'CARD_TRANSFER')).toBe(false);
    if (!tie) {
      const duel = transaction.queue.find(step => step.type === 'CAVE_DUEL');
      expect(duel.visualTimeline[0].atMs).toBe(2390);
      const final = lastPlayers(transaction.queue);
      expect(final[model.toDisplaySeat(0)].handCount).toBe(2);
      expect(final[model.toDisplaySeat(1)].handCount).toBe(0);
      if (seat === 0) expect(final[0].hand).toEqual(model.gs.players[0].hand);
    }
  });

  it.each([false, true])('plays the actual torch discard/destroyed=%s before any consequence', destroyed => {
    const before = initial({ phase: 'IGNITE_TORCH_DISCARD', abilityData: { playerIndex: 0 } });
    before.state.players[0].hand = [destroyed ? card('slime', 'tsathogguaSlime', { isTsathogguaSlime: true }) : card('balance', 'lifeBalance')];
    const { transaction, model } = compile(before, act(before, 'torch.discard', { cardIndex: 0 }), seat);
    expect(transaction.queue[0]).toMatchObject({ type: 'DISCARD', destination: destroyed ? 'destroyed' : 'discard' });
    expect(lastPlayers(transaction.queue)[model.toDisplaySeat(0)].handCount).toBe(0);
  });

  it.each([false, true])('presents sphinx correct=%s reveal before its single actual destination receipt', correct => {
    const before = initial({ phase: 'SPHINX_GUESS', abilityData: { playerIndex: 0 } });
    before.state.players[0].role = ROLE_CULTIST;
    const { transaction, model } = compile(before, act(before, 'sphinx.guess', { isZone: correct }), seat);
    const transfers = transaction.queue.filter(step => step.type === 'CARD_TRANSFER');
    expect(transfers).toHaveLength(1);
    expect(transfers[0].dest).toBe(correct ? 'player' : 'discard');
    expect(transaction.queue.findIndex(step => step.type === 'DRAW_CARD')).toBeLessThan(transaction.queue.indexOf(transfers[0]));
    if (!correct) expect(transaction.queue.findIndex(step => step.type === 'HP_DAMAGE')).toBeGreaterThan(transaction.queue.indexOf(transfers[0]));
    expect(lastPlayers(transaction.queue)[model.toDisplaySeat(0)].handCount).toBe(correct ? 2 : 1);
  });

  it('buries only after all locks, in committed order, without disclosing selected opponent faces', () => {
    const beforeLocks = initial({ phase: 'BURY_ALIVE_SELECT', abilityData: { targets: [0, 1], buryAliveChoices: [null, null, null, null] } });
    beforeLocks.state.players[0].hand.push(card('retained'));
    const first = act(beforeLocks, 'bury.commit', { cardIndex: 0 });
    expect(compile(beforeLocks, first, seat).transaction.queue.some(step => step.type === 'BURY_TO_DECK')).toBe(false);
    const { transaction, model } = compile(first, act(first, 'bury.commit', { cardIndex: 0 }, 1), seat);
    const buries = transaction.queue.filter(step => step.type === 'BURY_TO_DECK');
    expect(buries.map(step => step.fromPid)).toEqual([model.toDisplaySeat(0), model.toDisplaySeat(1)]);
    buries.forEach((step, index) => {
      if (seat === index) expect(step.card.name).toBe(`held-${index}`);
      else expect(step.card._back).toBe(true);
    });
    const final = lastPlayers(transaction.queue);
    expect(final[model.toDisplaySeat(0)].handCount).toBe(1);
    expect(final[model.toDisplaySeat(1)].handCount).toBe(0);
  });

  it.each([false, true])('shows actual ZHU top-to-bottom movement (sphinx=%s) with viewer-safe face', sphinx => {
    const seed = initial({ deck: [card('hidden-top'), card('replacement'), card('bottom')] });
    Object.assign(seed.state.players[0], { godName: 'ZHU', godLevel: 1 });
    seed.state.zhuLight = { ownerIdx: 0, level: 1, cardIds: [seed.state.deck[0].id], lightNonce: 1 };
    const state = sphinx ? { ...seed.state, phase: 'SPHINX_GUESS', abilityData: { playerIndex: 1 } }
      : executeRuleResolution({ namespace: 'zhu-fixture', random: () => 0.9, now: 0 }, () => drawAuthorityCard(seed.state, 1));
    const before = createPrivateMatch({ id: seed.id, seed: 12, now: 0, state });
    const { transaction } = compile(before, act(before, sphinx ? 'zhu.hideSphinx' : 'zhu.hide', { hide: true }), seat);
    const zhu = transaction.queue.findIndex(step => step.type === 'ZHU_HIDE_CARD');
    expect(zhu).toBeGreaterThanOrEqual(0);
    if (seat === 0) expect(transaction.queue[zhu].card.name).toBe('hidden-top');
    else expect(transaction.queue[zhu].card._back).toBe(true);
    if (!sphinx) expect(transaction.queue.findIndex(step => step.type === 'DRAW_CARD')).toBeGreaterThan(zhu);
  });

  it('pulses actual public goats before their HP/SAN losses and the new draw', () => {
    const before = initial();
    before.state.players[1].hand = [card('goat', 'blackGoatYoung', { isBlackGoatYoung: true })];
    const { transaction } = compile(before, act(before, 'turn.end'), seat);
    const types = transaction.queue.map(step => step.type);
    const pulse = types.indexOf('BLACK_GOAT_PULSE');
    expect(pulse).toBeGreaterThan(types.indexOf('YOUR_TURN'));
    expect(types.indexOf('HP_DAMAGE')).toBeGreaterThan(pulse);
    expect(types.indexOf('SAN_DAMAGE')).toBeGreaterThan(pulse);
    expect(types.indexOf('DRAW_CARD')).toBeGreaterThan(types.indexOf('SAN_DAMAGE'));
  });

  it('plays hand-limit public discard and token destruction before the next turn', () => {
    const before = initial({ phase: 'DISCARD_PHASE' });
    before.state.players[0].hand = [...Array.from({ length: 4 }, (_, index) => card(`kept-${index}`)),
      card('ordinary'), card('slime', 'tsathogguaSlime', { isTsathogguaSlime: true })];
    const { transaction, model } = compile(before, act(before, 'turn.discard', { cardIndices: [4, 5] }), seat);
    const moves = transaction.queue.filter(step => step.type === 'DISCARD');
    expect(moves.map(step => step.destination)).toEqual(['destroyed', 'discard']);
    expect(lastPlayers(transaction.queue)[model.toDisplaySeat(0)].handCount).toBe(4);
    expect(transaction.queue.findIndex(step => step.type === 'YOUR_TURN')).toBeGreaterThan(transaction.queue.indexOf(moves.at(-1)));
  });

  it.each([1, 6])('presents actual dodge roll %s before its damage and committed income', roll => {
    const beforeDraw = initial({ phase: 'DRAW_REVEAL', drawReveal: { drawerIdx: 0, needsDecision: true,
      card: card('dodgeable-damage', 'selfDamageHP', { val: 2, polarity: 'negative', effectScope: 'self' }) } });
    const before = act(beforeDraw, 'draw.keep');
    let draws = 0;
    const after = act(before, 'treasureDodge.reply', { use: true }, 0, { random: () => { draws += 1; return (roll - 0.5) / 6; } });
    expect(draws).toBe(1);
    const { transaction } = compile(before, after, seat);
    const dice = transaction.queue.findIndex(step => step.type === 'DICE_ROLL');
    const income = transaction.queue.findIndex(step => step.type === 'CARD_TRANSFER' && step.dest === 'player');
    expect(transaction.queue[dice].d1).toBe(roll);
    expect(dice).toBeLessThan(income);
    const damage = transaction.queue.findIndex(step => step.type === 'HP_DAMAGE');
    if (roll === 1) {
      expect(damage).toBeGreaterThan(dice);
      expect(damage).toBeLessThan(income);
    } else expect(damage).toBe(-1);
  });

  it('plays earthquake discards and destruction before its actual stat consequences', () => {
    const before = initial({ phase: 'DRAW_REVEAL', drawReveal: { drawerIdx: 0, needsDecision: true, card: card('earthquake', 'allDiscard') } });
    before.state.players[1].hand = [card('balance', 'lifeBalance')];
    before.state.players[2].hand = [card('slime', 'tsathogguaSlime', { isTsathogguaSlime: true })];
    before.state.players[3].hand = [card('blank', 'blankZone')];
    const { transaction, events } = compile(before, act(before, 'draw.keep'), seat);
    const earthquake = transaction.queue.findIndex(step => step.type === 'EARTHQUAKE');
    expect(earthquake).toBeGreaterThanOrEqual(0);
    expect(transaction.queue.findIndex(step => step.type === 'HP_DAMAGE')).toBeGreaterThan(earthquake);
    expect(events.find(event => event.type === 'cardsDiscarded').discards.map(item => item.destination))
      .toEqual(['discard', 'discard', 'destroyed']);
  });

  it.each(['allDamageHPRandomExtra', 'throwStone'])('preserves explicit complex %s causal order', type => {
    const before = initial({ phase: 'DRAW_REVEAL', drawReveal: { drawerIdx: 0, needsDecision: true, card: card(type, type, { val: 2 }) } });
    const { transaction } = compile(before, act(before, 'draw.keep'), seat);
    const types = transaction.queue.map(step => step.type);
    if (type === 'allDamageHPRandomExtra') {
      expect(types.indexOf('BURROWING_WORM')).toBeLessThan(types.indexOf('HP_DAMAGE'));
      expect(types.lastIndexOf('HP_DAMAGE')).toBeGreaterThan(types.indexOf('RANDOM_TARGET'));
    } else expect(types.filter(item => ['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE'].includes(item)))
      .toEqual(['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE']);
  });

  it('settles actual death without terminal schema errors or private destroyed-card faces', () => {
    const before = initial({ phase: 'DRAW_REVEAL', drawReveal: { drawerIdx: 0, needsDecision: true, card: card('lethal', 'selfDamageHP', { val: 5 }) } });
    before.state.players[0].hp = 1;
    before.state.players[0].hand.push(card('slime', 'tsathogguaSlime', { isTsathogguaSlime: true }));
    before.state.players[0].godZone = [god('CTH', 'old-god')];
    const { transaction, model } = compile(before, act(before, 'draw.keep'), seat);
    const destroyed = transaction.queue.find(step => step.destination === 'destroyed');
    expect(destroyed.cards.every(item => item._back && !item.name)).toBe(true);
    expect(lastPlayers(transaction.queue)[model.toDisplaySeat(0)]).toMatchObject({ hand: [], godZone: [], isDead: true });
  });

  it('converts old god zone before SAN cost and commits the new god before highlight', () => {
    const before = initial({ phase: 'GOD_CHOICE', abilityData: { drawerIdx: 0, godCard: god('CTH', 'next-god') } });
    Object.assign(before.state.players[0], { godName: 'NYA', godLevel: 1, godZone: [god('NYA', 'old-god')] });
    const { transaction, model } = compile(before, act(before, 'god.choose', { choice: 'worship' }), seat);
    const removal = transaction.queue.findIndex(step => step.sourceAnchor === 'godPower' && step.dest === 'discard');
    const san = transaction.queue.findIndex(step => step.type === 'SAN_DAMAGE');
    const income = transaction.queue.findIndex(step => step.dest === 'godZone');
    expect(removal).toBeGreaterThanOrEqual(0);
    expect(san).toBeGreaterThan(removal);
    expect(income).toBeGreaterThan(san);
    expect(transaction.queue.findIndex(step => step.type === 'GOD_HIGHLIGHT')).toBeGreaterThan(income);
    expect(lastPlayers(transaction.queue)[model.toDisplaySeat(0)].godZone).toEqual(model.gs.players[model.toDisplaySeat(0)].godZone);
  });

  it('exchanges unequal hands once before delayed income, with private faces only for the recipient', () => {
    const beforeDraw = initial({ phase: 'DRAW_REVEAL', drawReveal: { drawerIdx: 0, needsDecision: true, card: zone('swapAllHands', 'drawn-swap') } });
    beforeDraw.state.players[1].hand.push(card('second-target'));
    const before = act(beforeDraw, 'draw.keep');
    const { transaction, model } = compile(before, act(before, 'zoneSwap.selectTarget', { targetSeat: 1 }), seat);
    expect(transaction.queue.find(step => step.transfers?.length === 2)).toBeTruthy();
    const finalPlayers = lastPlayers(transaction.queue);
    for (const player of model.gs.players) {
      const details = transaction.queue.map(step => ({ type: step.type, eventId: step.visualEventId, dest: step.dest,
        hand: step.visualTimeline?.at(-1)?.patch?.players?.[player.id]?.hand.map(item => item.name || 'back') }));
      expect(finalPlayers[player.id].handCount, JSON.stringify(details)).toBe(player.handCount);
      if (player.id === model.me?.id) expect(finalPlayers[player.id].hand).toEqual(player.hand);
      else expect(finalPlayers[player.id].hand.every(item => item._back || item.isBlackGoatYoung || item.isTsathogguaSlime)).toBe(true);
    }
  });

  it('shows a corridor receipt hand before replaying its held card without deck travel', () => {
    const before = initial();
    before.state.players[0].hand = [zone('selfHealHP', 'replayed-card'), zone('endTurnReplayHand', 'corridor')];
    const { transaction, model } = compile(before, act(before, 'turn.end'), seat);
    const tunnel = transaction.queue.find(step => step.type === 'ENDLESS_CORRIDOR_TUNNEL');
    expect(tunnel.visualTimeline[0].patch.players[model.toDisplaySeat(0)]).toMatchObject({ handVisible: true, revealHand: true, handCount: 2 });
    const draw = transaction.queue.find(step => step.type === 'DRAW_CARD');
    expect(draw.skipTravel).toBe(true);
    expect(draw).not.toHaveProperty('sourcePile');
  });

  it('reshuffles the explicit public count before the next actual deck draw', () => {
    const before = initial({ deck: [], discard: [zone('selfHealHP', 'shuffle-a'), zone('selfHealHP', 'shuffle-b')] });
    const { transaction } = compile(before, act(before, 'turn.end'), seat);
    const reshuffle = transaction.queue.findIndex(step => step.type === 'DECK_RESHUFFLE');
    expect(reshuffle).toBeGreaterThanOrEqual(0);
    expect(transaction.queue[reshuffle + 1]).toMatchObject({ type: 'CARD_TRANSFER', sourceAnchor: 'discard', dest: 'deck', count: 2 });
    expect(transaction.queue.findIndex(step => step.type === 'DRAW_CARD')).toBeGreaterThan(reshuffle + 1);
  });

  it('grants actual SHU public tokens before subsequent consequences', () => {
    const before = initial({ phase: 'SHU_SELECT_TARGET', abilityData: { shuChooserIdx: 0, shuOffspringCount: 3 } });
    const { transaction, model } = compile(before, act(before, 'shu.selectTarget', { targetSeat: 1 }), seat);
    const transfer = transaction.queue.find(step => step.effect === 'blackGoat');
    expect(transfer.cards).toHaveLength(3);
    expect(transfer.cards.every(item => item.isBlackGoatYoung)).toBe(true);
    expect(lastPlayers(transaction.queue)[model.toDisplaySeat(1)].handCount).toBe(model.gs.players[model.toDisplaySeat(1)].handCount);
  });

  it('moves a rose whole hand with received faces only at the recipient', () => {
    const before = initial({ phase: 'ROSE_THORN_SELECT_TARGET', abilityData: { roseThornSource: 0, roseThornTargets: [1] } });
    before.state.players[0].hand.push(card('rose-second'));
    const { transaction, model } = compile(before, act(before, 'roseThorn.selectTarget', { targetSeat: 1 }), seat);
    const finalPlayers = lastPlayers(transaction.queue);
    expect(finalPlayers[model.toDisplaySeat(0)].hand).toEqual([]);
    expect(finalPlayers[model.toDisplaySeat(1)].handCount).toBe(3);
    if (seat === 1) expect(finalPlayers[0].hand).toEqual(model.gs.players[0].hand);
    else expect(finalPlayers[model.toDisplaySeat(1)].hand.every(item => item._back)).toBe(true);
  });

  it('retrieves the actual public god from discard without revealing other hands', () => {
    const actual = god('NYA', 'grave-god');
    const before = initial({ phase: 'GRAVE_DIG_SELECT', discard: [actual], abilityData: { playerIndex: 0, godCards: [actual] } });
    const { transaction, model } = compile(before, act(before, 'grave.choose', { cardIndex: 0 }), seat);
    const transfer = transaction.queue.find(step => step.effect === 'graveDig');
    expect(transfer).toMatchObject({ sourceAnchor: 'discard', dest: 'player', count: 1, faceUp: true });
    expect(transfer.visualTimeline.at(-1).patch.discard).toEqual([]);
    expect(lastPlayers(transaction.queue)[model.toDisplaySeat(0)].handCount).toBe(2);
  });

  it.each([false, true])('keeps hunt defeat, %s-public loot and remaining death settlement in actual order', publicHand => {
    let start = initial();
    start.state.players[0].role = ROLE_HUNTER;
    Object.assign(start.state.players[1], { hp: 3, revealHand: publicHand,
      hand: Array.from({ length: 5 }, (_, index) => card(`victim-${index}`)) });
    start = act(start, 'skill.begin');
    start = act(start, 'hunt.selectTarget', { targetSeat: 1 });
    start = act(start, 'hunt.reveal', { cardIndex: 0 }, 1);
    const attacked = act(start, 'hunt.attack', { cardIndex: 0 });
    const { transaction: attackQueue, model: attackedModel } = compile(start, attacked, seat);
    expect(attackQueue.queue.findIndex(step => step.type === 'DISCARD'))
      .toBeLessThan(attackQueue.queue.findIndex(step => step.type === 'HP_DAMAGE'));
    let before = start, after = attacked;
    if (publicHand) {
      expect(lastPlayers(attackQueue.queue)[attackedModel.toDisplaySeat(1)]).toMatchObject({ isDead: true, handCount: 5 });
      before = attacked;
      after = act(before, 'hunt.loot', { cardIndices: [0, 2, 4] });
    }
    const { transaction, model, events } = compile(before, after, seat);
    const loot = events.find(event => event.type === 'huntLootTransferred');
    expect(loot.cards).toHaveLength(3);
    const finalPlayers = lastPlayers(transaction.queue);
    expect(finalPlayers[model.toDisplaySeat(1)]).toMatchObject({ isDead: true, hand: [], handCount: 0 });
    expect(finalPlayers[model.toDisplaySeat(0)].handCount).toBe(3);
    if (seat === 0) expect(finalPlayers[0].hand).toEqual(model.gs.players[0].hand);
    if (!publicHand && seat !== 0) {
      const flight = transaction.queue.find(step => step.transfers?.length === 3);
      expect(flight.transfers.every(item => !item.faceUp || item.cards[0].name === 'victim-0')).toBe(true);
    }
  });

  it.each([false, true])('plays actual inspection discard with destroyed=%s after inspection reveal', destroyed => {
    const before = initial({ phase: 'DRAW_REVEAL',
      drawReveal: { drawerIdx: 0, needsDecision: true, card: card('san-loss', 'selfDamageSAN', { val: 1 }) },
      inspectionDeck: [{ name: 'Inspection discard', effect: 'discardRandom', value: 1, type: 'negative' }] });
    before.state.players[0].san = 6;
    before.state.players[0].hand = [destroyed ? card('slime', 'tsathogguaSlime', { isTsathogguaSlime: true }) : card('balance', 'lifeBalance')];
    const { transaction, events } = compile(before, act(before, 'draw.keep'), seat);
    const receipt = events.find(event => event.type === 'inspectionRevealed');
    expect(receipt.discards).toHaveLength(1);
    expect(receipt.discards[0].destination).toBe(destroyed ? 'destroyed' : 'discard');
    const reveal = transaction.queue.findIndex(step => step.type === 'DRAW_CARD');
    expect(transaction.queue[reveal + 1]).toMatchObject({ type: 'DISCARD', destination: destroyed ? 'destroyed' : 'discard' });
  });

  it('consumes a redirected etherealize stack before damage reaches the actual target', () => {
    let start = initial();
    start.state.players[0].role = ROLE_HUNTER;
    Object.assign(start.state.players[1], { hp: 3, etherealizeStacks: 1 });
    start = act(start, 'skill.begin');
    start = act(start, 'hunt.selectTarget', { targetSeat: 1 });
    start = act(start, 'hunt.reveal', { cardIndex: 0 }, 1);
    start = act(start, 'hunt.attack', { cardIndex: 0 });
    const before = act(start, 'etherealize.answer', { use: true }, 1);
    const { transaction, model } = compile(before, act(before, 'etherealize.redirect', { targetSeat: 2 }, 1), seat);
    const consume = transaction.queue.findIndex(step => step.type === 'ETHEREALIZE_CONSUME');
    expect(consume).toBeGreaterThanOrEqual(0);
    expect(transaction.queue[consume].targetIdx).toBe(model.toDisplaySeat(1));
    expect(transaction.queue.findIndex(step => step.type === 'HP_DAMAGE')).toBeGreaterThan(consume);
    expect(model.gs.players[model.toDisplaySeat(1)].hp).toBe(3);
  });

  it('commits the actual slime balance at the original special impact without generic duplicates', () => {
    const before = initial({ phase: 'TSG_SLIME_BALANCE', abilityData: { targetIdx: 0, afterHp: 3, afterSan: 9 } });
    Object.assign(before.state.players[0], { hp: 3, san: 9, hand: [createTsathogguaSlimeCard()] });
    const { transaction, model } = compile(before, act(before, 'slime.answer', { use: true }), seat);
    const pop = transaction.queue.find(step => step.type === 'TSG_SLIME_POP');
    expect(pop.statPresentation).toMatchObject({ target: model.toDisplaySeat(0), from: { hp: 3, san: 9 }, to: { hp: 6, san: 6 } });
    expect(transaction.queue.some(step => step.statEvents?.some(event => event.target === model.toDisplaySeat(0)))).toBe(false);
  });

  it.each([
    ['allHealHP', 'UNDERGROUND_SPRING', '地下泉'], ['adjDamageHP', 'STARTLED_BATS', '惊扰蝙蝠'], ['allDamageBoth', 'NIGHT_WIND', '夜风呼啸'],
    ['allDamageHP', 'VOLCANO', '活火山'], ['geomagneticReversal', 'GEOMAGNETIC_REVERSAL'], ['etherealize', 'ETHEREALIZE_GAIN'],
    ['snakePoisonTrap', 'SNAKE_TRAP'],
  ])('uses the original %s area overlay from the actual safe receipt', (type, overlay, name) => {
    const before = initial({ phase: 'DRAW_REVEAL', drawReveal: { drawerIdx: 0, needsDecision: true, card: zone(type, type, name) } });
    before.state.players.forEach(player => { player.role = ROLE_CULTIST; });
    const { transaction } = compile(before, act(before, 'draw.keep'), seat);
    expect(transaction.queue.some(step => step.type === overlay)).toBe(true);
    if (type === 'geomagneticReversal') expect(transaction.queue.some(step => step.type === 'GEOMAGNETIC_RESTORE_SHUFFLE')).toBe(true);
  });
});
