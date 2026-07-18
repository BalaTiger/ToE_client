import { describe, expect, it } from 'vitest';
import {
  appendConfirmedChainLoss,
  buildEtherealizeRedirectChainLoss,
  chooseAiEtherealizeRedirectTarget,
  collectEtherealizeChainSettleLosses,
  getNextEtherealizeChainDecision,
  shouldAiUseEtherealize,
} from '../etherealize';
import { makePlayer } from './factory';

describe('etherealize AI helpers', () => {
  it('AI 有虚化且即将损失 HP/SAN 时会选择消耗', () => {
    const player = makePlayer({ hp: 8, san: 8, etherealizeStacks: 2 });

    expect(shouldAiUseEtherealize({ player, lostHp: 1 })).toBe(true);
    expect(shouldAiUseEtherealize({ player, lostSan: 1 })).toBe(true);
  });

  it('AI 没有虚化或没有损失时不会消耗', () => {
    expect(shouldAiUseEtherealize({ player: makePlayer({ etherealizeStacks: 0 }), lostHp: 1 })).toBe(false);
    expect(shouldAiUseEtherealize({ player: makePlayer({ etherealizeStacks: 1 }), lostHp: 0, lostSan: 0 })).toBe(false);
  });

  it('AI 选择 HP+SAN 最高的相邻角色承受转移伤害', () => {
    const players = [
      makePlayer({ hp: 4, san: 4 }),
      makePlayer({ hp: 8, san: 8 }),
      makePlayer({ hp: 10, san: 3 }),
    ];

    expect(chooseAiEtherealizeRedirectTarget(players, [0, 1, 2])).toBe(1);
  });

  it('选择承伤目标时忽略死亡角色', () => {
    const players = [
      makePlayer({ hp: 10, san: 10, isDead: true }),
      makePlayer({ hp: 7, san: 7 }),
    ];

    expect(chooseAiEtherealizeRedirectTarget(players, [0, 1])).toBe(1);
  });
});

describe('虚化决策链（伤害前置事件）', () => {
  it('归并结算按原始顺序合并已确认损失与延迟直接损失', () => {
    const abilityData = {
      confirmedLosses: [
        { targetIdx: 2, lostHp: 4, lostSan: 0, order: 1 },
        { targetIdx: 3, lostHp: 0, lostSan: 2, order: 3 },
      ],
      deferredDirectLosses: [
        { targetIdx: 1, lostHp: 4, lostSan: 0, order: 0 },
        { targetIdx: 0, lostHp: 0, lostSan: 1, order: 2 },
      ],
    };

    expect(collectEtherealizeChainSettleLosses(abilityData).map(l => [l.targetIdx, l.lostHp, l.lostSan])).toEqual([
      [1, 4, 0],
      [2, 4, 0],
      [0, 0, 1],
      [3, 0, 2],
    ]);
  });

  it('归并结算忽略空损失与缺少 order 的历史数据', () => {
    const abilityData = {
      confirmedLosses: [{ targetIdx: 1, lostHp: 0, lostSan: 0 }],
      deferredDirectLosses: [{ targetIdx: 2, lostHp: 3 }],
    };

    expect(collectEtherealizeChainSettleLosses(abilityData)).toEqual([
      { targetIdx: 2, lostHp: 3 },
    ]);
  });

  it('追加确认损失会保留既有确认列表', () => {
    const base = { type: 'etherealizeRedirect', confirmedLosses: [{ targetIdx: 1, lostHp: 2 }] };
    const next = appendConfirmedChainLoss(base, { targetIdx: 3, lostSan: 1 });

    expect(next.confirmedLosses).toHaveLength(2);
    expect(next.confirmedLosses[1]).toEqual({ targetIdx: 3, lostSan: 1 });
    expect(base.confirmedLosses).toHaveLength(1);
  });

  it('链式决策会跳过死亡或没有虚化层数的候选', () => {
    const players = [
      makePlayer({ etherealizeStacks: 1 }),
      makePlayer({ etherealizeStacks: 0 }),
      makePlayer({ etherealizeStacks: 2, isDead: true }),
      makePlayer({ etherealizeStacks: 1 }),
    ];
    const abilityData = {
      pendingIndex: 0,
      pendingLosses: [
        { targetIdx: 0, lostHp: 1 },
        { targetIdx: 1, lostHp: 1 },
        { targetIdx: 2, lostHp: 1 },
        { targetIdx: 3, lostHp: 1 },
      ],
    };

    const next = getNextEtherealizeChainDecision(abilityData, players, 0);
    expect(next).toMatchObject({ type: 'etherealizeRedirect', targetIdx: 3, pendingIndex: 3 });
    expect(getNextEtherealizeChainDecision(next, players, 3)).toBe(null);
  });

  it('转移目标自身有虚化时递归生成新决策损失并注明来源', () => {
    const players = [
      makePlayer({ name: '你', hp: 10 }),
      makePlayer({ name: '艾伦', hp: 10, etherealizeStacks: 1 }),
      makePlayer({ name: '贝拉', hp: 10, etherealizeStacks: 2 }),
      makePlayer({ name: '黛安娜', hp: 10 }),
    ];

    const loss = buildEtherealizeRedirectChainLoss({
      players,
      sourceIdx: 1,
      redirectTargetIdx: 2,
      lostHp: 4,
      currentTurn: 0,
      order: 1,
    });

    expect(loss).toMatchObject({
      targetIdx: 2,
      lostHp: 4,
      source: '半物质化',
      viaEtherealizeFrom: 1,
      order: 1,
    });
    expect(loss.adjacentTargets).toContain(1);
    expect(loss.adjacentTargets).toContain(3);
  });

  it('转移目标没有虚化或是回合拥有者时不递归', () => {
    const players = [
      makePlayer({ name: '你', hp: 10, etherealizeStacks: 3 }),
      makePlayer({ name: '艾伦', hp: 10, etherealizeStacks: 1 }),
      makePlayer({ name: '贝拉', hp: 10 }),
    ];

    // 贝拉没有虚化层数
    expect(buildEtherealizeRedirectChainLoss({
      players, sourceIdx: 1, redirectTargetIdx: 2, lostHp: 4, currentTurn: 0,
    })).toBe(null);
    // 你是当前回合拥有者，回合内不能发动虚化
    expect(buildEtherealizeRedirectChainLoss({
      players, sourceIdx: 1, redirectTargetIdx: 0, lostHp: 4, currentTurn: 0,
    })).toBe(null);
  });
});
