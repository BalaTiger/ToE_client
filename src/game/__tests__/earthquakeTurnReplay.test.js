import { describe, expect, it } from 'vitest';
import { createBlackGoatYoungCard } from '../../constants/card';
import { prepareAnimQueueLogs } from '../animLogs';
import { normalizeLogLineForViewer } from '../logPerspective';
import { buildMpRemoteReplayAction } from '../multiplayerRemoteReplay';
import { rotateGsForViewer } from '../rotateState';
import { buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { startNextTurn } from '../turnEngine';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

describe('earthquake turn draw logs', () => {
  it.each([
    { mode: 'single-player local draw', isMP: false, drawer: 0 },
    { mode: 'single-player AI draw', isMP: false, drawer: 1 },
    { mode: 'multiplayer host draw', isMP: true, drawer: 0 },
    { mode: 'multiplayer other seat draw', isMP: true, drawer: 1 },
  ])('$mode owns each discard message once, after the forced reveal', ({ isMP, drawer }) => {
    const quake = makeZoneCard('B2', 2);
    const young = createBlackGoatYoungCard();
    const players = [
      makePlayer({ name: isMP ? '诺亚' : '你', role: '寻宝者', hand: [makeGodCard('SHU')] }),
      makePlayer({ name: '奥托', role: '追猎者', hand: [makeGodCard('SHU')] }),
      makePlayer({ name: '索菲', role: '邪祀者', hand: [makeZoneCard('A4', 0)] }),
    ];
    players[drawer].hand = [young];
    const previous = makeGs({ players, deck: [quake], currentTurn: (drawer + 2) % 3, _isMP: isMP });
    const next = startNextTurn(previous);
    const earthquakeEvent = next._visualEvents.find(event => event.effectKey === 'earthquake');
    const drawEvent = next._visualEvents.find(event => event.type === 'drawCard');
    expect(next.players[drawer]).toMatchObject({ hp: 9, san: 9, hand: [quake] });
    expect(earthquakeEvent.discardEvents).toHaveLength(3);
    expect(earthquakeEvent.msgs).toHaveLength(3);
    expect(drawEvent.msgs).toEqual([expect.stringContaining('地动山摇（强制触发）')]);
    expect(drawEvent.effectVisualEventIds).toContain(earthquakeEvent.id);

    const normalizeMessages = lines => lines.map(line => normalizeLogLineForViewer(line, {
      isMultiplayer: isMP,
      turnOwner: next.players[drawer].name,
    }));
    const assertReplay = (queue, state) => {
      const prepared = prepareAnimQueueLogs(queue, state);
      const consumed = new Set();
      const batches = prepared.map(step => consumeVisualLogEntries(step.logEntries, consumed));
      expect(batches.flat()).toEqual(normalizeMessages(next.log));
      expect(prepared.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed))).toEqual([]);
      const drawIndex = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === quake.id);
      const quakeIndex = queue.findIndex(step => step.type === 'EARTHQUAKE');
      expect(queue.filter(step => step.type === 'EARTHQUAKE')).toHaveLength(1);
      expect(drawIndex).toBeLessThan(quakeIndex);
      expect(batches[drawIndex]).toEqual(normalizeMessages(drawEvent.msgs));
      expect(batches[quakeIndex]).toEqual(normalizeMessages(earthquakeEvent.msgs));
    };
    assertReplay(buildTurnStartDrawReplayQueue({ oldGs: previous, newGs: next }).queue, next);
    if (isMP) {
      const packet = JSON.parse(JSON.stringify(next));
      for (const viewer of [0, 1, 2]) {
        const rotated = rotateGsForViewer(packet, viewer);
        const action = buildMpRemoteReplayAction({ rotated, previousGs: rotateGsForViewer(previous, viewer), roleRevealed: true });
        assertReplay([action.anim, ...(action.queue || [])].filter(Boolean), rotated);
      }
    }
  });
});
