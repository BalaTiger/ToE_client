import { describe, expect, it } from 'vitest';
import { prepareAnimQueueLogs } from '../animLogs';

describe('prepareAnimQueueLogs', () => {
  it('keeps companion steps on the event log timeline even without their own event id', () => {
    const queue = prepareAnimQueueLogs([
      { type: 'SKILL_SWAP', visualEventId: 'swap:1', msgs: ['掉包'] },
      { type: 'STATE_PATCH', msgs: ['暗抽的手牌'] },
    ], { log: [] });
    expect(queue.map(step => [step._logSource, step._logChunk])).toEqual([
      ['visualEvent', ['掉包']],
      ['visualEvent', ['暗抽的手牌']],
    ]);
  });

  it('does not let a staged turn banner leak into a draw queue', () => {
    const turnLog = '── 贝拉 的回合开始 ──';
    const drawLog = '贝拉 摸到 [D2] 穴居人战争';
    const queue = prepareAnimQueueLogs(
      [{ type: 'DRAW_CARD', card: { key: '穴居人战争' }, msgs: [drawLog] }],
      {
        log: [turnLog, drawLog],
        _playersBeforeThisDraw: [{}],
        _turnStartLogs: [turnLog],
        _drawLogs: [drawLog],
        _statLogs: [],
        _visualEvents: [{ id: 'turn:bella', type: 'turnStart', turnStartStage: 'turnBanner', msgs: [turnLog] }],
      },
      [],
    );

    expect(queue[0]._logChunk).toEqual([drawLog]);
  });

  it('reveals the blind-drawn card for the local swap initiator only', () => {
    const takenCard = { isZone: true, letter: 'B', number: 2, name: '旧牌' };
    const state = {
      log: [],
      players: [{ name: '你' }, { name: '艾伦' }],
      _visualEvents: [
        { id: 'swap:local', type: 'swapCards', sourceIdx: 0, targetIdx: 1, takenCard },
        { id: 'swap:remote', type: 'swapCards', sourceIdx: 1, targetIdx: 0, takenCard },
      ],
    };
    const queue = prepareAnimQueueLogs([
      { type: 'SKILL_SWAP', visualEventId: 'swap:local', msgs: ['拿走 暗抽牌，还给 艾伦 [C3] 新牌'] },
      { type: 'SKILL_SWAP', visualEventId: 'swap:remote', msgs: ['拿走 暗抽牌，还给 你 [C3] 新牌'] },
    ], state);
    expect(queue[0]._logChunk).toEqual(['拿走 [B2] 旧牌，还给 艾伦 [C3] 新牌']);
    expect(queue[1]._logChunk).toEqual(['拿走 暗抽牌，还给 你 [C3] 新牌']);
  });
});
