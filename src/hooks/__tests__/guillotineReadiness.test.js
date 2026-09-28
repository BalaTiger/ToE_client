import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnimationQueue } from '../useAnimationQueue';
import { useDamageAnimationEffects } from '../useDamageAnimationEffects';
import { useGlobalShakeEffects } from '../useGlobalShakeEffects';
import { prepareAnimQueueLogs } from '../../game/animLogs';
import { createQueueAnimationTransaction } from '../../game/animationTransaction';
import { ANIM_DURATION, ANIM_SPEED_SCALE, ANIM_STEP_GAP } from '../../components/anim/constants';
import { DEATH_SNAPSHOT_TIMEOUT_MS } from '../../utils/deathPanelSnapshot';

const hooks = vi.hoisted(() => ({ current: null, captures: [], canvasOptions: [] }));
vi.mock('react', () => ({
  useCallback: (...args) => hooks.current.useCallback(...args),
  useEffect: (...args) => hooks.current.useEffect(...args),
  useMemo: (...args) => hooks.current.useMemo(...args),
  useRef: (...args) => hooks.current.useRef(...args),
  useState: (...args) => hooks.current.useState(...args),
}));
vi.mock('html2canvas', () => ({
  default: vi.fn((el, options) => {
    hooks.canvasOptions.push(options);
    return new Promise((resolve, reject) => hooks.captures.push({ resolve, reject }));
  }),
}));
vi.mock('../../utils/dom', () => ({
  _getZoomCompensatedRect: () => ({ left: 100, top: 100, width: 200, height: 180 }),
}));

// The project uses a node test environment. Preserve hook state, dependencies,
// and cleanup between renders so the real queue and presentation effects run.
function createHookRenderer(renderHook) {
  const slots = [];
  let cursor = 0;
  let dirty = true;
  let mounted = true;
  let output;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const runtime = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === 'function' ? initial() : initial };
        slot.set = next => {
          const value = typeof next === 'function' ? next(slot.value) : next;
          if (mounted && !Object.is(value, slot.value)) { slot.value = value; dirty = true; }
        };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: fn, deps };
      return slots[index].value;
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
      return slots[index].value;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const old = slots[index];
      if (!old || !same(old.deps, deps)) slots[index] = { deps, fn, cleanup: old?.cleanup, pending: true };
    },
  };
  return {
    get current() { return output; },
    flush(force = false) {
      if (force) dirty = true;
      let renders = 0;
      while (mounted && dirty) {
        if (++renders > 30) throw new Error('Hook render loop');
        dirty = false;
        cursor = 0;
        hooks.current = runtime;
        output = renderHook();
        slots.filter(slot => slot.pending).forEach(slot => {
          slot.pending = false;
          slot.cleanup?.();
          slot.cleanup = slot.fn();
        });
      }
    },
    unmount() { mounted = false; slots.forEach(slot => slot.cleanup?.()); },
  };
}

const duration = Math.round(ANIM_DURATION.GUILLOTINE * ANIM_SPEED_SCALE) + ANIM_STEP_GAP;
let renderer;
let paused;
let sound;
let panel;

beforeEach(() => {
  vi.useFakeTimers();
  hooks.captures = [];
  hooks.canvasOptions = [];
  paused = false;
  sound = vi.fn();
  panel = { offsetWidth: 200, offsetHeight: 180, closest: () => ({}) };
  vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('document', { querySelector: () => panel });
  vi.stubGlobal('window', {
    innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
    getComputedStyle: () => ({ background: '#222', borderTopColor: '#444', boxShadow: 'none' }),
  });
  const gs = { players: [0, 1, 2].map(id => ({ id, name: `P${id}`, hp: 0, san: 6, hand: [], gods: [] })), discard: [], log: [], phase: 'ACTION', currentTurn: 0 };
  const args = {
    gs, copyPlayers: players => players.map(p => ({ ...p })), setGs: vi.fn(),
    setVisualDiscard: vi.fn(), restoreVisibleLog: vi.fn(), appendVisibleLog: vi.fn(),
    getVisualDiscardForState: state => state?.discard || [], resolveTurnHighlightForStep: () => null,
    prepareAnimQueueLogs, visibleLogRef: { current: [] }, visibleLogCountRef: { current: 0 },
    setVisibleLog: vi.fn(), visualStateLocks: { lock: vi.fn(), clear: vi.fn() },
    suppressNextBroadcastRef: { current: false }, receivedGsRef: { current: false },
    ANIM_DURATION, ANIM_SPEED_SCALE, ANIM_STEP_GAP,
  };
  renderer = createHookRenderer(() => {
    const playback = useAnimationQueue({ ...args, paused });
    const damage = useDamageAnimationEffects({ anim: playback.anim, paused, onGuillotineReady: playback.markGuillotineReady, playGuillotineDeathSound: sound });
    const shake = useGlobalShakeEffects({ ...args, anim: playback.anim, guillotineReady: playback.guillotineReady });
    return { ...playback, ...damage, ...shake };
  });
  renderer.flush();
  renderer.current.playAnimationTransaction(createQueueAnimationTransaction({
    queue: [{ type: 'GUILLOTINE', hitIndices: [2] }, { type: 'DEATH' }],
    nextState: gs, preserveQueueOrder: true,
  }));
  renderer.flush();
});

afterEach(() => {
  renderer?.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function advance(ms) {
  await vi.advanceTimersByTimeAsync(ms);
  await vi.dynamicImportSettled();
  renderer.flush();
}

async function resolveCapture(index = 0, url = 'data:image/png;base64,panel') {
  hooks.captures[index].resolve({ toDataURL: () => url });
  await advance(0);
  await advance(16);
}

describe('guillotine screenshot readiness at real playback boundary', () => {
  it('waits for a capture slower than the old 1500ms boundary, then plays the full slice with synchronized sound and shake', async () => {
    await advance(32);
    expect(hooks.captures).toHaveLength(1);
    await advance(duration + 100);
    expect(renderer.current.anim.type).toBe('GUILLOTINE');
    expect(renderer.current.guillotineTargets).toEqual([]);
    expect(sound).not.toHaveBeenCalled();
    expect(renderer.current.sceneShake).toBeNull();
    await resolveCapture();
    expect(renderer.current.guillotineTargets[0].snapshotUrl).toBe('data:image/png;base64,panel');
    expect(sound).toHaveBeenCalledTimes(1);
    expect(renderer.current.guillotineReady).toBe(true);
    expect(renderer.current.sceneShake.event).toBe(renderer.current.anim);
    expect(renderer.current.sceneShake.timing.delay).toBe(120);
    expect(renderer.current.sceneShake.timing.duration * renderer.current.sceneShake.timing.iterations).toBe(220);
    await advance(120);
    expect(renderer.current.sceneShake).not.toBeNull();
    await advance(duration - 121);
    expect(renderer.current.anim.type).toBe('GUILLOTINE');
    await advance(1);
    expect(renderer.current.anim.type).toBe('DEATH');
  });

  it('starts a normal capture as soon as it is available and preserves transparent, zoom-correct snapshot options', async () => {
    await advance(32);
    await resolveCapture();
    expect(sound).toHaveBeenCalledTimes(1);
    const options = hooks.canvasOptions[0];
    const clone = { style: {} };
    const container = { style: {} };
    options.onclone({ querySelector: () => container }, clone);
    expect(clone.style).toMatchObject({ zoom: 'normal', transform: 'none', background: 'transparent', borderColor: 'transparent', boxShadow: 'none' });
    expect(container.style).toMatchObject({ zoom: 'normal', transform: 'none' });
    expect(options.ignoreElements({ hasAttribute: () => true })).toBe(true);
    await advance(duration);
    expect(renderer.current.anim.type).toBe('DEATH');
  });

  it('falls back after a bounded capture timeout and ignores an eventual late image', async () => {
    await advance(32);
    await advance(DEATH_SNAPSHOT_TIMEOUT_MS);
    await advance(16);
    expect(renderer.current.guillotineTargets[0]).toMatchObject({ pi: 2, w: 200, snapshotUrl: null });
    expect(sound).toHaveBeenCalledTimes(1);
    await resolveCapture();
    expect(renderer.current.guillotineTargets[0].snapshotUrl).toBeNull();
    expect(sound).toHaveBeenCalledTimes(1);
    await advance(duration);
    expect(renderer.current.anim.type).toBe('DEATH');
  });

  it('falls back promptly on a rejected capture', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await advance(32);
    hooks.captures[0].reject(new Error('canvas failed'));
    await advance(0);
    await advance(16);
    expect(renderer.current.guillotineReady).toBe(true);
    expect(renderer.current.guillotineTargets[0].snapshotUrl).toBeNull();
    await advance(duration);
    expect(renderer.current.anim.type).toBe('DEATH');
  });

  it('still releases the presentation clock if the sound callback throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sound.mockImplementation(() => { throw new Error('audio unavailable'); });
    await advance(32);
    await resolveCapture();
    expect(renderer.current.guillotineReady).toBe(true);
    expect(renderer.current.guillotineTargets[0].snapshotUrl).toBe('data:image/png;base64,panel');
    await advance(duration);
    expect(renderer.current.anim.type).toBe('DEATH');
  });

  it('releases a missing-panel step without hanging', async () => {
    panel = null;
    await advance(32);
    await advance(16);
    expect(renderer.current.guillotineReady).toBe(true);
    expect(renderer.current.guillotineTargets).toEqual([]);
    await advance(duration);
    expect(renderer.current.anim.type).toBe('DEATH');
  });

  it('releases a panel measurement failure without hanging', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.getComputedStyle = () => { throw new Error('panel removed'); };
    await advance(32);
    await advance(16);
    expect(renderer.current.guillotineReady).toBe(true);
    expect(renderer.current.guillotineTargets).toEqual([]);
    await advance(duration);
    expect(renderer.current.anim.type).toBe('DEATH');
  });

  it('does not let a departed step publish its snapshot into a later death animation', async () => {
    await advance(32);
    renderer.current.setAnim({ type: 'GUILLOTINE', _playbackId: 'replacement', hitIndices: [1], durationMs: 1080 });
    renderer.flush();
    await advance(32);
    await resolveCapture(0, 'data:image/png;base64,old');
    expect(renderer.current.guillotineReady).toBe(false);
    expect(sound).not.toHaveBeenCalled();
    await resolveCapture(1, 'data:image/png;base64,new');
    expect(renderer.current.guillotineTargets[0]).toMatchObject({ pi: 1, snapshotUrl: 'data:image/png;base64,new' });
    expect(sound).toHaveBeenCalledTimes(1);
    renderer.current.markGuillotineReady({ _playbackId: 'old-step' });
    renderer.flush();
    expect(renderer.current.guillotineReady).toBe(true);
  });

  it('can prepare while paused but starts presentation and its clock only on resume', async () => {
    paused = true;
    renderer.flush(true);
    await advance(32);
    await resolveCapture();
    await advance(duration + 100);
    expect(sound).not.toHaveBeenCalled();
    expect(renderer.current.guillotineReady).toBe(false);
    expect(renderer.current.guillotineTargets).toEqual([]);
    paused = false;
    renderer.flush(true);
    await advance(16);
    expect(sound).toHaveBeenCalledTimes(1);
    await advance(400);
    paused = true;
    renderer.flush(true);
    await advance(duration + 100);
    expect(renderer.current.anim.type).toBe('GUILLOTINE');
    paused = false;
    renderer.flush(true);
    await advance(duration - 400);
    expect(renderer.current.anim.type).toBe('DEATH');
    expect(sound).toHaveBeenCalledTimes(1);
  });

  it.each(['reset', 'unmount'])('%s invalidates pending capture, readiness, sound and timers', async action => {
    await advance(32);
    if (action === 'reset') {
      renderer.current.resetAnimationQueue();
      renderer.current.clearDamageAnimations();
      renderer.flush();
    } else renderer.unmount();
    await resolveCapture();
    await advance(DEATH_SNAPSHOT_TIMEOUT_MS + duration);
    expect(sound).not.toHaveBeenCalled();
    if (action === 'reset') {
      expect(renderer.current.anim).toBeNull();
      expect(renderer.current.guillotineTargets).toEqual([]);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
