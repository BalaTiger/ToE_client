import { describe, expect, it } from 'vitest';
import { buildAnimQueue } from '../animQueueCore';
import { makeGs, makePlayer } from './factory';

describe('buildAnimQueue stat animations', () => {
  it('不会仅因 SAN 数值上升就播放 SAN 回复特效', () => {
    const oldGs = makeGs({
      players: [makePlayer({ san: 3 })],
      log: ['旧日志'],
    });
    const newGs = makeGs({
      players: [makePlayer({ san: 5 })],
      log: ['旧日志', '你 的SAN检定结果为"昏睡"'],
    });

    expect(buildAnimQueue(oldGs, newGs).some(step => step.type === 'SAN_HEAL')).toBe(false);
  });

  it('有 SAN 回复日志且数值上升时播放 SAN 回复特效', () => {
    const oldGs = makeGs({
      players: [makePlayer({ san: 3 })],
      log: [],
    });
    const newGs = makeGs({
      players: [makePlayer({ san: 5 })],
      log: ['你 回复 2 SAN'],
    });

    expect(buildAnimQueue(oldGs, newGs).some(step => step.type === 'SAN_HEAL')).toBe(true);
  });

  it('存在显式 stat events 时不再根据状态差分猜测回复动画', () => {
    const oldGs = makeGs({
      players: [makePlayer({ hp: 10, san: 3 })],
      log: [],
    });
    const newGs = makeGs({
      players: [makePlayer({ hp: 8, san: 5 })],
      log: ['你 失去 2 HP'],
      _statEvents: [
        { type: 'HP_LOSS', target: 0, from: { hp: 10, san: 3 }, to: { hp: 8, san: 3 } },
      ],
    });
    const queue = buildAnimQueue(oldGs, newGs);

    expect(queue.map(step => step.type)).toEqual(['HP_DAMAGE']);
    expect(queue.some(step => step.type === 'SAN_HEAL')).toBe(false);
  });

  it('不会重复消费已经播放过的显式 stat events', () => {
    const event = { type: 'HP_LOSS', target: 0, from: { hp: 10, san: 5 }, to: { hp: 8, san: 5 }, seq: 3 };
    const oldGs = makeGs({
      players: [makePlayer({ hp: 8, san: 5 })],
      log: ['旧日志'],
      _statEvents: [event],
      _statEventSeq: 3,
    });
    const newGs = makeGs({
      players: [makePlayer({ hp: 8, san: 5 })],
      log: ['旧日志', '普通日志'],
      _statEvents: [event],
      _statEventSeq: 3,
    });

    expect(buildAnimQueue(oldGs, newGs).some(step => step.type === 'HP_DAMAGE')).toBe(false);
  });

  it('检定事件的 stat events 不会在检定翻牌前被普通队列提前消费', () => {
    const oldGs = makeGs({
      players: [makePlayer({ hp: 10, san: 7 })],
      log: [],
      _statEventSeq: 0,
    });
    const beforeInspectionPlayers = [makePlayer({ hp: 10, san: 6 })];
    const newGs = makeGs({
      players: [makePlayer({ hp: 9, san: 6 })],
      log: ['遭遇邪神，失去1SAN', '你 的SAN检定结果为"自残"', '你 自残，失去 1 HP'],
      _statEvents: [
        { type: 'SAN_LOSS', target: 0, from: { hp: 10, san: 7 }, to: { hp: 10, san: 6 }, seq: 1 },
        { type: 'HP_LOSS', target: 0, from: { hp: 10, san: 6 }, to: { hp: 9, san: 6 }, seq: 2 },
      ],
      _statEventSeq: 2,
      _inspectionEvents: [{
        seq: 1,
        statEventSeq: 2,
        beforePlayers: beforeInspectionPlayers,
        beforeLog: ['遭遇邪神，失去1SAN'],
      }],
    });

    const queue = buildAnimQueue(oldGs, newGs);

    expect(queue.map(step => step.type)).toEqual(['SAN_DAMAGE']);
  });
});
