import { describe, expect, it } from 'vitest';
import {
  buildPlayerTurnDrawQueue,
  buildSinglePlayerAiTurnStartReplayContext,
  buildSkippedTurnReplayQueue,
  buildTsathogguaSlimeGrantQueue,
  buildTurnStartDrawReplayQueue,
  TURN_START_ANIMATION_STAGE,
  shouldReplaySinglePlayerAiTurnStart,
  withClearedReplayAnimFields,
} from '../turnAnimState';
import { startNextTurn } from '../turnEngine';
import { ROLE_CULTIST } from '../coreUtils';
import { applyFx } from '../effectEngine';
import { applyStatEventsToDisplayStats, primeDisplayStatsForStatQueue } from '../statEvents';
import { buildFreshStatVisualEvents, createGodPowerBlockedEvent, createGodStatusChangedEvent } from '../visualEvents';
import { buildAnimQueue } from '../animQueueCore';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

function player(name) {
  return { name, hand: [], hp: 10, san: 10 };
}

describe('withClearedReplayAnimFields', () => {
  it('清理已播放的黑夜目标事件但保留序号水位，避免下个回合重播骰子', () => {
    const state = {
      _apophisTargetSeq: 7,
      _apophisTargetEvent: { seq: 7, actorIdx: 1, targetIdx: 0 },
      _statEvents: [{ seq: 3, target: 0 }],
    };

    const cleaned = withClearedReplayAnimFields(state);

    expect(cleaned._apophisTargetSeq).toBe(7);
    expect(cleaned._apophisTargetEvent).toBeNull();
    expect(cleaned._statEvents).toEqual(state._statEvents);
  });

  it('开始下个回合时清掉已播放的黑夜目标事件但保留序号水位', () => {
    const players = [
      makePlayer({ name: '黛安娜' }),
      makePlayer({ name: '艾伦' }),
    ];
    const nextCard = makeZoneCard('A1', 0, { id: 'next-turn-card' });
    const state = makeGs({
      players,
      currentTurn: 0,
      deck: [nextCard],
      log: ['黛安娜 尝试了所有目标，仍无法追捕'],
      _apophisTargetSeq: 3,
      _apophisTargetEvent: {
        seq: 3,
        actorIdx: 0,
        actorName: '黛安娜',
        targetIdx: 1,
        roll: 5,
        label: '选择【追捕】目标',
      },
    });

    const next = startNextTurn(state);

    expect(next._apophisTargetSeq).toBe(3);
    expect(next._apophisTargetEvent).toBeNull();
    const replayBaseline = { ...state, _apophisTargetSeq: 2 };
    expect(buildAnimQueue(replayBaseline, next).some(step => (
      step.type === 'DICE_ROLL' && step.diceMode === 'apophisNight'
    ))).toBe(false);
  });
});

describe('buildPlayerTurnDrawQueue', () => {
  it('牌堆耗尽时先完整播放弃牌堆重洗，再开始摸牌动画', () => {
    const card = makeZoneCard('D3', 0, { id: 'reshuffled-card', name: '偷吃龙蛋' });
    const beforePlayers = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const oldGs = makeGs({ players: beforePlayers, currentTurn: 0, deck: [], discard: [card], log: [] });
    const newGs = makeGs({
      players: beforePlayers,
      currentTurn: 1,
      phase: 'AI_TURN',
      deck: [],
      discard: [],
      _drawnCard: card,
      _aiDrawnCard: card,
      _playersBeforeThisDraw: beforePlayers,
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['牌堆耗尽，重洗弃牌堆', '艾伦 摸到 [D3] 偷吃龙蛋'],
      _turnDrawEvents: [{ card, drawerIdx: 1, drawerName: '艾伦', msgs: ['艾伦 摸到 [D3] 偷吃龙蛋'] }],
      log: ['── 艾伦 的回合开始 ──', '牌堆耗尽，重洗弃牌堆', '艾伦 摸到 [D3] 偷吃龙蛋'],
    });

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    expect(replay.queue.slice(0, 3).map(step => step.type)).toEqual([
      'YOUR_TURN',
      'DECK_RESHUFFLE',
      'DRAW_CARD',
    ]);
    expect(replay.queue[1].msgs).toEqual(['牌堆耗尽，重洗弃牌堆']);
    expect(replay.queue[2].msgs).not.toContain('牌堆耗尽，重洗弃牌堆');
  });

  it('does not replay discard for an AI god worshipped after a previous player abandoned a god', () => {
    const zhu = makeGodCard('ZHU');
    const beforePlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', role: ROLE_CULTIST, san: 10 }),
    ];
    const oldGs = makeGs({
      players: beforePlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['你放弃了邪神的馈赠'],
    });
    const newGs = makeGs({
      players: [
        beforePlayers[0],
        makePlayer({ name: '艾伦', role: ROLE_CULTIST, san: 9, godName: zhu.godKey, godLevel: 1, godZone: [zhu] }),
      ],
      currentTurn: 1,
      phase: 'AI_TURN',
      _drawnCard: zhu,
      _aiDrawnCard: zhu,
      _playersBeforeThisDraw: beforePlayers,
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['[调试] 艾伦（邪祀者）起手摸到 烛九阴'],
      log: [
        '你放弃了邪神的馈赠',
        '── 艾伦 的回合开始 ──',
        '[调试] 艾伦（邪祀者）起手摸到 烛九阴',
        '艾伦 遭遇邪神 烛九阴！（第1次）失去 1 SAN',
        '艾伦 信仰了 烛九阴，获得衔烛照幽(Lv.1)',
      ],
    });

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const highlight = replay.queue.find(step => step.type === 'GOD_HIGHLIGHT' && step.targetPid === 1);

    expect(replay.queue.some(step => step.type === 'DISCARD' && step.card === zhu)).toBe(false);
    expect(highlight?.visualSetupPatch?.players?.[1]).toMatchObject({
      godName: 'ZHU',
      godLevel: 1,
      godZone: [zhu],
    });
    expect(highlight?.visualSetupPatch?.players?.[1]?.hand).toEqual(beforePlayers[1].hand);
  });

  it('adds turn banner and draw flip even when the next turn belongs to another player', () => {
    const card = { id: 'next-card', name: '下一张牌', key: 'B2', type: 'zone' };
    const oldGs = {
      players: [player('你'), player('艾伦')],
      currentTurn: 0,
      phase: 'ACTION',
      log: ['弃置：[A1] 旧牌'],
    };
    const newGs = {
      players: [player('你'), player('艾伦')],
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      drawReveal: { card, drawerIdx: 1, needsDecision: true },
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['艾伦 摸到 [B2] 下一张牌'],
      log: ['弃置：[A1] 旧牌', '── 艾伦 的回合开始 ──', '艾伦 摸到 [B2] 下一张牌'],
    };

    const queue = buildPlayerTurnDrawQueue(oldGs, newGs, [{ type: 'DISCARD', msgs: ['弃置：[A1] 旧牌'] }]);

    expect(queue.map(step => step.type).slice(0, 3)).toEqual(['DISCARD', 'YOUR_TURN', 'DRAW_CARD']);
    expect(queue[1]).toMatchObject({ name: '艾伦' });
    expect(queue[2]).toMatchObject({ card, triggerName: '艾伦', targetPid: 1 });
  });
});

describe('buildTurnStartDrawReplayQueue', () => {
  it('上家回合结束的火把护罩只在下家回合悬浮文字前播放一次', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '贝拉', godName: 'TSG', godLevel: 1 }),
      makePlayer({ name: '卡洛斯' }),
    ];
    const drawnCard = makeGodCard('CTH', { id: 'carlos-cth-draw' });
    const blockedLog = '【引燃火把】贝拉 本回合不受邪神之力影响';
    const turnStartLog = '── 卡洛斯 的回合开始 ──';
    const drawLog = '卡洛斯 摸到 拉莱耶之主';
    const blockedEvent = createGodPowerBlockedEvent({
      playerIdx: 1,
      playerName: '贝拉',
      msgs: [blockedLog],
    });
    const oldGs = makeGs({
      players,
      currentTurn: 1,
      log: [blockedLog],
    });
    const newGs = makeGs({
      players,
      currentTurn: 2,
      phase: 'AI_GOD_CHOICE',
      _aiDrawnCard: drawnCard,
      _drawnCard: drawnCard,
      _preTurnPlayers: players,
      _playersBeforeThisDraw: players,
      _turnStartLogs: [turnStartLog],
      _drawLogs: [drawLog],
      _statLogs: [],
      _visualEvents: [blockedEvent],
      log: [blockedLog, blockedLog, turnStartLog, drawLog],
    });

    const boundaryQueue = buildTsathogguaSlimeGrantQueue(newGs);
    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const combinedQueue = [...boundaryQueue, ...replay.queue];
    const blockedSteps = combinedQueue.filter(step => step.type === 'GOD_POWER_BLOCKED');

    expect(blockedSteps).toHaveLength(1);
    expect(blockedSteps[0]).toMatchObject({
      targetPid: 1,
      visualEventId: blockedEvent.id,
    });
    expect(combinedQueue.indexOf(blockedSteps[0])).toBeLessThan(
      combinedQueue.findIndex(step => step.type === 'YOUR_TURN')
    );
  });

  it('上回合蛊惑产生的 GOD_STATUS_CHANGED 不会在下家回合开始重播', () => {
    const apoCard = makeGodCard('APO');
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '贝拉', godName: 'APO', godLevel: 1, godZone: [apoCard], hasBelievedGod: true }),
      makePlayer({ name: '卡洛斯' }),
    ];
    const drawnCard = makeZoneCard('B2', 0, { id: 'carlos-next-draw' });
    const godStatusEvent = createGodStatusChangedEvent({
      playerIdx: 1,
      playerName: '贝拉',
      godKey: 'APO',
      godLevel: 1,
      msgs: ['贝拉 信仰了 阿波菲斯，获得噬日灭世(Lv.1)'],
      playersBefore: players.map(p => ({ ...p, godName: null, godLevel: 0, godZone: [] })),
      playersAfter: players,
    });
    const oldGs = makeGs({
      players,
      currentTurn: 1,
      log: ['贝拉 信仰了 阿波菲斯，获得噬日灭世(Lv.1)'],
    });
    const newGs = makeGs({
      players,
      currentTurn: 2,
      phase: 'AI_TURN',
      _aiDrawnCard: drawnCard,
      _drawnCard: drawnCard,
      _preTurnPlayers: players,
      _playersBeforeThisDraw: players,
      _turnStartLogs: ['── 卡洛斯 的回合开始 ──'],
      _drawLogs: ['卡洛斯 摸到 [B2] 新鲜空气'],
      _visualEvents: [godStatusEvent],
      log: [
        '贝拉 信仰了 阿波菲斯，获得噬日灭世(Lv.1)',
        '── 卡洛斯 的回合开始 ──',
        '卡洛斯 摸到 [B2] 新鲜空气',
      ],
    });

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });

    expect(replay.queue.some(step => step.type === 'GOD_HIGHLIGHT')).toBe(false);
  });

  it('keeps a bespoke draw effect before the kept-card transfer on every client', () => {
    const snakeTrap = { id: 'snake-trap', key: 'D2', name: '群蛇陷阱', type: 'zone' };
    const beforePlayers = [player('林恩'), player('诺亚')];
    const afterPlayers = [player('林恩'), { ...player('诺亚'), hand: [snakeTrap] }];
    const replay = buildTurnStartDrawReplayQueue({
      oldGs: { players: beforePlayers, log: [] },
      newGs: {
        players: afterPlayers,
        currentTurn: 1,
        phase: 'ACTION',
        drawReveal: null,
        _drawnCard: snakeTrap,
        _playersBeforeThisDraw: beforePlayers,
        _turnStartLogs: ['── 诺亚 的回合开始 ──'],
        _drawLogs: ['诺亚 摸到 [D2] 群蛇陷阱'],
        _statLogs: ['【群蛇陷阱】分配了 2 层中毒：诺亚+1、林恩+1'],
        log: ['── 诺亚 的回合开始 ──', '诺亚 摸到 [D2] 群蛇陷阱', '你 收入了 [D2] 群蛇陷阱', '【群蛇陷阱】分配了 2 层中毒：诺亚+1、林恩+1'],
      },
      buildQueue: () => [
        { type: 'CARD_TRANSFER', effect: 'draw', fromPid: 1, toPid: 1, cards: [snakeTrap] },
        { type: 'SNAKE_TRAP', card: snakeTrap },
      ],
    });

    const effectIdx = replay.queue.findIndex(step => step.type === 'SNAKE_TRAP');
    const transferIndices = replay.queue
      .map((step, index) => (step.type === 'CARD_TRANSFER' && step.effect === 'draw' ? index : -1))
      .filter(index => index >= 0);
    expect(effectIdx).toBeGreaterThan(replay.queue.findIndex(step => step.type === 'DRAW_CARD'));
    expect(transferIndices).toHaveLength(1);
    expect(transferIndices[0]).toBeGreaterThan(effectIdx);
  });

  it('uses the latest AI turn visual events instead of replaying the previous AI draw', () => {
    const spring = { id: 'spring', name: '地下泉', key: 'C2', type: 'allHealHP', isZone: true };
    const bounce = { id: 'bounce', name: '触底反弹', key: 'C4', type: 'swapAllHands', isZone: true };
    const oldHeal = { type: 'HP_GAIN', target: 0, from: { hp: 6, san: 10 }, to: { hp: 8, san: 10 }, logHint: '全体存活角色回复 2 HP', seq: 1 };
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '贝拉' }), makePlayer({ name: '卡洛斯' })];
    const oldGs = makeGs({ players, currentTurn: 1, phase: 'AI_TURN', _statEventSeq: 1 });
    const newGs = makeGs({
      players,
      currentTurn: 2,
      phase: 'AI_TURN',
      _drawnCard: bounce,
      _aiDrawnCard: bounce,
      _playersBeforeThisDraw: players,
      _turnStartLogs: ['── 卡洛斯 的回合开始 ──'],
      _drawLogs: ['卡洛斯 摸到 [C4] 触底反弹，选择收入手牌并触发效果'],
      _statEvents: [oldHeal],
      _statEventSeq: 1,
      _visualEvents: [
        { type: 'turnStart', playerIdx: 1, playerName: '贝拉', msgs: ['── 贝拉 的回合开始 ──'] },
        { type: 'drawCard', playerIdx: 1, playerName: '贝拉', card: spring, msgs: ['贝拉 摸到 [C2] 地下泉'] },
        { type: 'statEvents', statEvents: [oldHeal], msgs: ['全体存活角色回复 2 HP'] },
        { type: 'turnStart', playerIdx: 2, playerName: '卡洛斯', msgs: ['── 卡洛斯 的回合开始 ──'] },
        { type: 'drawCard', playerIdx: 2, playerName: '卡洛斯', card: bounce, msgs: ['卡洛斯 摸到 [C4] 触底反弹，选择收入手牌并触发效果'] },
      ],
    });

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });

    expect(replay.queue.find(step => step.type === 'DRAW_CARD')?.card).toBe(bounce);
    expect(replay.queue.some(step => step.type === 'HP_HEAL')).toBe(false);
    expect(replay.queue.find(step => step.type === 'YOUR_TURN')).toMatchObject({ name: '卡洛斯' });
  });

  it('玩家休息提交后 AI 摸邪神不会按旧 gs 水位重播上一回合回血', () => {
    const vritra = makeGodCard('VRI');
    const restLog = '你选择【休息】，掷骰 6、2，取高值回复 6HP，翻面休息中';
    const restHeal = {
      seq: 1,
      type: 'HP_GAIN',
      target: 0,
      from: { hp: 4, san: 10, isDead: false },
      to: { hp: 10, san: 10, isDead: false },
      reason: '休息',
      logHint: restLog,
    };
    const beforeRestPlayers = [
      makePlayer({ name: '你', hp: 4 }),
      makePlayer({ name: '贝拉', role: ROLE_CULTIST }),
    ];
    const committedPlayers = [
      makePlayer({ name: '你', hp: 10, isResting: true }),
      makePlayer({ name: '贝拉', role: ROLE_CULTIST }),
    ];
    const oldGs = makeGs({
      players: beforeRestPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      _statEventSeq: 0,
      _statEvents: [],
      _visualEvents: [],
      log: [],
    });
    const turnLog = '── 贝拉 的回合开始 ──';
    const drawLog = '[调试] 贝拉（邪祀者）起手摸到 弗栗多';
    const newGs = makeGs({
      players: committedPlayers,
      currentTurn: 1,
      phase: 'AI_GOD_CHOICE',
      abilityData: { godCard: vritra, drawerIdx: 1 },
      _drawnCard: vritra,
      _aiDrawnCard: vritra,
      _preTurnPlayers: committedPlayers,
      _playersBeforeThisDraw: committedPlayers,
      _turnStartLogs: [turnLog],
      _drawLogs: [drawLog],
      _statLogs: [],
      _statEventSeq: 1,
      _statEvents: [restHeal],
      _visualEvents: [
        { id: 'bella-turn', type: 'turnStart', turnStartStage: 'turnBanner', playerIdx: 1, playerName: '贝拉', msgs: [turnLog] },
        { id: 'bella-vritra', type: 'drawCard', turnStartStage: 'draw', playerIdx: 1, playerName: '贝拉', card: vritra, msgs: [drawLog] },
      ],
      log: [restLog, turnLog, drawLog],
    });

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const committedDisplayStats = committedPlayers.map(player => ({ hp: player.hp, san: player.san }));

    expect(replay.queue.map(step => step.type)).toEqual(['YOUR_TURN', 'DRAW_CARD']);
    expect(replay.queue.some(step => step.type === 'HP_HEAL')).toBe(false);
    expect(primeDisplayStatsForStatQueue(committedDisplayStats, replay.queue)).toEqual(committedDisplayStats);
  });

  it('休息角色保留回合视觉边界，但不执行任何回合开始效果', () => {
    const goat = id => ({ id, name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true });
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '艾伦', isResting: true, hp: 8, san: 8, hand: [goat('a1'), goat('a2')] }),
        makePlayer({ name: '贝拉', hp: 8, san: 8, hand: [goat('b1'), goat('b2')] }),
      ],
      currentTurn: 0,
      deck: [makeZoneCard('D3')],
      inspectionDeck: [{ id: 'seal', name: '封印松动', effect: 'sealLoose', value: 0, type: 'negative' }],
      inspectionDiscard: [],
      log: [],
      _statEventSeq: 0,
      _statEvents: [],
      _inspectionSeq: 0,
      _inspectionEvents: [],
    });

    const newGs = startNextTurn(oldGs);
    const skippedQueue = buildSkippedTurnReplayQueue(newGs);
    const bellaReplay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const combined = [...skippedQueue, ...bellaReplay.queue];
    const allenTurnIdx = combined.findIndex(step => step.type === 'YOUR_TURN' && step.name === '艾伦');
    const allenGoatIdx = combined.findIndex(step => step.type === 'BLACK_GOAT_PULSE' && step.targetPid === 1);
    const bellaTurnIdx = combined.findIndex(step => step.type === 'YOUR_TURN' && step.name === '贝拉');
    const bellaGoatIdx = combined.findIndex(step => step.type === 'BLACK_GOAT_PULSE' && step.targetPid === 2);

    expect(newGs._skippedTurnReplays).toHaveLength(1);
    expect(allenTurnIdx).toBeGreaterThanOrEqual(0);
    expect(allenGoatIdx).toBe(-1);
    expect(bellaTurnIdx).toBeGreaterThan(allenTurnIdx);
    expect(bellaGoatIdx).toBeGreaterThan(bellaTurnIdx);
    expect(combined.some(step => (step.msgs || []).some(msg => msg.includes('艾伦 从休息中醒来')))).toBe(true);
  });

  it('翻面跳过只保留回合悬浮文字，不执行克苏鲁摸牌或任何阶段效果', () => {
    const dreamCard = {
      id: 'dream-heal',
      name: '猎获穴兽',
      key: 'B3',
      type: 'selfHealAdjHealHP',
      val: 3,
      adjVal: 2,
      isZone: true,
    };
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你', hp: 6 }),
        makePlayer({ name: '艾伦', isResting: true, godName: 'CTH', godLevel: 1, hp: 5 }),
        makePlayer({ name: '贝拉', hp: 6 }),
      ],
      currentTurn: 0,
      deck: [dreamCard, makeZoneCard('D3')],
      log: [],
      _statEventSeq: 0,
      _statEvents: [],
    });

    const newGs = startNextTurn(oldGs);
    const queue = buildSkippedTurnReplayQueue(newGs);
    const allenTurnIdx = queue.findIndex(step => step.type === 'YOUR_TURN' && step.name === '艾伦');
    const wakeIdx = queue.findIndex(step => step.type === 'STATE_PATCH' && step.players?.[1]?.isResting === false);
    const dreamIdx = queue.findIndex(step => step.type === 'CTH_RLYEH_DREAM');
    const drawIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === dreamCard);
    const effectIdx = queue.findIndex((step, idx) => idx > drawIdx && ['HP_HEAL', 'HP_SAN_HEAL'].includes(step.type));

    expect(newGs._skippedTurnReplays?.[0]?.cthReplay).toBeNull();
    expect(allenTurnIdx).toBeGreaterThanOrEqual(0);
    expect(wakeIdx).toBeGreaterThan(allenTurnIdx);
    expect(dreamIdx).toBe(-1);
    expect(drawIdx).toBe(-1);
    expect(effectIdx).toBe(-1);
  });

  it('plays black goat turn-start damage before the draw flip', () => {
    const goat = { id: 'goat-1', name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true };
    const card = { id: 'next-card', name: '下一张牌', key: 'B2', type: 'zone' };
    const preTurnPlayers = [
      player('你'),
      { ...player('艾伦'), hand: [goat], hp: 10, san: 10 },
    ];
    const beforeDrawPlayers = [
      player('你'),
      { ...player('艾伦'), hand: [goat], hp: 9, san: 9 },
    ];
    const oldGs = {
      players: preTurnPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: [],
      _statEventSeq: 1,
    };
    const goatLog = '【黑山羊幼仔】艾伦 失去 1 HP 和 1 SAN';
    const newGs = {
      players: beforeDrawPlayers,
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      drawReveal: { card, drawerIdx: 1, needsDecision: true },
      _preTurnPlayers: preTurnPlayers,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['艾伦 摸到 [B2] 下一张牌'],
      _statLogs: [],
      _statEventSeq: 1,
      _statEvents: [
        { type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10, isDead: false }, to: { hp: 9, san: 10, isDead: false }, reason: '黑山羊幼仔', logHint: goatLog, seq: 1 },
        { type: 'SAN_LOSS', target: 1, from: { hp: 10, san: 10, isDead: false }, to: { hp: 9, san: 9, isDead: false }, reason: '黑山羊幼仔', logHint: goatLog, seq: 1 },
      ],
      log: ['── 艾伦 的回合开始 ──', goatLog, '艾伦 摸到 [B2] 下一张牌'],
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const types = replay.queue.map(step => step.type);

    expect(types.slice(0, 5)).toEqual(['YOUR_TURN', 'BLACK_GOAT_PULSE', 'HP_DAMAGE', 'SAN_DAMAGE', 'STATE_PATCH']);
    expect(types.indexOf('DRAW_CARD')).toBeGreaterThan(types.indexOf('STATE_PATCH'));
    expect(replay.queue.find(step => step.type === 'BLACK_GOAT_PULSE')).toMatchObject({ targetPid: 1, count: 1 });
    expect(replay.stageQueues.turnBanner.map(step => step.type)).toEqual(['YOUR_TURN']);
    expect(replay.stageQueues.turnStart.map(step => step.type)).toEqual(types.slice(1, 5));
    expect(replay.stageQueues.draw[0]).toMatchObject({
      type: 'DRAW_CARD',
      turnStartStage: TURN_START_ANIMATION_STAGE.DRAW,
    });
    expect(replay.stageQueues.turnStart.every(step => (
      step.turnStartStage === TURN_START_ANIMATION_STAGE.TURN_START
    ))).toBe(true);
  });

  it('keeps black-goat HP/SAN damage before a following underground-spring heal event', () => {
    const goat = { id: 'goat-spring', name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true };
    const spring = { id: 'spring-after-goat', name: '地下泉', key: 'C2', type: 'allHealHP', isZone: true };
    const preTurnPlayers = [player('你'), { ...player('黛安娜'), hand: [goat], hp: 10, san: 10 }];
    const beforeDrawPlayers = [player('你'), { ...player('黛安娜'), hand: [goat], hp: 9, san: 9 }];
    const finalPlayers = [player('你'), { ...player('黛安娜'), hand: [goat, spring], hp: 10, san: 9 }];
    const goatLog = '【黑山羊幼仔】黛安娜 失去 1 HP 和 1 SAN';
    const healLog = '全体存活角色回复 1 HP';
    const goatEvents = [
      { type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10 }, to: { hp: 9, san: 10 }, reason: '黑山羊幼仔', logHint: goatLog, seq: 1 },
      { type: 'SAN_LOSS', target: 1, from: { hp: 9, san: 10 }, to: { hp: 9, san: 9 }, reason: '黑山羊幼仔', logHint: goatLog, seq: 1 },
    ];
    const healEvents = [
      { type: 'HP_GAIN', target: 1, from: { hp: 9, san: 9 }, to: { hp: 10, san: 9 }, reason: '地下泉', logHint: healLog, seq: 2 },
    ];
    const oldGs = { players: preTurnPlayers, currentTurn: 0, phase: 'ACTION', log: [], _statEventSeq: 0 };
    const newGs = {
      players: finalPlayers,
      currentTurn: 1,
      phase: 'AI_TURN',
      _preTurnPlayers: preTurnPlayers,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _drawnCard: spring,
      _aiDrawnCard: spring,
      _turnStartLogs: ['── 黛安娜 的回合开始 ──'],
      _drawLogs: ['黛安娜 摸到 [C2] 地下泉，选择收入手牌并触发效果'],
      _statLogs: [healLog],
      _statEvents: healEvents,
      _statEventSeq: 2,
      _visualEvents: [
        { id: 'goat-stats', type: 'statEvents', statEvents: goatEvents, msgs: [goatLog] },
        { id: 'spring-stats', type: 'statEvents', statEvents: healEvents, msgs: [healLog] },
      ],
      log: ['── 黛安娜 的回合开始 ──', goatLog, '黛安娜 摸到 [C2] 地下泉，选择收入手牌并触发效果', healLog],
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const types = replay.queue.map(step => step.type);

    expect(types.indexOf('BLACK_GOAT_PULSE')).toBeLessThan(types.indexOf('HP_DAMAGE'));
    expect(types.indexOf('HP_DAMAGE')).toBeLessThan(types.indexOf('SAN_DAMAGE'));
    expect(types.indexOf('SAN_DAMAGE')).toBeLessThan(types.indexOf('DRAW_CARD'));
    expect(types.indexOf('DRAW_CARD')).toBeLessThan(types.indexOf('HP_HEAL'));
    expect(replay.queue.find(step => step.type === 'SAN_DAMAGE')?.statEvents).toEqual(goatEvents.slice(1));
  });

  it('中毒数值动画属于回合开始阶段，不会泄露到摸牌翻牌之前', () => {
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '贝拉', poisonStacks: 1 }),
      ],
      currentTurn: 0,
      deck: [makeZoneCard('B3', 0, { id: 'after-poison' })],
      log: [],
    });
    const newGs = startNextTurn(oldGs);
    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const poisonStep = replay.queue.find(step => step.type === 'HP_DAMAGE' && step.statEvents?.some(event => event.reason === '中毒'));
    const drawIndex = replay.queue.findIndex(step => step.type === 'DRAW_CARD');

    expect(poisonStep).toMatchObject({ turnStartStage: TURN_START_ANIMATION_STAGE.TURN_START });
    expect(replay.queue.indexOf(poisonStep)).toBeLessThan(drawIndex);
    expect(replay.stageQueues.turnBanner.map(step => step.type)).toEqual(['YOUR_TURN']);
    expect(replay.stageQueues.turnStart).toContain(poisonStep);
  });

  it('replays real AI black-goat damage before an underground-spring draw', () => {
    const goat = { id: 'goat-real-spring', name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true };
    const spring = { id: 'spring-real-goat', name: '地下泉', key: 'C2', type: 'allHealHP', val: 1, isZone: true };
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你', hp: 8 }),
        makePlayer({ name: '黛安娜', role: 'treasure', hp: 10, san: 10, hand: [goat] }),
      ],
      currentTurn: 0,
      deck: [spring],
      log: [],
      _statEventSeq: 0,
      _statEvents: [],
    });

    const newGs = startNextTurn(oldGs, { isDebugMode: true });
    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const visibleTypes = replay.queue
      .filter(step => step.type !== 'VISUAL_LOCK' && step.type !== 'STATE_PATCH')
      .map(step => step.type);

    expect(newGs.log).toContain('【黑山羊幼仔】黛安娜 失去 1 HP 和 1 SAN');
    expect(visibleTypes.slice(0, 5)).toEqual([
      'YOUR_TURN',
      'BLACK_GOAT_PULSE',
      'HP_DAMAGE',
      'SAN_DAMAGE',
      'DRAW_CARD',
    ]);
    expect(visibleTypes.indexOf('DRAW_CARD')).toBeLessThan(visibleTypes.indexOf('HP_HEAL'));

    const statTimeline = replay.queue
      .filter(step => ['HP_DAMAGE', 'SAN_DAMAGE', 'HP_HEAL', 'SAN_HEAL'].includes(step.type))
      .map(step => ({ type: step.type, statEvents: step.statEvents }));
    let displayed = oldGs.players.map(player => ({ hp: player.hp, san: player.san }));
    const displayedTimeline = statTimeline.map(step => {
      displayed = applyStatEventsToDisplayStats(displayed, step.statEvents, step.type);
      return { type: step.type, hp: displayed[1].hp, san: displayed[1].san };
    });
    expect(displayedTimeline).toEqual([
      { type: 'HP_DAMAGE', hp: 9, san: 10 },
      { type: 'SAN_DAMAGE', hp: 9, san: 9 },
      { type: 'HP_HEAL', hp: 10, san: 9 },
    ]);
  });

  it('地磁反转摸牌动画从弃牌堆起飞', () => {
    const card = { id: 'disc-card', name: '弃牌堆牌', key: 'C1', type: 'zone' };
    const oldGs = {
      players: [player('你')],
      currentTurn: 0,
      phase: 'ACTION',
      log: [],
    };
    const newGs = {
      players: [{ ...player('你'), hand: [card] }],
      currentTurn: 0,
      phase: 'ACTION',
      drawReveal: { card, drawerIdx: 0, needsDecision: false, sourcePile: 'discard' },
      _playersBeforeThisDraw: [player('你')],
      _turnStartLogs: ['── 你 的回合开始 ──'],
      _drawLogs: ['【地磁反转】你 从弃牌堆暗抽了一张牌'],
      _drawSourcePile: 'discard',
      log: ['── 你 的回合开始 ──', '【地磁反转】你 从弃牌堆暗抽了一张牌'],
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const drawStep = replay.queue.find(step => step.type === 'DRAW_CARD');

    expect(drawStep).toMatchObject({ card, targetPid: 0, sourcePile: 'discard' });
  });

  it('AI 回合开始摸到阿波菲斯并进入神牌选择时保留回合悬浮文字和翻牌', () => {
    const apo = makeGodCard('APO');
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '艾伦', role: ROLE_CULTIST, san: 10 }),
      ],
      currentTurn: 0,
      phase: 'ACTION',
      deck: [apo],
      log: ['旧日志'],
    });
    const newGs = startNextTurn(oldGs);

    const replay = buildTurnStartDrawReplayQueue({
      oldGs,
      newGs,
      effectOldGs: { ...oldGs, players: newGs._playersBeforeThisDraw || oldGs.players },
    });
    const types = replay.queue.map(step => step.type);

    expect(types.slice(0, 2)).toEqual(['YOUR_TURN', 'DRAW_CARD']);
    expect(newGs.phase).toBe('AI_GOD_CHOICE');
    expect(replay.drawCardStep).toMatchObject({ card: apo, triggerName: '艾伦', targetPid: 1 });
  });

  it('AI 放弃邪神馈赠时播放弃牌动画而不是收入手牌飞牌', () => {
    const godCard = makeGodCard('NYA');
    const beforeDrawPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '贝拉', san: 10 }),
    ];
    const oldGs = makeGs({
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
    });
    const newGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '贝拉', san: 9 }),
      ],
      currentTurn: 1,
      phase: 'AI_TURN',
      discard: [godCard],
      _drawnCard: godCard,
      _aiDrawnCard: godCard,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 遭遇邪神 伏行之混沌！（第1次）失去 1 SAN'],
      _statLogs: ['贝拉 放弃了邪神的馈赠'],
      log: [
        '旧日志',
        '── 贝拉 的回合开始 ──',
        '贝拉 遭遇邪神 伏行之混沌！（第1次）失去 1 SAN',
        '贝拉 放弃了邪神的馈赠',
      ],
    });

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const discardIdx = replay.queue.findIndex(step => step.type === 'DISCARD' && step.card === godCard);
    const drawTransferIdx = replay.queue.findIndex(step => step.type === 'CARD_TRANSFER' && step.effect === 'draw');

    expect(discardIdx).toBeGreaterThan(replay.queue.findIndex(step => step.type === 'DRAW_CARD'));
    expect(drawTransferIdx).toBe(-1);
  });

  it('AI 寻宝者弃置回合开始摸牌时由动画队列延迟刷新弃牌堆', () => {
    const previousDiscard = makeZoneCard('A1', 0);
    const volcano = { ...makeZoneCard('C1', 0), name: '活火山' };
    const beforeDrawPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '黛安娜', role: 'treasureHunter' }),
    ];
    const oldGs = makeGs({
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      discard: [previousDiscard],
      log: ['旧日志'],
    });
    const newGs = makeGs({
      players: beforeDrawPlayers,
      currentTurn: 1,
      phase: 'AI_TURN',
      discard: [previousDiscard, volcano],
      _drawnCard: volcano,
      _aiDrawnCard: volcano,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _discardedDrawnCard: true,
      _turnStartLogs: ['── 黛安娜 的回合开始 ──'],
      _drawLogs: ['黛安娜 摸到 [C1] 活火山，评估后选择弃置'],
      log: [
        '旧日志',
        '── 黛安娜 的回合开始 ──',
        '黛安娜 摸到 [C1] 活火山，评估后选择弃置',
      ],
    });

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const banner = replay.queue.find(step => step.type === 'YOUR_TURN');
    const discardIdx = replay.queue.findIndex(step => step.type === 'DISCARD');
    const discardCommit = replay.queue.slice(discardIdx + 1).find(step => step.type === 'STATE_PATCH');

    expect(banner).toMatchObject({
      visualSetupTiming: 'queueStart',
      visualSetupPatch: { discard: [previousDiscard] },
    });
    expect(discardIdx).toBeGreaterThan(replay.queue.findIndex(step => step.type === 'DRAW_CARD'));
    expect(discardCommit?.discard).toEqual([previousDiscard, volcano]);
  });

  it('已揭示邪祀者将摸到的邪神牌收入手牌时播放收入飞牌动画', () => {
    const godCard = makeGodCard('TSG');
    const beforeDrawPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', role: ROLE_CULTIST, roleRevealed: true, hand: [] }),
    ];
    const oldGs = makeGs({
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
    });
    const newGs = makeGs({
      players: [
        beforeDrawPlayers[0],
        { ...beforeDrawPlayers[1], hand: [godCard], godEncounters: 2 },
      ],
      currentTurn: 1,
      phase: 'AI_TURN',
      _drawnCard: godCard,
      _aiDrawnCard: godCard,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['艾伦（邪祀者）遭遇邪神 蟾蜍之神！（第2次）免疫SAN损耗'],
      _statLogs: [],
      log: [
        '旧日志',
        '── 艾伦 的回合开始 ──',
        '艾伦（邪祀者）遭遇邪神 蟾蜍之神！（第2次）免疫SAN损耗',
        '艾伦（邪祀者）将邪神牌收入手牌',
      ],
    });

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const drawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD');
    const transferIdx = replay.queue.findIndex(step => step.type === 'CARD_TRANSFER' && step.effect === 'draw');

    expect(transferIdx).toBeGreaterThan(drawIdx);
    expect(replay.queue[transferIdx]).toMatchObject({
      fromPid: 1,
      dest: 'player',
      toPid: 1,
      sourceAnchor: 'playerArea',
      cards: [godCard],
    });
  });

  it('本地回合开始摸到邪神时先播放 SAN 扣减和检定翻牌再进入邪神抉择', () => {
    const cth = makeGodCard('CTH');
    const calm = { id: 'calm-check', name: '暂时的平静', effect: 'nothing', value: 0, type: 'neutral' };
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你', san: 7, godEncounters: 0 }),
        makePlayer({ name: '艾伦' }),
      ],
      currentTurn: 1,
      phase: 'ACTION',
      deck: [cth],
      inspectionDeck: [calm],
      inspectionDiscard: [],
      log: ['旧日志'],
      _inspectionSeq: 0,
      _statEventSeq: 0,
    });

    const newGs = startNextTurn(oldGs);
    const replay = buildTurnStartDrawReplayQueue({
      oldGs,
      newGs,
      effectOldGs: { ...oldGs, players: newGs._playersBeforeThisDraw || oldGs.players },
    });
    const types = replay.queue.map(step => step.type);
    const godDrawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === cth);
    const sanDamageIdx = types.indexOf('SAN_DAMAGE');
    const inspectionDrawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD' && step.triggerName === '检定牌');

    expect(newGs.phase).toBe('GOD_CHOICE');
    expect(newGs.log.slice(-2)).toEqual([
      '你 遭遇邪神 拉莱耶之主！（第1次）失去 1 SAN',
      '你 的SAN检定结果为"暂时的平静"',
    ]);
    expect(godDrawIdx).toBeGreaterThan(-1);
    expect(sanDamageIdx).toBeGreaterThan(godDrawIdx);
    expect(inspectionDrawIdx).toBeGreaterThan(sanDamageIdx);
    expect(newGs._drawLogs).toEqual(['你 摸到 拉莱耶之主', '你 遭遇邪神 拉莱耶之主！（第1次）失去 1 SAN']);
    expect(newGs._statLogs).toEqual(['你 的SAN检定结果为"暂时的平静"']);
  });

  it('AI 回合开始邪神遭遇只播放本次 SAN 扣减，不重播上个 AI 的扣减', () => {
    const apo = makeGodCard('APO');
    const allenSanLoss = {
      type: 'SAN_LOSS',
      target: 1,
      from: { hp: 10, san: 10, isDead: false },
      to: { hp: 10, san: 9, isDead: false },
      reason: '邪神遭遇',
      logHint: '艾伦 遭遇邪神 森之领主！（第1次）失去1SAN',
      seq: 1,
    };
    const bellaSanLoss = {
      type: 'SAN_LOSS',
      target: 2,
      from: { hp: 10, san: 10, isDead: false },
      to: { hp: 10, san: 9, isDead: false },
      reason: '邪神遭遇',
      logHint: '贝拉 遭遇邪神 阿波菲斯！（第1次）失去1SAN',
      seq: 2,
    };
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '艾伦', san: 9 }),
        makePlayer({ name: '贝拉', san: 10 }),
      ],
      currentTurn: 1,
      phase: 'ACTION',
      log: ['旧日志'],
      _statEvents: [allenSanLoss],
      _statEventSeq: 1,
    });
    const beforeDrawPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', san: 9 }),
      makePlayer({ name: '贝拉', san: 10 }),
    ];
    const newGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '艾伦', san: 9 }),
        makePlayer({ name: '贝拉', san: 9 }),
      ],
      currentTurn: 2,
      phase: 'AI_GOD_CHOICE',
      abilityData: { playerIndex: 2, godCard: apo },
      _drawnCard: apo,
      _aiDrawnCard: apo,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: [],
      _statLogs: ['贝拉 遭遇邪神 阿波菲斯！（第1次）失去1SAN'],
      _statEvents: [allenSanLoss, bellaSanLoss],
      _statEventSeq: 2,
      log: ['旧日志', '── 贝拉 的回合开始 ──', '贝拉 遭遇邪神 阿波菲斯！（第1次）失去1SAN'],
    });

    const replay = buildTurnStartDrawReplayQueue({
      oldGs,
      newGs,
      effectOldGs: { ...oldGs, players: beforeDrawPlayers },
    });
    const sanSteps = replay.queue.filter(step => step.type === 'SAN_DAMAGE');

    expect(sanSteps).toHaveLength(1);
    expect(sanSteps[0].hitIndices).toEqual([2]);
  });

  it('AI 连续邪神回合的视觉属性事件不会把上个 AI 的 SAN 扣减重播到本回合', () => {
    const zhu = makeGodCard('ZHU');
    const tsg = makeGodCard('TSG');
    const allenSanLoss = {
      type: 'SAN_LOSS',
      target: 1,
      from: { hp: 10, san: 10, isDead: false },
      to: { hp: 10, san: 9, isDead: false },
      reason: '邪神遭遇',
      logHint: '艾伦 遭遇邪神 烛九阴！（第1次）失去 1 SAN',
      seq: 1,
    };
    const bellaSanLoss = {
      type: 'SAN_LOSS',
      target: 2,
      from: { hp: 10, san: 10, isDead: false },
      to: { hp: 10, san: 9, isDead: false },
      reason: '邪神遭遇',
      logHint: '贝拉 遭遇邪神 蟾蜍之神！（第1次）失去 1 SAN',
      seq: 2,
    };
    const beforeDrawPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', san: 9, godName: zhu.godKey, godLevel: 1, godZone: [zhu] }),
      makePlayer({ name: '贝拉', san: 10 }),
    ];
    const oldGs = makeGs({
      players: beforeDrawPlayers,
      currentTurn: 1,
      phase: 'ACTION',
      log: ['旧日志', '艾伦 遭遇邪神 烛九阴！（第1次）失去 1 SAN'],
      _statEvents: [allenSanLoss],
      _statEventSeq: 1,
    });
    const newGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '艾伦', san: 9, godName: zhu.godKey, godLevel: 1, godZone: [zhu] }),
        makePlayer({ name: '贝拉', san: 9, godName: tsg.godKey, godLevel: 1, godZone: [tsg] }),
      ],
      currentTurn: 2,
      phase: 'AI_TURN',
      _drawnCard: tsg,
      _aiDrawnCard: tsg,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 遭遇邪神 蟾蜍之神！（第1次）失去 1 SAN'],
      _statLogs: ['贝拉 遭遇邪神 蟾蜍之神！（第1次）失去 1 SAN'],
      _statEvents: [allenSanLoss, bellaSanLoss],
      _statEventSeq: 2,
      _visualEvents: [{
        type: 'statEvents',
        statEvents: [allenSanLoss, bellaSanLoss],
        msgs: ['贝拉 遭遇邪神 蟾蜍之神！（第1次）失去 1 SAN'],
      }],
      log: [
        '旧日志',
        '艾伦 遭遇邪神 烛九阴！（第1次）失去 1 SAN',
        '── 贝拉 的回合开始 ──',
        '贝拉 遭遇邪神 蟾蜍之神！（第1次）失去 1 SAN',
        '贝拉 信仰了 蟾蜍之神，获得无定形体(Lv.1)',
      ],
    });

    const replay = buildTurnStartDrawReplayQueue({
      oldGs,
      newGs,
      effectOldGs: { ...oldGs, players: beforeDrawPlayers },
    });
    const sanSteps = replay.queue.filter(step => step.type === 'SAN_DAMAGE');
    const drawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === tsg.id);
    const highlightIdx = replay.queue.findIndex(step => step.type === 'GOD_HIGHLIGHT' && step.targetPid === 2);

    expect(sanSteps).toHaveLength(1);
    expect(sanSteps[0].hitIndices).toEqual([2]);
    expect(sanSteps[0].statEvents).toMatchObject([{ seq: 2, target: 2 }]);
    expect(sanSteps[0].turnStartStage).toBe(TURN_START_ANIMATION_STAGE.DRAW);
    expect(drawIdx).toBeGreaterThan(-1);
    expect(highlightIdx).toBeGreaterThan(drawIdx);
    expect(replay.queue[drawIdx].visualSetupPatch.players[2]).toMatchObject({
      godName: null,
      godLevel: 0,
    });
    expect(replay.queue[highlightIdx].visualSetupPatch.players[2]).toMatchObject({
      godName: 'TSG',
      godLevel: 1,
    });
  });

  it('AI 回合开始区域牌伤害只播放本次 HP 扣减，不重播上个 AI 的 HP 回复', () => {
    const legion = { id: 'legion', name: '亡者军团', key: 'A2', type: 'adjDamageHP', letter: 'A', number: 2, isZone: true };
    const healLog = '全体存活角色回复 1 HP';
    const damageLog = '贝拉 与相邻角色各失去 4 HP';
    const healEvents = [
      { type: 'HP_GAIN', target: 0, from: { hp: 7, san: 10 }, to: { hp: 8, san: 10 }, logHint: healLog, seq: 1 },
      { type: 'HP_GAIN', target: 1, from: { hp: 7, san: 10 }, to: { hp: 8, san: 10 }, logHint: healLog, seq: 1 },
      { type: 'HP_GAIN', target: 2, from: { hp: 7, san: 10 }, to: { hp: 8, san: 10 }, logHint: healLog, seq: 1 },
      { type: 'HP_GAIN', target: 3, from: { hp: 7, san: 10 }, to: { hp: 8, san: 10 }, logHint: healLog, seq: 1 },
    ];
    const damageEvents = [
      { type: 'HP_LOSS', target: 1, from: { hp: 8, san: 10 }, to: { hp: 4, san: 10 }, logHint: damageLog, seq: 2 },
      { type: 'HP_LOSS', target: 2, from: { hp: 8, san: 10 }, to: { hp: 4, san: 10 }, logHint: damageLog, seq: 2 },
      { type: 'HP_LOSS', target: 3, from: { hp: 8, san: 10 }, to: { hp: 4, san: 10 }, logHint: damageLog, seq: 2 },
    ];
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你', hp: 8 }),
        makePlayer({ name: '艾伦', hp: 8 }),
        makePlayer({ name: '贝拉', hp: 8 }),
        makePlayer({ name: '卡洛斯', hp: 8 }),
      ],
      currentTurn: 1,
      phase: 'ACTION',
      log: ['旧日志'],
      _statEvents: healEvents,
      _statEventSeq: 1,
    });
    const beforeDrawPlayers = oldGs.players.map(player => ({ ...player, hand: [...(player.hand || [])] }));
    const newGs = makeGs({
      players: [
        makePlayer({ name: '你', hp: 8 }),
        makePlayer({ name: '艾伦', hp: 4 }),
        makePlayer({ name: '贝拉', hp: 4 }),
        makePlayer({ name: '卡洛斯', hp: 4 }),
      ],
      currentTurn: 2,
      phase: 'AI_TURN',
      _drawnCard: legion,
      _aiDrawnCard: legion,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 [A2] 亡者军团，选择收入手牌并触发效果'],
      _statLogs: [damageLog],
      _statEvents: [...healEvents, ...damageEvents],
      _statEventSeq: 2,
      log: ['旧日志', '── 贝拉 的回合开始 ──', '贝拉 摸到 [A2] 亡者军团，选择收入手牌并触发效果', damageLog],
    });

    const replay = buildTurnStartDrawReplayQueue({
      oldGs,
      newGs,
      effectOldGs: { ...oldGs, players: beforeDrawPlayers },
    });

    expect(replay.queue.some(step => step.type === 'HP_HEAL')).toBe(false);
    const hpDamage = replay.queue.find(step => step.type === 'HP_DAMAGE');
    expect(hpDamage).toMatchObject({ hitIndices: [1, 2, 3] });
  });

  it('幽闭恐惧先结算 SAN，再逐张结算自残并同步 HP 数值', () => {
    const card = { id: 'claustrophobia', name: '幽闭恐惧', key: 'B1', type: 'adjDamageSAN', isZone: true };
    const oldPlayers = [
      makePlayer({ name: '你', hp: 10, san: 6 }),
      makePlayer({ name: '卡洛斯', hp: 10, san: 6 }),
      makePlayer({ name: '黛安娜', hp: 10, san: 6 }),
    ];
    const clonePlayers = players => players.map(player => ({ ...player, hand: [...(player.hand || [])], godZone: [...(player.godZone || [])] }));
    const afterSan = clonePlayers(oldPlayers);
    afterSan.forEach(player => { player.san = 4; });
    const afterDiana = clonePlayers(afterSan); afterDiana[2].hp = 8;
    const afterYou = clonePlayers(afterDiana); afterYou[0].hp = 8;
    const afterCarlos = clonePlayers(afterYou); afterCarlos[1].isResting = true;
    const drawLog = '黛安娜 摸到 [B1] 幽闭恐惧，选择收入手牌并触发效果';
    const sanLog = '黛安娜 与相邻角色各失去 2 SAN';
    const dianaReveal = '黛安娜 的SAN检定结果为"自残"';
    const dianaDamage = '黛安娜 自残，失去 2 HP';
    const youReveal = '你 的SAN检定结果为"自残"';
    const youDamage = '你 自残，失去 2 HP';
    const carlosReveal = '卡洛斯 的SAN检定结果为"昏睡"';
    const carlosSleep = '卡洛斯 昏睡，翻面';
    const statEvent = (seq, type, target, before, after, reason, logHint) => ({
      seq, type, target,
      from: { hp: before[target].hp, san: before[target].san, isDead: false },
      to: { hp: after[target].hp, san: after[target].san, isDead: false },
      reason, logHint,
    });
    const sanEvents = oldPlayers.map((_, target) => statEvent(1, 'SAN_LOSS', target, oldPlayers, afterSan, '幽闭恐惧', sanLog));
    const dianaHp = statEvent(2, 'HP_LOSS', 2, afterSan, afterDiana, '自残', dianaDamage);
    const youHp = statEvent(3, 'HP_LOSS', 0, afterDiana, afterYou, '自残', youDamage);
    const prefix = ['旧日志', '── 黛安娜 的回合开始 ──', drawLog, sanLog];
    const events = [
      { seq: 1, card: { name: '自残', effect: 'selfDamageHP' }, target: 2, beforePlayers: afterSan, beforeLog: prefix, afterPlayers: afterDiana, afterLog: [...prefix, dianaReveal, dianaDamage], statEvents: [dianaHp], statEventSeq: 2 },
      { seq: 2, card: { name: '自残', effect: 'selfDamageHP' }, target: 0, beforePlayers: afterDiana, beforeLog: [...prefix, dianaReveal, dianaDamage], afterPlayers: afterYou, afterLog: [...prefix, dianaReveal, dianaDamage, youReveal, youDamage], statEvents: [youHp], statEventSeq: 3 },
      { seq: 3, card: { name: '昏睡', effect: 'flip' }, target: 1, beforePlayers: afterYou, beforeLog: [...prefix, dianaReveal, dianaDamage, youReveal, youDamage], afterPlayers: afterCarlos, afterLog: [...prefix, dianaReveal, dianaDamage, youReveal, youDamage, carlosReveal, carlosSleep], statEvents: [], statEventSeq: null },
    ];
    const oldGs = makeGs({ players: oldPlayers, currentTurn: 1, log: ['旧日志'], _statEventSeq: 0, _inspectionSeq: 0 });
    const newGs = makeGs({
      players: afterCarlos, currentTurn: 2, phase: 'AI_TURN', log: events[2].afterLog,
      _drawnCard: card, _aiDrawnCard: card, _playersBeforeThisDraw: oldPlayers,
      _turnStartLogs: ['── 黛安娜 的回合开始 ──'], _drawLogs: [drawLog], _statLogs: [sanLog, dianaReveal, dianaDamage, youReveal, youDamage, carlosReveal, carlosSleep],
      _statEvents: [...sanEvents, dianaHp, youHp], _statEventSeq: 3, _inspectionEvents: events, _inspectionSeq: 3,
    });

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs, effectOldGs: oldGs });
    const visible = replay.queue.filter(step => step.type !== 'VISUAL_LOCK' && step.type !== 'STATE_PATCH');
    const sanIdx = visible.findIndex(step => step.type === 'SAN_DAMAGE');
    const reveals = visible.map((step, idx) => ({ step, idx })).filter(({ step }) => step.type === 'DRAW_CARD' && step.triggerName === '检定牌');
    const hpSteps = visible.map((step, idx) => ({ step, idx })).filter(({ step }) => step.type === 'HP_DAMAGE');
    expect(sanIdx).toBeLessThan(reveals[0].idx);
    expect(visible[sanIdx].msgs).toContain(sanLog);
    expect(reveals.map(({ step }) => step._logChunk)).toEqual([[dianaReveal], [youReveal], [carlosReveal]]);
    expect(hpSteps[0].idx).toBeGreaterThan(reveals[0].idx);
    expect(hpSteps[0].idx).toBeLessThan(reveals[1].idx);
    expect(hpSteps[0].step.msgs).toEqual(expect.arrayContaining([dianaReveal, dianaDamage]));
    expect(hpSteps[0].step.statEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 2, to: expect.objectContaining({ hp: 8 }) }),
    ]));
    expect(hpSteps[1].idx).toBeGreaterThan(reveals[1].idx);
    expect(hpSteps[1].idx).toBeLessThan(reveals[2].idx);
    expect(hpSteps[1].step.msgs).toEqual(expect.arrayContaining([youReveal, youDamage]));
    expect(hpSteps[1].step.statEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 0, to: expect.objectContaining({ hp: 8 }) }),
    ]));
    const carlosPatch = replay.queue.find(step => step.type === 'STATE_PATCH' && step._logChunk?.includes(carlosSleep));
    expect(carlosPatch?._logChunk).toEqual([carlosSleep]);
  });

  it('黏液额外摸牌会按摸牌阶段事件逐张翻牌', () => {
    const stone = makeZoneCard('B2', 0);
    const god = makeGodCard('ZHU');
    const beforeDrawPlayers = [player('你'), player('艾伦')];
    const oldGs = {
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
    };
    const newGs = {
      players: [player('你'), { ...player('艾伦'), san: 6, hand: [stone] }],
      currentTurn: 1,
      phase: 'AI_GOD_CHOICE',
      abilityData: { playerIndex: 1, godCard: god },
      _drawnCard: god,
      _aiDrawnCard: god,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: [
        '【无定形体】艾伦 额外摸到 [B2] 投掷石块',
        '艾伦 遭遇邪神 烛九阴！（第3次）失去 3 SAN',
      ],
      _turnDrawEvents: [
        { card: stone, drawerIdx: 1, drawerName: '艾伦', msgs: ['【无定形体】艾伦 额外摸到 [B2] 投掷石块'], fromTsathogguaSlime: true },
        { card: god, drawerIdx: 1, drawerName: '艾伦', msgs: ['艾伦 遭遇邪神 烛九阴！（第3次）失去 3 SAN'], fromTsathogguaSlime: true },
      ],
      _statLogs: ['艾伦 的SAN检定结果为"自残"', '艾伦 自残，失去 1 HP'],
      log: [
        '旧日志',
        '── 艾伦 的回合开始 ──',
        '【无定形体】艾伦 的2张撒托古亚的赐福黏液消失，本次摸牌阶段额外摸2张牌',
        '【无定形体】艾伦 额外摸到 [B2] 投掷石块',
        '艾伦 遭遇邪神 烛九阴！（第3次）失去 3 SAN',
      ],
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const turnSteps = replay.queue.filter(step => step.type === 'YOUR_TURN');
    const drawSteps = replay.queue.filter(step => step.type === 'DRAW_CARD');

    expect(turnSteps).toHaveLength(1);
    expect(drawSteps.map(step => step.card)).toEqual([stone, god]);
  });

  it('AI 回合开始触发触底反弹时先播放回合悬浮文字和翻牌，再播放整手交换', () => {
    const bounce = { id: 'bounce', name: '触底反弹', key: 'C4', type: 'swapAllHands', letter: 'C', number: 4, isZone: true };
    const beforeDrawPlayers = [
      player('你'),
      { ...player('贝拉'), hand: [{ id: 'b1' }, { id: 'b2' }] },
      { ...player('卡洛斯'), hand: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }] },
    ];
    const afterPlayers = [
      player('你'),
      { ...player('贝拉'), hand: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, bounce] },
      { ...player('卡洛斯'), hand: [{ id: 'b1' }, { id: 'b2' }] },
    ];
    const oldGs = {
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
    };
    const newGs = {
      players: afterPlayers,
      currentTurn: 1,
      phase: 'AI_TURN',
      log: [
        '旧日志',
        '── 贝拉 的回合开始 ──',
        '贝拉 摸到 [C4] 触底反弹，选择收入手牌并触发效果',
        '贝拉 与 卡洛斯 交换了全部手牌（4 张 ↔ 2 张）',
      ],
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: [
        '贝拉 摸到 [C4] 触底反弹，选择收入手牌并触发效果',
        '贝拉 与 卡洛斯 交换了全部手牌（4 张 ↔ 2 张）',
      ],
      _statLogs: [],
      _drawnCard: bounce,
      _aiDrawnCard: bounce,
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const types = replay.queue.map(step => step.type);

    expect(types[0]).toBe('YOUR_TURN');
    expect(types[1]).toBe('DRAW_CARD');
    expect(types.findIndex(type => type === 'CARD_TRANSFER')).toBeGreaterThan(types.indexOf('DRAW_CARD'));
  });

  it('AI 回合开始收入霉变食物时保留专用掷骰动画', () => {
    const moldyFood = makeZoneCard('A1', 0);
    const beforeDrawPlayers = [player('你'), player('贝拉')];
    const afterPlayers = [player('你'), { ...player('贝拉'), hp: 9, hand: [moldyFood], skipNextDraw: true, skipNextDrawReason: '霉变食物' }];
    const oldGs = {
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
    };
    const newGs = {
      players: afterPlayers,
      currentTurn: 1,
      phase: 'AI_TURN',
      log: [
        '旧日志',
        '── 贝拉 的回合开始 ──',
        '贝拉 摸到 [A1] 霉变食物，选择收入手牌并触发效果',
        '【霉变食物】贝拉 掷出 1 点（单数），失去 1 HP，下回合开始时不能摸牌',
      ],
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 [A1] 霉变食物，选择收入手牌并触发效果'],
      _statLogs: [],
      _drawnCard: moldyFood,
      _aiDrawnCard: moldyFood,
      _moldyFoodDiceSeq: 1,
      _moldyFoodDiceRoll: { d1: 1, isEven: false, actorIdx: 1, seq: 1 },
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const diceIdx = replay.queue.findIndex(step => step.type === 'DICE_ROLL' && step.diceMode === 'moldyFood');
    const drawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD');

    expect(diceIdx).toBeGreaterThan(drawIdx);
    expect(replay.queue[diceIdx]).toMatchObject({ d1: 1, rollerName: '贝拉' });
  });

  it('AI 霉变食物掷骰不会重播上回合钻地魔虫的随机目标转盘', () => {
    const moldyFood = makeZoneCard('A1', 0);
    const beforeDrawPlayers = [player('你'), player('艾伦'), player('黛安娜')];
    const afterPlayers = [
      player('你'),
      { ...player('艾伦'), hp: 10, hand: [moldyFood] },
      player('黛安娜'),
    ];
    // 模拟跨回合展示清理后的旧基线：日志仍在，但一次性事件水位未被带入。
    const oldGs = {
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['全体存活角色失去 2 HP', '艾伦 额外失去 2 HP'],
    };
    const newGs = {
      players: afterPlayers,
      currentTurn: 1,
      phase: 'AI_TURN',
      log: [
        ...oldGs.log,
        '── 艾伦 的回合开始 ──',
        '艾伦 摸到 [A1] 霉变食物，选择收入手牌并触发效果',
        '【霉变食物】艾伦 掷出 4 点（双数），恢复 2 HP',
      ],
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['艾伦 摸到 [A1] 霉变食物，选择收入手牌并触发效果'],
      _statLogs: ['【霉变食物】艾伦 掷出 4 点（双数），恢复 2 HP'],
      _drawnCard: moldyFood,
      _aiDrawnCard: moldyFood,
      _moldyFoodDiceSeq: 1,
      _moldyFoodDiceRoll: { d1: 4, isEven: true, actorIdx: 1, seq: 1 },
      _randomTargetSeq: 1,
      _randomTargetEvents: [{
        seq: 1,
        sourceIdx: 0,
        targetIdx: 1,
        label: '钻地魔虫',
        resultText: '艾伦 被选中',
      }],
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });

    expect(replay.queue).toContainEqual(expect.objectContaining({
      type: 'DICE_ROLL',
      diceMode: 'moldyFood',
      d1: 4,
    }));
    expect(replay.queue.some(step => step.type === 'RANDOM_TARGET')).toBe(false);
    expect(replay.queue.some(step => step.type === 'BURROWING_WORM')).toBe(false);
  });

  it('AI 收入霉变食物掷出双数后立即追捕时仍播放专用掷骰动画', () => {
    const moldyFood = makeZoneCard('A1', 0);
    const beforeDrawPlayers = [player('你'), { ...player('黛安娜'), hp: 7 }];
    const afterPlayers = [player('你'), { ...player('黛安娜'), hp: 9, hand: [moldyFood] }];
    const oldGs = {
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
      // The real AI hunt-wait presentation builds its baseline from the
      // already-resolved turn state, which still carries this watermark.
      _moldyFoodDiceSeq: 1,
      _moldyFoodDiceRoll: { d1: 4, isEven: true, actorIdx: 1, seq: 1 },
    };
    const newGs = {
      players: afterPlayers,
      currentTurn: 1,
      phase: 'HUNT_AI_REVEAL',
      log: [
        '旧日志',
        '── 黛安娜 的回合开始 ──',
        '黛安娜 摸到 [A1] 霉变食物，选择收入手牌并触发效果',
        '【霉变食物】黛安娜 掷出 4 点（双数），恢复 2 HP',
        '【黑夜】黛安娜 选择【追捕】目标掷出 5，目标未偏移',
        '黛安娜（追猎者）向你发动【追捕】！请选择亮出一张手牌',
      ],
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 黛安娜 的回合开始 ──'],
      _drawLogs: ['黛安娜 摸到 [A1] 霉变食物，选择收入手牌并触发效果'],
      _statLogs: ['【霉变食物】黛安娜 掷出 4 点（双数），恢复 2 HP'],
      _drawnCard: moldyFood,
      _aiDrawnCard: moldyFood,
      _moldyFoodDiceSeq: 1,
      _moldyFoodDiceRoll: { d1: 4, isEven: true, actorIdx: 1, seq: 1 },
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs, effectOldGs: oldGs });
    const diceIdx = replay.queue.findIndex(step => step.type === 'DICE_ROLL' && step.diceMode === 'moldyFood');
    const drawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD');

    expect(diceIdx).toBeGreaterThan(drawIdx);
    expect(replay.queue[diceIdx]).toMatchObject({ d1: 4, rollerName: '黛安娜' });
  });

  it('AI 回合开始收入区域牌时在效果后播放收入手牌飞牌', () => {
    const card = makeZoneCard('B2', 0);
    const beforeDrawPlayers = [player('你'), player('贝拉')];
    const afterPlayers = [player('你'), { ...player('贝拉'), hp: 8, hand: [card] }];
    const oldGs = {
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
    };
    const newGs = {
      players: afterPlayers,
      currentTurn: 1,
      phase: 'AI_TURN',
      log: ['旧日志', '── 贝拉 的回合开始 ──', '贝拉 摸到 [B2] 投掷石块，选择收入手牌并触发效果', '贝拉 失去 2 HP'],
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 [B2] 投掷石块，选择收入手牌并触发效果'],
      _statLogs: ['贝拉 失去 2 HP'],
      _drawnCard: card,
      _aiDrawnCard: card,
    };

    const replay = buildTurnStartDrawReplayQueue({
      oldGs,
      newGs,
      buildQueue: () => [{ type: 'HP_DAMAGE', hitIndices: [1] }],
    });
    const damageIdx = replay.queue.findIndex(step => step.type === 'HP_DAMAGE');
    const transferIdx = replay.queue.findIndex(step => step.type === 'CARD_TRANSFER' && step.effect === 'draw');

    expect(transferIdx).toBeGreaterThan(damageIdx);
    expect(replay.queue[transferIdx]).toMatchObject({
      fromPid: 1,
      dest: 'player',
      toPid: 1,
      sourceAnchor: 'playerArea',
      cards: [card],
    });
  });

  it('AI 回合开始收入投掷石块即使造成 0 伤害也播放骰子和转盘', () => {
    const stone = makeZoneCard('B2', 3);
    const limitDiscard = makeZoneCard('A1', 0);
    const beforeDrawPlayers = [
      player('你'),
      { ...player('贝拉'), hand: [limitDiscard] },
      player('艾伦'),
    ];
    const afterPlayers = [
      player('你'),
      { ...player('贝拉'), hand: [limitDiscard, stone] },
      player('艾伦'),
    ];
    const log = [
      '旧日志',
      '── 贝拉 的回合开始 ──',
      '贝拉 摸到 [B2] 投掷石块，选择收入手牌并触发效果',
      '贝拉 掷出 1 点，随机砸向 你（距离2），造成 0 HP 伤害',
      '贝拉 弃 [A1] 霉变食物（上限）',
    ];
    const oldGs = {
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
      _randomTargetSeq: 0,
    };
    const newGs = {
      players: afterPlayers,
      currentTurn: 1,
      phase: 'AI_TURN',
      log,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 [B2] 投掷石块，选择收入手牌并触发效果'],
      _statLogs: [],
      _drawnCard: stone,
      _aiDrawnCard: stone,
      _randomTargetSeq: 1,
      _randomTargetEvents: [{
        seq: 1,
        sourceIdx: 1,
        targetIdx: 0,
        label: '投掷石块',
        roll: 1,
        distance: 2,
        damage: 0,
        resultText: '你 被选中',
        diceBefore: true,
        phaseOrder: 1,
      }],
    };

    const replay = buildTurnStartDrawReplayQueue({
      oldGs,
      newGs,
      effectOldGs: {
        ...newGs,
        players: beforeDrawPlayers,
        log: ['旧日志', '── 贝拉 的回合开始 ──'],
      },
    });
    const diceIdx = replay.queue.findIndex(step => step.type === 'DICE_ROLL' && step.diceMode === 'throwStone');
    const randomIdx = replay.queue.findIndex(step => step.type === 'RANDOM_TARGET');
    const throwIdx = replay.queue.findIndex(step => step.type === 'THROW_STONE');
    const transferIdx = replay.queue.findIndex(step => step.type === 'CARD_TRANSFER' && step.effect === 'draw');

    expect(diceIdx).toBeGreaterThan(-1);
    expect(randomIdx).toBeGreaterThan(diceIdx);
    expect(throwIdx).toBeGreaterThan(randomIdx);
    expect(transferIdx).toBeGreaterThan(throwIdx);
    expect(replay.queue[diceIdx]).toMatchObject({ d1: 1, rollerName: '贝拉' });
    expect(replay.queue[randomIdx]).toMatchObject({ sourceIdx: 1, targetIdx: 0, roll: 1, damage: 0 });
    expect(replay.queue[throwIdx]).toMatchObject({ sourceIdx: 1, targetIdx: 0, damage: 0 });

    const resolvedBaselineReplay = buildTurnStartDrawReplayQueue({
      oldGs: {
        ...newGs,
        players: beforeDrawPlayers,
        log: ['旧日志', '── 贝拉 的回合开始 ──'],
      },
      newGs,
      effectOldGs: {
        ...newGs,
        players: beforeDrawPlayers,
        log: ['旧日志', '── 贝拉 的回合开始 ──'],
      },
    });
    expect(resolvedBaselineReplay.queue.map(step => step.type)).toEqual(expect.arrayContaining([
      'DICE_ROLL',
      'RANDOM_TARGET',
      'THROW_STONE',
    ]));
  });

  it('摸到邪神翻牌后不重播上一回合残留的投掷石块动画', () => {
    const nya = makeGodCard('NYA');
    const beforeDrawPlayers = [player('你'), player('贝拉'), player('艾伦')];
    const staleStoneEvent = {
      seq: 1,
      sourceIdx: 2,
      targetIdx: 1,
      label: '投掷石块',
      roll: 1,
      distance: 1,
      damage: 0,
      resultText: '贝拉 被选中',
      diceBefore: true,
      phaseOrder: 1,
    };
    // 上一回合（艾伦行动阶段）打出投掷石块后，_randomTargetSeq/_randomTargetEvents
    // 随 gs 残留到下一回合；两者水位都必须视为已消费
    const oldGs = {
      players: beforeDrawPlayers,
      currentTurn: 2,
      phase: 'ACTION',
      log: ['艾伦 掷出 1 点，随机砸向 贝拉（距离1），造成 0 HP 伤害'],
      _randomTargetSeq: 1,
      _randomTargetEvents: [staleStoneEvent],
    };
    const newGs = {
      players: [
        beforeDrawPlayers[0],
        { ...player('贝拉'), san: 9, godName: nya.godKey, godLevel: 1, godZone: [nya] },
        beforeDrawPlayers[2],
      ],
      currentTurn: 1,
      phase: 'AI_TURN',
      _drawnCard: nya,
      _aiDrawnCard: nya,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['[调试] 贝拉（邪祀者）起手摸到 伏行之混沌'],
      _statLogs: [],
      log: [
        '艾伦 掷出 1 点，随机砸向 贝拉（距离1），造成 0 HP 伤害',
        '── 贝拉 的回合开始 ──',
        '[调试] 贝拉（邪祀者）起手摸到 伏行之混沌',
        '贝拉 遭遇邪神 伏行之混沌！（第1次）失去 1 SAN',
      ],
      _randomTargetSeq: 1,
      _randomTargetEvents: [staleStoneEvent],
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });

    expect(replay.queue.some(step => step.type === 'DRAW_CARD')).toBe(true);
    expect(replay.queue.some(step => step.type === 'DICE_ROLL' && step.diceMode === 'throwStone')).toBe(false);
    expect(replay.queue.some(step => step.type === 'RANDOM_TARGET')).toBe(false);
    expect(replay.queue.some(step => step.type === 'THROW_STONE')).toBe(false);
  });

  it('AI 摸到惊扰蝙蝠时先播放蝙蝠专属动画再扣 HP', () => {
    const bats = { id: 'bats', name: '惊扰蝙蝠', key: 'C2', type: 'adjDamageHP', val: 2 };
    const beforeDrawPlayers = [player('你'), player('贝拉'), player('艾伦')];
    const oldGs = {
      players: beforeDrawPlayers.map(p => ({ ...p, hand: [] })),
      deck: [],
      discard: [],
      log: ['旧日志'],
      currentTurn: 0,
      phase: 'ACTION',
      _statEventSeq: 0,
    };
    // 通过真实 applyFx 产生 statePatch（cardEffect 视觉事件 + _statEvents 水位），
    // 再按 App startNextTurn 包装方式叠加 statEvents 视觉事件，避免手工拼状态漏字段
    const res = applyFx(bats, 1, null, oldGs.players.map(p => ({ ...p })), [], [], oldGs);
    const base = {
      ...oldGs,
      players: res.P,
      ...(res.statePatch || {}),
      currentTurn: 1,
      phase: 'AI_TURN',
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 [C2] 惊扰蝙蝠，选择收入手牌并触发效果'],
      _statLogs: res.msgs || [],
      _drawnCard: bats,
      _aiDrawnCard: bats,
      log: [
        '旧日志',
        '── 贝拉 的回合开始 ──',
        '贝拉 摸到 [C2] 惊扰蝙蝠，选择收入手牌并触发效果',
        ...(res.msgs || []),
      ],
    };
    const newGs = {
      ...base,
      _visualEvents: [
        ...buildFreshStatVisualEvents(base, 0),
        ...(base._visualEvents || []).map(event => ({
          ...event,
          turnStartStage: 'draw',
          turnStartStageOrder: 2,
        })),
      ].filter(Boolean),
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const batsIdx = replay.queue.findIndex(step => step.type === 'STARTLED_BATS');
    const hpDamageIndices = replay.queue
      .map((step, idx) => ({ step, idx }))
      .filter(({ step }) => step.type === 'HP_DAMAGE')
      .map(({ idx }) => idx);

    expect(batsIdx).toBeGreaterThan(-1);
    expect(hpDamageIndices).toHaveLength(1);
    expect(hpDamageIndices[0]).toBeGreaterThan(batsIdx);
  });

  it('AI 寻宝者回合开始规避霉变食物时先播放规避骰再播放霉变食物骰', () => {
    const moldyFood = makeZoneCard('A1', 0);
    const beforeDrawPlayers = [player('你'), player('贝拉')];
    const afterPlayers = [player('你'), { ...player('贝拉'), hp: 10, hand: [moldyFood] }];
    const oldGs = {
      players: beforeDrawPlayers,
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
    };
    const newGs = {
      players: afterPlayers,
      currentTurn: 1,
      phase: 'AI_TURN',
      log: [
        '旧日志',
        '── 贝拉 的回合开始 ──',
        '贝拉（寻宝者）摸到 [A1] 霉变食物，掷出 5 点，成功规避负面效果！',
        '【霉变食物】贝拉 掷出 1 点（单数），负面效果已规避',
      ],
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉（寻宝者）摸到 [A1] 霉变食物，掷出 5 点，成功规避负面效果！'],
      _statLogs: ['【霉变食物】贝拉 掷出 1 点（单数），负面效果已规避'],
      _drawnCard: moldyFood,
      _aiDrawnCard: moldyFood,
      _moldyFoodDiceSeq: 1,
      _moldyFoodDiceRoll: { d1: 1, isEven: false, actorIdx: 1, seq: 1, negativeAvoided: true },
    };

    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    const diceSteps = replay.queue.filter(step => step.type === 'DICE_ROLL');

    expect(diceSteps).toHaveLength(2);
    expect(diceSteps[0]).toMatchObject({ d1: 5, rollerName: '贝拉', dodgeSuccess: true });
    expect(diceSteps[1]).toMatchObject({ diceMode: 'moldyFood', d1: 1, rollerName: '贝拉', negativeAvoided: true });
    expect(replay.queue.indexOf(diceSteps[0])).toBeLessThan(replay.queue.indexOf(diceSteps[1]));
  });
});

describe('shouldReplaySinglePlayerAiTurnStart', () => {
  it('only matches single-player AI turn-start replay states with logs', () => {
    const baseState = {
      players: [player('你'), player('艾伦')],
      currentTurn: 1,
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
    };

    expect(shouldReplaySinglePlayerAiTurnStart({ ...baseState, phase: 'AI_TURN' })).toBe(true);
    expect(shouldReplaySinglePlayerAiTurnStart({ ...baseState, phase: 'AI_GOD_CHOICE' })).toBe(true);
    expect(shouldReplaySinglePlayerAiTurnStart({ ...baseState, phase: 'AI_TURN', _isMP: true })).toBe(false);
    expect(shouldReplaySinglePlayerAiTurnStart({ ...baseState, phase: 'ACTION' })).toBe(false);
    expect(shouldReplaySinglePlayerAiTurnStart({ ...baseState, phase: 'AI_TURN', currentTurn: 0 })).toBe(false);
    expect(shouldReplaySinglePlayerAiTurnStart({ ...baseState, phase: 'AI_TURN', _turnStartLogs: [] })).toBe(false);
  });
});

describe('buildSinglePlayerAiTurnStartReplayContext', () => {
  it('prepares replay inputs from the current state and the AI pre-draw snapshot', () => {
    const currentGs = {
      players: [player('你'), player('艾伦')],
      currentTurn: 0,
      phase: 'ACTION',
      zhuLight: { ownerIdx: 0 },
    };
    const beforeDrawPlayers = [player('你'), { ...player('艾伦'), san: 9 }];
    const nextGs = {
      ...currentGs,
      players: [player('你'), { ...player('艾伦'), hand: [{ id: 'apo', name: '阿波菲斯' }] }],
      currentTurn: 1,
      phase: 'AI_GOD_CHOICE',
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
    };

    const context = buildSinglePlayerAiTurnStartReplayContext(currentGs, nextGs);

    expect(context).toMatchObject({ actorName: '艾伦' });
    expect(context.oldGs).toBe(currentGs);
    expect(context.effectOldGs.players).toBe(beforeDrawPlayers);
    expect(context.effectOldGs.zhuLight).toEqual(currentGs.zhuLight);
  });

  it('reduces skipped turns to banners only before a decision gate', () => {
    const state = makeGs({
      players: [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })],
      _skippedTurnReplays: [{
        playerIdx: 1,
        playerName: '艾伦',
        restingSkip: true,
        turnStartLogs: ['turn start'],
        beforePlayers: [],
        afterPlayers: [],
        beforeLog: [],
        afterLog: ['turn skipped'],
        cthReplay: { draws: [{ id: 'must-not-replay', name: 'card' }] },
      }],
    });

    expect(buildSkippedTurnReplayQueue(state, { bannersOnly: true })).toEqual([{
      type: 'YOUR_TURN',
      name: '艾伦',
      msgs: ['turn start'],
      turnStartStage: TURN_START_ANIMATION_STAGE.TURN_BANNER,
    }]);
  });

  it('returns null for states that should not replay AI turn start', () => {
    const currentGs = { players: [player('你'), player('艾伦')], currentTurn: 0, phase: 'ACTION' };

    expect(buildSinglePlayerAiTurnStartReplayContext(currentGs, {
      ...currentGs,
      currentTurn: 0,
      phase: 'AI_TURN',
      _turnStartLogs: ['── 你 的回合开始 ──'],
    })).toBeNull();
  });
});
