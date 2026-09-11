import { describe, expect, it, vi } from 'vitest';
import { resolveEndTurn, END_TURN_DECISION } from '../endTurnFlow';
import { resolvePostDiscardEndTurn } from '../postDiscardEndTurn';
import { discardCardsFromHandFromRight } from '../handLimitDiscard';
import { startNextTurn } from '../turnEngine';
import { isLocalCurrentTurn, rotateGsForViewer } from '../rotateState';
import { shouldRunMpDiscardTimer } from '../../hooks/useMultiplayerTimers';
import { makePlayer, makeGs, makeStandardPlayers, makeZoneCard } from './factory';

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

  it('restarts the local discard timer for the next over-limit turn after an automatic discard', () => {
    const players = makeStandardPlayers(3, [
      { name: '莉莉' },
      { name: '贝拉', skipNextDraw: true },
      { name: '米娅' },
    ]);
    players[0].hand = Array.from({ length: 5 }, (_, index) => leftCard(`first-${index}`));
    players[1].hand = Array.from({ length: 5 }, (_, index) => leftCard(`second-${index}`));
    const first = resolveEndTurn(makeGs({ players, _isMP: true, _turnKey: 1 }), {
      effectiveHandLimit: 4,
    }).gs;
    const timerRuns = gs => shouldRunMpDiscardTimer({ isMultiplayer: true, gs, isLocalCurrentTurn });
    expect(timerRuns(first)).toBe(true);
    expect(timerRuns(rotateGsForViewer(first, 1))).toBe(false);

    const discard = discardCardsFromHandFromRight(first.players, 0, 1);
    const resolved = resolvePostDiscardEndTurn(first, {
      playersAfterDiscard: discard.players,
      discarded: discard.discarded,
      mpEndTurnDiscardResolved: true,
      advanceTurn: startNextTurn,
    });
    expect(resolved.newGs.currentTurn).toBe(1);
    expect(resolved.newGs.phase).toBe('ACTION');
    expect(resolved.newGs.players[1].hand).toHaveLength(5);
    expect(resolved.postDiscardGs._mpEndTurnDiscardResolved).toBe(true);
    expect(timerRuns({ ...resolved.postDiscardGs, phase: 'DISCARD_PHASE' })).toBe(false);

    const nextViewer = rotateGsForViewer(resolved.newGs, 1);
    const second = resolveEndTurn(nextViewer, { effectiveHandLimit: 4 });
    expect(second.decision).toBe(END_TURN_DECISION.DISCARD);
    expect(timerRuns(second.gs)).toBe(true);
    expect(timerRuns(rotateGsForViewer(second.gs, 1))).toBe(false);
    const secondDiscard = discardCardsFromHandFromRight(second.gs.players, 0, 1);
    const secondResolved = resolvePostDiscardEndTurn(second.gs, {
      playersAfterDiscard: secondDiscard.players,
      discarded: secondDiscard.discarded,
      mpEndTurnDiscardResolved: true,
      advanceTurn: startNextTurn,
    });
    expect(secondResolved.postDiscardGs.players[0].hand).toHaveLength(4);
    expect(timerRuns({ ...secondResolved.postDiscardGs, phase: 'DISCARD_PHASE' })).toBe(false);
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
      _turnFlowStage: 'turnBoundary',
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
