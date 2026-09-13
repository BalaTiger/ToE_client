import { describe, expect, it, vi } from 'vitest';
import {
  isMpAiTakeoverRelevant,
  resolveMpAiTakeoverState,
  withTimeoutDrawDiscardVisual,
} from '../multiplayerAiTakeover';
import { makeBlankZoneCard, makeGs, makePlayer, makeZoneCard } from './factory';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { addDamageLink } from '../damageLinks';
import { resolveHeadlessEtherealize } from '../headlessSimulator';

const dependencies = {
  getHandLimitForPlayer: () => 4,
  resolveCaveDuelState: vi.fn(),
};

describe('multiplayer AI takeover decisions', () => {
  it('keeps a life balance at 3 HP when a safe hand-limit discard is available', () => {
    const balance = makeZoneCard('B1', 2);
    const state = makeGs({
      _isMP: true, phase: 'DISCARD_PHASE', currentTurn: 0,
      players: [
        makePlayer({ role: ROLE_TREASURE, roleRevealed: true, hp: 3,
          hand: [balance, makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('B2'), makeZoneCard('C3')] }),
        makePlayer({ role: ROLE_HUNTER, roleRevealed: true }),
      ],
      deck: [makeBlankZoneCard()],
    });
    const result = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(result.players[0].hand).toContainEqual(balance);
    expect(result.players[0].hand).toHaveLength(4);
    expect(result.players[0]).toMatchObject({ hp: 3, isDead: false });
    expect(result.currentTurn).toBe(1);
    expect(result._aiFinishingTurn).toBeUndefined();
    expect(result._aiPendingHandLimitThorns).toBeUndefined();
  });

  it('waits for a forced discard reaction and settles deferred thorns before the next turn', () => {
    const state = makeGs({
      _isMP: true, phase: 'DISCARD_PHASE', currentTurn: 0,
      players: [
        makePlayer({ role: ROLE_HUNTER, roleRevealed: true,
          hand: Array.from({ length: 5 }, () => makeZoneCard('B1', 2, { roseThornHolderId: 2, roseThornSourceId: 0 })) }),
        makePlayer({ role: ROLE_TREASURE, roleRevealed: true, etherealizeStacks: 1, hand: [makeZoneCard('D1')] }),
        makePlayer({ role: ROLE_CULTIST, roleRevealed: true }),
      ],
      deck: [makeBlankZoneCard()],
    });
    addDamageLink(state.players, 0, 1);
    const paused = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(paused.phase).toBe('ETHEREALIZE_DECISION');
    expect(paused.currentTurn).toBe(0);
    expect(paused.players[0].hand).toHaveLength(4);
    expect(paused.deck).toEqual(state.deck);
    expect(paused._aiFinishingTurn).toBe(true);
    expect(paused._aiPendingHandLimitThorns).toHaveLength(1);
    expect(paused.players[2].hp).toBe(10);

    const reaction = resolveHeadlessEtherealize(paused, { useEtherealize: false });
    const resumed = resolveMpAiTakeoverState({ ...reaction, phase: 'ACTION' }, 0, dependencies);
    expect(resumed.currentTurn).toBe(1);
    expect(resumed.players[2].hp).toBe(8);
    expect(resumed.players[0].hand).toHaveLength(4);
    expect(resumed.log.filter(line => line.includes('【玫瑰倒刺】'))).toHaveLength(1);
    expect(resumed._aiFinishingTurn).toBeUndefined();
    expect(resumed._aiPendingHandLimitThorns).toBeUndefined();
  });

  it('settles deferred thorns after the discarding player dies before advancing', () => {
    const state = makeGs({
      _isMP: true, phase: 'ACTION', currentTurn: 0,
      _aiFinishingTurn: true,
      _aiPendingHandLimitThorns: [{ id: 'deferred-after-death', roseThornHolderId: 2, roseThornSourceId: 0 }],
      players: [
        makePlayer({ role: ROLE_TREASURE, roleRevealed: true, hp: 0, isDead: true }),
        makePlayer({ role: ROLE_HUNTER, roleRevealed: true }),
        makePlayer({ role: ROLE_CULTIST, roleRevealed: true }),
        makePlayer({ role: ROLE_TREASURE, roleRevealed: true }),
      ],
      deck: [makeBlankZoneCard()],
    });
    const result = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(result.players[2].hp).toBe(8);
    expect(result.currentTurn).toBe(1);
    expect(result._aiFinishingTurn).toBeUndefined();
    expect(result._aiPendingHandLimitThorns).toBeUndefined();
  });

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
    const state = makeGs({
      players: [
        makePlayer({ name: '掉线玩家', hand: [normal, derived] }),
        makePlayer({ name: '下一位' }),
      ],
      currentTurn: 0,
      phase: 'DISCARD_PHASE',
      deck: [makeZoneCard('D4', 0, { id: 'next-draw' })],
      discard: [],
      log: [],
    });

    const result = resolveMpAiTakeoverState(state, 0, { ...dependencies, getHandLimitForPlayer: () => 0 });

    expect(result.discard).toContain(normal);
    expect(result.discard).not.toContain(derived);
    const animatedCards = result._visualEvents
      .filter(event => event.type === 'handLimitDiscard').flatMap(event => event.cards);
    expect(animatedCards).toHaveLength(2);
    expect(animatedCards).toEqual(expect.arrayContaining([derived, normal]));
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
