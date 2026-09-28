import { afterEach, expect, it, vi } from 'vitest';
import { processAiEndTurnReplayHand } from '../aiTurn';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { getVisualEventIdsCoveredByAnimationQueue } from '../visualEventTransactionCompiler';
import { scopeAiActionReplayMetadata } from '../aiTurnPresentation';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

afterEach(() => vi.restoreAllMocks());

it('keeps the failed corridor Sphinx guess, dodge and damage in one result transaction', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.4); // Guess zone; dodge rolls 3.
  const sphinx = makeZoneCard('D4', 4);
  const corridor = makeZoneCard('A3', 3);
  const players = [
    makePlayer({ name: '你' }),
    makePlayer({ name: '卡洛斯', hand: [sphinx, corridor, makeGodCard('SHU'), makeZoneCard('C1', 3)] }),
  ];
  const gs = makeGs({ players, deck: [makeGodCard('SHU')], currentTurn: 1, phase: 'AI_TURN' });
  const result = processAiEndTurnReplayHand(players, [...gs.deck], [], [], 1, gs);
  const queue = prepareAnimQueueLogs(result.replayQueue);
  const consumed = new Set();
  const visibleLines = queue.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));

  expect(result.P[1].hp).toBe(7);
  expect(result.L).toContain('卡洛斯（寻宝者）掷出 3 点，未能规避，触发负面效果！');
  expect(visibleLines).toEqual(result.L);
  const damageSteps = queue.filter(step => step.type === 'HP_DAMAGE');
  expect(damageSteps).toHaveLength(1);
  const sphinxEvent = result.statePatch._visualEvents.find(event => event.type === 'sphinxResult');
  expect(damageSteps[0].visualEventId).toBe(sphinxEvent.id);
  const coveredIds = getVisualEventIdsCoveredByAnimationQueue(result.statePatch, queue);
  const statWrapper = result.statePatch._visualEvents.find(event => event.type === 'statEvents');
  expect(coveredIds).toContain(statWrapper.id);
  expect(scopeAiActionReplayMetadata(result.statePatch, { excludedVisualEventIds: coveredIds }).visualEvents).toEqual([]);
  expect(queue.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed))).toEqual([]);
});
