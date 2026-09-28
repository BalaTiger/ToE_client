import { describe, expect, it } from 'vitest';
import {
  buildAiHuntEventAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
} from '../animQueueCore';
import { compileFreshVisualEventQueue } from '../visualEventTransactionCompiler';
import { prepareAnimQueueLogs } from '../animLogs';
import { copyPlayers } from '../coreUtils';
import { submitLossEvents } from '../effectEngine';
import { consumeVisualLogEntries } from '../visualEventLogs';
import {
  createCardMoveVisualEvent,
  createDiceResultVisualEvent,
  createHuntResultEvent,
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
  it('keeps successful immortality logs on the reveal between hunt damage and healing', () => {
    const discardedCard = { id: 'hunt-discard', name: '地磁反转', key: 'C2', isZone: true };
    const revealedCard = { id: 'hunt-reveal', name: '区域牌', key: 'C1', isZone: true };
    const beforePlayers = [
      makePlayer({ name: '艾伦', hand: [discardedCard] }),
      makePlayer({ name: '贝拉', hp: 2, godName: 'VRI', godLevel: 3, hand: [revealedCard] }),
    ];
    const afterDiscardPlayers = copyPlayers(beforePlayers);
    afterDiscardPlayers[0].hand = [];
    const log = ['艾伦 对 贝拉 【追捕】，亮出 [C1]', '弃 [C2] 地磁反转 → 贝拉 受 3HP 伤害！'];
    const damage = submitLossEvents({
      players: copyPlayers(afterDiscardPlayers),
      deck: [{ id: 'immortal-one', name: '首张区域牌', isZone: true }, { id: 'immortal-two', name: '次张区域牌', isZone: true }],
      discard: [discardedCard], log, currentTurn: 0,
      events: [{ targetIdx: 1, lostHp: 3, source: '追捕' }],
      statEventLogs: log,
      statEventSeq: 10,
      defeatSettlementOwner: 'huntResult',
    });
    expect(damage.players[1]).toMatchObject({ hp: 1, isDead: false });
    const event = createHuntResultEvent({
      hunterIdx: 0, targetIdx: 1, skipIntro: false, skipReveal: false,
      revealedCard, discardedCard, beforePlayers, afterDiscardPlayers,
      beforeDiscard: [], afterDiscardDiscard: [discardedCard],
      afterPlayers: damage.players, afterResultDiscard: damage.discard,
      statEvents: damage.statEvents, msgs: log,
    });
    const state = makeGs({ players: damage.players, log, _visualEvents: [event] });
    const queue = compileFreshVisualEventQueue(makeGs({ _visualEvents: [] }), state);
    const types = queue.map(step => step.type);
    expect(types.filter(type => ['HP_DAMAGE', 'VRI_IMMORTAL_REVEAL', 'HP_HEAL'].includes(type)))
      .toEqual(['HP_DAMAGE', 'VRI_IMMORTAL_REVEAL', 'HP_HEAL']);
    const consumed = new Set();
    const liveByStep = prepareAnimQueueLogs(queue, state)
      .map(step => consumeVisualLogEntries(step.logEntries, consumed));
    const revealIndex = types.indexOf('VRI_IMMORTAL_REVEAL');
    const revealLog = log.find(line => line.includes('【不灭之躯】'));
    expect(revealLog).toContain('HP恢复至1');
    expect(liveByStep.slice(0, revealIndex).flat()).not.toContain(revealLog);
    expect(liveByStep[revealIndex]).toEqual([revealLog]);
    expect(liveByStep[types.indexOf('HP_HEAL')]).toEqual([]);
    expect(liveByStep.flat()).toEqual(log);
  });

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
