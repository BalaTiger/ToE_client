import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyHpDamageWithLink,
  getAdjacentTargets,
  getLivingAdjacentTargets,
} from '../effectEngine';
import { resetIds, makePlayer, makeStandardPlayers } from './factory';

describe('applyHpDamageWithLink', () => {
  beforeEach(() => resetIds());

  it('正常扣血', () => {
    const p = makePlayer({ hp: 10 });
    const Disc = [];
    const L = [];
    applyHpDamageWithLink([p], 0, 3, Disc, L);
    expect(p.hp).toBe(7);
    expect(p.isDead).toBe(false);
    expect(Disc).toHaveLength(0);
  });

  it('扣到 0 触发死亡', () => {
    const p = makePlayer({ hp: 3, hand: [{ id: 1 }] });
    const Disc = [];
    const L = [];
    applyHpDamageWithLink([p], 0, 3, Disc, L);
    expect(p.hp).toBe(0);
    expect(p.isDead).toBe(true);
    expect(Disc).toHaveLength(1);
    expect(L[0]).toContain('倒下了');
  });

  it('负数或 0 伤害不处理', () => {
    const p = makePlayer({ hp: 5 });
    applyHpDamageWithLink([p], 0, 0, [], []);
    expect(p.hp).toBe(5);
    applyHpDamageWithLink([p], 0, -2, [], []);
    expect(p.hp).toBe(5);
  });

  it('无效索引安全返回', () => {
    applyHpDamageWithLink([], 0, 3, [], []);
    applyHpDamageWithLink([makePlayer()], null, 3, [], []);
    applyHpDamageWithLink([makePlayer()], 5, 3, [], []);
  });

  it('激活 damageLink 时对双方造成额外伤害', () => {
    const p0 = makePlayer({ hp: 10, damageLink: { active: true, partner: 1 } });
    const p1 = makePlayer({ hp: 10, damageLink: { active: true, partner: 0 } });
    const Disc = [];
    const L = [];
    applyHpDamageWithLink([p0, p1], 0, 2, Disc, L);
    expect(p0.hp).toBe(5); // 10 - 2 - 3
    expect(p1.hp).toBe(7); // 10 - 3
    expect(p0.damageLink.active).toBe(false);
    expect(p1.damageLink.active).toBe(false);
    expect(L.some(s => s.includes('两人一绳'))).toBe(true);
  });

  it('damageLink 未激活时不触发', () => {
    const p0 = makePlayer({ hp: 10, damageLink: { active: false, partner: 1 } });
    const p1 = makePlayer({ hp: 10 });
    applyHpDamageWithLink([p0, p1], 0, 2, [], []);
    expect(p0.hp).toBe(8);
    expect(p1.hp).toBe(10);
  });

  it('damageLink 伙伴已死亡时不触发', () => {
    const p0 = makePlayer({ hp: 10, damageLink: { active: true, partner: 1 } });
    const p1 = makePlayer({ hp: 0, isDead: true });
    applyHpDamageWithLink([p0, p1], 0, 2, [], []);
    expect(p0.hp).toBe(8);
    expect(p1.hp).toBe(0);
  });

  it('link 伤害导致双方死亡', () => {
    const p0 = makePlayer({ hp: 4, damageLink: { active: true, partner: 1 }, hand: [{ id: 1 }] });
    const p1 = makePlayer({ hp: 2, damageLink: { active: true, partner: 0 } });
    const Disc = [];
    const L = [];
    applyHpDamageWithLink([p0, p1], 0, 1, Disc, L);
    expect(p0.isDead).toBe(true);
    expect(p1.isDead).toBe(true);
    expect(L.length).toBeGreaterThanOrEqual(2);
  });
});

describe('getAdjacentTargets', () => {
  beforeEach(() => resetIds());

  it('返回当前玩家及左右相邻', () => {
    const players = makeStandardPlayers(5);
    expect(getAdjacentTargets(players, 0)).toEqual([0, 4, 1]);
    expect(getAdjacentTargets(players, 2)).toEqual([2, 1, 3]);
  });

  it('两人时去重', () => {
    const players = makeStandardPlayers(2);
    expect(getAdjacentTargets(players, 0)).toEqual([0, 1]);
    expect(getAdjacentTargets(players, 1)).toEqual([1, 0]);
  });

  it('单人只返回自己', () => {
    const players = makeStandardPlayers(1);
    expect(getAdjacentTargets(players, 0)).toEqual([0]);
  });

  it('跳过死亡玩家', () => {
    const players = makeStandardPlayers(5);
    players[1].isDead = true;
    players[4].isDead = true;
    expect(getAdjacentTargets(players, 0)).toEqual([0, 3, 2]);
  });
});

describe('getLivingAdjacentTargets', () => {
  beforeEach(() => resetIds());

  it('返回左右存活邻居（不含自己）', () => {
    const players = makeStandardPlayers(5);
    expect(getLivingAdjacentTargets(players, 0)).toEqual([4, 1]);
    expect(getLivingAdjacentTargets(players, 2)).toEqual([1, 3]);
  });

  it('排除死亡玩家', () => {
    const players = makeStandardPlayers(5);
    players[1].isDead = true;
    expect(getLivingAdjacentTargets(players, 0)).toEqual([4, 2]);
  });

  it('无存活邻居返回空数组', () => {
    const players = makeStandardPlayers(3);
    players[1].isDead = true;
    players[2].isDead = true;
    expect(getLivingAdjacentTargets(players, 0)).toEqual([]);
  });

  it('两人时返回对方', () => {
    const players = makeStandardPlayers(2);
    expect(getLivingAdjacentTargets(players, 0)).toEqual([1]);
    expect(getLivingAdjacentTargets(players, 1)).toEqual([0]);
  });
});
