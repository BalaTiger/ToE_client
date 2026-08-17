import { describe, expect, it, vi } from 'vitest';
import { buildAnimQueue } from '../animQueueCore';
import {
  buildBewitchGiftReplay,
  buildInspectionReplay,
  buildRandomTargetReplay,
  findFreshBewitchReplayLog,
  hasFreshRandomTargetEvents,
  isFreshActionReplayEvent,
  isFreshBewitchReplayEvent,
  isStatAnimationStep,
} from '../animReplayEvents';
import { copyPlayers, makeInspectionMeta, ROLE_CULTIST } from '../coreUtils';
import { applySanLossToPlayerWithInspection, resolveGodEncounterForAI } from '../turnEngine';
import { createBewitchGiftEvent, createRandomTargetVisualEvent } from '../visualEvents';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

describe('animReplayEvents', () => {
  it('识别会更新数值或承载数值日志的动画步骤', () => {
    expect(isStatAnimationStep({ type: 'HP_DAMAGE' })).toBe(true);
    expect(isStatAnimationStep({ type: 'STATE_PATCH', _logChunk: ['失去 1 SAN'] })).toBe(true);
    expect(isStatAnimationStep({ type: 'CARD_TRANSFER' })).toBe(false);
    expect(isStatAnimationStep(null)).toBe(false);
  });

  it('事件消息之后跨入摸牌边界时视为旧回放事件', () => {
    const event = { msgs: ['事件蛊惑'] };
    expect(isFreshActionReplayEvent(event, ['事件蛊惑', '── 贝拉 的回合开始 ──'])).toBe(false);
    expect(isFreshBewitchReplayEvent(event, ['事件蛊惑', '贝拉 摸到 [B2] 下一张牌'])).toBe(false);
    expect(isFreshActionReplayEvent(event, ['事件掉包', '── 贝拉 的回合开始 ──'])).toBe(false);
    expect(isFreshActionReplayEvent({ msgs: ['事件掉包'] }, ['事件掉包', '结算完成'])).toBe(true);
  });

  it('蛊惑日志 fallback 不会跨过后续摸牌边界', () => {
    expect(findFreshBewitchReplayLog([
      '艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物',
      '── 贝拉 的回合开始 ──',
      '贝拉 摸到 [B2] 下一张牌',
    ])).toBeNull();
    expect(findFreshBewitchReplayLog([
      '艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物',
      '贝拉 失去 1 SAN',
    ])).toBe('艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物');
  });

  it('蛊惑赠牌回放优先使用显式 visual stat，避免旧差分数值动画重复', () => {
    const gift = makeZoneCard('A1', 0);
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' }), makePlayer({ name: '贝拉' })];
    const oldGs = { players, currentTurn: 0, log: [] };
    const newGs = { players: copyPlayers(players), currentTurn: 0, log: ['你对 贝拉 【蛊惑】'] };
    const buildAnimQueue = vi.fn(() => [
      { type: 'CARD_TRANSFER', fromPid: 2, toPid: 0, count: 1 },
      { type: 'SAN_DAMAGE', hitIndices: [1], msgs: ['旧差分伤害'] },
      { type: 'STATE_PATCH', _logChunk: ['旧数值日志'] },
    ]);
    const visualSanDamage = { type: 'SAN_DAMAGE', hitIndices: [2], msgs: ['事件伤害'] };

    const replay = buildBewitchGiftReplay({
      oldGs,
      newGs,
      bewitchEvent: {
        sourceIdx: 0,
        targetIdx: 2,
        targetName: '贝拉',
        card: gift,
        msgs: ['事件蛊惑'],
      },
      logDelta: ['你对 贝拉 【蛊惑】', '贝拉 失去 1 SAN'],
      visualStatQueue: [visualSanDamage],
      buildAnimQueue,
      copyPlayers,
    });

    expect(replay.queue.map(step => step.type)).toEqual(['SKILL_BEWITCH', 'CARD_TRANSFER', 'DRAW_CARD', 'SAN_DAMAGE']);
    expect(replay.queue[0]).toMatchObject({ targetIdx: 2, msgs: ['事件蛊惑'] });
    expect(replay.queue[1]).toMatchObject({ fromPid: 0, toPid: 2, count: 1 });
    expect(replay.queue[2]).toMatchObject({ card: gift, triggerName: '贝拉', targetPid: 2, skipTravel: true });
    expect(replay.queue[3]).toMatchObject({
      ...visualSanDamage,
      cardAcquisitionStage: 'acceptance',
    });
    expect(replay.queue.some(step => step.msgs?.includes('旧差分伤害'))).toBe(false);
    expect(replay.queue.some(step => step._logChunk?.includes('旧数值日志'))).toBe(false);
  });

  it('邪神蛊惑回放按遭遇边界分别编译遭遇与信仰结算', () => {
    const god = makeGodCard('APO');
    const beforePlayers = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦', san: 6 })];
    const encounterPlayers = copyPlayers(beforePlayers);
    encounterPlayers[1].san = 5;
    const finalPlayers = copyPlayers(encounterPlayers);
    finalPlayers[1] = {
      ...finalPlayers[1],
      godName: 'APO',
      godLevel: 1,
      godZone: [god],
      hasBelievedGod: true,
    };
    const oldGs = { players: beforePlayers, currentTurn: 0, log: ['旧日志'] };
    const encounterState = {
      players: encounterPlayers,
      currentTurn: 0,
      log: ['旧日志', '艾伦 遭遇邪神 阿波菲斯，失去1SAN'],
      _inspectionEvents: [],
      _inspectionSeq: 0,
      _statEvents: [],
      _statEventSeq: 0,
    };
    const newGs = {
      players: finalPlayers,
      currentTurn: 0,
      log: [...encounterState.log, '艾伦 信仰了 阿波菲斯', '【噬日灭世】黑夜降临'],
    };
    const encounterDamage = { type: 'SAN_DAMAGE', hitIndices: [1] };
    const highlight = { type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'APO' };
    const eclipse = { type: 'APOPHIS_ECLIPSE' };
    const buildQueue = vi.fn((from, to) => (
      to.players === encounterPlayers ? [encounterDamage] : [highlight, eclipse]
    ));

    const replay = buildBewitchGiftReplay({
      oldGs,
      newGs,
      bewitchEvent: {
        sourceIdx: 0,
        targetIdx: 1,
        targetName: '艾伦',
        card: god,
        msgs: ['你对 艾伦 【蛊惑】，赠予阿波菲斯'],
        encounterState,
      },
      buildAnimQueue: buildQueue,
      copyPlayers,
    });

    expect(replay.queue.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'DRAW_CARD',
      'SAN_DAMAGE',
      'GOD_HIGHLIGHT',
      'APOPHIS_ECLIPSE',
    ]);
    expect(replay.queue[3].cardAcquisitionStage).toBe('godEncounter');
    expect(replay.queue[4].cardAcquisitionStage).toBe('acceptance');
    expect(replay.queue[5].cardAcquisitionStage).toBe('onWorshipPower');
  });

  it('遭遇 SAN 未触发检定时，改信 SAN 的检定只在信仰结算阶段播放一次', () => {
    const oldGod = makeGodCard('NYA', { id: 'old-nya-before-bewitch' });
    const giftedGod = makeGodCard('VRI', { id: 'gifted-vri' });
    const sealCard = { id: 'seal-loosening', name: '封印松动', effect: 'sealLoosening', value: 1 };
    const bewitchMsg = '黛安娜（邪祀者）对 贝拉 【蛊惑】，赠予 弗栗多';
    const encounterMsg = '贝拉 遭遇邪神 弗栗多！（第2次）失去 2 SAN';
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '黛安娜', role: ROLE_CULTIST }),
        makePlayer({
          name: '贝拉',
          san: 9,
          godName: 'NYA',
          godLevel: 1,
          godZone: [oldGod],
          hasBelievedGod: true,
        }),
      ],
      currentTurn: 0,
      log: [],
      inspectionDeck: [sealCard],
      inspectionDiscard: [],
      _inspectionSeq: 0,
      _inspectionEvents: [],
      _statEventSeq: 0,
      _statEvents: [],
      _visualEvents: [],
    });
    const encounterLog = [bewitchMsg, encounterMsg];
    const encounterResult = applySanLossToPlayerWithInspection(
      1,
      2,
      oldGs.currentTurn,
      copyPlayers(oldGs.players),
      [...oldGs.deck],
      [...oldGs.discard],
      encounterLog,
      makeInspectionMeta(oldGs),
      '邪神遭遇',
    );
    const encounterState = {
      ...oldGs,
      players: copyPlayers(encounterResult.P),
      deck: [...encounterResult.D],
      discard: [...encounterResult.Disc],
      log: [...encounterResult.L],
      ...encounterResult.inspectionMeta,
    };
    expect(encounterState.players[1].san).toBe(7);
    expect(encounterState._inspectionEvents).toHaveLength(0);

    const faithResult = resolveGodEncounterForAI(
      1,
      giftedGod,
      copyPlayers(encounterState.players),
      [...encounterState.deck],
      [...encounterState.discard],
      encounterState,
      true,
    );
    const newGs = {
      ...encounterState,
      players: faithResult.P,
      deck: faithResult.D,
      discard: faithResult.Disc,
      log: [...encounterState.log, ...faithResult.msgs],
      ...faithResult.inspectionMeta,
      ...faithResult.statePatch,
    };
    const replay = buildBewitchGiftReplay({
      oldGs,
      newGs,
      bewitchEvent: {
        sourceIdx: 0,
        targetIdx: 1,
        targetName: '贝拉',
        card: giftedGod,
        msgs: [bewitchMsg],
        encounterState,
      },
      logDelta: newGs.log,
      buildAnimQueue,
      copyPlayers,
    });
    const encounterInspections = replay.encounterQueue.filter(step => step?.inspectionSeq != null);
    const acceptanceInspections = replay.acceptanceQueue.filter(step => step?.inspectionSeq != null);
    const finalInspections = replay.queue.filter(step => step?.inspectionSeq != null);

    expect(replay.inspectionEvents).toHaveLength(1);
    expect(replay.inspectionEvents[0]).toMatchObject({ seq: 1, target: 1, card: sealCard });
    expect(encounterInspections).toHaveLength(0);
    expect(acceptanceInspections).toHaveLength(1);
    expect(acceptanceInspections[0]).toMatchObject({
      type: 'DRAW_CARD',
      inspectionSeq: 1,
      targetPid: 1,
      card: sealCard,
    });
    expect(acceptanceInspections[0]).not.toHaveProperty('cardAcquisitionStage');
    expect(finalInspections).toHaveLength(1);
    expect(finalInspections[0]).toMatchObject({
      inspectionSeq: 1,
      cardAcquisitionStage: 'acceptance',
    });

    const encounterSanIdx = replay.queue.findIndex(step => (
      step?.type === 'SAN_DAMAGE' && step?.cardAcquisitionStage === 'godEncounter'
    ));
    const convertSanIdx = replay.queue.findIndex(step => (
      step?.type === 'SAN_DAMAGE' && step?.cardAcquisitionStage === 'acceptance'
    ));
    const inspectionIdx = replay.queue.findIndex(step => step?.inspectionSeq === 1);
    const highlightIdx = replay.queue.findIndex(step => step?.type === 'GOD_HIGHLIGHT' && step?.targetPid === 1);
    expect([encounterSanIdx, convertSanIdx, inspectionIdx, highlightIdx].every(index => index >= 0)).toBe(true);
    expect(encounterSanIdx).toBeLessThan(convertSanIdx);
    expect(convertSanIdx).toBeLessThan(inspectionIdx);
    expect(inspectionIdx).toBeLessThan(highlightIdx);
  });

  it('玩家蛊惑 AI 改信时按语义事件播放改信与原信徒弃神牌的完整队列', () => {
    const convertedOldGod = makeGodCard('NYA', { id: 'converted-old-nya' });
    const giftedGod = makeGodCard('TSG', { id: 'gifted-tsg' });
    const abandonedGod = makeGodCard('TSG', { id: 'abandoned-old-tsg' });
    const bewitchMsg = '你对 贝拉 【蛊惑】，赠予 蟾蜍之神';
    const encounterMsg = '贝拉 遭遇邪神 蟾蜍之神（第1次），失去1SAN';
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你', role: ROLE_CULTIST, roleRevealed: true, hand: [giftedGod] }),
        makePlayer({ name: '贝拉', san: 10, godName: 'NYA', godLevel: 1, godZone: [convertedOldGod] }),
        makePlayer({ name: '卡洛斯', san: 10, godName: 'TSG', godLevel: 1, godZone: [abandonedGod] }),
      ],
      currentTurn: 0,
      log: [],
      _inspectionEvents: [],
      _inspectionSeq: 0,
      _statEvents: [],
      _statEventSeq: 0,
      _visualEvents: [],
    });
    const playersAfterGift = copyPlayers(oldGs.players);
    playersAfterGift[0].hand = [];
    const encounterResult = applySanLossToPlayerWithInspection(
      1,
      1,
      oldGs.currentTurn,
      playersAfterGift,
      [],
      [],
      [bewitchMsg, encounterMsg],
      makeInspectionMeta(oldGs),
      '邪神遭遇',
    );
    const encounterState = {
      ...oldGs,
      players: copyPlayers(encounterResult.P),
      deck: [...encounterResult.D],
      discard: [...encounterResult.Disc],
      log: [...encounterResult.L],
      ...encounterResult.inspectionMeta,
    };
    const faithResult = resolveGodEncounterForAI(
      1,
      giftedGod,
      copyPlayers(encounterState.players),
      [...encounterState.deck],
      [...encounterState.discard],
      encounterState,
      true,
    );
    const bewitchEvent = createBewitchGiftEvent({
      sourceIdx: 0,
      targetIdx: 1,
      targetName: '贝拉',
      card: giftedGod,
      msgs: [bewitchMsg],
      encounterState,
    });
    const newGs = {
      ...encounterState,
      players: faithResult.P,
      deck: faithResult.D,
      discard: faithResult.Disc,
      log: [...encounterState.log, ...faithResult.msgs],
      ...faithResult.inspectionMeta,
      ...faithResult.statePatch,
      _visualEvents: [bewitchEvent, ...(faithResult.statePatch?._visualEvents || [])],
    };
    const replay = buildBewitchGiftReplay({
      oldGs,
      newGs,
      bewitchEvent,
      logDelta: newGs.log,
      buildAnimQueue,
      copyPlayers,
    });
    const queue = replay.queue;
    const encounterSanIdx = queue.findIndex(step => (
      step?.type === 'SAN_DAMAGE'
      && step?.cardAcquisitionStage === 'godEncounter'
      && step?.hitIndices?.includes(1)
    ));
    const convertDiscardIdx = queue.findIndex(step => step?.effect === 'godConvertDiscard' && step?.fromPid === 1);
    const convertSanIdx = queue.findIndex(step => (
      step?.type === 'SAN_DAMAGE'
      && step?.cardAcquisitionStage === 'acceptance'
      && step?.hitIndices?.includes(1)
    ));
    const highlightIdx = queue.findIndex(step => step?.type === 'GOD_HIGHLIGHT' && step?.targetPid === 1);
    const abandonDiscardIdx = queue.findIndex(step => step?.effect === 'godAbandon' && step?.fromPid === 2);
    const abandonSanIdx = queue.findIndex(step => (
      step?.type === 'SAN_DAMAGE'
      && step?.cardAcquisitionStage === 'acceptance'
      && step?.hitIndices?.includes(2)
    ));

    expect(queue.slice(0, 3).map(step => step.type)).toEqual(['SKILL_BEWITCH', 'CARD_TRANSFER', 'DRAW_CARD']);
    expect([
      encounterSanIdx,
      convertDiscardIdx,
      convertSanIdx,
      highlightIdx,
      abandonDiscardIdx,
      abandonSanIdx,
    ].every(index => index >= 0)).toBe(true);
    expect([
      encounterSanIdx,
      convertDiscardIdx,
      convertSanIdx,
      highlightIdx,
      abandonDiscardIdx,
      abandonSanIdx,
    ]).toEqual([...[
      encounterSanIdx,
      convertDiscardIdx,
      convertSanIdx,
      highlightIdx,
      abandonDiscardIdx,
      abandonSanIdx,
    ]].sort((left, right) => left - right));
    expect(queue[convertDiscardIdx]).toMatchObject({ cards: [convertedOldGod], dest: 'discard', faceUp: true });
    expect(queue[abandonDiscardIdx]).toMatchObject({ cards: [abandonedGod], dest: 'discard', faceUp: true });
  });

  it('检定回放委托 inspection-aware 队列并返回新的检定事件', () => {
    const inspectionCard = { id: 'inspect-1', name: '迫害妄想' };
    const beforePlayers = [makePlayer({ name: '你', san: 6 })];
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[0].san = 5;
    const oldGs = {
      players: beforePlayers,
      log: ['旧日志'],
      _inspectionSeq: 0,
      _statEventSeq: 0,
    };
    const newGs = {
      players: afterPlayers,
      log: ['旧日志', '你 的SAN检定结果为"迫害妄想"', '你 失去 1 SAN'],
      _inspectionSeq: 1,
      _inspectionEvents: [{
        seq: 1,
        card: inspectionCard,
        target: 0,
        beforePlayers,
        beforeLog: ['旧日志'],
        afterPlayers,
        afterLog: ['旧日志', '你 的SAN检定结果为"迫害妄想"', '你 失去 1 SAN'],
      }],
    };

    const replay = buildInspectionReplay(oldGs, newGs, {
      buildAnimQueue: vi.fn(() => []),
      copyPlayers,
    });

    expect(replay.inspectionEvents).toHaveLength(1);
    expect(replay.inspectionSeq).toBe(1);
    expect(replay.queue.map(step => step.type)).toEqual(['VISUAL_LOCK', 'DRAW_CARD', 'STATE_PATCH']);
    expect(replay.queue[1]).toMatchObject({ card: inspectionCard, triggerName: '检定牌', targetPid: 0 });
  });

  it('随机目标回放生成完整队列并追加最终状态补丁', () => {
    const beforePlayers = [
      makePlayer({ name: '你', hp: 10 }),
      makePlayer({ name: '艾伦', hp: 10 }),
    ];
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[1].hp = 7;
    const oldGs = {
      players: beforePlayers,
      log: [],
      _randomTargetSeq: 0,
      _statEventSeq: 0,
    };
    const newGs = {
      players: afterPlayers,
      discard: [{ id: 'discard-1' }],
      phase: 'ACTION',
      abilityData: {},
      log: ['你 掷出 4 点，随机砸向 艾伦（距离1），造成 3 HP 伤害'],
      _randomTargetSeq: 1,
      _randomTargetEvents: [{
        seq: 1,
        sourceIdx: 0,
        targetIdx: 1,
        label: '投掷石块',
        roll: 4,
        distance: 1,
        damage: 3,
        diceBefore: true,
        phaseOrder: 1,
      }],
      _statEventSeq: 1,
      _statEvents: [{
        type: 'HP_LOSS',
        target: 1,
        from: { hp: 10, san: 10, isDead: false },
        to: { hp: 7, san: 10, isDead: false },
        seq: 1,
        phaseOrder: 2,
      }],
    };

    expect(hasFreshRandomTargetEvents(newGs, oldGs)).toBe(true);
    const replay = buildRandomTargetReplay({
      oldGs,
      newGs,
      logDelta: newGs.log,
      buildAnimQueue,
      copyPlayers,
    });

    expect(replay.queue.map(step => step.type)).toEqual(['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE', 'HP_DAMAGE', 'STATE_PATCH']);
    expect(replay.queue[0]).toMatchObject({ diceMode: 'throwStone', d1: 4 });
    expect(replay.queue[1]).toMatchObject({ sourceIdx: 0, targetIdx: 1, label: '投掷石块' });
    expect(replay.queue[2]).toMatchObject({ type: 'THROW_STONE', sourceIdx: 0, targetIdx: 1, damage: 3 });
    expect(replay.queue[3]).toMatchObject({ hitIndices: [1] });
    expect(replay.queue.at(-1)).toMatchObject({
      players: afterPlayers,
      discard: newGs.discard,
      log: newGs.log,
      phase: 'ACTION',
      abilityData: {},
    });
  });

  it('纯显式随机目标事件不依赖 legacy 序号也会进入回放', () => {
    const event = createRandomTargetVisualEvent({
      seq: 4,
      sourceIdx: 0,
      targetIdx: 1,
      label: '白化生物',
    });

    expect(hasFreshRandomTargetEvents({ _visualEvents: [event] }, { _visualEvents: [] })).toBe(true);
    expect(hasFreshRandomTargetEvents({ _visualEvents: [event] }, { _visualEvents: [event] })).toBe(false);
  });
});
