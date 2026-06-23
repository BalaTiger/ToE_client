import { describe, expect, it } from 'vitest';
import {
  buildPlayerTurnDrawQueue,
  buildSinglePlayerAiTurnStartReplayContext,
  buildTurnStartDrawReplayQueue,
  shouldReplaySinglePlayerAiTurnStart,
} from '../turnAnimState';
import { startNextTurn } from '../turnEngine';
import { ROLE_CULTIST } from '../coreUtils';
import { makeGodCard, makeGs, makePlayer } from './factory';

function player(name) {
  return { name, hand: [], hp: 10, san: 10 };
}

describe('buildPlayerTurnDrawQueue', () => {
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
      _statEventSeq: 0,
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
