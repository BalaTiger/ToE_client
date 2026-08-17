import { describe, expect, it } from 'vitest';
import {
  advanceEndTurnReplayPatch,
  buildEndTurnReplayFinishedState,
  buildEndTurnReplayGodEncounter,
  buildEndTurnReplayStartState,
  buildEndTurnReplayZoneDraw,
  endlessCorridorTunnelStep,
  getCurrentEndTurnReplayCard,
  resolveEndTurnReplayDiscard,
} from '../endTurnReplayFlow';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

const corridor = (id = 'corridor') => makeZoneCard('A3', 0, { id, name: '鏃犲敖閫氶亾', type: 'endTurnReplayHand' });

describe('endTurnReplayFlow', () => {
  it('builds the player replay state from cards left of endless corridor', () => {
    const left = makeZoneCard('A1', 0, { id: 'left' });
    const right = makeZoneCard('B2', 0, { id: 'right' });
    const player = makePlayer({ hand: [left, corridor(), right] });
    const baseGs = makeGs({ phase: 'END_TURN' });

    const state = buildEndTurnReplayStartState({
      baseGs,
      players: [player],
      deck: [],
      discard: [],
      log: ['before'],
    });

    expect(state).toEqual(expect.objectContaining({
      phase: 'ACTION',
      currentTurn: 0,
      drawReveal: null,
      abilityData: {},
      _endTurnReplay: { actorIndex: 0, cards: ['left'], index: 0 },
    }));
    expect(state.log).toEqual([
      'before',
      expect.stringContaining('【无尽通道】你展示所有手牌：'),
    ]);
  });

  it('returns null when no replay card is pending', () => {
    const player = makePlayer({ hand: [makeZoneCard('A1', 0, { id: 'left' })] });

    expect(buildEndTurnReplayStartState({
      baseGs: makeGs(),
      players: [player],
      deck: [],
      discard: [],
      log: [],
    })).toBeNull();
  });

  it('finds the current replay card only while it remains in hand', () => {
    const left = makeZoneCard('A1', 0, { id: 'left' });
    const player = makePlayer({ hand: [left] });
    const state = makeGs({
      players: [player],
      _endTurnReplay: { actorIndex: 0, cards: ['left'], index: 0 },
    });

    expect(getCurrentEndTurnReplayCard(state)).toEqual({ actorIndex: 0, card: left, index: 0 });
    expect(getCurrentEndTurnReplayCard({
      ...state,
      players: [makePlayer({ hand: [] })],
    })).toBeNull();
  });

  it('builds the tunnel animation step before replayed draws', () => {
    expect(endlessCorridorTunnelStep()).toEqual({ type: 'ENDLESS_CORRIDOR_TUNNEL' });
  });

  it('advances replay index without mutating the source state', () => {
    const state = makeGs({ _endTurnReplay: { actorIndex: 0, cards: ['a', 'b'], index: 1 } });

    expect(advanceEndTurnReplayPatch(state)).toEqual({
      _endTurnReplay: { actorIndex: 0, cards: ['a', 'b'], index: 2 },
    });
    expect(state._endTurnReplay.index).toBe(1);
  });

  it('builds god encounter replay data for a non-cultist', () => {
    const god = makeGodCard('CTH', { id: 'god' });
    const player = makePlayer({ godEncounters: 1 });
    const state = makeGs({ abilityData: { fromRest: true } });
    const replay = { actorIndex: 0, cards: ['god'], index: 0 };

    const result = buildEndTurnReplayGodEncounter({
      stateLike: state,
      players: [player],
      replay,
      actorIndex: 0,
      index: 0,
      card: god,
      isCultist: false,
    });

    expect(result.players[0].godEncounters).toBe(2);
    expect(result.cost).toBe(2);
    expect(result.effectMsg).toContain('失去 2 SAN');
    expect(result.abilityData).toEqual(expect.objectContaining({
      fromRest: true,
      godCard: god,
      drawerIdx: 0,
      godEncounterCost: 2,
      fromEndTurnReplay: true,
    }));
  });

  it('builds god encounter replay data for a cultist without SAN cost', () => {
    const god = makeGodCard('CTH', { id: 'god' });
    const player = makePlayer({ godEncounters: 0, roleRevealed: false });

    const result = buildEndTurnReplayGodEncounter({
      stateLike: makeGs(),
      players: [player],
      replay: { actorIndex: 0, cards: ['god'], index: 0 },
      actorIndex: 0,
      index: 0,
      card: god,
      isCultist: true,
    });

    expect(result.players[0].roleRevealed).toBe(false);
    expect(result.cost).toBe(1);
    expect(result.abilityData.godEncounterCost).toBe(1);
    expect(result.effectMsg).toContain('失去 1 SAN');
  });

  it('builds zone draw state and draw animation step', () => {
    const card = makeZoneCard('A1', 0, { id: 'zone' });
    const player = makePlayer({ name: '鐜╁A', hand: [card] });
    const replay = { actorIndex: 0, cards: ['zone'], index: 0 };

    const result = buildEndTurnReplayZoneDraw({
      stateLike: makeGs({ abilityData: { keep: true } }),
      players: [player],
      replay,
      actorIndex: 0,
      index: 0,
      card,
      actorName: '鐜╁A',
    });

    expect(result.state).toEqual(expect.objectContaining({
      phase: 'DRAW_REVEAL',
      drawReveal: expect.objectContaining({
        card,
        drawerIdx: 0,
        drawerName: '鐜╁A',
        fromEndTurnReplay: true,
      }),
      abilityData: { keep: true },
      _endTurnReplay: replay,
    }));
    expect(result.drawStep).toEqual(expect.objectContaining({
      type: 'DRAW_CARD',
      card,
      triggerName: '无尽通道',
      targetPid: 0,
      skipTravel: true,
    }));
  });

  it('marks forced replayed zone cards as forced keep without a draw decision', () => {
    const card = makeZoneCard('A1', 0, { id: 'forced-zone', forced: true });
    const player = makePlayer({ hand: [card] });

    const result = buildEndTurnReplayZoneDraw({
      stateLike: makeGs(),
      players: [player],
      replay: { actorIndex: 0, cards: ['forced-zone'], index: 0 },
      actorIndex: 0,
      index: 0,
      card,
    });

    expect(result.state.drawReveal).toEqual(expect.objectContaining({
      needsDecision: false,
      forcedKeep: true,
      fromEndTurnReplay: true,
    }));
  });

  it('builds a cleaned state when replay ends or the next card is gone', () => {
    const player = makePlayer();
    const state = makeGs({
      players: [],
      currentTurn: 3,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: makeZoneCard('A1', 0) },
      abilityData: { fromEndTurnReplay: true },
      _endTurnReplay: { actorIndex: 0, cards: ['missing'], index: 0 },
    });

    expect(buildEndTurnReplayFinishedState({ stateLike: state, players: [player] })).toEqual(expect.objectContaining({
      players: [player],
      currentTurn: 0,
      phase: 'ACTION',
      drawReveal: null,
      abilityData: {},
      _endTurnReplay: null,
    }));
  });

  it('destroys a derived card discarded by a stale end-turn replay state', () => {
    const derived = { id: 'derived', name: '黑山羊幼仔', isBlackGoatYoung: true };
    const player = makePlayer({ hand: [derived] });
    const oldDiscard = [makeZoneCard('A1', 0, { id: 'old-discard' })];

    const result = resolveEndTurnReplayDiscard({
      players: [player],
      discard: oldDiscard,
      actorIndex: 0,
      card: derived,
    });

    expect(result.destroyed).toBe(true);
    expect(result.players[0].hand).toEqual([]);
    expect(result.discard).toEqual(oldDiscard);
  });

  it('keeps normal replay discards in the discard pile', () => {
    const card = makeZoneCard('A1', 0, { id: 'normal' });
    const player = makePlayer({ hand: [card] });

    const result = resolveEndTurnReplayDiscard({
      players: [player],
      discard: [],
      actorIndex: 0,
      card,
    });

    expect(result.destroyed).toBe(false);
    expect(result.players[0].hand).toEqual([]);
    expect(result.discard).toEqual([card]);
  });
  it('uses SAN cost for unrevealed cultist replay encounters', () => {
    const god = makeGodCard('CTH', { id: 'god' });
    const player = makePlayer({ godEncounters: 0, roleRevealed: false });

    const result = buildEndTurnReplayGodEncounter({
      stateLike: makeGs(),
      players: [player],
      replay: { actorIndex: 0, cards: ['god'], index: 0 },
      actorIndex: 0,
      index: 0,
      card: god,
      isCultist: true,
    });

    expect(result.players[0].roleRevealed).toBe(false);
    expect(result.abilityData.godEncounterCost).toBe(1);
    expect(result.effectMsg).toContain('失去 1 SAN');
  });

  it('uses zero SAN cost for revealed cultist replay encounters', () => {
    const god = makeGodCard('CTH', { id: 'god' });
    const player = makePlayer({ godEncounters: 0, roleRevealed: true });

    const result = buildEndTurnReplayGodEncounter({
      stateLike: makeGs(),
      players: [player],
      replay: { actorIndex: 0, cards: ['god'], index: 0 },
      actorIndex: 0,
      index: 0,
      card: god,
      isCultist: true,
    });

    expect(result.abilityData.godEncounterCost).toBe(0);
    expect(result.effectMsg).toContain('免疫SAN损耗');
  });
});
