import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from '../coreUtils';
import {
  applyTemporaryStarsCallDeckReplacement,
  applySelectedLocalRole,
  EXPANSION_RANDOM_KEY,
  initGame,
  mkDeck,
  mkRoles,
  normalizeRoleCounts,
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

  it('联机下发的拓展包计划会固定主题与实际牌堆来源', () => {
    const gs = initGame(
      ['A', 'B'],
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      state => state,
      {
        expansionKey: '群星呼唤',
        deckExpansionKey: '地神的潜影',
        temporaryStarsCall: true,
      },
    );
    const allCards = [
      ...gs.deck,
      ...gs.players.flatMap(player => player.hand || []),
    ];

    expect(gs.expansionKey).toBe('群星呼唤');
    expect(gs.deckExpansionKey).toBe('地神的潜影');
    expect(gs.temporaryStarsCallReplacement).toMatchObject({ insertedGodKey: 'CTH' });
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
    expect(roles[0]).toBe(ROLE_TREASURE);
    expect(roles).toContain(ROLE_TREASURE);
    expect(roles).toHaveLength(2);
  });

  it('2 人局不生成邪祀者，即使请求强制不存在的身份也保持正式配比', () => {
    const roles = mkRoles(2, true, ROLE_CULTIST);
    expect(roles).toEqual(expect.arrayContaining([ROLE_TREASURE, ROLE_HUNTER]));
    expect(roles).not.toContain(ROLE_CULTIST);
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

  it('2至12人均遵循三职均分、余位补寻猎', () => {
    for (const randomValue of [0, 0.2, 0.49, 0.75, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(randomValue);
      for (let n = 2; n <= 12; n++) {
        const roles = mkRoles(n);
        const treasureCount = roles.filter(role => role === ROLE_TREASURE).length;
        const hunterCount = roles.filter(role => role === ROLE_HUNTER).length;
        const cultistCount = roles.filter(role => role === ROLE_CULTIST).length;
        const baseCount = Math.floor(n / 3);
        expect(cultistCount).toBe(baseCount);
        expect(treasureCount).toBeGreaterThanOrEqual(baseCount);
        expect(hunterCount).toBeGreaterThanOrEqual(baseCount);
        expect(Math.abs(treasureCount - hunterCount)).toBeLessThanOrEqual(1);
        expect(cultistCount).toBeLessThanOrEqual(treasureCount);
        expect(cultistCount).toBeLessThanOrEqual(hunterCount);
      }
    }
  });

  it('固定身份配比只接受符合均分规则的组合', () => {
    expect(normalizeRoleCounts({
      [ROLE_TREASURE]: 2,
      [ROLE_HUNTER]: 2,
      [ROLE_CULTIST]: 1,
    }, 5)).toEqual({
      [ROLE_TREASURE]: 2,
      [ROLE_HUNTER]: 2,
      [ROLE_CULTIST]: 1,
    });
    expect(normalizeRoleCounts({
      [ROLE_TREASURE]: 3,
      [ROLE_HUNTER]: 1,
      [ROLE_CULTIST]: 1,
    }, 5)).toBeNull();
  });

  it('总是包含至少 1 个寻宝者', () => {
    for (let n = 2; n <= 10; n++) {
      const roles = mkRoles(n);
      expect(roles).toContain(ROLE_TREASURE);
    }
  });

  it('4人局的唯一余位在寻宝者和追猎者间随机', () => {
    Math.random.mockReturnValueOnce(0.49).mockReturnValue(0);
    const treasureBonus = mkRoles(4);
    expect(treasureBonus.filter(role => role === ROLE_TREASURE)).toHaveLength(2);
    expect(treasureBonus.filter(role => role === ROLE_HUNTER)).toHaveLength(1);

    Math.random.mockReturnValueOnce(0.5).mockReturnValue(0);
    const hunterBonus = mkRoles(4);
    expect(hunterBonus.filter(role => role === ROLE_TREASURE)).toHaveLength(1);
    expect(hunterBonus.filter(role => role === ROLE_HUNTER)).toHaveLength(2);
  });

  it('5人局固定生成2寻宝、2追猎、1邪祀', () => {
    const roles = mkRoles(5);
    expect(roles.filter(role => role === ROLE_TREASURE)).toHaveLength(2);
    expect(roles.filter(role => role === ROLE_HUNTER)).toHaveLength(2);
    expect(roles.filter(role => role === ROLE_CULTIST)).toHaveLength(1);
  });

  it('身份池生成后会再次洗牌，不把职业固定到座位', () => {
    Math.random.mockReturnValue(0);
    const roles = mkRoles(5);
    expect(roles).toEqual([
      ROLE_TREASURE,
      ROLE_HUNTER,
      ROLE_HUNTER,
      ROLE_CULTIST,
      ROLE_TREASURE,
    ]);
  });

  it('Debug 固定角色数量时精确生成并随机打乱座次', () => {
    const roles = mkRoles(5, true, null, {
      [ROLE_TREASURE]: 2,
      [ROLE_HUNTER]: 2,
      [ROLE_CULTIST]: 1,
    });
    expect(roles.filter(role => role === ROLE_TREASURE)).toHaveLength(2);
    expect(roles.filter(role => role === ROLE_HUNTER)).toHaveLength(2);
    expect(roles.filter(role => role === ROLE_CULTIST)).toHaveLength(1);
  });

  it('非法固定角色数量回退正式随机规则', () => {
    const roles = mkRoles(5, true, null, {
      [ROLE_TREASURE]: 3,
      [ROLE_HUNTER]: 3,
      [ROLE_CULTIST]: 0,
    });
    expect(roles).toHaveLength(5);
    expect(roles).toContain(ROLE_TREASURE);
  });

  it.each([
    ['寻宝者', ROLE_TREASURE],
    ['追猎者', ROLE_HUNTER],
    ['邪祀者', ROLE_CULTIST],
  ])('选择%s后由 AI 随机抽取身份池中的剩余身份', (_label, selectedRole) => {
    const players = [
      { role: ROLE_TREASURE },
      { role: ROLE_TREASURE },
      { role: ROLE_HUNTER },
      { role: ROLE_HUNTER },
      { role: ROLE_CULTIST },
    ];
    const state = {
      players,
      _playersBeforeThisDraw: players.map(player => ({ ...player })),
      _preTurnPlayers: players.map(player => ({ ...player })),
      _playersBeforeCthDraws: players.map(player => ({ ...player })),
    };
    const result = applySelectedLocalRole(state, selectedRole);
    expect(result.players[0].role).toBe(selectedRole);
    expect(result.players.filter(player => player.role === ROLE_TREASURE)).toHaveLength(2);
    expect(result.players.filter(player => player.role === ROLE_HUNTER)).toHaveLength(2);
    expect(result.players.filter(player => player.role === ROLE_CULTIST)).toHaveLength(1);
    const expectedAiSelectedCount = players.filter(player => player.role === selectedRole).length - 1;
    expect(result.players.slice(1).filter(player => player.role === selectedRole)).toHaveLength(expectedAiSelectedCount);
    for (const snapshotKey of ['_playersBeforeThisDraw', '_preTurnPlayers', '_playersBeforeCthDraws']) {
      expect(result[snapshotKey].map(player => player.role)).toEqual(result.players.map(player => player.role));
    }
  });

  it('选择随机身份时保留玩家抽中的身份，并让 AI 抽取剩余身份', () => {
    const players = [
      { role: ROLE_CULTIST },
      { role: ROLE_TREASURE },
      { role: ROLE_HUNTER },
      { role: ROLE_TREASURE },
      { role: ROLE_HUNTER },
    ];
    const result = applySelectedLocalRole({ players }, 'random');
    expect(result.players[0].role).toBe(ROLE_CULTIST);
    expect(result.players.map(player => player.role).sort()).toEqual(players.map(player => player.role).sort());
  });
});

describe('initGame debug force draw', () => {
  beforeEach(() => resetIds());

  it('单机 Debug 可强制第 4 个 AI 摸指定区域牌', () => {
    const gs = initGame(
      null,
      '1',
      'ai4',
      'keep',
      'zone',
      'D3',
      '鼠群',
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
      '1',
      'ai4',
      'keep',
      'zone',
      'D3',
      '玫瑰倒刺',
      null,
      state => state,
      '地神的潜影'
    );

    expect(gs.debugForceCard).toBeNull();
  });

  it('联机 Debug 不接受玩家强制摸牌目标', () => {
    const gs = initGame(
      ['你', '艾伦', '贝拉', '卡洛斯', '黛安娜'],
      '1',
      'player',
      'keep',
      'zone',
      'D3',
      '玫瑰倒刺',
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
      '1',
      'player',
      'auto',
      'god',
      null,
      null,
      'APO',
      state => state,
      '地神的潜影'
    );

    expect(gs.debugForceCard).toMatchObject({ isGod: true, godKey: 'APO', name: '阿波菲斯' });
  });

  it('Debug 可强制摸蟾蜍之神', () => {
    const gs = initGame(
      null,
      '1',
      'player',
      'auto',
      'god',
      null,
      null,
      'TSG',
      state => state,
      '地神的潜影'
    );

    expect(gs.debugForceCard).toMatchObject({ isGod: true, godKey: 'TSG', name: '蟾蜍之神' });
  });

  it('Debug 强制摸牌只允许选择当前扩展包内的卡牌', () => {
    const life = initGame(
      null,
      '1',
      'player',
      'keep',
      'zone',
      'B1',
      '生命天平',
      null,
      state => state,
      '地神的潜影'
    );
    const soul = initGame(
      null,
      '1',
      'player',
      'keep',
      'zone',
      'C1',
      '灵魂天平',
      null,
      state => state,
      '地神的潜影'
    );

    expect(life.debugForceCard).toBeNull();
    expect(soul.debugForceCard).toBeNull();
  });

  it('未显式开启强制摸牌时，残留的选牌器神牌不会固定首抽', () => {
    const gs = initGame(
      null,
      null,
      'player',
      'auto',
      'god',
      null,
      null,
      'TSG',
      state => state,
      '地神的潜影'
    );

    expect(gs.debugForceCard).toBeNull();
  });

  it('临时群星呼唤也不会被残留神牌选项固定首抽', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const gs = initGame(
      null,
      null,
      'player',
      'auto',
      'god',
      null,
      null,
      'TSG',
      state => state,
      EXPANSION_RANDOM_KEY
    );

    expect(gs.expansionKey).toBe('群星呼唤');
    expect(gs.debugForceCard).toBeNull();
  });
});

