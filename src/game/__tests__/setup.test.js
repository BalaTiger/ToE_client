import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from '../coreUtils';
import {
  applyTemporaryStarsCallDeckReplacement,
  EXPANSION_RANDOM_KEY,
  initGame,
  mkDeck,
  mkRoles,
  resolveBattleExpansionPlan,
} from '../setup';
import { EXPANSIONS, getCardDisplayKey } from '../../constants/card';
import { resetIds } from './factory';

describe('mkDeck', () => {
  beforeEach(() => resetIds());

  const EXPECTED_ZONE_CARD_COUNT = 48;
  const EXPECTED_EARTH_SPECIAL_CARD_COUNT = 24;
  const EXPECTED_EARTH_DECK_COUNT = EXPECTED_ZONE_CARD_COUNT + EXPECTED_EARTH_SPECIAL_CARD_COUNT;

  it('默认牌堆使用地神的潜影并满足 72 张正式构成', () => {
    const deck = mkDeck();
    const zoneCards = deck.filter(c => c.isZone);
    const specialCards = deck.filter(c => c.isGod);

    expect(zoneCards).toHaveLength(EXPECTED_ZONE_CARD_COUNT);
    expect(specialCards).toHaveLength(EXPECTED_EARTH_SPECIAL_CARD_COUNT);
    expect(deck).toHaveLength(EXPECTED_EARTH_DECK_COUNT);
    expect(deck.every(c => c.isGod || c.expansion === '地神的潜影')).toBe(true);
  });

  it('先贤的馈赠包含两张天平牌且不在同一编号', () => {
    const deck = mkDeck('先贤的馈赠');
    const lifeBalance = deck.find(c => c.name === '生命天平');
    const soulBalance = deck.find(c => c.name === '灵魂天平');

    expect(lifeBalance).toMatchObject({ key: 'B1', type: 'lifeBalance', expansion: '先贤的馈赠' });
    expect(soulBalance).toMatchObject({ key: 'C1', type: 'soulBalance', expansion: '先贤的馈赠' });
    expect(lifeBalance.key).not.toBe(soulBalance.key);
  });

  it('地神的潜影包含无尽通道', () => {
    const deck = mkDeck('地神的潜影');
    const endlessCorridor = deck.find(c => c.name === '无尽通道');

    expect(endlessCorridor).toMatchObject({
      key: 'A3',
      type: 'endTurnReplayHand',
      expansion: '地神的潜影',
    });
  });

  it('地神的潜影包含夜风呼啸', () => {
    const deck = mkDeck('地神的潜影');
    const nightWind = deck.find(c => c.name === '夜风呼啸');

    expect(nightWind).toMatchObject({
      key: 'C4',
      type: 'allDamageBoth',
      expansion: '地神的潜影',
    });
  });

  it('地神的潜影包含引燃火把和地底天空', () => {
    const deck = mkDeck('地神的潜影');

    expect(deck.find(c => c.name === '引燃火把')).toMatchObject({
      key: 'C3',
      type: 'igniteTorch',
      expansion: '地神的潜影',
    });
    expect(deck.find(c => c.name === '地底天空')).toMatchObject({
      key: 'C3',
      type: 'swapDeckDiscard',
      expansion: '地神的潜影',
    });
  });

  it('地神的潜影包含烤盲鱼和石化配方', () => {
    const deck = mkDeck('地神的潜影');

    expect(deck.find(c => c.name === '烤盲鱼')).toMatchObject({
      key: 'C1',
      type: 'blindFish',
      expansion: '地神的潜影',
    });
    expect(deck.find(c => c.name === '石化配方')).toMatchObject({
      key: 'C1',
      type: 'petrifyingFormula',
      expansion: '地神的潜影',
    });
  });

  it('地神的潜影包含荆棘山路', () => {
    const deck = mkDeck('地神的潜影');

    expect(deck.find(c => c.name === '荆棘山路')).toMatchObject({
      key: 'D2',
      type: 'selfDamageHP',
      val: 1,
      expansion: '地神的潜影',
    });
  });

  it('地神的潜影包含投掷石块', () => {
    const deck = mkDeck('地神的潜影');

    expect(deck.find(c => c.name === '投掷石块')).toMatchObject({
      key: 'B2',
      type: 'throwStone',
      polarity: 'neutral',
      expansion: '地神的潜影',
    });
  });

  it('地神的潜影包含群蛇陷阱', () => {
    const deck = mkDeck('地神的潜影');

    expect(deck.find(c => c.name === '群蛇陷阱')).toMatchObject({
      key: 'D2',
      type: 'snakePoisonTrap',
      polarity: 'negative',
      expansion: '地神的潜影',
    });
  });

  it('地神的潜影包含解读石刻、霉变食物，且斯芬克斯位于 D4', () => {
    const deck = mkDeck('地神的潜影');

    expect(deck.find(c => c.name === '解读石刻')).toMatchObject({
      key: 'A1',
      type: 'decipherStoneCarving',
      expansion: '地神的潜影',
    });
    expect(deck.find(c => c.name === '霉变食物')).toMatchObject({
      key: 'A1',
      type: 'moldyFood',
      expansion: '地神的潜影',
    });
    expect(deck.find(c => c.name === '斯芬克斯')).toMatchObject({
      key: 'D4',
      expansion: '地神的潜影',
    });
  });

  it('地神的潜影记录 16 编号位×3 区域牌与 6 种神牌×4 的目标构成', () => {
    const deck = mkDeck('地神的潜影');
    const zoneCards = deck.filter(c => c.isZone);
    const specialCards = deck.filter(c => c.isGod);
    const expansion = EXPANSIONS['地神的潜影'];

    expect(expansion.zoneSlotCount * expansion.zoneCardsPerSlot).toBe(EXPECTED_ZONE_CARD_COUNT);
    expect((expansion.godCardKeys || []).length * (expansion.godCopies || 4)).toBe(EXPECTED_EARTH_SPECIAL_CARD_COUNT);
    expect(EXPECTED_EARTH_DECK_COUNT).toBe(72);
    expect(zoneCards).toHaveLength(EXPECTED_ZONE_CARD_COUNT);
    expect(specialCards).toHaveLength(EXPECTED_EARTH_SPECIAL_CARD_COUNT);
    expect(deck).toHaveLength(EXPECTED_EARTH_DECK_COUNT);
    expect(specialCards.filter(c => c.godKey === 'TSG')).toHaveLength(4);
    expect(specialCards.find(c => c.godKey === 'TSG')).toMatchObject({
      name: '蟾蜍之神',
      subtitle: '撒托古亚之化身',
    });
  });

  it('各拓展包神牌/圣物牌数量与拓展包配置一致', () => {
    for (const [expansionKey, expansion] of Object.entries(EXPANSIONS)) {
      const deck = mkDeck(expansionKey);
      const specialCards = deck.filter(c => c.isGod);
      const copies = expansion.godCopies || 4;

      expect(specialCards).toHaveLength((expansion.godCardKeys || []).length * copies);
      for (const godKey of expansion.godCardKeys || []) {
        expect(specialCards.filter(c => c.godKey === godKey)).toHaveLength(copies);
      }
    }
  });

  it('未完成拓展包不强制满足正式牌堆数量目标', () => {
    for (const expansionKey of Object.keys(EXPANSIONS).filter(key => key !== '地神的潜影')) {
      const deck = mkDeck(expansionKey);
      const zoneCards = deck.filter(c => c.isZone);

      expect(zoneCards.length).toBeLessThanOrEqual(EXPECTED_ZONE_CARD_COUNT);
      expect(deck.length).toBeLessThanOrEqual(EXPECTED_EARTH_DECK_COUNT);
    }
  });

  it('所有区域牌都有唯一 id', () => {
    const deck = mkDeck();
    const ids = deck.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('所有区域牌都有 letter / number / key', () => {
    const deck = mkDeck();
    const zoneCards = deck.filter(c => c.isZone);
    for (const card of zoneCards) {
      expect(card.letter).toBeTruthy();
      expect(card.number).toBeGreaterThan(0);
      expect(card.key).toBe(`${card.letter}${card.number}`);
    }
  });

  it('牌序已被打乱', () => {
    const deck1 = mkDeck();
    const deck2 = mkDeck();
    const ids1 = deck1.map(c => c.id);
    const ids2 = deck2.map(c => c.id);
    // 极低概率两次 shuffle 结果完全相同
    expect(ids1).not.toEqual(ids2);
  });

  it('神牌显示编号使用短缩写', () => {
    const deck = mkDeck('地神的潜影');
    const vritra = deck.find(card => card.isGod && card.godKey === 'VRI');
    expect(vritra.key).toBe('VRI');
    expect(getCardDisplayKey(vritra)).toBe('VRI');
  });

  it('随机拓展包可临时启用群星呼唤主题并沿用地神牌堆', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    const plan = resolveBattleExpansionPlan(EXPANSION_RANDOM_KEY);

    expect(plan).toMatchObject({
      expansionKey: '群星呼唤',
      deckExpansionKey: '地神的潜影',
      temporaryStarsCall: true,
    });
  });

  it('临时群星呼唤牌堆用4张拉莱耶之主替换一种地神神牌', () => {
    const baseDeck = mkDeck('地神的潜影');
    const replacedGodKey = 'NYA';
    const result = applyTemporaryStarsCallDeckReplacement(baseDeck, replacedGodKey);
    const godCards = result.deck.filter(card => card.isGod);

    expect(result).toMatchObject({ replacedGodKey, insertedGodKey: 'CTH' });
    expect(result.deck).toHaveLength(baseDeck.length);
    expect(godCards.filter(card => card.godKey === replacedGodKey)).toHaveLength(0);
    expect(godCards.filter(card => card.godKey === 'CTH')).toHaveLength(4);
    expect(result.deck.filter(card => card.isZone).every(card => card.expansion === '地神的潜影')).toBe(true);
  });

  it('初始化随机到群星呼唤时使用群星主题和临时替换后的地神牌堆', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const gs = initGame(
      null,
      null,
      null,
      'auto',
      null,
      null,
      null,
      null,
      null,
      state => state,
      EXPANSION_RANDOM_KEY,
    );
    const allCards = [
      ...gs.deck,
      ...gs.players.flatMap(player => player.hand || []),
    ];

    expect(gs.expansionKey).toBe('群星呼唤');
    expect(gs.deckExpansionKey).toBe('地神的潜影');
    expect(gs.temporaryStarsCallReplacement).toMatchObject({ insertedGodKey: 'CTH' });
    expect(allCards.filter(card => card.isGod && card.godKey === 'CTH')).toHaveLength(4);
    expect(allCards.filter(card => card.isZone).every(card => card.expansion === '地神的潜影')).toBe(true);
  });
});

describe('mkRoles', () => {
  beforeEach(() => {
    resetIds();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('少于 2 人抛出异常', () => {
    expect(() => mkRoles(1)).toThrow('游戏人数不能少于2人');
    expect(() => mkRoles(0)).toThrow('游戏人数不能少于2人');
  });

  it('2 人返回 2 个角色', () => {
    const roles = mkRoles(2);
    expect(roles).toHaveLength(2);
  });

  it('2 人单人模式可强制玩家角色', () => {
    const roles = mkRoles(2, true, ROLE_TREASURE);
    expect(roles).toContain(ROLE_TREASURE);
    expect(roles).toHaveLength(2);
  });

  it('3 人包含基础三角色', () => {
    const roles = mkRoles(3);
    expect(roles).toContain(ROLE_TREASURE);
    expect(roles).toContain(ROLE_HUNTER);
    expect(roles).toContain(ROLE_CULTIST);
  });

  it('5 人返回 5 个角色', () => {
    const roles = mkRoles(5);
    expect(roles).toHaveLength(5);
  });

  it('角色数量不超过半数限制', () => {
    const roles = mkRoles(5);
    const counts = roles.reduce((acc, r) => {
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});
    // 5 人时，非寻宝者角色最多 2 个
    expect(counts[ROLE_HUNTER] || 0).toBeLessThanOrEqual(2);
    expect(counts[ROLE_CULTIST] || 0).toBeLessThanOrEqual(2);
  });

  it('总是包含至少 1 个寻宝者', () => {
    for (let n = 2; n <= 10; n++) {
      const roles = mkRoles(n);
      expect(roles).toContain(ROLE_TREASURE);
    }
  });

  it('单人模式第 4 个角色按权重分配', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const roles = mkRoles(4, true);
    expect(roles).toHaveLength(4);
    expect(roles[0]).toBeTruthy();
  });
});

describe('initGame debug force draw', () => {
  beforeEach(() => resetIds());

  it('单机 Debug 可强制第 4 个 AI 摸指定区域牌', () => {
    const gs = initGame(
      null,
      null,
      'ai4',
      'keep',
      'zone',
      'D3',
      '鼠群',
      null,
      null,
      state => state,
      '地神的潜影'
    );

    expect(gs.debugForceCard).toMatchObject({ key: 'D3', name: '鼠群' });
    expect(gs.debugForceCardTarget).toBe('ai4');
    expect(gs.debugForceCardKeep).toBe('keep');
  });

  it('联机 Debug 不接受 AI 强制摸牌目标', () => {
    const gs = initGame(
      ['你', '艾伦', '贝拉', '卡洛斯', '黛安娜'],
      null,
      'ai4',
      'keep',
      'zone',
      'D3',
      '玫瑰倒刺',
      null,
      null,
      state => state,
      '地神的潜影'
    );

    expect(gs.debugForceCard).toBeNull();
  });

  it('联机 Debug 不接受玩家强制摸牌目标', () => {
    const gs = initGame(
      ['你', '艾伦', '贝拉', '卡洛斯', '黛安娜'],
      null,
      'player',
      'keep',
      'zone',
      'D3',
      '玫瑰倒刺',
      null,
      null,
      state => state,
      '地神的潜影'
    );

    expect(gs.debugForceCard).toBeNull();
    expect(gs.debugForceCardTarget).toBe('player');
  });

  it('Debug 可强制摸阿波菲斯，即使当前牌堆未自然包含它', () => {
    const gs = initGame(
      null,
      null,
      'player',
      'auto',
      'god',
      null,
      null,
      'APO',
      null,
      state => state,
      '地神的潜影'
    );

    expect(gs.debugForceCard).toMatchObject({ isGod: true, godKey: 'APO', name: '阿波菲斯' });
  });

  it('Debug 可强制摸蟾蜍之神', () => {
    const gs = initGame(
      null,
      null,
      'player',
      'auto',
      'god',
      null,
      null,
      'TSG',
      null,
      state => state,
      '地神的潜影'
    );

    expect(gs.debugForceCard).toMatchObject({ isGod: true, godKey: 'TSG', name: '蟾蜍之神' });
  });

  it('Debug 强制摸牌只允许选择当前扩展包内的卡牌', () => {
    const life = initGame(
      null,
      null,
      'player',
      'keep',
      'zone',
      'B1',
      '生命天平',
      null,
      null,
      state => state,
      '地神的潜影'
    );
    const soul = initGame(
      null,
      null,
      'player',
      'keep',
      'zone',
      'C1',
      '灵魂天平',
      null,
      null,
      state => state,
      '地神的潜影'
    );

    expect(life.debugForceCard).toBeNull();
    expect(soul.debugForceCard).toBeNull();
  });
});

