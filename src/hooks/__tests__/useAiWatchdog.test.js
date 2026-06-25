import { describe, expect, it } from 'vitest';
import { getSinglePlayerAiDecisionSeat, isAiAutoDecisionPhase } from '../useAiWatchdog';

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

  it('穴居人战争选牌环节永远等待玩家，不自动替玩家选牌', () => {
    // 玩家为源、AI 为目标
    expect(getSinglePlayerAiDecisionSeat({
      _isMP: false,
      phase: 'CAVE_DUEL_SELECT_CARD',
      currentTurn: 0,
      players,
      abilityData: { caveDuelSource: 0, caveDuelTarget: 1 },
    })).toBe(null);
    // AI 为源、玩家为目标
    expect(getSinglePlayerAiDecisionSeat({
      _isMP: false,
      phase: 'CAVE_DUEL_SELECT_CARD',
      currentTurn: 1,
      players,
      abilityData: { caveDuelSource: 1, caveDuelTarget: 0 },
    })).toBe(null);
  });
});
