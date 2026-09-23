import { describe, expect, it } from 'vitest';
import { attachIncomePresentation } from '../incomePresentation';
import { compileRuleVisualEventsToAnimTransaction } from '../visualEventTransactionCompiler';
import { createStatEventsEvent, createTurnDrawVisualEvents } from '../visualEvents';
import { resolveAnimationStepTiming } from '../animationTiming';
import { applyStatAnimationImpact } from '../statEvents';

const card = { id: 'recovery', name: '恢复', isZone: true };
const stats = (target = 0) => ({ type: 'HP_GAIN', target, from: { hp: 6, san: 8 }, to: { hp: 7, san: 8 }, seq: 1 });
const stat = (event = stats()) => ({ type: 'HP_HEAL', statEvents: [event], durationMs: 900, impactAtMs: 350 });
const transfer = (pid = 0) => ({ type: 'CARD_TRANSFER', dest: 'player', toPid: pid, fromPid: pid,
  sourceAnchor: 'playerArea', effect: 'draw', cards: [card], durationMs: 800,
  visualTimeline: [{ atMs: 360, patch: { players: Array.from({ length: pid + 1 }, () => ({ hand: [card] })) } }],
});
const draw = (pid = 0) => ({ type: 'DRAW_CARD', card, targetPid: pid, durationMs: 3500 });
const options = { stepGapMs: 420 };

describe('income presentation overlap', () => {
  it.each([0, 1, 3])('starts at the first stat for seat %i and keeps every original cue and commit', pid => {
    const hp = stat(stats(pid));
    const san = { ...stat({ type: 'SAN_LOSS', target: pid, from: { hp: 7, san: 8 }, to: { hp: 7, san: 7 } }), type: 'SAN_DAMAGE', impactAtMs: 460 };
    const queue = [draw(pid), hp, san, transfer(pid)];
    const result = attachIncomePresentation(queue, options);
    expect(result[1].incomeFlight.flightDurationMs).toBe(3000);
    expect(result[2].incomeFlight).toBe(result[1].incomeFlight);
    expect(result[3].incomeFlight).toBe(result[1].incomeFlight);
    expect(result.map(step => Object.fromEntries(Object.entries(step).filter(([key]) => key !== 'incomeFlight')))).toEqual(queue);
    expect(queue[1].incomeFlight).toBeUndefined();
    expect(applyStatAnimationImpact(Array.from({ length: pid + 1 }, () => ({ hp: 6, san: 8 })), result[1])[pid]).toEqual({ hp: 7, san: 8 });
    expect(applyStatAnimationImpact(Array.from({ length: pid + 1 }, () => ({ hp: 7, san: 8 })), result[2])[pid]).toEqual({ hp: 7, san: 7 });
  });

  it('supports a choice transaction without replaying its already displayed draw', () => {
    const queue = [stat(), transfer()];
    expect(attachIncomePresentation(queue, { ...options, decision: { card, actorIdx: 0 } })[0].incomeFlight).toBeDefined();
    expect(attachIncomePresentation(queue, { ...options, decision: { card: { id: 'other' }, actorIdx: 0 } })).toEqual(queue);
  });

  it.each([
    { type: 'DRAW_CARD', card: { effect: 'inspection' } },
    { type: 'VRI_IMMORTAL_REVEAL' }, { type: 'TSG_SLIME_POP' },
    { type: 'DEATH' }, { type: 'DICE_ROLL' },
    stat({ ...stats(), to: { hp: 0, san: 8 } }),
    stat({ ...stats(), linkDamage: true }), stat(stats(1)),
    { type: 'HP_HEAL' },
  ])('retains the source and excludes complex or unverified tail $type', extra => {
    const queue = [draw(), extra, stat(), transfer()];
    const result = attachIncomePresentation(queue, options);
    expect(result.every(step => !step.incomeFlight)).toBe(true);
    expect(result[1].incomeReveal).toEqual({ card, targetPid: 0 });
    expect(result[2].incomeReveal).toBe(result[1].incomeReveal);
    expect(result[3].incomeReveal).toBeUndefined();
  });

  it('never borrows another draw or an earlier transfer as the source', () => {
    for (const boundary of [{ ...draw(), card: { id: 'other' } }, { type: 'CARD_TRANSFER' }]) {
      const queue = [draw(), stat(), boundary, stat(), transfer()];
      expect(attachIncomePresentation(queue, options)).toEqual(queue);
    }
  });

  it.each([{ phase: 'ETHEREALIZE_DECISION' }, { gameOver: true }, { abilityData: { pendingZoneIncome: { card } } }])('does not overlap an unresolved or terminal result', nextState => {
    const result = attachIncomePresentation([draw(), stat(), transfer()], { ...options, nextState });
    expect(result[1].incomeFlight).toBeUndefined();
    expect(result[1].incomeReveal).toBeDefined();
  });

  it('handles canonical replay with a trailing STATE_PATCH without changing rule events', () => {
    const before = [{ hp: 6, san: 8, hand: [] }];
    const after = [{ hp: 7, san: 8, hand: [card] }];
    const effect = createStatEventsEvent({ statEvents: [stats()], turnStartStage: 'draw' });
    const events = [...createTurnDrawVisualEvents({ playerIdx: 0, card, keptInHand: true,
      playersBefore: before, playersAfterKeep: after, effectVisualEventIds: [effect.id] }), effect];
    const transaction = compileRuleVisualEventsToAnimTransaction({ players: after, _visualEvents: events });
    const original = JSON.stringify(transaction);
    const timed = transaction.queue.map(step => resolveAnimationStepTiming(step, { durationByType: { default: 900 } }));
    const result = attachIncomePresentation(timed, options);
    expect(result.map(step => step.type)).toEqual(['DRAW_CARD', 'HP_HEAL', 'CARD_TRANSFER', 'STATE_PATCH']);
    expect(result[1].incomeFlight.flightDurationMs).toBe(2640);
    expect(result[3]).toBe(timed[3]);
    expect(JSON.stringify(transaction)).toBe(original);
  });
});
