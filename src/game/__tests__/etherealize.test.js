import { describe, expect, it } from 'vitest';
import { chooseAiEtherealizeRedirectTarget, shouldAiUseEtherealize } from '../etherealize';
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
