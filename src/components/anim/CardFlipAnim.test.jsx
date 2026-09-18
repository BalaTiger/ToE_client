import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CardFlipAnim } from './CardFlipAnim';

vi.mock('../../hooks/useWindowSize', () => ({ useWindowSize: () => ({ w: 1280, h: 720 }) }));
vi.mock('../../utils/dom', () => ({
  captureDecisionCardAnchors: vi.fn(),
  getCardRevealMetrics: () => ({ x: 640, y: 360, width: 225, height: 339, scale: 1 }),
  getPileCardAnchor: () => ({ x: 400, y: 300, width: 100 }),
  getPlayerHandCardAnchor: () => ({ x: 600, y: 650, width: 160 }),
  getRevealCardAnchor: () => ({ x: 640, y: 360, width: 225 }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountFlip(props) {
  const state = [], refs = [], effects = [];
  let stateIndex, refIndex, effectIndex;
  vi.spyOn(React, 'useState').mockImplementation(initial => {
    const index = stateIndex++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = value; }];
  });
  vi.spyOn(React, 'useRef').mockImplementation(initial => refs[refIndex++] ||= { current: initial });
  vi.spyOn(React, 'useEffect').mockImplementation((setup, deps) => {
    const index = effectIndex++;
    const previous = effects[index];
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
    previous?.cleanup?.();
    effects[index] = { deps, setup };
  });
  vi.spyOn(React, 'useLayoutEffect').mockImplementation(() => {});
  return {
    render(update = {}) {
      props = { ...props, ...update };
      stateIndex = refIndex = effectIndex = 0;
      const tree = CardFlipAnim(props);
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

it('shows decisions after 850ms of the central flip, never during deck travel, without settling the moving card', () => {
  const flip = mountFlip({ card: { id: 'area', isZone: true }, earlyActions: true, children: <button>收入手牌</button> });
  expect(flip.render().props['data-card-reveal-actions-ready']).toBeUndefined();
  vi.advanceTimersByTime(650);
  expect(flip.render().props['data-card-reveal-actions-ready']).toBeUndefined();
  vi.advanceTimersByTime(849);
  expect(flip.render().props['data-card-reveal-actions-ready']).toBeUndefined();
  vi.advanceTimersByTime(1);
  const ready = flip.render();
  expect(ready.props['data-card-reveal-actions-ready']).toBe('true');
  expect(ready.props['data-card-reveal-settled']).toBeUndefined();
  const card = React.Children.toArray(ready.props.children).find(child => child.props['data-card-reveal'] === true);
  expect(card.props.style.animation).toContain('cardRise 1.2s');
  expect(card.props.children[0].props.style.animation).toContain('cardFlip 1.2s');
  vi.advanceTimersByTime(400);
  expect(vi.getTimerCount()).toBe(0);
  expect(flip.render().props['data-card-reveal-settled']).toBeUndefined();
  flip.unmount();
});

it('lets god decisions appear before the longer highlight ends and cancels residual timers on unmount', () => {
  const flip = mountFlip({ card: { id: 'god', isGod: true }, skipTravel: true, earlyActions: true, children: <button>信仰</button> });
  flip.render();
  vi.advanceTimersByTime(850);
  expect(flip.render().props['data-card-reveal-actions-ready']).toBe('true');
  flip.unmount();
  vi.advanceTimersByTime(3000);
  expect(vi.getTimerCount()).toBe(0);
});

it('shows a restored settled decision immediately without arming reveal timers', () => {
  const flip = mountFlip({ card: { id: 'area', isZone: true }, settled: true, earlyActions: true, children: <button>弃置此牌</button> });
  expect(flip.render().props['data-card-reveal-actions-ready']).toBe('true');
  expect(vi.getTimerCount()).toBe(0);
  flip.unmount();
});
