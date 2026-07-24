import { describe, expect, it, vi } from 'vitest';
import { resolvePostDiscardEndTurn } from '../postDiscardEndTurn';
import { splitKeptDestroyedDiscarded } from '../handLimitDiscard';
import { makePlayer, makeGs, makeZoneCard } from './factory';

describe('splitKeptDestroyedDiscarded', () => {
  it('keeps normal cards and destroys black goat young / slime', () => {
    const normal = makeZoneCard('A1');
    const goat = makeZoneCard('A2', 0, { type: 'blackGoatYoung', name: '黑山羊幼仔' });
    const slime = makeZoneCard('A3', 0, { type: 'tsathogguaSlime', name: '黄液' });
    const result = splitKeptDestroyedDiscarded([normal, goat, slime]);
    expect(result.kept).toEqual([normal]);
    expect(result.destroyed).toEqual([goat, slime]);
  });
});

describe('resolvePostDiscardEndTurn', () => {
  const zone = (key = 'A1') => makeZoneCard(key);

  function makeDeps(overrides = {}) {
    const advanceTurn = vi.fn(state => ({
      ...state,
      currentTurn: 1,
      phase: 'ACTION',
      _turnStartLogs: [],
      _drawLogs: [],
      _statLogs: [],
    }));
    const applyHandDiscardSideEffectsWithAnim = vi.fn(({ players, deck, discard, log }) => ({
      players,
      deck,
      discard,
      log,
      statePatch: {},
      queue: [],
    }));
    return { advanceTurn, applyHandDiscardSideEffectsWithAnim, ...overrides };
  }

  it('returns APPLY_NEXT_TURN and builds a queue for normal discard', () => {
    const player = makePlayer({ hand: [zone('A1'), zone('A2')] });
    const baseGs = makeGs({ players: [player] });
    const discarded = player.hand.splice(0, 2);
    const { advanceTurn, applyHandDiscardSideEffectsWithAnim } = makeDeps();

    const result = resolvePostDiscardEndTurn(baseGs, {
      playersAfterDiscard: player.hand.length ? [player] : [makePlayer()],
      discarded,
      advanceTurn,
      applyHandDiscardSideEffectsWithAnim,
    });

    expect(result.decision).toBe('APPLY_NEXT_TURN');
    expect(advanceTurn).toHaveBeenCalledTimes(1);
    expect(applyHandDiscardSideEffectsWithAnim).toHaveBeenCalledWith(
      expect.objectContaining({ ownerIdx: 0, cards: discarded, reason: '手牌上限弃牌' })
    );
    const types = result.queue.map(s => s.type);
    expect(types).toContain('DISCARD');
    expect(result.queue.find(s => s.type === 'DISCARD')).toMatchObject({
      cards: discarded,
      count: 2,
      targetPid: 0,
    });
  });

  it('schedules end-turn events when CTH resting is present', () => {
    const player = makePlayer({ hand: [zone('A1')], isResting: true, godName: 'CTH', godLevel: 1 });
    const baseGs = makeGs({ players: [player] });
    const discarded = player.hand.splice(0, 1);
    const { advanceTurn, applyHandDiscardSideEffectsWithAnim } = makeDeps();

    const result = resolvePostDiscardEndTurn(baseGs, {
      playersAfterDiscard: [player],
      discarded,
      advanceTurn,
      applyHandDiscardSideEffectsWithAnim,
    });

    expect(result.decision).toBe('SCHEDULE_EVENTS');
    expect(advanceTurn).not.toHaveBeenCalled();
    expect(result.seedQueue.length).toBeGreaterThan(0);
    expect(result.kickoffGs.currentTurn).toBe(0);
    expect(result.kickoffGs.abilityData).toEqual({});
  });

  it('attaches a hand-limit discard event in multiplayer', () => {
    const player = makePlayer({ hand: [zone('A1')] });
    const baseGs = makeGs({ players: [player], _isMP: true });
    const discarded = player.hand.splice(0, 1);
    const { advanceTurn, applyHandDiscardSideEffectsWithAnim } = makeDeps();

    const result = resolvePostDiscardEndTurn(baseGs, {
      playersAfterDiscard: [player],
      discarded,
      advanceTurn,
      applyHandDiscardSideEffectsWithAnim,
    });

    expect(result.handLimitDiscardEvent).not.toBeNull();
    expect(result.newGs._visualEvents).toContain(result.handLimitDiscardEvent);
  });

  it('logs destroyed衍生牌 and does not pass them to side effects', () => {
    const keptCard = zone('A1');
    const goat = makeZoneCard('A2', 0, { type: 'blackGoatYoung', name: '黑山羊幼仔' });
    const player = makePlayer({ hand: [keptCard, goat] });
    const baseGs = makeGs({ players: [player] });
    const discarded = [keptCard, goat];
    const { advanceTurn, applyHandDiscardSideEffectsWithAnim } = makeDeps();

    resolvePostDiscardEndTurn(baseGs, {
      playersAfterDiscard: [makePlayer()],
      discarded,
      advanceTurn,
      applyHandDiscardSideEffectsWithAnim,
    });

    expect(applyHandDiscardSideEffectsWithAnim).toHaveBeenCalledWith(
      expect.objectContaining({ cards: [keptCard] })
    );
  });

  it('carries side-effect queue and state patch into the result', () => {
    const player = makePlayer({ hand: [zone('A1')] });
    const baseGs = makeGs({ players: [player] });
    const discarded = player.hand.splice(0, 1);
    const balanceQueue = [{ type: 'STAT', reason: 'balance' }];
    const statePatch = { _statEvents: [{ seq: 1 }] };
    const { advanceTurn, applyHandDiscardSideEffectsWithAnim } = makeDeps();
    applyHandDiscardSideEffectsWithAnim.mockReturnValue({
      players: [player],
      deck: baseGs.deck,
      discard: baseGs.discard,
      log: baseGs.log,
      statePatch,
      queue: balanceQueue,
    });

    const result = resolvePostDiscardEndTurn(baseGs, {
      playersAfterDiscard: [player],
      discarded,
      advanceTurn,
      applyHandDiscardSideEffectsWithAnim,
    });

    expect(result.postDiscardGs._statEvents).toEqual([{ seq: 1 }]);
    const types = result.queue.map(s => s.type);
    expect(types).toContain('DISCARD');
    expect(types).toContain('STAT');
  });
});
