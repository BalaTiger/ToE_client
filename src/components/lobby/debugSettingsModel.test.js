import { describe, expect, it } from 'vitest';
import {
  decodeDebugCardValue,
  encodeDebugGodCardValue,
  encodeDebugZoneCardValue,
  getDebugCardSelection,
  getDebugExpansionSelection,
  getExpansionDefaults,
  getFirstZoneCardForSlot,
} from './debugSettingsModel';

describe('debugSettingsModel', () => {
  it('只允许完整正式拓展包进入 Debug 拓展包选项', () => {
    const { playableExpansionKeys, selectedExpansionKey } = getDebugExpansionSelection('群星呼唤');

    expect(playableExpansionKeys).toEqual(['地神的潜影']);
    expect(selectedExpansionKey).toBe('地神的潜影');
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
