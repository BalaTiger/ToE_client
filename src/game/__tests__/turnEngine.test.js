import { describe, expect, it } from 'vitest';
import { ROLE_TREASURE } from '../coreUtils';
import { aiDrawAndApply, playerDrawCard, startNextTurn } from '../turnEngine';
import { makeGodCard, makeGs, makePlayer, makeStandardPlayers } from './factory';
import { createBlackGoatYoungCard } from '../../constants/card';

describe('turnEngine stat events', () => {
  it('摸到邪神牌造成 SAN 损失时产出显式 stat events', () => {
    const players = [makePlayer({ role: ROLE_TREASURE, san: 10, godEncounters: 0 })];
    const godCard = makeGodCard('NYA');
    const gs = makeGs({ players, deck: [godCard], log: [] });

    const result = playerDrawCard(players, [godCard], [], 0, gs);

    expect(result.P[0].san).toBe(9);
    expect(result.statePatch._statEventSeq).toBe(1);
    expect(result.statePatch._statEvents).toMatchObject([
      { type: 'SAN_LOSS', target: 0, from: { san: 10 }, to: { san: 9 }, reason: '邪神遭遇', seq: 1 },
    ]);
  });

  it('Debug 强制收入可作用于任意 AI 座位的玫瑰倒刺', () => {
    const players = makeStandardPlayers(5);
    const roseThorn = {
      id: 'rose-debug',
      key: 'D3',
      letter: 'D',
      number: 3,
      name: '玫瑰倒刺',
      type: 'roseThornGiftAllHand',
      isZone: true,
    };
    const gs = makeGs({
      players,
      currentTurn: 4,
      debugForceCardKeepPending: 'keep',
      debugForceCardKeepTarget: 4,
    });

    const result = aiDrawAndApply(4, players, [roseThorn], [], gs);

    expect(result.kept).toBe(true);
    expect(result.P[4].hand).toContainEqual(expect.objectContaining({ name: '玫瑰倒刺' }));
    expect(result.statePatch.roseThornSource).toBe(4);
    expect(result.statePatch.roseThornTargets).toEqual([0, 1, 2, 3]);
  });

  it('Debug 强制收入也可直接让玩家收入玫瑰倒刺', () => {
    const players = makeStandardPlayers(5);
    const roseThorn = {
      id: 'rose-player-debug',
      key: 'D3',
      letter: 'D',
      number: 3,
      name: '玫瑰倒刺',
      type: 'roseThornGiftAllHand',
      isZone: true,
    };
    const gs = makeGs({
      players,
      debugForceCardKeepPending: 'keep',
      debugForceCardKeepTarget: 0,
    });

    const result = playerDrawCard(players, [roseThorn], [], 0, gs);

    expect(result.needsDecision).toBe(false);
    expect(result.kept).toBe(true);
    expect(result.P[0].hand).toContainEqual(expect.objectContaining({ name: '玫瑰倒刺' }));
    expect(result.statePatch.roseThornSource).toBe(0);
    expect(result.statePatch.roseThornTargets).toEqual([1, 2, 3, 4]);
  });

  it('邪神遭遇触发检定时直接扣 SAN 与检定效果使用连续 stat event seq', () => {
    const players = [makePlayer({ role: ROLE_TREASURE, hp: 10, san: 7, godEncounters: 0 })];
    const godCard = makeGodCard('NYA');
    const inspectionCard = { name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' };
    const gs = makeGs({
      players,
      deck: [godCard],
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      log: [],
    });

    const result = playerDrawCard(players, [godCard], [], 0, gs);

    expect(result.P[0]).toMatchObject({ san: 6, hp: 9 });
    expect(result.statePatch._statEventSeq).toBe(2);
    expect(result.statePatch._statEvents).toMatchObject([
      { type: 'SAN_LOSS', target: 0, from: { san: 7 }, to: { san: 6 }, seq: 1 },
      { type: 'HP_LOSS', target: 0, from: { hp: 10 }, to: { hp: 9 }, seq: 2 },
    ]);
    expect(result.statePatch._inspectionEvents[0].statEventSeq).toBe(2);
  });

  it('回合开始的黑山羊幼仔伤害产出显式 stat events', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', hp: 10, san: 10, hand: [createBlackGoatYoungCard()] }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.players[1]).toMatchObject({ hp: 9, san: 9 });
    expect(result._statEvents).toMatchObject([
      { type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10 }, to: { hp: 9, san: 9 }, seq: 1 },
      { type: 'SAN_LOSS', target: 1, from: { hp: 10, san: 10 }, to: { hp: 9, san: 9 }, seq: 1 },
    ]);
  });

  it('回合开始的两人一绳未断裂回复产出显式 stat events', () => {
    const players = [
      makePlayer({ name: '你', hp: 4, damageLink: { active: true, partner: 1, expiryOwner: 1 } }),
      makePlayer({ name: '艾伦', hp: 5, damageLink: { active: true, partner: 0, expiryOwner: 1 } }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.players[0].hp).toBe(8);
    expect(result.players[1].hp).toBe(9);
    expect(result._statEvents).toMatchObject([
      { type: 'HP_GAIN', target: 0, from: { hp: 4 }, to: { hp: 8 }, reason: '两人一绳', seq: 1 },
      { type: 'HP_GAIN', target: 1, from: { hp: 5 }, to: { hp: 9 }, reason: '两人一绳', seq: 1 },
    ]);
  });
});
