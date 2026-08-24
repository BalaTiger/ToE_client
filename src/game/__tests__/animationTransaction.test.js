import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANIMATION_QUEUE_AUTHORITY,
  createQueueAnimationTransaction,
  getAnimationTransactionDiagnostics,
  createRandomTargetVisualEvent,
  prepareAnimationTransaction,
  resetAnimationTransactionDiagnostics,
  submitAnimationPresentation,
  truncateQueueAtTerminalPresentation,
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

  it('compiles and submits an event-authoritative presentation through one boundary', () => {
    const players = [{ name: '你' }, { name: '艾伦' }];
    const event = createRandomTargetVisualEvent({
      seq: 1,
      sourceIdx: 0,
      targetIdx: 1,
      label: '测试目标',
      resultText: '艾伦 被选中',
    }, { players });
    const playTransaction = vi.fn();

    const transaction = submitAnimationPresentation({
      playTransaction,
      nextState: { players, _visualEvents: [event] },
      authority: ANIMATION_QUEUE_AUTHORITY.EVENTS,
      eventIds: [event.id],
      compileOptions: { players },
      context: 'test:event-presentation',
    });

    expect(transaction.queue).toMatchObject([{
      type: 'RANDOM_TARGET',
      visualEventId: event.id,
      sourceIdx: 0,
      targetIdx: 1,
    }]);
    expect(transaction.eventIds).toEqual([event.id]);
    expect(playTransaction).toHaveBeenCalledOnce();
    expect(playTransaction).toHaveBeenCalledWith(transaction);
  });

  it('rejects a presentation submission without a player boundary', () => {
    expect(() => submitAnimationPresentation({
      queue: [],
      context: 'test:missing-player',
    })).toThrow('playTransaction must be a function');
  });

  it('truncates a terminal queue after the causative stat step', () => {
    const causal = {
      type: 'SAN_DAMAGE',
      visualEventId: 'san-terminal',
      statEvents: [{ type: 'SAN_LOSS', target: 0, from: { san: 2 }, to: { san: 0 } }],
    };
    const queue = [
      { type: 'YOUR_TURN', visualEventId: 'turn-banner' },
      causal,
      { type: 'INSPECTION', visualEventId: 'stale-inspection' },
      { type: 'DRAW_CARD', visualEventId: 'stale-ai-action' },
    ];

    expect(truncateQueueAtTerminalPresentation(queue, { gameOver: { winner: '邪祀者' } }))
      .toEqual(queue.slice(0, 2));
  });

  it('uses an explicit terminal boundary for non-stat terminal outcomes', () => {
    const queue = [
      { type: 'DRAW_CARD', visualEventId: 'winning-draw', terminalBoundary: true },
      { type: 'DISCARD', visualEventId: 'stale-discard' },
    ];

    expect(truncateQueueAtTerminalPresentation(queue, { gameOver: { winner: '寻宝者' } }))
      .toEqual([queue[0]]);
  });

  it('leaves a nonterminal queue unchanged', () => {
    const queue = [{ type: 'SAN_DAMAGE', terminalBoundary: true }, { type: 'DRAW_CARD' }];
    expect(truncateQueueAtTerminalPresentation(queue, { gameOver: null })).toEqual(queue);
  });

  it('drops a terminal transaction continuation and consumes only the causal prefix', () => {
    const callback = vi.fn();
    const transaction = prepareAnimationTransaction({
      queue: [
        {
          type: 'SAN_DAMAGE',
          visualEventId: 'terminal-hit',
          statEvents: [{ type: 'SAN_LOSS', from: { san: 1 }, to: { san: 0 } }],
        },
        { type: 'DRAW_CARD', visualEventId: 'post-terminal-ai-action' },
      ],
      nextState: { gameOver: { winner: '邪祀者' } },
      callback,
      transactionMeta: {
        authority: ANIMATION_QUEUE_AUTHORITY.QUEUE,
        eventIds: ['terminal-hit', 'post-terminal-ai-action'],
      },
      context: 'test:terminal-callback',
    });

    expect(transaction.queue.map(step => step.visualEventId)).toEqual(['terminal-hit']);
    expect(transaction.eventIds).toEqual(['terminal-hit']);
    expect(transaction.callback).toBeUndefined();
    expect(callback).not.toHaveBeenCalled();
  });
});
