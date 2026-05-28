import { describe, expect, it } from 'vitest';
import { ROLE_TREASURE } from '../coreUtils';
import { aiDrawAndApply, playerDrawCard, startNextTurn } from '../turnEngine';
import { buildTsathogguaSlimeGrantQueue } from '../turnAnimState';
import { makeGodCard, makeGs, makePlayer, makeStandardPlayers } from './factory';
import { createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../../constants/card';

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

  it('Debug 强制收入只对一张玩家摸牌生效，不会污染下一张普通牌', () => {
    const players = makeStandardPlayers(5);
    const forcedCard = {
      id: 'force-keep',
      key: 'D3',
      letter: 'D',
      number: 3,
      name: '玫瑰倒刺',
      type: 'roseThornGiftAllHand',
      isZone: true,
    };
    const normalCard = {
      id: 'normal-egg',
      key: 'A1',
      letter: 'A',
      number: 1,
      name: '偷吃龙蛋',
      type: 'selfHealAdjDamageHP',
      val: 3,
      adjVal: 2,
      isZone: true,
    };
    const gs = makeGs({
      players,
      debugForceCardKeepPending: 'keep',
      debugForceCardKeepTarget: 0,
    });

    const first = playerDrawCard(players, [forcedCard, normalCard], [], 0, gs);
    expect(first.kept).toBe(true);
    expect(gs.debugForceCardKeepPending).toBeNull();
    expect(gs.debugForceCardKeepTarget).toBeNull();

    const second = playerDrawCard(first.P, first.D, first.Disc, 0, gs);
    expect(second.drawnCard.name).toBe('偷吃龙蛋');
    expect(second.needsDecision).toBe(true);
    expect(second.kept).toBeFalsy();
  });

  it('烤盲鱼标记会让玩家下一次区域牌抉择只暴露编号', () => {
    const players = [
      makePlayer({ blindNextZoneDecision: true }),
    ];
    const zoneCard = {
      id: 'blind-next-zone',
      key: 'A1',
      letter: 'A',
      number: 1,
      name: '偷吃龙蛋',
      type: 'selfHealAdjDamageHP',
      val: 3,
      adjVal: 2,
      isZone: true,
    };
    const gs = makeGs({ players, deck: [zoneCard], log: [] });

    const result = playerDrawCard(players, [zoneCard], [], 0, gs);

    expect(result.needsDecision).toBe(true);
    expect(result.blindZoneIdentity).toBe(true);
    expect(result.drawnCard).toMatchObject({ key: 'A1', blindZoneIdentity: true });
    expect(result.P[0].blindNextZoneDecision).toBe(true);
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

  it('回合开始黑山羊幼仔造成损失时，撒托古亚黏液可打断到平分选择', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', hp: 8, san: 8, hand: [createBlackGoatYoungCard(), createTsathogguaSlimeCard()] }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.phase).toBe('TSG_SLIME_BALANCE');
    expect(result.abilityData).toMatchObject({
      type: 'tsgSlimeBalance',
      targetIdx: 1,
      afterHp: 7,
      afterSan: 7,
    });
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

  it('撒托古亚信徒在回合结束后获得赐福黏液', () => {
    const players = [
      makePlayer({ name: '你', godName: 'TSG', godLevel: 2 }),
      makePlayer({ name: '艾伦' }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.players[0].hand.filter(c => c.isTsathogguaSlime)).toHaveLength(2);
    expect(result.log.some(line => line.includes('获得2张撒托古亚的赐福黏液'))).toBe(true);
    expect(result._tsgSlimeGrantEvents).toHaveLength(1);
    expect(result._tsgSlimeGrantEvents[0]).toMatchObject({ ownerIdx: 0, count: 2 });
    expect(result._tsgSlimeGrantEvents[0].playersBefore[0].hand).toHaveLength(0);
    expect(result._tsgSlimeGrantEvents[0].playersAfter[0].hand.filter(c => c.isTsathogguaSlime)).toHaveLength(2);
    expect(result._preTurnPlayers[0].hand.filter(c => c.isTsathogguaSlime)).toHaveLength(2);
  });

  it('撒托古亚黏液获得动画排在下一回合开始前并在动画后刷新手牌', () => {
    const players = [
      makePlayer({ name: '你', godName: 'TSG', godLevel: 1 }),
      makePlayer({ name: '艾伦' }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);
    const queue = buildTsathogguaSlimeGrantQueue(result);

    expect(queue.map(step => step.type)).toEqual(['VISUAL_LOCK', 'CARD_TRANSFER', 'STATE_PATCH', 'TURN_BOUNDARY_PAUSE']);
    expect(queue[1]).toMatchObject({
      fromPid: 0,
      toPid: 0,
      sourceAnchor: 'playerArea',
      effect: 'tsgSlime',
      count: 1,
      durationMs: 950,
    });
    expect(queue[2].players[0].hand.filter(c => c.isTsathogguaSlime)).toHaveLength(1);
    expect(queue[3]).toMatchObject({ durationMs: 180 });
  });

  it('撒托古亚信徒摸牌阶段消耗黏液并额外摸牌', () => {
    const slime = createTsathogguaSlimeCard();
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', godName: 'TSG', godLevel: 1, hand: [slime] }),
    ];
    const deck = [
      { id: 'extra', key: 'A1', letter: 'A', number: 1, name: '额外牌', type: 'selfHealHP', val: 1, isZone: true, polarity: 'positive' },
      { id: 'normal', key: 'A2', letter: 'A', number: 2, name: '正常牌', type: 'selfHealHP', val: 1, isZone: true, polarity: 'positive' },
    ];
    const gs = makeGs({ players, deck, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.players[1].hand.some(c => c.isTsathogguaSlime)).toBe(false);
    expect(result.players[1].hand.map(c => c.name)).toEqual(expect.arrayContaining(['额外牌', '正常牌']));
    expect(result.log.some(line => line.includes('额外摸1张牌'))).toBe(true);
  });

  it('传授半物质化的额外回合延迟到被指定角色下个回合后', () => {
    const players = makeStandardPlayers(4);
    const scheduled = makeGs({
      players,
      currentTurn: 0,
      turn: 3,
      pendingExtraTurnOwner: 3,
      pendingExtraTurnAfterPlayer: 1,
      pendingExtraTurnAfterMinTurn: 4,
      log: [],
      deck: [],
    });

    const beforeTargetTurn = startNextTurn(scheduled);
    expect(beforeTargetTurn.currentTurn).toBe(1);
    expect(beforeTargetTurn.pendingExtraTurnOwner).toBe(3);
    expect(beforeTargetTurn.pendingExtraTurnAfterPlayer).toBe(1);

    const afterTargetTurn = startNextTurn({ ...beforeTargetTurn, currentTurn: 1, turn: 4, phase: 'ACTION' });
    expect(afterTargetTurn.currentTurn).toBe(3);
    expect(afterTargetTurn.pendingExtraTurnOwner).toBeNull();
    expect(afterTargetTurn.pendingExtraTurnAfterPlayer).toBeNull();
    expect(afterTargetTurn._extraTurnResumeFrom).toBe(1);

    const afterExtraTurn = startNextTurn({ ...afterTargetTurn, currentTurn: 3, turn: 5, phase: 'ACTION' });
    expect(afterExtraTurn.currentTurn).toBe(2);
    expect(afterExtraTurn._extraTurnResumeFrom).toBeNull();
  });
});
