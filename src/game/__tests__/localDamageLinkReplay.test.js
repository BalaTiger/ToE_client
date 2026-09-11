import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import { prepareAnimQueueLogs } from '../animLogs';
import { buildMpRemoteReplayAction } from '../multiplayerRemoteReplay';
import { derotateGs, isAiSeat, rotateGsForViewer } from '../rotateState';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const handlers = [
  'damageLinkSelectTarget', 'buildTargetContinuationGs', 'finishTargetContinuation',
  'broadcastAnimTransaction', 'broadcastMpStateBeforeLocalReplay',
].map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n');

afterEach(() => vi.restoreAllMocks());

describe('local damage-link target continuation', () => {
  it.each([
    { night: false, roll: 4, target: 1 },
    { night: true, roll: 4, target: 1 },
    { night: true, roll: 1, target: 2 },
    { night: true, roll: 1, target: 2, inspection: true },
    { night: true, roll: 4, target: 1, fromRest: true },
  ])('compiles the rope rule event and target roll before all three clients continue (%j)', ({ night, roll, target, inspection, fromRest }) => {
    vi.spyOn(Math, 'random').mockReturnValue((roll - 0.5) / 6);
    const players = makeStandardPlayers(3, [{ name: '莉莉' }, { name: '米娅' }, { name: '贝拉' }]);
    if (inspection) players[0].san = 7;
    const initial = makeGs({
      players, _isMP: true, phase: 'DAMAGE_LINK_SELECT_TARGET', _turnKey: 7,
      abilityData: { damageLinkSource: 0, damageLinkTargets: [1, 2], ...(fromRest ? { fromRest: true, cthDrawsRemaining: 1 } : {}) },
      apophisNight: night ? game.getApophisNightForLevel(1) : null,
      deck: [makeZoneCard('B1')],
      inspectionDeck: inspection ? [{ id: 'reveal', name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive' }] : [],
      inspectionDiscard: [], _visualEvents: [],
    });
    const packets = [];
    const localQueues = [];
    const context = {
      ...game, ...animQueueHelpers, derotateGs, isAiSeat, gs: initial,
      isMultiplayer: true,
      consumedVisualEventIdsRef: { current: new Set() },
      myPlayerIndexRef: { current: 0 },
      suppressNextBroadcastRef: { current: false },
      roomModal: { roomId: 'rope-regression' },
      visualStateLocks: { lock: vi.fn(), clear: vi.fn() },
      socketRef: { current: { emit: (_name, payload) => packets.push(JSON.parse(JSON.stringify(payload.gs))) } },
      setGs: next => { context.gs = next; },
      _cthContinueRestDraws: vi.fn(next => { context.gs = next; }),
      triggerAnimQueue: (queue, next, callback, meta) => {
        expect(meta.authority).toBe('queue');
        localQueues.push(queue);
        if (next) context.gs = next;
        if (callback) callback();
      },
    };

    expect(() => runInNewContext(`${handlers}\ndamageLinkSelectTarget(1);`, context)).not.toThrow();
    expect(localQueues).toHaveLength(1);
    expect(packets).toHaveLength(1);
    expect(game.getAllDamageLinks(context.gs.players)).toMatchObject([{ a: 0, b: target }]);
    const ruleEvent = context.gs._visualEvents.find(event => event.type === 'cardMove' && event.effect === 'damageLink');
    expect(ruleEvent).toBeTruthy();
    expect(ruleEvent.msgs).toEqual([`【两人一绳】莉莉 与 ${players[target].name} 间架起救生索，任意一方受到HP伤害时绳索断裂，双方各失去3HP；若到莉莉下个回合绳索未断裂，双方各回复4HP`]);
    const published = packets[0]._visualEvents.find(event => event.type === 'animTransaction');
    expect(published.queue.find(step => step.effect === 'damageLink').visualEventId).toBe(ruleEvent.id);
    expect(published.coveredEventIds).toContain(ruleEvent.id);
    expect(published.queue.filter(step => step.type === 'DICE_ROLL')).toHaveLength(night ? 1 : 0);
    expect(context._cthContinueRestDraws).toHaveBeenCalledTimes(fromRest ? 1 : 0);

    const assertQueue = (queue, state, viewer) => {
      const rope = queue.find(step => step.type === 'CARD_TRANSFER' && step.effect === 'damageLink');
      expect(rope).toMatchObject({ visualEventId: ruleEvent.id, fromPid: (3 - viewer) % 3, toPid: (target - viewer + 3) % 3 });
      expect(queue.filter(step => step.effect === 'damageLink')).toHaveLength(1);
      expect(game.getAllDamageLinks(rope.visualSetupPatch.players)).toEqual([]);
      expect(game.getAllDamageLinks(rope.visualTimeline[0].patch.players)).toHaveLength(1);
      const types = queue.map(step => step.type);
      expect(types.filter(type => type === 'DICE_ROLL')).toHaveLength(night ? 1 : 0);
      if (night) expect(types.indexOf('DICE_ROLL')).toBeLessThan(queue.indexOf(rope));
      if (inspection) {
        expect(types.indexOf('SAN_DAMAGE')).toBeLessThan(types.indexOf('DRAW_CARD'));
        expect(types.indexOf('DRAW_CARD')).toBeLessThan(queue.indexOf(rope));
        expect(rope.visualSetupPatch.players[(3 - viewer) % 3].hand).toEqual(context.gs.players[0].hand);
      }
      const ids = new Set();
      const prepared = prepareAnimQueueLogs(queue, state);
      expect(prepared.flatMap(step => consumeVisualLogEntries(step.logEntries, ids))).toEqual(context.gs.log);
      expect(prepared.flatMap(step => consumeVisualLogEntries(step.logEntries, ids))).toEqual([]);
      expect(game.prepareAnimationQueueSteps(queue).issues).toEqual([]);
    };
    assertQueue(localQueues[0], context.gs, 0);
    for (const viewer of [1, 2]) {
      const rotated = rotateGsForViewer(packets[0], viewer);
      const action = buildMpRemoteReplayAction({ rotated, previousGs: rotateGsForViewer(initial, viewer), roleRevealed: true });
      assertQueue(action.queue, rotated, viewer);
    }
  });
});
