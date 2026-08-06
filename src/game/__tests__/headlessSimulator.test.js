import { describe, expect, it } from 'vitest';
import {
  advanceHeadlessGame,
  createHeadlessGame,
  createSeededRandom,
  runHeadlessGame,
  simulateHeadlessGames,
  withRandomSource,
  continueHeadlessTurnStartDraw,
} from '../headlessSimulator';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { createTsathogguaSlimeCard } from '../../constants/card';
import { makeGs, makePlayer, makeZoneCard } from './factory';

const PRESETS = [
  { [ROLE_TREASURE]: 2, [ROLE_HUNTER]: 2, [ROLE_CULTIST]: 1 },
];

describe('headless simulator', () => {
  it('creates an all-AI game with the requested exact role composition', () => {
    const roleCounts = PRESETS[0];
    const state = withRandomSource(
      createSeededRandom(17),
      () => createHeadlessGame({ roleCounts }),
    );
    const actualCounts = state.players.reduce((counts, player) => ({
      ...counts,
      [player.role]: (counts[player.role] || 0) + 1,
    }), {});

    expect(actualCounts).toMatchObject(roleCounts);
    expect(state._isMP).toBe(true);
    expect(state._headless).toBe(true);
    expect(state.phase).not.toBe('DRAW_REVEAL');
  });

  it('is deterministic for the same seed and configuration', () => {
    const first = runHeadlessGame({ seed: 2043, roleCounts: PRESETS[0] });
    const second = runHeadlessGame({ seed: 2043, roleCounts: PRESETS[0] });

    expect(first.status).toBe('complete');
    expect(second).toMatchObject({
      status: first.status,
      winner: first.winner,
      steps: first.steps,
      turns: first.turns,
    });
  });

  it('reports unknown decision phases instead of silently skipping them', () => {
    const state = {
      phase: 'UNIMPLEMENTED_DECISION',
      players: [],
      deck: [],
      discard: [],
      log: [],
      abilityData: {},
    };

    expect(advanceHeadlessGame(state)).toEqual({
      state,
      status: 'unresolved',
      phase: 'UNIMPLEMENTED_DECISION',
    });
  });

  it('黏液权利动态重算：转移到别人手里的黏液不会被原摸牌者消耗', () => {
    const transferredSlime = createTsathogguaSlimeCard();
    const players = [
      makePlayer({ name: '摸牌者', godName: 'TSG', godLevel: 1, hand: [] }),
      makePlayer({ name: '持有者', hand: [transferredSlime] }),
    ];
    const state = makeGs({
      players,
      currentTurn: 0,
      deck: [makeZoneCard('B3', 0)],
      phase: 'AI_TURN',
      abilityData: { continueTurnStartDraw: true, fromTsathogguaSlime: true, _turnOwner: 0 },
    });

    const next = continueHeadlessTurnStartDraw(state);

    expect(next.players[1].hand).toContain(transferredSlime);
    expect(next.abilityData.continueTurnStartDraw).not.toBe(true);
  });

  it('朱雀中断后的单次待摸标记不会提前消耗下一张黏液', () => {
    const remainingSlime = createTsathogguaSlimeCard();
    const players = [
      makePlayer({ name: '摸牌者', role: ROLE_CULTIST, godName: 'TSG', godLevel: 1, hand: [remainingSlime] }),
      makePlayer({ name: '对手', role: ROLE_HUNTER }),
    ];
    const state = makeGs({
      players,
      currentTurn: 0,
      deck: [makeZoneCard('B3', 0)],
      phase: 'AI_TURN',
      abilityData: {
        continueTurnStartDraw: true,
        fromTsathogguaSlime: true,
        _tsgExtraDrawReady: true,
        _turnOwner: 0,
      },
    });

    const next = continueHeadlessTurnStartDraw(state);

    expect(next.players[0].hand).toContain(remainingSlime);
    expect(next.abilityData).toMatchObject({ continueTurnStartDraw: true, _turnOwner: 0 });
    expect(next.abilityData._tsgExtraDrawReady).toBeUndefined();
  });

  it.each(PRESETS)('completes a seeded batch for role composition %#', roleCounts => {
    const summary = simulateHeadlessGames({
      games: 40,
      seed: 100,
      roleCounts,
    });

    expect(summary.statuses).toEqual({ complete: 40 });
    expect(summary.unresolvedPhases).toEqual({});
    expect(Object.keys(summary.winners)).not.toContain('LOSE');
  });
});
