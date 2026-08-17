import { describe, it, expect, vi, afterEach } from 'vitest';
import { getApophisNightForLevel, resolveApophisTarget } from '../apophisNight';
import { buildAnimQueue } from '../animQueueCore';
import { compileRuleVisualEventsToAnimTransaction } from '../visualEventTransactionCompiler';
import { createHuntTargetEvent } from '../visualEvents';
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

  it('目标偏移造成 SAN 损失后立即生成检定日志、事件和视觉事务', () => {
    const rolls = [0, 0];
    vi.spyOn(Math, 'random').mockImplementation(() => rolls.shift() ?? 0.99);
    const players = makeStandardPlayers(3);
    players[0].san = 7;
    const inspectionCard = {
      id: 'apophis-inspection',
      name: '暂时的平静',
      effect: 'nothing',
      value: 0,
      type: 'positive',
    };
    const gs = makeGs({
      players,
      apophisNight: getApophisNightForLevel(2),
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      _inspectionSeq: 0,
      _inspectionEvents: [],
      _statEventSeq: 0,
      _statEvents: [],
      _visualEvents: [],
    });

    const res = resolveApophisTarget({
      gs,
      players,
      deck: [],
      discard: [],
      log: [],
      actorIdx: 0,
      selectedIdx: 1,
      legalTargets: [1, 2],
      label: '选择【掉包】目标',
    });

    expect(res.players[0].san).toBe(6);
    expect(res.log[0]).toContain('目标由');
    expect(res.log).toContain(`${players[0].name} 的SAN检定结果为"暂时的平静"`);
    expect(res.statePatch._inspectionSeq).toBe(1);
    const inspectionEvent = res.statePatch._visualEvents.find(event => event.type === 'inspection');
    expect(inspectionEvent).toMatchObject({
      target: 0,
      card: inspectionCard,
      beforeStatEventSeq: 1,
    });
    expect(res.statePatch._visualEvents.map(event => event.type)).toEqual([
      'apophisTarget',
      'inspection',
    ]);
    expect(res.statePatch._statEvents[0]).toMatchObject({
      type: 'SAN_LOSS',
      target: 0,
      seq: 1,
    });

    const nextGs = {
      ...gs,
      players: res.players,
      deck: res.deck,
      discard: res.discard,
      log: res.log,
      ...res.statePatch,
    };
    const transaction = compileRuleVisualEventsToAnimTransaction(nextGs, gs, { buildAnimQueue });
    const types = transaction.queue.map(step => step.type);
    const diceIdx = types.indexOf('DICE_ROLL');
    const sanIdx = types.indexOf('SAN_DAMAGE');
    const inspectionIdx = transaction.queue.findIndex(step => step.type === 'DRAW_CARD' && step.inspectionSeq === 1);
    expect(diceIdx).toBeGreaterThanOrEqual(0);
    expect(sanIdx).toBeGreaterThan(diceIdx);
    expect(inspectionIdx).toBeGreaterThan(sanIdx);
    expect(types).not.toContain('SKILL_HUNT');
    expect(types).not.toContain('SKILL_BEWITCH');
    const huntEvent = createHuntTargetEvent({
      sourceIdx: 0,
      targetIdx: res.targetIdx,
      msgs: ['你（追猎者）发动【追捕】'],
    });
    const huntTransaction = compileRuleVisualEventsToAnimTransaction({
      ...nextGs,
      _visualEvents: [...nextGs._visualEvents, huntEvent],
    }, gs, { buildAnimQueue });
    const huntTypes = huntTransaction.queue.map(step => step.type);
    expect(huntTypes.indexOf('DICE_ROLL')).toBeLessThan(huntTypes.indexOf('SAN_DAMAGE'));
    expect(huntTypes.indexOf('SAN_DAMAGE')).toBeLessThan(
      huntTransaction.queue.findIndex(step => step.type === 'DRAW_CARD' && step.inspectionSeq === 1),
    );
    expect(huntTransaction.queue.findIndex(step => step.type === 'DRAW_CARD' && step.inspectionSeq === 1))
      .toBeLessThan(huntTypes.indexOf('SKILL_HUNT'));
  });

  it('黑夜骰子将 Math.random 的六个等宽区间依次映射为 1 到 6', () => {
    const players = makeStandardPlayers(3);
    const rolls = Array.from({ length: 6 }, (_, face) => {
      vi.spyOn(Math, 'random').mockReturnValue((face + 0.5) / 6);
      const gs = makeGs({ players, apophisNight: getApophisNightForLevel(1) });
      const result = resolveApophisTarget({
        gs,
        players: makeStandardPlayers(3),
        deck: [],
        discard: [],
        log: [],
        actorIdx: 0,
        selectedIdx: 1,
        // No alternative target avoids consuming another random number.
        legalTargets: [1],
      });
      vi.restoreAllMocks();
      return result.apophisTargetEvent.roll;
    });

    expect(rolls).toEqual([1, 2, 3, 4, 5, 6]);
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
