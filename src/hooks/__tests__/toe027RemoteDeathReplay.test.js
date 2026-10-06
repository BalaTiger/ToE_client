import { describe, expect, it, vi } from 'vitest';
import { useAnimationQueue } from '../useAnimationQueue';
import { prepareAnimQueueLogs } from '../../game/animLogs';
import { prepareAnimationTransaction } from '../../game/animationTransaction';
import { copyPlayers } from '../../game/coreUtils';
import { startNextTurn } from '../../game/turnEngine';
import { rotateGsForViewer } from '../../game/rotateState';
import { createAnimTransactionEvent } from '../../game/visualEvents';
import { compileRuleVisualEventsToAnimTransaction } from '../../game/visualEventTransactionCompiler';
import { processIncomingMultiplayerStateSync } from '../../multiplayer/multiplayerRemoteReplayExecutor';
import { makeBlankZoneCard, makeGodCard, makeGs, makePlayer, makeZoneCard } from '../../game/__tests__/factory';

// Drive the production queue's public commit controls, not a second playback
// implementation. Effects/timers are not needed to finish an owned transaction.
vi.mock('react', () => ({
  useRef: value => ({ current: value }),
  useState: value => [value, vi.fn()],
  useEffect: vi.fn(),
  useCallback: fn => fn,
}));

function fatalEncounter(playerCount = 2) {
  const god = makeGodCard('VRI', { id: '027-drawn-vri' });
  const players = [
    makePlayer({ id: 'survivor-b', name: 'P3-B', role: '寻宝者', hp: 7, san: 9,
      hand: [makeZoneCard('A1', 0, { id: 'b-kept-a1' })] }),
    makePlayer({ id: 'drawer-a', name: 'P3-A', role: '追猎者', hp: 2, san: 8,
      godEncounters: 1, hand: [makeZoneCard('C4', 0, { id: 'a-lost-c4' })] }),
  ];
  if (playerCount === 3) players.push(makePlayer({ id: 'observer-c', name: 'P3-C', role: '邪祀者' }));
  const before = makeGs({
    _isMP: true, currentTurn: 0, turn: 12, _turnKey: 12,
    players, deck: [god, makeBlankZoneCard({ id: 'next-survivor-draw' })],
    discard: [], log: ['上一回合已完成'], _visualEvents: [],
    inspectionDeck: [{ id: '027-self-harm', name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' }],
    inspectionDiscard: [],
  });
  const inputBytes = JSON.stringify(before);
  const next = startNextTurn(before);
  expect(JSON.stringify(before)).toBe(inputBytes);
  expect(next.players[1]).toMatchObject({ hp: 0, san: 6, isDead: true });
  expect(next.log.some(line => line.includes('自残，失去 2 HP'))).toBe(true);
  return { before, next, god };
}

function packetFor(fixture, exact) {
  if (!exact) return JSON.parse(JSON.stringify(fixture.next));
  const transaction = compileRuleVisualEventsToAnimTransaction(fixture.next, fixture.before);
  expect(transaction.queue.length).toBeGreaterThan(0);
  const exactEvent = createAnimTransactionEvent({
    actorIdx: fixture.before.currentTurn, actorName: fixture.before.players[0].name,
    queue: transaction.queue, beforePlayers: fixture.before.players,
    beforeDiscard: fixture.before.discard, coveredEventIds: transaction.eventIds,
    context: 'turnStart', msgs: fixture.next.log.slice(fixture.before.log.length),
  });
  return JSON.parse(JSON.stringify({
    ...fixture.next, _visualEvents: [...fixture.next._visualEvents, exactEvent],
  }));
}

function playback(initial, viewer) {
  let current = initial;
  let stats = initial.players.map(player => ({ hp: player.hp, san: player.san }));
  const latestGsRef = { current: initial };
  const setGs = vi.fn(value => {
    current = typeof value === 'function' ? value(current) : value;
    latestGsRef.current = current;
  });
  const setDisplayStats = vi.fn(value => { stats = typeof value === 'function' ? value(stats) : value; });
  const consumedVisualEventIdsRef = { current: new Set() };
  const receivedGsRef = { current: false };
  const suppressNextBroadcastRef = { current: false };
  const visualStateLocks = { lock: vi.fn(), clear: vi.fn() };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Mocked hooks expose the real queue's public controls for runtime regression.
  const hook = useAnimationQueue({
    gs: initial, copyPlayers, setGs, setDisplayStats,
    setVisualPlayersOverride: vi.fn(), setVisualDiscard: vi.fn(),
    restoreVisibleLog: vi.fn(), appendVisibleLog: vi.fn(),
    getVisualDiscardForState: state => state?.discard || [],
    resolveTurnHighlightForStep: () => null, prepareAnimQueueLogs,
    visibleLogRef: { current: [...initial.log] },
    visibleLogEntryIdsRef: { current: new Set() },
    visualStateLocks, suppressNextBroadcastRef, receivedGsRef,
    consumedVisualEventIdsRef, ANIM_DURATION: {}, ANIM_SPEED_SCALE: 1,
  });
  const prepared = [];
  const triggerAnimQueue = (queue, nextState, callback, transactionMeta) => {
    const transaction = prepareAnimationTransaction({
      queue, previousState: current, nextState, callback, transactionMeta,
      consumedEventIds: consumedVisualEventIdsRef.current,
    });
    prepared.push(transaction);
    hook.playAnimationTransaction(transaction);
  };
  const context = {
    ...hook, setGs, latestGsRef, receivedGsRef, suppressNextBroadcastRef,
    consumedVisualEventIdsRef, visualStateLocks, triggerAnimQueue,
    myPlayerIndexRef: { current: viewer }, mpRoleRevealedRef: { current: true },
    mpOpeningRoleRevealPendingRef: { current: false },
    pendingMpRawQueueRef: { current: [] }, pendingMpLatestStateRawRef: { current: null },
    restoreVisibleLog: vi.fn(), setRoleRevealAnim: vi.fn(),
    markInspectionEventsSeen: vi.fn(), clearDamageAnimations: vi.fn(),
  };
  return {
    ...hook, context, prepared, setGs,
    get state() { return current; }, get stats() { return stats; },
    drain() {
      let advances = 0;
      while (hook.pendingGsRef.current || hook.animQueueRef.current.length) {
        if (++advances > 120) throw new Error('Fatal encounter queue failed to commit');
        hook.advanceQueue();
      }
    },
  };
}

function sharedPlayers(state) {
  return Object.fromEntries(state.players.map(player => [player.id, {
    hp: player.hp, san: player.san, isDead: !!player.isDead,
    hand: player.hand.map(card => card.id),
  }]));
}
const replayCases = [2, 3].flatMap(count => Array.from({ length: count }, (_, viewer) => viewer)
  .flatMap(viewer => [false, true].map(exact => ({ count, viewer, exact }))));

describe('TOE027 real fatal god encounter replay and commit', () => {
  it.each(replayCases)('commits death and SAN for $count seats, viewer $viewer, exact=$exact', ({ count, viewer, exact }) => {
    const fixture = fatalEncounter(count);
    const raw = packetFor(fixture, exact);
    const rawBytes = JSON.stringify(raw);
    const p = playback(rotateGsForViewer(fixture.before, viewer), viewer);
    expect(processIncomingMultiplayerStateSync({
      rawState: raw, currentState: p.state, roleRevealAnim: null,
      anim: null, animExiting: false, context: p.context,
    })).toBe('applied');
    expect(p.prepared).toHaveLength(1);
    const queue = p.prepared[0].queue;
    const drawnGod = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === fixture.god.id);
    const san = queue.findIndex(step => step.type === 'SAN_DAMAGE');
    const inspection = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === '027-self-harm');
    const hp = queue.findIndex(step => step.type === 'HP_DAMAGE');
    expect(drawnGod, JSON.stringify(queue.map(step => ({ type: step.type, cardId: step.card?.id, targetPid: step.targetPid })))).toBeGreaterThanOrEqual(0);
    expect(san).toBeGreaterThan(drawnGod);
    expect(inspection).toBeGreaterThan(san);
    expect(hp).toBeGreaterThan(inspection);
    expect(p.context.consumedVisualEventIdsRef.current.size).toBe(0);
    p.drain();
    expect(sharedPlayers(p.state)).toEqual(sharedPlayers(fixture.next));
    expect(p.state.turn).toBe(fixture.next.turn);
    expect(p.state._turnKey).toBe(fixture.next._turnKey);
    expect(p.state.phase).toBe(fixture.next.phase);
    expect(p.state.currentTurn).toBe(rotateGsForViewer(fixture.next, viewer).currentTurn);
    const deadLocalIndex = p.state.players.findIndex(player => player.id === 'drawer-a');
    expect(p.stats[deadLocalIndex]).toEqual({ hp: 0, san: 6 });
    expect(p.state.discard.map(card => card.id)).toEqual(fixture.next.discard.map(card => card.id));
    expect(p.pendingGsRef.current).toBeNull();
    expect(p.context.consumedVisualEventIdsRef.current.size).toBeGreaterThan(0);
    expect(JSON.stringify(raw)).toBe(rawBytes);
  });

  it.each([2, 3])('leaves no pending god gift owned by the dead drawer with %s players', count => {
    const { next, god } = fatalEncounter(count);
    expect(next.discard.map(card => card.id)).toContain(god.id);
    expect(next.players.every(player => player.hand.every(card => card.id !== god.id))).toBe(true);
    expect(next.phase).not.toBe('GOD_CHOICE');
    expect(next.abilityData?.pendingGodChoice).toBeFalsy();
    if (count === 2) expect(next.gameOver).toMatchObject({ winner: '寻宝者', winnerIdx: 0 });
    else {
      expect(next.gameOver).toBeFalsy();
      expect(next.players[next.currentTurn].isDead).toBe(false);
      expect(next.players[next.currentTurn].id).toBe('observer-c');
    }
  });

  it('cancels an unfinished fatal replay before a new match is installed', () => {
    const fixture = fatalEncounter(3);
    const p = playback(rotateGsForViewer(fixture.before, 1), 1);
    processIncomingMultiplayerStateSync({
      rawState: packetFor(fixture, true), currentState: p.state,
      roleRevealAnim: null, anim: null, animExiting: false, context: p.context,
    });
    const lateAdvance = p.advanceQueue;
    p.resetAnimationQueue();
    const newMatch = makeGs({ players: [makePlayer({ id: 'drawer-a', hp: 10, san: 10 })],
      log: ['另一对局'], matchMarker: 'after-cancel', _visualEvents: [] });
    p.setGs(newMatch);
    lateAdvance();
    lateAdvance();
    expect(p.state).toBe(newMatch);
    expect(p.pendingGsRef.current).toBeNull();
    expect(p.animCallbackRef.current).toBeNull();
    expect(p.context.consumedVisualEventIdsRef.current.size).toBe(0);
  });
});
