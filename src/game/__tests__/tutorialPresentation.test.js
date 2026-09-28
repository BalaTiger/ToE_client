import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as game from '../index';
import { buildHuntStageVisualTransaction } from '../identitySkillVisualTransaction';
import { createTutorialScenario } from '../tutorialScenario';
import { startNextTurn } from '../turnEngine';
import { resolveAiGodChoiceTransition } from '../aiDecisionState';
import { compileFreshVisualEventReplay } from '../visualEventTransactionCompiler';
import { strictActionQueueMeta } from '../animationQueuePolicy';
import { resolveTreasureDodge } from '../treasureDodgeResolution';
import { buildTreasureDodgeRollPresentation } from '../treasureDodgePresentation';
import { resolveAnimationStepTiming } from '../animationTiming';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { ANIM_DURATION, ANIM_SPEED_SCALE, CARD_REVEAL_DURATION } from '../../components/anim/constants';

beforeEach(() => {
  // Inspection cards are returned and shuffled after each check. Hold the
  // shuffle stable so both tutorial and ordinary runs see the same two cards.
  vi.spyOn(Math, 'random').mockReturnValue(0.999999);
});
afterEach(() => vi.restoreAllMocks());

function expectFinitePlayback(queue) {
  expect(queue.length).toBeGreaterThan(0);
  queue.forEach(step => {
    const timing = resolveAnimationStepTiming(step, {
      durationByType: ANIM_DURATION,
      speedScale: ANIM_SPEED_SCALE,
      cardRevealDuration: CARD_REVEAL_DURATION,
    });
    expect(timing.durationMs).toBeGreaterThanOrEqual(0);
    expect(timing.durationMs).toBeLessThan(10_000);
    expect(step).not.toHaveProperty('onSettled');
  });
}

describe('tutorial uses ordinary rule transactions and finite animation playback', () => {
  it('assigns the actual local hunt message only to the reveal, not to targeting and reveal twice', () => {
    const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
    const start = source.indexOf('  function huntSelectTarget(');
    const end = source.indexOf('  function huntConfirm(', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const gs = { ...createTutorialScenario('hunter'), phase: 'HUNT_SELECT_TARGET' };
    const finish = vi.fn();
    const context = {
      ...game, buildHuntStageVisualTransaction, gs,
      isTutorialActionAllowed: () => true,
      getNextTutorialStepForAction: () => game.TUTORIAL_FLOW.HUNTER_REVEAL,
      finishTutorialActionWithState: finish,
      consumedVisualEventIdsRef: { current: new Set() },
    };
    runInNewContext(source.slice(start, end), context);
    context.huntSelectTarget(1);
    expect(finish).toHaveBeenCalledOnce();
    const [state, , queue] = finish.mock.calls[0];
    const steps = prepareAnimQueueLogs(queue, state);
    expect(steps.map(step => step.type)).toEqual(['SKILL_HUNT', 'HUNT_REVEAL_CARD']);
    const consumed = new Set();
    expect(consumeVisualLogEntries(steps[0].logEntries, consumed)).toEqual([]);
    const freshLog = state.log.slice(gs.log.length);
    expect(freshLog).toHaveLength(1);
    expect(freshLog[0]).toContain('亮出');
    expect(consumeVisualLogEntries(steps[1].logEntries, consumed)).toEqual(freshLog);
    expect(steps.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed))).toEqual([]);
  });

  it('plays both encounter and conversion inspections once before explaining the completed result', () => {
    const scenario = createTutorialScenario('cultistGod');
    const pending = startNextTurn(scenario);
    expect(pending.phase).toBe('AI_GOD_CHOICE');
    expect(pending.abilityData.pendingEncounterInspection).toBe(true);
    const result = resolveAiGodChoiceTransition(pending);
    const replay = compileFreshVisualEventReplay(pending, result.state);
    const consumed = new Set((pending._visualEvents || []).map(event => event.id));
    const meta = strictActionQueueMeta(result.state, replay.queue, consumed, 'tutorial completed conversion');
    const freshEvents = result.state._visualEvents.filter(event => !consumed.has(event.id));
    expect(new Set(meta.eventIds)).toEqual(new Set(freshEvents.map(event => event.id)));
    expect(replay.queue.filter(step => step.type === 'DRAW_CARD').map(step => step.inspectionSeq)).toEqual([1, 2]);
    expect(replay.queue.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(2);
    expect(replay.queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
    expect(replay.queue.filter(step => step.effect === 'godConvertDiscard')).toHaveLength(1);
    expect(replay.queue.filter(step => step.type === 'GOD_HIGHLIGHT')).toHaveLength(1);
    expect(result.state.players[1]).toMatchObject({
      godName: 'VRI', godLevel: 1, hp: pending.players[1].hp, san: pending.players[1].san - 1,
    });
    expect(result.state.players[0].hp).toBe(pending.players[0].hp - 4);
    expect(result.state.discard.filter(card => card.id === 'tut-target-nya')).toHaveLength(1);
    expect(result.state.phase).toBe('AI_TURN');
    expect(result.state.abilityData.pendingEncounterInspection).toBeUndefined();
    expect(resolveAiGodChoiceTransition(result.state)).toBeNull();
    // The tutorial marker must not introduce a second rule or animation route.
    const ordinary = resolveAiGodChoiceTransition({ ...pending, _isTutorial: false });
    expect(ordinary.state.players).toEqual(result.state.players);
    expect(ordinary.state.log).toEqual(result.state.log);
    expect(compileFreshVisualEventReplay(pending, ordinary.state).queue.map(step => step.type))
      .toEqual(replay.queue.map(step => step.type));
    expectFinitePlayback(replay.queue);
  });

  it('finishes the ordinary dice/effects/income queue before explaining dodge success', () => {
    const scenario = createTutorialScenario('treasure');
    const pending = startNextTurn({ ...scenario, currentTurn: scenario.players.length - 1 });
    expect(pending.drawReveal.card.id).toBe('tut-treasure-forced-draw');
    const result = resolveTreasureDodge(pending, pending.drawReveal, { roll: 6, actorLabel: '你' });
    const presentation = buildTreasureDodgeRollPresentation(result.transaction);
    const consumed = new Set((pending._visualEvents || []).map(event => event.id));
    strictActionQueueMeta(presentation.afterState, presentation.queue, consumed, 'tutorial completed dodge');
    expect(presentation.queue.map(step => step.type)).toEqual(['DICE_ROLL', 'CARD_TRANSFER']);
    expect(presentation.queue[0]).toMatchObject({ d1: 6, dodgeSuccess: true });
    expect(presentation.queue[1]).toMatchObject({ dest: 'player', toPid: 0, cards: [pending.drawReveal.card] });
    expect(pending.players[0].hand).toHaveLength(3);
    expect(presentation.afterState.players[0].hand.filter(card => card.id === pending.drawReveal.card.id)).toHaveLength(1);
    expect(presentation.afterState.players[0]).toMatchObject({ hp: 10, san: 10 });
    expect(presentation.afterState).toMatchObject({ phase: 'ACTION', drawReveal: null });
    expect(presentation.afterState.abilityData.pendingZoneIncome).toBeUndefined();
    const ordinary = resolveTreasureDodge({ ...pending, _isTutorial: false }, pending.drawReveal, { roll: 6, actorLabel: '你' });
    expect(ordinary.transaction.afterState.players).toEqual(presentation.afterState.players);
    expect(buildTreasureDodgeRollPresentation(ordinary.transaction).queue).toEqual(presentation.queue);
    expectFinitePlayback(presentation.queue);
  });

  it.each([[6, 10], [1, 10], [1, 5]])('reveals roll=%s SAN=%s messages at their own animation steps exactly once', (roll, san) => {
    const scenario = createTutorialScenario('treasure');
    const pending = startNextTurn({ ...scenario, currentTurn: scenario.players.length - 1 });
    pending.players[0].san = san;
    const { transaction } = resolveTreasureDodge(pending, pending.drawReveal, { roll, actorLabel: '你' });
    const presentation = buildTreasureDodgeRollPresentation(transaction);
    const queue = prepareAnimQueueLogs(presentation.queue, presentation.afterState);
    const logIds = new Set();
    const dice = queue[0];
    const transfer = queue.at(-1);
    expect(dice).toMatchObject({ type: 'DICE_ROLL', impactAtMs: 1200 });
    expect(consumeVisualLogEntries(dice.logEntries, logIds)).toEqual([transaction.rollLog]);
    const effects = queue.slice(1, -1).flatMap(step => consumeVisualLogEntries(step.logEntries, logIds));
    expect(effects).not.toContain(transaction.incomeLog);
    expect(effects).not.toContain(transaction.rollLog);
    expect(transfer.type).toBe('CARD_TRANSFER');
    expect(consumeVisualLogEntries(transfer.logEntries, logIds)).toEqual([transaction.incomeLog]);
    expect(queue.flatMap(step => consumeVisualLogEntries(step.logEntries, logIds))).toEqual([]);
    if (roll === 1) {
      expect(effects.some(line => line.includes('失去'))).toBe(true);
      expect(queue.some(step => step.type === 'SAN_DAMAGE')).toBe(true);
    }
  });
});
