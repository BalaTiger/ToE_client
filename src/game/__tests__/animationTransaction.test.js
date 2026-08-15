import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANIMATION_QUEUE_AUTHORITY,
  createQueueAnimationTransaction,
  getAnimationTransactionDiagnostics,
  prepareAnimationTransaction,
  resetAnimationTransactionDiagnostics,
} from '../index';

describe('animation transaction boundary', () => {
  beforeEach(() => resetAnimationTransactionDiagnostics());

  it('creates an explicit queue-authoritative playback transaction', () => {
    const transaction = prepareAnimationTransaction({
      queue: [{ type: 'CTH_RLYEH_DREAM' }],
      nextState: { phase: 'ACTION' },
      transactionMeta: { authority: ANIMATION_QUEUE_AUTHORITY.QUEUE, eventIds: ['dream'] },
      context: 'test:dream',
    });

    expect(transaction).toMatchObject({
      authority: ANIMATION_QUEUE_AUTHORITY.QUEUE,
      eventIds: ['dream'],
      context: 'test:dream',
    });
    expect(getAnimationTransactionDiagnostics()).toEqual({
      preparedTransactionCount: 1,
      implicitAuthorityCount: 0,
      uncoveredEventCount: 0,
      recompiledEventCount: 0,
    });
  });

  it('carries the canonical-order contract to playback', () => {
    const transaction = prepareAnimationTransaction({
      queue: [{ type: 'DICE_ROLL' }, { type: 'ENDLESS_CORRIDOR_TUNNEL' }],
      nextState: { phase: 'ACTION' },
      transactionMeta: {
        authority: ANIMATION_QUEUE_AUTHORITY.QUEUE,
        preserveQueueOrder: true,
      },
      context: 'test:canonical-order',
    });

    expect(transaction.preserveQueueOrder).toBe(true);
  });

  it('rejects an implicit authority before playback', () => {
    expect(() => prepareAnimationTransaction({
      queue: [],
      nextState: { phase: 'ACTION' },
      context: 'test:implicit',
    })).toThrow('authority is required');
    expect(getAnimationTransactionDiagnostics().implicitAuthorityCount).toBe(1);
  });

  it('records the explicitly retained uncovered-event compatibility path', () => {
    const transaction = prepareAnimationTransaction({
      queue: [{ type: 'DRAW_CARD' }],
      nextState: { players: [], _visualEvents: [] },
      transactionMeta: {
        authority: ANIMATION_QUEUE_AUTHORITY.LEGACY_MERGE,
        compileEventIds: ['future-event'],
        visualEventScope: 'action',
      },
      buildAnimQueue: () => [],
      context: 'test:legacy-compat',
    });

    expect(transaction.authority).toBe(ANIMATION_QUEUE_AUTHORITY.QUEUE);
    expect(getAnimationTransactionDiagnostics()).toMatchObject({
      implicitAuthorityCount: 0,
      uncoveredEventCount: 1,
      recompiledEventCount: 0,
    });
  });

  it('validates strict transaction input', () => {
    expect(() => createQueueAnimationTransaction({ queue: null })).toThrow('queue must be an array');
    expect(() => createQueueAnimationTransaction({ queue: [], eventIds: null })).toThrow('eventIds must be an array');
  });
});
