import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyHpDamageWithLink,
  applyInspectionForSanLoss,
  getAdjacentTargets,
  getLivingAdjacentTargets,
  applyFx,
} from '../effectEngine';
import { makeInspectionMeta } from '../coreUtils';
import { resetIds, makePlayer, makeStandardPlayers, makeZoneCard, makeGodCard, makeGs } from './factory';
import { createTsathogguaSlimeCard } from '../../constants/card';
import { VISUAL_EVENT } from '../visualEvents';

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

  it('lifeBalance / soulBalance: 摸到时分别回复 HP 和 SAN', () => {
    const players = makeStandardPlayers(3);
    players[0].hp = 5;
    players[0].san = 4;
    const gs = makeGs({ players });

    const hpRes = applyFx({ type: 'lifeBalance', name: '生命天平', val: 3 }, 0, null, players, [], [], gs);
    expect(hpRes.P[0].hp).toBe(8);
    expect(hpRes.msgs[0]).toContain('回复了 3 HP');

    const sanRes = applyFx({ type: 'soulBalance', name: '灵魂天平', val: 3 }, 0, null, hpRes.P, [], [], makeGs({ players: hpRes.P }));
    expect(sanRes.P[0].san).toBe(7);
    expect(sanRes.msgs[0]).toContain('回复了 3 SAN');
  });

  it('SAN 被区域牌效果降至 0 时不翻检定牌', () => {
    const players = makeStandardPlayers(3);
    players[0].hp = 10;
    players[0].san = 3;
    const inspectionCard = { name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' };
    const gs = makeGs({
      players,
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      _inspectionSeq: 2,
    });

    const res = applyFx({ type: 'selfDamageSAN', name: '测试SAN归零', val: 3 }, 0, null, players, [], [], gs);

    expect(res.P[0].san).toBe(0);
    expect(res.P[0].hp).toBe(10);
    expect(res.statePatch._inspectionEvents || []).toEqual([]);
    expect(res.statePatch._inspectionSeq).toBeUndefined();
  });

  it('同一效果已造成 SAN 归零时，不继续处理其他低 SAN 检定', () => {
    const players = makeStandardPlayers(3);
    players[0].hp = 10;
    players[0].san = 2;
    players[1].hp = 10;
    players[1].san = 6;
    const inspectionCard = { name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' };
    const gs = makeGs({
      players,
      inspectionDeck: [inspectionCard, inspectionCard],
      inspectionDiscard: [],
    });

    const res = applyFx({ type: 'allDamageSAN', name: '测试全体SAN', val: 2 }, 0, null, players, [], [], gs);

    expect(res.P[0].san).toBe(0);
    expect(res.P[1].san).toBe(4);
    expect(res.P[1].hp).toBe(10);
    expect(res.statePatch._inspectionEvents || []).toEqual([]);
  });

  it('igniteTorch: 玩家有手牌时进入弃牌选择', () => {
    const players = makeStandardPlayers(3);
    players[0].hand = [{ id: 'old-card', name: '旧手牌', type: 'test' }];
    const gs = makeGs({ players });
    const res = applyFx({ type: 'igniteTorch', name: '引燃火把' }, 0, null, players, [], [], gs);

    expect(res.P[0].hand).toHaveLength(1);
    expect(res.P[0].godPowerImmuneThisTurn).toBeFalsy();
    expect(res.statePatch.abilityData).toMatchObject({ type: 'igniteTorchDiscard', playerIndex: 0 });
    expect(res.msgs[0]).toContain('准备弃一张牌');
  });

  it('igniteTorch: AI 自动弃一张牌并获得本回合邪神之力免疫', () => {
    const players = makeStandardPlayers(3);
    players[0].hand = [{ id: 'old-card', name: '旧手牌', type: 'test' }];
    const gs = makeGs({ players });
    const res = applyFx({ type: 'igniteTorch', name: '引燃火把' }, 0, null, players, [], [], gs, false, [], true);

    expect(res.P[0].hand).toHaveLength(0);
    expect(res.P[0].godPowerImmuneThisTurn).toBe(true);
    expect(res.Disc).toMatchObject([{ id: 'old-card' }]);
    expect(res.msgs.at(-1)).toContain('本回合不受邪神之力影响');
  });

  it('swapDeckDiscard: 交换牌堆和弃牌堆', () => {
    const players = makeStandardPlayers(3);
    const deck = [{ id: 'deck-1' }, { id: 'deck-2' }];
    const discard = [{ id: 'disc-1' }];
    const gs = makeGs({ players, deck, discard });
    const res = applyFx({ type: 'swapDeckDiscard', name: '地底天空' }, 0, null, players, deck, discard, gs);

    expect(res.D).toEqual(discard);
    expect(res.Disc).toEqual(deck);
    expect(res.msgs[0]).toContain('牌堆和弃牌堆交换了');
  });

  it('blindFish: 恢复HP并标记下一次区域牌遮蔽抉择', () => {
    const players = [makePlayer({ hp: 6 })];
    const gs = makeGs({ players });
    const res = applyFx({ type: 'blindFish', name: '烤盲鱼', val: 3 }, 0, null, players, [], [], gs);

    expect(res.P[0].hp).toBe(9);
    expect(res.P[0].blindNextZoneDecision).toBe(true);
    expect(res.msgs[0]).toContain('下一张区域牌只能看见编号');
  });

  it('throwStone: 随机另一名角色并按存活者环形距离计算伤害', () => {
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99) // roll = 6
      .mockReturnValueOnce(0.4); // candidates [1,3], pick 1
    const players = [
      makePlayer({ name: '你', hp: 10 }),
      makePlayer({ name: '艾伦', hp: 10 }),
      makePlayer({ name: '贝拉', hp: 10, isDead: true }),
      makePlayer({ name: '卡洛斯', hp: 10 }),
    ];
    const gs = makeGs({ players, currentTurn: 0 });
    const res = applyFx({ type: 'throwStone', name: '投掷石块' }, 0, null, players, [], [], gs);

    expect(res.P[1].hp).toBe(5);
    expect(res.P[3].hp).toBe(10);
    expect(res.msgs[0]).toContain('掷出 6 点');
    expect(res.msgs[0]).toContain('距离1');
    expect(res.statePatch._randomTargetEvents[0]).toMatchObject({
      sourceIdx: 0,
      targetIdx: 1,
      roll: 6,
      distance: 1,
      damage: 5,
      label: '投掷石块',
      diceBefore: true,
      phaseOrder: 1,
    });
    expect(res.statEvents[0]).toMatchObject({ target: 1, phaseOrder: 2 });
    randomSpy.mockRestore();
  });

  it('allDamageHPRandomExtra: 全场伤害和随机额外伤害分为两个动画阶段', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const players = [
      makePlayer({ name: '你', hp: 10 }),
      makePlayer({ name: '艾伦', hp: 10 }),
      makePlayer({ name: '贝拉', hp: 10 }),
    ];
    const gs = makeGs({ players, currentTurn: 0 });
    const res = applyFx({ type: 'allDamageHPRandomExtra', name: '钻地魔虫', val: 2 }, 0, null, players, [], [], gs);

    expect(res.statePatch._randomTargetEvents[0]).toMatchObject({ targetIdx: 1, phaseOrder: 1 });
    expect(res.statEvents.filter(ev => ev.phaseOrder === 0).map(ev => ev.target)).toEqual([0, 1, 2]);
    expect(res.statEvents.filter(ev => ev.phaseOrder === 2)).toMatchObject([{ target: 1 }]);
    expect(res.P[1].hp).toBe(6);
    randomSpy.mockRestore();
  });

  it('semiMaterializeTeach: 进入悄悄指定目标阶段', () => {
    const players = makeStandardPlayers(3);
    const gs = makeGs({ players });
    const res = applyFx({ type: 'semiMaterializeTeach', name: '传授半物质化' }, 0, null, players, [], [], gs);

    expect(res.statePatch.abilityData).toMatchObject({
      type: 'semiMaterializeTarget',
      source: 0,
      legalTargets: [0, 1, 2],
    });
    expect(res.msgs[0]).toContain('悄悄指定');
  });

  it('deadNeighborSkipDraw: 死亡角色相邻者下回合不能摸牌', () => {
    const players = makeStandardPlayers(5);
    players[2].isDead = true;
    const gs = makeGs({ players });
    const res = applyFx({ type: 'deadNeighborSkipDraw', name: '活死人哨兵' }, 0, null, players, [], [], gs);

    expect(res.P[1]).toMatchObject({ skipNextDraw: true, skipNextDrawReason: '活死人哨兵' });
    expect(res.P[3]).toMatchObject({ skipNextDraw: true, skipNextDrawReason: '活死人哨兵' });
    expect(res.P[0].skipNextDraw).toBeFalsy();
    expect(res.P[4].skipNextDraw).toBeFalsy();
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

  it('失去 HP 且手中有撒托古亚黏液时进入平分选择', () => {
    const players = makeStandardPlayers(3);
    players[0].hand = [createTsathogguaSlimeCard()];
    const card = { type: 'selfDamageHP', name: '测试', key: 'TEST', val: 3 };
    const gs = makeGs({ players });

    const res = applyFx(card, 0, null, players, [], [], gs);

    expect(res.P[0].hp).toBe(7);
    expect(res.statePatch.abilityData).toMatchObject({
      type: 'tsgSlimeBalance',
      targetIdx: 0,
      beforeHp: 10,
      afterHp: 7,
      lostHp: 3,
    });
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

  it('selfBerserk: 蛊惑触发时绑定当前执行回合而不是被蛊惑者回合', () => {
    const players = makeStandardPlayers(3);
    const card = { type: 'selfBerserk', name: '狂化', key: 'D4' };
    const gs = makeGs({ players, currentTurn: 0, turn: 7 });
    const res = applyFx(card, 1, null, players, [], [], gs);

    expect(res.P[1]).toMatchObject({ damageBonus: 1, damageBonusTurnOwner: 0 });
  });

  it('igniteTorch: AI 自动弃牌时免疫绑定当前执行回合', () => {
    const players = makeStandardPlayers(3);
    players[1].hand = [{ id: 'old-card', name: '旧手牌', type: 'test' }];
    const gs = makeGs({ players, currentTurn: 0 });
    const res = applyFx({ type: 'igniteTorch', name: '引燃火把' }, 1, null, players, [], [], gs, false, [], true);

    expect(res.P[1]).toMatchObject({ godPowerImmuneThisTurn: true, godPowerImmuneTurnOwner: 0 });
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
    const event = res.statePatch._visualEvents?.[0];
    expect(event).toMatchObject({ type: VISUAL_EVENT.EARTHQUAKE, beforeDiscard: [] });
    expect(event.beforePlayers[0].hand).toHaveLength(1);
    expect(event.discardEvents).toHaveLength(2);
    expect(event.discardEvents[0].afterPlayers[0].hand).toHaveLength(0);
    expect(res.statePatch._earthquakeSeq).toBeUndefined();
  });

  it('selfHealAdjDamageHP: 治疗自己并伤害相邻', () => {
    const players = makeStandardPlayers(5);
    players[0].hp = 5;
    const card = makeZoneCard('A1', 0); // selfHealAdjDamageHP val=3 adjVal=2
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(8); // healed 3
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

  it('graveDigGod: 玩家从弃牌堆选择邪神牌', () => {
    const players = makeStandardPlayers(3);
    const discard = [makeZoneCard('A1', 0), makeGodCard('NYA'), makeGodCard('SHU')];
    const card = { type: 'graveDigGod', name: '掘墓', key: 'A4' };
    const gs = makeGs({ players, discard });
    const res = applyFx(card, 0, null, players, [], discard, gs);
    expect(res.statePatch.abilityData).toMatchObject({
      type: 'graveDigPickGod',
      playerIndex: 0,
      discardIndices: [1, 2],
    });
    expect(res.statePatch.abilityData.godCards.map(c => c.godKey)).toEqual(['NYA', 'SHU']);
  });

  it('graveDigGod: AI 自动取回弃牌堆最后一张邪神牌', () => {
    const players = makeStandardPlayers(3);
    const nya = makeGodCard('NYA');
    const shu = makeGodCard('SHU');
    const discard = [makeZoneCard('A1', 0), nya, shu];
    const card = { type: 'graveDigGod', name: '掘墓', key: 'A4' };
    const gs = makeGs({ players, discard });
    const res = applyFx(card, 0, null, players, [], discard, gs, false, [], true);
    expect(res.P[0].hand.map(c => c.godKey)).toEqual(['SHU']);
    expect(res.Disc.map(c => c.godKey).filter(Boolean)).toEqual(['NYA']);
  });

  it('buryAlive: 玩家触发时设置多目标手牌选择状态', () => {
    const players = makeStandardPlayers(5);
    players[0].hand = [makeZoneCard('A1', 0)];
    players[1].hand = [makeZoneCard('B2', 0)];
    players[4].hand = [];
    const card = { type: 'buryAlive', name: '活埋', key: 'A4' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.statePatch.abilityData).toMatchObject({
      type: 'buryAliveSelect',
      source: 0,
      targets: [0, 1],
      targetIndex: 0,
    });
  });

  it('buryAlive: 规避触发者时相邻角色仍需选择埋牌', () => {
    const players = makeStandardPlayers(5);
    players[0].hand = [makeZoneCard('A1', 0)];
    players[1].hand = [makeZoneCard('B2', 0)];
    players[4].hand = [makeZoneCard('C3', 0)];
    const card = { type: 'buryAlive', name: '活埋', key: 'A4' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs, true, []);
    expect(res.statePatch.abilityData).toMatchObject({
      type: 'buryAliveSelect',
      source: 0,
      targets: [4, 1],
      targetIndex: 0,
    });
  });

  it('buryAlive: AI 自动将自己与相邻角色手牌放到牌堆底', () => {
    const players = makeStandardPlayers(5);
    players[0].hand = [makeZoneCard('A1', 0)];
    players[1].hand = [makeZoneCard('B2', 0)];
    players[4].hand = [makeZoneCard('C3', 0)];
    const card = { type: 'buryAlive', name: '活埋', key: 'A4' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs, false, [], true);
    expect(res.P[0].hand).toHaveLength(0);
    expect(res.P[1].hand).toHaveLength(0);
    expect(res.P[4].hand).toHaveLength(0);
    expect(res.D.map(c => c.key)).toEqual(['A1', 'C3', 'B2']);
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

  it('petrifyingFormula: 首次收入从3点进度开始并记录共犯', () => {
    const players = makeStandardPlayers(3);
    const card = { type: 'petrifyingFormula', name: '石化配方', key: 'C1' };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);

    expect(res.statePatch.petrifyingFormula).toEqual({
      active: true,
      progress: 3,
      accomplices: [0],
    });
    expect(res.P.some(p => p.isDead)).toBe(false);
  });

  it('petrifyingFormula: 进度到1时石化HP最低角色，共犯失去1SAN并清空名单', () => {
    const players = makeStandardPlayers(4);
    players[1].hp = 2;
    players[0].san = 8;
    players[2].san = 7;
    const card = { type: 'petrifyingFormula', name: '石化配方', key: 'C1' };
    const gs = makeGs({
      players,
      inspectionDeck: [{ name: '暂时的平静', effect: 'nothing', value: 0, type: 'neutral' }],
      inspectionDiscard: [],
      petrifyingFormula: {
        active: true,
        progress: 2,
        accomplices: [0],
      },
    });

    const res = applyFx(card, 2, null, players, [], [], gs);

    expect(res.P[1].isDead).toBe(true);
    expect(res.P[1]._petrified).toBe(true);
    expect(res.P[0].san).toBe(7);
    expect(res.P[2].san).toBe(6);
    expect(res.statePatch.petrifyingFormula).toEqual({
      active: false,
      progress: null,
      accomplices: [],
    });
    expect(res.statEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'PETRIFY_DEATH', target: 1 }),
      expect.objectContaining({ type: 'SAN_LOSS', target: 0 }),
      expect.objectContaining({ type: 'SAN_LOSS', target: 2 }),
    ]));
  });
});

describe('applyInspectionForSanLoss', () => {
  beforeEach(() => resetIds());

  it('SAN 归零时不再翻检定牌', () => {
    const players = [makePlayer({ name: '你', hp: 10, san: 0 })];
    const inspectionCard = { name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' };
    const gs = makeGs({
      players,
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      _inspectionSeq: 7,
      _statEventSeq: 4,
    });

    const res = applyInspectionForSanLoss(
      0,
      players[0].san,
      0,
      players,
      [],
      [],
      ['你 失去 2 SAN'],
      makeInspectionMeta(gs),
    );

    expect(res.P[0].hp).toBe(10);
    expect(res.inspectionMeta._inspectionSeq).toBe(7);
    expect(res.inspectionMeta._statEventSeq).toBe(4);
    expect(res.inspectionMeta._inspectionEvents || []).toEqual([]);
    expect(res.log).toEqual(['你 失去 2 SAN']);
  });

  it('检定造成的属性变化会生成显式 statEvents', () => {
    const players = [makePlayer({ name: '你', hp: 10, san: 6 })];
    const inspectionCard = { name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' };
    const gs = makeGs({
      players,
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      _statEventSeq: 4,
    });

    const res = applyInspectionForSanLoss(
      0,
      players[0].san,
      0,
      players,
      [],
      [],
      [],
      makeInspectionMeta(gs),
    );

    expect(res.P[0].hp).toBe(9);
    expect(res.inspectionMeta._statEventSeq).toBe(5);
    expect(res.inspectionMeta._inspectionEvents[0].statEventSeq).toBe(5);
    expect(res.inspectionMeta._inspectionEvents[0].statEvents).toMatchObject([
      { type: 'HP_LOSS', target: 0, from: { hp: 10 }, to: { hp: 9 }, seq: 5 },
    ]);
  });
});
