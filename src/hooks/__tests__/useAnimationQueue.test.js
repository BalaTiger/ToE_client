import { describe, expect, it } from 'vitest';
import {
  collectPendingVisualEventIds,
  getRuleEventCompileIds,
  getRuleEventCompileState,
} from '../useAnimationQueue';
import { compileRuleVisualEventsToAnimTransaction } from '../../game/visualEventTransactionCompiler';
import { createGodPowerBlockedEvent } from '../../game/visualEvents';

describe('animation queue event-id ownership', () => {
  it('uses compileEventIds to limit legacy compilation without confirming consumption', () => {
    const transactionMeta = {
      authority: 'legacyMerge',
      compileEventIds: ['uncovered-event'],
    };

    expect(getRuleEventCompileIds(transactionMeta)).toEqual(['uncovered-event']);
    expect(collectPendingVisualEventIds([], null, transactionMeta)).toEqual([]);
  });

  it('confirms an uncovered event only after the rule compiler produced it', () => {
    const transactionMeta = {
      authority: 'legacyMerge',
      compileEventIds: ['compiled-event', 'empty-event'],
    };
    const ruleTransaction = { eventIds: ['compiled-event'] };

    expect(collectPendingVisualEventIds([], ruleTransaction, transactionMeta))
      .toEqual(['compiled-event']);
  });

  it('uses a continuation compileState when playback intentionally has no pending nextGs', () => {
    const event = createGodPowerBlockedEvent({ playerIdx: 0, playerName: '你' });
    const continuationState = {
      phase: 'ACTION',
      players: [{ name: '你' }],
      _visualEvents: [event],
    };
    const transactionMeta = {
      authority: 'legacyMerge',
      compileEventIds: [event.id],
      compileState: continuationState,
    };

    const compileState = getRuleEventCompileState(null, transactionMeta);
    const ruleTransaction = compileRuleVisualEventsToAnimTransaction(
      compileState,
      null,
      { eventIds: getRuleEventCompileIds(transactionMeta) },
    );

    expect(compileState).toBe(continuationState);
    expect(ruleTransaction.queue).toEqual([
      expect.objectContaining({ type: 'GOD_POWER_BLOCKED', visualEventId: event.id }),
    ]);
    expect(collectPendingVisualEventIds([], ruleTransaction, transactionMeta))
      .toEqual([event.id]);
    expect(getRuleEventCompileState({ phase: 'DECISION' }, transactionMeta))
      .toEqual({ phase: 'DECISION' });
  });

  it('still confirms exact queue-authority event ids and ids attached to steps', () => {
    const queue = [{ type: 'DRAW_CARD', visualEventId: 'inspection-event' }];
    const transactionMeta = {
      authority: 'queue',
      eventIds: ['inspection-event', 'suppressed-stat-wrapper'],
    };

    expect(getRuleEventCompileIds(transactionMeta))
      .toEqual(['inspection-event', 'suppressed-stat-wrapper']);
    expect(collectPendingVisualEventIds(queue, null, transactionMeta)).toEqual([
      'inspection-event',
      'suppressed-stat-wrapper',
    ]);
  });
});
