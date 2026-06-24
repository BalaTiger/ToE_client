import { describe, it, expect, beforeEach } from 'vitest';
import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  createBlackGoatYoungCard,
  createTsathogguaSlimeCard,
} from '../../constants/card';
import {
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from '../coreUtils';
import {
  shuffle,
  clamp,
  copyPlayers,
  isZoneCard,
  isBlankZoneCard,
  isPositiveZoneCard,
  isNegativeZoneCard,
  isNeutralZoneCard,
  isDodgeableZoneCard,
  getZoneCardPolarity,
  getZoneCardEffectScope,
  zoneCardHasGuaranteedHpLoss,
  zoneCardHasGuaranteedSanLoss,
  zoneCardIsSacrificeStyle,
  zoneCardAppliesWidePressure,
  zoneCardProvidesGuaranteedCardGain,
  zoneCardUsesTargetInteraction,
  isWinHand,
  getLivingPlayerOrder,
  cardLogText,
  removeCardsFromDiscard,
  getPrevLivingIndex,
  getNextLivingIndex,
  killPlayerState,
  clearPendingAnimDeathFlags,
  makeInspectionMeta,
  sortInspectionTargets,
  buildEtherealizeLoss,
  buildEtherealizeRedirectDecision,
  compareCaveDuelCards,
} from '../coreUtils';
import {
  resetIds,
  makePlayer,
  makeZoneCard,
  makeGodCard,
  makeBlankZoneCard,
  makeStandardPlayers,
} from './factory';

function makeZoneCardByName(name, overrides = {}) {
  for (const [slotKey, variants] of Object.entries(FIXED_ZONE_CARD_VARIANTS_BY_KEY)) {
    const variantIndex = variants.findIndex(card => card.name === name);
    if (variantIndex >= 0) return makeZoneCard(slotKey, variantIndex, overrides);
  }
  throw new Error(`Unknown zone card name ${name}`);
}

describe('compareCaveDuelCards', () => {
  it('无编号牌按循环克制关系赢4但输给1到3', () => {
    const noNumber = makeGodCard('NYA');
    const n1 = makeZoneCard('A1', 0);
    const n2 = makeZoneCard('A2', 0);
    const n3 = makeZoneCard('A3', 0);
    const n4 = makeZoneCard('A4', 0);

    expect(compareCaveDuelCards(noNumber, n4)).toBe(1);
    expect(compareCaveDuelCards(n4, noNumber)).toBe(-1);
    expect(compareCaveDuelCards(noNumber, n1)).toBe(-1);
    expect(compareCaveDuelCards(noNumber, n2)).toBe(-1);
    expect(compareCaveDuelCards(noNumber, n3)).toBe(-1);
    expect(compareCaveDuelCards(noNumber, makeGodCard('SHU'))).toBe(0);
  });
});

describe('shuffle', () => {
  beforeEach(() => resetIds());

  it('保持元素不丢失', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle(arr);
    expect(shuffled).toHaveLength(5);
    expect(shuffled.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('不修改原数组', () => {
    const arr = [1, 2, 3];
    const original = [...arr];
    shuffle(arr);
    expect(arr).toEqual(original);
  });

  it('空数组安全', () => {
    expect(shuffle([])).toEqual([]);
  });
});

describe('clamp', () => {
  it('在范围内返回原值', () => {
    expect(clamp(5)).toBe(5);
    expect(clamp(0)).toBe(0);
    expect(clamp(10)).toBe(10);
  });

  it('低于下限返回下限', () => {
    expect(clamp(-3)).toBe(0);
    expect(clamp(-100, 0, 10)).toBe(0);
  });

  it('高于上限返回上限', () => {
    expect(clamp(15)).toBe(10);
    expect(clamp(100, 0, 10)).toBe(10);
  });

  it('自定义边界', () => {
    expect(clamp(5, 2, 8)).toBe(5);
    expect(clamp(1, 2, 8)).toBe(2);
    expect(clamp(10, 2, 8)).toBe(8);
  });
});

describe('copyPlayers', () => {
  beforeEach(() => resetIds());

  it('深拷贝 hand', () => {
    const p = makePlayer({ hand: [makeZoneCard('A1', 0)] });
    const copied = copyPlayers([p]);
    expect(copied[0].hand).not.toBe(p.hand);
    expect(copied[0].hand).toEqual(p.hand);
  });

  it('深拷贝 godZone', () => {
    const p = makePlayer({ godZone: [makeGodCard('NYA')] });
    const copied = copyPlayers([p]);
    expect(copied[0].godZone).not.toBe(p.godZone);
    expect(copied[0].godZone).toEqual(p.godZone);
  });

  it('深拷贝 peekMemories', () => {
    const p = makePlayer({ peekMemories: { A1: [makeZoneCard('A1', 0)] } });
    const copied = copyPlayers([p]);
    expect(copied[0].peekMemories).not.toBe(p.peekMemories);
    expect(copied[0].peekMemories.A1).not.toBe(p.peekMemories.A1);
  });

  it('保留原始标量属性', () => {
    const p = makePlayer({ hp: 7, san: 3, isDead: true });
    const copied = copyPlayers([p]);
    expect(copied[0].hp).toBe(7);
    expect(copied[0].san).toBe(3);
    expect(copied[0].isDead).toBe(true);
  });
});

describe('card type predicates', () => {
  beforeEach(() => resetIds());

  it('isZoneCard', () => {
    expect(isZoneCard(makeZoneCard('A1', 0))).toBe(true);
    expect(isZoneCard(makeGodCard('NYA'))).toBe(false);
    expect(isZoneCard(null)).toBe(false);
    expect(isZoneCard(undefined)).toBe(false);
  });

  it('isBlankZoneCard', () => {
    expect(isBlankZoneCard(makeBlankZoneCard())).toBe(true);
    expect(isBlankZoneCard(makeZoneCard('A1', 0))).toBe(false);
  });

  it('getZoneCardPolarity', () => {
    expect(getZoneCardPolarity(makeZoneCardByName('新鲜空气'))).toBe('positive');
    expect(getZoneCardPolarity(makeZoneCardByName('坠落'))).toBe('negative');
    expect(getZoneCardPolarity(null)).toBe(null);
  });

  it('isPositiveZoneCard / isNegativeZoneCard / isNeutralZoneCard', () => {
    const positive = makeZoneCardByName('新鲜空气');
    const negative = makeZoneCardByName('坠落');
    const blank = makeBlankZoneCard();
    const throwStone = makeZoneCardByName('投掷石块');
    const petrifyingFormula = makeZoneCardByName('石化配方');
    const geomagneticReversal = makeZoneCardByName('地磁反转');
    const fireChestnut = makeZoneCardByName('火中取栗');

    expect(isPositiveZoneCard(positive)).toBe(true);
    expect(isNegativeZoneCard(negative)).toBe(true);
    expect(isNeutralZoneCard(blank)).toBe(true);
    expect(isNeutralZoneCard(throwStone)).toBe(true);
    expect(isNegativeZoneCard(throwStone)).toBe(false);
    expect(isNeutralZoneCard(petrifyingFormula)).toBe(true);
    expect(isNegativeZoneCard(petrifyingFormula)).toBe(false);
    expect(geomagneticReversal.name).toBe('地磁反转');
    expect(isNeutralZoneCard(geomagneticReversal)).toBe(true);
    expect(isNegativeZoneCard(geomagneticReversal)).toBe(false);
    expect(isNeutralZoneCard(fireChestnut)).toBe(true);
    expect(isNegativeZoneCard(fireChestnut)).toBe(false);

    expect(isNegativeZoneCard(positive)).toBe(false);
    expect(isPositiveZoneCard(negative)).toBe(false);
  });

  it('isDodgeableZoneCard separates dodge prompts from polarity', () => {
    expect(isDodgeableZoneCard(makeZoneCardByName('坠落'))).toBe(true);
    expect(isDodgeableZoneCard(makeZoneCardByName('霉变食物'))).toBe(true);
    expect(isDodgeableZoneCard(makeZoneCardByName('神圣菇肉'))).toBe(true);
    expect(isDodgeableZoneCard(makeZoneCardByName('可生食木乃伊'))).toBe(true);
    expect(isDodgeableZoneCard(makeZoneCardByName('秤心仪式'))).toBe(true);
    expect(isDodgeableZoneCard(makeZoneCardByName('火中取栗'))).toBe(true);
    expect(isDodgeableZoneCard(makeZoneCardByName('狂化'))).toBe(true);
    expect(isDodgeableZoneCard(makeZoneCardByName('鲜红夜宴'))).toBe(true);
    expect(isDodgeableZoneCard(makeZoneCardByName('斯芬克斯'))).toBe(true);
    expect(isDodgeableZoneCard(makeZoneCardByName('地磁反转'))).toBe(false);
    expect(isDodgeableZoneCard(makeZoneCardByName('偷吃龙蛋'))).toBe(false);
    expect(isDodgeableZoneCard(makeZoneCardByName('投掷石块'))).toBe(false);
  });

  it('getZoneCardEffectScope', () => {
    expect(getZoneCardEffectScope(makeZoneCard('A1', 0))).toBe('self');
    expect(getZoneCardEffectScope(makeZoneCardByName('地刺陷阱'))).toBe('adjacent');
    expect(getZoneCardEffectScope(makeZoneCardByName('火中取栗'))).toBe('self');
    expect(getZoneCardEffectScope(makeZoneCardByName('偷吃龙蛋'))).toBe('self');
    expect(getZoneCardEffectScope(null)).toBe(null);
  });

  it('zoneCardHasGuaranteedHpLoss', () => {
    expect(zoneCardHasGuaranteedHpLoss(makeZoneCardByName('腐臭'))).toBe(true);
    expect(zoneCardHasGuaranteedHpLoss(makeZoneCardByName('新鲜空气'))).toBe(false);
  });

  it('zoneCardHasGuaranteedSanLoss', () => {
    expect(zoneCardHasGuaranteedSanLoss(makeZoneCard('A1', 2))).toBe(false); // adjDamageHP
  });

  it('zoneCardIsSacrificeStyle', () => {
    expect(zoneCardIsSacrificeStyle(makeZoneCard('A1', 0))).toBe(false);
  });

  it('zoneCardAppliesWidePressure', () => {
    expect(zoneCardAppliesWidePressure(makeZoneCard('A1', 0))).toBe(false);
  });

  it('zoneCardProvidesGuaranteedCardGain', () => {
    expect(zoneCardProvidesGuaranteedCardGain(makeZoneCard('A1', 0))).toBe(false);
  });

  it('zoneCardUsesTargetInteraction', () => {
    expect(zoneCardUsesTargetInteraction(makeZoneCard('A1', 0))).toBe(false);
  });
});

describe('isWinHand', () => {
  beforeEach(() => resetIds());

  it('空手牌不能赢', () => {
    expect(isWinHand([])).toBe(false);
    expect(isWinHand(null)).toBe(false);
  });

  it('集齐所有列和行可赢', () => {
    const hand = [
      makeZoneCard('A1', 0),
      makeZoneCard('B2', 0),
      makeZoneCard('C3', 0),
      makeZoneCard('D4', 0),
    ];
    expect(isWinHand(hand)).toBe(true);
  });

  it('缺少列但有多张空白牌可补齐', () => {
    const hand = [
      makeZoneCard('A1', 0),
      makeZoneCard('B2', 0),
      makeBlankZoneCard(),
      makeBlankZoneCard(),
    ];
    expect(isWinHand(hand)).toBe(true);
  });

  it('神牌不计入行列', () => {
    const hand = [
      makeZoneCard('A1', 0),
      makeZoneCard('B2', 0),
      makeZoneCard('C3', 0),
      makeZoneCard('D4', 0),
      makeGodCard('NYA'),
    ];
    expect(isWinHand(hand)).toBe(true);
  });

  it('黑山羊幼仔和赐福黏液不计入宝藏编号', () => {
    const goat = { ...createBlackGoatYoungCard(), letter: 'D', number: 4 };
    const slime = { ...createTsathogguaSlimeCard(), letter: 'D', number: 4 };
    const hand = [
      makeZoneCard('A1', 0),
      makeZoneCard('B2', 0),
      makeZoneCard('C3', 0),
      goat,
      slime,
    ];
    const generatedGoat = createBlackGoatYoungCard();
    const generatedSlime = createTsathogguaSlimeCard();
    expect(generatedGoat).not.toHaveProperty('letter');
    expect(generatedGoat).not.toHaveProperty('number');
    expect(generatedSlime).not.toHaveProperty('letter');
    expect(generatedSlime).not.toHaveProperty('number');
    expect(isWinHand(hand)).toBe(false);
    expect(isWinHand([...hand, makeZoneCard('D4', 0)])).toBe(true);
  });

  it('缺少行列且无空白牌不能赢', () => {
    const hand = [
      makeZoneCard('A1', 0),
      makeZoneCard('B1', 0),
      makeZoneCard('C1', 0),
    ];
    expect(isWinHand(hand)).toBe(false);
  });
});

describe('getLivingPlayerOrder', () => {
  beforeEach(() => resetIds());

  it('从指定位置开始，跳过已死亡玩家', () => {
    const players = makeStandardPlayers(5);
    players[1].isDead = true;
    players[3].isDead = true;

    const order = getLivingPlayerOrder(players, 0);
    expect(order).toEqual([0, 2, 4]);
  });

  it('循环回到数组开头', () => {
    const players = makeStandardPlayers(4);
    players[3].isDead = true;

    const order = getLivingPlayerOrder(players, 2);
    expect(order).toEqual([2, 0, 1]);
  });

  it('全部存活', () => {
    const players = makeStandardPlayers(3);
    expect(getLivingPlayerOrder(players, 1)).toEqual([1, 2, 0]);
  });
});

describe('cardLogText', () => {
  beforeEach(() => resetIds);

  it('区域牌返回编号', () => {
    const card = makeZoneCard('A1', 0, { name: '偷吃龙蛋' });
    expect(cardLogText(card)).toBe('[A1]');
  });

  it('神牌返回名称', () => {
    const card = makeGodCard('NYA');
    expect(cardLogText(card)).toBe('伏行之混沌');
  });

  it('alwaysShowName 包含名称', () => {
    const card = makeZoneCard('A1', 0, { name: '偷吃龙蛋' });
    expect(cardLogText(card, { alwaysShowName: true })).toBe('[A1] 偷吃龙蛋');
  });

  it('空值处理', () => {
    expect(cardLogText(null)).toBe('???');
    expect(cardLogText(undefined)).toBe('???');
  });
});

describe('removeCardsFromDiscard', () => {
  beforeEach(() => resetIds());

  it('按 id 移除', () => {
    const c1 = makeZoneCard('A1', 0);
    const c2 = makeZoneCard('A2', 0);
    const c3 = makeZoneCard('A3', 0);

    const result = removeCardsFromDiscard([c1, c2, c3], [c2]);
    expect(result).toHaveLength(2);
    expect(result.map(c => c.id)).toEqual([c1.id, c3.id]);
  });

  it('空输入安全', () => {
    expect(removeCardsFromDiscard(null, [])).toBe(null);
    expect(removeCardsFromDiscard([], null)).toEqual([]);
  });
});

describe('getPrevLivingIndex / getNextLivingIndex', () => {
  beforeEach(() => resetIds());

  it('getPrevLivingIndex 跳过死亡玩家', () => {
    const players = makeStandardPlayers(5);
    players[4].isDead = true;
    expect(getPrevLivingIndex(players, 0)).toBe(3);
  });

  it('getNextLivingIndex 跳过死亡玩家', () => {
    const players = makeStandardPlayers(5);
    players[1].isDead = true;
    expect(getNextLivingIndex(players, 0)).toBe(2);
  });

  it('循环边界', () => {
    const players = makeStandardPlayers(3);
    expect(getPrevLivingIndex(players, 0)).toBe(2);
    expect(getNextLivingIndex(players, 2)).toBe(0);
  });

  it('无其他存活玩家返回 null', () => {
    const players = makeStandardPlayers(3);
    players[1].isDead = true;
    players[2].isDead = true;
    expect(getPrevLivingIndex(players, 0)).toBe(null);
    expect(getNextLivingIndex(players, 0)).toBe(null);
  });
});

describe('killPlayerState', () => {
  beforeEach(() => resetIds());

  it('正常击杀', () => {
    const p = makePlayer({ hand: [makeZoneCard('A1', 0)], godZone: [makeGodCard('NYA')] });
    const Disc = [];
    const L = [];

    killPlayerState([p], 0, Disc, L);

    expect(p.isDead).toBe(true);
    expect(p.roleRevealed).toBe(true);
    expect(p._pendingAnimDeath).toBe(true);
    expect(p.hand).toHaveLength(0);
    expect(p.godZone).toHaveLength(0);
    expect(p.godName).toBe(null);
    expect(p.godLevel).toBe(0);
    expect(Disc).toHaveLength(2);
    expect(L[0]).toContain('倒下了');
  });

  it('空 hand / godZone 安全', () => {
    const p = makePlayer();
    const Disc = [];
    const L = [];

    killPlayerState([p], 0, Disc, L);

    expect(p.isDead).toBe(true);
    expect(Disc).toHaveLength(0);
  });

  it('索引无效时安全返回', () => {
    const Disc = [];
    const L = [];
    killPlayerState([], 0, Disc, L);
    killPlayerState([makePlayer()], null, Disc, L);
    killPlayerState([makePlayer()], 5, Disc, L);
    expect(Disc).toHaveLength(0);
  });

  it('已死亡玩家不重复处理', () => {
    const p = makePlayer({ isDead: true, hand: [makeZoneCard('A1', 0)] });
    const Disc = [];
    const L = [];

    killPlayerState([p], 0, Disc, L);
    expect(Disc).toHaveLength(0);
  });
});

describe('clearPendingAnimDeathFlags', () => {
  it('清除标记', () => {
    const players = [
      { _pendingAnimDeath: true },
      { _pendingAnimDeath: true },
      { _pendingAnimDeath: false },
    ];

    const result = clearPendingAnimDeathFlags(players);
    expect(result[0]._pendingAnimDeath).toBe(false);
    expect(result[1]._pendingAnimDeath).toBe(false);
    expect(result[2]._pendingAnimDeath).toBe(false);
  });

  it('保留指定玩家', () => {
    const players = [
      { _pendingAnimDeath: true },
      { _pendingAnimDeath: true },
    ];

    const result = clearPendingAnimDeathFlags(players, 1);
    expect(result[0]._pendingAnimDeath).toBe(false);
    expect(result[1]._pendingAnimDeath).toBe(true);
  });

  it('返回新对象不修改原数组', () => {
    const players = [{ _pendingAnimDeath: true }];
    const result = clearPendingAnimDeathFlags(players);
    expect(result).not.toBe(players);
    expect(result[0]).not.toBe(players[0]);
  });

  it('空输入安全', () => {
    expect(clearPendingAnimDeathFlags(null)).toEqual([]);
    expect(clearPendingAnimDeathFlags([])).toEqual([]);
  });
});

describe('makeInspectionMeta', () => {
  it('返回默认值当 gs 为空', () => {
    const meta = makeInspectionMeta(null);
    expect(meta.inspectionDeck).toEqual([]);
    expect(meta.inspectionDiscard).toEqual([]);
    expect(meta.sealLooseningCount).toBe(0);
    expect(meta.houndsOfTindalosActive).toBe(false);
    expect(meta.houndsOfTindalosTarget).toBe(null);
    expect(meta.houndsOfTindalosElapsed).toBe(0);
    expect(meta._inspectionSeq).toBe(0);
    expect(meta._inspectionCard).toBe(null);
    expect(meta._inspectionEvents).toEqual([]);
  });

  it('复制 gs 中的值', () => {
    const gs = {
      inspectionDeck: [1, 2],
      inspectionDiscard: [3],
      sealLooseningCount: 2,
      houndsOfTindalosActive: true,
      houndsOfTindalosTarget: 1,
      houndsOfTindalosElapsed: 5,
      _inspectionSeq: 3,
      _inspectionCard: { name: 'test' },
      _inspectionTarget: 2,
      _inspectionPrevLogLen: 10,
      _inspectionBeforePlayers: [],
      _inspectionEvents: [{ type: 'test' }],
    };
    const meta = makeInspectionMeta(gs);
    expect(meta.inspectionDeck).toEqual([1, 2]);
    expect(meta.sealLooseningCount).toBe(2);
    expect(meta.houndsOfTindalosActive).toBe(true);
    expect(meta._inspectionSeq).toBe(3);
  });
});

describe('etherealize redirect helpers', () => {
  it('回合外即将损失且有虚化层数时生成转移决策', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '贝拉', etherealizeStacks: 2, hp: 7, san: 8 }),
      makePlayer({ name: '卡洛斯' }),
    ];

    const loss = buildEtherealizeLoss({
      players,
      targetIdx: 1,
      currentTurn: 0,
      lostHp: 3,
      source: '测试伤害',
    });

    expect(loss).toMatchObject({
      targetIdx: 1,
      lostHp: 3,
      beforeHp: 7,
      beforeSan: 8,
      source: '测试伤害',
    });
    expect(loss.adjacentTargets).toEqual([0, 2]);
  });

  it('自己回合内或没有层数时不会生成转移决策', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '贝拉', etherealizeStacks: 0 }),
      makePlayer({ name: '卡洛斯' }),
    ];

    expect(buildEtherealizeLoss({ players, targetIdx: 1, currentTurn: 1, lostHp: 1 })).toBe(null);
    expect(buildEtherealizeLoss({ players, targetIdx: 1, currentTurn: 0, lostHp: 1 })).toBe(null);
  });

  it('多个损失会生成按顺序处理的首个虚化决策', () => {
    const decision = buildEtherealizeRedirectDecision([
      { targetIdx: 1, lostHp: 1, adjacentTargets: [0, 2], source: 'A' },
      { targetIdx: 2, lostSan: 2, adjacentTargets: [1, 0], source: 'B' },
    ], { _turnOwner: 0 });

    expect(decision).toMatchObject({
      type: 'etherealizeRedirect',
      targetIdx: 1,
      pendingIndex: 0,
      _turnOwner: 0,
    });
    expect(decision.pendingLosses).toHaveLength(2);
  });
});

describe('sortInspectionTargets', () => {
  it('按从 startIndex 开始的循环顺序排序', () => {
    expect(sortInspectionTargets([3, 1, 2], 0, 5)).toEqual([1, 2, 3]);
    expect(sortInspectionTargets([0, 2, 4], 3, 5)).toEqual([4, 0, 2]);
  });

  it('去重并过滤 null', () => {
    expect(sortInspectionTargets([1, 1, 2, null, undefined], 0, 5)).toEqual([1, 2]);
  });

  it('空数组安全', () => {
    expect(sortInspectionTargets([], 0, 5)).toEqual([]);
    expect(sortInspectionTargets(null, 0, 5)).toEqual([]);
  });
});
