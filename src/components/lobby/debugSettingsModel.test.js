import { describe, expect, it } from 'vitest';
import {
  decodeDebugCardValue,
  encodeDebugGodCardValue,
  encodeDebugZoneCardValue,
  getDebugCardSelection,
  getDebugExpansionOptions,
  getDebugExpansionSelection,
  getExpansionDefaults,
  getFirstZoneCardForSlot,
} from './debugSettingsModel';
import { EXPANSION_RANDOM_KEY, TEMPORARY_STARS_CALL_KEY } from '../../game/setup';

describe('debugSettingsModel', () => {
  it('Debug 拓展包选项包含随机、正式地神与临时群星主题', () => {
    const options = getDebugExpansionOptions();
    const { playableExpansionKeys, selectedExpansionKey, selectedDeckExpansionKey } = getDebugExpansionSelection(TEMPORARY_STARS_CALL_KEY);

    expect(options.map(option => option.key)).toEqual([EXPANSION_RANDOM_KEY, '地神的潜影', TEMPORARY_STARS_CALL_KEY]);
    expect(playableExpansionKeys).toContain(TEMPORARY_STARS_CALL_KEY);
    expect(selectedExpansionKey).toBe(TEMPORARY_STARS_CALL_KEY);
    expect(selectedDeckExpansionKey).toBe('地神的潜影');
  });

  it('为当前拓展包归一化默认区域牌与神牌', () => {
    const defaults = getExpansionDefaults('地神的潜影');
    const selection = getDebugCardSelection({
      selectedExpansionKey: '地神的潜影',
      debugForceZoneCardKey: 'BAD',
      debugForceZoneCardName: '不存在',
      debugForceGodCardKey: 'BAD',
    });

    expect(defaults.zoneCard).toMatchObject({ key: 'A1', expansion: '地神的潜影' });
    expect(defaults.godKey).toBeTruthy();
    expect(selection.selectedZoneKey).toBe(defaults.zoneCard.key);
    expect(selection.selectedZoneName).toBe(defaults.zoneCard.name);
    expect(selection.selectedGodKey).toBe(defaults.godKey);
  });

  it('临时群星主题用地神区域牌卡池，并允许选择拉莱耶之主', () => {
    const selection = getDebugCardSelection({
      selectedExpansionKey: TEMPORARY_STARS_CALL_KEY,
      selectedDeckExpansionKey: '地神的潜影',
      debugForceZoneCardKey: 'BAD',
      debugForceZoneCardName: '不存在',
      debugForceGodCardKey: 'CTH',
    });

    expect(selection.zoneCards.length).toBeGreaterThan(0);
    expect(selection.zoneCards.every(card => card.expansion === '地神的潜影')).toBe(true);
    expect(selection.godKeys).toContain('CTH');
    expect(selection.godKeys).not.toContain('HAS');
    expect(selection.godKeys).not.toContain('KTH');
    expect(selection.selectedGodKey).toBe('CTH');
  });

  it('支持 Debug 选牌值编解码与编号位默认选择', () => {
    const selection = getDebugCardSelection({
      selectedExpansionKey: '地神的潜影',
      debugForceZoneCardKey: 'A1',
      debugForceZoneCardName: '',
      debugForceGodCardKey: 'NYA',
    });
    const zoneCard = getFirstZoneCardForSlot(selection.zoneCards, 'B2');

    expect(decodeDebugCardValue(encodeDebugZoneCardValue(zoneCard))).toEqual({
      kind: 'zone',
      key: zoneCard.key,
      name: zoneCard.name,
    });
    expect(decodeDebugCardValue(encodeDebugGodCardValue('NYA'))).toEqual({
      kind: 'god',
      key: 'NYA',
      name: '',
    });
  });
});
