import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFreshRoleReveal } from './useFreshRoleReveal';
const hooks = vi.hoisted(() => ({ slots: [], cursor: 0, pending: [] }));
vi.mock('react', () => {
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  return {
    useState(initial) {
      const index = hooks.cursor++;
      hooks.slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [hooks.slots[index].value, value => { hooks.slots[index].value = value; }];
    },
    useMemo(make, deps) {
      const index = hooks.cursor++;
      if (!same(hooks.slots[index]?.deps, deps)) hooks.slots[index] = { value: make(), deps };
      return hooks.slots[index].value;
    },
    useCallback: callback => callback,
    useEffect(setup, deps) {
      const index = hooks.cursor++;
      if (same(hooks.slots[index]?.deps, deps)) return;
      hooks.slots[index]?.cleanup?.(); hooks.slots[index] = { deps };
      hooks.pending.push(() => { hooks.slots[index].cleanup = setup(); });
    },
  };
});
function mount(options = {}) {
  let props = { view: { revision: 0, viewerSeat: 0, serverNow: 1000, presentation: { batchId: 'opening', notBefore: 3500 } },
    freshStart: true, offline: false, ...options };
  return update => {
    props = { ...props, ...update }; hooks.cursor = 0;
    const result = useFreshRoleReveal(props); hooks.pending.splice(0).forEach(run => run()); return result;
  };
}
beforeEach(() => { hooks.slots = []; hooks.pending = []; vi.useFakeTimers(); });
afterEach(() => { hooks.slots.forEach(slot => slot.cleanup?.()); vi.useRealTimers(); });
describe('fresh remote role-reveal allowance', () => {
  it('releases at the immutable server cap even before the normal role callback', () => {
    const render = mount(); expect(render().active).toBe(true);
    vi.advanceTimersByTime(2499); expect(render().active).toBe(true);
    vi.advanceTimersByTime(1); expect(render().active).toBe(false);
  });
  it.each([null, { batchId: 'opening', notBefore: 999 }])('never blocks an already released or expired initial view: %j', presentation => {
    const render = mount({ view: { revision: 0, viewerSeat: 0, serverNow: 1000, presentation } });
    expect(render().active).toBe(false);
  });
  it('honors early release immediately and does not restart for a later batch', () => {
    const render = mount(); expect(render().active).toBe(true);
    expect(render({ view: { revision: 0, viewerSeat: 0, serverNow: 1100, presentation: null } }).active).toBe(false);
    expect(render({ view: { revision: 1, viewerSeat: 0, serverNow: 1100, presentation: { batchId: 'next', notBefore: 9000 } } }).active).toBe(false);
    vi.advanceTimersByTime(0); expect(render().active).toBe(false);
  });
  it('does not extend the original cap if later metadata supplies a larger allowance', () => {
    const render = mount(); render(); vi.advanceTimersByTime(2000);
    expect(render({ view: { revision: 0, viewerSeat: 0, serverNow: 3000, presentation: { batchId: 'opening', notBefore: 10000 } } }).active).toBe(true);
    vi.advanceTimersByTime(500); expect(render().active).toBe(false);
  });
  it('keeps offline identity animation until its ordinary finish callback', () => {
    const render = mount({ offline: true }); expect(render().active).toBe(true);
    vi.advanceTimersByTime(10000); const role = render(); expect(role.active).toBe(true);
    role.finish(); expect(render().active).toBe(false);
  });
  it.each([{ freshStart: false }, { view: { revision: 0, viewerSeat: null } }, { view: { revision: 0, viewerSeat: 0, tutorial: {} } }])('never creates a reveal for a restored/observer/tutorial baseline: %j', options => {
    expect(mount(options)().active).toBe(false);
  });
});
