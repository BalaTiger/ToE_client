import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyHpDamageWithLink,
  resolvePendingDamageLinkBreak,
  submitDamageEvents,
  applyInspectionForSanLoss,
  processInspectionTargets,
  getAdjacentTargets,
  getLivingAdjacentTargets,
  applyFx,
} from '../effectEngine';
import { buildTsathogguaSlimeBalanceDecision, copyPlayers, makeInspectionMeta } from '../coreUtils';
import { resetIds, makePlayer, makeStandardPlayers, makeZoneCard, makeGodCard, makeGs } from './factory';
import { createTsathogguaSlimeCard } from '../../constants/card';
import { VISUAL_EVENT } from '../visualEvents';
import { buildGraveDigTransferStep } from '../animQueueHelpers';
import { buildAnimQueue } from '../animQueueCore';
import { assertCompleteThrowStoneTransactions } from '../animationStepSchema';
import { makeProliferatingZState } from '../proliferatingZ';
import { addDamageLink, getAllDamageLinks } from '../damageLinks';

describe('逆流回合结束时机', () => {
  it('行动阶段打出时只登记，不立即反转方向', () => {
    const players = [makePlayer({ name: '艾伦' }), makePlayer({ name: '贝拉' })];
    const gs = makeGs({ players, currentTurn: 0, turnDirection: 1, _turnFlowStage: 'action' });

    const result = applyFx({ type: 'reverseTurnOrder', name: '逆流' }, 0, null, players, [], [], gs);

    expect(result.P[0].pendingTurnDirectionReversals).toBe(1);
    expect(result.statePatch?.turnDirection).toBeUndefined();
    expect(result.msgs[0]).toContain('本回合结束时');
  });

  it('回合结束事件重播出的逆流在当前回合结束阶段立即生效', () => {
    const players = [makePlayer({ name: '艾伦' }), makePlayer({ name: '贝拉' })];
    const gs = makeGs({ players, currentTurn: 0, turnDirection: 1, _turnFlowStage: 'endTurn' });

    const result = applyFx({ type: 'reverseTurnOrder', name: '逆流' }, 0, null, players, [], [], gs);

    expect(result.statePatch.turnDirection).toBe(-1);
    expect(result.P[0].pendingTurnDirectionReversals).toBeUndefined();
  });
});

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

  it('同一角色连接两条绳索时按创建顺序逐条断裂', () => {
    const P = [
      makePlayer({ name: '艾伦', hp: 10 }),
      makePlayer({ name: '贝拉', hp: 10 }),
      makePlayer({ name: '卡洛斯', hp: 10 }),
    ];
    addDamageLink(P, 0, 1, { createdSeq: 1 });
    addDamageLink(P, 2, 1, { createdSeq: 2 });
    const L = [];

    applyHpDamageWithLink(P, 1, 1, [], L, 1, []);

    expect(P.map(player => player.hp)).toEqual([7, 3, 7]);
    expect(getAllDamageLinks(P).map(link => link.active)).toEqual([false, false]);
    expect(L.filter(line => line.includes('绳索断裂'))).toEqual([
      '【两人一绳】绳索断裂！贝拉 和 艾伦 各失去 3 HP',
      '【两人一绳】绳索断裂！贝拉 和 卡洛斯 各失去 3 HP',
    ]);
  });

  it('绳索伤害触发相邻链条时追加到断裂队列末尾', () => {
    const P = [
      makePlayer({ name: '艾伦', hp: 10 }),
      makePlayer({ name: '贝拉', hp: 10 }),
      makePlayer({ name: '卡洛斯', hp: 10 }),
    ];
    addDamageLink(P, 0, 1, { createdSeq: 1 });
    addDamageLink(P, 1, 2, { createdSeq: 2 });
    const L = [];

    applyHpDamageWithLink(P, 0, 1, [], L, 0, []);

    expect(P.map(player => player.hp)).toEqual([6, 4, 7]);
    expect(L.filter(line => line.includes('绳索断裂'))).toEqual([
      '【两人一绳】绳索断裂！艾伦 和 贝拉 各失去 3 HP',
      '【两人一绳】绳索断裂！贝拉 和 卡洛斯 各失去 3 HP',
    ]);
  });

  it('原始伤害先等待黏液，之后断绳伤害会再次产生黏液决策', () => {
    const slime1 = createTsathogguaSlimeCard();
    const slime2 = createTsathogguaSlimeCard();
    const p0 = makePlayer({ hp: 10, san: 6, hand: [slime1, slime2], damageLink: { active: true, partner: 1 } });
    const partnerSlime = createTsathogguaSlimeCard();
    const p1 = makePlayer({ hp: 10, san: 8, hand: [partnerSlime], damageLink: { active: true, partner: 0 } });
    const P = [p0, p1];
    const beforeOriginal = copyPlayers(P);
    const Disc = [];
    const L = [];

    applyHpDamageWithLink(P, 0, 2, Disc, L, 0, []);
    const firstDecision = buildTsathogguaSlimeBalanceDecision(beforeOriginal, P, { _turnOwner: 0 });

    expect(P[0].hp).toBe(8);
    expect(P[1].hp).toBe(10);
    expect(P[0].damageLink.active).toBe(true);
    expect(firstDecision).toMatchObject({ targetIdx: 0, lostHp: 2, pendingDamageLinkBreak: { partnerIdx: 1 } });

    P[0].hand.splice(P[0].hand.indexOf(slime1), 1);
    const linkReaction = resolvePendingDamageLinkBreak(P, 0, Disc, L, 0, []);
    const secondDecision = buildTsathogguaSlimeBalanceDecision(linkReaction.beforePlayers, P, { _turnOwner: 0 });

    expect(P[0].hp).toBe(5);
    expect(P[1].hp).toBe(7);
    expect(P[0].damageLink.active).toBe(false);
    expect(secondDecision).toMatchObject({ targetIdx: 0, lostHp: 3 });
    expect(secondDecision.pendingSlimeBalanceDecisions).toEqual([
      expect.objectContaining({ targetIdx: 1, lostHp: 3 }),
    ]);
  });

  it('断绳伤害会先让回合外角色决定虚化，尚不实际扣血', () => {
    const slime = createTsathogguaSlimeCard();
    const p0 = makePlayer({ hp: 10, san: 6, hand: [slime], damageLink: { active: true, partner: 1 } });
    const p1 = makePlayer({ hp: 10, etherealizeStacks: 1, damageLink: { active: true, partner: 0 } });
    const p2 = makePlayer({ hp: 10 });
    const P = [p0, p1, p2];

    applyHpDamageWithLink(P, 0, 2, [], [], 0, []);
    const reaction = resolvePendingDamageLinkBreak(P, 0, [], [], 0, [], { continueTurnStartDraw: true });

    expect(reaction.applied).toBe(false);
    expect(reaction.etherealizeDecision).toMatchObject({
      type: 'etherealizeRedirect',
      targetIdx: 1,
      lostHp: 3,
      continueTurnStartDraw: true,
      deferredDirectLosses: [expect.objectContaining({ targetIdx: 0, lostHp: 3 })],
    });
    expect(P[0].hp).toBe(8);
    expect(P[1].hp).toBe(10);
    expect(P[0].damageLink.active).toBe(false);
    expect(P[1].damageLink.active).toBe(false);
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

describe('投掷石块玩家收入回放', () => {
  it('目标进入黏液决策并选择不牺牲时，仍保留骰子、转盘和飞石', () => {
    const slime = createTsathogguaSlimeCard();
    const players = [
      makePlayer({ name: '你', hp: 10 }),
      makePlayer({ name: '艾伦', hp: 10, san: 8, hand: [slime] }),
    ];
    const oldGs = makeGs({ players: copyPlayers(players), currentTurn: 0, phase: 'DRAW_REVEAL', log: [] });
    const random = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.7) // 骰子 5
      .mockReturnValueOnce(0); // 唯一合法目标：艾伦

    const result = applyFx(
      { type: 'throwStone', name: '投掷石块' },
      0,
      null,
      copyPlayers(players),
      [],
      [],
      oldGs,
    );
    random.mockRestore();
    const resolutionLog = ['你 收入了 [B2] 投掷石块', ...result.msgs];
    const decisionGs = {
      ...oldGs,
      players: result.P,
      deck: result.D,
      discard: result.Disc,
      log: resolutionLog,
      phase: 'TSG_SLIME_BALANCE',
      ...result.statePatch,
    };
    const queue = buildAnimQueue(oldGs, decisionGs);

    expect(decisionGs.abilityData).toMatchObject({ type: 'tsgSlimeBalance', targetIdx: 1 });
    expect(queue.map(step => step.type)).toEqual(expect.arrayContaining([
      'DICE_ROLL',
      'RANDOM_TARGET',
      'THROW_STONE',
      'HP_DAMAGE',
    ]));
    const stoneSteps = queue.filter(step => step.visualEventId === result.statePatch._visualEvents.at(-1).id);
    expect(stoneSteps.slice(0, 3).map(step => step.type)).toEqual([
      'DICE_ROLL',
      'RANDOM_TARGET',
      'THROW_STONE',
    ]);
    expect(() => assertCompleteThrowStoneTransactions(queue)).not.toThrow();

    const declinedGs = {
      ...decisionGs,
      phase: 'ACTION',
      abilityData: {},
      log: [...decisionGs.log, '【撒托古亚的赐福黏液】艾伦 没有牺牲黏液'],
    };
    expect(declinedGs.players[1].hand).toContain(slime);
    expect(queue.find(step => step.type === 'RANDOM_TARGET')).toBeTruthy();
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

  it('allDamageBoth: 保留 AOE 与后续多张检定牌的完整 stat seq', () => {
    const players = makeStandardPlayers(3);
    players[0].name = '贝拉';
    players[1].name = '卡洛斯';
    players[2].name = '黛安娜';
    players.forEach(player => {
      player.hp = 10;
      player.san = 7;
    });
    const amnesiaCard = { id: 'ins-amnesia', name: '失忆', effect: 'disableSkill', value: 1, type: 'negative' };
    const selfHarmCard = { id: 'ins-self', name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' };
    const willCard = { id: 'ins-will', name: '超人意志', effect: 'healSAN', value: 1, type: 'positive' };
    const gs = makeGs({
      players,
      currentTurn: 0,
      inspectionDeck: [amnesiaCard, selfHarmCard, willCard],
      inspectionDiscard: [],
      log: ['贝拉（邪祀者）对 黛安娜 【蛊惑】，赠予 [C4] 夜风呼啸'],
      _statEventSeq: 0,
      _statEvents: [],
      _inspectionSeq: 0,
      _inspectionEvents: [],
    });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const res = applyFx({ id: 'night-wind', name: '夜风呼啸', type: 'allDamageBoth', val: 1 }, 2, 2, players, [], [], gs);
    randomSpy.mockRestore();

    expect(res.statePatch._inspectionEvents.map(event => event.card.name)).toEqual(['失忆', '自残', '超人意志']);
    expect(res.statePatch._statEventSeq).toBe(3);
    expect(res.statePatch._statEvents.map(event => event.seq)).toEqual([1, 1, 1, 1, 1, 1, 2, 3]);
    expect(res.statePatch._statEvents.at(-2)).toMatchObject({ type: 'HP_LOSS', target: 1, reason: '自残' });
    expect(res.statePatch._statEvents.at(-1)).toMatchObject({ type: 'SAN_GAIN', target: 2, reason: '超人意志' });
  });

  it('adjDamageHP: 相邻有虚化角色时，无虚化角色的伤害也延迟归并（亡者军团场景）', () => {
    const players = [
      makePlayer({ name: '你', hp: 10, san: 7 }),
      makePlayer({ name: '艾伦', hp: 10, san: 8, etherealizeStacks: 1 }),
      makePlayer({ name: '贝拉', hp: 10, san: 8 }),
      makePlayer({ name: '黛安娜', hp: 10, san: 7 }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    // 你（idx 0）的相邻角色是艾伦（1）和黛安娜（3）；规避后自身不受伤害
    const res = applyFx({ id: 'undead-legion', name: '亡者军团', type: 'adjDamageHP', val: 4 }, 0, null, players, [], [], gs, true, [], false);

    // 艾伦有虚化 → 进入决策；黛安娜的直接伤害同样延迟，不在 res.P 中结算
    expect(res.P.map(p => p.hp)).toEqual([10, 10, 10, 10]);
    expect(res.statePatch.abilityData).toMatchObject({
      type: 'etherealizeRedirect',
      targetIdx: 1,
      lostHp: 4,
    });
    expect(res.statePatch.abilityData.deferredDirectLosses).toEqual([
      expect.objectContaining({ targetIdx: 3, lostHp: 4, lostSan: 0 }),
    ]);
  });

  it('adjDamageHP: 相邻均无虚化时伤害立即结算，行为不变', () => {
    const players = [
      makePlayer({ name: '你', hp: 10, san: 7 }),
      makePlayer({ name: '艾伦', hp: 10, san: 8 }),
      makePlayer({ name: '贝拉', hp: 10, san: 8 }),
      makePlayer({ name: '黛安娜', hp: 10, san: 7 }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const res = applyFx({ id: 'undead-legion', name: '亡者军团', type: 'adjDamageHP', val: 4 }, 0, null, players, [], [], gs, true, [], false);

    expect(res.P.map(p => p.hp)).toEqual([10, 6, 10, 6]);
    expect(res.statePatch?.abilityData?.type).toBeFalsy();
  });

  it('allDamageSAN: 存在虚化候选时全部伤害延迟到决策链结束后归并结算', () => {
    const players = [
      makePlayer({ name: '艾伦', hp: 10, san: 7 }),
      makePlayer({ name: '贝拉', hp: 10, san: 8 }),
      makePlayer({ name: '卡洛斯', hp: 10, san: 7, etherealizeStacks: 1 }),
      makePlayer({ name: '黛安娜', hp: 10, san: 7 }),
    ];
    const selfHarmCard = { id: 'ins-self', name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' };
    const truthCard = { id: 'ins-truth', name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive' };
    const gs = makeGs({
      players,
      currentTurn: 3,
      inspectionDeck: [selfHarmCard, truthCard],
      inspectionDiscard: [],
      _statEventSeq: 0,
      _statEvents: [],
      _inspectionSeq: 0,
      _inspectionEvents: [],
    });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const res = applyFx({ id: 'rats', name: '鼠群', type: 'allDamageSAN', val: 1 }, 3, null, players, [], [], gs);
    randomSpy.mockRestore();

    // 伤害前置事件（虚化）检查完成前，任何伤害都不实际结算
    expect(res.P.map(p => p.san)).toEqual([7, 8, 7, 7]);
    expect(res.statePatch._inspectionEvents || []).toEqual([]);
    expect(res.statePatch.abilityData).toMatchObject({
      type: 'etherealizeRedirect',
      targetIdx: 2,
      lostSan: 1,
    });
    // 非虚化目标的直接伤害被归并延迟，待决策链结束后统一结算
    expect(res.statePatch.abilityData.deferredDirectLosses).toEqual([
      expect.objectContaining({ targetIdx: 0, lostHp: 0, lostSan: 1 }),
      expect.objectContaining({ targetIdx: 1, lostHp: 0, lostSan: 1 }),
      expect.objectContaining({ targetIdx: 3, lostHp: 0, lostSan: 1 }),
    ]);
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
    expect(res.statePatch._visualEvents.at(-1)).toMatchObject({
      type: 'throwStone',
      sourceIdx: 0,
      targetIdx: 1,
      roll: 6,
      damage: 5,
      statEvents: [expect.objectContaining({ target: 1, phaseOrder: 2 })],
    });
    randomSpy.mockRestore();
  });

  it('sameAbyssChoice: 触发者自己最多手牌时计入刚收入的同归深渊', () => {
    const players = [
      makePlayer({
        name: '你',
        hp: 10,
        hand: [
          { id: 'h1', name: '手牌1' },
          { id: 'h2', name: '手牌2' },
          { id: 'h3', name: '手牌3' },
          { id: 'h4', name: '手牌4' },
        ],
      }),
      makePlayer({
        name: '贝拉',
        hp: 10,
        hand: [
          { id: 'b1', name: '手牌1' },
          { id: 'b2', name: '手牌2' },
          { id: 'b3', name: '手牌3' },
        ],
      }),
    ];
    const card = { id: 'same-abyss', type: 'sameAbyssChoice', name: '同归深渊', hpVal: 2 };
    const gs = makeGs({ players, currentTurn: 0 });

    const res = applyFx(card, 0, null, players, [], [], gs);

    expect(res.P[0].hp).toBe(8);
    expect(res.statePatch.abilityData).toMatchObject({
      type: 'sameAbyssChoice',
      actorIdx: 0,
      targetIdx: 0,
      actorHandCount: 5,
      targetHandCount: 5,
      discardCount: 0,
    });
    expect(res.msgs).toContain('【同归深渊】你 手牌最多（5 张），须做出选择');
  });

  it('sameAbyssChoice: 触发者与他人并列手牌最多时触发者目标优先级最低', () => {
    const players = [
      makePlayer({
        name: '你',
        hp: 10,
        hand: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
      }),
      makePlayer({
        name: '贝拉',
        hp: 10,
        hand: [{ id: 'b1' }],
      }),
      makePlayer({ name: '卡洛斯', hp: 10, hand: [{ id: 'c1' }, { id: 'c2' }] }),
    ];
    const card = { id: 'same-abyss', type: 'sameAbyssChoice', name: '同归深渊', hpVal: 2 };
    const gs = makeGs({ players, currentTurn: 2 });

    const res = applyFx(card, 2, null, players, [], [], gs);

    expect(res.statePatch.abilityData).toMatchObject({
      actorIdx: 2,
      targetIdx: 0,
      actorHandCount: 3,
      targetHandCount: 3,
    });
    expect(res.msgs).toContain('【同归深渊】你 手牌最多（3 张），须做出选择');
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

    expect(res.statePatch._randomTargetEvents[0]).toMatchObject({
      targetIdx: 1,
      phaseOrder: 1,
      phaseGroupId: expect.any(String),
    });
    const phaseGroupId = res.statePatch._randomTargetEvents[0].phaseGroupId;
    expect(res.statePatch._visualEvents[0]).toMatchObject({
      type: VISUAL_EVENT.CARD_EFFECT,
      effectKey: 'burrowingWorm',
      actorIdx: 0,
      phaseGroupId,
      phaseOrder: -1,
    });
    expect(res.statePatch._visualEvents[1]).toMatchObject({
      type: VISUAL_EVENT.RANDOM_TARGET,
      phaseGroupId,
      phaseOrder: 1,
    });
    expect(res.statEvents.every(event => event.phaseGroupId === phaseGroupId)).toBe(true);
    expect(res.statEvents.filter(ev => ev.phaseOrder === 0).map(ev => ev.target)).toEqual([0, 1, 2]);
    expect(res.statEvents.filter(ev => ev.phaseOrder === 2)).toMatchObject([{ target: 1 }]);
    expect(res.P[1].hp).toBe(6);
    randomSpy.mockRestore();
  });

  it('etherealize: 根据当前手牌数获得虚化层数', () => {
    const players = makeStandardPlayers(3);
    players[0].hand = [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }];
    const gs = makeGs({ players });
    const res = applyFx({ id: 'eth-1', type: 'etherealize', name: '半物质化' }, 0, null, players, [], [], gs);

    expect(res.P[0].etherealizeStacks).toBe(4);
    expect(res.msgs[0]).toContain('获得 4 层虚化');
  });

  it('snakePoisonTrap: 按存活人数随机分配中毒层数且可重复命中', () => {
    const players = makeStandardPlayers(4);
    players[2].isDead = true;
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9);
    const card = { type: 'snakePoisonTrap', name: '群蛇陷阱' };
    const gs = makeGs({ players });

    const res = applyFx(card, 0, null, players, [], [], gs);

    expect(res.P.map(p => p.poisonStacks || 0)).toEqual([2, 0, 0, 1]);
    expect(res.msgs[0]).toContain('分配了 3 层中毒');
    randomSpy.mockRestore();
  });

  it('snakePoisonTrap: 寻宝者规避时仍按存活人数分配层数但排除规避者', () => {
    const players = makeStandardPlayers(4);
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.34)
      .mockReturnValueOnce(0.67)
      .mockReturnValueOnce(0.99);
    const card = { type: 'snakePoisonTrap', name: '群蛇陷阱' };
    const gs = makeGs({ players });

    const res = applyFx(card, 0, null, players, [], [], gs, false, [0], false);

    expect(res.P[0].poisonStacks || 0).toBe(0);
    expect(res.P.map(p => p.poisonStacks || 0).reduce((sum, n) => sum + n, 0)).toBe(4);
    expect(res.msgs[0]).toContain('分配了 4 层中毒');
    expect(res.statePatch._visualEvents[0].payload.totalLayers).toBe(4);
    randomSpy.mockRestore();
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

  it('moldyFood: 掷出双数时恢复 2 HP', () => {
    const players = makeStandardPlayers(3);
    players[0].hp = 6;
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.3); // d1 = 2
    const gs = makeGs({ players, _moldyFoodDiceSeq: 0 });

    const res = applyFx({ type: 'moldyFood', name: '霉变食物' }, 0, null, players, [], [], gs);

    expect(res.P[0].hp).toBe(8);
    expect(res.P[0].skipNextDraw).toBeFalsy();
    expect(res.statePatch._moldyFoodDiceRoll).toMatchObject({ d1: 2, isEven: true, actorIdx: 0, seq: 1 });
    randomSpy.mockRestore();
  });

  it('moldyFood: 掷出单数时失去 1 HP 并统一设置下回合不能摸牌', () => {
    const players = makeStandardPlayers(3);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01); // d1 = 1
    const gs = makeGs({ players, _moldyFoodDiceSeq: 4 });

    const res = applyFx({ type: 'moldyFood', name: '霉变食物' }, 0, null, players, [], [], gs);

    expect(res.P[0].hp).toBe(9);
    expect(res.P[0]).toMatchObject({ skipNextDraw: true, skipNextDrawReason: '霉变食物' });
    expect(res.statePatch._moldyFoodDiceRoll).toMatchObject({ d1: 1, isEven: false, actorIdx: 0, seq: 5 });
    randomSpy.mockRestore();
  });

  it('moldyFood: 规避成功时单数分支不造成负面效果但保留独立骰子结果', () => {
    const players = makeStandardPlayers(3);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01); // d1 = 1
    const gs = makeGs({ players, _moldyFoodDiceSeq: 7 });

    const res = applyFx({ type: 'moldyFood', name: '霉变食物' }, 0, null, players, [], [], gs, true, []);

    expect(res.P[0].hp).toBe(10);
    expect(res.P[0].skipNextDraw).toBeFalsy();
    expect(res.msgs).toContain('【霉变食物】测试角色1 掷出 1 点（单数），负面效果已规避');
    expect(res.statePatch._moldyFoodDiceRoll).toMatchObject({ d1: 1, isEven: false, actorIdx: 0, seq: 8, negativeAvoided: true });
    randomSpy.mockRestore();
  });

  it('moldyFood: 规避成功时双数分支仍恢复 HP', () => {
    const players = makeStandardPlayers(3);
    players[0].hp = 6;
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.3); // d1 = 2
    const gs = makeGs({ players, _moldyFoodDiceSeq: 2 });

    const res = applyFx({ type: 'moldyFood', name: '霉变食物' }, 0, null, players, [], [], gs, true, []);

    expect(res.P[0].hp).toBe(8);
    expect(res.P[0].skipNextDraw).toBeFalsy();
    expect(res.statePatch._moldyFoodDiceRoll).toMatchObject({ d1: 2, isEven: true, actorIdx: 0, seq: 3, negativeAvoided: false });
    randomSpy.mockRestore();
  });

  it('albinoCreature: 没有火牌时可在伤害落地前规避', () => {
    const players = makeStandardPlayers(3);
    const res = applyFx({ type: 'albinoCreature', name: '白化生物' }, 0, null, players, [], [], makeGs({ players }), true, []);

    expect(res.P[0]).toMatchObject({ hp: 10, san: 10 });
    expect(res.msgs).toContain('【白化生物】测试角色1 没有带"火"字的手牌，失去 2 HP 和 2 SAN');
  });

  it('albinoCreature: AI 亮出火牌后先转盘选定目标，再播放 HP/SAN 扣减', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', hand: [{ id: 'fire', name: '活火山' }] }),
      makePlayer({ name: '贝拉' }),
    ];
    const gs = makeGs({ players: copyPlayers(players), currentTurn: 1, _randomTargetSeq: 0, _statEventSeq: 0 });
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // 选择唯一火牌
      .mockReturnValueOnce(0.8); // 目标贝拉

    const res = applyFx({ type: 'albinoCreature', name: '白化生物' }, 1, null, copyPlayers(players), [], [], gs, false, [], true);
    randomSpy.mockRestore();
    const newGs = {
      ...gs,
      players: res.P,
      log: res.msgs,
      ...res.statePatch,
    };
    const queue = buildAnimQueue(gs, newGs);
    const types = queue.map(step => step.type);
    const randomIdx = types.indexOf('RANDOM_TARGET');
    const hpIdx = types.indexOf('HP_DAMAGE');
    const sanIdx = types.indexOf('SAN_DAMAGE');

    expect(res.statePatch._randomTargetEvents[0]).toMatchObject({
      sourceIdx: 1,
      targetIdx: 2,
      label: '白化生物',
      phaseOrder: 0,
    });
    expect(randomIdx).toBeGreaterThanOrEqual(0);
    expect(hpIdx).toBeGreaterThan(randomIdx);
    expect(sanIdx).toBeGreaterThan(randomIdx);
  });

  it('decipherStoneCarving: 玩家收入后进入解读阶段', () => {
    const players = makeStandardPlayers(3);
    const deck = [makeZoneCard('A1', 0), makeZoneCard('B2', 0), makeGodCard('NYA')];
    const gs = makeGs({ players, deck });

    const res = applyFx({ type: 'decipherStoneCarving', name: '解读石刻', key: 'A1', val: 3 }, 0, null, players, deck, [], gs);

    expect(res.statePatch.abilityData).toMatchObject({
      type: 'decipherStoneCarving',
      playerIndex: 0,
    });
    expect(res.statePatch.abilityData.revealedCards).toHaveLength(3);
    expect(res.statePatch.abilityData.deckTopCards).toHaveLength(3);
    expect(res.statePatch.abilityData.deckBottomCards).toEqual([]);
  });

  it('decipherStoneCarving: AI 公开选择邪神牌会触发增殖的Z', () => {
    const players = [
      makePlayer({ name: 'Z持有者' }),
      makePlayer({ name: '解读者' }),
    ];
    const godCard = makeGodCard('NYA');
    const deck = [godCard];
    const gs = makeGs({
      players,
      deck,
      currentTurn: 0,
      proliferatingZ: makeProliferatingZState(0, 1),
      proliferatingZQueue: [],
    });

    const res = applyFx({ type: 'decipherStoneCarving', name: '解读石刻', key: 'A1', val: 1 }, 1, null, players, deck, [], gs, false, [], true);

    expect(res.P[1].hand).toContain(godCard);
    expect(res.statePatch.proliferatingZQueue).toMatchObject([
      { drawerIdx: 0, gainOwnerIdx: 1 },
    ]);
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

  it('坠落强制弃牌会生成显式视觉事件，避免收入牌抵消手牌数量变化', () => {
    const fallCard = { ...makeZoneCard('A1', 0), id: 'fall-card' };
    const discardedCard = { ...makeZoneCard('B2', 0), id: 'forced-discard' };
    const players = makeStandardPlayers(3);
    players[1].hand = [fallCard, discardedCard];
    const gs = makeGs({ players, currentTurn: 1 });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const res = applyFx(fallCard, 1, null, players, [], [], gs);
    randomSpy.mockRestore();

    expect(res.P[1].hand).toEqual([fallCard]);
    expect(res.Disc).toEqual([discardedCard]);
    expect(res.statePatch._visualEvents).toEqual([
      expect.objectContaining({
        type: VISUAL_EVENT.CARD_EFFECT,
        effectKey: 'forcedRandomDiscard',
        actorIdx: 1,
        discardEvents: [
          expect.objectContaining({
            playerIndex: 1,
            card: discardedCard,
          }),
        ],
      }),
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

  it('adjDamageHP: 1v1 时同一个相邻角色只结算一次', () => {
    const players = makeStandardPlayers(2);
    const card = { type: 'adjDamageHP', name: '测试', key: 'TEST', val: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(9);
    expect(res.P[1].hp).toBe(9);
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

  it('igniteTorch: AI 自动弃牌会生成显式视觉事件', () => {
    const torchCard = { id: 'torch-card', key: 'C3', name: '引燃火把', type: 'igniteTorch' };
    const discardedCard = { ...makeZoneCard('B2', 0), id: 'torch-discard' };
    const players = makeStandardPlayers(3);
    players[1].hand = [torchCard, discardedCard];
    const gs = makeGs({ players, currentTurn: 1 });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const res = applyFx(torchCard, 1, null, players, [], [], gs, false, [], true);
    randomSpy.mockRestore();

    expect(res.P[1].hand).toEqual([torchCard]);
    expect(res.statePatch._visualEvents).toEqual([
      expect.objectContaining({
        type: VISUAL_EVENT.CARD_EFFECT,
        effectKey: 'forcedRandomDiscard',
        actorIdx: 1,
        discardEvents: [
          expect.objectContaining({
            playerIndex: 1,
            card: discardedCard,
          }),
        ],
      }),
    ]);
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
    expect(event).toMatchObject({ type: VISUAL_EVENT.CARD_EFFECT, effectKey: 'earthquake', beforeDiscard: [] });
    expect(event.beforePlayers[0].hand).toHaveLength(1);
    expect(event.discardEvents).toHaveLength(2);
    expect(event.discardEvents[0].afterPlayers[0].hand).toHaveLength(0);
    expect(res.statePatch._earthquakeSeq).toBeUndefined();
  });

  it('selfHealAdjDamageHP: 治疗自己并伤害相邻', () => {
    const players = makeStandardPlayers(5);
    players[0].hp = 5;
    const card = { id: 'dragon-egg', name: '偷吃龙蛋', key: 'D3', type: 'selfHealAdjDamageHP', val: 3, adjVal: 2 };
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

  it('selfRevealHandHP: HP不足8时恢复至8并公开手牌', () => {
    const players = makeStandardPlayers(3);
    players[0].hp = 3;
    const card = makeZoneCard('A3', 0); // selfRevealHandHP
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(8);
    expect(res.P[0].revealHand).toBe(true);
    expect(res.P[0].pickInsteadOfRandom).toBe(true);
  });

  it('selfRevealHandHP: HP不低于8时不降血但仍公开手牌', () => {
    const players = makeStandardPlayers(3);
    players[0].hp = 9;
    const card = makeZoneCard('A3', 0); // selfRevealHandHP
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs);
    expect(res.P[0].hp).toBe(9);
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

  it('sphinxGuess: 玩家收入时不再提前携带规避结果', () => {
    const players = makeStandardPlayers(3);
    const deck = [makeZoneCard('A1', 0)];
    const card = { type: 'sphinxGuess', name: '斯芬克斯', key: 'D4' };
    const gs = makeGs({ players });

    const res = applyFx(card, 0, null, players, deck, [], gs, true, []);

    expect(res.statePatch.abilityData).toMatchObject({
      type: 'sphinxGuess',
      topCard: deck[0],
    });
    expect(res.statePatch.abilityData.sphinxAvoidNegative).toBeUndefined();
  });

  it('sphinxGuess: AI 寻宝者猜错后才掷骰规避且不失去 HP', () => {
    const players = makeStandardPlayers(3);
    players[0].role = '寻宝者';
    const deck = [makeZoneCard('A1', 0)];
    const card = { type: 'sphinxGuess', name: '斯芬克斯', key: 'D4' };
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8); // guessYes = false, top card is zone => wrong
    const gs = makeGs({ players });

    const res = applyFx(card, 0, null, players, deck, [], gs, true, [], true);

    expect(res.P[0].hp).toBe(10);
    expect(res.Disc).toHaveLength(1);
    expect(res.msgs).toContain('猜测错误！测试角色1 即将失去 3 HP');
    expect(res.msgs).toContain('测试角色1（寻宝者）掷出 5 点，成功规避负面效果！');
    expect(res.statePatch._animSphinxReveal).toBeUndefined();
    expect(res.statePatch._visualEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'sphinxResult', guessCorrect: false, actorIdx: 0 }),
    ]));
    randomSpy.mockRestore();
  });

  it('sphinxGuess: AI 寻宝者猜对时不掷规避骰', () => {
    const players = makeStandardPlayers(3);
    players[0].role = '寻宝者';
    const deck = [makeZoneCard('A1', 0)];
    const card = { type: 'sphinxGuess', name: '斯芬克斯', key: 'D4' };
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1); // guessYes = true, top card is zone => correct

    const res = applyFx(card, 0, null, players, deck, [], makeGs({ players }), false, [], true);

    expect(res.msgs.some(line => line.includes('规避负面效果'))).toBe(false);
    expect(randomSpy).toHaveBeenCalledTimes(1);
    randomSpy.mockRestore();
  });

  it('sphinxGuess: AI 公开猜对并收入邪神牌会触发增殖的Z', () => {
    const players = [
      makePlayer({ name: 'Z持有者' }),
      makePlayer({ name: '猜谜者' }),
    ];
    const godCard = makeGodCard('SHU');
    const deck = [godCard];
    const card = { type: 'sphinxGuess', name: '斯芬克斯', key: 'D4' };
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8); // guessYes = false, god card is not zone => correct
    const gs = makeGs({
      players,
      deck,
      currentTurn: 0,
      proliferatingZ: makeProliferatingZState(0, 1),
      proliferatingZQueue: [],
    });

    const res = applyFx(card, 1, null, players, deck, [], gs, false, [], true);

    expect(res.P[1].hand).toContain(godCard);
    expect(res.statePatch.proliferatingZQueue).toMatchObject([
      { drawerIdx: 0, gainOwnerIdx: 1 },
    ]);
    randomSpy.mockRestore();
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

  it('graveDigGod: AI 取回时产生 graveDig 视觉事件并可编译为弃牌堆起点的飞牌步骤', () => {
    const players = makeStandardPlayers(3);
    const shu = makeGodCard('SHU');
    const discard = [makeZoneCard('A1', 0), shu];
    const card = { type: 'graveDigGod', name: '掘墓', key: 'A4' };
    const gs = makeGs({ players, discard });
    const res = applyFx(card, 0, null, players, [], discard, gs, false, [], true);
    const event = (res.statePatch?._visualEvents || []).find(ev => ev?.type === 'graveDig');
    expect(event).toMatchObject({ playerIdx: 0, card: expect.objectContaining({ godKey: 'SHU' }) });
    expect(event.beforeDiscard.some(c => c?.godKey === 'SHU')).toBe(true);
    expect(event.afterDiscard.some(c => c?.godKey === 'SHU')).toBe(false);
    const step = buildGraveDigTransferStep(event);
    expect(step).toMatchObject({
      type: 'CARD_TRANSFER',
      sourceAnchor: 'discard',
      dest: 'player',
      toPid: 0,
      faceUp: true,
      visualEventId: event.id,
    });
    expect(step.cards[0].godKey).toBe('SHU');
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

  it('allHealHPDamageSAN: 规避触发者时自己只回血，其他人回血并失去 SAN', () => {
    const players = makeStandardPlayers(3);
    players.forEach(player => {
      player.hp = 5;
      player.san = 8;
    });
    const card = { type: 'allHealHPDamageSAN', name: '鲜红夜宴', key: 'D4', hpVal: 2, sanVal: 1 };
    const gs = makeGs({ players });

    const res = applyFx(card, 0, null, players, [], [], gs, true, []);

    expect(res.P.map(player => player.hp)).toEqual([7, 7, 7]);
    expect(res.P.map(player => player.san)).toEqual([8, 7, 7]);
    expect(res.msgs).toContain('全体存活角色回复 2 HP');
    const sanLossLog = res.msgs.find(msg => msg.includes('失去 1 SAN'));
    expect(sanLossLog).not.toBe('全体存活角色失去 1 SAN');
  });

  it('allHealHPDamageSAN: AOE 规避指定角色时只跳过该角色 SAN 损失', () => {
    const players = makeStandardPlayers(3);
    players.forEach(player => {
      player.hp = 5;
      player.san = 8;
    });
    const card = { type: 'allHealHPDamageSAN', name: '鲜红夜宴', key: 'D4', hpVal: 2, sanVal: 1 };
    const gs = makeGs({ players });

    const res = applyFx(card, 1, null, players, [], [], gs, false, [0]);

    expect(res.P.map(player => player.hp)).toEqual([7, 7, 7]);
    expect(res.P.map(player => player.san)).toEqual([8, 7, 7]);
  });

  it('avoidNegativeFor: 规避自己时相邻角色仍受伤', () => {
    const players = makeStandardPlayers(5);
    const card = { type: 'adjDamageHP', name: '测试', key: 'TEST', val: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs, false, [0]);
    expect(res.P[0].hp).toBe(10); // actor avoided
    expect(res.P[1].hp).toBe(9); // right neighbor still hit
    expect(res.P[4].hp).toBe(9); // left neighbor still hit
    expect(res.msgs).toContain('相邻角色各失去 1 HP');
    expect(res.msgs).not.toContain('P0 与相邻角色各失去 1 HP');
  });

  it('avoidNegativeFor: 规避自己时全场负面日志排除触发者', () => {
    const players = makeStandardPlayers(3);
    const card = { type: 'allDamageHP', name: '测试', key: 'TEST', val: 1 };
    const gs = makeGs({ players });
    const res = applyFx(card, 0, null, players, [], [], gs, false, [0]);
    expect(res.P[0].hp).toBe(10);
    expect(res.P[1].hp).toBe(9);
    expect(res.P[2].hp).toBe(9);
    expect(res.msgs).toContain(`除${players[0].name}外，全体存活角色失去 1 HP`);
    expect(res.msgs).not.toContain('全体存活角色失去 1 HP');
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

describe('秤心仪式的信仰历史', () => {
  it('玩家曾信仰邪神但已被抛弃时仍失去3HP', () => {
    const card = makeZoneCard('D1', 0);
    const players = [makePlayer({ hp: 10, san: 6, godName: null, godLevel: 0, godZone: [], hasBelievedGod: true })];

    const result = applyFx(card, 0, null, players, [], [], makeGs({ players }));

    expect(result.P[0]).toMatchObject({ hp: 7, san: 8, hasBelievedGod: true });
    expect(result.msgs).toContain(`${players[0].name} 失去 3 HP`);
  });

  it('玩家本局从未信仰邪神时只恢复SAN', () => {
    const card = makeZoneCard('D1', 0);
    const players = [makePlayer({ hp: 10, san: 6, hasBelievedGod: false })];

    const result = applyFx(card, 0, null, players, [], [], makeGs({ players }));

    expect(result.P[0]).toMatchObject({ hp: 10, san: 8, hasBelievedGod: false });
    expect(result.msgs.some(line => line.includes('失去 3 HP'))).toBe(false);
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

  it('揭开真相会记录具体摸牌收入且不触发区域牌效果', () => {
    const players = [makePlayer({ name: '你', hp: 10, san: 6 })];
    const inspectionCard = { name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive' };
    const zoneCard = makeZoneCard('A1', 0, { id: 'truth-draw', name: '霉变食物', type: 'selfDamageSAN', val: 2 });
    const gs = makeGs({
      players,
      deck: [zoneCard],
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
    });

    const res = applyInspectionForSanLoss(
      0,
      players[0].san,
      0,
      players,
      [zoneCard],
      [],
      [],
      makeInspectionMeta(gs),
    );

    expect(res.P[0].hand).toMatchObject([{ id: 'truth-draw' }]);
    expect(res.P[0].san).toBe(6);
    expect(res.log.at(-1)).toBe('你 揭开真相，直接摸1张牌收入手牌（不触发效果）');
    expect(res.inspectionMeta._inspectionEvents.at(-1)).toMatchObject({
      gainedCard: { hiddenDraw: true },
      gainedCardLog: '你 揭开真相，直接摸1张牌收入手牌（不触发效果）',
    });
    expect(res.inspectionMeta._inspectionEvents.at(-1).gainedCard).not.toHaveProperty('name');
  });

  it('批量 SAN 检定遇到任意待结算决策都会暂停后续检定', () => {
    const players = [
      makePlayer({ name: '你', hp: 10, san: 6 }),
      makePlayer({ name: '贝拉', hp: 10, san: 6 }),
    ];
    const selfHarmCard = { id: 'ins-self', name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' };
    const truthCard = { id: 'ins-truth', name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive' };
    const gs = makeGs({
      players,
      inspectionDeck: [selfHarmCard, truthCard],
      inspectionDiscard: [],
    });

    const res = processInspectionTargets(
      [0, 1],
      0,
      players,
      [],
      [],
      [],
      {
        ...makeInspectionMeta(gs),
        abilityData: { type: 'tsgSlimeBalance', targetIdx: 0 },
      },
    );

    expect(res.inspectionMeta._inspectionEvents.map(event => event.card.name)).toEqual(['自残']);
    expect(res.inspectionMeta.abilityData).toMatchObject({
      type: 'tsgSlimeBalance',
      pendingInspectionContinuation: { targets: [1], startIndex: 0 },
    });
  });

  it('1v1 乱抓只结算同一个相邻角色一次', () => {
    const players = [
      makePlayer({ name: '你', hp: 10, san: 6 }),
      makePlayer({ name: '贝拉', hp: 10, san: 10 }),
    ];
    const inspectionCard = { name: '乱抓', effect: 'adjacentDamageHP', value: 1, type: 'negative' };
    const gs = makeGs({
      players,
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
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

    expect(res.P[0].hp).toBe(10);
    expect(res.P[1].hp).toBe(9);
    expect(res.log.filter(line => line.includes('贝拉 被乱抓'))).toHaveLength(1);
    expect(res.inspectionMeta._inspectionEvents[0].statEvents).toMatchObject([
      { type: 'HP_LOSS', target: 1, from: { hp: 10 }, to: { hp: 9 } },
    ]);
  });

  it('buryAlive: 联机模式为所有目标初始化并行暗选槽', () => {
    const players = makeStandardPlayers(3);
    players.forEach((player, idx) => { player.hand = [makeZoneCard(`A${idx + 1}`, 0)]; });
    const card = { type: 'buryAlive', name: '活埋', key: 'A4' };
    const gs = makeGs({ players, _isMP: true });

    const res = applyFx(card, 0, null, players, [], [], gs);

    expect(res.statePatch.abilityData).toMatchObject({
      type: 'buryAliveSelect',
      source: 0,
      targets: [0, 2, 1],
      buryAliveChoices: [null, null, null],
    });
  });

  it('检定乱抓会在回合外目标扣血前进入虚化决策', () => {
    const players = [
      makePlayer({ name: '当前玩家', hp: 10, san: 6 }),
      makePlayer({ name: '相邻玩家', hp: 10, san: 10, etherealizeStacks: 1 }),
      makePlayer({ name: '另一相邻玩家', hp: 10, san: 10 }),
    ];
    const inspectionCard = { name: '乱抓', effect: 'adjacentDamageHP', value: 1, type: 'negative' };
    const gs = makeGs({ players, currentTurn: 0, inspectionDeck: [inspectionCard], inspectionDiscard: [] });

    const res = applyInspectionForSanLoss(0, 6, 0, players, [], [], [], makeInspectionMeta(gs));

    expect(res.P[1].hp).toBe(10);
    expect(res.P[2].hp).toBe(10);
    expect(res.inspectionMeta.abilityData).toMatchObject({
      type: 'etherealizeRedirect',
      targetIdx: 1,
      lostHp: 1,
      deferredDirectLosses: [expect.objectContaining({ targetIdx: 2, lostHp: 1 })],
    });
  });
});

describe('inspection and AI decision regressions', () => {
  it('does not crash when both inspection piles are empty', () => {
    const players = [makePlayer({ name: '检定者', san: 5 })];
    const meta = makeInspectionMeta({ inspectionDeck: [], inspectionDiscard: [] });

    const result = processInspectionTargets([0], 0, players, [], [], [], meta);

    expect(result.P[0]).toMatchObject({ name: '检定者', hp: 10, san: 5, hand: [] });
    expect(result.inspectionMeta.inspectionDeck).toEqual([]);
  });

  it('does not mutate caller-owned players or discard during inspection', () => {
    const card = { id: 'discard-random', name: '迫害妄想', effect: 'discardRandom' };
    const handCard = { id: 'hand-card', name: '手牌' };
    const players = [makePlayer({ name: '检定者', hand: [handCard] })];
    const discard = [];
    const meta = makeInspectionMeta({ inspectionDeck: [card], inspectionDiscard: [] });

    const result = processInspectionTargets([0], 0, players, [], discard, [], meta);

    expect(players[0].hand).toEqual([handCard]);
    expect(discard).toEqual([]);
    expect(result.P[0].hand).toEqual([]);
    expect(result.Disc).toEqual([handCard]);
  });

  it('auto-resolves same abyss for AI-controlled seat zero', () => {
    const players = [
      makePlayer({ name: 'AI-0', hp: 5, hand: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] }),
      makePlayer({ name: '触发者', hand: [{ id: 'x' }] }),
    ];
    const card = { id: 'same-abyss', type: 'sameAbyssChoice', name: '同归深渊', hpVal: 2 };

    const result = applyFx(card, 1, null, players, [], [], makeGs({ players }), false, [], true);

    expect(result.statePatch.abilityData).toBeUndefined();
    expect(result.P[0].hand).toHaveLength(2);
  });
});

describe('submitDamageEvents', () => {
  it('致死伤害不再触发受伤者的黏液响应', () => {
    const slime = createTsathogguaSlimeCard();
    const P = [makePlayer({ hp: 10 }), makePlayer({ hp: 2, san: 8, hand: [slime] })];

    const result = submitDamageEvents({
      players: P,
      currentTurn: 0,
      events: [{ targetIdx: 1, lostHp: 2, source: '致死伤害' }],
    });

    expect(result.abilityData).toBeNull();
    expect(P[1]).toMatchObject({ hp: 0, isDead: true });
  });

  it('组合伤害先结算 HP，致死时不再落实后续 SAN 损失', () => {
    const slime = createTsathogguaSlimeCard();
    const P = [makePlayer({ hp: 10 }), makePlayer({ hp: 1, san: 1, hand: [slime] })];

    const result = submitDamageEvents({
      players: P,
      currentTurn: 0,
      events: [{ targetIdx: 1, lostHp: 1, lostSan: 1, source: '组合致死伤害' }],
    });

    expect(result.abilityData).toBeNull();
    expect(P[1]).toMatchObject({ hp: 0, san: 1, isDead: true });
  });

  it('原伤害致死时断绳只伤害仍存活的另一端', () => {
    const P = [
      makePlayer({ hp: 10 }),
      makePlayer({ hp: 2, damageLink: { active: true, partner: 2 } }),
      makePlayer({ hp: 10, damageLink: { active: true, partner: 1 } }),
    ];

    const result = submitDamageEvents({
      players: P,
      currentTurn: 0,
      events: [{ targetIdx: 1, lostHp: 2, source: '致死伤害' }],
    });

    expect(result.abilityData).toBeNull();
    expect(P[1]).toMatchObject({ hp: 0, isDead: true, damageLink: { active: false } });
    expect(P[2]).toMatchObject({ hp: 7, isDead: false, damageLink: { active: false } });
  });

  it('无待处理响应的致死伤害会立即落实死亡与死亡动画标记', () => {
    const targetCard = makeZoneCard('A1', 0);
    const P = [makePlayer({ hp: 10 }), makePlayer({ hp: 3, hand: [targetCard] })];
    const discard = [];
    const log = [];

    const result = submitDamageEvents({
      players: P,
      discard,
      log,
      currentTurn: 0,
      events: [{ targetIdx: 1, lostHp: 3, source: '追捕' }],
    });

    expect(result.abilityData).toBeNull();
    expect(P[1]).toMatchObject({ hp: 0, isDead: true, _pendingAnimDeath: true, roleRevealed: true });
    expect(P[1].hand).toEqual([]);
    expect(discard).toContain(targetCard);
    expect(log.some(line => line.includes('倒下了'))).toBe(true);
  });

  it('统一入口在任一目标可虚化时延迟整批伤害', () => {
    const P = [
      makePlayer({ hp: 10 }),
      makePlayer({ hp: 10, etherealizeStacks: 1 }),
      makePlayer({ hp: 10 }),
    ];
    const result = submitDamageEvents({
      players: P,
      currentTurn: 0,
      events: [
        { targetIdx: 1, lostHp: 2, source: '批量伤害', order: 0 },
        { targetIdx: 2, lostHp: 1, source: '批量伤害', order: 1 },
      ],
    });

    expect(P.map(player => player.hp)).toEqual([10, 10, 10]);
    expect(result).toMatchObject({
      phase: 'ETHEREALIZE_DECISION',
      abilityData: {
        targetIdx: 1,
        deferredDirectLosses: [expect.objectContaining({ targetIdx: 2, lostHp: 1 })],
      },
    });
  });

  it('统一入口落实伤害后生成黏液决策', () => {
    const slime = createTsathogguaSlimeCard();
    const P = [makePlayer({ hp: 10 }), makePlayer({ hp: 8, san: 8, hand: [slime] })];
    const result = submitDamageEvents({
      players: P,
      currentTurn: 0,
      events: [{ targetIdx: 1, lostHp: 2, lostSan: 1, source: '组合伤害' }],
    });

    expect(P[1]).toMatchObject({ hp: 6, san: 7 });
    expect(result).toMatchObject({
      phase: 'TSG_SLIME_BALANCE',
      abilityData: { targetIdx: 1, lostHp: 2, lostSan: 1 },
    });
  });
});
