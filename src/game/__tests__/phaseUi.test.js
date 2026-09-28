import { describe, expect, it } from 'vitest';
import { buildPhaseUiState, getHuntRevealPromptId, getPhasePromptColors, isCancelablePhase } from '../phaseUi';

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

  it('掉包在暗抽前可取消，暗抽后（归还阶段）不可取消，避免无代价窥探手牌', () => {
    expect(isCancelablePhase('SWAP_SELECT_TARGET', {})).toBe(true);
    expect(isCancelablePhase('SWAP_STEAL_CARD', {})).toBe(true);
    expect(isCancelablePhase('SWAP_GIVE_CARD', {})).toBe(false);
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

  it('决策事务提交期间隐藏决策弹窗，避免重复交互', () => {
    const ui = buildPhaseUiState({
      gs: { ...baseGs, phase: 'DRAW_REVEAL', drawReveal: { card: { name: '鼠群' } } },
      phase: 'DRAW_REVEAL',
      decisionSubmitting: true,
      local: { drawDecision: true },
    });

    expect(ui.canShowTurnDecisionModal).toBe(false);
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

  it('单人 AI 子决策阶段显示思考态而不是联机等待态', () => {
    const ui = buildPhaseUiState({
      gs: {
        ...baseGs,
        phase: 'ETHEREALIZE_DECISION',
        abilityData: { targetIdx: 1 },
      },
      phase: 'ETHEREALIZE_DECISION',
      local: { etherealizeDecision: false },
    });

    expect(ui.displayPhaseLabel).toBe('艾伦 正在思考…');
  });

  it('联机非本地子决策阶段仍显示等待其他玩家', () => {
    const ui = buildPhaseUiState({
      gs: {
        ...baseGs,
        _isMP: true,
        phase: 'ETHEREALIZE_DECISION',
        abilityData: { targetIdx: 1 },
      },
      phase: 'ETHEREALIZE_DECISION',
      local: { etherealizeDecision: false },
    });

    expect(ui.displayPhaseLabel).toBe('请等待其他玩家选择…');
  });

  it('单人 AI 烛九阴藏牌阶段显示思考态而不是联机等待态', () => {
    const ui = buildPhaseUiState({
      gs: {
        ...baseGs,
        currentTurn: 1,
        phase: 'ZHU_HIDE_AI_DRAW',
      },
      phase: 'ZHU_HIDE_AI_DRAW',
      visualMe: { godName: null },
    });

    expect(ui.displayPhaseLabel).toBe('艾伦 正在思考…');
  });

  it('追捕亮牌提交后由提示会话立即退出警告态', () => {
    const huntGs = {
      ...baseGs,
      phase: 'PLAYER_REVEAL_FOR_HUNT',
      abilityData: { huntingAI: 1, aiHunterName: '贝拉', huntPromptId: 'hunt-2' },
    };

    expect(getHuntRevealPromptId(huntGs)).toBe('hunt-2');
    expect(buildPhaseUiState({
      gs: huntGs,
      phase: huntGs.phase,
      huntRevealPromptActive: true,
    })).toMatchObject({
      displayPhaseLabel: '⚠ 贝拉 正在追捕你！请选择一张手牌亮出',
      isPhaseWarningText: true,
    });
    expect(buildPhaseUiState({
      gs: huntGs,
      phase: huntGs.phase,
      huntRevealPromptActive: false,
    })).toMatchObject({
      displayPhaseLabel: '已亮出手牌，贝拉 正在结算追捕…',
      isPhaseWarningText: false,
    });
  });

  it('旧快照没有显式 id 时，连续追捕仍会生成不同的提示会话', () => {
    const first = {
      ...baseGs,
      _turnKey: 7,
      currentTurn: 1,
      phase: 'PLAYER_REVEAL_FOR_HUNT',
      abilityData: { huntingAI: 1 },
      log: ['贝拉（追猎者）向你发动【追捕】！请选择亮出一张手牌'],
    };
    const second = {
      ...first,
      log: [...first.log, '你亮出 [D4] 斯芬克斯', '贝拉（追猎者）向你发动【追捕】！请选择亮出一张手牌'],
    };

    expect(getHuntRevealPromptId(first)).not.toBe(getHuntRevealPromptId(second));
  });

  it('联机远端烛九阴藏牌阶段仍显示等待其他玩家', () => {
    const ui = buildPhaseUiState({
      gs: {
        ...baseGs,
        _isMP: true,
        currentTurn: 1,
        phase: 'ZHU_HIDE_AI_DRAW',
        zhuLight: { ownerIdx: 1, cardIds: ['lit'] },
      },
      phase: 'ZHU_HIDE_AI_DRAW',
      visualMe: { godName: null },
    });

    expect(ui.displayPhaseLabel).toBe('请等待艾伦玩家选择…');
  });
});
