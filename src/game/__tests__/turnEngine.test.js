import { describe, expect, it } from 'vitest';
import { ROLE_TREASURE } from '../coreUtils';
import { playerDrawCard } from '../turnEngine';
import { makeGodCard, makeGs, makePlayer } from './factory';

describe('turnEngine stat events', () => {
  it('摸到邪神牌造成 SAN 损失时产出显式 stat events', () => {
    const players = [makePlayer({ role: ROLE_TREASURE, san: 10, godEncounters: 0 })];
    const godCard = makeGodCard('NYA');
    const gs = makeGs({ players, deck: [godCard], log: [] });

    const result = playerDrawCard(players, [godCard], [], 0, gs);

    expect(result.P[0].san).toBe(9);
    expect(result.statePatch._statEventSeq).toBe(1);
    expect(result.statePatch._statEvents).toMatchObject([
      { type: 'SAN_LOSS', target: 0, from: { san: 10 }, to: { san: 9 }, reason: '邪神遭遇', seq: 1 },
    ]);
  });
});
