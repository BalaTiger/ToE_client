import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyHpDamageWithLink,
  getAdjacentTargets,
  getLivingAdjacentTargets,
  applyFx,
} from '../effectEngine';
import { resetIds, makePlayer, makeStandardPlayers, makeZoneCard, makeGodCard, makeGs } from './factory';

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

describe('applyFx', () => {
  beforeEach(() => resetIds());

  it('selfHealHP: 回复HP', () => {
    const players = makeStandardPlayers(3);
    players[0].hp = 5;
    const card = makeZoneCard('A2', 0); // selfHealHP val=1
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(6);
    expect(res.msgs[0]).toContain('回复了 1 HP');
  });

  it('selfDamageHP: 失去HP', () => {
    const players = makeStandardPlayers(3);
    // A1 variant 1 is selfDamageDiscardHP which includes selfDamageHP
    const card = { ...makeZoneCard('A1', 1), type: 'selfDamageHP', val: 3 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(7);
    expect(res.msgs[0]).toContain('失去 3 HP');
    expect(res.statePatch._statEvents).toMatchObject([
      { type: 'HP_LOSS', target: 0, from: { hp: 10 }, to: { hp: 7 } },
    ]);
  });

  it('adjDamageHP: 相邻角色失去HP', () => {
    const players = makeStandardPlayers(5);
    const card = { type: 'adjDamageHP', name: '测试', key: 'TEST', val: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(9); // self takes 1
    expect(res.P[4].hp).toBe(9); // left neighbor
    expect(res.P[1].hp).toBe(9); // right neighbor
  });

  it('adjDamageSAN: 自己与相邻角色都失去SAN', () => {
    const players = makeStandardPlayers(5);
    const card = { type: 'adjDamageSAN', name: '测试', key: 'TEST', val: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].san).toBe(9);
    expect(res.P[4].san).toBe(9);
    expect(res.P[1].san).toBe(9);
  });

  it('adjDamageBoth: 自己与相邻角色都失去HP和SAN', () => {
    const players = makeStandardPlayers(5);
    const card = { type: 'adjDamageBoth', name: '测试', key: 'TEST', hpVal: 2, sanVal: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(8);
    expect(res.P[0].san).toBe(9);
    expect(res.P[4].hp).toBe(8);
    expect(res.P[4].san).toBe(9);
    expect(res.P[1].hp).toBe(8);
    expect(res.P[1].san).toBe(9);
  });

  it('swapAllHands: 交换全部手牌', () => {
    const players = makeStandardPlayers(3);
    players[0].hand = [makeZoneCard('A1', 0)];
    players[1].hand = [makeZoneCard('B2', 0), makeZoneCard('C3', 0)];
    const card = { type: 'swapAllHands', name: '掉包', key: 'SWAP' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, 1, players, [], [], gs);
    expect(res.P[0].hand).toHaveLength(2);
    expect(res.P[1].hand).toHaveLength(1);
    expect(res.msgs[0]).toContain('交换了全部手牌');
  });

  it('selfDamageHPSAN: 失去HP和SAN', () => {
    const players = makeStandardPlayers(3);
    const card = { type: 'selfDamageHPSAN', name: '测试', key: 'TEST', hpVal: 2, sanVal: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(8);
    expect(res.P[0].san).toBe(9);
    expect(res.msgs[0]).toContain('失去 2 HP 和 1 SAN');
  });

  it('avoidNegative: 规避时跳过负面效果', () => {
    const players = makeStandardPlayers(3);
    const card = { type: 'selfDamageHP', name: '测试', key: 'TEST', val: 3 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs, true, []);
    expect(res.P[0].hp).toBe(10);
    expect(res.msgs).toHaveLength(0);
  });

  it('placeBlankZone: 放置空白区域牌', () => {
    const players = makeStandardPlayers(3);
    players[0].hand = [];
    const card = { type: 'placeBlankZone', name: '关键拼图', key: 'BLANK' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hand).toHaveLength(1);
    expect(res.P[0].hand[0].type).toBe('blankZone');
    expect(res.msgs[0]).toContain('放置了一张空白区域牌');
  });

  it('selfBerserk: 狂暴增加伤害', () => {
    const players = makeStandardPlayers(3);
    const card = { type: 'selfBerserk', name: '狂暴', key: 'BERSERK' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].damageBonus).toBe(1);
    expect(res.P[0].san).toBe(9);
    expect(res.msgs.some(m => m.includes('伤害+1'))).toBe(true);
  });

  it('allDiscard: 全体随机弃1张牌', () => {
    const players = makeStandardPlayers(3);
    players[0].hand = [makeZoneCard('A1', 0)];
    players[1].hand = [makeZoneCard('B2', 0)];
    players[2].hand = [];
    const card = { type: 'allDiscard', name: '地震', key: 'QUAKE' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hand).toHaveLength(0);
    expect(res.P[1].hand).toHaveLength(0);
    expect(res.Disc.length).toBeGreaterThanOrEqual(1);
  });

  it('selfHealAdjDamageHP: 治疗自己并伤害相邻', () => {
    const players = makeStandardPlayers(5);
    players[0].hp = 5;
    const card = makeZoneCard('A1', 0); // selfHealAdjDamageHP val=2
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(7); // healed 2
    expect(res.P[1].hp).toBe(8); // adjacent takes 2
    expect(res.P[4].hp).toBe(8); // adjacent takes 2
  });

  it('sacHealHP: 失去SAN但全体回复HP', () => {
    const players = makeStandardPlayers(3);
    players[0].hp = 5;
    players[1].hp = 5;
    const card = { type: 'sacHealHP', name: '牺牲治疗', key: 'SACHEAL', val: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].san).toBe(9); // lost 1 SAN
    expect(res.P[0].hp).toBe(6); // healed 1
    expect(res.P[1].hp).toBe(6); // healed 1
  });

  it('damageLink: 设置状态补丁', () => {
    const players = makeStandardPlayers(3);
    const card = { type: 'damageLink', name: '两人一绳', key: 'LINK' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.statePatch.damageLinkTargets).toEqual([1, 2]);
    expect(res.statePatch.damageLinkSource).toBe(0);
  });

  it('caveDuel: 设置状态补丁', () => {
    const players = makeStandardPlayers(3);
    players[1].hand = [makeZoneCard('A1', 0)];
    const card = { type: 'caveDuel', name: '穴居人战争', key: 'DUEL' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.statePatch.caveDuelTargets).toEqual([1]);
    expect(res.statePatch.caveDuelSource).toBe(0);
  });

  it('globalOnlySwap: 设置全局掉包状态', () => {
    const players = makeStandardPlayers(3);
    const card = makeZoneCard('A4', 0); // globalOnlySwap
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.statePatch.globalOnlySwapOwner).toBe(0);
  });

  it('selfRevealHandHP: 回满HP并公开手牌', () => {
    const players = makeStandardPlayers(3);
    players[0].hp = 3;
    const card = makeZoneCard('A3', 0); // selfRevealHandHP
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(10);
    expect(res.P[0].revealHand).toBe(true);
    expect(res.P[0].pickInsteadOfRandom).toBe(true);
  });

  it('selfDamageAdjDamageBoth: 复合AOE伤害', () => {
    const players = makeStandardPlayers(5);
    const card = { type: 'selfDamageAdjDamageBoth', name: '测试', key: 'TEST', hpVal: 1, sanVal: 1, adjHpVal: 1, adjSanVal: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(9);
    expect(res.P[0].san).toBe(9);
    expect(res.P[1].hp).toBe(9);
    expect(res.P[1].san).toBe(9);
  });

  it('selfRenounceGod: 放弃信仰', () => {
    const players = makeStandardPlayers(3);
    players[0].godName = 'NYA';
    players[0].godLevel = 1;
    players[0].godZone = [makeGodCard('NYA')];
    const card = { type: 'selfRenounceGod', name: '放弃信仰', key: 'RENOUNCE' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].godName).toBe(null);
    expect(res.P[0].godLevel).toBe(0);
    expect(res.P[0].godZone).toHaveLength(0);
    expect(res.Disc).toHaveLength(1);
  });

  it('firstComePick: 翻开牌并设置状态', () => {
    const players = makeStandardPlayers(3);
    const deck = [makeZoneCard('A1', 0), makeZoneCard('B2', 0), makeZoneCard('C3', 0)];
    const card = { type: 'firstComePick', name: '先到先得', key: 'FIRST', val: 3 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, deck, [], gs);
    expect(res.statePatch.abilityData.type).toBe('firstComePick');
    expect(res.statePatch.abilityData.revealedCards).toHaveLength(3);
  });

  it('roseThornGiftAllHand: 设置目标选择状态', () => {
    const players = makeStandardPlayers(3);
    const card = { type: 'roseThornGiftAllHand', name: '玫瑰倒刺', key: 'ROSE' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.statePatch.roseThornTargets).toEqual([1, 2]);
    expect(res.statePatch.roseThornSource).toBe(0);
  });

  it('avoidNegativeFor: 指定角色规避', () => {
    const players = makeStandardPlayers(5);
    const card = { type: 'adjDamageHP', name: '测试', key: 'TEST', val: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs, false, [1]);
    expect(res.P[0].hp).toBe(9); // actor still hit
    expect(res.P[1].hp).toBe(10); // avoided
    expect(res.P[4].hp).toBe(9); // not avoided
  });

  it('avoidNegativeFor: 规避自己时相邻角色仍受伤', () => {
    const players = makeStandardPlayers(5);
    const card = { type: 'adjDamageHP', name: '测试', key: 'TEST', val: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs, false, [0]);
    expect(res.P[0].hp).toBe(10); // actor avoided
    expect(res.P[1].hp).toBe(9); // right neighbor still hit
    expect(res.P[4].hp).toBe(9); // left neighbor still hit
  });

  it('selfDamageHPPeek: 规避时仍触发偷看', () => {
    const players = makeStandardPlayers(3);
    const card = { type: 'selfDamageHPPeek', name: '偷看', key: 'PEEK', val: 2 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs, true, []);
    expect(res.P[0].hp).toBe(10); // damage avoided
    expect(res.statePatch.peekHandTargets).toEqual([1, 2]); // peek still triggers
  });

  it('applyFx 不对已死亡玩家生效', () => {
    const players = makeStandardPlayers(3);
    players[1].isDead = true;
    players[1].hp = 0;
    const card = { type: 'adjDamageHP', name: '测试', key: 'TEST', val: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[1].hp).toBe(0); // dead player unaffected
    expect(res.P[1].isDead).toBe(true);
  });
});
