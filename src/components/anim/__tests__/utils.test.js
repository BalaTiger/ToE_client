import { describe, expect, it } from 'vitest';
import { INSPECTION_DECK } from '../../../constants/card';
import { getCardFlipGlowColor, getInspectionCardDesc, getInspectionCardPolarity } from '../utils';

describe('getCardFlipGlowColor', () => {
  it('maps semantic card polarity to the shared flip glow palette', () => {
    expect(getCardFlipGlowColor('positive')).toBe('#49d17d');
    expect(getCardFlipGlowColor('neutral')).toBe('#91a1c2');
    expect(getCardFlipGlowColor('negative')).toBe('#b24ad1');
  });

  it('uses neutral glow for an unknown polarity', () => {
    expect(getCardFlipGlowColor('futurePolarity')).toBe('#91a1c2');
  });
});

describe('getInspectionCardDesc', () => {
  it('uses the configured damage value for damage inspection cards', () => {
    expect(getInspectionCardDesc({ effect: 'adjacentDamageHP', value: 2 })).toBe('相邻角色失去 2 HP');
    expect(getInspectionCardDesc({ effect: 'selfDamageHP', value: 2 })).toBe('失去 2 HP');
  });

  it('keeps the legacy one-damage fallback when value is absent', () => {
    expect(getInspectionCardDesc({ effect: 'selfDamageHP' })).toBe('失去 1 HP');
  });

  it('generates every inspection card description from its configuration', () => {
    const expectedByName = {
      乱抓: '相邻角色失去 2 HP',
      自残: '失去 2 HP',
      失眠: '下一回合禁用“休息”',
      暂时的平静: '什么也不做',
      昏睡: '翻面',
      迫害妄想: '随机弃 1 张牌',
      失忆: '下一回合禁用技能',
      乏力: '下一回合手牌上限 -1',
      超人意志: '恢复 1 SAN',
      揭开真相: '从牌堆摸 1 张牌',
      封印松动: '连续翻出 2 次时邪神复活',
      廷达罗斯猎犬: '首个超时超过 15 秒的回合失去 4 HP',
    };

    for (const card of INSPECTION_DECK) {
      expect(getInspectionCardDesc(card)).toBe(expectedByName[card.name]);
    }
  });

  it('reflects configured quantities without changing renderer code', () => {
    expect(getInspectionCardDesc({ effect: 'healSAN', value: 3 })).toBe('恢复 3 SAN');
    expect(getInspectionCardDesc({ effect: 'discardRandom', value: 2 })).toBe('随机弃 2 张牌');
    expect(getInspectionCardDesc({ effect: 'sealLoosening', triggerCount: 3 })).toBe('连续翻出 3 次时邪神复活');
    expect(getInspectionCardDesc({ effect: 'houndsOfTindalos', timeoutSeconds: 20, damage: 5 }))
      .toBe('首个超时超过 20 秒的回合失去 5 HP');
  });
});

describe('getInspectionCardPolarity', () => {
  it('uses positive atmosphere for Superman Will and Reveal the Truth', () => {
    expect(getInspectionCardPolarity({ effect: 'healSAN', type: 'negative' })).toBe('positive');
    expect(getInspectionCardPolarity({ effect: 'drawCard', type: 'negative' })).toBe('positive');
  });

  it('uses neutral atmosphere only for Temporary Calm', () => {
    expect(getInspectionCardPolarity({ effect: 'nothing', type: 'negative' })).toBe('neutral');
  });

  it('defaults every other current or future inspection effect to negative', () => {
    const otherCards = INSPECTION_DECK.filter(card => !['healSAN', 'drawCard', 'nothing'].includes(card.effect));
    expect(otherCards.length).toBeGreaterThan(0);
    expect(otherCards.every(card => getInspectionCardPolarity(card) === 'negative')).toBe(true);
    expect(getInspectionCardPolarity({ effect: 'futureInspectionEffect', type: 'neutral' })).toBe('negative');
  });
});
