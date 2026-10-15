import { describe, expect, it, vi } from 'vitest';
import { useAnimationQueue } from '../../hooks/useAnimationQueue';
import { createQueueAnimationTransaction } from '../../game/animationTransaction';
import { prepareAnimQueueLogs } from '../../game/animLogs';
import { registerMultiplayerSocketHandlers } from '../registerMultiplayerSocketHandlers';

vi.mock('react', () => ({
  useRef: value => ({ current: value }),
  useState: value => [value, vi.fn()],
  useEffect: vi.fn(),
  useCallback: fn => fn,
}));

function activePlayback() {
  const original = { _isMP: true, players: [{ name: '房主', hp: 10, san: 10 }], phase: 'ACTION', currentTurn: 0, turn: 1, log: [] };
  const stale = { ...original, turn: 2 };
  const restored = { ...original, turn: 8, log: ['已恢复的回合'], _visualEvents: [{ id: 'restored-event' }] };
  let current = original;
  const handlers = new Map();
  const socket = { on: vi.fn((event, handler) => handlers.set(event, handler)), emit: vi.fn() };
  const context = {
    socket, socketRef: { current: socket },
    playerUUIDRef: { current: 'me' }, leavingRoomRef: { current: false },
    isMultiplayerRef: { current: true }, myPlayerIndexRef: { current: 0 },
    latestGsRef: { current }, consumedVisualEventIdsRef: { current: new Set() },
    receivedGsRef: { current: false }, suppressNextBroadcastRef: { current: false },
    mpRoleRevealedRef: { current: true }, mpOpeningRoleRevealPendingRef: { current: false },
    mpAiTakeoverSeqRef: { current: 0 }, pendingMpAiTakeoverRef: { current: null },
    completedMpHuntRevealPromptIdsRef: { current: new Set() },
    gameEndSentRef: { current: false }, gameOverPresentationFrozenRef: { current: false },
    pendingMpRawQueueRef: { current: [] }, pendingMpLatestStateRawRef: { current: null },
    recentMpAnimatedRawSignaturesRef: { current: [] },
    visualStateLocks: { lock: vi.fn(), clear: vi.fn() },
    silentConnectionErrors: true,
  };
  context.setGs = vi.fn(next => {
    current = typeof next === 'function' ? next(current) : next;
    context.latestGsRef.current = current;
  });
  for (const name of ['setRoomModal', 'setIsMultiplayer', 'setIsDisconnected', 'setMyPlayerIndex',
    'setPlayerUsername', 'setPlayerUsernameSpecial', 'setRenameInput', 'cleanupConnection',
    'setMultiLoading', 'setOnlineOptionsModal', 'setConnErrModal', 'setFirstBattleStarted',
    'setRoleRevealAnim', 'setDismissedHuntRevealPromptId', 'clearDamageAnimations', 'addToast']) {
    context[name] = vi.fn();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Drive the actual queue and its captured completion after restore.
  const playback = useAnimationQueue({
    gs: original, setGs: context.setGs, copyPlayers: players => players.map(player => ({ ...player })),
    setVisualDiscard: vi.fn(), restoreVisibleLog: vi.fn(), appendVisibleLog: vi.fn(),
    getVisualDiscardForState: state => state?.discard || [], resolveTurnHighlightForStep: () => null,
    prepareAnimQueueLogs, visibleLogRef: { current: [] }, visibleLogEntryIdsRef: { current: new Set() },
    visualStateLocks: context.visualStateLocks,
    suppressNextBroadcastRef: context.suppressNextBroadcastRef, receivedGsRef: context.receivedGsRef,
    consumedVisualEventIdsRef: context.consumedVisualEventIdsRef, ANIM_DURATION: {}, ANIM_SPEED_SCALE: 1,
  });
  Object.assign(context, playback);
  context.resetReplayPlayback = vi.fn(() => {
    playback.resetAnimationQueue();
    context.visualStateLocks.clear({ players: true, zhuLight: true, hiddenZhuCardId: true, turnHighlight: true });
  });
  const continuation = vi.fn(() => context.setGs(stale));
  playback.playAnimationTransaction(createQueueAnimationTransaction({
    queue: [{ type: 'SKILL_SWAP', visualEventId: 'old-swap', msgs: ['旧对局的动画'] }],
    nextState: stale, callback: continuation, preserveQueueOrder: true,
  }));
  registerMultiplayerSocketHandlers(context);
  return { original, restored, context, playback, continuation, get state() { return current; },
    trigger: (event, data) => handlers.get(event)(data) };
}

describe('multiplayer restore interrupts active animation callbacks', () => {
  it('clears the previous match and its pending continuation before a guest starts a rematch', () => {
    const p = activePlayback();
    p.context.setGs({ ...p.original, gameOver: { winner: '寻宝者', winnerIdx: 0 } });
    p.trigger('gameStart', { roomId: 'room-a', matchId: 'match-b', players: [{ uuid: 'other' }, { uuid: 'me' }] });
    expect(p.state).toBeNull();
    expect(p.context.latestGsRef.current).toBeNull();
    p.playback.advanceQueue();
    expect(p.continuation).not.toHaveBeenCalled();
    expect(p.state).toBeNull();
  });

  it.each(['matchRestored', 'userInfo', 'aiTakeover'])('retires already-dispatched playback completion on %s', event => {
    const p = activePlayback();
    const lateAdvance = p.playback.advanceQueue;
    if (event === 'matchRestored') p.trigger(event, {
      roomId: 'room-a', playerIndex: 0, players: [{ uuid: 'me' }], gs: p.restored,
    });
    if (event === 'userInfo') p.trigger(event, { username: 'me', roomRestored: false, matchRestored: false });
    if (event === 'aiTakeover') p.trigger(event, { reason: '座位已由 AI 接管' });
    const snapshot = p.state;
    lateAdvance();
    lateAdvance();
    expect(p.state).toBe(snapshot);
    expect(p.continuation).not.toHaveBeenCalled();
    expect(p.playback.animCallbackRef.current).toBeNull();
    expect(p.playback.pendingVisualEventIdsRef.current).toEqual([]);
    expect(p.playback.queueLifecycleRef.current.phase).toBe('idle');
    if (event === 'matchRestored') expect(p.state.turn).toBe(8);
    if (event === 'userInfo') expect(p.state).toBeNull();
  });
});
