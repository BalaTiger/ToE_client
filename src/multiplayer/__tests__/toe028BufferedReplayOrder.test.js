import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { useAnimationQueue } from '../../hooks/useAnimationQueue';
import { prepareAnimQueueLogs } from '../../game/animLogs';
import { prepareAnimationTransaction } from '../../game/animationTransaction';
import { copyPlayers, ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../../game/coreUtils';
import { rotateGsForViewer } from '../../game/rotateState';
import { createAnimTransactionEvent, createHuntTargetEvent, createLogOnlyVisualEvent } from '../../game/visualEvents';
import { buildHuntStageVisualTransaction } from '../../game/identitySkillVisualTransaction';
import { processIncomingMultiplayerStateSync } from '../multiplayerRemoteReplayExecutor';
import { registerMultiplayerSocketHandlers } from '../registerMultiplayerSocketHandlers';
import { makeGs, makePlayer, makeZoneCard } from '../../game/__tests__/factory';

// Only React scheduling is synchronous; execute the real planner, queue runtime
// and App flush effect, rather than a model of the production cache behavior.
vi.mock('react', () => ({ useRef: value => ({ current: value }),
  useState: value => [value, vi.fn()], useEffect: vi.fn(), useCallback: fn => fn }));
const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const start = appSource.indexOf('  useEffect(()=>{\n    if(gameOverPresentationFrozenRef.current||!isMultiplayerRef.current){');
const ending = '  },[roleRevealAnim,anim,animExiting,gs?.phase,gs?._turnKey,gs?.log?.length]);';
const end = appSource.indexOf(ending, start);
if (start < 0 || end < 0) throw new Error('Actual App flush effect not found');
const actualFlush = appSource.slice(start, end + ending.length);
const clone = value => JSON.parse(JSON.stringify(value));

function packets() {
  const before = makeGs({ _isMP: true, currentTurn: 2, turn: 3, _turnKey: 3,
    players: ['A', 'B', 'C'].map((name, idx) => makePlayer({ id: `toe028-${name}`, name: `M28-${name}`,
      role: [ROLE_TREASURE, ROLE_CULTIST, ROLE_HUNTER][idx], hand: [makeZoneCard('A1'), makeZoneCard('B2')] })),
    _visualEvents: [], log: ['M28-C 收入手牌'],
  });
  const selected = { ...before, phase: 'HUNT_SELECT_TARGET', abilityData: {}, _visualEvents: [] };
  const attemptId = 'hunt:3:2:0:1';
  const waitMsg = 'M28-C（追猎者）追捕 M28-A，等待对方亮出一张手牌。';
  const target = createHuntTargetEvent({ sourceIdx: 2, targetIdx: 0, attemptId, msgs: [waitMsg],
    beforePlayers: before.players, afterPlayers: before.players });
  const stage = buildHuntStageVisualTransaction({ previousState: selected,
    state: { ...selected, phase: 'HUNT_WAIT_REVEAL', abilityData: { huntTi: 0, huntPromptId: attemptId },
      log: [...before.log, waitMsg] }, events: [target], attemptId, stage: 'target', barrier: 'decision' });
  const exact = createAnimTransactionEvent({ actorIdx: 2, actorName: 'M28-C', queue: stage.queue,
    coveredEventIds: stage.state._visualEvents.map(event => event.id), context: 'huntTarget',
    barrier: 'decision', beforePlayers: before.players, beforeDiscard: [], msgs: [waitMsg] });
  const waiting = { ...stage.state, _visualEvents: [exact, ...stage.state._visualEvents] };
  const confirm = { ...waiting, phase: 'HUNT_CONFIRM', _visualEvents: [],
    abilityData: { ...waiting.abilityData, revCard: before.players[0].hand[0] },
    log: [...waiting.log, 'M28-A 亮出了手牌，等待 M28-C 确认。'] };
  return { before, selected, waiting, confirm };
}

function playback(initial, viewer) {
  let current = initial;
  const latestGsRef = { current };
  const setGs = vi.fn(value => { current = typeof value === 'function' ? value(current) : value; latestGsRef.current = current; });
  const consumedVisualEventIdsRef = { current: new Set() };
  const receivedGsRef = { current: false }, suppressNextBroadcastRef = { current: false };
  const visualStateLocks = { lock: vi.fn(), clear: vi.fn() };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Exercise the actual hook under the synchronous React fixture above.
  const hook = useAnimationQueue({ gs: initial, copyPlayers, setGs, setDisplayStats: vi.fn(),
    setVisualPlayersOverride: vi.fn(), setVisualDiscard: vi.fn(), restoreVisibleLog: vi.fn(), appendVisibleLog: vi.fn(),
    getVisualDiscardForState: state => state?.discard || [], resolveTurnHighlightForStep: () => null,
    prepareAnimQueueLogs, visibleLogRef: { current: [] }, visibleLogEntryIdsRef: { current: new Set() },
    visualStateLocks, suppressNextBroadcastRef, receivedGsRef, consumedVisualEventIdsRef,
    ANIM_DURATION: {}, ANIM_SPEED_SCALE: 1 });
  const context = { ...hook, setGs, latestGsRef, receivedGsRef, suppressNextBroadcastRef,
    consumedVisualEventIdsRef, visualStateLocks, myPlayerIndexRef: { current: viewer },
    mpRoleRevealedRef: { current: true }, mpOpeningRoleRevealPendingRef: { current: false },
    pendingMpRawQueueRef: { current: [] }, pendingMpLatestStateRawRef: { current: null },
    recentMpAnimatedRawSignaturesRef: { current: [] },
    gameOverPresentationFrozenRef: { current: false }, isMultiplayerRef: { current: true },
    restoreVisibleLog: vi.fn(), setRoleRevealAnim: vi.fn(), markInspectionEventsSeen: vi.fn(), clearDamageAnimations: vi.fn(),
    triggerAnimQueue(queue, nextState, callback, transactionMeta) {
      hook.playAnimationTransaction(prepareAnimationTransaction({ queue, previousState: current, nextState,
        callback, transactionMeta, consumedEventIds: consumedVisualEventIdsRef.current }));
    } };
  const processIncomingMpStateSync = (rawState, options = {}) => processIncomingMultiplayerStateSync({ rawState,
    currentState: current, roleRevealAnim: null, anim: null, animExiting: false, context, ...options });
  return { context, get state() { return current; },
    buffer(rawState, busy = { anim: { type: 'CARD_TRANSFER' } }) {
      return processIncomingMultiplayerStateSync({ rawState, currentState: current,
        roleRevealAnim: null, anim: null, animExiting: false, context, ...busy });
    },
    receive: processIncomingMpStateSync,
    flush() { let effect; runInNewContext(actualFlush, { ...context, gs: current, roleRevealAnim: null,
      anim: null, animExiting: false, processIncomingMpStateSync, useEffect: cb => { effect = cb; } }); effect(); },
    drain() { let n = 0; while (hook.pendingGsRef.current || hook.animQueueRef.current.length) {
      if (++n > 60) throw new Error('Queue failed to settle'); hook.advanceQueue(); } },
    restore(rawState, event = 'matchRestored') {
      const handlers = new Map();
      const socket = { on: (event, callback) => handlers.set(event, callback), emit: vi.fn() };
      const registration = { ...context, socket, socketRef: { current: socket },
        playerUUIDRef: { current: rawState.players[viewer].id }, identityTokenRef: { current: null },
        leavingRoomRef: { current: false }, mpAiTakeoverSeqRef: { current: 0 },
        pendingMpAiTakeoverRef: { current: null }, gameEndSentRef: { current: false }, processIncomingMpStateSync };
      for (const name of ['setRoomModal', 'setFirstBattleStarted', 'setOnlineOptionsModal', 'setMultiLoading',
        'setMyPlayerIndex', 'setIsMultiplayer', 'setIsDisconnected', 'addToast']) registration[name] = vi.fn();
      registerMultiplayerSocketHandlers(registration);
      handlers.get(event)({ roomId: 'LOCAL-028', owner: rawState.players[0].id,
        players: rawState.players.map(player => ({ uuid: player.id, username: player.name })),
        playerIndex: viewer, gs: rawState });
    },
  };
}

describe('TOE028 real remote replay and App buffered flush ordering', () => {
  it.each([0, 1, 2])('never restores older select-target after the newer hunt replay, viewer %s', viewer => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, viewer), viewer);
    expect(p.buffer(f.selected)).toBe('buffered');
    expect(p.buffer(f.waiting)).toBe('buffered');
    p.flush(); p.drain(); p.flush();
    expect(p.state.phase).toBe('HUNT_WAIT_REVEAL');
    expect(p.state.abilityData.huntTi).toBe((3 - viewer) % 3);
    expect(p.state.players.map(player => player.id)).toEqual(rotateGsForViewer(f.waiting, viewer).players.map(player => player.id));
    expect(p.context.pendingMpRawQueueRef.current).toEqual([]);
    expect(p.context.pendingMpLatestStateRawRef.current).toBeNull();
  });

  it.each([0, 1, 2])('preserves a newer plain confirmation after an animated wait, viewer %s', viewer => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, viewer), viewer);
    p.buffer(f.waiting); p.buffer(f.confirm);
    p.flush(); p.drain(); p.flush(); p.drain();
    expect(p.state.phase).toBe('HUNT_CONFIRM');
    expect(p.state.abilityData.revCard.id).toBe(f.confirm.abilityData.revCard.id);
  });

  it.each(['queued', 'active', 'consumed'])('an exact %s duplicate cannot displace a newer plain decision or stall its flush', timing => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.buffer(f.waiting);
    if (timing !== 'queued') p.flush();
    if (timing === 'consumed') p.drain();
    p.buffer(f.confirm);
    expect(p.buffer(clone(f.waiting))).toBe('ignored');
    expect(p.context.pendingMpLatestStateRawRef.current).toBe(f.confirm);
    expect(p.context.pendingMpRawQueueRef.current).toHaveLength(timing === 'queued' ? 1 : 0);
    if (timing === 'queued') p.flush();
    p.drain(); p.flush(); p.drain();
    expect(p.state.phase).toBe('HUNT_CONFIRM');
  });

  it('recognizes a JSON-equivalent duplicate with reordered object keys', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 1), 1);
    p.buffer(f.waiting); p.buffer(f.confirm);
    const reordered = Object.fromEntries(Object.entries(clone(f.waiting)).reverse());
    expect(p.buffer(reordered)).toBe('ignored');
    p.flush(); p.drain(); p.flush(); p.drain();
    expect(p.state.phase).toBe('HUNT_CONFIRM');
  });

  it('rejects an already consumed animated duplicate after the decision has progressed', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 1), 1);
    p.receive(f.waiting); p.drain();
    p.receive(f.confirm); p.drain();
    expect(p.state.phase).toBe('HUNT_CONFIRM');
    p.buffer(f.selected);
    expect(p.receive(clone(f.waiting))).toBe('ignored');
    expect(p.context.pendingMpLatestStateRawRef.current).toBe(f.selected);
    p.flush();
    expect(p.state.phase).toBe('HUNT_SELECT_TARGET');
  });

  it('keeps new inbound plain decisions behind an idle but undrained animated FIFO', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.buffer(f.waiting);
    expect(p.context.pendingGsRef.current).toBeNull();
    expect(p.context.animQueueRef.current).toEqual([]);
    expect(p.receive(f.confirm)).toBe('buffered');
    expect(p.state.phase).toBe('ACTION');
    p.flush(); p.drain();
    expect(p.state.phase).toBe('HUNT_WAIT_REVEAL');
    p.flush(); p.drain();
    expect(p.state.phase).toBe('HUNT_CONFIRM');
  });

  it('a newer directly applied animation also retires an earlier cached plain snapshot', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.buffer(f.selected);
    expect(p.receive(f.waiting)).toBe('applied');
    p.drain(); p.flush();
    expect(p.state.phase).toBe('HUNT_WAIT_REVEAL');
  });

  it('a newer directly applied plain snapshot supersedes its older cached plain predecessor', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.buffer(f.selected);
    p.receive(f.confirm); p.drain(); p.flush();
    expect(p.state.phase).toBe('HUNT_CONFIRM');
  });

  it('does not discard a different full decision snapshot merely because it shares visual IDs', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.buffer(f.waiting);
    const later = { ...f.confirm, _visualEvents: clone(f.waiting._visualEvents) };
    expect(p.buffer(later)).toBe('buffered');
    expect(p.context.pendingMpRawQueueRef.current).toEqual([f.waiting, later]);
    p.flush(); p.drain(); p.flush(); p.drain();
    expect(p.state.phase).toBe('HUNT_CONFIRM');
    expect(p.state.log.at(-1)).toBe(later.log.at(-1));
  });

  it.each(['prompt', 'revealed card'])('accepts a changed %s in the same decision phase after those visual IDs were consumed', field => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.receive(f.waiting); p.drain(); p.receive(f.confirm); p.drain();
    const abilityData = { ...f.confirm.abilityData,
      ...(field === 'prompt' ? { huntPromptId: 'hunt:3:2:0:2' }
        : { revCard: f.before.players[0].hand[1] }) };
    const changed = { ...f.confirm, abilityData, _visualEvents: clone(f.waiting._visualEvents) };
    expect(p.receive(changed)).toBe('applied');
    p.drain();
    expect(p.state.abilityData).toEqual(abilityData);
    expect(p.context.pendingGsRef.current).toBeNull();
    expect(p.context.animQueueRef.current).toEqual([]);
  });

  it('retains fresh extra events alongside old IDs and replays packet order', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.buffer(f.waiting); p.buffer(f.confirm);
    const msg = '本次新增同步通知';
    const event = createLogOnlyVisualEvent({ msgs: [msg] });
    const fresh = { ...f.waiting, log: [...f.waiting.log, msg], _visualEvents: [...f.waiting._visualEvents, event] };
    expect(p.buffer(fresh)).toBe('buffered');
    p.flush(); p.drain();
    expect(p.state.log).toEqual(f.waiting.log);
    p.flush(); p.drain(); p.flush();
    expect(p.state.phase).toBe('HUNT_WAIT_REVEAL');
    expect(p.state.log.at(-1)).toBe(msg);
    expect(p.context.consumedVisualEventIdsRef.current.has(event.id)).toBe(true);
  });

  it('retains repeated same-phase decisions with distinct prompts and fresh event identities', () => {
    const f = packets();
    const next = packets().waiting;
    next.abilityData.huntPromptId = 'hunt:3:2:0:2';
    const p = playback(rotateGsForViewer(f.before, 2), 2);
    p.buffer(f.waiting); p.buffer(next);
    expect(p.context.pendingMpRawQueueRef.current).toEqual([f.waiting, next]);
    p.flush(); p.drain(); p.flush(); p.drain();
    expect(p.state.abilityData.huntPromptId).toBe('hunt:3:2:0:2');
  });

  it('preserves ordering while a completed opening role reveal is visually busy', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    const busy = { roleRevealAnim: { role: ROLE_TREASURE }, anim: null };
    p.buffer(f.selected, busy); p.buffer(f.waiting, busy);
    p.flush(); p.drain(); p.flush();
    expect(p.state.phase).toBe('HUNT_WAIT_REVEAL');
  });

  it('keeps the existing opening-role pending and terminal sticky guards', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.context.mpOpeningRoleRevealPendingRef.current = true;
    expect(p.buffer(f.waiting)).toBe('ignored');
    expect(p.context.pendingMpRawQueueRef.current).toEqual([]);
    const terminal = { ...f.before, gameOver: { winner: ROLE_HUNTER, winnerIdx: 2 } };
    const finished = playback(rotateGsForViewer(terminal, 0), 0);
    expect(finished.buffer(f.waiting)).toBe('ignored');
    expect(finished.state.gameOver).toBeTruthy();
  });

  it('allows a plain phase to return to an earlier identical snapshot rather than globally deduplicating it', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.buffer(f.selected); p.flush();
    p.buffer(f.confirm); p.flush(); p.drain();
    p.buffer(clone(f.selected)); p.flush();
    expect(p.state.phase).toBe('HUNT_SELECT_TARGET');
  });

  it('restore clears the old buffer and duplicate history before accepting future packets', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.buffer(f.waiting); p.buffer(f.confirm);
    p.restore(f.before);
    expect(p.context.recentMpAnimatedRawSignaturesRef.current).toEqual([]);
    p.flush();
    expect(p.state.phase).toBe('ACTION');
    expect(p.buffer(clone(f.waiting))).toBe('buffered');
    p.flush(); p.drain();
    expect(p.state.phase).toBe('HUNT_WAIT_REVEAL');
  });

  it('non-multiplayer cancellation clears queued, latest and duplicate bookkeeping', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 0), 0);
    p.buffer(f.waiting); p.buffer(f.confirm);
    p.context.isMultiplayerRef.current = false;
    p.flush();
    expect(p.context.pendingMpRawQueueRef.current).toEqual([]);
    expect(p.context.pendingMpLatestStateRawRef.current).toBeNull();
    expect(p.context.recentMpAnimatedRawSignaturesRef.current).toEqual([]);
  });

  it('a new match clears the previous match buffers and duplicate history together', () => {
    const f = packets();
    const p = playback(rotateGsForViewer(f.before, 1), 1);
    p.buffer(f.waiting); p.buffer(f.confirm);
    expect(p.context.pendingMpRawQueueRef.current).toHaveLength(1);
    p.restore(f.before, 'gameStart');
    expect(p.context.pendingMpRawQueueRef.current).toEqual([]);
    expect(p.context.pendingMpLatestStateRawRef.current).toBeNull();
    expect(p.context.recentMpAnimatedRawSignaturesRef.current).toEqual([]);
  });
});
