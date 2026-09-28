import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import * as animLogs from '../animLogs';
import * as apophisAnimQueue from '../apophisAnimQueue';
import * as zoneCardIncome from '../zoneCardIncome';
import * as rotateState from '../rotateState';
import { buildBewitchGiftVisualTransaction } from '../identitySkillVisualTransaction';
import * as cthRestDrawFlow from '../cthRestDrawFlow';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const handlers = ['handleDrawKeepResolved', 'buryAliveSelectCard', 'resolveSharedBuryAlive',
  'igniteTorchDiscardCard', 'buildTargetContinuationGs', 'finishTargetContinuation',
  'roseThornSelectTarget', 'damageLinkSelectTarget', 'tortoiseOracleSelect',
  'sphinxGuess', 'settleSphinxDodge', 'graveDigSelectGod', 'zoneSwapSelectTarget',
  'decipherStoneCarvingConfirm', 'peekHandSelectTarget', 'buildPendingTurnStartDrawQueue',
  'bewitchSelectTarget', 'firstComePickSelectCard'].map(name => {
  const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`));
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  if (start < 0 || !closing) throw new Error(`Missing App handler boundary: ${name}`);
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n') + '\n' + source.match(/ {2}const clearTurnDrawReplayHints=[\s\S]*?\}\):state;/)[0];

function makeContext(type, { fromRest = false, multiplayer = false, playerOverrides = [], deck = [] } = {}) {
  const card = makeZoneCard(type === 'buryAlive' ? 'A4' : 'C3', 0, {
    type, name: type === 'buryAlive' ? '活埋' : '引燃火把',
    polarity: type === 'buryAlive' ? 'negative' : 'neutral',
    effectScope: type === 'buryAlive' ? 'adjacent' : 'self',
  });
  const players = makeStandardPlayers(3, [{ role: '追猎者' }, { role: '寻宝者' }, { role: '教徒' }]);
  players.forEach(player => { player.hand = [makeZoneCard('B1')]; });
  playerOverrides.forEach((overrides, index) => Object.assign(players[index], overrides));
  const initial = makeGs({ players, _isMP: multiplayer, phase: 'DRAW_REVEAL',
    deck,
    _visualEvents: [], drawReveal: { card, drawerIdx: 0, needsDecision: true, fromRest },
    abilityData: fromRest ? { fromRest: true, cthDrawsRemaining: 1 } : {} });
  const submissions = [];
  const broadcasts = [];
  const stateUpdates = [];
  const consumed = new Set();
  const context = {
    ...game, ...animQueueHelpers, ...animLogs, ...apophisAnimQueue, ...zoneCardIncome, ...rotateState,
    buildBewitchGiftVisualTransaction,
    ...cthRestDrawFlow,
    gs: initial, me: initial.players[0],
    consumedVisualEventIdsRef: { current: consumed }, lastInspectionSeqRef: { current: 0 },
    igniteTorchFlamingCardIdsRef: { current: new Set() },
    playIgniteTorchCardFlameEffect: async () => {}, playIgniteTorchFireSound: () => {},
    isLocalSeatIndex: idx => idx === 0,
    canLocalActOnTargetSelectionPhase: () => true,
    isTutorialActionAllowed: () => true, getNextTutorialStepForAction: () => null,
    setPrivatePeek: vi.fn(),
    document: { querySelectorAll: () => [] }, getCardElementAnchor: () => null,
    localDisplayName: (_idx, name) => name,
    setGs: state => {
      context.gs = typeof state === 'function' ? state(context.gs) : state;
      stateUpdates.push(context.gs);
    },
    broadcastAnimTransaction: (state, queue, options) => {
      broadcasts.push({ state: structuredClone(state), queue: structuredClone(queue), options });
      return multiplayer;
    },
    broadcastEndTurnDecisionAnimTransaction: () => false,
    broadcastMpStateBeforeLocalReplay: vi.fn(),
    _cthContinueRestDraws: vi.fn(state => { context.gs = state; }),
    triggerAnimQueue: (queue, nextState, callback, meta) => {
      const transaction = game.prepareAnimationTransaction({ queue, nextState,
        callback, transactionMeta: meta, consumedEventIds: consumed });
      submissions.push({ queue: transaction.queue, nextState, callback: transaction.callback,
        eventIds: transaction.eventIds });
    },
  };
  context.triggerSyncedAnimTransaction = (queue, state) => context.triggerAnimQueue(queue, state, undefined,
    game.authoritativeResolvedTransitionQueueMeta(context.gs, state, queue, consumed));
  context.finishTutorialActionWithState = (state, _tutorial, queue, meta) => context.triggerAnimQueue(queue, state, undefined, meta);
  runInNewContext(handlers, context);
  function complete() {
    const submission = submissions.at(-1);
    submission.eventIds.forEach(id => consumed.add(id));
    if (submission.nextState) context.gs = submission.nextState;
    submission.callback?.();
  }
  return { context, initial, card, submissions, broadcasts, stateUpdates, complete };
}

describe('local zone effect decisions finish before card income', () => {
  it.each([
    ['buryAlive', 'BURY_ALIVE_SELECT'],
    ['igniteTorch', 'IGNITE_TORCH_DISCARD'],
  ])('%s opens %s without first showing an empty income stage', (type, phase) => {
    const { context, initial, card, submissions, stateUpdates, complete } = makeContext(type);
    context.handleDrawKeepResolved();

    expect(stateUpdates[0]?.phase).toBe(phase);
    expect(stateUpdates[0]?.drawReveal).toBeNull();
    expect(submissions.flatMap(item => item.queue).some(step => step.type === 'CARD_TRANSFER')).toBe(false);
    const decision = submissions.at(-1)?.nextState || context.gs;
    expect(decision.abilityData.pendingZoneIncome).toEqual({ card, ownerId: initial.players[0].id });
    expect(decision.players[0].hand).toEqual(initial.players[0].hand);
    expect(decision.players[0].hand.some(item => item.id === card.id)).toBe(false);
    if (submissions.length) complete();
    expect(context.gs.phase).toBe(phase);
  });

  it('buries the existing card and receives the pending card once after the final target', () => {
    const { context, initial, card, submissions, complete } = makeContext('buryAlive');
    context.handleDrawKeepResolved();
    complete();
    const targets = context.gs.abilityData.targets;
    targets.forEach((targetIdx, index) => {
      const countBefore = submissions.length;
      context.buryAliveSelectCard(0, targetIdx !== 0);
      const submission = submissions.at(-1);
      expect(submissions.length).toBe(countBefore + 1);
      expect(submission.queue.filter(step => step.type === 'CARD_TRANSFER'))
        .toHaveLength(index === targets.length - 1 ? 1 : 0);
      complete();
    });

    expect(context.gs.players[0].hand).toEqual([card]);
    expect(context.gs.deck).toEqual(targets.map(idx => initial.players[idx].hand[0]));
    expect(context.gs.abilityData.pendingZoneIncome).toBeUndefined();
    context.finishTargetContinuation({ nextGs: context.gs });
    expect(context.gs.players[0].hand.filter(item => item.id === card.id)).toHaveLength(1);
    expect(submissions.flatMap(item => item.queue).filter(step => step.type === 'CARD_TRANSFER')).toHaveLength(1);
  });

  it('finishes torch discard and card income before resuming rest draws', async () => {
    const { context, initial, card, submissions, complete } = makeContext('igniteTorch', { fromRest: true });
    context.handleDrawKeepResolved();
    complete();
    await context.igniteTorchDiscardCard(0);

    expect(context._cthContinueRestDraws).not.toHaveBeenCalled();
    const queue = submissions.at(-1).queue;
    expect(queue.findIndex(step => step.type === 'CARD_TRANSFER'))
      .toBeGreaterThan(queue.findIndex(step => step.type === 'DISCARD'));
    complete();
    expect(context._cthContinueRestDraws).toHaveBeenCalledTimes(1);
    expect(context.gs.players[0].hand).toEqual([card]);
    expect(context.gs.discard).toContainEqual(initial.players[0].hand[0]);
    expect(context.gs.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it.each([false, true])('sends pending income to discard when its owner dies (gameOver=%s)', gameOver => {
    const { context, card, submissions, complete } = makeContext('igniteTorch');
    context.handleDrawKeepResolved();
    complete();
    const nextGs = { ...context.gs, players: game.copyPlayers(context.gs.players),
      phase: gameOver ? 'PLAYER_WIN_PENDING' : 'ACTION', gameOver: gameOver ? '追猎者获胜' : null };
    nextGs.players[0].isDead = true;
    context.finishTargetContinuation({ nextGs });

    expect(submissions.at(-1).queue.find(step => step.type === 'CARD_TRANSFER'))
      .toMatchObject({ dest: 'discard', cards: [card] });
    complete();
    expect(context.gs.players[0].hand.some(item => item.id === card.id)).toBe(false);
    expect(context.gs.discard.filter(item => item.id === card.id)).toHaveLength(1);
    expect(context.gs.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it.each(['buryAlive', 'igniteTorch'])('broadcasts the complete %s effect and income queue', async type => {
    const { context, card, broadcasts, submissions, complete } = makeContext(type, { multiplayer: true });
    context.handleDrawKeepResolved();
    complete();
    broadcasts.length = 0;
    if (type === 'buryAlive') context.resolveSharedBuryAlive(context.gs, true);
    else await context.igniteTorchDiscardCard(0);

    expect(broadcasts).toHaveLength(1);
    const sentQueue = broadcasts[0].queue;
    const localQueue = submissions.at(-1).queue;
    expect(sentQueue.map(step => step.type)).toEqual(localQueue.map(step => step.type));
    expect(sentQueue.filter(step => step.type === (type === 'buryAlive' ? 'BURY_TO_DECK' : 'DISCARD')))
      .toHaveLength(type === 'buryAlive' ? 3 : 1);
    expect(sentQueue.filter(step => step.type === 'CARD_TRANSFER')).toHaveLength(1);
    expect(sentQueue.at(-2)).toMatchObject({ type: 'CARD_TRANSFER', cards: [card] });
    expect(broadcasts[0].state.players[0].hand).toEqual([card]);
    expect(broadcasts[0].state.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it('does not win from rose thorn before gifting, and never gifts the triggering card', () => {
    const oldHand = ['A1', 'B2', 'C4'].map(key => makeZoneCard(key));
    const { context, card, submissions, complete } = makeContext('roseThornGiftAllHand', {
      playerOverrides: [{ role: '寻宝者', hand: oldHand }],
    });
    Object.assign(card, { name: '玫瑰倒刺', letter: 'D', number: 3, key: 'D3' });
    context.handleDrawKeepResolved();
    complete();
    expect(context.gs.phase).toBe('ROSE_THORN_SELECT_TARGET');
    expect(context.gs.players[0].hand).toEqual(oldHand);
    context.roseThornSelectTarget(1);
    complete();
    expect(context.gs.players[0].hand).toEqual([card]);
    expect(context.gs.players[1].hand.map(item => item.id)).toEqual(expect.arrayContaining(oldHand.map(item => item.id)));
    expect(context.gs.players[1].hand.some(item => item.id === card.id)).toBe(false);
    expect(context.gs.gameOver).toBeNull();
    expect(submissions.at(-1).queue.filter(step => step.type === 'CARD_TRANSFER').at(-1).cards).toEqual([card]);
  });

  it.each([
    ['damageLink', 'DAMAGE_LINK_SELECT_TARGET', 'damageLinkSelectTarget'],
    ['selfDamageHPPeek', 'PEEK_HAND_SELECT_TARGET', 'peekHandSelectTarget'],
    ['swapAllHands', 'ZONE_SWAP_SELECT_TARGET', 'zoneSwapSelectTarget'],
  ])('%s waits for target resolution before income', (type, phase, handler) => {
    const { context, card, complete, submissions } = makeContext(type);
    context.handleDrawKeepResolved();
    if (submissions.length) complete();
    expect(context.gs.phase).toBe(phase);
    expect(context.gs.players[0].hand.some(item => item.id === card.id)).toBe(false);
    context[handler](1);
    complete();
    expect(context.gs.players[0].hand.filter(item => item.id === card.id)).toHaveLength(1);
    expect(context.gs.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it('decipher stone completes its chosen card/return flow before receiving itself', () => {
    const deck = ['A1', 'B2', 'C3'].map(key => makeZoneCard(key));
    const { context, card, complete } = makeContext('decipherStoneCarving', { deck });
    context.handleDrawKeepResolved();
    complete();
    expect(context.gs.phase).toBe('DECIPHER_STONE_CARVING');
    const revealed = context.gs.abilityData.revealedCards;
    context.decipherStoneCarvingConfirm({ handCard: revealed[0], deckTopCards: revealed.slice(1), deckBottomCards: [] });
    complete();
    expect(context.gs.players[0].hand).toContainEqual(revealed[0]);
    expect(context.gs.players[0].hand.filter(item => item.id === card.id)).toHaveLength(1);
    expect(context.gs.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it('keeps Sphinx outside the hand through guessing and the subsequent dodge decision', () => {
    const { context, card, complete, submissions } = makeContext('sphinxGuess', {
      deck: [makeZoneCard('B2')], playerOverrides: [{ role: '寻宝者' }],
    });
    context.handleDrawKeepResolved();
    complete();
    expect(context.gs.phase).toBe('SPHINX_GUESS');
    context.sphinxGuess(false);
    complete();
    expect(context.gs.phase).toBe('TREASURE_DODGE_DECISION');
    expect(context.gs.drawReveal.card).toEqual(card);
    expect(context.gs.players[0].hand).not.toContainEqual(card);
    context.settleSphinxDodge(false);
    const queue = submissions.at(-1).queue;
    expect(queue.findIndex(step => step.type === 'CARD_TRANSFER')).toBeGreaterThan(queue.findIndex(step => step.type === 'HP_DAMAGE'));
    complete();
    expect(context.gs.players[0].hp).toBe(7);
    expect(context.gs.players[0].hand.filter(item => item.id === card.id)).toHaveLength(1);
  });

  it.each(['buryAlive', 'igniteTorch'])('bewitch cannot use the gifted %s to pay its own effect', type => {
    const { context, card, complete } = makeContext(type);
    context.gs.players[0].hand = [card];
    context.gs.phase = 'BEWITCH_SELECT_TARGET';
    context.gs.abilityData = { bewitchCard: card, bewitchIdx: 0 };
    context.bewitchSelectTarget(1);
    complete();
    expect(context.gs.abilityData.pendingZoneIncome).toEqual({ card, ownerId: context.gs.players[1].id });
    expect(context.gs.players[1].hand).not.toContainEqual(card);
    expect(context.gs.players[0].hand).toEqual([]);
  });

  it('receives first come only after the final AI picker has chosen', () => {
    const { context, card, complete, submissions } = makeContext('firstComePick', {
      deck: ['A1', 'B2', 'C3'].map(key => makeZoneCard(key)),
    });
    context.handleDrawKeepResolved();
    complete();
    while (context.gs.phase === 'FIRST_COME_PICK_SELECT') {
      const count = submissions.length;
      const picker = context.gs.abilityData.pickOrder[context.gs.abilityData.pickIndex || 0];
      expect(context.gs.players[0].hand).not.toContainEqual(card);
      context.firstComePickSelectCard(0, picker !== 0);
      if (submissions.length > count) complete();
    }
    expect(context.gs.players[0].hand.filter(item => item.id === card.id)).toHaveLength(1);
    expect(context.gs.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it('a forced rest draw pauses for the full effect before the next rest draw', () => {
    const { context, card, submissions, complete } = makeContext('buryAlive', { fromRest: true });
    card.forced = true;
    const later = makeZoneCard('B2');
    context.gs = { ...context.gs, deck: [card, later], drawReveal: null, phase: 'ACTION',
      _cthDreamShown: true, abilityData: { fromRest: true, cthDrawsRemaining: 2 } };
    const start = source.indexOf('  function _cthContinueRestDraws(');
    const closing = /\n {2}}\r?\n/.exec(source.slice(start));
    runInNewContext(source.slice(start, start + closing.index + closing[0].length), context);
    context._cthContinueRestDraws(context.gs);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].queue.filter(step => step.type === 'CARD_TRANSFER')).toHaveLength(0);
    complete();
    expect(submissions).toHaveLength(1);
    expect(context.gs.phase).toBe('BURY_ALIVE_SELECT');
    expect(context.gs.abilityData.pendingZoneIncome.card).toEqual(card);
    expect(context.gs.players[0].hand).not.toContainEqual(card);
    expect(context.gs.deck).toEqual([later]);
    expect(context.gs.abilityData.cthDrawsRemaining).toBe(1);
  });

  it('a gifted full-hand swap waits for the recipient target, swaps once, then receives the gift', () => {
    const { context, card, complete } = makeContext('swapAllHands');
    const recipientHand = [...context.gs.players[1].hand];
    const targetHand = [...context.gs.players[2].hand];
    context.gs.players[0].hand = [card];
    context.gs.phase = 'BEWITCH_SELECT_TARGET';
    context.gs.abilityData = { bewitchCard: card, bewitchIdx: 0 };
    context.bewitchSelectTarget(1);
    complete();
    expect(context.gs.phase).toBe('ZONE_SWAP_SELECT_TARGET');
    expect(context.gs.players[1].hand).toEqual(recipientHand);
    expect(context.gs.players[2].hand).toEqual(targetHand);
    context.zoneSwapSelectTarget(2, true);
    complete();
    expect(context.gs.players[1].hand).toEqual([...targetHand, card]);
    expect(context.gs.players[2].hand).toEqual(recipientHand);
    expect(context.gs.currentTurn).toBe(0);
  });
});
