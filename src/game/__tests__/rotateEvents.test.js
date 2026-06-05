import { describe, expect, it } from 'vitest';
import { rotateInspectionEvents, rotatePlayersArray, rotateStatEvents } from '../rotateEvents';

function player(name) {
  return { name };
}

function names(players) {
  return players.map(p => p.name);
}

describe('rotateEvents', () => {
  it('rotates player snapshots', () => {
    expect(names(rotatePlayersArray([player('p0'), player('p1'), player('p2')], 1))).toEqual(['p1', 'p2', 'p0']);
  });

  it('rotates stat event targets, pairs, and embedded players', () => {
    const rotateIndex = i => (i - 1 + 3) % 3;
    const events = rotateStatEvents([
      {
        target: 2,
        pair: [0, 2],
        players: [player('s0'), player('s1'), player('s2')],
      },
    ], rotateIndex, 1);

    expect(events[0].target).toBe(1);
    expect(events[0].pair).toEqual([2, 1]);
    expect(names(events[0].players)).toEqual(['s1', 's2', 's0']);
  });

  it('rotates inspection event targets and snapshots', () => {
    const rotateIndex = i => (i - 2 + 4) % 4;
    const events = rotateInspectionEvents([
      {
        target: 1,
        beforePlayers: [player('b0'), player('b1'), player('b2'), player('b3')],
        afterPlayers: [player('a0'), player('a1'), player('a2'), player('a3')],
        statEvents: [{ target: 1 }],
      },
    ], rotateIndex, 2);

    expect(events[0].target).toBe(3);
    expect(names(events[0].beforePlayers)).toEqual(['b2', 'b3', 'b0', 'b1']);
    expect(names(events[0].afterPlayers)).toEqual(['a2', 'a3', 'a0', 'a1']);
    expect(events[0].statEvents[0].target).toBe(3);
  });
});
