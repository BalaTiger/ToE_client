import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { useAnimationQueue } from '../useAnimationQueue';
import { prepareAnimQueueLogs } from '../../game/animLogs';
import { createQueueAnimationTransaction } from '../../game/animationTransaction';
import { canFireAnimationCue } from '../../game/animationQueueMachine';

vi.mock('react', () => ({
  useRef: value => ({ current: value }),
  useState: value => [value, vi.fn()],
  useEffect: vi.fn(),
  useCallback: fn => fn,
}));

// Normalize checkout line endings before locating whole cleanup/exit blocks.
const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cleanupCallbacks = ['clearBattleAnimationState', 'clearMultiplayerReplayState'].map(name => {
  const start = source.indexOf(`  const ${name}=useCallback(`);
  const end = source.indexOf('\n\n', start);
  if (start < 0 || end < 0) throw new Error(`Missing App cleanup callback boundary: ${name}`);
  return source.slice(start, end);
}).join('\n');
function extractExitHandler(name) {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  if (start < 0 || !closing) throw new Error(`Missing App exit handler boundary: ${name}`);
  return source.slice(start, start + closing.index + closing[0].length);
}
const exits = ['leaveMultiplayerMatchToStart', 'resetDisconnectedToStart', 'returnToMainMenu'];
const exitHandlers = exits.map(extractExitHandler).join('\n');
const confirmationHandlers = ['requestExitMatch', 'confirmExitMatch'].map(extractExitHandler).join('\n');
const exitEscapeEffect = source.slice(
  source.indexOf('  useEffect(', source.indexOf('const [exitMatchConfirm,setExitMatchConfirm]')),
  source.indexOf('  function resetDisconnectedToStart('),
);

describe('shared match exit confirmation', () => {
  it.each([
    ['solo', {}, '返回主界面将结束本局游戏', 'returnToMainMenu'],
    ['paused solo', { isSoloPaused: true }, '返回主界面将结束本局游戏', 'returnToMainMenu'],
    ['multiplayer', { isMultiplayer: true }, '退出对局并离开房间', 'leaveMultiplayerMatchToStart'],
    ['spectator', { isMultiplayer: true, isSpectating: true }, '你将离开游戏房间', 'leaveMultiplayerMatchToStart'],
    ['reconnecting', { isMultiplayer: true, isDisconnected: true }, '放弃重连', 'resetDisconnectedToStart'],
  ])('%s leaves only after confirmation and cancellation preserves the match', (_mode, flags, message, cleanup) => {
    const context = {
      isMultiplayer: false, isDisconnected: false, isSpectating: false,
      showTutorial: false, isSoloPaused: false, exitMatchConfirm: null, ...flags,
    };
    context.setExitMatchConfirm = vi.fn(value => { context.exitMatchConfirm = value; });
    exits.forEach(name => { context[name] = vi.fn(); });
    runInNewContext(confirmationHandlers, context);

    context.requestExitMatch();
    expect(context.exitMatchConfirm.message).toContain(message);
    exits.forEach(name => expect(context[name]).not.toHaveBeenCalled());
    expect(context.isSoloPaused).toBe(!!flags.isSoloPaused);

    // The shared dialog's cancel callback only dismisses the request.
    context.setExitMatchConfirm(null);
    context.confirmExitMatch();
    exits.forEach(name => expect(context[name]).not.toHaveBeenCalled());
    expect(context.isSoloPaused).toBe(!!flags.isSoloPaused);

    context.requestExitMatch();
    context.confirmExitMatch();
    expect(context.exitMatchConfirm).toBeNull();
    exits.forEach(name => expect(context[name]).toHaveBeenCalledTimes(name === cleanup ? 1 : 0));
  });

  it('keeps the tutorial exit disabled at the shared entry point', () => {
    const context = { showTutorial: true, isMultiplayer: false, setExitMatchConfirm: vi.fn() };
    runInNewContext(confirmationHandlers, context);
    context.requestExitMatch();
    expect(context.setExitMatchConfirm).not.toHaveBeenCalled();
  });

  it.each([
    [true, { message: '确认退出' }, 'cancel'],
    [false, { message: '确认退出' }, 'cancel'],
    [true, null, 'resume'],
    [false, null, 'none'],
  ])('Escape respects the topmost dialog (paused=%s, confirmation=%j)', (isSoloPaused, exitMatchConfirm, action) => {
    let listener, cleanup;
    const context = {
      isSoloPaused, exitMatchConfirm,
      setIsSoloPaused: vi.fn(), setExitMatchConfirm: vi.fn(),
      useEffect: setup => { cleanup = setup(); },
      window: {
        addEventListener: vi.fn((_name, callback) => { listener = callback; }),
        removeEventListener: vi.fn(),
      },
    };
    runInNewContext(exitEscapeEffect, context);
    const event = { key: 'Escape', preventDefault: vi.fn() };
    listener?.({ ...event, defaultPrevented: true });
    listener?.({ ...event, key: 'Enter' });
    expect(context.setIsSoloPaused).not.toHaveBeenCalled();
    expect(context.setExitMatchConfirm).not.toHaveBeenCalled();
    listener?.(event);
    expect(context.setExitMatchConfirm).toHaveBeenCalledTimes(action === 'cancel' ? 1 : 0);
    expect(context.setIsSoloPaused).toHaveBeenCalledTimes(action === 'resume' ? 1 : 0);
    if (action === 'cancel') expect(context.setExitMatchConfirm).toHaveBeenCalledWith(null);
    if (action === 'resume') expect(context.setIsSoloPaused).toHaveBeenCalledWith(false);
    if (action === 'none') expect(context.window.addEventListener).not.toHaveBeenCalled();
    cleanup?.();
    if (listener) expect(context.window.removeEventListener).toHaveBeenCalledWith('keydown', listener);
  });
});

describe('leaving a match during queued playback', () => {
  it.each(exits)('%s prevents a late queue commit or continuation from reopening the match', exit => {
    for (const hasCallback of [false, true]) {
      const oldGs = { players: [{ name: '诺亚', hp: 10, san: 10 }], phase: 'ACTION', currentTurn: 0, log: [] };
      const nextGs = { ...oldGs, phase: 'AI_TURN', currentTurn: 1 };
      const context = {
        gs: oldGs,
        useCallback: fn => fn,
        isMultiplayer: exit !== 'returnToMainMenu',
        consumedVisualEventIdsRef: { current: new Set() },
        pendingMpRawQueueRef: { current: [nextGs] },
        pendingMpLatestStateRawRef: { current: nextGs },
        pendingMpAiTakeoverRef: { current: nextGs },
        mpOpeningRoleRevealPendingRef: { current: true },
        isMultiplayerRef: { current: true },
        myPlayerIndexRef: { current: 1 },
        mpRoleRevealedRef: { current: true },
        gameEndSentRef: { current: false },
        endTurnSeqRef: { current: { cursor: 1 } },
        latestGsRef: { current: oldGs },
        roseThornPrevRef: { current: oldGs },
        visualStateLocks: { lock: vi.fn(), clear: vi.fn() },
      };
      for (const name of [
        'setIsDisconnected', 'closeRoomModal', 'setOnlineOptionsModal', 'closeLobbyModal',
        'setIsMultiplayer', 'setMyPlayerIndex', 'setExitMatchConfirm', 'setShowEmojiPicker',
        'setShowFullLog', 'setShowGodResurrection', 'setIsSoloPaused', 'setPendingRoleSelection',
        'clearSkillAnimations', 'clearCardTransferAnimations', 'clearDamageAnimations',
        'setEarthquakeVisualPlayers', 'setRoleRevealAnim',
      ]) context[name] = vi.fn();
      context.setGs = vi.fn(next => { context.gs = typeof next === 'function' ? next(context.gs) : next; });
      const appendVisibleLog = vi.fn();
      // eslint-disable-next-line react-hooks/rules-of-hooks -- Mocked hooks exercise the real queue controls and App exit handlers.
      const playback = useAnimationQueue({
        gs: oldGs,
        copyPlayers: players => players.map(player => ({ ...player })),
        setGs: context.setGs,
        setVisualDiscard: vi.fn(),
        restoreVisibleLog: vi.fn(),
        appendVisibleLog,
        getVisualDiscardForState: state => state?.discard || [],
        resolveTurnHighlightForStep: () => null,
        prepareAnimQueueLogs,
        visibleLogRef: { current: [] },
        visibleLogEntryIdsRef: { current: new Set() },
        visualStateLocks: context.visualStateLocks,
        suppressNextBroadcastRef: { current: false },
        receivedGsRef: { current: false },
        consumedVisualEventIdsRef: context.consumedVisualEventIdsRef,
        ANIM_DURATION: {},
        ANIM_SPEED_SCALE: 1,
      });
      Object.assign(context, playback);
      const continuation = vi.fn(() => context.setGs(nextGs));
      playback.playAnimationTransaction(createQueueAnimationTransaction({
        queue: [
          { type: 'SKILL_SWAP', visualEventId: 'old-swap', msgs: ['正在掉包'] },
          { type: 'YOUR_TURN', visualEventId: 'old-turn', msgs: ['旧对局下个回合'] },
        ],
        nextState: nextGs,
        callback: hasCallback ? continuation : undefined,
        preserveQueueOrder: true,
      }));
      const lateAdvance = playback.advanceQueue;
      runInNewContext(`${cleanupCallbacks}\n${exitHandlers}\n${exit}();`, context);
      const logCallsAtExit = appendVisibleLog.mock.calls.length;
      expect(context.gs).toBeNull();
      expect(playback.pendingGsRef.current).toBeNull();
      expect(playback.animCallbackRef.current).toBeNull();
      expect(playback.pendingVisualEventIdsRef.current).toEqual([]);
      expect(playback.queueLifecycleRef.current.phase).toBe('idle');
      expect(canFireAnimationCue(playback.queueLifecycleRef.current, 'advance')).toBe(false);
      expect(context.pendingMpRawQueueRef.current).toEqual([]);
      expect(context.pendingMpLatestStateRawRef.current).toBeNull();
      expect(context.endTurnSeqRef.current).toBeNull();
      expect(context.setRoleRevealAnim).toHaveBeenCalledWith(null);

      // Simulate a completion already dispatched before React's effect cleanup.
      lateAdvance();
      lateAdvance();
      expect(continuation).not.toHaveBeenCalled();
      expect(context.gs).toBeNull();
      expect(appendVisibleLog).toHaveBeenCalledTimes(logCallsAtExit);
      expect(context.consumedVisualEventIdsRef.current.size).toBe(0);
    }
  });
});
