import { describe, expect, it } from 'vitest';
import { buildPhaseUiState, getPhasePromptColors, isCancelablePhase } from '../phaseUi';

const baseGs = {
  _isMP: false,
  expansionKey: '地神的潜影',
  currentTurn: 0,
  abilityData: {},
  players: [
    { name: '你', hand: [{}, {}, {}, {}, {}] },
    { name: '艾伦', hand: [] },
  ],
};

describe('phaseUi', () => {
  it('按主题返回提示区颜色', () => {
    expect(getPhasePromptColors('地神的潜影').warning).toBe('#cc3030');
    expect(getPhasePromptColors('群星呼唤').warning).toBe('#ff7d8a');
  });

  it('多人 HUNT_CONFIRM 中非本地当前玩家不可取消', () => {
    expect(isCancelablePhase('HUNT_CONFIRM', { isMultiplayer: true, localCurrentTurn: false })).toBe(false);
    expect(isCancelablePhase('HUNT_CONFIRM', { isMultiplayer: true, localCurrentTurn: true })).toBe(true);
  });

  it('行动阶段可显示结束回合按钮', () => {
    const ui = buildPhaseUiState({
      gs: baseGs,
      phase: 'ACTION',
      isVisualPlayerTurn: true,
      localCurrentTurn: true,
    });

    expect(ui.displayPhaseLabel).toBe('你的回合 — 可发动技能、休息，或结束回合');
    expect(ui.canShowEndTurnButton).toBe(true);
  });

  it('弃牌结算动画期间显示下个回合等待提示', () => {
    const ui = buildPhaseUiState({
      gs: { ...baseGs, phase: 'DISCARD_PHASE' },
      phase: 'DISCARD_PHASE',
      isDiscardPhaseResolving: true,
      pendingAfterDiscardGs: {
        phase: 'AI_TURN',
        currentTurn: 1,
        players: baseGs.players,
      },
    });

    expect(ui.displayPhaseLabel).toBe('艾伦 正在行动…');
  });

  it('手牌超限时显示需弃牌数量', () => {
    const ui = buildPhaseUiState({
      gs: { ...baseGs, phase: 'DISCARD_PHASE', abilityData: { discardSelected: [0] } },
      phase: 'DISCARD_PHASE',
      me: baseGs.players[0],
      effectiveHandLimit: 4,
      localCurrentTurn: true,
    });

    expect(ui.displayPhaseLabel).toBe('手牌超限 (5/4) — 需弃 1 张，已选 1/1');
    expect(ui.isPhaseWarningText).toBe(true);
  });
});
