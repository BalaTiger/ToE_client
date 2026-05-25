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
});
