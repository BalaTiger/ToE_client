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
    expect(res.apophisTargetEvent).toMatchObject({ roll: 1, changed: true, selectedIdx: 1, targetIdx: 2 });
    expect(res.statePatch._apophisTargetEvent).toMatchObject({ seq: 1, actorIdx: 0 });
  });

  it('掷骰等于阈值时也会偏移目标', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5) // roll = 4
      .mockReturnValueOnce(0);
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
    });

    expect(res.apophisTargetEvent).toMatchObject({ roll: 4, changed: true, targetIdx: 2 });
    expect(res.statePatch._visualEvents.at(-1)).toMatchObject({
      type: 'apophisTarget',
      legacySeq: res.apophisTargetEvent.seq,
      actorIdx: 0,
      selectedIdx: 1,
      targetIdx: 2,
    });
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

  it('引燃火把免疫时不触发黑夜偏移且不计数', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const players = makeStandardPlayers(3);
    players[0].godPowerImmuneThisTurn = true;
    const gs = makeGs({ players, apophisNight: getApophisNightForLevel(3) });

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

    expect(res.targetIdx).toBe(1);
    expect(res.players[0].san).toBe(10);
    expect(res.apophisNight.count).toBe(0);
    expect(res.log).toEqual([]);
  });

  it('黑夜可以把目标偏移到引燃火把免疫者身上', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const players = makeStandardPlayers(4);
    players[2].godPowerImmuneThisTurn = true;
    const gs = makeGs({ players, apophisNight: getApophisNightForLevel(3) });

    const res = resolveApophisTarget({
      gs,
      players,
      deck: [],
      discard: [],
      log: [],
      actorIdx: 0,
      selectedIdx: 1,
      legalTargets: [1, 2, 3],
    });

    expect(res.targetIdx).toBe(2);
    expect(res.log[0]).toContain(players[2].name);
  });
});
