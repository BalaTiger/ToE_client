import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiStep } from '../aiTurn';
import { buildAiHuntWaitPresentation } from '../aiTurnPresentation';
import { normalizeApophisQueueForPlayback } from '../apophisAnimQueue';
import { prepareAnimationTransaction, assertPreparedAnimationTransaction } from '../animationTransaction';
import { applyStatAnimationImpact } from '../statEvents';
import { getApophisNightForLevel } from '../apophisNight';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';

afterEach(() => vi.restoreAllMocks());

function makeHuntState(statEventSeq = 0) {
  const players = makeStandardPlayers(4, [
    { name: '你', hp: 10, role: '寻宝者', hand: [makeZoneCard('D1')] },
    { name: '卡洛斯', role: '追猎者', hand: ['A1', 'D2', 'B2'].map(key => makeZoneCard(key)) },
    { name: '黛安娜', hp: 6, role: '邪祀者', hand: Array.from({ length: 3 }, () => makeZoneCard('A2')) },
    { name: '艾伦', hp: 9, role: '寻宝者', hand: [makeZoneCard('B3')] },
  ]);
  players.forEach(player => { player.roleRevealed = true; });
  return makeGs({ players, currentTurn: 1, phase: 'AI_TURN',
    skillUsed: false, restUsed: false, multiplyUsed: false,
    _aiTurnIntroShown: true, _visualEvents: [], _statEvents: [], _statEventSeq: statEventSeq,
    log: ['之前的回合'], apophisNight: getApophisNightForLevel(1) });
}

function resolveConsecutiveHunts(statEventSeq = 0) {
  // Includes target-order tie breakers and three hidden loot draws. This seed
  // reproduces actual rule resolution: roll 6, hunt 6→3; roll 6, hunt 3→0;
  // roll 1, redirect from 艾伦 to the local player and wait for their reveal.
  let value = 565;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  });
  const previousState = makeHuntState(statEventSeq);
  const result = aiStep(previousState);
  expect(result.phase).toBe('PLAYER_REVEAL_FOR_HUNT');
  expect(result._aiHuntEvents.map(event => event.targetIdx)).toEqual([2, 2, 0]);
  expect(result._visualEvents.filter(event => event.type === 'apophisTarget')
    .map(event => event.roll)).toEqual([6, 6, 1]);
  return { previousState, result };
}

describe('AI consecutive hunt stat sequence', () => {
  it.each([0, 27])('advances the shared cursor from %i through both hunts and the later night loss', initialSeq => {
    const { previousState, result } = resolveConsecutiveHunts(initialSeq);
    const hunts = result._aiHuntEvents.slice(0, 2);
    expect(hunts.map(event => event.statEvents.find(stat => stat.type === 'HP_LOSS').seq))
      .toEqual([initialSeq + 1, initialSeq + 2]);
    expect(hunts.map(event => event.statEvents.find(stat => stat.type === 'HP_LOSS').to.hp))
      .toEqual([3, 0]);
    expect(hunts[1].statEvents.find(stat => stat.type === 'PLAYER_DEFEATED'))
      .toMatchObject({ seq: initialSeq + 2, settlementOwner: 'huntResult' });
    expect(result._apophisTargetEvent).toMatchObject({ statSeq: initialSeq + 3, selectedIdx: 3, targetIdx: 0 });
    expect(result._statEventSeq).toBe(initialSeq + 3);
    // The hunt event remains the sole owner of its damage/death settlement.
    expect(result._statEvents.map(event => event.type)).toEqual(['SAN_LOSS']);
    expect(result.players[2]).toMatchObject({ hp: 0, isDead: true, hand: [] });
    expect(result.players[1].san).toBe(9);
    expect(result._aiHuntEvents.reduce((count, event) => count + (event.lootTransferCount || 0), 0)).toBe(3);
    expect(previousState._statEventSeq).toBe(initialSeq);
    expect(previousState.players[2]).toMatchObject({ hp: 6, isDead: false });
  });

  it('keeps damage after its own reticle through final transaction preparation and emits each log once', () => {
    const { previousState, result } = resolveConsecutiveHunts();
    const presentation = buildAiHuntWaitPresentation({ previousState, rawResult: result, nextState: result,
      isDrawnCardActuallyDiscarded: () => false, buildActorTurnStartReplay: vi.fn(), buildTurnStartIntroQueue: () => [] });
    const transaction = prepareAnimationTransaction({
      queue: presentation.queue, previousState, nextState: result,
      transactionMeta: { authority: 'queue' },
    });
    const { queue } = assertPreparedAnimationTransaction(transaction);
    expect(queue).toEqual(presentation.queue);
    expect(normalizeApophisQueueForPlayback(queue, previousState, result)).toEqual(queue);
    const relevantTypes = new Set(['DICE_ROLL', 'SKILL_HUNT', 'HP_DAMAGE', 'SAN_DAMAGE', 'GUILLOTINE']);
    expect(queue.filter(step => relevantTypes.has(step.type)).map(step => step.type)).toEqual([
      'DICE_ROLL', 'SKILL_HUNT', 'HP_DAMAGE',
      'DICE_ROLL', 'SKILL_HUNT', 'HP_DAMAGE', 'GUILLOTINE',
      'DICE_ROLL', 'SAN_DAMAGE', 'SKILL_HUNT',
    ]);
    expect(queue.filter(step => step.type === 'SKILL_HUNT').slice(0, 2)
      .map(step => step.visualSetupPatch.players[2].hp)).toEqual([6, 3]);
    let displayStats = previousState.players.map(player => ({ hp: player.hp, san: player.san }));
    const hpAtHunt = [];
    for (const step of queue) {
      if (step.type === 'SKILL_HUNT' && step.targetIdx === 2) hpAtHunt.push(displayStats[2].hp);
      if (step.type === 'GUILLOTINE') expect(displayStats[2].hp).toBe(0);
      displayStats = applyStatAnimationImpact(displayStats, step);
    }
    expect(hpAtHunt).toEqual([6, 3]);
    const consumed = new Set();
    const loggedQueue = prepareAnimQueueLogs(queue, result);
    const consumeLogs = () => loggedQueue.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
    expect(consumeLogs()).toEqual(result.log.slice(previousState.log.length));
    expect(consumeLogs()).toEqual([]);
  });
});
