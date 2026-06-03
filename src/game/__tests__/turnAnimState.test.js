import { describe, expect, it } from 'vitest';
import { buildPlayerTurnDrawQueue } from '../turnAnimState';

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
