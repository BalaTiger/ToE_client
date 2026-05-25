import { describe, expect, it } from 'vitest';
import {
  applyStatEventsToDisplayStats,
  buildStatEvents,
  statEventsToAnimQueue,
} from '../statEvents';
import { makePlayer } from './factory';

describe('statEvents', () => {
  it('从玩家前后状态生成 HP/SAN 事件', () => {
    const before = [
      makePlayer({ hp: 10, san: 8 }),
      makePlayer({ hp: 5, san: 3 }),
    ];
    const after = [
      makePlayer({ hp: 7, san: 8 }),
      makePlayer({ hp: 5, san: 5 }),
    ];

    expect(buildStatEvents(before, after, ['结算'], { reason: '测试', seq: 7 })).toMatchObject([
      { type: 'HP_LOSS', target: 0, reason: '测试', seq: 7 },
      { type: 'SAN_GAIN', target: 1, reason: '测试', seq: 7 },
    ]);
  });

  it('将显式事件转换成动画队列', () => {
    const players = [
      makePlayer({ hp: 7, san: 8 }),
      makePlayer({ hp: 5, san: 5 }),
    ];
    const events = [
      { type: 'HP_LOSS', target: 0, from: { hp: 10, san: 8 }, to: { hp: 7, san: 8 } },
      { type: 'SAN_GAIN', target: 1, from: { hp: 5, san: 3 }, to: { hp: 5, san: 5 } },
    ];

    const queue = statEventsToAnimQueue(events, players, ['结算']);

    expect(queue.map(step => step.type)).toEqual(['HP_DAMAGE', 'SAN_HEAL']);
    expect(queue[0]).toMatchObject({ hitIndices: [0], msgs: ['结算'] });
    expect(queue[1]).toMatchObject({ hitIndices: [1], targetStats: [{ hp: 7, san: 8, isDead: false }, { hp: 5, san: 5, isDead: false }] });
  });

  it('按事件目标更新显示数值', () => {
    const displayStats = [{ hp: 10, san: 8 }, { hp: 5, san: 3 }];
    const events = [{ type: 'SAN_LOSS', target: 1, from: { hp: 5, san: 3 }, to: { hp: 5, san: 1 } }];

    expect(applyStatEventsToDisplayStats(displayStats, events)).toEqual([
      { hp: 10, san: 8 },
      { hp: 5, san: 1 },
    ]);
  });
});
