import { describe, expect, it } from 'vitest';
import {
  buildPlayerTurnDrawQueue,
  buildSinglePlayerAiTurnStartReplayContext,
  buildSkippedTurnReplayQueue,
  buildTurnStartDrawReplayQueue,
  shouldReplaySinglePlayerAiTurnStart,
  withClearedReplayAnimFields,
} from '../turnAnimState';
import { startNextTurn } from '../turnEngine';
import { ROLE_CULTIST } from '../coreUtils';
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
});

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
  it('休息角色跳过回合时先完整播放其回合边界，再进入下一名 AI 的回合', () => {
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
    expect(allenGoatIdx).toBeGreaterThan(allenTurnIdx);
    expect(bellaTurnIdx).toBeGreaterThan(allenGoatIdx);
    expect(bellaGoatIdx).toBeGreaterThan(bellaTurnIdx);
    expect(combined.some(step => (step.msgs || []).some(msg => msg.includes('艾伦 从休息中醒来')))).toBe(true);
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

    expect(sanSteps).toHaveLength(1);
    expect(sanSteps[0].hitIndices).toEqual([2]);
    expect(sanSteps[0].statEvents).toMatchObject([{ seq: 2, target: 2 }]);
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
    const stone = makeZoneCard('B2', 0);
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
