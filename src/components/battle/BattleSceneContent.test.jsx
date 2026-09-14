import { afterEach, describe, expect, it, vi } from 'vitest';
import { Children } from 'react';
import { BattleSceneContent } from './BattleSceneContent';
import { BattleScreen } from './BattleScreen';

const hooks = vi.hoisted(() => ({ current: null }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal(),
  useRef: (...args) => hooks.current.useRef(...args),
  useEffect: (...args) => hooks.current.useEffect(...args),
  useState: (...args) => hooks.current.useState(...args),
  useLayoutEffect: (...args) => hooks.current.useLayoutEffect(...args),
}));
vi.mock('react-dom', () => ({ createPortal: children => children }));
vi.mock('../../ui/UiAppearance', () => ({ useUiAppearance: () => ({ appearance: { id: 'arcane-table', battleLayout: 'arch' } }) }));

// Commit a single host element in the project's node test environment, retaining
// hook identity and running effect cleanup before setup on subsequent renders.
function createRenderer(element) {
  const slots = [];
  let cursor = 0;
  let mounted = true;
  const runtime = {
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useEffect(setup, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.length !== previous.deps.length || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, setup, cleanup: previous?.cleanup, pending: true };
      }
    },
  };
  return {
    render(props) {
      if (!mounted) throw new Error('Cannot render an unmounted component');
      cursor = 0;
      hooks.current = runtime;
      const output = BattleSceneContent(props);
      output.props.ref.current = element;
      const pending = slots.filter(slot => slot.pending);
      pending.forEach(slot => slot.cleanup?.());
      pending.forEach(slot => {
        slot.pending = false;
        slot.cleanup = slot.setup();
      });
      return output;
    },
    unmount() {
      if (!mounted) return;
      mounted = false;
      slots.forEach(slot => slot.cleanup?.());
    },
  };
}

function makeShake(event = { type: 'DAMAGE' }, delay = 0) {
  return {
    event,
    keyframes: [{ transform: 'translateX(0)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
    timing: { duration: 360, delay, easing: 'ease-out', fill: 'none' },
  };
}

function makeElement() {
  const animations = [];
  const element = {
    animate: vi.fn((_keyframes, timing) => {
      const end = timing.delay + timing.duration;
      const animation = {
        currentTime: 0,
        playState: 'running',
        pause: vi.fn(() => { animation.playState = 'paused'; }),
        play: vi.fn(() => {
          // WAAPI play auto-rewinds an animation whose current time is at its end.
          if (animation.currentTime >= end) animation.currentTime = 0;
          animation.playState = 'running';
        }),
        cancel: vi.fn(() => {
          animation.currentTime = null;
          animation.playState = 'idle';
        }),
        advance(ms) {
          if (animation.playState !== 'running') return;
          animation.currentTime = Math.min(end, animation.currentTime + ms);
          if (animation.currentTime === end) animation.playState = 'finished';
        },
      };
      animations.push(animation);
      return animation;
    }),
  };
  return { element, animations };
}

let renderer;
afterEach(() => {
  renderer?.unmount();
  renderer = null;
  hooks.current = null;
  vi.unstubAllGlobals();
});

describe('BattleScreen central space', () => {
  it('reclaims and restores desktop space from layout heights while leaving mobile layouts intact', () => {
    const hand = {};
    const root = {};
    const scene = { offsetHeight: 938, querySelector: () => hand };
    const row = { offsetHeight: 248, closest: selector => selector === '.toe-battle-content' ? scene : root };
    const ref = { current: row };
    let height = 248;
    let setup;
    let onResize;
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    hooks.current = {
      useRef: () => ref,
      useState: () => [height, updater => { height = updater(height); }],
      useLayoutEffect: effect => { setup = effect; },
    };
    vi.stubGlobal('window', { innerHeight: 900, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('document', { body: {} });
    vi.stubGlobal('getComputedStyle', () => ({ paddingTop: '8px', paddingBottom: '8px' }));
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { onResize = callback; return observer; }
    });
    const props = {
      scaleRatio: 1, compactBoardScaleRatio: 1, middleRowHeight: 248,
      isMobile: false, isMobileLandscape: false, baseFontSizes: { body: 11 },
      gs: { players: [], deck: [], inspectionDeck: [] }, visualPlayers: [], visualDiscard: [],
      phase: 'ACTION', mobileCssPx: value => value, boardCssPx: value => value,
    };
    const findRow = node => {
      if (!node?.props) return undefined;
      if ('data-battle-middle-row' in node.props) return node;
      return Children.toArray([node.props.children, node.props.middle]).map(findRow).find(Boolean);
    };
    const heights = overrides => Children.toArray(findRow(BattleScreen({ ...props, ...overrides })).props.children)
      .map(child => child.props.middleRowHeight ?? child.props.baseHeight);

    expect(heights()).toEqual([248, 248, 248]);
    const cleanup = setup();
    expect(height).toBe(192);
    expect(heights()).toEqual([192, 192, 192]);
    expect(observer.observe.mock.calls.map(([element]) => element)).toEqual([scene, row, hand]);

    // The row's own resize leaves the remaining-content budget unchanged.
    row.offsetHeight = 192;
    scene.offsetHeight = 882;
    onResize();
    expect(height).toBe(192);
    scene.offsetHeight += .2;
    onResize();
    expect(height).toBe(192);
    onResize();
    expect(height).toBe(192);

    scene.offsetHeight = 984;
    onResize();
    expect(height).toBe(113);
    row.offsetHeight = 113;
    scene.offsetHeight = 703;
    onResize();
    expect(height).toBe(248);
    expect(heights()).toEqual([248, 248, 248]);

    // A viewport change can release space even when the hand itself is unchanged.
    window.innerHeight = 700;
    onResize();
    expect(height).toBe(113);
    window.innerHeight = 900;
    onResize();
    expect(height).toBe(248);
    cleanup();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', onResize);

    for (const mode of [{ isMobile: true, middleRowHeight: 292 }, { isMobileLandscape: true, middleRowHeight: 150 }]) {
      const calls = observer.observe.mock.calls.length;
      expect(heights(mode)).toEqual(Array(3).fill(mode.middleRowHeight));
      expect(setup()).toBeUndefined();
      expect(observer.observe).toHaveBeenCalledTimes(calls);
    }
  });
});

describe('BattleSceneContent shake playback', () => {
  it('attaches the shake only to its content element and forwards layout and children', () => {
    const { element, animations } = makeElement();
    renderer = createRenderer(element);
    const shake = makeShake();
    const style = { width: '100%', zoom: 0.8 };
    const children = 'battle board';

    const output = renderer.render({ shake, style, children });

    expect(output.type).toBe('div');
    expect(output.props).toMatchObject({ className: 'toe-battle-content', style, children });
    expect(output.props.style).toBe(style);
    expect(output.props.ref.current).toBe(element);
    expect(element.animate).toHaveBeenCalledExactlyOnceWith(shake.keyframes, shake.timing);
    expect(animations[0].play).not.toHaveBeenCalled();
  });

  it('does not replay the current event when unrelated props rerender', () => {
    const { element, animations } = makeElement();
    renderer = createRenderer(element);
    const shake = makeShake();
    renderer.render({ shake, children: 'first' });
    animations[0].advance(100);

    renderer.render({ shake, children: 'updated', style: { zoom: 0.6 } });

    expect(element.animate).toHaveBeenCalledTimes(1);
    expect(animations[0].currentTime).toBe(100);
    expect(animations[0].cancel).not.toHaveBeenCalled();
    expect(animations[0].play).not.toHaveBeenCalled();
  });

  it('plays adjacent events of the same type separately and cancels the departing event first', () => {
    const { element, animations } = makeElement();
    renderer = createRenderer(element);
    const first = makeShake({ type: 'DAMAGE', target: 1 });
    const second = makeShake({ type: 'DAMAGE', target: 1 });
    renderer.render({ shake: first });
    animations[0].advance(75);

    renderer.render({ shake: second });

    expect(element.animate).toHaveBeenCalledTimes(2);
    expect(animations[0].cancel).toHaveBeenCalledTimes(1);
    expect(animations[0].cancel.mock.invocationCallOrder[0]).toBeLessThan(element.animate.mock.invocationCallOrder[1]);
    expect(animations[1].currentTime).toBe(0);
    expect(animations[1].playState).toBe('running');
  });

  it('cancels on event replacement, clearing, and unmount without retaining an old shake', () => {
    const { element, animations } = makeElement();
    renderer = createRenderer(element);
    renderer.render({ shake: makeShake() });
    renderer.render({ shake: makeShake({ type: 'DEATH' }) });
    expect(animations[0].cancel).toHaveBeenCalledTimes(1);

    renderer.render({ shake: null });
    expect(animations[1].cancel).toHaveBeenCalledTimes(1);
    renderer.render({ shake: null, paused: true });
    renderer.render({ shake: null, paused: false });
    expect(animations[1].play).not.toHaveBeenCalled();
    expect(animations[1].pause).not.toHaveBeenCalled();

    renderer.render({ shake: makeShake() });
    renderer.unmount();
    expect(element.animate).toHaveBeenCalledTimes(3);
    expect(animations.map(animation => animation.cancel.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it.each([0, 120])('preserves elapsed time when paused with a %ims impact delay', delay => {
    const { element, animations } = makeElement();
    renderer = createRenderer(element);
    const shake = makeShake(undefined, delay);
    renderer.render({ shake });
    const animation = animations[0];
    animation.advance(30);

    renderer.render({ shake, paused: true });
    animation.advance(5000);
    expect(animation.pause).toHaveBeenCalledTimes(1);
    expect(animation.currentTime).toBe(30);
    renderer.render({ shake, paused: false });
    expect(animation.play).toHaveBeenCalledTimes(1);
    expect(animation.currentTime).toBe(30);
    animation.advance(20);
    expect(animation.currentTime).toBe(50);
    expect(element.animate).toHaveBeenCalledTimes(1);
    expect(animation.cancel).not.toHaveBeenCalled();
  });

  it('immediately pauses a newly requested event while playback is already paused', () => {
    const { element, animations } = makeElement();
    renderer = createRenderer(element);
    renderer.render({ shake: makeShake(), paused: true });
    expect(animations[0].playState).toBe('paused');
    const next = makeShake({ type: 'GUILLOTINE' }, 120);

    renderer.render({ shake: next, paused: true });
    const animation = animations[1];
    animation.advance(5000);
    expect(animations[0].cancel).toHaveBeenCalledTimes(1);
    expect(animation.pause).toHaveBeenCalledTimes(1);
    expect(animation.currentTime).toBe(0);
    renderer.render({ shake: next, paused: false });
    expect(animation.play).toHaveBeenCalledTimes(1);
    expect(animation.playState).toBe('running');
    expect(element.animate).toHaveBeenCalledTimes(2);
  });

  it('does not replay a completed shake on rerender or a later pause/resume cycle', () => {
    const { element, animations } = makeElement();
    renderer = createRenderer(element);
    const shake = makeShake();
    renderer.render({ shake });
    const animation = animations[0];
    animation.advance(1000);
    expect(animation.playState).toBe('finished');

    renderer.render({ shake, children: 'updated' });
    renderer.render({ shake, paused: true });
    renderer.render({ shake, paused: false });

    expect(animation.play).not.toHaveBeenCalled();
    expect(animation.playState).toBe('finished');
    expect(animation.currentTime).toBe(shake.timing.duration);
    expect(element.animate).toHaveBeenCalledTimes(1);
  });

  it('renders and changes events safely when the element has no Web Animations support', () => {
    renderer = createRenderer({});
    expect(() => {
      renderer.render({ shake: makeShake(), paused: true });
      renderer.render({ shake: makeShake({ type: 'DEATH' }) });
      renderer.render({ shake: null });
      renderer.unmount();
    }).not.toThrow();
  });
});
