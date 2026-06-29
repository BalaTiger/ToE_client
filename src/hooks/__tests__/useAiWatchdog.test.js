import { describe, expect, it } from 'vitest';
import { getSinglePlayerAiDecisionSeat, getSinglePlayerDecisionSeat, isAiAutoDecisionPhase } from '../useAiWatchdog';

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

describe('getSinglePlayerAiDecisionSeat', () => {
  const players = [
    { name: '你' },
    { name: '艾伦' },
    { name: '贝拉' },
  ];

  it('识别黏液和半物质化这类非 currentTurn 决策人', () => {
    expect(getSinglePlayerAiDecisionSeat({
      _isMP: false,
      phase: 'TSG_SLIME_BALANCE',
      currentTurn: 0,
      players,
      abilityData: { targetIdx: 2 },
    })).toBe(2);

    expect(getSinglePlayerAiDecisionSeat({
      _isMP: false,
      phase: 'ETHEREALIZE_DECISION',
      currentTurn: 0,
      players,
      abilityData: { targetIdx: 1 },
    })).toBe(1);
  });

  it('识别活埋中轮到 AI 选择手牌的目标', () => {
    expect(getSinglePlayerAiDecisionSeat({
      _isMP: false,
      phase: 'BURY_ALIVE_SELECT',
      currentTurn: 0,
      players,
      abilityData: { targets: [0, 2], targetIndex: 1 },
    })).toBe(2);
  });

  it('不会把联机或本地玩家决策视为单人 AI 决策', () => {
    expect(getSinglePlayerAiDecisionSeat({
      _isMP: true,
      phase: 'TSG_SLIME_BALANCE',
      currentTurn: 0,
      players,
      abilityData: { targetIdx: 2 },
    })).toBe(null);

    expect(getSinglePlayerAiDecisionSeat({
      _isMP: false,
      phase: 'TSG_SLIME_BALANCE',
      currentTurn: 1,
      players,
      abilityData: { targetIdx: 0 },
    })).toBe(null);
  });

  it('穴居人战争选牌环节按尚未选牌的一方识别决策者', () => {
    // 玩家为源、AI 为目标
    expect(getSinglePlayerAiDecisionSeat({
      _isMP: false,
      phase: 'CAVE_DUEL_SELECT_CARD',
      currentTurn: 0,
      players,
      abilityData: { caveDuelSource: 0, caveDuelTarget: 1, sourceCard: { id: 's1' } },
    })).toBe(1);
    // AI 为源、玩家为目标
    const aiSourceState = {
      _isMP: false,
      phase: 'CAVE_DUEL_SELECT_CARD',
      currentTurn: 1,
      players,
      abilityData: { caveDuelSource: 1, caveDuelTarget: 0, sourceCard: { id: 's1' } },
    };
    expect(getSinglePlayerDecisionSeat(aiSourceState)).toBe(0);
    expect(getSinglePlayerAiDecisionSeat(aiSourceState)).toBe(null);
  });

  it('穴居人战争选牌环节未登记暗选时不让看门狗代替选择', () => {
    expect(getSinglePlayerAiDecisionSeat({
      _isMP: false,
      phase: 'CAVE_DUEL_SELECT_CARD',
      currentTurn: 1,
      players,
      abilityData: { caveDuelSource: 1, caveDuelTarget: 0 },
    })).toBe(null);
  });

  it('AI 回合触发的玩家决策（如黏液平分）识别为本地玩家，AI 决策座位为 null', () => {
    // 黛安娜(AI seat 2)回合内触发你(seat 0)的黏液平分：决策者是本地玩家
    const state = {
      _isMP: false,
      phase: 'TSG_SLIME_BALANCE',
      currentTurn: 2,
      players,
      abilityData: { targetIdx: 0 },
    };
    expect(getSinglePlayerDecisionSeat(state)).toBe(0);      // 决策者=本地玩家
    expect(getSinglePlayerAiDecisionSeat(state)).toBe(null); // 看门狗不得代为推进
  });

  it('烛九阴藏牌(ZHU_HIDE_AI_DRAW)的决策者是信徒(owner)而非正在摸牌的AI', () => {
    // 卡洛斯(AI seat 2)摸牌，但藏牌决策属于烛九阴信徒"你"(seat 0)
    const state = {
      _isMP: false,
      phase: 'ZHU_HIDE_AI_DRAW',
      currentTurn: 2,
      players,
      zhuLight: { ownerIdx: 0 },
      abilityData: { zhuGuard: { ownerIdx: 0 }, drawerIdx: 2 },
    };
    expect(getSinglePlayerDecisionSeat(state)).toBe(0);      // 决策者=信徒(本地玩家)
    expect(getSinglePlayerAiDecisionSeat(state)).toBe(null); // 不能被看门狗替玩家跳过
  });

  it('本地摸到被点亮牌时，单机 AI 烛九阴信徒负责藏牌决策', () => {
    const litCard = { id: 'lit-c2', name: '地磁反转' };
    const state = {
      _isMP: false,
      phase: 'DRAW_REVEAL',
      currentTurn: 0,
      players,
      zhuLight: { ownerIdx: 2, cardIds: [litCard.id] },
      drawReveal: { card: litCard, needsDecision: true, drawerIdx: 0 },
      abilityData: {},
    };
    expect(getSinglePlayerDecisionSeat(state)).toBe(2);
    expect(getSinglePlayerAiDecisionSeat(state)).toBe(2);
  });

  it('本地遭遇被点亮邪神牌时，也等待烛九阴信徒而不是摸牌者', () => {
    const litGod = { id: 'lit-god', name: '烛九阴' };
    const state = {
      _isMP: false,
      phase: 'GOD_CHOICE',
      currentTurn: 0,
      players,
      zhuLight: { ownerIdx: 1, cardIds: [litGod.id] },
      abilityData: { godCard: litGod, drawerIdx: 0 },
    };
    expect(getSinglePlayerDecisionSeat(state)).toBe(1);
    expect(getSinglePlayerAiDecisionSeat(state)).toBe(1);
  });
});
