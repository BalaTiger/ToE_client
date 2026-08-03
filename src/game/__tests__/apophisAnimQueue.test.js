import { describe, expect, it } from 'vitest';
import { attachApophisNightTimeline, buildApophisTargetQueueForState, mergeApophisTargetQueue } from '../apophisAnimQueue';

describe('apophisAnimQueue', () => {
  it('无日食变化的动画队列全程保持最终权威进度', () => {
    const staleNight = { active: true, count: 0, limit: 12 };
    const currentNight = { active: true, count: 5, limit: 12 };
    const queue = attachApophisNightTimeline(
      [{ type: 'YOUR_TURN' }, { type: 'DRAW_CARD' }, { type: 'SAN_DAMAGE' }],
      staleNight,
      currentNight,
    );

    expect(queue.map(step => step._apophisNight)).toEqual([
      currentNight,
      currentNight,
      currentNight,
    ]);
  });

  it('日食判定只在对应步骤推进并由后续动画保持', () => {
    const beforeNight = { active: true, count: 4, limit: 12 };
    const afterNight = { active: true, count: 5, limit: 12 };
    const queue = attachApophisNightTimeline([
      { type: 'YOUR_TURN' },
      { type: 'DICE_ROLL', _apophisNight: afterNight },
      { type: 'SKILL_HUNT' },
    ], beforeNight, afterNight);

    expect(queue.map(step => step._apophisNight)).toEqual([
      beforeNight,
      afterNight,
      afterNight,
    ]);
  });

  it('日食结束后的动画显式保持空状态而不会回退', () => {
    const beforeNight = { active: true, count: 11, limit: 12 };
    const queue = attachApophisNightTimeline([
      { type: 'DICE_ROLL', _apophisNight: null },
      { type: 'SAN_DAMAGE' },
    ], beforeNight, null);

    expect(queue.map(step => step._apophisNight)).toEqual([null, null]);
  });

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

  it('黑夜目标错乱后保留同次结算的 SAN 扣减动画', () => {
    const stateWithSanLoss = {
      _apophisTargetEvent: { seq: 2, statSeq: 7 },
    };
    const buildQueueWithSanLoss = () => [
      { type: 'DICE_ROLL', _apophisTargetSeq: 2 },
      { type: 'SAN_DAMAGE', hitIndices: [0], statEvents: [{ type: 'SAN_LOSS', target: 0, seq: 7 }] },
      { type: 'CARD_TRANSFER' },
    ];

    expect(buildApophisTargetQueueForState(oldState, stateWithSanLoss, buildQueueWithSanLoss)).toEqual([
      { type: 'DICE_ROLL', _apophisTargetSeq: 2 },
      { type: 'SAN_DAMAGE', hitIndices: [0], statEvents: [{ type: 'SAN_LOSS', target: 0, seq: 7 }] },
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

  it('已包含同次 SAN 动画的队列重复归一化时不会重播', () => {
    const stateWithSanLoss = {
      _apophisTargetEvent: { seq: 2, statSeq: 7 },
    };
    const sanStep = {
      type: 'SAN_DAMAGE',
      hitIndices: [0],
      statEvents: [{ type: 'SAN_LOSS', target: 0, seq: 7 }],
    };
    const buildQueueWithSanLoss = () => [
      { type: 'DICE_ROLL', _apophisTargetSeq: 2 },
      sanStep,
    ];
    const alreadyMerged = [
      { type: 'DICE_ROLL', _apophisTargetSeq: 2 },
      sanStep,
      { type: 'CARD_TRANSFER' },
    ];

    const merged = mergeApophisTargetQueue(alreadyMerged, oldState, stateWithSanLoss, buildQueueWithSanLoss);
    expect(merged.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
    expect(merged.map(step => step.type)).toEqual(['DICE_ROLL', 'SAN_DAMAGE', 'CARD_TRANSFER']);
  });

  it('旧路径缺少事件序号时仍按同一条黑夜日志去重', () => {
    const log = '【黑夜】卡洛斯 选择【追捕】目标掷出 1，目标由 艾伦 错乱为 贝拉，失去 1 SAN';
    const baseQueue = [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', d1: 1, msgs: [log] },
      { type: 'SKILL_HUNT', targetIdx: 2 },
    ];
    const buildQueue = () => [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', d1: 1, _apophisTargetSeq: 2, msgs: [log] },
      { type: 'SKILL_HUNT', _apophisTargetSeq: 2, targetIdx: 2 },
    ];

    const merged = mergeApophisTargetQueue(baseQueue, oldState, nextState, buildQueue);
    expect(merged.filter(step => step.type === 'DICE_ROLL')).toHaveLength(1);
    expect(merged.filter(step => step.type === 'SKILL_HUNT')).toHaveLength(1);
  });
});

