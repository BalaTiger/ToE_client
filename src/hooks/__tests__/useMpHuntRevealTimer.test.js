import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMpHuntRevealTimer } from '../useMultiplayerTimers';
import { createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../../constants/card';

const hooks = vi.hoisted(() => ({ current: null }));
vi.mock('react', () => ({
  useEffect: (...args) => hooks.current.useEffect(...args),
  useRef: (...args) => hooks.current.useRef(...args),
  useState: (...args) => hooks.current.useState(...args),
}));

// Execute the production hook with retained slots, dependencies and real cleanup,
// using the same node-environment pattern as the existing hook tests.
function renderTimer(args) {
  const slots = [];
  let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const runtime = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: initial, set: value => {
        slots[i].value = typeof value === 'function' ? value(slots[i].value) : value;
      } };
      return [slots[i].value, slots[i].set];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ||= { current: initial };
    },
    useEffect(callback, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || !same(previous.deps, deps)) {
        slots[i] = { deps, callback, cleanup: previous?.cleanup, pending: true };
      }
    },
  };
  return {
    render(patch = {}) {
      Object.assign(args, patch);
      cursor = 0;
      hooks.current = runtime;
      // eslint-disable-next-line react-hooks/rules-of-hooks -- This slot renderer calls the actual production hook and effect cleanup.
      useMpHuntRevealTimer(args);
      slots.filter(slot => slot.pending).forEach(slot => {
        slot.pending = false;
        slot.cleanup?.();
        slot.cleanup = slot.callback();
      });
    },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

const renderers = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  renderers.splice(0).forEach(renderer => renderer.unmount());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  hooks.current = null;
});

function setup(hand, patch = {}) {
  const me = { id: 0, name: '目标', hp: 10, san: 10, hand };
  const gs = {
    _isMP: true, _turnKey: 7, currentTurn: 1, phase: 'HUNT_WAIT_REVEAL', gameOver: null,
    players: [me, { id: 1, name: '追猎者', hand: [] }],
    log: ['等待亮牌'], abilityData: { huntTi: 0, huntPromptId: 'hunt-prompt-7' },
  };
  const args = { isMultiplayer: true, gs, isLocalHuntTarget: true, me, playTickSound: vi.fn(), onReveal: vi.fn(), ...patch };
  const renderer = renderTimer(args);
  renderers.push(renderer);
  renderer.render();
  return { args, renderer };
}

const ordinary = { id: 'ordinary', name: '普通牌', type: 'drawCard', key: 'A1' };
const otherLegal = { id: 'other-legal', name: '其他合法衍生牌', type: 'geomagneticRestore', isGeomagneticRestore: true };

describe('useMpHuntRevealTimer legal automatic reveal', () => {
  it.each([[0, ordinary], [0.999, otherLegal]])('selects only eligible held cards at random=%s', (random, expected) => {
    const hand = [createTsathogguaSlimeCard(), ordinary, otherLegal, createBlackGoatYoungCard()];
    vi.spyOn(Math, 'random').mockReturnValue(random);
    const { args } = setup(hand);
    vi.advanceTimersByTime(20000);
    expect(args.onReveal).toHaveBeenCalledExactlyOnceWith(expected, { timedOut: true });
    expect(args.gs.phase).toBe('HUNT_WAIT_REVEAL');
    expect(hand).toHaveLength(4);
    expect(hand).toContain(expected);
    vi.advanceTimersByTime(20000);
    expect(args.onReveal).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['flagged illegal cards', () => [createTsathogguaSlimeCard(), createBlackGoatYoungCard()]],
    ['type-only illegal cards', () => [{ id: 'slime-type', type: 'tsathogguaSlime' }, { id: 'young-type', type: 'blackGoatYoung' }]],
    ['empty hand', () => []],
  ])('keeps the existing empty-pool no-commit behavior for %s', (_label, makeHand) => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { args } = setup(makeHand());
    vi.advanceTimersByTime(20000);
    expect(args.onReveal).not.toHaveBeenCalled();
    expect(args.gs.phase).toBe('HUNT_WAIT_REVEAL');
    expect(args.gs.abilityData.revCard).toBeUndefined();
  });

  it('allows a legal god card rather than restricting the pool to ordinary zone cards', () => {
    const god = { id: 'god-tsg', name: '蟾蜍之神', isGod: true, godKey: 'TSG' };
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { args } = setup([createTsathogguaSlimeCard(), god, createBlackGoatYoungCard()]);
    vi.advanceTimersByTime(20000);
    expect(args.onReveal).toHaveBeenCalledExactlyOnceWith(god, { timedOut: true });
  });

  it('does not reveal before 20 seconds and commits exactly at the deadline', () => {
    const { args } = setup([ordinary]);
    vi.advanceTimersByTime(19999);
    expect(args.onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(args.onReveal).toHaveBeenCalledTimes(1);
  });

  it('cancels the timeout through real effect cleanup after an early human choice', () => {
    const { args, renderer } = setup([ordinary]);
    vi.advanceTimersByTime(5000);
    renderer.render({ gs: { ...args.gs, phase: 'HUNT_CONFIRM', abilityData: { ...args.gs.abilityData, revCard: ordinary } } });
    vi.advanceTimersByTime(20000);
    expect(args.onReveal).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the timeout and countdown when the hook unmounts', () => {
    const { args, renderer } = setup([ordinary]);
    vi.advanceTimersByTime(5000);
    renderer.unmount();
    vi.advanceTimersByTime(20000);
    expect(args.onReveal).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the non-target peer from making an automatic reveal', () => {
    const { args } = setup([ordinary], { isLocalHuntTarget: false });
    vi.advanceTimersByTime(20000);
    expect(args.onReveal).not.toHaveBeenCalled();
  });

  it('cancels after manual submission before its animation commits HUNT_CONFIRM', () => {
    const { args, renderer } = setup([ordinary]);
    vi.advanceTimersByTime(19999);
    renderer.render({ isLocalHuntTarget: false });
    vi.advanceTimersByTime(20000);
    expect(args.gs.phase).toBe('HUNT_WAIT_REVEAL');
    expect(args.onReveal).not.toHaveBeenCalled();
  });

  it('starts a fresh deadline for a new prompt with the same hunter and target', () => {
    const { args, renderer } = setup([ordinary]);
    vi.advanceTimersByTime(5000);
    renderer.render({ gs: { ...args.gs, abilityData: { ...args.gs.abilityData, huntPromptId: 'second-hunt' } } });
    vi.advanceTimersByTime(15000);
    expect(args.onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(args.onReveal).toHaveBeenCalledExactlyOnceWith(ordinary, { timedOut: true });
  });

  it('uses the latest presentation callback without restarting the deadline', () => {
    const { args, renderer } = setup([ordinary]);
    const previous = args.onReveal;
    vi.advanceTimersByTime(5000);
    const latest = vi.fn();
    renderer.render({ onReveal: latest });
    vi.advanceTimersByTime(15000);
    expect(previous).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledExactlyOnceWith(ordinary, { timedOut: true });
  });

  it('selects the latest owned card reference from a refreshed snapshot of the same prompt', () => {
    const { args, renderer } = setup([ordinary]);
    vi.advanceTimersByTime(5000);
    const refreshedCard = { ...ordinary };
    const refreshedMe = { ...args.me, hand: [createTsathogguaSlimeCard(), refreshedCard, createBlackGoatYoungCard()] };
    renderer.render({ me: refreshedMe, gs: { ...args.gs,
      players: [refreshedMe, args.gs.players[1]],
    } });
    vi.advanceTimersByTime(14999);
    expect(args.onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(args.onReveal).toHaveBeenCalledExactlyOnceWith(refreshedCard, { timedOut: true });
    expect(args.onReveal.mock.calls[0][0]).toBe(refreshedCard);
    expect(args.onReveal.mock.calls[0][0]).not.toBe(ordinary);
  });

  it('retries a busy timeout with the latest hand without resetting the original deadline and commits once', () => {
    const onReveal = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const { args, renderer } = setup([ordinary], { onReveal });
    vi.advanceTimersByTime(19999);
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReveal).toHaveBeenCalledExactlyOnceWith(ordinary, { timedOut: true });
    const retryCard = { ...ordinary };
    renderer.render({ me: { ...args.me, hand: [retryCard] } });
    vi.advanceTimersByTime(249);
    expect(onReveal).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onReveal).toHaveBeenCalledTimes(2);
    expect(onReveal.mock.calls[1][0]).toBe(retryCard);
    expect(onReveal.mock.results.map(result => result.value)).toEqual([false, true]);
    vi.advanceTimersByTime(20000);
    expect(onReveal).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['manual submission', 'exit', 'unmount'])('cancels an owned busy retry after %s', cleanup => {
    const onReveal = vi.fn().mockReturnValue(false);
    const { renderer } = setup([ordinary], { onReveal });
    vi.advanceTimersByTime(20000);
    expect(onReveal).toHaveBeenCalledTimes(1);
    if (cleanup === 'manual submission') renderer.render({ isLocalHuntTarget: false });
    else if (cleanup === 'exit') renderer.render({ isMultiplayer: false, gs: null });
    else renderer.unmount();
    vi.advanceTimersByTime(20000);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
