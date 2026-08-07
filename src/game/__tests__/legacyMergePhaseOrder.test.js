import { describe, expect, it } from 'vitest';
import { buildAnimQueue } from '../animQueueCore';
import {
  ANIMATION_QUEUE_AUTHORITY,
  compileRuleVisualEventsToAnimTransaction,
  mergeAnimationTransactionQueue,
} from '../visualEventTransactionCompiler';
import { createCardEffectEvent, createRandomTargetVisualEvent, ensureVisualEventState } from '../visualEvents';
import { makeGs, makePlayer } from './factory';

// 钻地魔虫回归：legacyMerge 提交边界必须保持 phaseOrder 跨事件交错
// （全体扣血 → 转盘 → 额外扣血）。历史上编译器按视觉事件逐个展开，
// 且 buildRandomTargetSteps 的 ...event 展开把步骤类型覆盖成 'randomTarget'，
// 导致转盘无法与 legacy 步骤去重而被排到额外扣血之后。
function makeWormScenario() {
  const phaseGroupId = 'worm-phase-group';
  const playersBefore = [
    makePlayer({ name: '你', hp: 10 }),
    makePlayer({ name: '艾伦', hp: 10 }),
    makePlayer({ name: '贝拉', hp: 10 }),
  ];
  const playersAfter = [
    makePlayer({ name: '你', hp: 8 }),
    makePlayer({ name: '艾伦', hp: 6 }),
    makePlayer({ name: '贝拉', hp: 8 }),
  ];
  const oldGs = makeGs({ players: playersBefore, log: [], _randomTargetSeq: 0, _statEventSeq: 0 });
  // Mirror effectEngine.appendRandomTargetEvent: the random-target visual
  // event is appended to _visualEvents before the card effect is prepended.
  const randomTargetEvent = createRandomTargetVisualEvent({
    seq: 1, sourceIdx: 0, targetIdx: 1, label: '钻地魔虫', phaseOrder: 1,
    phaseGroupId,
    resultText: '艾伦 被选中',
  });
  const wormEvent = createCardEffectEvent({
    effectKey: 'burrowingWorm',
    card: { id: 'worm', name: '钻地魔虫', key: 'D1', type: 'allDamageHPRandomExtra' },
    actorIdx: 0,
    phaseGroupId,
    phaseOrder: -1,
    beforePlayers: playersBefore,
    beforeDiscard: [],
    afterPlayers: playersAfter,
    afterDiscard: [],
    msgs: ['全体存活角色失去 2 HP'],
  });
  const newGs = makeGs({
    players: playersAfter,
    log: ['全体存活角色失去 2 HP', '艾伦 额外失去 2 HP'],
    _visualEvents: [wormEvent, randomTargetEvent].filter(Boolean),
    _randomTargetSeq: 1,
    _randomTargetEvents: [{ seq: 1, sourceIdx: 0, targetIdx: 1, label: '钻地魔虫', phaseOrder: 1, resultText: '艾伦 被选中' }],
    _statEventSeq: 1,
    _statEvents: [
      { type: 'HP_LOSS', target: 0, from: { hp: 10, san: 10, isDead: false }, to: { hp: 8, san: 10, isDead: false }, seq: 1, phaseOrder: 0, phaseGroupId },
      { type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10, isDead: false }, to: { hp: 8, san: 10, isDead: false }, seq: 1, phaseOrder: 0, phaseGroupId },
      { type: 'HP_LOSS', target: 2, from: { hp: 10, san: 10, isDead: false }, to: { hp: 8, san: 10, isDead: false }, seq: 1, phaseOrder: 0, phaseGroupId },
      { type: 'HP_LOSS', target: 1, from: { hp: 8, san: 10, isDead: false }, to: { hp: 6, san: 10, isDead: false }, seq: 1, phaseOrder: 2, phaseGroupId },
    ],
  });
  return { oldGs, newGs };
}

describe('legacyMerge 提交边界的 phaseOrder 交错', () => {
  it('钻地魔虫: 转盘位于全体扣血与额外扣血之间且不重复', () => {
    const { oldGs, newGs } = makeWormScenario();
    const legacyQueue = buildAnimQueue(oldGs, newGs);
    const ruleTransaction = compileRuleVisualEventsToAnimTransaction(ensureVisualEventState(newGs), null, {
      buildAnimQueue,
    });
    const merged = mergeAnimationTransactionQueue(legacyQueue, ruleTransaction, {
      authority: ANIMATION_QUEUE_AUTHORITY.LEGACY_MERGE,
    });
    const types = merged.map(step => step.type);

    const firstHpIdx = types.indexOf('HP_DAMAGE');
    const randomIdx = types.indexOf('RANDOM_TARGET');
    const secondHpIdx = types.findIndex((type, index) => type === 'HP_DAMAGE' && index > randomIdx);
    expect(firstHpIdx).toBeGreaterThanOrEqual(0);
    expect(randomIdx).toBeGreaterThan(firstHpIdx);
    expect(secondHpIdx).toBeGreaterThan(randomIdx);
    expect(types.filter(type => type === 'RANDOM_TARGET')).toHaveLength(1);
    expect(types).not.toContain('randomTarget');
  });

  it('两个独立 phase 组保持各自事务边界，不会按全包 phase 交错', () => {
    const players = [
      makePlayer({ name: '你', hp: 6 }),
      makePlayer({ name: '艾伦', hp: 6 }),
      makePlayer({ name: '贝拉', hp: 6 }),
    ];
    const buildGroup = (suffix, actorIdx, targetIdx, seq) => {
      const phaseGroupId = `worm-group-${suffix}`;
      return {
        events: [
          createCardEffectEvent({
            effectKey: 'burrowingWorm',
            card: { id: `worm-${suffix}`, name: '钻地魔虫' },
            actorIdx,
            phaseGroupId,
            phaseOrder: -1,
            beforePlayers: players,
            afterPlayers: players,
          }),
          createRandomTargetVisualEvent({
            seq,
            sourceIdx: actorIdx,
            targetIdx,
            label: '钻地魔虫',
            phaseGroupId,
            phaseOrder: 1,
          }),
          {
            type: 'statEvents',
            id: `stats-${suffix}`,
            scope: 'stat',
            phaseGroupId,
            statEvents: [
              { type: 'HP_LOSS', target: actorIdx, from: { hp: 10, san: 10 }, to: { hp: 8, san: 10 }, seq, phaseOrder: 0, phaseGroupId },
              { type: 'HP_LOSS', target: targetIdx, from: { hp: 8, san: 10 }, to: { hp: 6, san: 10 }, seq, phaseOrder: 2, phaseGroupId },
            ],
            msgs: [],
          },
        ],
      };
    };
    const first = buildGroup('a', 0, 1, 1);
    const second = buildGroup('b', 1, 2, 2);
    const state = { players, phase: 'ACTION', _visualEvents: [
      first.events[0], first.events[1],
      second.events[0], second.events[1],
      first.events[2], second.events[2],
    ] };

    const transaction = compileRuleVisualEventsToAnimTransaction(state);
    expect(transaction.queue.map(step => step.type)).toEqual([
      'BURROWING_WORM', 'HP_DAMAGE', 'RANDOM_TARGET', 'HP_DAMAGE',
      'BURROWING_WORM', 'HP_DAMAGE', 'RANDOM_TARGET', 'HP_DAMAGE',
    ]);
    expect(transaction.queue.filter(step => step.type === 'BURROWING_WORM').map(step => step.actorIdx)).toEqual([0, 1]);
  });
});
