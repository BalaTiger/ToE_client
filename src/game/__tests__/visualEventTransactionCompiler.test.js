import { describe, expect, it } from 'vitest';
import {
  createCardEffectEvent,
  createGodPowerBlockedEvent,
  createGodStatusChangedEvent,
  createApophisTargetVisualEvent,
  createInspectionVisualEvent,
  createThrowStoneEvent,
  createHandLimitDiscardEvent,
  createTimedOutDrawDiscardEvent,
  createTsathogguaSlimePopEvent,
  getVisualEvents,
  promoteLegacyVisualEvents,
  pruneConsumedVisualEvents,
} from '../visualEvents';
import {
  compileRuleVisualEventsToAnimTransaction,
  compileVisualEventToAnimSteps,
  getAnimationQueueVisualEventIds,
  mergeAnimationTransactionQueue,
  validateVisualEventTransaction,
} from '../visualEventTransactionCompiler';

const player = (name, patch = {}) => ({ name, hp: 10, san: 10, hand: [], ...patch });

describe('visualEventTransactionCompiler', () => {
  it('compiles a god status event into one idempotent highlight step', () => {
    const before = [player('你'), player('贝拉', { godName: 'TSG', godLevel: 1 })];
    const after = [before[0], { ...before[1], godLevel: 2 }];
    const event = createGodStatusChangedEvent({
      playerIdx: 1,
      playerName: '贝拉',
      godKey: 'TSG',
      godLevel: 2,
      msgs: ['贝拉 从手牌升级邪神之力至 Lv.2'],
      playersBefore: before,
      playersAfter: after,
    });

    expect(compileVisualEventToAnimSteps(event, { players: after })).toEqual([expect.objectContaining({
      type: 'GOD_HIGHLIGHT',
      visualEventId: event.id,
      targetPid: 1,
      godKey: 'TSG',
      godLevel: 2,
      visualSetupPatch: { players: after },
      visualTimeline: [{ atMs: 0, patch: { players: after } }],
    })]);
  });

  it('gives repeated events unique ids while keeping legacy packet ids stable', () => {
    const card = { id: 'repeat', name: '重复牌', type: 'zone' };
    const first = createTimedOutDrawDiscardEvent({ card, drawerIdx: 1, drawerName: '艾伦' });
    const second = createTimedOutDrawDiscardEvent({ card, drawerIdx: 1, drawerName: '艾伦' });
    expect(second.id).not.toBe(first.id);
    expect(pruneConsumedVisualEvents({ _visualEvents: [second] }, new Set([first.id]))._visualEvents).toEqual([second]);

    const legacyState = { _visualEvents: [{ type: 'timedOutDrawDiscard', card, drawerIdx: 1 }] };
    expect(getVisualEvents(legacyState)[0].id).toBe(getVisualEvents(legacyState)[0].id);
  });

  it('compiles rule-owned discard and god-power events in event order', () => {
    const card = { id: 'discard-me', name: '弃牌', type: 'zone' };
    const discard = createHandLimitDiscardEvent({ playerIdx: 1, playerName: '艾伦', cards: [card], msgs: ['艾伦弃牌'] });
    const blocked = createGodPowerBlockedEvent({ playerIdx: 1, playerName: '艾伦', msgs: ['神力被阻挡'] });
    const state = {
      players: [player('你'), player('艾伦')],
      discard: [card],
      phase: 'ACTION',
      _visualEvents: [discard, blocked],
    };

    const transaction = compileRuleVisualEventsToAnimTransaction(state, { players: state.players, discard: [] });

    expect(transaction.context).toBe('ruleEventBatch');
    expect(transaction.id).toBe(`visual-transaction:${discard.id}+${blocked.id}`);
    expect(transaction.barrier).toBe('continuation');
    expect(transaction.eventIds).toEqual([discard.id, blocked.id]);
    expect(transaction.queue.map(step => step.type)).toEqual(['DISCARD', 'GOD_POWER_BLOCKED']);
    expect(transaction.queue[0]).toMatchObject({ targetPid: 1, cards: [card] });
  });

  it('compiles slime pop with its before/after visual timeline', () => {
    const slime = { id: 'slime', name: '黏液' };
    const before = [player('你', { hand: [slime] })];
    const after = [player('你', { hand: [] })];
    const event = createTsathogguaSlimePopEvent({
      playerIdx: 0,
      cards: [slime],
      playersBefore: before,
      playersAfter: after,
      msgs: ['黏液消失'],
    });

    expect(compileVisualEventToAnimSteps(event, { players: after })).toEqual([expect.objectContaining({
      type: 'TSG_SLIME_POP',
      targetPid: 0,
      cards: [slime],
      visualSetupPatch: { players: before },
      visualTimeline: [{ atMs: 700, patch: { players: after } }],
    })]);
  });

  it('compiles timeout discard and card-effect events without UI state inference', () => {
    const card = { id: 'timeout', name: '超时牌', type: 'zone' };
    const timeout = createTimedOutDrawDiscardEvent({ card, drawerIdx: 1, drawerName: '艾伦' });
    expect(compileVisualEventToAnimSteps(timeout, { players: [player('你'), player('艾伦')] })[0])
      .toMatchObject({ type: 'DISCARD', card, targetPid: 1 });

    const effect = createCardEffectEvent({
      effectKey: 'burrowingWorm',
      actorIdx: 1,
      card,
      beforePlayers: [player('你'), player('艾伦')],
      beforeDiscard: [],
      msgs: ['蠕虫效果'],
    });
    expect(compileVisualEventToAnimSteps(effect, { players: [player('你'), player('艾伦')] })[0])
      .toMatchObject({ type: 'BURROWING_WORM', actorIdx: 1, durationMs: 2750 });
  });

  it('compiles throw stone as one ordered transaction', () => {
    const before = [player('你'), player('贝拉')];
    const after = [before[0], player('贝拉', { hp: 7 })];
    const event = createThrowStoneEvent({
      sourceIdx: 0,
      targetIdx: 1,
      roll: 4,
      distance: 1,
      damage: 3,
      playersBefore: before,
      playersAfter: after,
      statEvents: [{ type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10 }, to: { hp: 7, san: 10 }, seq: 1 }],
    });

    expect(compileVisualEventToAnimSteps(event, { players: after }).map(step => step.type))
      .toEqual(['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE', 'HP_DAMAGE']);
    const transaction = compileRuleVisualEventsToAnimTransaction({
      players: after,
      phase: 'ACTION',
      _visualEvents: [event],
    });
    expect(transaction.id).toBe(event.id);
    expect(validateVisualEventTransaction(transaction, [event])).toEqual([]);
  });

  it('compiles rule-owned turn start and draw events without state diffs', () => {
    const card = { id: 'draw-card', name: '本回合摸牌', type: 'zone' };
    const state = {
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      players: [player('你'), player('艾伦')],
      drawReveal: { card, drawerIdx: 1, sourcePile: 'deck' },
      _visualEvents: [
        { type: 'turnStart', id: 'turn-start-5', playerIdx: 1, playerName: '艾伦', msgs: ['艾伦的回合'] },
        { type: 'drawCard', id: 'draw-5', playerIdx: 1, playerName: '艾伦', card, sourcePile: 'deck', msgs: ['艾伦摸牌'] },
      ],
    };

    const transaction = compileRuleVisualEventsToAnimTransaction(state);
    expect(transaction.eventIds).toEqual(['turn-start-5', 'draw-5']);
    expect(transaction.queue.map(step => step.type)).toEqual(['YOUR_TURN', 'DRAW_CARD']);
    expect(getAnimationQueueVisualEventIds(transaction.queue)).toEqual(['turn-start-5', 'draw-5']);
  });

  it('compiles black-night target selection from the event id instead of a watermark', () => {
    const players = [player('你'), player('艾伦'), player('贝拉')];
    const event = createApophisTargetVisualEvent({
      seq: 9,
      actorIdx: 0,
      actorName: '你',
      selectedIdx: 1,
      targetIdx: 2,
      roll: 1,
      changed: true,
      label: '选择【追捕】目标',
      log: '黑夜目标偏移',
      apophisNight: { active: true },
    }, { playersAfter: players });

    expect(compileVisualEventToAnimSteps(event, { players }).map(step => step.type))
      .toEqual(['DICE_ROLL', 'SKILL_HUNT']);
  });

  it('compiles one inspection event as a self-contained reveal flow', () => {
    const before = [player('你')];
    const after = [player('你', { hp: 8 })];
    const event = createInspectionVisualEvent({
      seq: 3,
      card: { id: 'inspection', name: '自残', effect: 'selfDamageHP' },
      target: 0,
      beforePlayers: before,
      beforeLog: [],
      beforeDiscard: [],
      afterPlayers: after,
      afterLog: ['你 的SAN检定结果为"自残"', '你 自残，失去 2 HP'],
      afterDiscard: [],
      statEvents: [{ type: 'HP_LOSS', target: 0, from: { hp: 10, san: 10 }, to: { hp: 8, san: 10 }, seq: 1 }],
      statEventSeq: 1,
    });

    const steps = compileVisualEventToAnimSteps(event, { players: after });
    expect(steps.map(step => step.type)).toEqual(expect.arrayContaining(['VISUAL_LOCK', 'DRAW_CARD', 'HP_DAMAGE', 'STATE_PATCH']));
    expect(steps.find(step => step.type === 'DRAW_CARD')).toMatchObject({ inspectionSeq: 3 });
  });

  it('promotes legacy replay metadata to deterministic visual-event ids', () => {
    const card = { id: 'legacy-card', name: '旧检定牌' };
    const state = {
      _turnKey: 4,
      _statEventSeq: 3,
      _statEvents: [{ type: 'HP_LOSS', target: 1, seq: 3 }],
      _inspectionEvents: [{ seq: 2, target: 1, card }],
      _animSphinxReveal: { actorIdx: 1, card, guessCorrect: true },
    };

    const first = promoteLegacyVisualEvents(state);
    const second = promoteLegacyVisualEvents(state);
    expect(first.map(event => event.type)).toEqual(['statEvents', 'inspection', 'sphinxResult']);
    expect(second.map(event => event.id)).toEqual(first.map(event => event.id));
  });

  it('merges canonical transactions without duplicating equivalent legacy steps', () => {
    const transaction = {
      eventIds: ['event-1'],
      queue: [{ type: 'DICE_ROLL', diceMode: 'throwStone', d1: 4, rollerName: '你', visualEventId: 'event-1' }],
    };
    const merged = mergeAnimationTransactionQueue(
      [{ type: 'DICE_ROLL', diceMode: 'throwStone', d1: 4, rollerName: '你' }],
      transaction,
    );
    expect(merged).toHaveLength(1);
    expect(getAnimationQueueVisualEventIds(merged)).toEqual(['event-1']);
  });

  it('restores a canonical event as one ordered block when legacy inference interleaves it', () => {
    const transaction = {
      id: 'stone-event',
      eventIds: ['stone-event'],
      queue: [
        { type: 'DICE_ROLL', diceMode: 'throwStone', d1: 4, rollerName: '你', visualEventId: 'stone-event' },
        { type: 'RANDOM_TARGET', sourceIdx: 0, targetIdx: 1, visualEventId: 'stone-event' },
        { type: 'THROW_STONE', sourceIdx: 0, targetIdx: 1, visualEventId: 'stone-event' },
      ],
    };
    const merged = mergeAnimationTransactionQueue([
      transaction.queue[0],
      { type: 'PAUSE', durationMs: 100 },
      transaction.queue[2],
      transaction.queue[1],
    ], transaction);

    expect(merged.map(step => step.type)).toEqual(['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE', 'PAUSE']);
  });

  it('reports incomplete throw-stone transactions at the compiler boundary', () => {
    const event = { type: 'throwStone', id: 'broken-stone', damage: 3 };
    expect(validateVisualEventTransaction({
      id: event.id,
      eventIds: [event.id],
      queue: [{ type: 'DICE_ROLL', visualEventId: event.id }],
    }, [event])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INCOMPLETE_THROW_STONE_TRANSACTION', eventId: event.id }),
    ]));
  });
});
