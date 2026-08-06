import { describe, expect, it, vi } from 'vitest';
import { resolveEndTurn, END_TURN_DECISION } from '../endTurnFlow';
import { makePlayer, makeGs, makeZoneCard } from './factory';

const leftCard = (id = 'left') => makeZoneCard('A1', 0, { id });

const corridor = (id = 'corridor') =>
  makeZoneCard('A3', 0, { id, name: '无尽通道', type: 'endTurnReplayHand' });

describe('resolveEndTurn', () => {
  it('enters DISCARD_PHASE when hand exceeds effective hand limit', () => {
    const player = makePlayer({
      hand: [leftCard('a'), leftCard('b'), leftCard('c'), leftCard('d'), leftCard('e')],
    });
    const gs = makeGs({ players: [player], currentTurn: 0, phase: 'ACTION' });

    const result = resolveEndTurn(gs, { effectiveHandLimit: 4 });

    expect(result.decision).toBe(END_TURN_DECISION.DISCARD);
    expect(result.gs.phase).toBe('DISCARD_PHASE');
    expect(result.gs._turnFlowStage).toBe('discard');
    expect(result.gs.abilityData).toMatchObject({
      discardSelected: [],
      fromEndTurn: true,
    });
  });

  it('schedules end-turn events for a resting CTH player', () => {
    const player = makePlayer({ isResting: true, godName: 'CTH', godLevel: 1 });
    const gs = makeGs({ players: [player], currentTurn: 0, log: [] });

    const result = resolveEndTurn(gs, { effectiveHandLimit: 4 });

    expect(result.decision).toBe(END_TURN_DECISION.SCHEDULE_EVENTS);
    expect(result.baseGs.currentTurn).toBe(0);
    expect(result.baseGs._turnFlowStage).toBe('endTurn');
    expect(result.baseGs.abilityData).toEqual({});
  });

  it('schedules end-turn events for TSG slime grant', () => {
    const player = makePlayer({ godName: 'TSG', godLevel: 1 });
    const gs = makeGs({ players: [player], currentTurn: 0, log: [] });

    const result = resolveEndTurn(gs, { effectiveHandLimit: 4 });

    expect(result.decision).toBe(END_TURN_DECISION.SCHEDULE_EVENTS);
  });

  it('schedules events when endless corridor is present in hand', () => {
    const player = makePlayer({ hand: [leftCard('left'), corridor()] });
    const gs = makeGs({ players: [player], currentTurn: 0, log: [] });

    const result = resolveEndTurn(gs, { effectiveHandLimit: 4 });

    expect(result.decision).toBe(END_TURN_DECISION.SCHEDULE_EVENTS);
  });

  it('advances to next player when there are no end-turn events', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = makeGs({ players, currentTurn: 0, log: [], deck: [] });

    const result = resolveEndTurn(gs, { effectiveHandLimit: 4 });

    expect(result.decision).toBe(END_TURN_DECISION.APPLY_NEXT_TURN);
    expect(result.newGs.currentTurn).toBe(1);
  });

  it('uses injected advanceTurn so App-level wrappers can preserve visual events', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = makeGs({ players, currentTurn: 0, log: [], deck: [] });
    const advanceTurn = vi.fn(state => ({
      ...state,
      currentTurn: 1,
      phase: 'ACTION',
      _visualEvents: [{ type: 'turnStart', id: 'wrapped-event' }],
    }));

    const result = resolveEndTurn(gs, { effectiveHandLimit: 4, advanceTurn });

    expect(advanceTurn).toHaveBeenCalledTimes(1);
    expect(advanceTurn).toHaveBeenCalledWith(expect.objectContaining({
      currentTurn: 0,
      players: expect.any(Array),
    }));
    expect(result.decision).toBe(END_TURN_DECISION.APPLY_NEXT_TURN);
    expect(result.newGs._visualEvents).toEqual([{ type: 'turnStart', id: 'wrapped-event' }]);
  });

  it('applies next turn directly when turn wraps back to self', () => {
    const card = makeZoneCard('A1');
    const player = makePlayer({ name: '你' });
    const resting = makePlayer({ name: '艾伦', isResting: true });
    const dead = makePlayer({ name: '鲍勃', isDead: true });
    const gs = makeGs({
      players: [player, resting, dead],
      currentTurn: 0,
      log: [],
      deck: [card],
    });

    const result = resolveEndTurn(gs, { effectiveHandLimit: 4 });

    expect(result.decision).toBe(END_TURN_DECISION.APPLY_NEXT_TURN);
    expect(result.newGs.currentTurn).toBe(0);
    expect(result.newGs.drawReveal?.card).toBeDefined();
    expect(result.queue).toBeUndefined();
  });
});
