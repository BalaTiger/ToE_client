import { describe, expect, it } from 'vitest';
import { submitLossEvents } from '../effectEngine';
import { appendStatChangeResult, submitRecoveryEvents } from '../statChangeEngine';
import { makePlayer } from './factory';

describe('stat change rule entry points', () => {
  it('submitLossEvents settles HP and SAN in one transaction and emits canonical stat events', () => {
    const players = [makePlayer({ hp: 5, san: 4 })];
    const result = submitLossEvents({
      players,
      events: [{ targetIdx: 0, lostHp: 2, lostSan: 1, source: '组合伤害' }],
      statEventSeq: 7,
    });

    expect(players[0]).toMatchObject({ hp: 3, san: 3 });
    expect(result.statEvents).toMatchObject([
      { type: 'HP_LOSS', target: 0, seq: 7, reason: '组合伤害', from: { hp: 5, san: 4 }, to: { hp: 3, san: 3 } },
      { type: 'SAN_LOSS', target: 0, seq: 7, reason: '组合伤害', from: { hp: 5, san: 4 }, to: { hp: 3, san: 3 } },
    ]);
  });

  it('submitRecoveryEvents clamps actual gains and emits continuous canonical events', () => {
    const players = [makePlayer({ hp: 9, san: 6 })];
    const result = submitRecoveryEvents({
      players,
      events: [
        { targetIdx: 0, gainHp: 5, source: '休息', order: 0 },
        { targetIdx: 0, gainSan: 2, source: '泉水', order: 1 },
      ],
      statEventSeq: 8,
    });

    expect(players[0]).toMatchObject({ hp: 10, san: 8 });
    expect(result.statEvents).toMatchObject([
      { type: 'HP_GAIN', seq: 8, from: { hp: 9, san: 6 }, to: { hp: 10, san: 6 } },
      { type: 'SAN_GAIN', seq: 8, from: { hp: 10, san: 6 }, to: { hp: 10, san: 8 } },
    ]);
    expect(appendStatChangeResult({ _statEvents: [], _statEventSeq: 7 }, result)).toMatchObject({
      _statEventSeq: 8,
      _statEvents: result.statEvents,
    });
  });

  it('does not recover dead players or emit zero-delta events', () => {
    const players = [makePlayer({ hp: 0, san: 4, isDead: true }), makePlayer({ hp: 10, san: 10 })];
    const result = submitRecoveryEvents({
      players,
      events: [
        { targetIdx: 0, gainHp: 3 },
        { targetIdx: 1, gainHp: 3, gainSan: 3 },
      ],
      statEventSeq: 2,
    });

    expect(result.statEvents).toEqual([]);
  });
});
