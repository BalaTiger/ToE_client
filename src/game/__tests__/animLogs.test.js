import { describe, expect, it } from 'vitest';
import { prepareAnimQueueLogs } from '../animLogs';

describe('prepareAnimQueueLogs', () => {
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
});
