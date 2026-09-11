import { describe, expect, it } from 'vitest';
import { createBlackGoatYoungCard } from '../../constants/card';
import { prepareAnimQueueLogs } from '../animLogs';
import { addDamageLink } from '../damageLinks';
import { buildMpRemoteReplayAction } from '../multiplayerRemoteReplay';
import { rotateGsForViewer } from '../rotateState';
import { applyStatAnimationImpact } from '../statEvents';
import { buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { startNextTurn } from '../turnEngine';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeBlankZoneCard, makeGs, makePlayer } from './factory';

describe('black goat turn-start rope reaction', () => {
  it.each([false, true])('publishes the rule break message before drawing (multiplayer: %s)', isMP => {
    const players = [
      makePlayer({ name: '莉莉' }),
      makePlayer({ name: '贝拉', hp: 9, hand: [createBlackGoatYoungCard()] }),
      makePlayer({ name: '米娅' }),
    ];
    addDamageLink(players, 0, 1, { expiryOwner: 0 });
    const previous = makeGs({ players, currentTurn: 0, _isMP: isMP, deck: [makeBlankZoneCard()] });
    const next = startNextTurn(previous);
    const goatLine = '【黑山羊幼仔】贝拉 失去 1 HP 和 1 SAN';
    const ropeLine = '【两人一绳】绳索断裂！贝拉 和 莉莉 各失去 3 HP';
    expect(next.players[0].hp).toBe(7);
    expect(next.players[1]).toMatchObject({ hp: 5, san: 9 });
    expect(next.log).toContain(ropeLine);
    const assertReplay = (queue, state, beforeState) => {
      const prepared = prepareAnimQueueLogs(queue, state);
      const consumed = new Set();
      const batches = prepared.map(step => consumeVisualLogEntries(step.logEntries, consumed));
      const lines = batches.flat();
      expect(lines.filter(line => line === goatLine)).toHaveLength(1);
      expect(lines.filter(line => line === ropeLine)).toHaveLength(1);
      const goatIndex = batches.findIndex(batch => batch.includes(goatLine));
      const ropeIndex = batches.findIndex(batch => batch.includes(ropeLine));
      expect(goatIndex).toBeLessThan(ropeIndex);
      expect(ropeIndex).toBeLessThan(queue.findIndex(step => step.type === 'DRAW_CARD'));
      expect(prepared.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed))).toEqual([]);
      const beforeStats = beforeState.players.map(({ hp, san }) => ({ hp, san }));
      expect(queue.reduce(applyStatAnimationImpact, beforeStats)).toEqual(state.players.map(({ hp, san }) => ({ hp, san })));
      const damageEvents = queue.flatMap(step => step.type === 'HP_DAMAGE' ? step.statEvents : []);
      const bellaIdx = state.players.findIndex(player => player.name === '贝拉');
      const lilyIdx = state.players.findIndex(player => player.name === '莉莉');
      expect(damageEvents.filter(event => event.target === bellaIdx).map(event => [event.from.hp, event.to.hp])).toEqual([[9, 8], [8, 5]]);
      expect(damageEvents.filter(event => event.target === lilyIdx).map(event => [event.from.hp, event.to.hp])).toEqual([[10, 7]]);
    };
    assertReplay(buildTurnStartDrawReplayQueue({ oldGs: previous, newGs: next }).queue, next, previous);
    if (isMP) {
      const packet = JSON.parse(JSON.stringify(next));
      for (const viewer of [0, 1, 2]) {
        const rotated = rotateGsForViewer(packet, viewer);
        const action = buildMpRemoteReplayAction({ rotated, previousGs: rotateGsForViewer(previous, viewer), roleRevealed: true });
        assertReplay([action.anim, ...(action.queue || [])].filter(Boolean), rotated, rotateGsForViewer(previous, viewer));
      }
    }
  });
});
