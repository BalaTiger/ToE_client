import { describe, expect, it } from 'vitest';
import { processInspectionTargets } from '../effectEngine';
import { makeInspectionMeta } from '../coreUtils';
import { makeGs, makePlayer } from './factory';

describe('queued inspection recovery after death', () => {
  it('retains queued inspections but does not claim recovery for a dead target', () => {
    const players = [
      makePlayer({ name: 'Dead', hp: 0, san: 6, isDead: true }),
      makePlayer({ name: 'Living', hp: 10, san: 6 }),
    ];
    const will = { id: 'will', name: '超人意志', effect: 'healSAN', value: 1, type: 'positive' };
    const state = makeGs({ players, currentTurn: 0, inspectionDeck: [will], inspectionDiscard: [] });
    const result = processInspectionTargets([0, 1], 0, players, [], [], [], makeInspectionMeta(state));
    expect(result.P[0]).toMatchObject({ hp: 0, san: 6, isDead: true });
    expect(result.P[1].san).toBe(7);
    const events = result.inspectionMeta._visualEvents;
    expect(events.map(event => event.target)).toEqual([0, 1]);
    expect(events[0].effectMsgs.join('\n')).not.toContain('恢复');
    expect(events[0].statEvents).toEqual([]);
    expect(events[1].effectMsgs.join('\n')).toContain('Living 超人意志，恢复 1 SAN');
    expect(result.log.filter(line => line.includes('恢复'))).toEqual(['Living 超人意志，恢复 1 SAN']);
  });
});
