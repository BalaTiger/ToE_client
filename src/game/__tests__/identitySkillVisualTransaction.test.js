import { describe, expect, it } from 'vitest';
import {
  appendHuntStageEvents,
  buildBewitchGiftVisualTransaction,
  buildHuntStageVisualTransaction,
  buildMpHuntRevealVisualTransaction,
  buildSwapCardsVisualTransaction,
  compileFreshBewitchVisualTransaction,
  compileFreshHuntVisualTransaction,
  compileFreshSwapVisualTransaction,
  getHuntAttemptId,
} from '../identitySkillVisualTransaction';
import {
  createAnimTransactionEvent,
  createApophisTargetVisualEvent,
  createBewitchGiftEvent,
  createHuntRevealEvent,
  createHuntTargetEvent,
  createInspectionVisualEvent,
  createSwapCardsEvent,
} from '../visualEvents';
import { rotateGsForViewer } from '../rotateState';
import { compileFreshVisualEventQueue } from '../visualEventTransactionCompiler';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { normalizeLogForViewer } from '../logPerspective';
import { createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../../constants/card';

function player(name, hand = []) {
  return { name, hp: 10, san: 10, hand, godZone: [], isDead: false };
}

describe('identity skill visual transactions', () => {
  it('keeps the swap actor and target distinct after an exact replay changes viewer seats', () => {
    const taken = { id: 'taken', name: '暗抽牌' };
    const given = { id: 'given', key: 'C2', name: '地下泉' };
    const before = [player('林恩', [given]), player('索菲', [taken]), player('米娅')];
    const after = [player('林恩', [taken]), player('索菲', [given]), player('米娅')];
    const previousState = { players: before, currentTurn: 0, _isMP: true, _visualEvents: [] };
    const result = buildSwapCardsVisualTransaction({
      previousState,
      state: { ...previousState, players: after, phase: 'ACTION' },
      swapEvent: createSwapCardsEvent({
        sourceIdx: 0,
        targetIdx: 1,
        takenCard: taken,
        givenCard: given,
        beforePlayers: before,
        afterPlayers: after,
        msgs: [
          '你（寻宝者）对 索菲 【掉包】，请选择要抽取的牌',
          '拿走 暗抽牌，还给 索菲 [C2] 地下泉',
        ],
      }),
    });
    const broadcast = {
      ...result.state,
      _visualEvents: [createAnimTransactionEvent({
        actorIdx: 0,
        actorName: '林恩',
        queue: result.queue,
        context: 'swapCards',
      }), ...result.state._visualEvents],
    };

    for (let viewer = 0; viewer < 3; viewer++) {
      const remoteState = rotateGsForViewer(broadcast, viewer);
      const queue = compileFreshVisualEventQueue(rotateGsForViewer(previousState, viewer), remoteState);
      const consumed = new Set();
      const live = prepareAnimQueueLogs(queue, remoteState)
        .flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
      // No heading or settlement transcript is supplied to resolve the actor.
      expect(live[0]).toBe('林恩（寻宝者）对 索菲 【掉包】，请选择要抽取的牌');
      expect(normalizeLogForViewer(live, { isMultiplayer: true, myName: remoteState.players[0].name })).toEqual([
        `${viewer === 0 ? '你' : '林恩'}（寻宝者）对 ${viewer === 1 ? '你' : '索菲'} 【掉包】，请选择要抽取的牌`,
        `拿走 暗抽牌，还给 ${viewer === 1 ? '你' : '索菲'} [C2] 地下泉`,
      ]);
    }
  });

  it('builds swap state and queue through the shared boundary', () => {
    const taken = { id: 'taken', name: '拿走的牌' };
    const given = { id: 'given', name: '交还的牌' };
    const before = [player('寻宝者', [given]), player('目标', [taken])];
    const after = [player('寻宝者', [taken]), player('目标', [given])];
    const event = createSwapCardsEvent({
      sourceIdx: 0,
      targetIdx: 1,
      takenCard: taken,
      givenCard: given,
      beforePlayers: before,
      afterPlayers: after,
    });

    const result = buildSwapCardsVisualTransaction({
      previousState: { players: before, _visualEvents: [] },
      state: { players: after, phase: 'ACTION', _visualEvents: [] },
      swapEvent: event,
    });

    expect(result.queue.map(step => step.type)).toEqual([
      'SKILL_SWAP', 'VISUAL_LOCK', 'CARD_TRANSFER', 'CARD_TRANSFER',
    ]);
    expect(result.state._visualEvents[0]).toMatchObject({
      id: event.id,
      transactionId: `identity:swap:${event.id}`,
    });
    expect(compileFreshSwapVisualTransaction(result.state)?.transaction.eventIds).toEqual([event.id]);
  });

  it('keeps nested bewitch settlement owned by one shared transaction', () => {
    const gift = { id: 'gift', name: '蛊惑礼物', type: 'zone' };
    const inspection = createInspectionVisualEvent({
      seq: 1,
      target: 1,
      card: { id: 'inspection', name: '失眠症' },
      beforePlayers: [player('邪祀者'), player('目标')],
      afterPlayers: [player('邪祀者'), player('目标')],
    });
    const event = createBewitchGiftEvent({
      sourceIdx: 0,
      targetIdx: 1,
      targetName: '目标',
      card: gift,
      playersBefore: [player('邪祀者', [gift]), player('目标')],
      playersAfter: [player('邪祀者'), player('目标', [gift])],
      settlementEvents: [inspection],
    });
    const previousState = { players: [player('邪祀者', [gift]), player('目标')], _visualEvents: [] };

    const result = buildBewitchGiftVisualTransaction({
      previousState,
      state: { players: [player('邪祀者'), player('目标', [gift])], phase: 'ACTION', _visualEvents: [inspection, event] },
      bewitchEvent: event,
      relatedEvents: [inspection],
    });

    expect(result.queue.slice(0, 3).map(step => step.type)).toEqual([
      'SKILL_BEWITCH', 'CARD_TRANSFER', 'DRAW_CARD',
    ]);
    expect(result.inspectionEvents).toEqual([inspection]);
    const replay = compileFreshBewitchVisualTransaction(result.state, previousState);
    expect(replay.transaction.eventIds).toEqual([inspection.id, event.id]);
    expect(replay.inspectionEvents).toEqual([inspection]);
  });

  it('uses the persisted prompt id and gives every hunt stage stable ownership', () => {
    const state = {
      abilityData: { huntPromptId: 'hunt-attempt:1' },
      players: [player('追猎者'), player('目标')],
      _visualEvents: [],
    };
    const target = createHuntTargetEvent({ sourceIdx: 0, targetIdx: 1 });
    const reveal = createHuntRevealEvent({
      sourceIdx: 0,
      targetIdx: 1,
      card: { id: 'reveal-card', name: '亮牌' },
    });

    const next = appendHuntStageEvents(state, [target, reveal], { stage: 'target' });

    expect(getHuntAttemptId(next, 0, 1)).toBe('hunt-attempt:1');
    expect(next._visualEvents).toEqual([
      expect.objectContaining({ id: target.id, transactionId: 'hunt-attempt:1:target', order: 0, phaseOrder: 0 }),
      expect.objectContaining({ id: reveal.id, transactionId: 'hunt-attempt:1:target', order: 1, phaseOrder: 10 }),
    ]);
    expect(state._visualEvents).toEqual([]);
  });

  it('returns the hunt state and canonical queue from the shared boundary', () => {
    const previousState = { players: [player('追猎者'), player('目标')], _visualEvents: [] };
    const target = createHuntTargetEvent({ sourceIdx: 0, targetIdx: 1 });
    const reveal = createHuntRevealEvent({ sourceIdx: 0, targetIdx: 1, card: { id: 'reveal-card', name: '亮牌' } });
    const result = buildHuntStageVisualTransaction({
      previousState,
      state: { ...previousState, phase: 'HUNT_CONFIRM' },
      events: [target, reveal],
      attemptId: 'hunt-attempt:2',
      stage: 'target',
    });

    expect(result.queue.map(step => step.type)).toEqual(['SKILL_HUNT', 'HUNT_REVEAL_CARD']);
    expect(result.queue.map(step => step.visualEventId)).toEqual([target.id, reveal.id]);
  });

  it('collects a hunt target dependency for local and remote compilation alike', () => {
    const previousState = { players: [player('你'), player('艾伦'), player('贝拉')], _visualEvents: [] };
    const apophis = createApophisTargetVisualEvent({
      seq: 1, actorIdx: 1, actorName: '艾伦', targetIdx: 2, roll: 6, label: '选择【追捕】目标',
    });
    const hunt = createHuntTargetEvent({ sourceIdx: 1, targetIdx: 2, targetResolutionEventId: apophis.id });
    const replay = compileFreshHuntVisualTransaction({
      ...previousState,
      phase: 'HUNT_WAIT_REVEAL',
      _visualEvents: [apophis, hunt],
    }, previousState);

    expect(replay.transaction.eventIds).toEqual([apophis.id, hunt.id]);
    expect(replay.transaction.queue.map(step => step.type)).toEqual(['DICE_ROLL', 'SKILL_HUNT']);
  });

  it.each([false, true])('plays one local and peer reveal log with timedOut=%s', timedOut => {
    const card = { id: 'owned-APO', name: '阿波菲斯', isGod: true, godKey: 'APO' };
    const before = { _isMP: true, _turnKey: 7, currentTurn: 1, phase: 'HUNT_WAIT_REVEAL',
      players: [player('目标', [card]), player('追猎者'), player('旁观者')],
      log: ['等待亮牌'], abilityData: { huntTi: 0, huntPromptId: 'real-hunt-7' }, _visualEvents: [] };
    const result = buildMpHuntRevealVisualTransaction(before, card, { timedOut });
    const expected = timedOut ? '(超时) 目标 随机亮出 阿波菲斯' : '目标 亮出 阿波菲斯';
    expect(result.state.abilityData).toMatchObject({ revCard: card, huntPromptId: 'real-hunt-7' });
    expect(result.state.phase).toBe('HUNT_CONFIRM');
    expect(result.state.players).toBe(before.players);
    expect(result.state._visualEvents.at(-1)).toMatchObject({ attemptId: 'real-hunt-7', transactionId: 'real-hunt-7:reveal' });
    expect(before.phase).toBe('HUNT_WAIT_REVEAL');
    const broadcast = { ...result.state, _visualEvents: [createAnimTransactionEvent({
      actorIdx: before.currentTurn, actorName: before.players[before.currentTurn].name,
      queue: result.queue, context: 'huntReveal',
    }), ...result.state._visualEvents] };
    for (let viewer = 0; viewer < 3; viewer++) {
      const state = rotateGsForViewer(broadcast, viewer);
      const queue = viewer === 0 ? result.queue : compileFreshVisualEventQueue(rotateGsForViewer(before, viewer), state);
      const consumed = new Set();
      const entries = prepareAnimQueueLogs(queue, state).flatMap(step => step.logEntries || []);
      expect(consumeVisualLogEntries(entries, consumed)).toEqual([expected]);
      expect(consumeVisualLogEntries(entries, consumed)).toEqual([]);
    }
  });

  it('rejects illegal/unheld cards and a decision that already advanced', () => {
    const slime = createTsathogguaSlimeCard(), young = createBlackGoatYoungCard();
    const card = { id: 'owned', name: '合法牌', type: 'drawCard', key: 'A1' };
    const before = { _isMP: true, currentTurn: 1, phase: 'HUNT_WAIT_REVEAL',
      players: [player('目标', [card, slime, young]), player('追猎者')],
      log: [], abilityData: { huntTi: 0, huntPromptId: 'attempt' }, _visualEvents: [] };
    for (const invalid of [slime, young, { ...card }, undefined]) {
      expect(buildMpHuntRevealVisualTransaction(before, invalid, { timedOut: true })).toBeNull();
    }
    expect(buildMpHuntRevealVisualTransaction({ ...before, phase: 'HUNT_CONFIRM' }, card)).toBeNull();
    expect(buildMpHuntRevealVisualTransaction({ ...before, abilityData: { huntTi: 1 } }, card)).toBeNull();
    expect(buildMpHuntRevealVisualTransaction({ ...before, gameOver: { winner: 'HUNTER' } }, card)).toBeNull();
  });
});
