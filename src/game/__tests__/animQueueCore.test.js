import { describe, expect, it } from 'vitest';
import {
  buildAiHuntEventAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
} from '../animQueueCore';
import { compileFreshVisualEventQueue } from '../visualEventTransactionCompiler';
import {
  createCardMoveVisualEvent,
  createDiceResultVisualEvent,
  createStatEventsEvent,
} from '../visualEvents';
import { makeGs, makePlayer } from './factory';

describe('canonical animation queue boundary', () => {
  it('does not infer HP/SAN animation from resolved snapshots', () => {
    const oldGs = makeGs({ players: [makePlayer({ hp: 10, san: 10 })] });
    const newGs = makeGs({ players: [makePlayer({ hp: 8, san: 6 })] });

    expect(compileFreshVisualEventQueue(oldGs, newGs)).toEqual([]);
  });

  it('keeps two explicit SAN losses as two ordered visual settlements', () => {
    const before = [makePlayer({ san: 10 })];
    const first = { seq: 1, type: 'SAN_LOSS', target: 0, from: { san: 10 }, to: { san: 8 } };
    const second = { seq: 2, type: 'SAN_LOSS', target: 0, from: { san: 8 }, to: { san: 4 } };
    const firstEvent = createStatEventsEvent({ statEvents: [first], msgs: ['第一次失去 2 SAN'], order: 0 });
    const secondEvent = createStatEventsEvent({ statEvents: [second], msgs: ['第二次失去 4 SAN'], order: 1 });
    const oldGs = makeGs({ players: before, _visualEvents: [] });
    const newGs = makeGs({ players: [makePlayer({ san: 4 })], _visualEvents: [firstEvent, secondEvent] });

    const queue = compileFreshVisualEventQueue(oldGs, newGs);

    expect(queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(2);
    expect(queue.filter(step => step.type === 'SAN_DAMAGE').map(step => step.statEvents[0].seq)).toEqual([1, 2]);
  });

  it('compiles an explicit card movement without comparing hand counts', () => {
    const card = { id: 'gift', name: '礼物' };
    const event = createCardMoveVisualEvent({
      from: { zone: 'hand', playerIdx: 0 },
      to: { zone: 'hand', playerIdx: 1 },
      cards: [card],
      effect: 'gift',
    });
    const queue = compileFreshVisualEventQueue(
      makeGs({ _visualEvents: [] }),
      makeGs({ _visualEvents: [event] }),
    );

    expect(queue).toContainEqual(expect.objectContaining({
      type: 'CARD_TRANSFER',
      fromPid: 0,
      toPid: 1,
      cards: [card],
      visualEventId: event.id,
    }));
  });

  it('compiles a payload-complete dice event', () => {
    const event = createDiceResultVisualEvent({
      mode: 'rest',
      actorIdx: 1,
      actorName: '卡洛斯',
      d1: 2,
      d2: 5,
      heal: 5,
    });
    const queue = compileFreshVisualEventQueue(
      makeGs({ _visualEvents: [] }),
      makeGs({ _visualEvents: [event] }),
    );

    expect(queue).toEqual([expect.objectContaining({
      type: 'DICE_ROLL',
      diceMode: 'rest',
      d1: 2,
      d2: 5,
      heal: 5,
      visualEventId: event.id,
    })]);
  });
});

describe('retained explicit hunt composers', () => {
  it('builds a hunt reticle and reveal from the event payload', () => {
    const card = { id: 'fire', name: '火牌' };
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯' }),
      makePlayer({ name: '艾伦' }),
    ];
    const queue = buildAiHuntEventAnimQueue({
      hunterIdx: 1,
      targetIdx: 2,
      revealedCard: card,
      beforePlayers: players,
      afterPlayers: players,
      msgs: ['卡洛斯 发动【追捕】'],
    }, '卡洛斯');

    expect(queue.map(step => step.type)).toEqual(expect.arrayContaining(['SKILL_HUNT', 'HUNT_REVEAL_CARD']));
  });

  it('retains the private-card-aware full-hand-swap composer', () => {
    const players = [
      makePlayer({ name: '你', hand: [{ id: 'a' }] }),
      makePlayer({ name: '艾伦', hand: [{ id: 'b' }] }),
    ];
    const queue = buildFullHandSwapTransferQueueFromLogs(
      ['你 与 艾伦 交换了全部手牌'],
      players,
    );

    expect(Array.isArray(queue)).toBe(true);
  });
});
