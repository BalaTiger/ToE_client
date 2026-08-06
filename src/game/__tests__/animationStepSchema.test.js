import { describe, expect, it } from 'vitest';
import {
  normalizeAnimationQueueSteps,
  prepareAnimationQueueSteps,
  validateAnimationQueueSteps,
} from '../animationStepSchema';

describe('animationStepSchema', () => {
  const sanLoss = {
    id: 'san-loss:1',
    type: 'SAN_LOSS',
    target: 0,
    from: { hp: 10, san: 9 },
    to: { hp: 10, san: 7 },
  };

  it('接受只以 statEvents 表达目标值的通用属性步骤', () => {
    const step = {
      id: 'step:1',
      type: 'SAN_DAMAGE',
      durationMs: 800,
      impactAtMs: 460,
      hitIndices: [0],
      statEvents: [sanLoss],
    };

    expect(validateAnimationQueueSteps([step])).toEqual([]);
  });

  it('报告 statEvents 与 targetStats 的重复表达并在规范化时移除后者', () => {
    const result = prepareAnimationQueueSteps([{
      type: 'SAN_DAMAGE',
      statEvents: [sanLoss],
      targetStats: [{ hp: 10, san: 7 }],
    }]);

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'STAT_EVENTS_TARGET_STATS_CONFLICT', stepIndex: 0 }),
    ]));
    expect(result.steps[0]).not.toHaveProperty('targetStats');
  });

  it('为仅含 targetStats 的兼容步骤添加明确的 legacy 标记', () => {
    expect(normalizeAnimationQueueSteps([{
      type: 'HP_HEAL',
      hitIndices: [0],
      targetStats: [{ hp: 8, san: 5 }],
    }])[0]).toMatchObject({
      type: 'HP_HEAL',
      legacyStatTarget: true,
    });
  });

  it.each(['GUILLOTINE', 'PETRIFY_DEATH'])(
    '%s 只能展示死亡效果，不能携带属性写入',
    type => {
      const issues = validateAnimationQueueSteps([{
        type,
        hitIndices: [0],
        targetStats: [{ hp: 0, san: 5 }],
      }]);

      expect(issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'DEATH_PRESENTATION_WRITES_STATS', type }),
      ]));
    },
  );

  it('校验撒托古亚黏液的特殊属性事务必须完整且目标一致', () => {
    const issues = validateAnimationQueueSteps([{
      type: 'TSG_SLIME_POP',
      targetPid: 1,
      statPresentation: {
        target: 0,
        from: { hp: 3, san: 9 },
        to: { hp: 6 },
      },
    }]);

    expect(issues).toEqual([
      expect.objectContaining({ code: 'INVALID_SLIME_STAT_PRESENTATION' }),
    ]);
  });

  it('组合步骤必须先规范化成独立 HP/SAN 步骤', () => {
    const combined = { type: 'HP_SAN_HEAL', targetStats: [{ hp: 7, san: 6 }] };

    expect(validateAnimationQueueSteps([combined])).toEqual([
      expect.objectContaining({ code: 'UNNORMALIZED_COMBINED_STAT_STEP' }),
    ]);
    expect(normalizeAnimationQueueSteps([combined]).map(step => step.type)).toEqual([
      'HP_HEAL',
      'SAN_HEAL',
    ]);
  });

  it('组合属性事件拆成 HP/SAN 动画后不误报重复事件 ID', () => {
    const combinedLoss = {
      id: 'both-loss:1',
      type: 'HP_SAN_LOSS',
      target: 0,
      from: { hp: 10, san: 9 },
      to: { hp: 8, san: 7 },
    };
    const result = prepareAnimationQueueSteps([{
      type: 'HP_SAN_DAMAGE',
      hitIndices: [0],
      statEvents: [combinedLoss],
    }]);

    expect(result.steps.map(step => step.type)).toEqual(['HP_DAMAGE', 'SAN_DAMAGE']);
    expect(result.issues).toEqual([]);
  });

  it('校验命中时点以及重复的步骤/事件 ID', () => {
    const issues = validateAnimationQueueSteps([
      { id: 'same', type: 'SAN_DAMAGE', durationMs: 300, impactAtMs: 400, statEvents: [sanLoss] },
      { id: 'same', type: 'SAN_DAMAGE', statEvents: [sanLoss] },
    ]);

    expect(issues.map(item => item.code)).toEqual(expect.arrayContaining([
      'IMPACT_AFTER_DURATION',
      'DUPLICATE_STEP_ID',
      'DUPLICATE_STAT_EVENT_ID',
    ]));
  });
});
