import { describe, expect, it } from 'vitest';
import { buildApophisTargetQueueForState, mergeApophisTargetQueue } from '../apophisAnimQueue';

describe('apophisAnimQueue', () => {
  const oldState = { _apophisTargetSeq: 1 };
  const nextState = {
    _apophisTargetEvent: { seq: 2 },
  };
  const buildQueue = () => [
    { type: 'DICE_ROLL', _apophisTargetSeq: 2 },
    { type: 'SKILL_HUNT', _apophisTargetSeq: 2, targetIdx: 2 },
    { type: 'HP_DAMAGE' },
  ];

  it('只取当前阿波菲斯目标事件对应的动画步骤', () => {
    expect(buildApophisTargetQueueForState(oldState, nextState, buildQueue)).toEqual([
      { type: 'DICE_ROLL', _apophisTargetSeq: 2 },
      { type: 'SKILL_HUNT', _apophisTargetSeq: 2, targetIdx: 2 },
    ]);
  });

  it('将黑夜目标动画作为前缀，并避免重复技能锁定动画', () => {
    const baseQueue = [{ type: 'SKILL_HUNT', targetIdx: 2, msgs: ['追捕'] }, { type: 'CARD_TRANSFER' }];

    expect(mergeApophisTargetQueue(baseQueue, oldState, nextState, buildQueue)).toEqual([
      { type: 'DICE_ROLL', _apophisTargetSeq: 2 },
      { type: 'SKILL_HUNT', targetIdx: 2, msgs: ['追捕'] },
      { type: 'CARD_TRANSFER' },
    ]);
  });

  it('已有同一次黑夜骰子在后段队列时会移到最前并去重', () => {
    const baseQueue = [
      { type: 'SKILL_BEWITCH', targetIdx: 1, msgs: ['蛊惑'] },
      { type: 'CARD_TRANSFER' },
      { type: 'DRAW_CARD', card: { id: 'god' } },
      { type: 'DICE_ROLL', _apophisTargetSeq: 2 },
      { type: 'SAN_DAMAGE' },
    ];
    const buildQueue = () => [
      { type: 'DICE_ROLL', _apophisTargetSeq: 2 },
      { type: 'SKILL_BEWITCH', _apophisTargetSeq: 2, targetIdx: 2 },
    ];

    expect(mergeApophisTargetQueue(baseQueue, oldState, nextState, buildQueue)).toEqual([
      { type: 'DICE_ROLL', _apophisTargetSeq: 2 },
      { type: 'SKILL_BEWITCH', targetIdx: 1, msgs: ['蛊惑'] },
      { type: 'CARD_TRANSFER' },
      { type: 'DRAW_CARD', card: { id: 'god' } },
      { type: 'SAN_DAMAGE' },
    ]);
  });
});

