import { describe, expect, it, vi } from 'vitest';
import { resolveRestTurnEnd } from '../restTurnFlow';
import { buildRestActionQueue } from '../restTurnPresentation';
import { makePlayer, makeGs } from './factory';

describe('resolveRestTurnEnd', () => {
  const advanceTurn = vi.fn(state => ({
    ...state,
    currentTurn: 1,
    phase: 'ACTION',
    _turnStartLogs: [],
    _drawLogs: [],
    _statLogs: [],
  }));

  beforeEach(() => {
    advanceTurn.mockClear();
  });

  it('returns WIN when the rest leaves only one survivor', () => {
    const actor = makePlayer({ name: '你', hp: 3 });
    const dead = makePlayer({ name: '艾伦', isDead: true });
    const gs = makeGs({ players: [actor, dead] });

    const result = resolveRestTurnEnd(gs, { d1: 3, d2: 4, heal: 4, effectiveHandLimit: 4, advanceTurn });

    expect(result.decision).toBe('WIN');
    expect(result.gs.gameOver).toBeTruthy();
    expect(result.gs.players[0].hp).toBe(7);
    expect(advanceTurn).not.toHaveBeenCalled();
  });

  it('enters DISCARD_PHASE when hand exceeds the limit', () => {
    const cards = Array.from({ length: 6 }, (_, i) => ({ id: i, name: `c${i}`, type: 'normal' }));
    const actor = makePlayer({ name: '你', hand: cards });
    const other = makePlayer({ name: '艾伦' });
    const gs = makeGs({ players: [actor, other] });

    const result = resolveRestTurnEnd(gs, { d1: 2, d2: 5, heal: 5, effectiveHandLimit: 4, advanceTurn });

    expect(result.decision).toBe('DISCARD_PHASE');
    expect(result.pendingGs.phase).toBe('DISCARD_PHASE');
    expect(result.pendingGs.abilityData).toEqual({ discardSelected: [] });
    expect(buildRestActionQueue(result.transaction)[0]).toMatchObject({ type: 'DICE_ROLL', d1: 2, d2: 5, heal: 5 });
    expect(advanceTurn).not.toHaveBeenCalled();
  });

  it('schedules end-turn events for a CTH player going to rest', () => {
    const actor = makePlayer({ name: '你', isResting: false, godName: 'CTH', godLevel: 1 });
    const other = makePlayer({ name: '艾伦' });
    const gs = makeGs({ players: [actor, other] });

    const result = resolveRestTurnEnd(gs, { d1: 1, d2: 3, heal: 3, effectiveHandLimit: 4, advanceTurn });

    expect(result.decision).toBe('SCHEDULE_EVENTS');
    expect(result.afterRest.currentTurn).toBe(0);
    expect(buildRestActionQueue(result.transaction)[0]).toMatchObject({ type: 'DICE_ROLL' });
    expect(advanceTurn).not.toHaveBeenCalled();
  });

  it('applies next turn directly for a normal rest', () => {
    const actor = makePlayer({ name: '你', hp: 5, hand: [] });
    const other = makePlayer({ name: '艾伦' });
    const gs = makeGs({ players: [actor, other] });

    const result = resolveRestTurnEnd(gs, { d1: 2, d2: 6, heal: 6, effectiveHandLimit: 4, advanceTurn });

    expect(result.decision).toBe('APPLY_NEXT_TURN');
    expect(advanceTurn).toHaveBeenCalledTimes(1);
    expect(advanceTurn).toHaveBeenCalledWith(expect.objectContaining({ _turnFlowStage: 'turnBoundary' }));
    expect(result.nextGs.currentTurn).toBe(1);
    expect(buildRestActionQueue(result.transaction)[0]).toMatchObject({ type: 'DICE_ROLL', heal: 6 });
  });

  it('toggles resting state and heals the actor', () => {
    const actor = makePlayer({ name: '你', hp: 5, isResting: false });
    const other = makePlayer({ name: '艾伦' });
    const gs = makeGs({ players: [actor, other] });

    const result = resolveRestTurnEnd(gs, { d1: 4, d2: 4, heal: 4, effectiveHandLimit: 4, advanceTurn });

    expect(result.nextGs.players[0].hp).toBe(9);
    expect(result.nextGs.players[0].isResting).toBe(true);
    expect(result.nextGs.log.at(-1)).toContain('翻面休息中');
  });

  it('wakes the actor up when already resting', () => {
    const actor = makePlayer({ name: '你', hp: 5, isResting: true });
    const other = makePlayer({ name: '艾伦' });
    const gs = makeGs({ players: [actor, other] });

    const result = resolveRestTurnEnd(gs, { d1: 1, d2: 2, heal: 2, effectiveHandLimit: 4, advanceTurn });

    expect(result.nextGs.players[0].isResting).toBe(false);
    expect(result.nextGs.log.at(-1)).toContain('翻回正常状态');
  });
});
