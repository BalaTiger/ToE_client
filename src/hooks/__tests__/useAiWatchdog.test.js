import { describe, expect, it } from 'vitest';
import { isAiAutoDecisionPhase } from '../useAiWatchdog';

describe('isAiAutoDecisionPhase', () => {
  it('识别 AI 自己触发的玫瑰倒刺目标选择阶段', () => {
    expect(isAiAutoDecisionPhase({
      phase: 'ROSE_THORN_SELECT_TARGET',
      currentTurn: 4,
      abilityData: { roseThornSource: 4, roseThornTargets: [0, 1, 2, 3] },
    })).toBe(true);
  });

  it('不把玩家触发的玫瑰倒刺选择阶段视为 AI 自动决策', () => {
    expect(isAiAutoDecisionPhase({
      phase: 'ROSE_THORN_SELECT_TARGET',
      currentTurn: 4,
      abilityData: { roseThornSource: 0, roseThornTargets: [1, 2, 3, 4] },
    })).toBe(false);
  });
});
