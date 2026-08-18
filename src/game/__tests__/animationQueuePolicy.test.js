import { describe, expect, it } from 'vitest';
import {
  ANIMATION_QUEUE_AUTHORITY,
  AUTHORITATIVE_QUEUE_META,
  authoritativeEndTurnReplayQueueMeta,
  authoritativeTurnStartQueueMeta,
  buildThrowStoneSteps,
  createRandomTargetVisualEvent,
  createThrowStoneEvent,
  strictActionQueueMeta,
} from '../index';

describe('animation queue policy', () => {
  it('keeps an already-built queue authoritative and reports its covered event ids', () => {
    const players = [{ name: '你' }, { name: '艾伦' }];
    const event = createRandomTargetVisualEvent({
      seq: 1,
      sourceIdx: 0,
      targetIdx: 1,
      resultText: '艾伦 被选中',
    }, { players });
    const queue = [{ type: 'RANDOM_TARGET', visualEventId: event.id }];

    expect(strictActionQueueMeta({ players, _visualEvents: [event] }, queue)).toEqual({
      authority: ANIMATION_QUEUE_AUTHORITY.QUEUE,
      eventIds: [event.id],
    });
    expect(queue).toEqual([{ type: 'RANDOM_TARGET', visualEventId: event.id }]);
  });

  it('rejects a strict queue that omitted an action visual event', () => {
    const event = createRandomTargetVisualEvent({
      seq: 2,
      sourceIdx: 0,
      targetIdx: 1,
    });

    expect(() => strictActionQueueMeta(
      { _visualEvents: [event] },
      [{ type: 'DRAW_CARD' }],
      null,
      'test action',
    )).toThrow(/test action.*missing visual events/);
  });

  it('continues an end-turn replay after a consumed throw-stone event', () => {
    const players = [{ name: '你' }, { name: '艾伦' }];
    const event = createThrowStoneEvent({
      sourceIdx: 0,
      targetIdx: 1,
      roll: 4,
      distance: 1,
      damage: 3,
      playersBefore: players,
      playersAfter: players,
    });
    const state = { players, _visualEvents: [event] };
    const throwStoneQueue = buildThrowStoneSteps(event, state);
    const firstSegmentMeta = authoritativeEndTurnReplayQueueMeta(state, throwStoneQueue);
    const consumedEventIds = new Set(firstSegmentMeta.eventIds);
    const nextCardQueue = [{
      type: 'DRAW_CARD',
      card: { id: 'grilled-blind-fish', name: '烤盲鱼' },
      targetPid: 0,
    }];

    expect(firstSegmentMeta).toEqual({
      authority: ANIMATION_QUEUE_AUTHORITY.QUEUE,
      eventIds: [event.id],
    });
    expect(authoritativeEndTurnReplayQueueMeta(state, nextCardQueue, consumedEventIds)).toEqual(
      AUTHORITATIVE_QUEUE_META,
    );
    expect(() => authoritativeEndTurnReplayQueueMeta(state, nextCardQueue, new Set()))
      .toThrow(/end-turn replay queue.*missing visual events/);
  });

  it('scopes turn-start ownership without compiling or changing the queue', () => {
    const state = {
      _visualEvents: [
        { id: 'turn-boundary', turnStartStage: 'turnBoundary' },
        { id: 'turn-banner', turnStartStage: 'turnBanner' },
        { id: 'action-event' },
      ],
    };

    expect(authoritativeTurnStartQueueMeta(state)).toEqual({
      ...AUTHORITATIVE_QUEUE_META,
      eventIds: ['turn-boundary', 'turn-banner'],
    });
  });
});
