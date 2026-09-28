import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANIMATION_QUEUE_AUTHORITY,
  prepareAnimationTransaction,
} from '../index';
import { createApophisTargetVisualEvent, createStatEventsEvent } from '../visualEvents';
import { assertPreparedAnimationTransaction, createQueueAnimationTransaction } from '../animationTransaction';
import { compileRuleVisualEventsToAnimTransaction } from '../visualEventTransactionCompiler';

describe('prepared animation transaction order', () => {
  it('requires an explicit preparation version before the player accepts a queue', () => {
    expect(() => assertPreparedAnimationTransaction({ authority: 'queue', queue: [] })).toThrow(/prepared queue/);
    const prepared = createQueueAnimationTransaction({ queue: [{ type: 'YOUR_TURN' }] });
    expect(assertPreparedAnimationTransaction(prepared)).toBe(prepared);
  });

  it('repairs a legacy late night roll before handing the queue to playback', () => {
    const night = createApophisTargetVisualEvent({
      seq: 2, actorIdx: 1, targetIdx: 0, roll: 1, changed: true,
    }, { statEvents: [{ id: 'night-san', type: 'SAN_LOSS', target: 1, seq: 7, from: { san: 6 }, to: { san: 5 } }] });
    const dice = { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2, visualEventId: night.id };
    const san = { type: 'SAN_DAMAGE', statEvents: night.statEvents, visualEventId: night.id };
    const skill = { type: 'SKILL_HUNT', targetIdx: 0 };
    const nextState = { _visualEvents: [night], _apophisTargetSeq: 2, players: [] };
    const prepared = prepareAnimationTransaction({
      queue: [skill, dice, san], previousState: { _apophisTargetSeq: 1 }, nextState,
      transactionMeta: { authority: ANIMATION_QUEUE_AUTHORITY.QUEUE },
    });
    expect(prepared.queue.map(step => step.type)).toEqual(['DICE_ROLL', 'SAN_DAMAGE', 'SKILL_HUNT']);
  });

  it('preserves an explicitly composed cross-turn segment through preparation', () => {
    const queue = [{ type: 'SKILL_SWAP' }, { type: 'ENDLESS_CORRIDOR_TUNNEL' }, { type: 'YOUR_TURN' }];
    const prepared = prepareAnimationTransaction({
      queue, nextState: { players: [] },
      transactionMeta: { authority: ANIMATION_QUEUE_AUTHORITY.QUEUE, preserveQueueOrder: true },
    });
    expect(prepared.queue).toEqual(queue);
  });

  it('does not consume a partially presented event even when metadata declares its id', () => {
    const event = createStatEventsEvent({ statEvents: [{
      id: 'two-projections', type: 'HP_SAN_LOSS', target: 0, seq: 1,
      from: { hp: 6, san: 6 }, to: { hp: 5, san: 5 },
    }] });
    const nextState = { players: [], _visualEvents: [event] };
    const compiled = compileRuleVisualEventsToAnimTransaction(nextState);
    const prepare = queue => prepareAnimationTransaction({
      queue, nextState,
      transactionMeta: { authority: ANIMATION_QUEUE_AUTHORITY.QUEUE, eventIds: [event.id] },
    });
    expect(prepare(compiled.queue.slice(0, 1)).eventIds).toEqual([]);
    expect(prepare(compiled.queue).eventIds).toEqual([event.id]);
  });

  it('rejects ambiguous old ownership before the queue reaches playback', () => {
    const stat = { type: 'HP_LOSS', target: 0, seq: 1, from: { hp: 6 }, to: { hp: 3 } };
    const nextState = JSON.parse(JSON.stringify({
      _statEvents: [stat],
      _visualEvents: ['hunt-a', 'hunt-b'].map(id => ({ id, type: 'huntResult', statEvents: [stat] })),
    }));
    expect(() => prepareAnimationTransaction({
      nextState, transactionMeta: { authority: ANIMATION_QUEUE_AUTHORITY.QUEUE },
    })).toThrow(/ambiguous legacy stat identity/);
  });

  it('rejects missing or rearranged projections after a transaction was prepared', () => {
    const transaction = createQueueAnimationTransaction({
      queue: [{ type: 'HP_DAMAGE', visualEventId: 'combined' }, { type: 'SAN_DAMAGE', visualEventId: 'combined' }],
    });
    expect(() => assertPreparedAnimationTransaction({ ...transaction, queue: transaction.queue.slice(0, 1) }))
      .toThrow(/changed after compilation/);
    expect(() => assertPreparedAnimationTransaction({ ...transaction, queue: [...transaction.queue].reverse() }))
      .toThrow(/changed after compilation/);
  });

  it('keeps semantic queue reordering out of the player', () => {
    const player = readFileSync(new URL('../../hooks/useAnimationQueue.js', import.meta.url), 'utf8');
    expect(/\b(?:normalizeApophisQueueForPlayback|mergeApophisTargetQueue|dedupeInferredDiscardTransfers)\s*\(/.test(player)).toBe(false);
  });
});
