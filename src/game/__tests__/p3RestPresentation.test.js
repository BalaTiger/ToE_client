import { describe, expect, it, vi } from 'vitest';
import { resolveRestTurnEnd } from '../restTurnFlow';
import { buildRestActionQueue } from '../restTurnPresentation';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGs, makePlayer, makeZoneCard } from './factory';

function resolveRest({ hp = 10, handCount = 4, godName = null } = {}) {
  const actor = makePlayer({
    name: '你', role: '追猎者', hp, godName, godLevel: godName ? 1 : 0,
    hand: Array.from({ length: handCount }, () => makeZoneCard('A1')),
  });
  const gs = makeGs({ players: [actor, makePlayer({ name: '艾伦', role: '寻宝者' })], log: ['你 的回合开始'] });
  const advanceTurn = vi.fn(state => ({ ...state, currentTurn: 1, phase: 'AI_TURN' }));
  return resolveRestTurnEnd(gs, { d1: 5, d2: 5, heal: 5, effectiveHandLimit: 4, actorIndex: 0, advanceTurn });
}

function visibleMessages(queue, state) {
  const prepared = prepareAnimQueueLogs(queue, state);
  const consumed = new Set();
  const messages = prepared.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
  // A late/repeated cue of the same prepared transaction must not repeat it.
  expect(prepared.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed))).toEqual([]);
  return messages;
}

describe('TOE005 rest presentation message ownership', () => {
  it.each([
    ['normal next turn', { handCount: 4 }, 'APPLY_NEXT_TURN'],
    ['hand-limit discard', { handCount: 5 }, 'DISCARD_PHASE'],
    ['CTH end-turn draws', { handCount: 4, godName: 'CTH' }, 'SCHEDULE_EVENTS'],
  ])('reveals one full-HP rest outcome after dice even without a stat event (%s)', (_name, options, decision) => {
    const result = resolveRest(options);
    expect(result.decision).toBe(decision);
    const { transaction } = result;
    expect(transaction.statEvents).toEqual([]);
    expect(transaction.beforeState.players[0].hp).toBe(10);
    expect(transaction.afterState.players[0].hp).toBe(10);
    expect(transaction.afterState.players[0].isResting).toBe(true);
    const restLine = transaction.msgs[0];
    expect(restLine).toContain('掷骰 5、5');
    expect(transaction.afterState.log.filter(line => line === restLine)).toHaveLength(1);

    const queue = buildRestActionQueue(transaction);
    expect(queue[0]).toMatchObject({ type: 'DICE_ROLL', d1: 5, d2: 5 });
    expect(queue[0].msgs || []).not.toContain(restLine);
    expect(queue.some(step => step.type === 'HP_HEAL' || step.type === 'HP_SAN_HEAL')).toBe(false);
    expect(queue.findIndex(step => (step.msgs || []).includes(restLine))).toBeGreaterThan(0);
    expect(queue.flatMap(step => step.msgs || []).filter(line => line === restLine)).toHaveLength(1);
    expect(visibleMessages(queue, transaction.afterState)).toEqual([restLine]);
  });

  it('keeps the existing heal cue as the sole rest-message owner when HP actually increases', () => {
    const { transaction } = resolveRest({ hp: 5 });
    expect(transaction.statEvents.length).toBeGreaterThan(0);
    expect(transaction.afterState.players[0].hp).toBe(10);
    const restLine = transaction.msgs[0];
    const queue = buildRestActionQueue(transaction);
    const heal = queue.find(step => step.type === 'HP_HEAL');
    expect(heal).toBeDefined();
    expect(heal.msgs).toContain(restLine);
    expect(queue[0].msgs || []).not.toContain(restLine);
    expect(queue.flatMap(step => step.msgs || []).filter(line => line === restLine)).toHaveLength(1);
    expect(visibleMessages(queue, transaction.afterState)).toEqual([restLine]);
  });
});
