import { describe, expect, it } from 'vitest';
import {
  clearBlindZoneDecisionFlag,
  drawCardDecisionText,
  markBlindZoneCard,
  revealBlindDrawCard,
  shouldHideBlindZoneIdentity,
  shouldBlindZoneDecision,
} from '../blindZoneDecision';
import { makePlayer, makeZoneCard } from './factory';

describe('blindZoneDecision', () => {
  it('只让非强制区域牌进入盲摸抉择', () => {
    const players = [makePlayer({ blindNextZoneDecision: true })];
    expect(shouldBlindZoneDecision(players, 0, makeZoneCard('C1', 0))).toBe(true);
    expect(shouldBlindZoneDecision(players, 0, { ...makeZoneCard('C1', 0), forced: true })).toBe(false);
    expect(shouldBlindZoneDecision(players, 0, { isGod: true, name: '阿波菲斯' })).toBe(false);
  });

  it('盲摸牌日志只显示编号，抉择后可恢复完整身份并清除玩家标记', () => {
    const card = makeZoneCard('C1', 0);
    const blindCard = markBlindZoneCard(card, true);
    const players = [makePlayer({ blindNextZoneDecision: true })];

    expect(drawCardDecisionText(blindCard)).toBe('[C1]');
    expect(revealBlindDrawCard(blindCard)).toEqual(card);

    clearBlindZoneDecisionFlag(players, 0, { card: blindCard });
    expect(players[0].blindNextZoneDecision).toBe(false);
  });

  it('只对触发者本地视角遮蔽盲摸牌的完整卡面', () => {
    const blindCard = markBlindZoneCard(makeZoneCard('C1', 0), true);

    expect(shouldHideBlindZoneIdentity(blindCard, true)).toBe(true);
    expect(shouldHideBlindZoneIdentity(blindCard, false)).toBe(false);
    expect(shouldHideBlindZoneIdentity({ card: blindCard }, true)).toBe(true);
    expect(shouldHideBlindZoneIdentity({ card: blindCard }, false)).toBe(false);
  });
});
