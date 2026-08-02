import { describe, expect, it } from 'vitest';
import {
  createCardEffectEvent,
  createGodPowerBlockedEvent,
  createHandLimitDiscardEvent,
  createTimedOutDrawDiscardEvent,
  createTsathogguaSlimePopEvent,
  getVisualEvents,
  pruneConsumedVisualEvents,
} from '../visualEvents';
import {
  compileRuleVisualEventsToAnimTransaction,
  compileVisualEventToAnimSteps,
} from '../visualEventTransactionCompiler';

const player = (name, patch = {}) => ({ name, hp: 10, san: 10, hand: [], ...patch });

describe('visualEventTransactionCompiler', () => {
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
});
