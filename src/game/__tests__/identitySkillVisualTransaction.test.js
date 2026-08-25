import { describe, expect, it } from 'vitest';
import {
  appendHuntStageEvents,
  buildBewitchGiftVisualTransaction,
  buildHuntStageVisualTransaction,
  buildSwapCardsVisualTransaction,
  compileFreshBewitchVisualTransaction,
  compileFreshHuntVisualTransaction,
  compileFreshSwapVisualTransaction,
  getHuntAttemptId,
} from '../identitySkillVisualTransaction';
import {
  createApophisTargetVisualEvent,
  createBewitchGiftEvent,
  createHuntRevealEvent,
  createHuntTargetEvent,
  createInspectionVisualEvent,
  createSwapCardsEvent,
} from '../visualEvents';

function player(name, hand = []) {
  return { name, hp: 10, san: 10, hand, godZone: [], isDead: false };
}

describe('identity skill visual transactions', () => {
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
});
