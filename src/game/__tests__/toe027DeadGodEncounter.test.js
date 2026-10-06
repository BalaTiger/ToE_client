import { describe, expect, it } from 'vitest';
import { playerDrawCard, recoverDeadGodChoiceState, startNextTurn } from '../turnEngine';
import { buildTargetContinuationState, resolveTargetContinuation } from '../targetContinuation';
import { resolveAiGodChoiceTransition } from '../aiDecisionState';
import { compileFreshVisualEventQueue } from '../visualEventTransactionCompiler';
import { prepareAnimationTransaction } from '../animationTransaction';
import { getMultiplayerWinnerRole } from '../../multiplayer/useMultiplayerStateBroadcast';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

function encounter({ drawerIdx = 1, count = 2, drawer = {}, extraDeck = [] } = {}) {
  const god = makeGodCard('CTH', { id: 'unowned-cth' });
  const oldHand = makeZoneCard('B1', 0, { id: 'old-hand' });
  const players = Array.from({ length: count }, (_, i) => makePlayer({ name: `seat-${i}` }));
  players[drawerIdx] = makePlayer({ name: 'fatal-drawer', hp: 2, san: 8,
    godEncounters: 1, hand: [oldHand], ...drawer });
  const gs = makeGs({ _isMP: true, players, currentTurn: (drawerIdx + count - 1) % count,
    turn: 12, deck: [god, ...extraDeck],
    inspectionDeck: [{ name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' }],
    inspectionDiscard: [], _visualEvents: [],
  });
  return { gs, god, oldHand };
}

function independentGodChoices({ isMP = true, deadDrawerIdx = 0, liveDrawerIdx = 1 } = {}) {
  const deadGod = makeGodCard('NYA', { id: 'dead-unowned-nya' });
  const liveGod = makeGodCard('ZHU', { id: 'live-unowned-zhu' });
  const priorFaith = makeGodCard('CTH', { id: 'live-prior-faith-cth' });
  const safeDraw = makeZoneCard('B1', 0, { id: 'not-drawn-while-live-choice-pending' });
  const deadChoice = { drawerIdx: deadDrawerIdx, godCard: deadGod, godEncounterCost: 0 };
  const liveChoice = { drawerIdx: liveDrawerIdx, godCard: liveGod, godEncounterCost: 0, marker: 'independent-live-choice' };
  const players = Array.from({ length: 3 }, () => makePlayer({ name: 'live-observer' }));
  players[deadDrawerIdx] = makePlayer({ name: 'dead-drawer', hp: 0, san: 6, isDead: true });
  players[liveDrawerIdx] = makePlayer({ name: 'live-drawer', godName: 'CTH', godLevel: 1,
    hasBelievedGod: true, godZone: [priorFaith] });
  const state = makeGs({ _isMP: isMP, players, currentTurn: deadDrawerIdx, turn: 13, deck: [safeDraw],
    log: ['already-settled death'], _visualEvents: [],
    _decisionContinuations: [
      { phase: 'GOD_CHOICE', abilityData: liveChoice },
      { phase: 'GOD_CHOICE', abilityData: deadChoice },
    ],
  });
  return { state, deadGod, liveGod, deadChoice, liveChoice };
}

describe('TOE027 lethal SAN inspection before a god response', () => {
  it('settles the real encounter death and discards the unowned god exactly once', () => {
    const { gs, god, oldHand } = encounter();
    const result = playerDrawCard(gs.players, gs.deck, [], 1, { ...gs, currentTurn: 1 });
    expect(result.P[1]).toMatchObject({ hp: 0, san: 6, isDead: true, hand: [], godZone: [] });
    expect(result.needGodChoice).not.toBe(true);
    expect(result.Disc.filter(card => card.id === god.id)).toHaveLength(1);
    expect(result.Disc).toContainEqual(oldHand);
    expect(result.statePatch._decisionContinuations || []).toEqual([]);
  });

  it('freshly drawing Vritra cannot grant immortality before a fatal SAN inspection', () => {
    const { gs } = encounter();
    const freshVri = makeGodCard('VRI', { id: 'fresh-unowned-vri' });
    const result = startNextTurn({ ...gs, deck: [freshVri] });
    expect(result.players[1]).toMatchObject({ hp: 0, san: 6, isDead: true, godName: null, godZone: [] });
    expect(result.gameOver).toMatchObject({ winner: '寻宝者', winnerIdx: 0 });
    expect(result.discard.filter(card => card.id === freshVri.id)).toHaveLength(1);
    expect(result.abilityData.godCard).toBeUndefined();
  });

  it('own-turn etherealize does not prevent or postpone the fatal inspection', () => {
    const { gs, god } = encounter({ drawer: { etherealizeStacks: 1 } });
    const result = startNextTurn(gs);
    expect(result.players[1]).toMatchObject({ hp: 0, san: 6, isDead: true, etherealizeStacks: 1 });
    expect(result.gameOver).toMatchObject({ winner: '寻宝者', winnerIdx: 0 });
    expect(result.phase).toBe('ACTION');
    expect(result.discard.filter(card=>card.id===god.id)).toHaveLength(1);
  });

  it('finishes the real delayed AI SAN inspection through death and unowned god discard', () => {
    const { gs, god } = encounter();
    const initial = startNextTurn(gs, { isAiControlled: idx => idx === 1 });
    expect(initial.phase).toBe('AI_GOD_CHOICE');
    expect(initial.players[1]).toMatchObject({ hp: 2, san: 6, isDead: false });
    const transition = resolveAiGodChoiceTransition(initial);
    expect(transition.state.players[1]).toMatchObject({ hp: 0, san: 6, isDead: true, godZone: [] });
    expect(transition.state.gameOver).toMatchObject({ winner: '寻宝者', winnerIdx: 0 });
    expect(transition.state.discard.filter(card=>card.id===god.id)).toHaveLength(1);
    const queue = compileFreshVisualEventQueue(initial, transition.state);
    const prepared = prepareAnimationTransaction({ queue, previousState: initial, nextState: transition.state,
      transactionMeta: { authority: 'queue', preserveQueueOrder: true } });
    expect(prepared.queue.filter(step=>step.type==='DEATH')).toHaveLength(1);
    expect(prepared.queue.filter(step=>step.type==='DISCARD'&&step.card?.id===god.id)).toHaveLength(1);
  });

  it.each([0, 1])('ends the match for the surviving treasure from drawer seat %i', drawerIdx => {
    const { gs, god } = encounter({ drawerIdx });
    const result = startNextTurn(gs);
    expect(result.players[drawerIdx]).toMatchObject({ isDead: true, hp: 0, san: 6 });
    expect(result.gameOver).toMatchObject({ winner: '寻宝者', winnerIdx: 1 - drawerIdx });
    expect(['GOD_CHOICE', 'AI_GOD_CHOICE']).not.toContain(result.phase);
    expect(result.abilityData.godCard).toBeUndefined();
    expect(result.discard.filter(card => card.id === god.id)).toHaveLength(1);
  });

  it.each([0, 1])('continues to the next living human after drawer seat %i dies', drawerIdx => {
    const safe = makeZoneCard('B1', 0, { id: 'next-living-draw' });
    const { gs, god } = encounter({ drawerIdx, count: 3, extraDeck: [safe] });
    const result = startNextTurn(gs);
    expect(result.gameOver).toBeNull();
    expect(result.players[drawerIdx].isDead).toBe(true);
    expect(result.currentTurn).toBe((drawerIdx + 1) % 3);
    expect(result.players[result.currentTurn].isDead).toBe(false);
    expect(result.discard.filter(card => card.id === god.id)).toHaveLength(1);
    expect(result.drawReveal?.card).toEqual(safe);
  });

  it.each([
    { label: 'out-of-turn Vritra survives', currentTurn: 0, extraGod: false, dead: false },
    { label: 'out-of-turn Vritra fails', currentTurn: 0, extraGod: true, dead: true },
    { label: 'own-turn Vritra cannot revive', currentTurn: 1, extraGod: false, dead: true },
  ])('$label', ({ currentTurn, extraGod, dead }) => {
    const vri = makeGodCard('VRI', { id: 'old-vri' });
    const extraDeck = [makeZoneCard('B1'), extraGod ? makeGodCard('NYA') : makeZoneCard('B2')];
    const { gs, god } = encounter({ count: 3, drawer: { godName: 'VRI', godLevel: 3, godZone: [vri] }, extraDeck });
    const result = playerDrawCard(gs.players, gs.deck, [], 1, { ...gs, currentTurn });
    expect(result.P[1].isDead).toBe(dead);
    expect(result.needGodChoice === true).toBe(!dead);
    expect(result.Disc.filter(card => card.id === god.id)).toHaveLength(dead ? 1 : 0);
    if (!dead) expect(result.P[1].hp).toBe(1);
  });

  it('cannot restore a queued god decision after its real drawer has died', () => {
    const { gs, god } = encounter({ count: 3 });
    const result = playerDrawCard(gs.players, gs.deck, [], 1, { ...gs, currentTurn: 1 });
    const pending = { godCard: god, drawerIdx: 1, godEncounterCost: 0 };
    const restored = buildTargetContinuationState({
      baseState: { ...gs, players: result.P, deck: result.D, discard: result.Disc,
        ...result.statePatch, currentTurn: 1,
        _decisionContinuations: [{ phase: 'GOD_CHOICE', abilityData: pending }],
        abilityData: { pendingGodChoice: pending } },
    });
    expect(['GOD_CHOICE', 'AI_GOD_CHOICE']).not.toContain(restored.phase);
    expect(restored.abilityData.godCard).toBeUndefined();
    expect(restored.abilityData.pendingGodChoice).toBeUndefined();
    expect(restored._decisionContinuations).toEqual([]);
    expect(restored.discard.filter(card => card.id === god.id)).toHaveLength(1);
  });

  it('preserves the explicit all-player-loss outcome in the terminal packet', () => {
    expect(getMultiplayerWinnerRole({ winner: 'LOSE_ALL' })).toBe('LOSE_ALL');
    expect(getMultiplayerWinnerRole({ winner: 'unknown' })).toBeNull();
  });

  it('cancels only the dead drawer frame and preserves an independent living drawer response', () => {
    const { state, deadGod, liveGod, deadChoice, liveChoice } = independentGodChoices();
    const result = buildTargetContinuationState({ baseState: {
      ...state, abilityData: { pendingGodChoice: deadChoice },
    }, clearTurnAnim: false });
    expect(result.phase).toBe('GOD_CHOICE');
    expect(result.abilityData).toEqual(liveChoice);
    expect(result._decisionContinuations).toEqual([]);
    expect(resolveTargetContinuation(result).route).toBe('DECISION');
    expect(result.discard.filter(card => card.id === deadGod.id)).toHaveLength(1);
    expect(result.discard.some(card => card.id === liveGod.id)).toBe(false);
    expect(result.players).toEqual(state.players);
    expect(result.deck).toEqual(state.deck);
    expect(result.log).toEqual(state.log);
  });

  it.each([
    { label: 'multiplayer living human', isMP: true, deadDrawerIdx: 0, liveDrawerIdx: 1, phase: 'GOD_CHOICE' },
    { label: 'single-player living human after dead AI', isMP: false, deadDrawerIdx: 2, liveDrawerIdx: 0, phase: 'GOD_CHOICE' },
    { label: 'single-player living AI after dead human', isMP: false, deadDrawerIdx: 0, liveDrawerIdx: 1, phase: 'AI_GOD_CHOICE' },
  ])('restores $label independent response without choosing faith', fixture => {
    const { state, deadGod, liveGod, deadChoice, liveChoice } = independentGodChoices(fixture);
    const pending = { ...state, phase: 'GOD_CHOICE', abilityData: deadChoice };
    const result = recoverDeadGodChoiceState(pending);
    expect(result.phase).toBe(fixture.phase);
    expect(result.abilityData).toEqual(fixture.phase === 'AI_GOD_CHOICE'
      ? { ...liveChoice, playerIndex: fixture.liveDrawerIdx } : liveChoice);
    expect(result._decisionContinuations).toEqual([]);
    // Living AI choices use App's existing AI_GOD_CHOICE effect rather than
    // holding a human interaction. Both routes retain the choice unchanged.
    expect(resolveTargetContinuation(result).route).toBe(fixture.phase === 'AI_GOD_CHOICE'
      ? 'APPLY_STATE' : 'DECISION');
    expect(result.discard.filter(card => card.id === deadGod.id)).toHaveLength(1);
    expect(result.discard.some(card => card.id === liveGod.id)).toBe(false);
    expect(result.players).toEqual(state.players);
    expect(result.deck).toEqual(state.deck);
    expect(result.turn).toBe(state.turn);
    expect(result.log).toEqual(state.log);
    const notJudgedDead = { ...pending, players: pending.players.map((player, i) =>
      i === fixture.deadDrawerIdx ? { ...player, isDead: false } : player) };
    expect(recoverDeadGodChoiceState(notJudgedDead)).toBe(notJudgedDead);
  });
});
