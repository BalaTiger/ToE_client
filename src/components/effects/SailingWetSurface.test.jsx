import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { SailingWetSurface } from './SailingWetSurface';
import { getBattlePredecodeImages, SAILING_WET_ARTWORK, SAILING_WET_COVERAGE } from '../../constants/theme';

const hooks = vi.hoisted(() => ({}));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual,
    useRef: (...args) => (hooks.useRef || actual.useRef)(...args),
    useEffect: (...args) => (hooks.useEffect || actual.useEffect)(...args),
  };
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  delete hooks.useRef; delete hooks.useEffect;
});

function mountWetSurface(props = {}) {
  let refIndex, effectIndex;
  const animations = [];
  const nodes = Array.from({ length: 3 }, () => ({ style: {},
    displayed: { opacity: '0', maskPosition: '0% 0%, 0% 0%, 0% 0%, 0% 0%', maskImage: 'none', clipPath: 'none' },
    animate: vi.fn((frames, timing) => {
      const animation = { frames, timing, currentTime: 0, playState: 'running', cancel: vi.fn(),
        pause: vi.fn(() => { animation.playState = 'paused'; }),
        play: vi.fn(() => { animation.playState = 'running'; }) };
      animations.push(animation);
      return animation;
    }),
  }));
  const host = { querySelectorAll: () => nodes };
  const motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('window', { matchMedia: () => motion, __PUBLIC_BASE__: '/' });
  vi.stubGlobal('getComputedStyle', node => node.displayed);
  const refs = [{ current: host }], effects = [];
  hooks.useRef = initial => refs[refIndex++] ||= { current: initial };
  hooks.useEffect = (setup, deps) => {
    const index = effectIndex++;
    const previous = effects[index];
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
    previous?.cleanup?.();
    effects[index] = { deps, setup };
  };
  return {
    nodes, animations, motion,
    render(update = {}) {
      props = { surface: 'panel', ...props, ...update };
      refIndex = effectIndex = 0;
      const tree = SailingWetSurface(props);
      effects.forEach(effect => {
        if (!effect.setup) return;
        effect.cleanup = effect.setup();
        effect.setup = null;
      });
      return tree;
    },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

it('preserves each interrupted region and never re-wets an already dry middle patch', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const wet = mountWetSurface();
  wet.render();
  expect(wet.animations).toHaveLength(0);
  wet.render({ active: true });
  expect(wet.animations).toHaveLength(3);
  expect(wet.animations.map(animation => animation.id)).toEqual([
    'toe-sailing-wet-panel-main', 'toe-sailing-wet-panel-early', 'toe-sailing-wet-panel-tail',
  ]);
  const interrupted = wet.animations.map((animation, index) => {
    animation.currentTime = 1540;
    const image = animation.frames.find(frame => frame.offset * animation.timing.duration >= 950).maskImage;
    const state = { opacity: index === 1 ? 0 : .47, maskImage: image,
      maskPosition: '0% 0%, 0% 0%, 0% 0%, 44% 56%', clipPath: 'ellipse(9% 5% at 60% 50%)' };
    wet.nodes[index].displayed = state;
    return state;
  });
  wet.render({ active: false });
  expect(wet.animations).toHaveLength(5); // main + tail, no new early animation
  expect(wet.nodes[1].animate).toHaveBeenCalledOnce();
  for (const [runIndex, regionIndex] of [[3, 0], [4, 2]]) {
    const animation = wet.animations[runIndex];
    expect(animation.frames[0]).toEqual(interrupted[regionIndex]);
    expect(animation.frames[1]).toMatchObject({ opacity: 0, maskImage: interrupted[regionIndex].maskImage,
      maskPosition: interrupted[regionIndex].maskPosition });
    expect(animation.frames[1].clipPath).toContain('ellipse(0.000% 0.000%');
    expect(animation.timing.duration).toBeGreaterThan(0);
    expect(animation.timing.duration).toBeLessThan(400);
  }
  expect(wet.animations[3].timing.duration).not.toBe(wet.animations[4].timing.duration);
  wet.render({ paused: true });
  expect(wet.animations[3].pause).toHaveBeenCalledOnce();
  expect(wet.animations[4].pause).toHaveBeenCalledOnce();
  wet.unmount();
  for (const animation of wet.animations) expect(animation.cancel).toHaveBeenCalled();
});

it('pauses all three clocks without resampling shapes, times or drying boundaries', () => {
  const random = vi.spyOn(Math, 'random');
  const wet = mountWetSurface({ active: true });
  wet.render();
  const draws = random.mock.calls.length;
  wet.render({ paused: true });
  wet.render({ paused: false });
  expect(wet.animations).toHaveLength(3);
  expect(random).toHaveBeenCalledTimes(draws);
  for (const animation of wet.animations) {
    expect(animation.pause).toHaveBeenCalledOnce();
    expect(animation.play).toHaveBeenCalledOnce();
  }
  wet.unmount();
});

it('keeps only static local wetness under reduced motion, without changing a selected shape', () => {
  const random = vi.spyOn(Math, 'random');
  const wet = mountWetSurface({ active: true });
  wet.motion.matches = true;
  wet.render();
  expect(wet.animations).toHaveLength(0);
  const draws = random.mock.calls.length;
  const images = wet.nodes.map(node => node.style.maskImage);
  wet.nodes.forEach(node => {
    expect(node.style.opacity).toBe(.14);
    node.displayed = { ...node.style };
  });
  wet.motion.addEventListener.mock.calls[0][1]();
  expect(wet.nodes.map(node => node.style.maskImage)).toEqual(images);
  expect(random).toHaveBeenCalledTimes(draws);
  wet.render({ active: false });
  wet.nodes.forEach(node => expect(node.style.opacity).toBe(0));
  wet.unmount();
  expect(wet.motion.removeEventListener).toHaveBeenCalledTimes(2);
});

it('renders three registered regions with shared assets and keeps predecode URLs flat', () => {
  const random = vi.spyOn(Math, 'random');
  const panel = renderToStaticMarkup(<SailingWetSurface surface="panel"
    style={{ filter: 'grayscale(0.85) brightness(0.6)', '--toe-wet-intensity': .32 }} />);
  expect(panel.match(/class="toe-sailing-wet-piece /g)).toHaveLength(9);
  expect(panel).toContain('filter:grayscale(0.85) brightness(0.6)');
  expect(panel).toContain('--toe-wet-intensity:0.32');
  const torch = renderToStaticMarkup(<SailingWetSurface surface="torch" />);
  expect(torch.match(/class="toe-sailing-wet-piece /g)).toHaveLength(3);
  expect(torch).not.toContain('panel-wet-');
  for (const markup of [panel, torch]) {
    expect(markup.match(/data-sailing-wet-region=/g)).toHaveLength(3);
    expect(markup).toContain('data-html2canvas-ignore="true"');
    expect(markup).not.toContain('wet-film-');
    expect(markup).not.toContain('mix-blend-mode');
  }
  expect(random).not.toHaveBeenCalled();
  expect(panel).toContain(SAILING_WET_COVERAGE.panel[0]);
  expect(torch).toContain(SAILING_WET_COVERAGE.torch[0]);
  for (const path of [...Object.values(SAILING_WET_ARTWORK), ...Object.values(SAILING_WET_COVERAGE).flat()]) {
    expect(getBattlePredecodeImages('群星呼唤')).toContain(path);
    expect(getBattlePredecodeImages('地神的潜影')).not.toContain(path);
  }
});
