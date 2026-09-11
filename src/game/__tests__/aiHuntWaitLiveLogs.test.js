import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiStep } from '../aiTurn';
import { buildAiHuntWaitPresentation } from '../aiTurnPresentation';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { getApophisNightForLevel } from '../apophisNight';
import { strictActionQueueMeta } from '../animationQueuePolicy';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';

afterEach(() => vi.restoreAllMocks());

describe('AI hunt wait live logs', () => {
  it('shows each resolved hunt damage once before the final player reveal prompt', () => {
    const players = makeStandardPlayers(4, [
      { name: '你', hp: 4, role: '寻宝者', hand: [makeZoneCard('B1')] },
      { name: '艾伦', role: '追猎者', hand: [makeZoneCard('C4'), makeZoneCard('A2'), makeZoneCard('D1')] },
      { name: '贝拉', role: '邪祀者', hand: [makeZoneCard('B4')] },
      { name: '卡洛斯', role: '寻宝者', hand: [makeZoneCard('B2')] },
    ]);
    players.forEach(player => { player.roleRevealed = true; });
    const previousState = makeGs({ players, currentTurn: 1, phase: 'AI_TURN',
      skillUsed: false, restUsed: false, multiplyUsed: false,
      _aiTurnIntroShown: true, _visualEvents: [], log: ['之前的回合'],
      apophisNight: getApophisNightForLevel(1) });
    // Stable rule randomness: two redirected hunts resolve before the third
    // roll leaves the intended local target unchanged and waits for input.
    let value = 13;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    });
    const rawResult = aiStep(previousState);
    expect(rawResult.phase).toBe('PLAYER_REVEAL_FOR_HUNT');
    expect(rawResult._aiHuntEvents.map(event => event.targetIdx)).toEqual([2, 3, 0]);
    const present = nextState => buildAiHuntWaitPresentation({ previousState, rawResult, nextState,
      isDrawnCardActuallyDiscarded: () => false, buildActorTurnStartReplay: vi.fn(), buildTurnStartIntroQueue: () => [] });
    const presentation = present(rawResult);
    expect(presentation.eventIds).toHaveLength(6);
    expect(() => strictActionQueueMeta(rawResult, presentation.queue, new Set(), 'AI hunt wait', {
      eventIds: presentation.eventIds,
    })).not.toThrow();
    const consumed = new Set();
    const logs = prepareAnimQueueLogs(presentation.queue, rawResult)
      .flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
    expect(logs).toEqual(rawResult.log.slice(previousState.log.length));
    expect(logs.at(-1)).toBe('艾伦（追猎者）向你发动【追捕】！请选择亮出一张手牌');
    expect(presentation.queue.filter(step => step.type === 'DICE_ROLL')).toHaveLength(3);
    expect(presentation.queue.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(2);
    expect(prepareAnimQueueLogs(presentation.queue, rawResult)
      .flatMap(step => consumeVisualLogEntries(step.logEntries, consumed))).toEqual([]);
    const withoutFinalTranscript = present({ ...rawResult, log: ['结算日志尚未公开'] });
    const independentIds = new Set();
    expect(prepareAnimQueueLogs(withoutFinalTranscript.queue, rawResult)
      .flatMap(step => consumeVisualLogEntries(step.logEntries, independentIds))).toEqual(logs);
  });
});
