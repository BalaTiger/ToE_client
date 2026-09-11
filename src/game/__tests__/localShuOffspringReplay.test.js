import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import * as animLogs from '../animLogs';
import * as apophisAnimQueue from '../apophisAnimQueue';
import { derotateGs, isAiSeat, rotateGsForViewer } from '../rotateState';
import { buildMpRemoteReplayAction } from '../multiplayerRemoteReplay';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { GOD_DEFS, createBlackGoatYoungCard } from '../../constants/card';
import { makeGodCard, makeGs, makeStandardPlayers } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const handlers = [
  'worshipFromHand', 'handleAIClick', 'triggerSyncedAnimTransaction',
  'broadcastAnimTransaction', 'broadcastMpStateBeforeLocalReplay',
].map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n');

afterEach(() => vi.restoreAllMocks());

describe('local Shub offspring target replay', () => {
  it.each([
    { multiplayer: false, upgrade: false, night: false, target: 1 },
    { multiplayer: true, upgrade: false, night: false, target: 1 },
    { multiplayer: true, upgrade: true, night: true, target: 2 },
  ])('animates and logs the actual hand-worship target choice (%j)', ({ multiplayer, upgrade, night, target }) => {
    const players = makeStandardPlayers(3, [{ name: '索菲', role: '追猎者' }, { name: '诺拉', role: '寻宝者' }, { name: '奥托' }]);
    players[0].hand = [makeGodCard('SHU')];
    if (upgrade) {
      players[0].godName = 'SHU';
      players[0].godLevel = 1;
      players[0].godZone = [makeGodCard('SHU')];
    }
    const initial = makeGs({ players, _isMP: multiplayer, _visualEvents: [],
      apophisNight: night ? game.getApophisNightForLevel(1) : null });
    const packets = [];
    const localQueues = [];
    const consumedVisualEventIdsRef = { current: new Set() };
    const context = {
      ...game, ...animQueueHelpers, ...animLogs, ...apophisAnimQueue,
      GOD_DEFS, createBlackGoatYoungCard, derotateGs, isAiSeat, gs: initial, me: players[0], phase: initial.phase,
      isMultiplayer: multiplayer, isBlocked: false, canLocalTargetSelect: true,
      showTutorial: false, committedTargetActionRef: { current: false },
      lastInspectionSeqRef: { current: 0 }, setMobileArmedGodCardIdx: vi.fn(),
      consumedVisualEventIdsRef, myPlayerIndexRef: { current: 0 },
      suppressNextBroadcastRef: { current: false }, roomModal: { roomId: 'shu-regression' },
      socketRef: { current: { emit: (name, payload) => {
        expect(name).toBe('mpStateSync');
        packets.push(JSON.parse(JSON.stringify(payload.gs)));
      } } },
      setGs: next => {
        context.gs = typeof next === 'function' ? next(context.gs) : next;
        context.phase = context.gs.phase;
      },
      triggerAnimQueue: (queue, next) => {
        localQueues.push(queue);
        game.getAnimationQueueVisualEventIds(queue).forEach(id => consumedVisualEventIdsRef.current.add(id));
        context.setGs(next);
      },
    };
    runInNewContext(`${handlers}\nworshipFromHand(0);`, context);
    expect(context.gs.phase).toBe('SHU_SELECT_TARGET');
    const beforeGrant = context.gs;
    const count = beforeGrant.abilityData.shuOffspringCount;
    if (night) vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValue(0.99);
    runInNewContext(`${handlers}\nhandleAIClick(1);`, context);

    expect(localQueues).toHaveLength(2);
    const grantQueue = localQueues[1];
    const grant = grantQueue.find(step => step.type === 'CARD_TRANSFER' && step.effect === 'blackGoat');
    expect(grant).toMatchObject({ fromPid: 0, toPid: target, count });
    expect(grant.cards).toHaveLength(count);
    expect(grant.visualEventId).toBeTruthy();
    expect(grant.visualSetupPatch.players[target].hand).toEqual(beforeGrant.players[target].hand);
    expect(grant.visualTimeline[0].patch.players[target].hand.filter(game.isBlackGoatYoung)).toHaveLength(count);
    expect(context.gs.players[target].hand.filter(game.isBlackGoatYoung)).toHaveLength(count);
    const logMsg = `【黑暗子嗣】${players[target].name} 获得${count}张黑山羊幼仔`;
    const liveLogs = queue => {
      const consumed = new Set();
      return animLogs.prepareAnimQueueLogs(queue).flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
    };
    expect(liveLogs(grantQueue).filter(line => line.startsWith('【黑暗子嗣】'))).toEqual([logMsg]);
    expect(grantQueue.some(step => step.type === 'GOD_HIGHLIGHT')).toBe(false);
    if (!multiplayer) return expect(packets).toEqual([]);

    expect(packets).toHaveLength(2);
    for (const viewer of [1, 2]) {
      const rotated = rotateGsForViewer(packets[1], viewer);
      const action = buildMpRemoteReplayAction({
        rotated, previousGs: rotateGsForViewer(beforeGrant, viewer),
        roleRevealed: true, consumedVisualEventIds: new Set(packets[0]._visualEvents.map(event => event.id)),
      });
      const remoteGrant = action.queue.find(step => step.type === 'CARD_TRANSFER' && step.effect === 'blackGoat');
      expect(remoteGrant).toMatchObject({ fromPid: (3 - viewer) % 3, toPid: (target - viewer + 3) % 3, count });
      expect(remoteGrant.visualSetupPatch.players[(target - viewer + 3) % 3].hand).toEqual(beforeGrant.players[target].hand);
      expect(liveLogs(action.queue).filter(line => line.startsWith('【黑暗子嗣】'))).toEqual([logMsg]);
      expect(action.queue.some(step => step.type === 'GOD_HIGHLIGHT')).toBe(false);
      if (night) {
        const types = action.queue.map(step => step.type);
        expect(types.filter(type => type === 'DICE_ROLL')).toHaveLength(1);
        expect(types.indexOf('DICE_ROLL')).toBeLessThan(types.indexOf('CARD_TRANSFER'));
      }
    }
  });
});
