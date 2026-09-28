import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import * as apophisAnimQueue from '../apophisAnimQueue';
import { derotateGs, rotateGsForViewer } from '../rotateState';
import { buildSwapCardsVisualTransaction } from '../identitySkillVisualTransaction';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { buildMpRemoteReplayAction } from '../multiplayerRemoteReplay';
import { buildNormalStateBroadcast } from '../../multiplayer/useMultiplayerStateBroadcast';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const handlerNames = [
  'swapSelectTarget', 'setGsWithApophisTargetAnim', 'swapSelectTargetCard',
  'swapGiveCard', 'broadcastAnimTransaction', 'broadcastMpStateBeforeLocalReplay',
];
const handlers = handlerNames.map(name => {
  const start = appSource.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(appSource.slice(start));
  const end = start + closing.index + closing[0].length;
  return appSource.slice(start, end);
}).join('\n');

afterEach(() => vi.restoreAllMocks());

describe('local target decision broadcasts', () => {
  it.each([
    { roll: 3, revealed: false, target: 1 },
    { roll: 1, revealed: false, target: 2 },
    { roll: 3, revealed: true, target: 1 },
    { roll: 1, revealed: false, target: 2, inspection: 'drawCard' },
    { roll: 2, revealed: false, target: 2, inspection: 'discardRandom' },
  ])('publishes roll $roll before the swap, once per viewer (revealed=$revealed, inspection=$inspection)', ({ roll, revealed, target, inspection }) => {
    vi.spyOn(Math, 'random').mockReturnValue((roll - 0.5) / 6);
    const players = makeStandardPlayers(3, [{ name: '林恩' }, { name: '索菲' }, { name: '贝拉' }]);
    players.forEach((player, index) => {
      player.hand = [makeZoneCard(index === 0 ? 'C2' : 'A1')];
      player.revealHand = revealed;
    });
    if (inspection) players[0].san = 7;
    const inspectionCard = inspection ? {
      id: `night-${inspection}`,
      name: inspection === 'drawCard' ? '揭开真相' : '迫害妄想',
      effect: inspection,
      value: 1,
      type: inspection === 'drawCard' ? 'positive' : 'negative',
    } : null;
    const initial = makeGs({
      players, _isMP: true, phase: 'SWAP_SELECT_TARGET', globalOnlySwapOwner: null,
      apophisNight: game.getApophisNightForLevel(1), _visualEvents: [],
      ...(inspection ? {
        deck: [makeZoneCard('B1'), makeZoneCard('D1')],
        discard: [makeZoneCard('A2')],
        inspectionDeck: [inspectionCard],
        inspectionDiscard: [],
      } : {}),
    });
    const expectedDeck = inspection === 'drawCard' ? initial.deck.slice(1) : initial.deck;
    const expectedDiscard = inspection === 'discardRandom'
      ? [...initial.discard, players[0].hand[0]] : initial.discard;
    const packets = [];
    const localQueues = [];
    const consumedVisualEventIdsRef = { current: new Set() };
    const context = {
      ...game, ...animQueueHelpers, ...apophisAnimQueue,
      derotateGs,
      buildSwapCardsVisualTransaction,
      gs: initial,
      isMultiplayer: true,
      showTutorial: false,
      tutorialStep: null,
      isTutorialActionAllowed: () => true,
      getNextTutorialStepForAction: () => null,
      consumedVisualEventIdsRef,
      myPlayerIndexRef: { current: 0 },
      suppressNextBroadcastRef: { current: false },
      roomModal: { roomId: 'local-regression' },
      socketRef: { current: { emit: (name, payload) => {
        expect(name).toBe('mpStateSync');
        packets.push(JSON.parse(JSON.stringify(payload.gs)));
      } } },
      setGs: next => { context.gs = next; },
      triggerAnimQueue: (queue, next) => {
        localQueues.push(queue);
        game.getAnimationQueueVisualEventIds(queue).forEach(id => consumedVisualEventIdsRef.current.add(id));
        context.gs = next;
      },
      finishTutorialActionWithState: (next, _tutorialNext, queue) => context.triggerAnimQueue(queue, next),
    };
    runInNewContext(`${handlers}\nswapSelectTarget(1);`, context);
    expect(packets).toHaveLength(1);
    expect(packets[0]._visualEvents[0]).toMatchObject({
      type: 'animTransaction', context: 'apophisTarget', barrier: 'decision',
    });
    expect(context.gs.abilityData.swapTi).toBe(target);
    expect(context.gs.deck).toEqual(expectedDeck);
    expect(context.gs.discard).toEqual(expectedDiscard);
    expect(packets[0].deck).toEqual(expectedDeck);
    expect(packets[0].discard).toEqual(expectedDiscard);
    if (!revealed) {
      expect(buildNormalStateBroadcast({
        gs: context.gs, room: context.roomModal, myPlayerIndex: 0,
        consumedVisualEventIds: consumedVisualEventIdsRef.current,
      })).toBeNull();
    }

    runInNewContext(`${handlers}\nswapSelectTargetCard(0);\nswapGiveCard(0);`, context);
    expect(packets).toHaveLength(2);
    expect(packets[1]._visualEvents.some(event => event.type === 'apophisTarget')).toBe(false);
    expect(packets[1].deck).toEqual(expectedDeck);
    expect(packets[1].discard).toEqual(expectedDiscard);

    const localTypes = localQueues.flat().map(step => step.type);
    expect(localTypes.filter(type => type === 'DICE_ROLL')).toHaveLength(1);
    expect(localTypes.indexOf('DICE_ROLL')).toBeLessThan(localTypes.indexOf('SKILL_SWAP'));
    if (inspection) {
      expect(context.gs.players[0].san).toBe(6);
      expect(localTypes.indexOf('DICE_ROLL')).toBeLessThan(localTypes.indexOf('SAN_DAMAGE'));
      expect(localTypes.indexOf('SAN_DAMAGE')).toBeLessThan(localTypes.indexOf('DRAW_CARD'));
      expect(localTypes.indexOf('DRAW_CARD')).toBeLessThan(localTypes.indexOf('SKILL_SWAP'));
    }

    for (const viewer of [1, 2]) {
      let previousGs = rotateGsForViewer(initial, viewer);
      const consumedVisualEventIds = new Set();
      const steps = [];
      for (const packet of packets) {
        const action = buildMpRemoteReplayAction({
          rotated: rotateGsForViewer(packet, viewer), previousGs,
          roleRevealed: true, consumedVisualEventIds,
        });
        steps.push(...(action.queue || []));
        action.consumedVisualEventIds?.forEach(id => consumedVisualEventIds.add(id));
        previousGs = action.pendingGs || action.gs;
      }
      const dice = steps.filter(step => step.type === 'DICE_ROLL');
      expect(dice).toHaveLength(1);
      expect(dice[0]).toMatchObject({ d1: roll, diceMode: 'apophisNight', rollerName: '林恩' });
      const types = steps.map(step => step.type);
      expect(types.indexOf('DICE_ROLL')).toBeLessThan(types.indexOf('SKILL_SWAP'));
      expect(types.slice(types.indexOf('SKILL_SWAP') + 1)).toContain('CARD_TRANSFER');
      const logIds = new Set();
      const logs = prepareAnimQueueLogs(steps).flatMap(step => consumeVisualLogEntries(step.logEntries, logIds));
      expect(logs.filter(line => line.startsWith('【黑夜】'))).toEqual([packets[0]._apophisTargetEvent.log]);
      if (inspection) {
        const inspectionStepIndex = steps.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === inspectionCard.id);
        expect(inspectionStepIndex).toBeGreaterThan(types.indexOf('SAN_DAMAGE'));
        expect(inspectionStepIndex).toBeLessThan(types.indexOf('SKILL_SWAP'));
        expect(steps.filter(step => step.type === 'DRAW_CARD' && step.card?.id === inspectionCard.id)).toHaveLength(1);
        expect(logs.filter(line => line.includes('的SAN检定结果'))).toEqual([`林恩 的SAN检定结果为"${inspectionCard.name}"`]);
        expect(previousGs.deck).toEqual(expectedDeck);
        expect(previousGs.discard).toEqual(expectedDiscard);
      }

      const repeated = buildMpRemoteReplayAction({
        rotated: rotateGsForViewer(packets[0], viewer), previousGs,
        roleRevealed: true, consumedVisualEventIds,
      });
      expect(repeated.queue || []).toEqual([]);
    }
  });
});
