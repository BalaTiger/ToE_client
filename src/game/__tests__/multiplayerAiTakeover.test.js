import { describe, expect, it, vi } from 'vitest';
import {
  isMpAiTakeoverRelevant,
  resolveMpAiTakeoverState,
  withTimeoutDrawDiscardVisual,
} from '../multiplayerAiTakeover';
import { makeGs, makePlayer, makeZoneCard } from './factory';

const dependencies = {
  getHandLimitForPlayer: () => 4,
  resolveCaveDuelState: vi.fn(),
};

describe('multiplayer AI takeover decisions', () => {
  it('accepts only the seat responsible for the current decision', () => {
    const drawState = makeGs({
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      drawReveal: {
        card: makeZoneCard('A1', 0),
        needsDecision: true,
        drawerIdx: 1,
      },
    });
    expect(isMpAiTakeoverRelevant(drawState, 1)).toBe(true);
    expect(isMpAiTakeoverRelevant(drawState, 0)).toBe(false);
    expect(isMpAiTakeoverRelevant(
      { ...drawState, gameOver: { winner: '寻宝者' } },
      1
    )).toBe(false);
  });

  it('attaches the timed-out discard visual to the resolved state', () => {
    const card = makeZoneCard('A1', 0);
    const timeoutSource = makeGs({
      players: [makePlayer({ name: '掉线玩家' })],
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      drawReveal: {
        card,
        needsDecision: true,
        drawerIdx: 0,
      },
    });
    const result = withTimeoutDrawDiscardVisual(
      { ...timeoutSource, phase: 'ACTION' },
      timeoutSource
    );

    expect(result._mpTimedOutDrawDiscard).toMatchObject({
      type: 'timedOutDrawDiscard',
      card,
      drawerIdx: 0,
    });
    expect(result._visualEvents).toEqual([
      result._mpTimedOutDrawDiscard,
    ]);
  });

  it('reveals the first legal hunt card for the disconnected target', () => {
    const revealCard = makeZoneCard('B2', 0);
    const state = makeGs({
      players: [
        makePlayer({ name: '追捕者' }),
        makePlayer({ name: '目标', hand: [revealCard] }),
      ],
      currentTurn: 0,
      phase: 'HUNT_WAIT_REVEAL',
      abilityData: { huntTi: 1 },
      log: [],
    });

    const result = resolveMpAiTakeoverState(
      state,
      1,
      dependencies
    );

    expect(result.phase).toBe('HUNT_CONFIRM');
    expect(result.abilityData.revCard).toBe(revealCard);
    expect(result._visualEvents[0]).toMatchObject({
      type: 'huntReveal',
      sourceIdx: 0,
      targetIdx: 1,
      card: revealCard,
    });
  });

  it('auto hand-limit discard destroys derived cards but publishes all discarded cards for animation', () => {
    const normal = makeZoneCard('C3', 0, { id: 'takeover-normal' });
    const derived = { id: 'takeover-derived', name: '赐福黏液', type: 'tsathogguaSlime', isTsathogguaSlime: true };
    const kept = ['A1', 'A2', 'B1', 'B2'].map(key => makeZoneCard(key, 0));
    const state = makeGs({
      players: [
        makePlayer({ name: '掉线玩家', hand: [...kept, normal, derived] }),
        makePlayer({ name: '下一位' }),
      ],
      currentTurn: 0,
      phase: 'DISCARD_PHASE',
      deck: [makeZoneCard('D4', 0, { id: 'next-draw' })],
      discard: [],
      log: [],
    });

    const result = resolveMpAiTakeoverState(state, 0, dependencies);

    expect(result.discard).toContain(normal);
    expect(result.discard).not.toContain(derived);
    expect(result._visualEvents?.find(event => event.type === 'handLimitDiscard')?.cards).toEqual([
      derived,
      normal,
    ]);
  });

  it('records one cave-duel choice while the other player is pending', () => {
    const sourceHand = [
      makeZoneCard('A1', 0),
      makeZoneCard('D4', 0),
    ];
    const state = makeGs({
      players: [
        makePlayer({ name: '来源', hand: sourceHand }),
        makePlayer({ name: '目标', hand: [makeZoneCard('B2', 0)] }),
      ],
      currentTurn: 0,
      phase: 'CAVE_DUEL_SELECT_CARD',
      abilityData: {
        caveDuelSource: 0,
        caveDuelTarget: 1,
      },
      log: [],
    });

    const result = resolveMpAiTakeoverState(
      state,
      0,
      dependencies
    );

    expect(result.phase).toBe('CAVE_DUEL_SELECT_CARD');
    expect(result.abilityData.sourceCard.id).toBe(sourceHand[1].id);
    expect(result.abilityData.targetCard).toBeUndefined();
    expect(result.log.at(-1)).toContain('已选好穴居人战争出牌');
  });

  it('delegates cave-duel continuation after both choices exist', () => {
    const sourceCard = makeZoneCard('A1', 0);
    const targetCard = makeZoneCard('B2', 0);
    const expected = { phase: 'ACTION', delegated: true };
    const resolveCaveDuelState = vi.fn(() => ({ nextGs: expected }));
    const state = makeGs({
      players: [
        makePlayer({ hand: [sourceCard] }),
        makePlayer({ hand: [targetCard] }),
      ],
      currentTurn: 0,
      phase: 'CAVE_DUEL_SELECT_CARD',
      abilityData: {
        caveDuelSource: 0,
        caveDuelTarget: 1,
        sourceCardIndex: 0,
        sourceCard,
      },
    });

    const result = resolveMpAiTakeoverState(state, 1, {
      getHandLimitForPlayer: () => 4,
      resolveCaveDuelState,
    });

    expect(result).toBe(expected);
    expect(resolveCaveDuelState).toHaveBeenCalledOnce();
  });
});
