import { describe, expect, it } from 'vitest';
import {
  collectPendingVisualEventIds,
  getRuleEventCompileIds,
} from '../useAnimationQueue';

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
