import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnimationQueue } from '../useAnimationQueue';
import { createQueueAnimationTransaction } from '../../game/animationTransaction';
import { prepareAnimQueueLogs } from '../../game/animLogs';

const hooks = vi.hoisted(() => ({ current: null }));
vi.mock('react', () => ({
  useCallback: (...args) => hooks.current.useCallback(...args),
  useEffect: (...args) => hooks.current.useEffect(...args),
  useRef: (...args) => hooks.current.useRef(...args),
  useState: (...args) => hooks.current.useState(...args),
}));

// Run the actual queue effects and timers in the project's node environment.
function renderQueue(args) {
  const slots = [];
  let cursor = 0, dirty = true, output;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const runtime = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: initial, set: value => {
        const next = typeof value === 'function' ? value(slots[i].value) : value;
        if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; }
      } };
      return [slots[i].value, slots[i].set];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ||= { current: initial };
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn, deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i];
      if (!old || !same(old.deps, deps)) slots[i] = { deps, fn, cleanup: old?.cleanup, pending: true };
    },
  };
  return {
    get current() { return output; },
    flush(force = false) {
      if (force) dirty = true;
      let renders = 0;
      while (dirty) {
        if (++renders > 20) throw new Error('Hook render loop');
        dirty = false; cursor = 0; hooks.current = runtime;
        // eslint-disable-next-line react-hooks/rules-of-hooks -- This node harness implements each React render and effect cleanup.
        output = useAnimationQueue(args);
        slots.filter(slot => slot.pending).forEach(slot => {
          slot.pending = false; slot.cleanup?.(); slot.cleanup = slot.fn();
        });
      }
    },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

const card = { id: 'revealed-card', key: 'A4', name: '活埋', type: 'buryAlive' };
const godCard = { id: 'revealed-god', godKey: 'CTH', name: '拉莱耶之主', isGod: true };
let renderer;
afterEach(() => { renderer?.unmount(); vi.useRealTimers(); });

function setup({ tail = [], step = {}, state = {}, callback, currentOnly = false } = {}) {
  vi.useFakeTimers();
  const gs = { players: [{ id: 0, name: '你', hp: 10, san: 10, hand: [] }], discard: [], log: [], phase: 'ACTION', currentTurn: 0 };
  const decision = { ...gs, phase: 'DRAW_REVEAL', drawReveal: { card, needsDecision: true, drawerIdx: 0 }, ...state };
  const args = {
    gs: currentOnly ? decision : gs,
    copyPlayers: players => players.map(player => ({ ...player })),
    setGs: vi.fn(update => { args.gs = typeof update === 'function' ? update(args.gs) : update; }),
    setDisplayStats: vi.fn(), setVisualPlayersOverride: vi.fn(), setVisualDiscard: vi.fn(),
    restoreVisibleLog: vi.fn(), appendVisibleLog: vi.fn(),
    getVisualDiscardForState: value => value.discard || [], resolveTurnHighlightForStep: () => null,
    prepareAnimQueueLogs, visibleLogRef: { current: [] }, visibleLogEntryIdsRef: { current: new Set() },
    visualStateLocks: { lock: vi.fn(), clear: vi.fn() },
    consumedVisualEventIdsRef: { current: new Set() },
    suppressNextBroadcastRef: { current: true }, receivedGsRef: { current: false },
    ANIM_DURATION: { default: 100 }, ANIM_SPEED_SCALE: 1, ANIM_STEP_GAP: 10, CARD_REVEAL_DURATION: 1000,
  };
  renderer = renderQueue(args);
  renderer.flush();
  renderer.current.playAnimationTransaction(createQueueAnimationTransaction({
    queue: [{ type: 'DRAW_CARD', card, targetPid: 0, disableDrawBackgroundCamera: true,
      visualEventId: 'reveal:1', msgs: ['揭示卡牌'], ...step }, ...tail],
    nextState: currentOnly ? null : decision, callback, eventIds: ['reveal:1'],
  }));
  renderer.flush();
  return { args, decision, id: renderer.current.anim._playbackId };
}

describe('early reveal completion', () => {
  it('commits a draw exactly once and invalidates already-scheduled timers before React cleanup', () => {
    const { args, decision, id } = setup();
    expect(renderer.current.canFinishRevealEarly).toBe(true);
    const finish = renderer.current.finishRevealEarly;
    expect(finish(id)).toBe(true);
    expect(args.gs).toBe(decision);
    expect(args.consumedVisualEventIdsRef.current.has('reveal:1')).toBe(true);
    expect(args.receivedGsRef.current).toBe(true);
    expect(args.suppressNextBroadcastRef.current).toBe(false);
    expect(finish(id)).toBe(false);
    vi.advanceTimersByTime(2000); // Deliberately do not flush/clean up the old effect.
    expect(args.setGs).toHaveBeenCalledTimes(1);
    expect(args.appendVisibleLog).toHaveBeenCalledTimes(1);
    renderer.flush();
    expect(renderer.current.anim).toBeNull();
    expect(renderer.current.pendingGsRef.current).toBeNull();
    expect(renderer.current.canFinishRevealEarly).toBe(false);
  });

  it.each([false, true])('waits for the god reveal and encounter before committing its decision (SAN loss: %s)', losesSan => {
    const { args, decision, id } = setup({
      step: { card: godCard },
      state: { phase: 'GOD_CHOICE', abilityData: { godCard, drawerIdx: 0 },
        players: [{ id: 0, name: '你', hp: 10, san: losesSan ? 9 : 10, hand: [] }] },
      tail: losesSan ? [{ type: 'SAN_DAMAGE', durationMs: 300, impactAtMs: 150,
        targetStats: [{ hp: 10, san: 9 }], targetPid: 0, msgs: ['遭遇失去理智'] }] : [],
    });
    args.setDisplayStats.mockClear();
    expect(renderer.current.canFinishRevealEarly).toBe(false);
    expect(renderer.current.finishRevealEarly(id)).toBe(false);
    vi.advanceTimersByTime(1009);
    expect(args.setGs).not.toHaveBeenCalled();
    expect(args.setDisplayStats).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    renderer.flush();
    if (losesSan) {
      expect(renderer.current.anim.type).toBe('SAN_DAMAGE');
      expect(args.setGs).not.toHaveBeenCalled();
      expect(args.consumedVisualEventIdsRef.current.size).toBe(0);
      vi.advanceTimersByTime(150);
      expect(args.setDisplayStats).toHaveBeenCalledOnce();
      expect(args.setGs).not.toHaveBeenCalled();
      vi.advanceTimersByTime(160);
      renderer.flush();
    }
    expect(args.gs).toBe(decision);
    expect(args.gs.players[0].san).toBe(losesSan ? 9 : 10);
    expect(args.setGs).toHaveBeenCalledOnce();
    expect(renderer.current.anim).toBeNull();
    expect(renderer.current.pendingGsRef.current).toBeNull();
    expect(args.consumedVisualEventIdsRef.current.has('reveal:1')).toBe(true);
  });

  it('plays remaining effects and consumes their transaction only at the normal final commit', () => {
    const tail = [
      { type: 'SAN_DAMAGE', durationMs: 300, impactAtMs: 150,
        targetStats: [{ hp: 10, san: 9 }], targetPid: 0, msgs: ['失去理智'] },
      { type: 'STATE_PATCH', phase: 'DRAW_REVEAL', msgs: ['结算完成'] },
    ];
    const { args, decision, id } = setup({ tail });
    args.setDisplayStats.mockClear();
    expect(renderer.current.finishRevealEarly(id)).toBe(true);
    expect(args.setGs).not.toHaveBeenCalled();
    expect(args.consumedVisualEventIdsRef.current.size).toBe(0);
    renderer.flush();
    expect(renderer.current.anim.type).toBe('SAN_DAMAGE');
    vi.advanceTimersByTime(149);
    expect(args.setDisplayStats).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(args.setDisplayStats).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(160);
    renderer.flush();
    expect(args.gs).toBe(decision);
    expect(renderer.current.anim).toBeNull();
    expect(args.consumedVisualEventIdsRef.current.has('reveal:1')).toBe(true);
    expect(args.appendVisibleLog.mock.calls.flatMap(([lines]) => lines)).toEqual(['揭示卡牌', '失去理智', '结算完成']);
  });

  it('rejects a stale click after the natural completion cue already advanced the queue', () => {
    const { args, id } = setup({ tail: [{ type: 'YOUR_TURN', durationMs: 400 }] });
    vi.advanceTimersByTime(1010); // Natural advance, but the UI still holds the previous closure.
    expect(renderer.current.finishRevealEarly(id)).toBe(false);
    expect(args.setGs).not.toHaveBeenCalled();
    renderer.flush();
    expect(renderer.current.anim.type).toBe('YOUR_TURN');
  });

  it('revalidates the pending decision when it changes before the next React render', () => {
    const { args, decision, id } = setup();
    expect(renderer.current.canFinishRevealEarly).toBe(true);
    renderer.current.pendingGsRef.current = { ...decision, phase: 'ACTION' };
    expect(renderer.current.finishRevealEarly(id)).toBe(false);
    expect(args.setGs).not.toHaveBeenCalled();
  });

  it.each([
    ['different card', { state: { drawReveal: { card: { ...card, id: 'other' }, needsDecision: true } } }],
    ['different owner', { step: { targetPid: 1 } }],
    ['forced keep', { state: { drawReveal: { card, needsDecision: true, forcedKeep: true } } }],
    ['hidden draw', { step: { card: { ...card, hiddenDraw: true } } }],
    ['travel only', { step: { travelOnly: true } }],
    ['inspection', { step: { inspectionSeq: 1 } }],
    ['settled callback', { step: { onSettled: () => {} } }],
    ['impact cue', { step: { impactAtMs: 500 } }],
    ['visual cue', { step: { visualTimeline: [{ atMs: 500, patch: { hiddenZhuCardId: card.id } }] } }],
    ['continuation callback', { callback: () => {} }],
    ['resolved phase', { state: { phase: 'ACTION' } }],
  ])('does not shortcut %s', (_, options) => {
    const { args, id } = setup(options);
    expect(renderer.current.canFinishRevealEarly).toBe(false);
    expect(renderer.current.finishRevealEarly(id)).toBe(false);
    expect(args.setGs).not.toHaveBeenCalled();
  });

  it('rejects paused and wrong-playback clicks and supports an already committed decision', () => {
    const { args, id } = setup({ currentOnly: true });
    expect(renderer.current.finishRevealEarly(id + 1)).toBe(false);
    args.paused = true;
    renderer.flush(true);
    expect(renderer.current.canFinishRevealEarly).toBe(false);
    expect(renderer.current.finishRevealEarly(id)).toBe(false);
    args.paused = false;
    renderer.flush(true);
    expect(renderer.current.finishRevealEarly(id)).toBe(true);
    renderer.flush();
    expect(args.gs.phase).toBe('DRAW_REVEAL');
    expect(renderer.current.anim).toBeNull();
  });
});
