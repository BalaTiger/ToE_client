import { describe, expect, it } from 'vitest';
import {
  applyStatEventsToDisplayStats,
  buildStatEvents,
  statEventsToAnimQueue,
} from '../statEvents';
import { makePlayer } from './factory';

describe('statEvents', () => {
  it('旧的 SAN 伤害步骤不会把已降到 6 的显示值回滚到 7', () => {
    const displayStats = [{ hp: 10, san: 6 }];
    const staleDamage = [{
      type: 'SAN_LOSS',
      target: 0,
      from: { hp: 10, san: 9 },
      to: { hp: 10, san: 7 },
    }];

    expect(applyStatEventsToDisplayStats(displayStats, staleDamage, 'SAN_DAMAGE')).toEqual([
      { hp: 10, san: 6 },
    ]);
  });

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

  it('不同 seq 的显式事件按结算顺序生成动画，后续 SAN 回复不会抢跑', () => {
    const players = [
      makePlayer({ name: '贝拉', hp: 10, san: 7 }),
      makePlayer({ name: '卡洛斯', hp: 10, san: 7 }),
      makePlayer({ name: '黛安娜', hp: 10, san: 7 }),
    ];
    const events = [
      { seq: 1, type: 'HP_LOSS', target: 0, from: { hp: 10, san: 7 }, to: { hp: 9, san: 7 } },
      { seq: 1, type: 'SAN_LOSS', target: 0, from: { hp: 9, san: 7 }, to: { hp: 9, san: 6 } },
      { seq: 1, type: 'HP_LOSS', target: 1, from: { hp: 10, san: 7 }, to: { hp: 9, san: 7 } },
      { seq: 1, type: 'SAN_LOSS', target: 1, from: { hp: 9, san: 7 }, to: { hp: 9, san: 6 } },
      { seq: 2, type: 'HP_LOSS', target: 1, from: { hp: 9, san: 6 }, to: { hp: 8, san: 6 } },
      { seq: 3, type: 'SAN_GAIN', target: 2, from: { hp: 9, san: 6 }, to: { hp: 9, san: 7 } },
    ];

    const queue = statEventsToAnimQueue(events, players, ['全体存活角色失去 1 HP 和 SAN']);

    expect(queue.map(step => step.type)).toEqual(['HP_DAMAGE', 'SAN_DAMAGE', 'HP_DAMAGE', 'SAN_HEAL']);
    expect(queue[0]).toMatchObject({ hitIndices: [0, 1] });
    expect(queue[1]).toMatchObject({ hitIndices: [0, 1] });
    expect(queue[2]).toMatchObject({ hitIndices: [1] });
    expect(queue[3]).toMatchObject({ hitIndices: [2] });
  });

  it('石化死亡先播放面板石化动画，再复用通用死亡公告', () => {
    const players = [
      makePlayer({ name: '你', hp: 10, san: 8 }),
      makePlayer({ name: '艾伦', hp: 0, san: 5, isDead: true }),
    ];
    const events = [
      { type: 'PETRIFY_DEATH', target: 1, from: { hp: 2, san: 5, isDead: false }, to: { hp: 0, san: 5, isDead: true } },
    ];

    const queue = statEventsToAnimQueue(events, players, ['艾伦 被石化']);

    expect(queue.map(step => step.type)).toEqual(['PETRIFY_DEATH', 'DEATH']);
    expect(queue[0]).toMatchObject({ hitIndices: [1], msgs: [] });
    expect(queue[1]).toMatchObject({ hitIndices: [1], msgs: ['艾伦 被石化'] });
  });

  it('两人一绳断裂会拆成原伤害、断裂、绳索伤害三段', () => {
    const before = [
      makePlayer({ name: '你', hp: 10, damageLink: { active: true, partner: 1 } }),
      makePlayer({ name: '艾伦', hp: 10, damageLink: { active: true, partner: 0 } }),
    ];
    const after = [
      makePlayer({ name: '你', hp: 5, damageLink: { active: false, partner: 1 } }),
      makePlayer({ name: '艾伦', hp: 7, damageLink: { active: false, partner: 0 } }),
    ];
    const logs = ['你 失去 2 HP', '【两人一绳】绳索断裂！你 和 艾伦 各失去 3 HP'];

    const events = buildStatEvents(before, after, logs, { reason: '测试', seq: 9 });
    const queue = statEventsToAnimQueue(events, after, logs);

    expect(events.map(event => event.type)).toEqual(['HP_LOSS', 'DAMAGE_LINK_BREAK', 'HP_LOSS', 'HP_LOSS']);
    expect(queue.map(step => step.type)).toEqual(['HP_DAMAGE', 'STATE_PATCH', 'TURN_BOUNDARY_PAUSE', 'HP_DAMAGE']);
    expect(queue[0].hitIndices).toEqual([0]);
    expect(queue[0].msgs).toEqual(['你 失去 2 HP']);
    expect(queue[1]._logChunk).toEqual(['【两人一绳】绳索断裂！你 和 艾伦 各失去 3 HP']);
    expect(queue[1].players[0].damageLink.active).toBe(false);
    expect(queue[1].players[0].hp).toBe(8);
    expect(queue[3].hitIndices.sort()).toEqual([0, 1]);
  });

  it('按事件目标更新显示数值', () => {
    const displayStats = [{ hp: 10, san: 8 }, { hp: 5, san: 3 }];
    const events = [{ type: 'SAN_LOSS', target: 1, from: { hp: 5, san: 3 }, to: { hp: 5, san: 1 } }];

    expect(applyStatEventsToDisplayStats(displayStats, events)).toEqual([
      { hp: 10, san: 8 },
      { hp: 5, san: 1 },
    ]);
  });

  it('HP/SAN 同时变动时按各自动画分阶段更新数值条', () => {
    const displayStats = [{ hp: 10, san: 8 }];
    const events = [{
      type: 'HP_SAN_LOSS',
      target: 0,
      from: { hp: 10, san: 8 },
      to: { hp: 7, san: 6 },
    }];
    const players = [makePlayer({ hp: 7, san: 6 })];

    expect(statEventsToAnimQueue(events, players).map(step => step.type)).toEqual([
      'HP_DAMAGE',
      'SAN_DAMAGE',
    ]);
    const afterHpImpact = applyStatEventsToDisplayStats(displayStats, events, 'HP_DAMAGE');
    expect(afterHpImpact).toEqual([{ hp: 7, san: 8 }]);
    expect(applyStatEventsToDisplayStats(afterHpImpact, events, 'SAN_DAMAGE')).toEqual([
      { hp: 7, san: 6 },
    ]);
  });

  it('HP/SAN 同时回复时拆成各自的回复特效', () => {
    const displayStats = [{ hp: 5, san: 4 }];
    const events = [{
      type: 'HP_SAN_GAIN',
      target: 0,
      from: { hp: 5, san: 4 },
      to: { hp: 7, san: 6 },
    }];

    const queue = statEventsToAnimQueue(events, [makePlayer({ hp: 7, san: 6 })]);
    expect(queue.map(step => step.type)).toEqual([
      'HP_HEAL',
      'SAN_HEAL',
    ]);
    const afterHpHeal = applyStatEventsToDisplayStats(displayStats, queue[0].statEvents, queue[0].type);
    expect(afterHpHeal).toEqual([{ hp: 7, san: 4 }]);
    expect(applyStatEventsToDisplayStats(afterHpHeal, queue[1].statEvents, queue[1].type)).toEqual([
      { hp: 7, san: 6 },
    ]);
  });

  it('同一效果先扣减再恢复HP时按各自特效分段更新HP条', () => {
    const displayStats = [{ hp: 10, san: 8 }];
    const events = [
      { type: 'HP_LOSS', target: 0, from: { hp: 10, san: 8 }, to: { hp: 6, san: 8 } },
      { type: 'HP_GAIN', target: 0, from: { hp: 6, san: 8 }, to: { hp: 9, san: 8 } },
    ];
    const queue = statEventsToAnimQueue(events, [makePlayer({ hp: 9, san: 8 })]);

    expect(queue.map(step => step.type)).toEqual(['HP_DAMAGE', 'HP_HEAL']);
    expect(queue[0].statEvents).toEqual([events[0]]);
    expect(queue[1].statEvents).toEqual([events[1]]);
    const afterDamage = applyStatEventsToDisplayStats(displayStats, queue[0].statEvents, queue[0].type);
    expect(afterDamage).toEqual([{ hp: 6, san: 8 }]);
    expect(applyStatEventsToDisplayStats(afterDamage, queue[1].statEvents, queue[1].type)).toEqual([
      { hp: 9, san: 8 },
    ]);
  });

  it('同一效果先恢复再扣减SAN时保留事件顺序并分段更新SAN条', () => {
    const displayStats = [{ hp: 7, san: 4 }];
    const events = [
      { type: 'SAN_GAIN', target: 0, from: { hp: 7, san: 4 }, to: { hp: 7, san: 8 } },
      { type: 'SAN_LOSS', target: 0, from: { hp: 7, san: 8 }, to: { hp: 7, san: 5 } },
    ];
    const queue = statEventsToAnimQueue(events, [makePlayer({ hp: 7, san: 5 })]);

    expect(queue.map(step => step.type)).toEqual(['SAN_HEAL', 'SAN_DAMAGE']);
    expect(queue[0].statEvents).toEqual([events[0]]);
    expect(queue[1].statEvents).toEqual([events[1]]);
    const afterHeal = applyStatEventsToDisplayStats(displayStats, queue[0].statEvents, queue[0].type);
    expect(afterHeal).toEqual([{ hp: 7, san: 8 }]);
    expect(applyStatEventsToDisplayStats(afterHeal, queue[1].statEvents, queue[1].type)).toEqual([
      { hp: 7, san: 5 },
    ]);
  });
});
