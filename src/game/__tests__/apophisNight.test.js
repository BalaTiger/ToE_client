import { describe, it, expect, vi, afterEach } from 'vitest';
import { getApophisNightForLevel, resolveApophisTarget } from '../apophisNight';
import { makeGs, makeStandardPlayers } from './factory';

describe('apophisNight', () => {
  afterEach(() => vi.restoreAllMocks());

  it('按等级生成黑夜阈值并重置计数', () => {
    expect(getApophisNightForLevel(1)).toMatchObject({ active: true, threshold: 2, count: 0, limit: 12 });
    expect(getApophisNightForLevel(2)).toMatchObject({ threshold: 4, count: 0 });
    expect(getApophisNightForLevel(3)).toMatchObject({ threshold: 6, count: 0 });
  });

  it('选中目标时计数，失败骰会改为合法错误目标并扣 SAN', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)   // roll = 1
      .mockReturnValueOnce(0);  // choose first alternative
    const players = makeStandardPlayers(3);
    const gs = makeGs({ players, apophisNight: getApophisNightForLevel(2) });

    const res = resolveApophisTarget({
      gs,
      players,
      deck: [],
      discard: [],
      log: [],
      actorIdx: 0,
      selectedIdx: 1,
      legalTargets: [1, 2],
      label: '选择测试目标',
    });

    expect(res.targetIdx).toBe(2);
    expect(res.players[0].san).toBe(9);
    expect(res.apophisNight.count).toBe(1);
    expect(res.log[0]).toContain('目标由');
  });

  it('累计达到上限后黑夜结束', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // roll = 6
    const players = makeStandardPlayers(3);
    const gs = makeGs({ players, apophisNight: { ...getApophisNightForLevel(1), count: 11 } });

    const res = resolveApophisTarget({
      gs,
      players,
      deck: [],
      discard: [],
      log: [],
      actorIdx: 0,
      selectedIdx: 1,
      legalTargets: [1, 2],
    });

    expect(res.apophisNight).toBeNull();
    expect(res.log.at(-1)).toContain('黑夜结束');
  });
});
