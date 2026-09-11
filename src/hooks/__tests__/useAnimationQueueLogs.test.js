import { describe, expect, it, vi } from 'vitest';
import { useAnimationQueue } from '../useAnimationQueue';
import { prepareAnimQueueLogs } from '../../game/animLogs';
import { createQueueAnimationTransaction } from '../../game/animationTransaction';

// Drive the hook's public queue controls synchronously; animation timers are
// irrelevant to the log ordering at transaction/continuation boundaries.
vi.mock('react', () => ({
  useRef: value => ({ current: value }),
  useState: value => [value, vi.fn()],
  useEffect: vi.fn(),
  useCallback: fn => fn,
}));

function playback(gs) {
  const visibleLogRef = { current: [...gs.log] };
  const updates = [];
  const restoreVisibleLog = vi.fn(log => {
    visibleLogRef.current = [...log];
    updates.push([...log]);
  });
  const appendVisibleLog = vi.fn((lines) => {
    visibleLogRef.current = [...visibleLogRef.current, ...lines];
    updates.push([...visibleLogRef.current]);
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Hooks are mocked above to exercise the queue controls without a DOM.
  const hook = useAnimationQueue({
    gs,
    copyPlayers: players => players.map(player => ({ ...player })),
    setGs: vi.fn(),
    setVisualDiscard: vi.fn(),
    restoreVisibleLog,
    appendVisibleLog,
    getVisualDiscardForState: state => state?.discard || [],
    resolveTurnHighlightForStep: () => null,
    prepareAnimQueueLogs,
    visibleLogRef,
    visibleLogEntryIdsRef: { current: new Set() },
    visualStateLocks: { lock: vi.fn(), clear: vi.fn() },
    suppressNextBroadcastRef: { current: false },
    receivedGsRef: { current: false },
    consumedVisualEventIdsRef: { current: new Set() },
    ANIM_DURATION: {},
    ANIM_SPEED_SCALE: 1,
  });
  const play = (queue, nextState, callback) => hook.playAnimationTransaction(
    createQueueAnimationTransaction({ queue, nextState, callback, preserveQueueOrder: true }),
  );
  return { ...hook, play, visibleLogRef, updates, restoreVisibleLog, appendVisibleLog };
}

describe('animation log continuation boundaries', () => {
  it.each(['贝拉', '你'])('reveals %s turn logs once, after the previous AI action', name => {
    const oldBanner = '── 艾伦 的回合开始 ──';
    const action = '艾伦 对 贝拉 【掉包】';
    const privateLog = '收到一张手牌';
    const banner = `── ${name} 的回合开始 ──`;
    const draw = `${name} 摸到 [C3] 龙之心`;
    const next = { players: [], log: [oldBanner, action, privateLog, banner, draw] };
    const p = playback({ players: [], log: [oldBanner] });
    p.play([
      { type: 'SKILL_SWAP', visualEventId: 'swap:1', msgs: [action] },
      { type: 'STATE_PATCH', msgs: [privateLog] },
    ], next, () => p.play([
      { type: 'YOUR_TURN', visualEventId: 'banner:2', msgs: [banner] },
      { type: 'DRAW_CARD', visualEventId: 'draw:2', card: { effect: 'heal' }, msgs: [draw] },
    ], next));
    expect(p.visibleLogRef.current).toEqual([oldBanner, action]);
    p.advanceQueue(); // Companion patch, then start the next turn queue.
    expect(p.restoreVisibleLog).not.toHaveBeenCalled();
    expect(p.visibleLogRef.current).toEqual([oldBanner, action, privateLog, banner]);
    expect(p.appendVisibleLog).toHaveBeenCalledWith([privateLog], { source: 'visualEvent' });
    p.advanceQueue();
    expect(p.visibleLogRef.current).toEqual(next.log);
    p.advanceQueue(); // Ordinary commits must never replace the event timeline.
    expect(p.restoreVisibleLog).not.toHaveBeenCalled();
    expect(p.updates.every(log => log.filter(line => line === banner).length <= 1)).toBe(true);
  });

  it('does not reveal the next turn before an empty action continuation', () => {
    const banner = '── 你 的回合开始 ──';
    const next = { players: [], log: [banner] };
    const p = playback({ players: [], log: [] });
    p.play([], next, () => p.play([
      { type: 'YOUR_TURN', visualEventId: 'banner:1', msgs: [banner] },
    ], next));
    expect(p.restoreVisibleLog).not.toHaveBeenCalled();
    expect(p.visibleLogRef.current).toEqual([banner]);
  });

  it('ignores corrupted rule logs and emits replayed event messages only once', () => {
    const p = playback({ players: [], log: [] });
    const next = { players: [], log: ['unrelated future turn', 'wrong order'] };
    const step = { type: 'STATE_PATCH', visualEventId: 'event:1', msgs: ['same text'] };
    p.play([step], next);
    // Interrupt/re-submit before the first queue has committed.
    p.play([step], next);
    p.advanceQueue();
    expect(p.visibleLogRef.current).toEqual(['same text']);
    p.play([{ ...step, visualEventId: 'event:2' }], next);
    p.advanceQueue();
    expect(p.visibleLogRef.current).toEqual(['same text', 'same text']);
    expect(p.restoreVisibleLog).not.toHaveBeenCalled();
  });

  it('keeps final game settlement as an explicit rule-log restore', () => {
    const p = playback({ players: [], log: [] });
    const next = { players: [], log: ['game ended'], gameOver: { reason: 'game ended' } };
    p.play([{ type: 'STATE_PATCH', visualEventId: 'end', msgs: ['last event'] }], next);
    p.advanceQueue();
    expect(p.restoreVisibleLog).toHaveBeenCalledExactlyOnceWith(next.log);
  });
});
