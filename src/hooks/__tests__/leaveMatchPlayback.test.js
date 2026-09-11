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

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const cleanupCallbacks = ['clearBattleAnimationState', 'clearMultiplayerReplayState'].map(name => {
  const start = source.indexOf(`  const ${name}=useCallback(`);
  return source.slice(start, source.indexOf('\n\n', start));
}).join('\n');
const exits = ['leaveMultiplayerMatchToStart', 'resetDisconnectedToStart', 'returnToMainMenu'];
const exitHandlers = exits.map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n');

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
