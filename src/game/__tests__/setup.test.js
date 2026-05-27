import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from '../coreUtils';
import { initGame, mkDeck, mkRoles } from '../setup';
import { EXPANSIONS, getCardDisplayKey } from '../../constants/card';
import { resetIds } from './factory';

describe('mkDeck', () => {
  beforeEach(() => resetIds());

  const EXPECTED_ZONE_CARD_COUNT = 48;
  const EXPECTED_SPECIAL_CARD_COUNT = 20;
  const EXPECTED_FORMAL_DECK_COUNT = EXPECTED_ZONE_CARD_COUNT + EXPECTED_SPECIAL_CARD_COUNT;

  it('临时拓展包允许因测试牌超出正式牌堆数量', () => {
    const deck = mkDeck('temporary');
    const zoneCards = deck.filter(c => c.isZone);
    const specialCards = deck.filter(c => c.isGod);

    expect(zoneCards.length).toBeGreaterThanOrEqual(EXPECTED_ZONE_CARD_COUNT);
    expect(specialCards).toHaveLength(EXPECTED_SPECIAL_CARD_COUNT);
    expect(deck.length).toBeGreaterThanOrEqual(EXPECTED_FORMAL_DECK_COUNT);
  });

  it('记录当前临时拓展包牌堆规模', () => {
    const deck = mkDeck('temporary');
    const zoneCards = deck.filter(c => c.isZone);
    const specialCards = deck.filter(c => c.isGod);

    expect(zoneCards).toHaveLength(56);
    expect(specialCards).toHaveLength(20);
    expect(deck).toHaveLength(76);
  });

  it('先贤的馈赠包含两张天平牌且不在同一编号', () => {
    const deck = mkDeck('temporary');
    const lifeBalance = deck.find(c => c.name === '生命天平');
    const soulBalance = deck.find(c => c.name === '灵魂天平');

    expect(lifeBalance).toMatchObject({ key: 'B1', type: 'lifeBalance', expansion: '先贤的馈赠' });
    expect(soulBalance).toMatchObject({ key: 'C1', type: 'soulBalance', expansion: '先贤的馈赠' });
    expect(lifeBalance.key).not.toBe(soulBalance.key);
  });

  it('临时拓展包包含无尽通道', () => {
    const deck = mkDeck('temporary');
    const endlessCorridor = deck.find(c => c.name === '无尽通道');

    expect(endlessCorridor).toMatchObject({
      key: 'A3',
      type: 'endTurnReplayHand',
      expansion: '地神的潜影',
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

  it('未完成拓展包不强制满足正式 68 张目标', () => {
    for (const expansionKey of Object.keys(EXPANSIONS).filter(key => key !== 'temporary')) {
      const deck = mkDeck(expansionKey);
      const zoneCards = deck.filter(c => c.isZone);

      expect(zoneCards.length).toBeLessThanOrEqual(EXPECTED_ZONE_CARD_COUNT);
      expect(deck.length).toBeLessThanOrEqual(EXPECTED_FORMAL_DECK_COUNT);
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
    const deck = mkDeck('temporary');
    const vritra = deck.find(card => card.isGod && card.godKey === 'VRI');
    expect(vritra.key).toBe('VRI');
    expect(getCardDisplayKey(vritra)).toBe('VRI');
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
      '玫瑰倒刺',
      null,
      null,
      state => state,
      'temporary'
    );

    expect(gs.debugForceCard).toMatchObject({ key: 'D3', name: '玫瑰倒刺' });
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
      'temporary'
    );

    expect(gs.debugForceCard).toBeNull();
  });
});
