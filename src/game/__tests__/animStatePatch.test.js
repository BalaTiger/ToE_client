import { describe, expect, it } from 'vitest';
import { appendFinalStatePatch, finalStatePatch } from '../animStatePatch';

describe('animStatePatch', () => {
  it('从状态对象中按字段生成最终 STATE_PATCH', () => {
    const state = {
      players: [{ name: '你' }],
      discard: [{ id: 'd1' }],
      log: ['完成'],
      phase: 'ACTION',
      abilityData: { done: true },
      hidden: '不会写入',
    };

    expect(finalStatePatch(state, ['players', 'discard', 'log', 'phase', 'abilityData', 'missing'])).toEqual({
      type: 'STATE_PATCH',
      players: state.players,
      discard: state.discard,
      log: state.log,
      phase: 'ACTION',
      abilityData: { done: true },
    });
  });

  it('仅在已有动画队列时追加最终状态补丁', () => {
    const state = { players: [{ name: '你' }], discard: [], log: ['完成'] };
    const queue = [{ type: 'DRAW_CARD' }];

    expect(appendFinalStatePatch(queue, state)).toEqual([
      { type: 'DRAW_CARD' },
      { type: 'STATE_PATCH', players: state.players, discard: [], log: ['完成'] },
    ]);
    expect(appendFinalStatePatch([], state)).toEqual([]);
    expect(appendFinalStatePatch(null, state)).toEqual([]);
  });
});
