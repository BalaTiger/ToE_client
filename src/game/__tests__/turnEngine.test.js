import { describe, expect, it } from 'vitest';
import { makeInspectionMeta, ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { aiDrawAndApply, applySanLossToPlayerWithInspection, checkWin, playerDrawCard, resolveGodEncounterForAI, startNextTurn } from '../turnEngine';
import { buildTsathogguaSlimeGrantQueue } from '../turnAnimState';
import { makeGodCard, makeGs, makePlayer, makeStandardPlayers } from './factory';
import { createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../../constants/card';
import { applyInspectionForSanLoss } from '../effectEngine';

describe('checkWin death handling', () => {
  it('单人模式下本地玩家死亡会立即失败', () => {
    const players = makeStandardPlayers(3);
    players[0].isDead = true;
    players[0].hp = 0;

    expect(checkWin(players, false)).toMatchObject({
      winner: 'LOSE',
    });
  });

  it('联机模式下本地玩家死亡不会直接结束对局', () => {
    const players = makeStandardPlayers(3);
    players[0].isDead = true;
    players[0].hp = 0;

    expect(checkWin(players, true)).toBeNull();
  });
  it('unrevealed cultist loses SAN on god encounter and stays unrevealed', () => {
    const players = [makePlayer({ role: ROLE_CULTIST, san: 10, godEncounters: 0, roleRevealed: false })];
    const godCard = makeGodCard('NYA');
    const gs = makeGs({ players, deck: [godCard], log: [] });

    const result = playerDrawCard(players, [godCard], [], 0, gs);

    expect(result.P[0].san).toBe(9);
    expect(result.P[0].roleRevealed).toBe(false);
    expect(result.effectMsgs.some(msg => msg.includes('失去1SAN'))).toBe(true);
    expect(result.statePatch._statEvents).toMatchObject([
      { type: 'SAN_LOSS', target: 0, from: { san: 10 }, to: { san: 9 }, reason: '邪神遭遇', seq: 1 },
    ]);
  });
});

describe('turnEngine stat events', () => {
  it('SAN 损失降至 0 时不排入检定事件', () => {
    const players = [makePlayer({ name: '你', hp: 10, san: 2 })];
    const inspectionCard = { name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' };
    const gs = makeGs({
      players,
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      _inspectionSeq: 3,
      _statEventSeq: 8,
    });

    const result = applySanLossToPlayerWithInspection(
      0,
      2,
      0,
      players,
      [],
      [],
      ['你 失去 2 SAN'],
      makeInspectionMeta(gs),
      '蛊惑',
    );

    expect(result.P[0].san).toBe(0);
    expect(result.P[0].hp).toBe(10);
    expect(result.L).toEqual(['你 失去 2 SAN']);
    expect(result.inspectionMeta._inspectionSeq).toBe(3);
    expect(result.inspectionMeta._inspectionEvents || []).toEqual([]);
  });

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

  it('联机玩家正常摸牌状态携带摸牌前玩家快照', () => {
    const players = makeStandardPlayers(2);
    const normalCard = {
      id: 'mp-normal-draw',
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
      currentTurn: 0,
      _turnKey: 7,
      deck: [normalCard],
      _isMP: true,
      log: [],
    });

    const result = startNextTurn(gs);

    expect(result.phase).toBe('DRAW_REVEAL');
    expect(result._turnKey).toBe(8);
    expect(result.drawReveal.card).toMatchObject({ id: 'mp-normal-draw', name: '偷吃龙蛋' });
    expect(result._playersBeforeThisDraw).toHaveLength(2);
    expect(result._playersBeforeThisDraw[1]).toMatchObject({ hp: 10, san: 10 });
  });

  it('联机状态即使残留 Debug 强制摸牌字段，也不会替换牌堆顶', () => {
    const players = makeStandardPlayers(2);
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
    const forcedCard = {
      id: 'force-rose',
      key: 'D3',
      letter: 'D',
      number: 3,
      name: '玫瑰倒刺',
      type: 'roseThornGiftAllHand',
      isZone: true,
    };
    const gs = makeGs({
      players,
      deck: [normalCard],
      currentTurn: -1,
      _isMP: true,
      debugForceCard: forcedCard,
      debugForceCardTarget: 'player',
      debugForceCardKeep: 'keep',
    });

    const result = startNextTurn(gs);

    expect(result.drawReveal.card.name).toBe('偷吃龙蛋');
    expect(result.debugForceCard).toBeNull();
    expect(result.debugForceCardTarget).toBeNull();
  });

  it('联机状态即使残留 Debug 强制收入字段，也不会跳过玩家抉择', () => {
    const players = makeStandardPlayers(2);
    const roseThorn = {
      id: 'rose-mp-stale-debug',
      key: 'D3',
      letter: 'D',
      number: 3,
      name: '玫瑰倒刺',
      type: 'roseThornGiftAllHand',
      isZone: true,
    };
    const gs = makeGs({
      players,
      _isMP: true,
      debugForceCardKeepPending: 'keep',
      debugForceCardKeepTarget: 0,
    });

    const result = playerDrawCard(players, [roseThorn], [], 0, gs);

    expect(result.needsDecision).toBe(true);
    expect(result.kept).toBeFalsy();
    expect(result.P[0].hand).not.toContainEqual(expect.objectContaining({ name: '玫瑰倒刺' }));
    expect(gs.debugForceCardKeepPending).toBeNull();
    expect(gs.debugForceCardKeepTarget).toBeNull();
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

  it('AI 邪神遭遇可延后到遭遇扣减后、检定翻牌前', () => {
    const players = [
      makePlayer({ name: '你', role: ROLE_CULTIST }),
      makePlayer({
        name: '贝拉',
        role: ROLE_TREASURE,
        hp: 10,
        san: 7,
        godEncounters: 1,
        godName: 'NYA',
        godLevel: 1,
        godZone: [makeGodCard('NYA')],
      }),
    ];
    const godCard = makeGodCard('VRI');
    const inspectionCard = { name: '失眠', effect: 'disableRest', value: 1, type: 'negative' };
    const gs = makeGs({
      players,
      currentTurn: 1,
      deck: [godCard],
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      log: [],
      deferAiGodChoice: true,
    });

    const result = aiDrawAndApply(1, players, [godCard], [], gs);

    expect(result.pendingAiGodChoice).toMatchObject({ playerIndex: 1, godCard });
    expect(result.P[1].san).toBe(5);
    expect(result.P[1].godName).toBe('NYA');
    expect(result.effectMsgs.some(msg => msg.includes('改信新神'))).toBe(false);
    expect(result.statePatch._inspectionEvents).toHaveLength(0);
    expect(result.statePatch._pendingAiGodChoice).toMatchObject({
      playerIndex: 1,
      godCard,
      pendingEncounterInspection: true,
    });

    const inspected = applyInspectionForSanLoss(
      1,
      result.P[1].san,
      1,
      result.P,
      result.D,
      result.Disc,
      result.effectMsgs,
      { ...gs, players: result.P, deck: result.D, discard: result.Disc, log: result.effectMsgs, ...result.statePatch },
    );
    expect(inspected.inspectionMeta._inspectionEvents).toHaveLength(1);

    const afterDecision = resolveGodEncounterForAI(
      1,
      godCard,
      inspected.P,
      inspected.D,
      inspected.Disc,
      {
        ...gs,
        players: inspected.P,
        deck: inspected.D,
        discard: inspected.Disc,
        log: inspected.log,
        ...result.statePatch,
        ...inspected.inspectionMeta,
      },
      false,
    );

    expect(afterDecision.msgs.some(msg => msg.includes('改信新神'))).toBe(true);
    expect(afterDecision.P[1].san).toBe(4);
    expect(afterDecision.P[1].godName).toBe('VRI');
    expect(afterDecision.P[1].godEncounters).toBe(2);
    expect(afterDecision.inspectionMeta._inspectionEvents).toHaveLength(2);
    expect(afterDecision.inspectionMeta._inspectionEvents.at(-1).seq).toBe(2);
    expect(afterDecision.inspectionMeta._inspectionEvents.at(-1).beforePlayers[1]).toMatchObject({
      san: 4,
      godEncounters: 2,
      godName: 'VRI',
      godLevel: 1,
    });
    expect(afterDecision.inspectionMeta._inspectionEvents.at(-1).beforePlayers[1].godZone[0].godKey).toBe('VRI');
    expect(afterDecision.inspectionMeta._inspectionEvents[0].seq).toBe(1);
    expect(afterDecision.inspectionMeta._inspectionEvents[0].beforePlayers[1]).toMatchObject({
      san: 5,
      godEncounters: 2,
      godName: 'NYA',
      godLevel: 1,
    });
  });

  it('AI 已拥有高等级邪神之力时会降低改信权重', () => {
    const oldGod = makeGodCard('CTH');
    const drawnGod = makeGodCard('ZHU');
    const players = [
      makePlayer({ name: '你', role: ROLE_CULTIST }),
      makePlayer({
        name: '贝拉',
        role: ROLE_TREASURE,
        san: 8,
        godName: 'CTH',
        godLevel: 3,
        godZone: [oldGod, makeGodCard('CTH'), makeGodCard('CTH')],
      }),
    ];
    const gs = makeGs({ players, currentTurn: 1, log: [] });

    const result = resolveGodEncounterForAI(1, drawnGod, players, [], [], gs, false);

    expect(result.P[1]).toMatchObject({ godName: 'CTH', godLevel: 3, san: 8 });
    expect(result.msgs.some(msg => msg.includes('改信新神'))).toBe(false);
  });

  it('AI 追猎者不会主动信仰阿波菲斯', () => {
    const apo = makeGodCard('APO');
    const players = [
      makePlayer({ name: '你', role: ROLE_CULTIST }),
      makePlayer({ name: '追猎者', role: ROLE_HUNTER, san: 8 }),
      makePlayer({ name: '邪祀者', role: ROLE_CULTIST }),
    ];
    const gs = makeGs({ players, currentTurn: 1, log: [] });

    const result = resolveGodEncounterForAI(1, apo, players, [], [], gs, false);

    expect(result.P[1].godName).toBeNull();
    expect(result.msgs.some(msg => msg.includes('信仰了'))).toBe(false);
  });

  it('AI 在全员存活时会降低伏行之混沌的信仰权重', () => {
    const nya = makeGodCard('NYA');
    const players = [
      makePlayer({ name: '你', role: ROLE_CULTIST }),
      makePlayer({ name: '寻宝者', role: ROLE_TREASURE, san: 8 }),
      makePlayer({ name: '追猎者', role: ROLE_HUNTER }),
    ];
    const gs = makeGs({ players, currentTurn: 1, log: [] });

    const result = resolveGodEncounterForAI(1, nya, players, [], [], gs, false);

    expect(result.P[1].godName).toBeNull();
    expect(result.msgs.some(msg => msg.includes('信仰了'))).toBe(false);
  });

  it('AI 在已有死亡角色时会提高伏行之混沌的信仰权重', () => {
    const nya = makeGodCard('NYA');
    const players = [
      makePlayer({ name: '你', role: ROLE_CULTIST }),
      makePlayer({ name: '寻宝者', role: ROLE_TREASURE, san: 8 }),
      makePlayer({ name: '阵亡寻宝者', role: ROLE_TREASURE, isDead: true }),
    ];
    const gs = makeGs({ players, currentTurn: 1, log: [] });

    const result = resolveGodEncounterForAI(1, nya, players, [], [], gs, false);

    expect(result.P[1]).toMatchObject({ godName: 'NYA', godLevel: 1 });
    expect(result.msgs.some(msg => msg.includes('信仰了'))).toBe(true);
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

  it('黑山羊幼仔使邪祀者 HP/SAN 同时归零时，SAN 归零胜负优先于死亡胜负', () => {
    const players = [
      makePlayer({ name: '追猎者', role: ROLE_HUNTER }),
      makePlayer({ name: '邪祀者', role: ROLE_CULTIST, hp: 1, san: 1, hand: [createBlackGoatYoungCard()] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      _isMP: true,
      log: [],
      inspectionDeck: [{ name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' }],
      inspectionDiscard: [],
    });

    const result = startNextTurn(gs);

    expect(result.players[1]).toMatchObject({ hp: 0, san: 0, isDead: false });
    expect(result.gameOver?.winner).toBe(ROLE_CULTIST);
    expect(result._inspectionEvents || []).toEqual([]);
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

  it('同为其他被动时，中毒先于两人一绳未断裂回复结算', () => {
    const players = [
      makePlayer({ name: '你', hp: 4, damageLink: { active: true, partner: 1, expiryOwner: 1 } }),
      makePlayer({ name: '艾伦', hp: 5, poisonStacks: 2, damageLink: { active: true, partner: 0, expiryOwner: 1 } }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.players[1].hp).toBe(7);
    expect(result.players[1].poisonStacks).toBe(1);
    const poisonLogIndex = result.log.findIndex(line => line.includes('【中毒】'));
    const linkLogIndex = result.log.findIndex(line => line.includes('【两人一绳】'));
    expect(poisonLogIndex).toBeGreaterThan(-1);
    expect(linkLogIndex).toBeGreaterThan(poisonLogIndex);
    expect(result._statEvents).toMatchObject([
      { type: 'HP_LOSS', target: 1, from: { hp: 5 }, to: { hp: 3 }, reason: '中毒', seq: 1 },
      { type: 'HP_GAIN', target: 0, from: { hp: 4 }, to: { hp: 8 }, reason: '两人一绳', seq: 2 },
      { type: 'HP_GAIN', target: 1, from: { hp: 3 }, to: { hp: 7 }, reason: '两人一绳', seq: 2 },
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

  it('火把状态会阻止撒托古亚回合结束获得黏液并记录护罩事件', () => {
    const players = [
      makePlayer({ name: '你', godName: 'TSG', godLevel: 2, godPowerImmuneThisTurn: true, godPowerImmuneTurnOwner: 0 }),
      makePlayer({ name: '艾伦' }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.players[0].hand.some(c => c.isTsathogguaSlime)).toBe(false);
    expect(result.log).toContain('【引燃火把】你 本回合不受邪神之力影响');
    expect(result._tsgSlimeGrantEvents || []).toHaveLength(0);
    expect(result._visualEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'godPowerBlocked', playerIdx: 0 }),
    ]));
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

  it('火把状态会阻止撒托古亚回合开始消耗黏液', () => {
    const slime = createTsathogguaSlimeCard();
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', godName: 'TSG', godLevel: 1, hand: [slime], godPowerImmuneThisTurn: true, godPowerImmuneTurnOwner: 1 }),
    ];
    const deck = [
      { id: 'normal', key: 'A2', letter: 'A', number: 2, name: '正常牌', type: 'selfHealHP', val: 1, isZone: true, polarity: 'positive' },
    ];
    const gs = makeGs({ players, deck, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.players[1].hand.some(c => c.isTsathogguaSlime)).toBe(true);
    expect(result.players[1].hand.map(c => c.name)).toEqual(expect.arrayContaining(['正常牌']));
    expect(result.log).toContain('【引燃火把】艾伦 本回合不受邪神之力影响');
    expect(result.log.some(line => line.includes('额外摸1张牌'))).toBe(false);
  });

  it('当前执行回合结束时清除其他角色身上的本回合临时效果', () => {
    const players = makeStandardPlayers(3);
    players[1].damageBonus = 1;
    players[1].damageBonusTurnOwner = 0;
    players[1].godPowerImmuneThisTurn = true;
    players[1].godPowerImmuneTurnOwner = 0;
    const gs = makeGs({ players, currentTurn: 0, turn: 8, deck: [] });

    const result = startNextTurn(gs);

    expect(result.players[1].damageBonus).toBeUndefined();
    expect(result.players[1].damageBonusTurnOwner).toBeUndefined();
    expect(result.players[1].godPowerImmuneThisTurn).toBeUndefined();
    expect(result.players[1].godPowerImmuneTurnOwner).toBeUndefined();
  });

  it('狂化被蛊惑给其他角色时不会保留到该角色下一回合', () => {
    const players = makeStandardPlayers(2);
    players[1].damageBonus = 1;
    players[1].damageBonusTurnOwner = 0;
    const gs = makeGs({ players, currentTurn: 0, turn: 8, deck: [] });

    const result = startNextTurn(gs);

    expect(result.currentTurn).toBe(1);
    expect(result.players[1].damageBonus).toBeUndefined();
    expect(result.players[1].damageBonusTurnOwner).toBeUndefined();
  });

  it('进入下一回合时不会继承上一回合已播放的数值 visualEvents', () => {
    const players = makeStandardPlayers(3);
    players[2].skipNextDraw = true;
    players[2].skipNextDrawReason = '测试';
    const staleStatEvent = {
      type: 'statEvents',
      statEvents: [
        { type: 'HP_GAIN', target: 1, from: { hp: 7 }, to: { hp: 8 }, seq: 1 },
      ],
      msgs: ['全体存活角色回复 1 HP'],
    };
    const gs = makeGs({
      players,
      currentTurn: 1,
      turn: 4,
      deck: [],
      _visualEvents: [staleStatEvent],
    });

    const result = startNextTurn(gs);

    expect(result._visualEvents || []).toEqual([]);
  });

  it('蛊惑强制改信烛九阴后立即点亮牌堆', () => {
    const deck = [
      { id: 'deck-0', name: '第一张' },
      { id: 'deck-1', name: '第二张' },
      { id: 'deck-2', name: '第三张' },
      { id: 'deck-3', name: '第四张' },
    ];
    const players = [
      makePlayer({ name: '蛊惑者' }),
      makePlayer({ name: '目标', godName: 'NYA', godLevel: 1, godZone: [makeGodCard('NYA')] }),
    ];
    const gs = makeGs({ players, deck, currentTurn: 0, zhuLight: null });

    const result = resolveGodEncounterForAI(1, makeGodCard('ZHU'), players, deck, [], gs, true);

    expect(result.P[1]).toMatchObject({ godName: 'ZHU', godLevel: 1 });
    expect(result.statePatch.zhuLight).toMatchObject({
      ownerIdx: 1,
      level: 1,
      cardIds: ['deck-2'],
    });
  });

  it('蛊惑强制改信阿波菲斯后立即进入黑夜状态', () => {
    const players = [
      makePlayer({ name: '蛊惑者' }),
      makePlayer({ name: '目标', godName: 'NYA', godLevel: 1, godZone: [makeGodCard('NYA')] }),
    ];
    const gs = makeGs({ players, currentTurn: 0, apophisNight: null });

    const result = resolveGodEncounterForAI(1, makeGodCard('APO'), players, [], [], gs, true);

    expect(result.P[1]).toMatchObject({ godName: 'APO', godLevel: 1 });
    expect(result.statePatch.apophisNight).toMatchObject({ active: true, threshold: 2, count: 0, limit: 12 });
    expect(result.msgs.some(line => line.includes('黑夜降临'))).toBe(true);
  });

  it('火把状态下强制改信阿波菲斯不会进入黑夜并记录免疫日志', () => {
    const players = [
      makePlayer({ name: '蛊惑者' }),
      makePlayer({ name: '目标', godName: 'NYA', godLevel: 1, godZone: [makeGodCard('NYA')], godPowerImmuneThisTurn: true, godPowerImmuneTurnOwner: 1 }),
    ];
    const gs = makeGs({ players, currentTurn: 0, apophisNight: null });

    const result = resolveGodEncounterForAI(1, makeGodCard('APO'), players, [], [], gs, true);

    expect(result.P[1]).toMatchObject({ godName: 'APO', godLevel: 1 });
    expect(result.statePatch.apophisNight).toBeUndefined();
    expect(result.msgs).toContain('【引燃火把】目标 本回合不受邪神之力影响');
    expect(result.statePatch._visualEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'godPowerBlocked', playerIdx: 1 }),
    ]));
  });

  it('蛊惑强制改信黑山羊后立即发放黑山羊幼仔', () => {
    const players = [
      makePlayer({ name: '蛊惑者' }),
      makePlayer({ name: '目标', godName: 'NYA', godLevel: 1, godZone: [makeGodCard('NYA')] }),
      makePlayer({ name: '旁观者' }),
    ];
    const gs = makeGs({ players, currentTurn: 0 });

    const result = resolveGodEncounterForAI(1, makeGodCard('SHU'), players, [], [], gs, true);

    expect(result.P[1]).toMatchObject({ godName: 'SHU', godLevel: 1 });
    expect(result.P.some(player => player.hand.some(card => card.isBlackGoatYoung))).toBe(true);
    expect(result.msgs.some(line => line.includes('黑暗子嗣'))).toBe(true);
  });

  it('森之领主发动者有火把免疫时不触发黑暗子嗣', () => {
    const players = [
      makePlayer({ name: '蛊惑者', isDead: true }),
      makePlayer({ name: '目标', role: ROLE_HUNTER, godPowerImmuneThisTurn: true, godPowerImmuneTurnOwner: 1 }),
      makePlayer({ name: '旁观者' }),
    ];
    const gs = makeGs({ players, currentTurn: 1 });

    const result = resolveGodEncounterForAI(1, makeGodCard('SHU'), players, [], [], gs, true);

    expect(result.P[1]).toMatchObject({ godName: 'SHU', godLevel: 1 });
    expect(result.P[1].hand.some(card => card.isBlackGoatYoung)).toBe(false);
    expect(result.P[2].hand.some(card => card.isBlackGoatYoung)).toBe(false);
    expect(result.msgs.some(line => line.includes('黑山羊幼仔'))).toBe(false);
    expect(result.msgs).toContain('【引燃火把】目标 本回合不受邪神之力影响');
  });

  it('蛊惑邪神牌给无信仰目标时会强制信仰而不是按AI意愿放弃', () => {
    const players = [
      makePlayer({ name: '蛊惑者' }),
      makePlayer({ name: '目标', godName: null, godLevel: 0, godZone: [] }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = resolveGodEncounterForAI(1, makeGodCard('SHU'), players, [], [], gs, true);

    expect(result.P[1]).toMatchObject({ godName: 'SHU', godLevel: 1 });
    expect(result.P[1].godZone).toHaveLength(1);
    expect(result.msgs.some(line => line.includes('信仰了 森之领主'))).toBe(true);
    expect(result.msgs.some(line => line.includes('放弃了邪神的馈赠'))).toBe(false);
  });

  it('蛊惑同种邪神牌时会像自己摸到一样升级邪神之力', () => {
    const vri = makeGodCard('VRI');
    const giftedVri = makeGodCard('VRI');
    const players = [
      makePlayer({ name: '蛊惑者', role: ROLE_CULTIST }),
      makePlayer({ name: '目标', godName: 'VRI', godLevel: 1, godZone: [vri] }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = resolveGodEncounterForAI(1, giftedVri, players, [], [], gs, true);

    expect(result.P[1]).toMatchObject({ godName: 'VRI', godLevel: 2 });
    expect(result.P[1].godZone).toHaveLength(2);
    expect(result.msgs.some(line => line.includes('改信新神'))).toBe(false);
    expect(result.msgs.some(line => line.includes('邪神之力升至Lv.2'))).toBe(true);
  });

  it('不会清除尚未到期的其他执行回合临时效果', () => {
    const players = makeStandardPlayers(3);
    players[1].damageBonus = 1;
    players[1].damageBonusTurnOwner = 2;
    const gs = makeGs({ players, currentTurn: 0, turn: 8, deck: [] });

    const result = startNextTurn(gs);

    expect(result.players[1].damageBonus).toBe(1);
    expect(result.players[1].damageBonusTurnOwner).toBe(2);
  });

  it('reveals an unrevealed cultist when they keep an encountered god card in hand', () => {
    const oldGod = makeGodCard('CTH');
    const drawnGod = makeGodCard('ZHU');
    const players = [
      makePlayer({ name: 'Player', role: ROLE_TREASURE }),
      makePlayer({
        name: 'Cultist',
        role: ROLE_CULTIST,
        roleRevealed: false,
        revealHand: false,
        san: 8,
        godEncounters: 2,
        godName: 'CTH',
        godLevel: 3,
        godZone: [oldGod, makeGodCard('CTH'), makeGodCard('CTH')],
      }),
    ];
    const gs = makeGs({ players, currentTurn: 1, log: [] });

    const result = resolveGodEncounterForAI(1, drawnGod, players, [], [], gs, false);

    expect(result.P[1].hand).toContainEqual(expect.objectContaining({ id: drawnGod.id }));
    expect(result.P[1]).toMatchObject({
      roleRevealed: true,
      revealHand: true,
      godName: 'CTH',
      godLevel: 3,
    });
    expect(result.msgs.some(msg => msg.includes('邪祀者') && msg.includes('收入手牌'))).toBe(true);
  });
});
