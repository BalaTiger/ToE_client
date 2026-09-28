import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getSkillTargetCenter, useSkillAnimationEffects } from '../useSkillAnimationEffects';

afterEach(() => vi.unstubAllGlobals());

it.each([0, 2])('aims hunt and bewitch at seat %s portrait rather than its extended panel', pid => {
  const portrait = { rect: { left: 24, top: 200, width: 48, height: 48 } };
  const panel = {
    querySelector: vi.fn(() => portrait),
    rect: { left: 0, top: 190, width: 100, height: 600 },
  };
  const querySelector = vi.fn(() => panel);
  vi.stubGlobal('document', { querySelector });
  expect(getSkillTargetCenter(pid)).toEqual({ cx: 48, cy: 224, size: 48 });
  expect(querySelector).toHaveBeenCalledWith(`[data-pid="${pid}"]`);
  expect(panel.querySelector).toHaveBeenCalledWith('.toe-coastal-portrait');
  // Classic layouts keep decorative portraits mounted but display:none.
  portrait.rect = { left: 0, top: 0, width: 0, height: 0 };
  expect(getSkillTargetCenter(pid)).toEqual({ cx: 50, cy: 490, size: 600 });
});

it('falls back to the viewport when the target has no measurable panel', () => {
  vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 800 });
  vi.stubGlobal('document', { querySelector: () => null });
  expect(getSkillTargetCenter(0)).toEqual({ cx: 600, cy: 200, size: 0 });
});

// ── Hook behavior: hunt vignette linger for the hunted local player ──
// Minimal react mock (node environment, same pattern as guillotineReadiness).
const hookEnv = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], rerender: null }));
vi.mock('react', () => ({
  useCallback: (fn) => {
    const i = hookEnv.cursor++;
    if (!hookEnv.slots[i]) hookEnv.slots[i] = fn;
    return hookEnv.slots[i];
  },
  useEffect: (fn, deps) => { hookEnv.effects.push({ fn, deps }); },
  useRef: (init) => {
    const i = hookEnv.cursor++;
    if (!hookEnv.slots[i]) hookEnv.slots[i] = { current: init };
    return hookEnv.slots[i];
  },
  useState: (init) => {
    const i = hookEnv.cursor++;
    if (!hookEnv.slots[i]) hookEnv.slots[i] = { value: typeof init === 'function' ? init() : init };
    const slot = hookEnv.slots[i];
    if (!slot.set) {
      slot.set = (next) => {
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; hookEnv.rerender?.(); }
      };
    }
    return [slot.value, slot.set];
  },
}));
vi.mock('../../utils/dom', () => ({
  _getZoomCompensatedRect: (el) => el?.rect ?? null,
}));

function setupSkillHook(hookFn) {
  const effectRecords = [];
  let props = {};
  let result;
  const renderFrame = () => {
    hookEnv.cursor = 0;
    hookEnv.effects = [];
    result = hookFn(props);
    hookEnv.effects.forEach((effect, i) => {
      const rec = effectRecords[i] || (effectRecords[i] = {});
      const changed = !rec.deps || !effect.deps
        || effect.deps.length !== rec.deps.length
        || effect.deps.some((d, j) => !Object.is(d, rec.deps[j]));
      if (changed) {
        rec.cleanup?.();
        rec.cleanup = effect.fn() || undefined;
        rec.deps = effect.deps;
      }
    });
  };
  hookEnv.rerender = renderFrame;
  return {
    render(next) { props = next; renderFrame(); return result; },
    get result() { return result; },
  };
}

let rafQueue;
beforeEach(() => {
  hookEnv.slots = [];
  hookEnv.rerender = null;
  rafQueue = [];
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafQueue.push(cb); return rafQueue.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('document', {
    querySelector: () => ({
      rect: { left: 0, top: 0, width: 400, height: 300 },
      querySelector: () => ({ rect: { left: 40, top: 60, width: 100, height: 80 } }),
    }),
  });
});
afterEach(() => vi.useRealTimers());

function flushRaf() {
  while (rafQueue.length) rafQueue.splice(0).forEach(cb => cb());
}

it('keeps the red frame after the scope for the hunted local player until the hold clears', () => {
  const hook = setupSkillHook(useSkillAnimationEffects);
  // Mirrors the App.jsx gate: active = !!huntAnim && (!huntAnim.scopeDone || huntVignetteHold)
  const overlayActive = (hold) => {
    const a = hook.result.huntAnim;
    return !!a && (!a.scopeDone || hold);
  };
  hook.render({ anim: null, huntVignetteHold: false });
  hook.render({ anim: { type: 'SKILL_HUNT', targetIdx: 0 }, huntVignetteHold: true });
  flushRaf();
  expect(hook.result.huntAnim).toMatchObject({ cx: 90, cy: 100, size: 100 });
  expect(hook.result.huntAnim.scopeDone).toBeUndefined();
  // Scope locks: red frame lingers instead of the overlay unmounting.
  vi.advanceTimersByTime(1100);
  expect(hook.result.huntAnim?.scopeDone).toBe(true);
  expect(overlayActive(true)).toBe(true);
  // Still lingering while the player decides.
  vi.advanceTimersByTime(5000);
  expect(hook.result.huntAnim?.scopeDone).toBe(true);
  // Reveal confirmed (hold drops): the overlay gate hides the frame.
  hook.render({ anim: { type: 'SKILL_HUNT', targetIdx: 0 }, huntVignetteHold: false });
  expect(overlayActive(false)).toBe(false);
});

it('clears the scope at lock time when the reveal was already confirmed', () => {
  const hook = setupSkillHook(useSkillAnimationEffects);
  hook.render({ anim: { type: 'SKILL_HUNT', targetIdx: 0 }, huntVignetteHold: false });
  flushRaf();
  expect(hook.result.huntAnim).toBeTruthy();
  vi.advanceTimersByTime(1100);
  expect(hook.result.huntAnim).toBeNull();
});

it('never lingers for opponent targets', () => {
  const hook = setupSkillHook(useSkillAnimationEffects);
  hook.render({ anim: { type: 'SKILL_HUNT', targetIdx: 2 }, huntVignetteHold: false });
  flushRaf();
  expect(hook.result.huntAnim).toBeTruthy();
  vi.advanceTimersByTime(1100);
  expect(hook.result.huntAnim?.scopeDone).toBeUndefined();
  vi.advanceTimersByTime(300);
  expect(hook.result.huntAnim).toBeNull();
});
