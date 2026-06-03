import { describe, expect, it } from 'vitest';
import { buildPlayerTurnDrawQueue, buildTurnStartDrawReplayQueue } from '../turnAnimState';

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
});
