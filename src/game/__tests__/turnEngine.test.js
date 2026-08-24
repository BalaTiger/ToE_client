import { describe, expect, it } from 'vitest';
import { makeInspectionMeta, ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { aiDrawAndApply, aiHandleGodCard, applySanLossToPlayerWithInspection, checkWin, continueTurnStartAfterDamageReaction, createFaithSettlementGodStatusEvent, playerDrawCard, resolveGodEncounterForAI, startNextTurn } from '../turnEngine';
import { buildTsathogguaSlimeGrantQueue, buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { makeGodCard, makeGs, makePlayer, makeStandardPlayers, makeZoneCard } from './factory';
import { createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../../constants/card';
import { applyInspectionForSanLoss } from '../effectEngine';
import { makeProliferatingZState } from '../proliferatingZ';
import { addDamageLink, getAllDamageLinks } from '../damageLinks';
import { VISUAL_EVENT } from '../visualEvents';

const inspectionEventsOf = state => (state?._visualEvents || [])
  .filter(event => event?.type === VISUAL_EVENT.INSPECTION);
const slimeGrantEventsOf = state => (state?._visualEvents || [])
  .filter(event => event?.type === VISUAL_EVENT.TSG_SLIME_GRANT);

describe('createFaithSettlementGodStatusEvent', () => {
  it('uses explicit player snapshots for worship and upgrade without log inference', () => {
    const before = [makePlayer({ name: '联机玩家', godName: null, godLevel: 0 })];
    const worshipped = [makePlayer({ name: '联机玩家', godName: 'APO', godLevel: 1 })];
    const upgraded = [makePlayer({ name: '联机玩家', godName: 'APO', godLevel: 2 })];
    const worship = createFaithSettlementGodStatusEvent({
      playerIdx: 0,
      playersBeforeSettlement: before,
      playersAfterSettlement: worshipped,
      faithEstablished: { playersBefore: before, playersAfter: worshipped },
      msgs: ['这是一条与信仰无关的日志'],
    });
    const upgrade = createFaithSettlementGodStatusEvent({
      playerIdx: 0,
      playersBeforeSettlement: worshipped,
      playersAfterSettlement: upgraded,
      faithEstablished: { playersBefore: worshipped, playersAfter: upgraded },
      msgs: ['邪神之力升至Lv.2'],
    });

    expect(worship).toMatchObject({ type: 'godStatusChanged', playerIdx: 0, godKey: 'APO', godLevel: 1, msgs: [] });
    expect(upgrade).toMatchObject({ type: 'godStatusChanged', playerIdx: 0, godKey: 'APO', godLevel: 2 });
  });
});

describe('checkWin death handling', () => {
  it('dead cultist cannot win from their own zero SAN but can win from another living zero-SAN target', () => {
    const deadCultist = makePlayer({ name: 'cultist', role: ROLE_CULTIST, hp: 0, san: 0, isDead: true });
    const hunter = makePlayer({ name: 'hunter', role: ROLE_HUNTER, hp: 10, san: 5 });

    expect(checkWin([deadCultist, hunter], true)?.winner).toBe(ROLE_HUNTER);

    const livingTarget = makePlayer({ name: 'target', role: ROLE_TREASURE, hp: 10, san: 0 });
    expect(checkWin([deadCultist, hunter, livingTarget], true)?.winner).toBe(ROLE_CULTIST);
  });

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
    expect(result.effectMsgs.some(msg => msg.includes('失去 1 SAN'))).toBe(true);
    expect(result.statePatch._statEvents).toMatchObject([
      { type: 'SAN_LOSS', target: 0, from: { san: 10 }, to: { san: 9 }, reason: '邪神遭遇', seq: 1 },
    ]);
  });

  it('邪神遭遇扣 SAN 后先等待黏液结算，再进入邪神牌决策', () => {
    const godCard = makeGodCard('VRI');
    const slime = createTsathogguaSlimeCard();
    const players = [makePlayer({
      role: ROLE_TREASURE,
      hp: 10,
      san: 3,
      godEncounters: 1,
      godName: 'NYA',
      godLevel: 1,
      godZone: [makeGodCard('NYA')],
      hand: [slime],
    })];
    const gs = makeGs({ players, deck: [godCard], log: [], currentTurn: 0 });

    const result = playerDrawCard(players, [godCard], [], 0, gs);

    expect(result.P[0].san).toBe(1);
    expect(result.needGodChoice).not.toBe(true);
    expect(result.statePatch.abilityData).toMatchObject({
      type: 'tsgSlimeBalance',
      targetIdx: 0,
      pendingGodChoice: { godCard, drawerIdx: 0, godEncounterCost: 0 },
      pendingSanInspection: { targetIndex: 0, startIndex: 0, reason: '邪神遭遇' },
    });
    expect(result.P[0].godName).toBe('NYA');
  });

  it('邪神遭遇后的乱抓先进入虚化决策，并把邪神选择挂入独立续接栈', () => {
    const godCard = makeGodCard('NYA');
    const scratch = { name: '乱抓', effect: 'adjacentDamageHP', value: 2, type: 'negative' };
    const players = [
      makePlayer({ name: '你', san: 6 }),
      makePlayer({ name: '艾伦', hp: 10, etherealizeStacks: 1 }),
      makePlayer({ name: '黛安娜', hp: 10 }),
    ];
    const gs = makeGs({
      players,
      deck: [godCard],
      currentTurn: 2,
      inspectionDeck: [scratch],
      inspectionDiscard: [],
    });

    const next = startNextTurn(gs);

    expect(next.phase).toBe('ETHEREALIZE_DECISION');
    expect(next.abilityData).toMatchObject({
      type: 'etherealizeRedirect',
      targetIdx: 1,
      lostHp: 2,
    });
    expect(next.players[1].hp).toBe(10);
    expect(next.players[2].hp).toBe(10);
    expect(next._decisionContinuations).toEqual([
      expect.objectContaining({
        phase: 'GOD_CHOICE',
        abilityData: expect.objectContaining({ godCard, drawerIdx: 0 }),
      }),
    ]);

    const replay = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: next });
    const godDrawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === godCard.id);
    const encounterSanIdx = replay.queue.findIndex(step => (
      step.type === 'SAN_DAMAGE' &&
      step.statEvents?.some(event => event.reason === '邪神遭遇')
    ));
    const scratchInspectionIdx = replay.queue.findIndex(step => (
      step.type === 'DRAW_CARD' && step.card?.name === '乱抓'
    ));
    expect(godDrawIdx).toBeGreaterThanOrEqual(0);
    expect(encounterSanIdx).toBeGreaterThan(godDrawIdx);
    expect(scratchInspectionIdx).toBeGreaterThan(encounterSanIdx);
    expect(replay.queue.some(step => (
      step.type === 'HP_DAMAGE' &&
      step.statEvents?.some(event => event.reason === '乱抓')
    ))).toBe(false);
  });
});

describe('AI 寻宝者按实际负面分支规避', () => {
  it('秤心仪式在本局从未信仰邪神时直接恢复 SAN，不触发规避', () => {
    const card = makeZoneCard('D1', 0);
    const players = [makePlayer({ name: '卡洛斯', role: ROLE_TREASURE, hp: 10, san: 6, hasBelievedGod: false })];
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.6);
    const result = aiDrawAndApply(0, players, [card], [], makeGs({ players, deck: [card], debugForceCardKeepPending: 'keep', debugForceCardKeepTarget: 0 }));

    expect(result.P[0]).toMatchObject({ hp: 10, san: 8, roleRevealed: false });
    expect(result.effectMsgs.some(line => line.includes('规避负面效果'))).toBe(false);
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it('霉变食物掷出双数时直接治疗，不掷规避骰', () => {
    const card = { id: 'moldy', key: 'A1', name: '霉变食物', type: 'moldyFood', isZone: true, dodgeable: true };
    const players = [makePlayer({ name: '卡洛斯', role: ROLE_TREASURE, hp: 8 })];
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2); // d1 = 2
    const result = aiDrawAndApply(0, players, [card], [], makeGs({ players, deck: [card], debugForceCardKeepPending: 'keep', debugForceCardKeepTarget: 0 }));

    expect(result.P[0].hp).toBe(10);
    expect(result.P[0].roleRevealed).toBeFalsy();
    expect(result.effectMsgs.some(line => line.includes('成功规避负面效果'))).toBe(false);
    expect(randomSpy).toHaveBeenCalledTimes(1);
    randomSpy.mockRestore();
  });

  it('白化生物确认无火牌后才记录成功规避', () => {
    const card = { id: 'albino', key: 'D3', letter: 'D', number: 3, name: '白化生物', type: 'albinoCreature', isZone: true, dodgeable: true };
    const players = [makePlayer({ name: '卡洛斯', role: ROLE_TREASURE, hp: 10, san: 10, hand: [] })];
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.6); // dodge d1 = 4
    const result = aiDrawAndApply(0, players, [card], [], makeGs({ players, deck: [card], debugForceCardKeepPending: 'keep', debugForceCardKeepTarget: 0 }));

    expect(result.P[0]).toMatchObject({ hp: 10, san: 10 });
    expect(result.effectMsgs.slice(0, 2)).toEqual([
      '【白化生物】卡洛斯 没有带"火"字的手牌，失去 2 HP 和 2 SAN',
      '卡洛斯（寻宝者）摸到 [D3] 白化生物，掷出 4 点，成功规避负面效果！',
    ]);
    randomSpy.mockRestore();
  });
});

describe('地磁反转暗抽', () => {
  it('普通牌堆为空时仍从弃牌堆抽取反转复原，不把它重洗回普通牌堆', () => {
    const players = [makePlayer({ role: ROLE_TREASURE })];
    const restoreCard = {
      id: 'gmr-test',
      name: '反转复原',
      type: 'geomagneticRestore',
      isGeomagneticRestore: true,
    };
    const gs = makeGs({
      players,
      deck: [],
      discard: [restoreCard],
      geomagneticReversalActive: true,
      log: [],
    });

    const result = playerDrawCard(players, [], [restoreCard], 0, gs);

    expect(result.drawnCard).toBe(restoreCard);
    expect(result.D).toEqual([]);
    expect(result.Disc).toEqual([]);
    expect(result.kept).toBe(true);
    expect(result.sourcePile).toBe('discard');
    expect(result.statePatch).toEqual({ geomagneticReversalActive: false });
    expect(result.effectMsgs[0]).toContain('反转复原');
  });

  it('回合开始抽到反转复原时不报牌堆耗尽，并从弃牌堆播放翻牌', () => {
    const restoreCard = {
      id: 'gmr-turn-start',
      name: '反转复原',
      type: 'geomagneticRestore',
      isGeomagneticRestore: true,
    };
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = makeGs({
      players,
      currentTurn: 1,
      deck: [],
      discard: [restoreCard],
      geomagneticReversalActive: true,
      log: [],
    });

    const result = startNextTurn(gs);
    const queue = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: result }).queue;
    const drawStep = queue.find(step => step.type === 'DRAW_CARD');

    expect(result.log).toContain('【反转复原】你 抽到了反转复原，地磁反转效果被消除！');
    expect(result.log).not.toContain('牌堆耗尽！');
    expect(result.geomagneticReversalActive).toBe(false);
    expect(result.drawReveal?.card).toBe(restoreCard);
    expect(drawStep).toMatchObject({ card: restoreCard, targetPid: 0, sourcePile: 'discard' });
  });

  it('AI 抽到反转复原时只翻牌复原，不播放收入手牌', () => {
    const restoreCard = {
      id: 'gmr-ai-turn-start',
      name: '反转复原',
      type: 'geomagneticRestore',
      isGeomagneticRestore: true,
    };
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', isAI: true }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      deck: [],
      discard: [restoreCard],
      geomagneticReversalActive: true,
      log: [],
    });

    const result = startNextTurn(gs);
    const queue = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: result }).queue;
    const drawEvent = result._visualEvents.find(event => event.type === VISUAL_EVENT.DRAW_CARD);

    expect(result.players[1].hand).toEqual([]);
    expect(drawEvent).toMatchObject({ card: restoreCard, sourcePile: 'discard' });
    expect(drawEvent.keptInHand).toBeUndefined();
    expect(queue).toContainEqual(expect.objectContaining({
      type: 'DRAW_CARD',
      card: restoreCard,
      targetPid: 1,
      sourcePile: 'discard',
    }));
    expect(queue.some(step => step.type === 'CARD_TRANSFER' && step.effect === 'draw')).toBe(false);
  });

  it('普通 AI 收入仍在飞牌落地后更新手牌快照', () => {
    const drawnCard = makeZoneCard('A2', 0, { id: 'ai-normal-keep' });
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', isAI: true }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      deck: [drawnCard],
      discard: [],
      log: [],
      debugForceCardKeepPending: 'keep',
      debugForceCardKeepTarget: 1,
    });

    const result = startNextTurn(gs);
    const queue = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: result }).queue;
    const drawEvent = result._visualEvents.find(event => (
      event.type === VISUAL_EVENT.DRAW_CARD && event.card?.id === drawnCard.id
    ));
    const drawIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === drawnCard.id);
    const keepSteps = queue.filter(step => (
      step.type === 'CARD_TRANSFER' &&
      step.effect === 'draw' &&
      step.cards?.[0]?.id === drawnCard.id
    ));
    const keepIdx = queue.indexOf(keepSteps[0]);
    const landingPatch = queue[keepIdx + 1];

    expect(drawEvent).toMatchObject({
      playerIdx: 1,
      card: drawnCard,
      keptInHand: true,
    });
    expect(drawEvent.playersBefore[1].hand).toEqual([]);
    expect(drawEvent.playersAfterKeep[1].hand).toContainEqual(drawnCard);
    expect(keepSteps).toHaveLength(1);
    expect(keepSteps[0].visualEventId).toBe(drawEvent.id);
    expect(queue.filter(step => (
      step.type === 'STATE_PATCH' && step.visualEventId === drawEvent.id
    ))).toHaveLength(1);
    expect(drawIdx).toBeGreaterThanOrEqual(0);
    expect(keepIdx).toBeGreaterThan(drawIdx);
    expect(landingPatch).toMatchObject({
      type: 'STATE_PATCH',
      visualEventId: drawEvent.id,
    });
    expect(landingPatch.players[1].hand.some(card => card.id === drawnCard.id)).toBe(true);
  });

  it('普通 AI 弃牌仍在弃牌动画后更新弃牌堆且不增加手牌', () => {
    const drawnCard = makeZoneCard('A2', 0, { id: 'ai-normal-discard' });
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', isAI: true }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      deck: [drawnCard],
      discard: [],
      log: [],
      debugForceCardKeepPending: 'discard',
      debugForceCardKeepTarget: 1,
    });

    const result = startNextTurn(gs);
    const queue = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: result }).queue;
    const drawIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === drawnCard.id);
    const discardIdx = queue.findIndex(step => step.type === 'DISCARD' && step.card?.id === drawnCard.id);
    const discardPatch = queue[discardIdx + 1];

    expect(result.players[1].hand).toEqual([]);
    expect(drawIdx).toBeGreaterThanOrEqual(0);
    expect(discardIdx).toBeGreaterThan(drawIdx);
    expect(queue.some(step => step.type === 'CARD_TRANSFER' && step.effect === 'draw')).toBe(false);
    expect(discardPatch).toMatchObject({ type: 'STATE_PATCH' });
    expect(discardPatch.players[1].hand).toEqual([]);
    expect(discardPatch.discard.some(card => card.id === drawnCard.id)).toBe(true);
  });

  it('反转复原解除效果后的下一次摸牌显式改回牌堆来源', () => {
    const deckCard = makeZoneCard('A2', 0, { id: 'deck-after-restore' });
    const staleDiscardCard = makeZoneCard('B2', 0, { id: 'visible-discard-card' });
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = makeGs({
      players,
      currentTurn: 0,
      deck: [deckCard],
      discard: [staleDiscardCard],
      // Simulate a state-sync path retaining the old flag even though the
      // unique restore token was already drawn and vanished.
      geomagneticReversalActive: true,
      _drawSourcePile: 'discard',
      _drawnCard: { id: 'old-restore', name: '反转复原', isGeomagneticRestore: true },
      log: [],
    });

    const result = startNextTurn(gs);
    const drawStep = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: result }).queue
      .find(step => step.type === 'DRAW_CARD');

    const drawEvents = result._visualEvents.filter(event => event.type === VISUAL_EVENT.DRAW_CARD);
    expect(drawEvents).toHaveLength(1);
    expect(drawEvents[0]).toMatchObject({ card: deckCard, sourcePile: 'deck' });
    expect(result.geomagneticReversalActive).toBe(false);
    expect(result.discard).toEqual([staleDiscardCard]);
    expect(drawStep).toMatchObject({ card: deckCard, targetPid: 1, sourcePile: 'deck' });
  });

  it('从弃牌堆暗抽到邪神牌时仍触发遭遇邪神，不直接进入手牌', () => {
    const players = [makePlayer({ role: ROLE_TREASURE, san: 10, godEncounters: 0 })];
    const godCard = makeGodCard('NYA');
    const restoreCard = { id: 'gmr-god-test', name: '反转复原', isGeomagneticRestore: true };
    const zoneInDeck = makeZoneCard('A1');
    const gs = makeGs({ players, deck: [zoneInDeck], discard: [godCard, restoreCard], geomagneticReversalActive: true, log: [] });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999);

    const result = playerDrawCard(players, [zoneInDeck], [godCard, restoreCard], 0, gs);

    expect(result.drawnCard).toBe(godCard);
    expect(result.needGodChoice).toBe(true);           // 进入遭遇邪神决策，而非直接收入
    expect(result.P[0].godEncounters).toBe(1);
    expect(result.P[0].san).toBe(9);                   // 非邪祀者扣减 SAN
    expect(result.P[0].hand.some(c => c.id === godCard.id)).toBe(false);
    expect(result.Disc.some(c => c.id === godCard.id)).toBe(false); // 已从弃牌堆取出
    expect(result.D).toEqual([zoneInDeck]);            // 没有从牌堆顶摸牌
    randomSpy.mockRestore();
  });

  it('从弃牌堆随机摸到区域牌时照常翻开并交由玩家决定收弃（与普通摸牌统一）', () => {
    const players = [makePlayer({ role: ROLE_TREASURE, hp: 10, san: 10 })];
    const zoneCard = makeZoneCard('A2'); // 蚂蚁虽小：非强制触发，需玩家决定收/弃
    const restoreCard = { id: 'gmr-zone-test', name: '反转复原', isGeomagneticRestore: true };
    const filler = makeZoneCard('A1');   // 牌堆保留一张，确保走地磁反转暗抽而非空堆重洗
    const gs = makeGs({ players, deck: [filler], discard: [zoneCard, restoreCard], geomagneticReversalActive: true, log: [] });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999);

    const result = playerDrawCard(players, [filler], [zoneCard, restoreCard], 0, gs);

    expect(result.needsDecision).toBe(true);                        // 翻开后交由玩家决定，而非直接进手牌
    expect(result.drawnCard.id).toBe(zoneCard.id);                  // 抽到的是弃牌堆里的牌
    expect(result.P[0].hand.some(c => c.id === zoneCard.id)).toBe(false); // 等待决策期间不在手牌
    expect(result.Disc.some(c => c.id === zoneCard.id)).toBe(false);      // 已从弃牌堆取出
    expect(result.D).toEqual([filler]);                             // 没有从牌堆顶摸牌
    randomSpy.mockRestore();
  });
});

describe('地底天空交换牌堆和弃牌堆', () => {
  it('交换后弃置的牌进入新的弃牌堆，下一抽从新牌堆顶部取牌', () => {
    const players = makeStandardPlayers(3);
    const c3 = makeZoneCard('C3', 2); // 地底天空
    const c4 = makeZoneCard('C4', 0); // 触底反弹
    const c1 = makeZoneCard('C1', 0); // 烤盲鱼
    const c5 = makeZoneCard('A1', 0);

    // 原牌堆：[c3, c1]，原弃牌堆：[c4, c5]
    const deck = [c3, c1];
    const discard = [c4, c5];

    // 玩家抽到 c3 并收入 -> 触发地底天空交换
    const gsKeep = makeGs({ players, deck, discard, log: [], debugForceCardKeepPending: 'keep', debugForceCardKeepTarget: 0 });
    const r1 = playerDrawCard(players, deck, discard, 0, gsKeep);

    expect(r1.P[0].hand.some(c => c.id === c3.id)).toBe(true);
    expect(r1.D.map(c => c.id)).toEqual([c4.id, c5.id]); // 新牌堆 = 原弃牌堆
    expect(r1.Disc.map(c => c.id)).toEqual([c1.id]);     // 新弃牌堆 = 原牌堆（地底天空已收入手牌）

    // 下一抽从新牌堆顶摸到 c4 并选择弃置
    const gsDiscard = makeGs({ players: r1.P, deck: r1.D, discard: r1.Disc, log: [], debugForceCardKeepPending: 'discard', debugForceCardKeepTarget: 0 });
    const r2 = playerDrawCard(r1.P, r1.D, r1.Disc, 0, gsDiscard);

    expect(r2.discardedDrawnCard).toBe(true);
    expect(r2.D.map(c => c.id)).toEqual([c5.id]);        // 新牌堆去掉已抽的 c4
    expect(r2.Disc.map(c => c.id)).toEqual([c1.id, c4.id]); // c4 进入新弃牌堆底部

    // 再下一抽只能摸到新牌堆顶的 c5，不会立即重新摸到 c4
    const gsNext = makeGs({ players: r2.P, deck: r2.D, discard: r2.Disc, log: [], debugForceCardKeepPending: 'keep', debugForceCardKeepTarget: 0 });
    const r3 = playerDrawCard(r2.P, r2.D, r2.Disc, 0, gsNext);

    expect(r3.drawnCard.id).toBe(c5.id);
  });
});

describe('牌堆耗尽时从弃牌堆重洗', () => {
  it('交换后仅剩一张牌时，弃置后下家仍会重洗并摸到同一张牌（单张循环）', () => {
    const players = makeStandardPlayers(3);
    const c4 = makeZoneCard('C4', 0); // 触底反弹

    // 地底天空后，牌堆只剩这张 c4
    const gs = makeGs({ players, deck: [c4], discard: [], log: [] });

    // 玩家 0 摸到 c4 并弃置
    const r1 = playerDrawCard(players, [c4], [], 0, { ...gs, debugForceCardKeepPending: 'discard', debugForceCardKeepTarget: 0 });
    expect(r1.drawnCard.id).toBe(c4.id);
    expect(r1.D).toEqual([]);
    expect(r1.Disc).toEqual([c4]);

    // 玩家 1 摸牌：牌堆为空，必须重洗弃牌堆，此时只有 c4 可摸
    const gs2 = makeGs({ players: r1.P, deck: r1.D, discard: r1.Disc, log: [] });
    const r2 = playerDrawCard(r1.P, r1.D, r1.Disc, 1, gs2);

    expect(r2.drawnCard.id).toBe(c4.id);
    expect(r2.reshuffleLog).toBe('牌堆耗尽，重洗弃牌堆');
    expect(r2.Disc).toEqual([]);
  });

  it('牌堆非空时不会触发重洗日志', () => {
    const players = makeStandardPlayers(3);
    const c4 = makeZoneCard('C4', 0);

    const gs = makeGs({ players, deck: [c4], discard: [], log: [] });
    const r = playerDrawCard(players, [c4], [], 0, { ...gs, debugForceCardKeepPending: 'discard', debugForceCardKeepTarget: 0 });

    expect(r.drawnCard.id).toBe(c4.id);
    expect(r.reshuffleLog).toBe('');
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

  it('首回合玩家摸到邪神牌时先保留摸牌前 SAN，再在回放中播放扣减', () => {
    const godCard = makeGodCard('VRI');
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE, san: 10, godEncounters: 0 }),
      makePlayer({ name: '艾伦' }),
    ];
    const gs = makeGs({
      players,
      deck: [godCard],
      currentTurn: 1,
      log: ['游戏开始。每人获得四张初始手牌。'],
    });

    const result = startNextTurn(gs);
    const queue = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: result }).queue;
    const types = queue.map(step => step.type);

    expect(result.phase).toBe('GOD_CHOICE');
    expect(result.players[0].san).toBe(9);
    expect(result._playersBeforeThisDraw[0].san).toBe(10);
    expect(types.slice(0, 3)).toEqual(['YOUR_TURN', 'DRAW_CARD', 'SAN_DAMAGE']);
    expect(queue.find(step => step.type === 'SAN_DAMAGE')).toMatchObject({ hitIndices: [0] });
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

  it('单机 Debug 强制 AI 摸牌只延后被点亮顶牌，不会清除烛九阴拦截', () => {
    const litCard = makeZoneCard('A1', 0, { id: 'zhu-lit-before-debug-force' });
    const forcedCard = makeZoneCard('C4', 0, {
      id: 'debug-force-ai4',
      name: '半物质化',
      type: 'etherealize',
    });
    const players = [
      makePlayer({ name: '你', godName: 'ZHU', godLevel: 1 }),
      makePlayer({ name: '艾伦' }),
      makePlayer({ name: '贝拉' }),
      makePlayer({ name: '卡洛斯' }),
      makePlayer({ name: '黛安娜' }),
    ];
    const zhuLight = { ownerIdx: 0, level: 1, cardIds: [litCard.id], lightNonce: 1 };
    const beforeDiana = makeGs({
      players,
      deck: [litCard, makeZoneCard('B2'), makeZoneCard('D3')],
      currentTurn: 3,
      phase: 'AI_TURN',
      zhuLight,
      debugForceCard: forcedCard,
      debugForceCardTarget: 'ai4',
      debugForceCardKeep: 'keep',
      log: [],
    });

    const dianaTurn = startNextTurn(beforeDiana, { isDebugMode: true });
    expect(dianaTurn.currentTurn).toBe(4);
    expect(dianaTurn._drawnCard).toBe(forcedCard);
    expect(dianaTurn.deck[0]).toBe(litCard);
    expect(dianaTurn.zhuLight.cardIds).toContain(litCard.id);

    const localTurn = startNextTurn({ ...dianaTurn, currentTurn: 4 });
    expect(localTurn.phase).toBe('ZHU_HIDE_AI_DRAW');
    expect(localTurn.currentTurn).toBe(0);
    expect(localTurn.abilityData).toMatchObject({
      drawerIdx: 0,
      zhuGuard: { card: litCard, ownerIdx: 0 },
    });
  });

  it('回合开始被决策中断后，非信徒回合只维护点亮状态而信徒回合执行一次刷新', () => {
    const deck = [
      makeZoneCard('A1', 0, { id: 'zhu-top' }),
      makeZoneCard('A2', 0, { id: 'zhu-middle' }),
      makeZoneCard('A3', 0, { id: 'zhu-refresh-target' }),
      makeZoneCard('A4', 0, { id: 'zhu-old' }),
    ];
    const players = [
      makePlayer({ name: '你', godName: 'ZHU', godLevel: 1 }),
      makePlayer({ name: '艾伦' }),
    ];
    const zhuLight = { ownerIdx: 0, level: 1, cardIds: ['zhu-old'], lightNonce: 4 };
    const otherTurn = continueTurnStartAfterDamageReaction(makeGs({
      players,
      deck,
      currentTurn: 1,
      zhuLight,
      abilityData: { _turnOwner: 1, _pendingTurnStartEventIds: [] },
    }));
    expect(otherTurn.zhuLight).toEqual(zhuLight);

    const ownerTurn = continueTurnStartAfterDamageReaction(makeGs({
      players,
      deck,
      currentTurn: 0,
      zhuLight,
      abilityData: { _turnOwner: 0, _pendingTurnStartEventIds: ['zhuLightRefresh'] },
    }));
    expect(ownerTurn.zhuLight).toEqual({
      ownerIdx: 0,
      level: 1,
      cardIds: ['zhu-old', 'zhu-refresh-target'],
      lightNonce: 5,
    });
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
    expect(inspectionEventsOf(result.statePatch)[0].statEventSeq).toBe(2);
  });

  it('SAN 损失后若可牺牲黏液，会先暂停在黏液抉择而不是提前翻检定牌', () => {
    const slime = createTsathogguaSlimeCard();
    const players = [makePlayer({
      name: '你',
      role: ROLE_TREASURE,
      hp: 10,
      san: 7,
      hand: [slime],
    })];
    const inspectionCard = { name: '失眠', effect: 'disableRest', value: 1, type: 'negative' };
    const gs = makeGs({
      players,
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      _inspectionSeq: 0,
      _statEventSeq: 0,
    });
    const log = ['你 遭遇邪神 弗栗多！（第1次）失去1SAN'];

    const result = applySanLossToPlayerWithInspection(
      0,
      1,
      0,
      players,
      [],
      [],
      log,
      makeInspectionMeta(gs),
      '邪神遭遇',
    );

    expect(result.P[0].san).toBe(6);
    expect(result.inspectionMeta._statEvents).toMatchObject([
      { type: 'SAN_LOSS', target: 0, from: { san: 7 }, to: { san: 6 }, seq: 1 },
    ]);
    expect(result.inspectionMeta._inspectionEvents).toBeUndefined();
    expect(result.inspectionMeta.abilityData).toMatchObject({
      type: 'tsgSlimeBalance',
      targetIdx: 0,
      pendingSanInspection: { targetIndex: 0, startIndex: 0, reason: '邪神遭遇' },
    });
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
    expect(result.statePatch._inspectionEvents).toBeUndefined();
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
    expect(inspectionEventsOf(inspected.inspectionMeta)).toHaveLength(1);

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
    expect(inspectionEventsOf(afterDecision.inspectionMeta)).toHaveLength(2);
    expect(inspectionEventsOf(afterDecision.inspectionMeta).at(-1).legacySeq).toBe(2);
    expect(inspectionEventsOf(afterDecision.inspectionMeta)[0].beforeStatEventSeq).toBe(1);
    expect(inspectionEventsOf(afterDecision.inspectionMeta)[1].beforeStatEventSeq).toBe(2);
    expect(inspectionEventsOf(afterDecision.inspectionMeta).at(-1).beforePlayers[1]).toMatchObject({
      san: 4,
      godEncounters: 2,
      godName: null,
      godLevel: 0,
      godZone: [],
    });
    const godStatusEvent = afterDecision.statePatch._visualEvents.find(event => event.type === 'godStatusChanged');
    expect(godStatusEvent).toMatchObject({
      presentAfterInspectionSeq: 2,
      playersBefore: [expect.anything(), expect.objectContaining({ godName: null, godLevel: 0, godZone: [] })],
      playersAfter: [expect.anything(), expect.objectContaining({ godName: 'VRI', godLevel: 1 })],
      faithSettlement: {
        previousFaithExit: expect.objectContaining({ playerIdx: 1, effect: 'godConvertDiscard' }),
      },
    });
    expect(inspectionEventsOf(afterDecision.inspectionMeta)[0].legacySeq).toBe(1);
    expect(inspectionEventsOf(afterDecision.inspectionMeta)[0].beforePlayers[1]).toMatchObject({
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
    expect(result.statePatch._visualEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'godStatusChanged',
        playerIdx: 1,
        godKey: 'NYA',
        godLevel: 1,
      }),
    ]));
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
    expect(result._visualEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: VISUAL_EVENT.STAT_EVENTS,
        turnStartStage: 'turnStart',
        statEvents: expect.arrayContaining([
          expect.objectContaining({ reason: '黑山羊幼仔', seq: 1 }),
        ]),
      }),
    ]));
  });

  it('邪神遭遇 SAN 事件明确归属摸牌阶段', () => {
    const godCard = makeGodCard('NYA');
    const players = [makePlayer({ name: '你', san: 10 }), makePlayer({ name: '艾伦' })];
    const result = startNextTurn(makeGs({
      players,
      currentTurn: 1,
      deck: [godCard],
      log: [],
    }));

    const encounterStat = result._statEvents.find(event => event.reason === '邪神遭遇');
    const owner = result._visualEvents.find(event => (
      event.type === VISUAL_EVENT.STAT_EVENTS &&
      event.statEvents?.some(statEvent => statEvent.seq === encounterStat.seq)
    ));
    expect(owner).toMatchObject({ turnStartStage: 'draw' });
  });

  it('黑山羊幼仔的 HP 伤害会立即扯断两人一绳且不再于到期时回复', () => {
    const linkForDiana = { active: true, partner: 0, expiryOwner: 0 };
    const linkForPlayer = { active: true, partner: 1, expiryOwner: 0 };
    const players = [
      makePlayer({ name: '你', hp: 10, damageLink: linkForPlayer }),
      makePlayer({ name: '黛安娜', hp: 10, san: 10, hand: [createBlackGoatYoungCard(), createBlackGoatYoungCard()], damageLink: linkForDiana }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const dianaTurn = startNextTurn(gs);

    expect(dianaTurn.players[1]).toMatchObject({ hp: 5, san: 8, damageLink: { active: false } });
    expect(dianaTurn.players[0]).toMatchObject({ hp: 7, damageLink: { active: false } });
    expect(dianaTurn.log).toContain('【两人一绳】绳索断裂！黛安娜 和 你 各失去 3 HP');

    const playerTurn = startNextTurn({ ...dianaTurn, phase: 'ACTION' });
    expect(playerTurn.log.some(line => line.includes('绳索未断裂'))).toBe(false);
    expect(playerTurn.players[0].hp).toBe(7);
    expect(playerTurn.players[1].hp).toBe(5);
  });

  it('黑山羊幼仔伤害先结算 HP，致死时不再扣减 SAN', () => {
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

    expect(result.players[1]).toMatchObject({ hp: 0, san: 1, isDead: true });
    expect(result.gameOver?.winner).toBe(ROLE_HUNTER);
    expect(result._inspectionEvents || []).toEqual([]);
  });

  it('AI 在自己回合的开场伤害中死亡后立即中止，不做检定或摸牌', () => {
    const forcedGod = makeGodCard('VRI');
    const players = [
      makePlayer({ name: '存活追猎者', role: ROLE_HUNTER }),
      makePlayer({
        name: '黛安娜',
        role: ROLE_HUNTER,
        hp: 2,
        san: 5,
        hand: [createBlackGoatYoungCard(), createBlackGoatYoungCard()],
      }),
      makePlayer({ name: '邪祀者', role: ROLE_CULTIST }),
      makePlayer({ name: '寻宝者', role: ROLE_TREASURE }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      deck: [forcedGod],
      log: [],
      inspectionDeck: [{ name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' }],
      inspectionDiscard: [],
    });

    const result = startNextTurn(gs);

    expect(result.currentTurn).toBe(1);
    expect(result.phase).toBe('AI_TURN');
    expect(result.players[1]).toMatchObject({ hp: 0, isDead: true });
    expect(result._turnStartAbortedByDeath).toBe(true);
    expect(result.deck).toEqual([forcedGod]);
    expect(result._drawnCard).toBeNull();
    expect(result._aiDrawnCard).toBeNull();
    expect(result._drawLogs).toEqual([]);
    expect(result.log.some(line => line.includes('SAN检定结果'))).toBe(false);
    expect(result.log.some(line => line.includes('摸到'))).toBe(false);
    expect(result.log.some(line => line.includes('遭遇邪神'))).toBe(false);
    expect((result._visualEvents || []).some(event => event.type === VISUAL_EVENT.DRAW_CARD)).toBe(false);
    expect((result._visualEvents || []).some(event => event.type === VISUAL_EVENT.INSPECTION)).toBe(false);
  });

  it('AI 回合开始摸牌触发撒托古亚黏液时，_turnOwner 应为新回合玩家而非上家', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', role: ROLE_CULTIST }),
      makePlayer({ name: '卡洛斯', hand: [createTsathogguaSlimeCard()] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      log: [],
      deck: [makeZoneCard('D3', 3)], // 鼠群：所有角色失去 1 SAN
    });

    const result = startNextTurn(gs);

    expect(result.phase).toBe('TSG_SLIME_BALANCE');
    expect(result.currentTurn).toBe(1);
    expect(result.abilityData).toMatchObject({
      type: 'tsgSlimeBalance',
      targetIdx: 2,
      _turnOwner: 1,
    });
    expect(result.players[2].san).toBe(9);
  });

  it('AI 回合开始的普通摸牌分支会递增正式回合数', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦' }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      turn: 8,
      log: [],
      deck: [makeZoneCard('A2')],
    });

    const result = startNextTurn(gs, { allAi: true });

    expect(result.currentTurn).toBe(1);
    expect(result.turn).toBe(9);
    expect(result.phase).toBe('AI_TURN');
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
      continueTurnStartDraw: true,
    });
  });

  it('黑山羊触发黏液平衡后保留黏液额外摸牌和固定摸牌续程', () => {
    const slime = createTsathogguaSlimeCard();
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({
        name: '卡洛斯',
        godName: 'TSG',
        godLevel: 1,
        hand: [createBlackGoatYoungCard(), slime],
      }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.phase).toBe('TSG_SLIME_BALANCE');
    expect(result.abilityData).toMatchObject({
      _turnOwner: 1,
      continueTurnStartDraw: true,
    });
    expect(result.abilityData.pendingTsathogguaSlimes).toBeUndefined();
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

  it('中毒伤害会先令两人一绳断裂，因此不再触发到期治疗', () => {
    const players = [
      makePlayer({ name: '你', hp: 4, damageLink: { active: true, partner: 1, expiryOwner: 1 } }),
      makePlayer({ name: '艾伦', hp: 5, poisonStacks: 2, damageLink: { active: true, partner: 0, expiryOwner: 1 } }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.players[0].hp).toBe(1);
    expect(result.players[1].hp).toBe(0);
    expect(result.players[1].poisonStacks).toBe(1);
    const poisonLogIndex = result.log.findIndex(line => line.includes('【中毒】'));
    const linkLogIndex = result.log.findIndex(line => line.includes('【两人一绳】'));
    expect(poisonLogIndex).toBeGreaterThan(-1);
    expect(linkLogIndex).toBeGreaterThan(poisonLogIndex);
    expect(result.log.some(line => line.includes('绳索未断裂'))).toBe(false);
    expect(result.players[0].damageLink?.active).toBe(false);
    expect(result.players[1].damageLink?.active).toBe(false);
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
    expect(slimeGrantEventsOf(result)).toHaveLength(1);
    expect(slimeGrantEventsOf(result)[0]).toMatchObject({ ownerIdx: 0, count: 2 });
    expect(slimeGrantEventsOf(result)[0].playersBefore[0].hand).toHaveLength(0);
    expect(slimeGrantEventsOf(result)[0].playersAfter[0].hand.filter(c => c.isTsathogguaSlime)).toHaveLength(2);
    expect(result._preTurnPlayers[0].hand.filter(c => c.isTsathogguaSlime)).toHaveLength(2);
  });

  it('回合结束后其他角色获得撒托古亚黏液不会触发增殖的Z', () => {
    const players = [
      makePlayer({ name: 'Z持有者' }),
      makePlayer({ name: '撒托古亚信徒', godName: 'TSG', godLevel: 1 }),
      makePlayer({ name: '下家' }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      proliferatingZ: makeProliferatingZState(0, 1),
      proliferatingZQueue: [],
    });

    const result = startNextTurn(gs);

    expect(result.log.some(line => line.includes('获得1张撒托古亚的赐福黏液'))).toBe(true);
    expect(result.proliferatingZQueue || []).toEqual([]);
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
      expect.objectContaining({
        type: 'godPowerBlocked',
        playerIdx: 0,
        turnStartStage: 'turnBoundary',
      }),
    ]));
  });

  it('火把免疫回合结束撒托古亚给黏液后，连续跳过翻面角色时不会复制旧护罩事件', () => {
    const players = [
      makePlayer({ name: '你', godName: 'TSG', godLevel: 1, godPowerImmuneThisTurn: true, godPowerImmuneTurnOwner: 0 }),
      makePlayer({ name: '艾伦', isResting: true }),
      makePlayer({ name: '卡洛斯' }),
      makePlayer({ name: '黛安娜', isResting: true }),
    ];
    const card = makeZoneCard('A1', 0);
    const gs = makeGs({
      players,
      deck: [card],
      currentTurn: 0,
      log: [],
    });

    const result = startNextTurn(gs);

    expect(result.currentTurn).toBe(2);
    expect(result.log).toContain('【引燃火把】你 本回合不受邪神之力影响');
    expect((result._visualEvents || []).filter(event => event?.type === 'godPowerBlocked')).toHaveLength(1);
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

  it('黄液已在回合结束前(无尽通道之前)发放时，startNextTurn 不再重复发放', () => {
    const players = [
      makePlayer({ name: '你', godName: 'TSG', godLevel: 1 }),
      makePlayer({ name: '艾伦' }),
    ];
    // _tsgSlimeGrantedAtTurnEnd 表示黄液已先于无尽通道结算（神牌事件优先），此处应跳过
    const gs = makeGs({ players, currentTurn: 0, log: [], _tsgSlimeGrantedAtTurnEnd: true });

    const result = startNextTurn(gs);

    expect(result.players[0].hand.filter(c => c.isTsathogguaSlime)).toHaveLength(0);
    expect(result._tsgSlimeGrantEvents || []).toHaveLength(0);
    expect(result._tsgSlimeGrantedAtTurnEnd).toBeUndefined(); // 标记已清除，不影响后续回合
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
    const extraDrawIdx = result.log.findIndex(line => line.includes('额外摸到'));
    const slimePopIdx = result.log.findIndex(line => line.includes('撒托古亚的赐福黏液消失'));
    expect(extraDrawIdx).toBeGreaterThan(-1);
    expect(slimePopIdx).toBeLessThan(extraDrawIdx);
  });

  it('黏液额外摸到区域牌时，效果统计事件全部被规范回合开始事件认领', () => {
    const slime = createTsathogguaSlimeCard();
    const claustro = {
      id: 'slime-claustrophobia', key: 'B1', letter: 'B', number: 1,
      name: '幽闭恐惧', type: 'adjDamageSAN', val: 2, isZone: true, polarity: 'negative',
    };
    const god = makeGodCard('NYA', { id: 'slime-god-nya' });
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '黛安娜', godName: 'TSG', godLevel: 1, hand: [slime] }),
      makePlayer({ name: '艾伦' }),
    ];
    const gs = makeGs({ players, deck: [claustro, god], currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    const sanEvents = (result._statEvents || []).filter(event => event?.type === 'SAN_LOSS');
    expect(sanEvents.length).toBeGreaterThan(0);
    // 未被任何 turnStartStage 事件认领的 seq 会被上一回合 AI 行动队列的
    // 旧式差分捡走抢播（幽闭恐惧 SAN 在上一回合播出的线上 bug）。
    const ownedSeqs = new Set((result._visualEvents || [])
      .filter(event => event?.turnStartStage)
      .flatMap(event => Array.isArray(event?.statEvents) ? event.statEvents : [])
      .map(event => event?.seq)
      .filter(seq => seq != null));
    const leaked = sanEvents.filter(event => event.seq != null && !ownedSeqs.has(event.seq));
    expect(leaked).toEqual([]);
  });

  it('本地玩家黏液额外摸牌进入抉择时保留正常摸牌续接标记', () => {
    const slime = createTsathogguaSlimeCard();
    const extraDecisionCard = makeZoneCard('B4', 0);
    const normalCard = makeZoneCard('A1', 0);
    const players = [
      makePlayer({ name: '你', godName: 'TSG', godLevel: 1, hand: [slime] }),
      makePlayer({ name: '艾伦' }),
    ];
    const gs = makeGs({
      players,
      deck: [extraDecisionCard, normalCard],
      currentTurn: -1,
      log: [],
    });

    const result = startNextTurn(gs);

    expect(result.phase).toBe('DRAW_REVEAL');
    expect(result.drawReveal).toMatchObject({
      card: extraDecisionCard,
      fromTsathogguaSlime: true,
    });
    expect(result.abilityData).toMatchObject({
      fromTsathogguaSlime: true,
      continueTurnStartDraw: true,
    });
    expect(result.abilityData.pendingTsathogguaSlime).toBeUndefined();
    expect(result.players[0].hand.some(c => c.isTsathogguaSlime)).toBe(false);
    expect(result.deck[0]).toBe(normalCard);
    expect(result.log.some(line => line.includes('额外摸到'))).toBe(true);
    expect(result.log.some(line => line.includes('正常牌'))).toBe(false);
  });

  it('黏液额外摸牌的 AOE 杀死本地玩家时截断摸牌阶段，死亡步骤后不再有摸牌动画', () => {
    const slime = createTsathogguaSlimeCard();
    const nightWind = { id: 'c4', key: 'C4', letter: 'C', number: 4, name: '夜风呼啸', type: 'allDamageBoth', val: 1, isZone: true, polarity: 'negative' };
    const torch = { id: 'c3', key: 'C3', letter: 'C', number: 3, name: '引燃火把', type: 'igniteTorch', isZone: true, polarity: 'neutral' };
    const players = [
      makePlayer({ name: '你', hp: 1, role: '追猎者' }),
      makePlayer({ name: '黛安娜', hp: 10, san: 5, godName: 'TSG', godLevel: 1, hand: [slime], role: '追猎者' }),
      makePlayer({ name: '艾伦', hp: 10, role: '寻宝者' }),
    ];
    const gs = makeGs({ players, deck: [nightWind, torch], currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.gameOver).toMatchObject({ winner: 'LOSE' });
    // 规则截断：死亡之后的固定摸牌不再结算，日志里不出现第二张牌
    expect(result.log.some(line => line.includes('引燃火把'))).toBe(false);
    // 呈现顺序：HP/SAN 伤害 → 断头台 → 死亡广播，之后不存在任何摸牌步骤
    const replay = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: result });
    const types = replay.queue.map(step => step.type);
    const deathIdx = types.indexOf('DEATH');
    expect(types.indexOf('HP_DAMAGE')).toBeGreaterThan(-1);
    expect(types.indexOf('GUILLOTINE')).toBeGreaterThan(types.indexOf('HP_DAMAGE'));
    expect(deathIdx).toBeGreaterThan(types.indexOf('GUILLOTINE'));
    expect(types.slice(deathIdx).some(type => type === 'DRAW_CARD')).toBe(false);
  });

  it('黏液额外摸到伤害牌时，牌效结算前黏液已消耗，不能再用于平分 HP/SAN', () => {
    const slime = createTsathogguaSlimeCard();
    const damageCard = {
      id: 'slime-extra-damage',
      key: 'TEST',
      name: '额外伤害牌',
      type: 'selfDamageHP',
      val: 3,
      isZone: true,
      polarity: 'negative',
    };
    const normalCard = {
      id: 'normal-draw',
      key: 'A1',
      name: '正常牌',
      type: 'selfHealHP',
      val: 0,
      isZone: true,
      polarity: 'positive',
    };
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', role: ROLE_CULTIST, godName: 'TSG', godLevel: 1, hp: 10, san: 6, hand: [slime] }),
    ];
    const gs = makeGs({
      players,
      deck: [damageCard, normalCard],
      currentTurn: 0,
      log: [],
      debugForceCardKeepPending: 'keep',
      debugForceCardKeepTarget: 1,
    });

    const result = startNextTurn(gs);

    expect(result.players[1].hand.some(c => c.isTsathogguaSlime)).toBe(false);
    expect(result.players[1].hp).toBe(7);
    expect(result.abilityData?.type).not.toBe('tsgSlimeBalance');
    expect(result.phase).not.toBe('TSG_SLIME_BALANCE');
  });

  it('撒托古亚黏液在对应额外摸牌后播放泡泡破裂而不是弃牌动画', () => {
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

    const queue = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: result }).queue;
    const popStep = queue.find(step => step.type === 'TSG_SLIME_POP');
    const popIdx = queue.indexOf(popStep);
    const extraDrawIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === 'extra');
    const extraKeepIdx = queue.findIndex(step => step.type === 'CARD_TRANSFER' && step.effect === 'draw' && step.cards?.[0]?.id === 'extra');
    const normalDrawIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === 'normal');
    const normalKeepIdx = queue.findIndex(step => step.type === 'CARD_TRANSFER' && step.effect === 'draw' && step.cards?.[0]?.id === 'normal');

    expect(popStep).toMatchObject({ targetPid: 1, count: 1, cards: [slime] });
    expect(popIdx).toBeLessThan(extraDrawIdx);
    expect(popStep.visualSetupPatch.players[1].hand).toContain(slime);
    expect(popStep.visualTimeline.at(-1).patch.players[1].hand).not.toContain(slime);
    expect(extraDrawIdx).toBeLessThan(extraKeepIdx);
    expect(extraKeepIdx).toBeLessThan(normalDrawIdx);
    expect(normalDrawIdx).toBeLessThan(normalKeepIdx);
    expect(queue[extraKeepIdx + 1]).toMatchObject({ type: 'STATE_PATCH' });
    expect(queue[extraKeepIdx + 1].players[1].hand.map(card => card.id)).toEqual(['extra']);
    expect(queue[normalKeepIdx + 1].players[1].hand.map(card => card.id)).toEqual(['extra', 'normal']);
    expect(queue.some(step => step.type === 'CARD_TRANSFER' && step.dest === 'discard')).toBe(false);
    expect(queue.some(step => step.type === 'DISCARD' && step.card?.id === slime.id)).toBe(false);
  });

  it('黏液额外摸到地动山摇时先破裂黏液，并在下一张牌翻开前播放地震', () => {
    const slime = createTsathogguaSlimeCard();
    const earthquake = makeZoneCard('B2', 2);
    const god = makeGodCard('ZHU');
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', godName: 'TSG', godLevel: 1, hand: [slime, makeZoneCard('C1', 0)] }),
    ];
    const gs = makeGs({ players, deck: [earthquake, god], currentTurn: 0, log: [] });

    const result = startNextTurn(gs);
    const queue = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: result }).queue;
    const popIdx = queue.findIndex(step => step.type === 'TSG_SLIME_POP');
    const earthquakeDrawIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === earthquake);
    const earthquakeFxIdx = queue.findIndex(step => step.type === 'EARTHQUAKE');
    const godDrawIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === god);

    expect(queue.filter(step => step.type === 'TSG_SLIME_POP')).toHaveLength(1);
    expect(popIdx).toBeLessThan(earthquakeDrawIdx);
    expect(earthquakeDrawIdx).toBeLessThan(earthquakeFxIdx);
    expect(earthquakeFxIdx).toBeLessThan(godDrawIdx);
  });

  it('AI 摸到夜风呼啸时日志与数值动画都在检定之前', () => {
    const nightWind = makeZoneCard('C4', 2);
    const insomnia = { id: 'insomnia', name: '失眠', effect: 'disableRest', value: 1, type: 'negative' };
    const players = [
      makePlayer({ name: '你', san: 7 }),
      makePlayer({ name: '贝拉', san: 7, role: ROLE_CULTIST }),
      makePlayer({ name: '艾伦', san: 7 }),
    ];
    const gs = makeGs({
      players,
      deck: [nightWind],
      currentTurn: 0,
      inspectionDeck: [insomnia, insomnia, insomnia],
      inspectionDiscard: [],
      debugForceCardKeepPending: 'keep',
      debugForceCardKeepTarget: 1,
      log: [],
    });

    const result = startNextTurn(gs);
    const damageLogIdx = result.log.findIndex(line => line === '全体存活角色失去 1 HP 和 SAN');
    const inspectionLogIdx = result.log.findIndex(line => line.includes('的SAN检定结果为'));
    const queue = buildTurnStartDrawReplayQueue({ oldGs: gs, newGs: result }).queue;
    const drawIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === nightWind.id);
    const windIdx = queue.findIndex(step => step.type === 'NIGHT_WIND');
    const sanDamageIdx = queue.findIndex(step => step.type === 'SAN_DAMAGE');
    const inspectionDrawIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.inspectionSeq != null);

    expect(damageLogIdx).toBeGreaterThan(-1);
    expect(inspectionLogIdx).toBeGreaterThan(damageLogIdx);
    expect(drawIdx).toBeGreaterThan(-1);
    expect(windIdx).toBeGreaterThan(drawIdx);
    expect(sanDamageIdx).toBeGreaterThan(windIdx);
    expect(inspectionDrawIdx).toBeGreaterThan(sanDamageIdx);
    expect(queue.filter(step => step.type === 'NIGHT_WIND')).toHaveLength(1);
    expect(queue.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(1);
    expect(queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
    expect(queue[queue.findIndex(step => step.type === 'HP_DAMAGE')].statEvents)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ target: 0, to: expect.objectContaining({ hp: 9, san: 6 }) }),
      ]));
  });

  it('同一角色的多条未断绳索在各自到期时分别治疗', () => {
    const players = [
      makePlayer({ name: '你', hp: 2 }),
      makePlayer({ name: '艾伦', hp: 3 }),
      makePlayer({ name: '贝拉', hp: 4 }),
    ];
    addDamageLink(players, 0, 1, { expiryOwner: 0, createdSeq: 1 });
    addDamageLink(players, 0, 2, { expiryOwner: 0, createdSeq: 2 });
    const gs = makeGs({ players, currentTurn: 2, log: [] });

    const result = startNextTurn(gs);

    expect(result.players.map(player => player.hp)).toEqual([10, 7, 8]);
    expect(getAllDamageLinks(result.players)).toEqual([]);
    expect(result.log.filter(line => line.includes('绳索未断裂'))).toEqual([
      '【两人一绳】绳索未断裂！你 和 艾伦 各回复 4 HP',
      '【两人一绳】绳索未断裂！你 和 贝拉 各回复 4 HP',
    ]);
  });

  it('禁用摸牌时不会触发或消耗撒托古亚黏液', () => {
    const slime = createTsathogguaSlimeCard();
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', godName: 'TSG', godLevel: 1, hand: [slime], skipNextDraw: true, skipNextDrawReason: '霉变食物' }),
    ];
    const deck = [
      { id: 'normal', key: 'A2', letter: 'A', number: 2, name: '正常牌', type: 'selfHealHP', val: 1, isZone: true, polarity: 'positive' },
    ];
    const gs = makeGs({ players, deck, currentTurn: 0, log: [] });

    const result = startNextTurn(gs);

    expect(result.players[1].hand).toContain(slime);
    expect(result.players[1].hand.map(c => c.name)).not.toContain('正常牌');
    expect(result.log.some(line => line.includes('因霉变食物而无法摸牌'))).toBe(true);
    expect(result.log.some(line => line.includes('额外摸到'))).toBe(false);
    expect(result.log.some(line => line.includes('撒托古亚的赐福黏液消失'))).toBe(false);
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

    expect(result._visualEvents || []).not.toContainEqual(staleStatEvent);
    expect(result._visualEvents || []).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'turnStart', playerIdx: result.currentTurn }),
    ]));
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

    expect(result.P[1]).toMatchObject({ godName: 'SHU', godLevel: 1, hasBelievedGod: true });
    expect(result.P.some(player => player.hand.some(card => card.isBlackGoatYoung))).toBe(true);
    expect(result.msgs.some(line => line.includes('黑暗子嗣'))).toBe(true);
  });

  it('强制改信的SAN代价触发胜利后不再结算新神即时能力', () => {
    const players = [
      makePlayer({ name: '艾伦', role: ROLE_CULTIST }),
      makePlayer({
        name: '黛安娜',
        role: ROLE_TREASURE,
        san: 1,
        godName: 'NYA',
        godLevel: 1,
        godZone: [makeGodCard('NYA')],
      }),
      makePlayer({ name: '旁观者', role: ROLE_TREASURE }),
    ];
    const gs = makeGs({ players, currentTurn: 0 });

    const result = resolveGodEncounterForAI(1, makeGodCard('SHU'), players, [], [], gs, true);

    expect(result.P[1]).toMatchObject({ san: 0, godName: 'SHU', godLevel: 1 });
    expect(checkWin(result.P, false)?.winner).toBe(ROLE_CULTIST);
    expect(result.P.every(player => player.hand.every(card => !card.isBlackGoatYoung))).toBe(true);
    expect(result.msgs.some(line => line.includes('【黑暗子嗣】'))).toBe(false);
    expect(result.statePatch.proliferatingZQueue).toBeUndefined();
  });

  it('追猎者信仰森之领主时若更适合追捕，会把黑山羊幼仔给 HP 低于 SAN 的其他角色', () => {
    const chaseCard = makeZoneCard('A1', 0, { id: 'hunter-card' });
    const players = [
      makePlayer({ name: '低HP目标', hp: 3, san: 8, hand: [makeZoneCard('B1', 0)] }),
      makePlayer({ name: '追猎者', role: ROLE_HUNTER, hand: [chaseCard] }),
      makePlayer({ name: '低SAN目标', hp: 8, san: 3, hand: [makeZoneCard('C1', 0)] }),
    ];
    const gs = makeGs({ players, currentTurn: 1 });

    const result = resolveGodEncounterForAI(1, makeGodCard('SHU'), players, [], [], gs, true);

    expect(result.P[0].hand.some(card => card.isBlackGoatYoung)).toBe(true);
    expect(result.P[1].hand.some(card => card.isBlackGoatYoung)).toBe(false);
    expect(result.P[2].hand.some(card => card.isBlackGoatYoung)).toBe(false);
  });

  it('邪祀者信仰森之领主时若更适合蛊惑，会把黑山羊幼仔给 SAN 低于 HP 的其他角色', () => {
    const bewitchCard = {
      id: 'san-gift',
      key: 'C4',
      name: '恶毒诅咒',
      type: 'selfDamageSAN',
      val: 2,
      isZone: true,
      letter: 'C',
      number: 4,
    };
    const players = [
      makePlayer({ name: '低SAN目标', hp: 8, san: 3 }),
      makePlayer({ name: '邪祀者', role: ROLE_CULTIST, roleRevealed: true, hand: [bewitchCard] }),
      makePlayer({ name: '低HP目标', hp: 3, san: 8 }),
    ];
    const gs = makeGs({ players, currentTurn: 1 });

    const result = resolveGodEncounterForAI(1, makeGodCard('SHU'), players, [], [], gs, true);

    expect(result.P[0].hand.some(card => card.isBlackGoatYoung)).toBe(true);
    expect(result.P[1].hand.some(card => card.isBlackGoatYoung)).toBe(false);
    expect(result.P[2].hand.some(card => card.isBlackGoatYoung)).toBe(false);
  });

  it('联机真人被蛊惑强制信仰森之领主时延迟到黑暗子嗣目标选择阶段', () => {
    const players = [
      makePlayer({ name: '蛊惑者' }),
      makePlayer({ name: '真人目标', godName: null, godLevel: 0, godZone: [] }),
      makePlayer({ name: '旁观者' }),
    ];
    const gs = makeGs({ players, currentTurn: 0, log: [], _isMP: true });
    const L = [];

    const result = aiHandleGodCard(
      1,
      makeGodCard('SHU'),
      players,
      [],
      [],
      L,
      gs,
      true,
      true,
      { deferShuTarget: true },
    );

    expect(result.P[1]).toMatchObject({ godName: 'SHU', godLevel: 1 });
    expect(result.P.some(player => player.hand.some(card => card.isBlackGoatYoung))).toBe(false);
    expect(result.statePatch._deferredShuTarget).toEqual({ chooserIdx: 1, count: 1 });
    expect(result.statePatch.abilityData).toMatchObject({
      shuChooserIdx: 1,
      shuOffspringCount: 1,
      _turnOwner: 0,
    });
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

  it('主动改信会完整记录信仰结果、改信 SAN 与随后检定日志', () => {
    const paranoia = { id: 'paranoia', name: '迫害妄想', effect: 'discardRandom', value: 1 };
    const players = [makePlayer({
      name: '黛安娜',
      role: ROLE_CULTIST,
      san: 5,
      hand: [{ id: 'discard-me', name: '弃牌' }],
      godName: 'UNIMPLEMENTED_OLD_GOD',
      godLevel: 1,
      godZone: [{ id: 'old-god', godKey: 'UNIMPLEMENTED_OLD_GOD', isGod: true }],
    })];
    const gs = makeGs({
      players,
      currentTurn: 0,
      log: ['黛安娜 遭遇邪神 阿波菲斯！（第2次）失去 2 SAN'],
      inspectionDeck: [paranoia],
      inspectionDiscard: [],
    });

    const result = resolveGodEncounterForAI(0, makeGodCard('APO'), players, [], [], gs, false);

    expect(result.msgs.slice(0, 4)).toEqual([
      '黛安娜 信仰了 阿波菲斯，获得噬日灭世(Lv.1)',
      '黛安娜 改信新神，失去 1 SAN',
      '黛安娜 的SAN检定结果为"迫害妄想"',
      '黛安娜 迫害妄想，弃置了一张牌',
    ]);
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

  it('AI 遭遇邪神后 SAN 归零会立即结束游戏且不再结算馈赠', () => {
    const godCard = makeGodCard('TSG');
    const players = [
      makePlayer({ name: '你', role: ROLE_CULTIST, san: 10 }),
      makePlayer({ name: '贝拉', role: ROLE_TREASURE, san: 4, godEncounters: 3 }),
      makePlayer({ name: '卡洛斯', role: ROLE_CULTIST, san: 10 }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      deck: [godCard],
      discard: [],
      log: [],
      phase: 'ACTION',
    });

    const result = startNextTurn(gs);

    expect(result.players[1].san).toBe(0);
    expect(result.gameOver?.reason).toContain('贝拉 的理智归零，邪神苏醒');
    expect(result.phase).not.toBe('AI_GOD_CHOICE');
    expect(result.log.some(line => line.includes('放弃了邪神的馈赠'))).toBe(false);
    expect(result.abilityData?.godCard).toBeUndefined();
  });

  it('reveals an unrevealed cultist (role only, not their whole hand) when they keep an encountered god card in hand', () => {
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
      revealHand: false,
      godName: 'CTH',
      godLevel: 3,
    });
    expect(result.msgs.some(msg => msg.includes('邪祀者') && msg.includes('收入手牌'))).toBe(true);
  });

  it('联机真人遭遇邪神后 SAN 归零会立即结束游戏且不进入馈赠决策', () => {
    const godCard = makeGodCard('TSG');
    const players = [
      makePlayer({ name: '安娜', role: ROLE_TREASURE, san: 8 }),
      makePlayer({ name: '艾伦', role: ROLE_HUNTER, san: 4, godEncounters: 3 }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      deck: [godCard],
      discard: [],
      log: [],
      phase: 'ACTION',
      _isMP: true,
    });

    const result = startNextTurn(gs);

    expect(result.players[1].san).toBe(0);
    expect(result.gameOver).toMatchObject({ winner: 'LOSE_ALL' });
    expect(result.phase).not.toBe('GOD_CHOICE');
    expect(result.abilityData?.godCard).toBeUndefined();
    expect(result.log.some(line => line.includes('信仰了 蟾蜍之神'))).toBe(false);
  });

  it('中毒先暂停等待黏液，尚未结算两人一绳断裂或到期治疗', () => {
    const slime1 = createTsathogguaSlimeCard();
    const slime2 = createTsathogguaSlimeCard();
    const players = [
      makePlayer({ name: '你', hp: 4, damageLink: { active: true, partner: 1, expiryOwner: 1 } }),
      makePlayer({ name: '艾伦', hp: 5, san: 7, poisonStacks: 2, hand: [slime1, slime2], damageLink: { active: true, partner: 0, expiryOwner: 1 } }),
    ];

    const result = startNextTurn(makeGs({ players, currentTurn: 0, log: [] }));

    expect(result.phase).toBe('TSG_SLIME_BALANCE');
    expect(result.players[1].hp).toBe(3);
    expect(result.players[0].hp).toBe(4);
    expect(result.players[1].damageLink.active).toBe(true);
    expect(result.abilityData).toMatchObject({
      targetIdx: 1,
      lostHp: 2,
      pendingDamageLinkBreak: { sourceIdx: 1, partnerIdx: 0 },
      continueTurnStartDraw: true,
    });
    expect(result.log.some(line => line.includes('绳索断裂'))).toBe(false);
    expect(result.log.some(line => line.includes('绳索未断裂'))).toBe(false);
  });

  it('AI 跳过摸牌后仍停留在自己的行动阶段', () => {
    const goat = { id: 'goat', name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true };
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', hp: 8, san: 8, hand: [goat], skipNextDraw: true, skipNextDrawReason: '扭伤' }),
    ];
    const top = makeZoneCard('A2');

    const result = startNextTurn(makeGs({ players, currentTurn: 0, deck: [top], log: [] }));

    expect(result.currentTurn).toBe(1);
    expect(result.phase).toBe('AI_TURN');
    expect(result.players[1]).toMatchObject({ hp: 7, san: 7 });
    expect(result.players[1].skipNextDraw).toBeUndefined();
    expect(result.deck[0]).toBe(top);
  });

  it('翻面休息角色保留独立回合边界，但不结算黑山羊、中毒或绳索到期', () => {
    const goat = { id: 'goat', name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true };
    const players = [
      makePlayer({ name: '你', damageLink: { active: true, partner: 1, expiryOwner: 1 } }),
      makePlayer({
        name: '艾伦', isResting: true, hp: 8, san: 8, poisonStacks: 2, hand: [goat],
        damageLink: { active: true, partner: 0, expiryOwner: 1 },
      }),
      makePlayer({ name: '贝拉' }),
    ];

    const result = startNextTurn(makeGs({ players, currentTurn: 0, deck: [makeZoneCard('A2')], log: [] }));

    expect(result.players[1]).toMatchObject({ hp: 8, san: 8, poisonStacks: 2, isResting: false });
    expect(result.players[1].damageLink).toBeTruthy();
    expect(result.log.slice(0, 3)).toEqual([
      '── 艾伦 的回合开始 ──',
      '艾伦 从休息中醒来，跳过本回合',
      '── 贝拉 的回合开始 ──',
    ]);
    expect(result._skippedTurnReplays?.[0]?.turnStartLogs).toEqual(['── 艾伦 的回合开始 ──']);
    expect(result.log.some(line => line.includes('【黑山羊幼仔】艾伦'))).toBe(false);
    expect(result.log.some(line => line.includes('【中毒】艾伦'))).toBe(false);
  });

  it.each([
    ['本地玩家', 0, 2, false],
    ['AI 玩家', 1, 0, false],
    ['联机远端玩家', 1, 0, true],
  ])('%s 翻面跳过回合时既不消耗也不获得撒托古亚黏液', (_label, restingIdx, currentTurn, isMP) => {
    const existingSlime = createTsathogguaSlimeCard();
    const players = [
      makePlayer({ name: '本地玩家' }),
      makePlayer({ name: '远端或 AI' }),
      makePlayer({ name: '上一位玩家' }),
    ];
    players[restingIdx] = makePlayer({
      ...players[restingIdx],
      name: restingIdx === 0 ? '本地玩家' : '远端或 AI',
      isResting: true,
      godName: 'TSG',
      godLevel: 2,
      hand: [existingSlime],
    });

    const result = startNextTurn(makeGs({ players, currentTurn, _isMP: isMP, log: [] }));

    expect(result.players[restingIdx].hand).toEqual([existingSlime]);
    expect(result.log.some(line => (
      line.includes(result.players[restingIdx].name) &&
      line.includes('获得2张撒托古亚的赐福黏液')
    ))).toBe(false);
    expect(result._tsgSlimeGrantEvents || []).toHaveLength(0);
  });

  it('翻面跳过回合不消耗任何下一回合状态', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({
        name: '艾伦',
        isResting: true,
        skipNextDraw: true,
        skipNextDrawReason: '活死人哨兵',
        disableRestNextTurn: true,
        disableSkillNextTurn: true,
        handLimitDecreaseNextTurn: 1,
      }),
      makePlayer({ name: '贝拉' }),
    ];

    const afterRestSkip = startNextTurn(makeGs({
      players,
      currentTurn: 0,
      globalOnlySwapOwner: 1,
      deck: [makeZoneCard('A2')],
      log: [],
    }));

    expect(afterRestSkip.currentTurn).toBe(2);
    expect(afterRestSkip.players[1]).toMatchObject({
      isResting: false,
      skipNextDraw: true,
      skipNextDrawReason: '活死人哨兵',
      disableRestNextTurn: true,
      disableSkillNextTurn: true,
      handLimitDecreaseNextTurn: 1,
    });
    expect(afterRestSkip.players[1].disableRest).toBe(false);
    expect(afterRestSkip.players[1].disableSkill).toBe(false);
    expect(afterRestSkip.players[1].handLimitDecrease).toBe(0);
    expect(afterRestSkip.globalOnlySwapOwner).toBe(1);
    expect(afterRestSkip.log.some(line => line.includes('全员技能变为掉包') && line.includes('结束'))).toBe(false);

    const normalTurn = startNextTurn({ ...afterRestSkip, currentTurn: 0 });
    expect(normalTurn.currentTurn).toBe(1);
    expect(normalTurn.players[1]).toMatchObject({
      disableRest: true,
      disableSkill: true,
      handLimitDecrease: 1,
      disableRestNextTurn: false,
      disableSkillNextTurn: false,
      handLimitDecreaseNextTurn: 0,
    });
    expect(normalTurn.players[1].skipNextDraw).toBeUndefined();
    expect(normalTurn.globalOnlySwapOwner).toBeNull();
    expect(normalTurn.log.some(line => line.includes('全员技能变为掉包') && line.includes('结束'))).toBe(true);
  });

  it('同一摸牌阶段内地磁反转立即改变后续固定摸牌来源', () => {
    const slime = createTsathogguaSlimeCard();
    const reversal = { id: 'reversal', key: 'C2', name: '地磁反转', type: 'geomagneticReversal', isZone: true };
    const untouched = makeZoneCard('A2');
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', godName: 'TSG', godLevel: 1, hand: [slime] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      deck: [reversal, untouched],
      discard: [],
      log: [],
      debugForceCardKeepPending: 'keep',
      debugForceCardKeepTarget: 1,
    });

    const result = startNextTurn(gs);

    expect(result.players[1].hand.some(card => card.id === reversal.id)).toBe(true);
    expect(result.players[1].hand.some(card => card.isTsathogguaSlime)).toBe(false);
    expect(result.deck[0]).toBe(untouched);
    expect(result.geomagneticReversalActive).toBe(false);
  });
});
