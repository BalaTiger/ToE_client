import { describe, expect, it, vi } from 'vitest';
import { useAnimationQueue } from '../useAnimationQueue';
import { prepareAnimQueueLogs } from '../../game/animLogs';
import { prepareAnimationTransaction } from '../../game/animationTransaction';
import { copyPlayers } from '../../game/coreUtils';
import { submitLossEvents } from '../../game/effectEngine';
import { buildHuntStageVisualTransaction } from '../../game/identitySkillVisualTransaction';
import { createAnimTransactionEvent, createHuntResultEvent } from '../../game/visualEvents';
import { derotateGs, rotateGsForViewer } from '../../game/rotateState';
import { processIncomingMultiplayerStateSync } from '../../multiplayer/multiplayerRemoteReplayExecutor';
import { makeGs, makePlayer, makeZoneCard } from '../../game/__tests__/factory';

// Exercise the real queue controls, including STATE_PATCH and final functional
// updaters. Timers are not needed to advance a transaction's commit boundary.
vi.mock('react', () => ({
  useRef: value => ({ current: value }),
  useState: value => [value, vi.fn()],
  useEffect: vi.fn(),
  useCallback: fn => fn,
}));

function lethalHunt({ exact = true } = {}) {
  const cost = makeZoneCard('D1');
  const kept = makeZoneCard('B2');
  const loot = [makeZoneCard('C1'), makeZoneCard('C4'), makeZoneCard('A4')];
  const beforePlayers = [
    makePlayer({ id: 'hunter', name: 'END-B', role: '追猎者', hand: [cost, kept] }),
    makePlayer({ id: 'victim', name: '莉莉', hp: 1, san: 9, hand: loot }),
  ];
  const before = makeGs({
    _isMP: true, _turnKey: 2, players: beforePlayers,
    phase: 'HUNT_CONFIRM', currentTurn: 0,
    abilityData: { huntTi: 1, revCard: loot[0] },
    log: ['旧回合日志'], _visualEvents: [],
  });
  const afterDiscardPlayers = copyPlayers(beforePlayers);
  afterDiscardPlayers[0].hand = [kept];
  const damagePlayers = copyPlayers(afterDiscardPlayers);
  const log = [...before.log, '弃 [D1] 活死人哨兵 → 莉莉 受 3HP 伤害'];
  const loss = submitLossEvents({
    players: damagePlayers, deck: [], discard: [cost], log,
    currentTurn: 0,
    events: [{ targetIdx: 1, lostHp: 3, source: '追捕', order: 0 }],
    statEventLogs: log.slice(before.log.length),
    statEventSeq: 1, statEventIdPrefix: 'p2-terminal-hunt',
    defeatSettlementOwner: 'huntResult',
  });
  // The hunter owns defeat/loot settlement after the original loss events.
  // Keep different hands before discard, after damage, and after final loot so
  // a presentation snapshot cannot accidentally satisfy the final assertions.
  const afterPlayers = copyPlayers(damagePlayers);
  afterPlayers[0].hand = [kept, ...loot];
  afterPlayers[1].hand = [];
  const finalLog = [...log, 'END-B 从 莉莉 的手牌中暗抽了三张牌', '追猎者获胜'];
  const event = createHuntResultEvent({
    hunterIdx: 0, targetIdx: 1, revealedCard: loot[0], discardedCard: cost,
    beforePlayers, afterDiscardPlayers, afterDiscardDiscard: [cost],
    afterDamagePlayers: copyPlayers(damagePlayers), afterDamageDiscard: [cost],
    afterDamageLog: [...log], afterPlayers, afterResultDiscard: [cost],
    statEvents: loss.statEvents, lootTransferCount: 3,
    beforeLog: before.log, afterLog: finalLog, msgs: finalLog.slice(before.log.length),
    resolutionPatch: { phase: 'ACTION', abilityData: {} },
  });
  const staged = buildHuntStageVisualTransaction({
    previousState: before,
    state: { ...before, players: afterPlayers, discard: [cost], log: finalLog,
      phase: 'ACTION', abilityData: {},
      gameOver: { winner: '追猎者', reason: '所有非追猎者已覆灭' } },
    events: [event], attemptId: 'p2-lethal-hunt', stage: 'result', barrier: 'continuation',
  });
  const transactionEvent = createAnimTransactionEvent({
    actorIdx: 0, actorName: 'END-B', queue: staged.queue,
    beforePlayers, beforeDiscard: [], context: 'huntResult',
    coveredEventIds: [event.id], msgs: finalLog.slice(before.log.length),
  });
  const published = exact
    ? { ...staged.state, _visualEvents: [...staged.state._visualEvents, transactionEvent] }
    : staged.state;
  return { before, next: staged.state, queue: staged.queue,
    rawBefore: derotateGs(before, 1), rawTerminal: derotateGs(published, 1) };
}

function playback(initial) {
  let current = initial;
  let stats = initial.players.map(player => ({ hp: player.hp, san: player.san }));
  const latestGsRef = { current: initial };
  const setGs = vi.fn(value => {
    current = typeof value === 'function' ? value(current) : value;
    latestGsRef.current = current;
  });
  const setDisplayStats = vi.fn(value => {
    stats = typeof value === 'function' ? value(stats) : value;
  });
  const consumedVisualEventIdsRef = { current: new Set() };
  const receivedGsRef = { current: false };
  const suppressNextBroadcastRef = { current: false };
  const visualStateLocks = { lock: vi.fn(), clear: vi.fn() };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Public controls are driven with the mocked hooks above.
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
    myPlayerIndexRef: { current: 0 }, mpRoleRevealedRef: { current: true },
    mpOpeningRoleRevealPendingRef: { current: false },
    pendingMpRawQueueRef: { current: [] }, pendingMpLatestStateRawRef: { current: null },
    restoreVisibleLog: vi.fn(), setRoleRevealAnim: vi.fn(),
    markInspectionEventsSeen: vi.fn(), clearDamageAnimations: vi.fn(),
  };
  return {
    ...hook, context, prepared, triggerAnimQueue, setGs,
    get state() { return current; }, get stats() { return stats; },
    drain() {
      let advances = 0;
      while (hook.pendingGsRef.current || hook.animQueueRef.current.length) {
        if (++advances > 30) throw new Error('Queue failed to settle');
        hook.advanceQueue();
      }
    },
  };
}

function normalizedPlayers(state) {
  return Object.fromEntries(state.players.map(player => [player.id, {
    hp: player.hp, san: player.san, isDead: !!player.isDead,
    hand: player.hand.map(card => card.id),
  }]));
}

describe('TOE019 terminal remote playback commit', () => {
  it.each([true, false])('commits HP/death/loot after remote lethal playback (exact=%s)', exact => {
    const fixture = lethalHunt({ exact });
    const p = playback(rotateGsForViewer(fixture.rawBefore, 0));
    expect(processIncomingMultiplayerStateSync({
      rawState: fixture.rawTerminal, currentState: p.state,
      roleRevealAnim: null, anim: null, animExiting: false, context: p.context,
    })).toBe('applied');
    const terminalVisibleBeforeCommit = !!p.state.gameOver;
    expect(p.pendingGsRef.current.gameOver.winner).toBe('追猎者');
    // Terminal truncation is retained: the final hand/STATE_PATCH animation
    // must not be required to reconcile the authoritative terminal snapshot.
    expect(p.prepared.at(-1).queue.at(-1).type).toBe('HP_DAMAGE');
    expect(p.context.consumedVisualEventIdsRef.current.size).toBe(0);
    p.drain();
    expect(normalizedPlayers(p.state)).toEqual(normalizedPlayers(fixture.next));
    expect(p.stats[0]).toEqual({ hp: 0, san: 9 });
    expect(p.state.gameOver.winner).toBe('追猎者');
    expect(p.state.discard.map(card => card.id)).toEqual(fixture.next.discard.map(card => card.id));
    expect(p.pendingGsRef.current).toBeNull();
    // The broadcast effect keys off gs.gameOver. A presentation baseline must
    // not close the server match before this terminal transaction commits.
    expect(terminalVisibleBeforeCommit).toBe(false);
    expect(processIncomingMultiplayerStateSync({
      rawState: fixture.rawBefore, currentState: p.state,
      roleRevealAnim: null, anim: null, animExiting: false, context: p.context,
    })).toBe('ignored');
    expect(normalizedPlayers(p.state)).toEqual(normalizedPlayers(fixture.next));
  });

  it('still commits the local hunter terminal snapshot with final loot', () => {
    const fixture = lethalHunt();
    const p = playback(fixture.before);
    p.triggerAnimQueue(fixture.queue, fixture.next, undefined, {
      authority: 'queue', preserveQueueOrder: true,
    });
    p.drain();
    expect(normalizedPlayers(p.state)).toEqual(normalizedPlayers(fixture.next));
    expect(p.state.players[1]).toMatchObject({ hp: 0, isDead: true, hand: [] });
    expect(p.state.players[0].hand).toHaveLength(4);
    expect(p.stats[1]).toEqual({ hp: 0, san: 9 });
  });

  it('reset invalidates old terminal pending state before a new match is installed', () => {
    const fixture = lethalHunt();
    const p = playback(rotateGsForViewer(fixture.rawBefore, 0));
    processIncomingMultiplayerStateSync({
      rawState: fixture.rawTerminal, currentState: p.state,
      roleRevealAnim: null, anim: null, animExiting: false, context: p.context,
    });
    const lateCompletion = p.advanceQueue;
    p.resetAnimationQueue();
    const restarted = makeGs({
      matchMarker: 'second-game', players: [makePlayer({ id: 'victim', hp: 10,
        hand: [makeZoneCard('B4')] }), makePlayer({ id: 'hunter' })],
      log: ['新对局开始'], _visualEvents: [],
    });
    p.setGs(restarted);
    lateCompletion();
    lateCompletion();
    expect(p.state).toBe(restarted);
    expect(p.pendingGsRef.current).toBeNull();
    expect(p.animCallbackRef.current).toBeNull();
    expect(p.context.consumedVisualEventIdsRef.current.size).toBe(0);
    expect(p.state.players[0]).toMatchObject({ hp: 10, isDead: false });
    expect(p.state.players[0].hand).toEqual(restarted.players[0].hand);
  });
});
