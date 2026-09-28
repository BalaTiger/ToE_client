import { Children } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { FaithScrollRegion } from './FaithScrollRegion';

const runtime = vi.hoisted(() => ({ edges: null, effect: null, effectDeps: null, callback: null, refs: [], refIndex: 0 }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal(),
  useRef: () => runtime.refs[runtime.refIndex++] ||= { current: null },
  useState: initial => [runtime.edges ?? initial, update => { runtime.edges = update(runtime.edges ?? initial); }],
  useCallback: callback => runtime.callback ||= callback,
  useLayoutEffect: (setup, deps) => {
    if (!runtime.effectDeps || deps.some((dep, index) => dep !== runtime.effectDeps[index])) runtime.effect = setup;
    runtime.effectDeps = deps;
  },
}));
afterEach(() => vi.unstubAllGlobals());

function render(enabled = true, resetKey = 'CTH:1') {
  runtime.refIndex = 0;
  return FaithScrollRegion({ enabled, resetKey, children: <div data-god-power-badge="0">神力说明</div> });
}
function buttons(tree) { return Children.toArray(tree.props.children).filter(child => child.type === 'button'); }

it('tracks hidden content in each direction, preserves native scrolling, and observes viewport plus content changes', () => {
  runtime.edges = null;
  runtime.refs = [];
  runtime.callback = null;
  runtime.effectDeps = null;
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  let resize;
  vi.stubGlobal('ResizeObserver', class { constructor(callback) { resize = callback; return observer; } });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });

  const initial = render();
  const viewportNode = Children.toArray(initial.props.children)[0];
  const viewport = { clientHeight: 100, scrollHeight: 300, scrollTop: 0, scrollBy: vi.fn() };
  viewportNode.props.ref.current = viewport;
  const content = {};
  viewportNode.props.children.props.ref.current = content;
  expect(viewportNode.props.children.props.className).toBe('toe-faith-status');
  expect(viewportNode.props.children.props.children.props['data-god-power-badge']).toBe('0');
  const cleanup = runtime.effect();
  expect(observer.observe.mock.calls).toEqual([[viewport], [content]]);
  expect(buttons(render()).map(button => button.props['data-direction'])).toEqual(['down']);
  const event = { stopPropagation: vi.fn() };
  buttons(render())[0].props.onClick(event);
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(viewport.scrollBy).toHaveBeenCalledWith({ top: 65, behavior: 'smooth' });

  viewport.scrollTop = 50;
  viewportNode.props.onScroll();
  expect(buttons(render()).map(button => button.props['data-direction'])).toEqual(['up', 'down']);
  viewport.scrollTop = 200;
  viewportNode.props.onScroll();
  expect(buttons(render()).map(button => button.props['data-direction'])).toEqual(['up']);

  viewport.scrollTop = 0;
  viewport.scrollHeight = 80;
  resize();
  expect(buttons(render())).toHaveLength(0);
  viewport.scrollHeight = 400;
  resize();
  expect(buttons(render()).map(button => button.props['data-direction'])).toEqual(['down']);
  cleanup();
  expect(observer.disconnect).toHaveBeenCalledOnce();

  const classic = render(false);
  expect(classic.props.className).toBe('toe-faith-status');
  expect(classic.props.children.props['data-god-power-badge']).toBe('0');
});

it('returns to the new faith title on god or level changes but keeps position through ordinary status updates', () => {
  runtime.edges = null;
  runtime.refs = [];
  runtime.callback = null;
  runtime.effectDeps = null;
  let resize;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  const viewportNode = Children.toArray(render().props.children)[0];
  const viewport = { clientHeight: 100, scrollHeight: 300, scrollTop: 90 };
  viewportNode.props.ref.current = viewport;
  viewportNode.props.children.props.ref.current = {};
  runtime.effect();
  expect(viewport.scrollTop).toBe(0);

  viewport.scrollTop = 90;
  const initialEffect = runtime.effect;
  render(); // New child content, same god and level.
  expect(runtime.effect).toBe(initialEffect);
  viewport.scrollHeight = 340;
  resize();
  expect(viewport.scrollTop).toBe(90);

  for (const key of ['CTH:2', 'ZHU:2']) {
    viewport.scrollTop = 90;
    render(true, key);
    runtime.effect();
    expect(viewport.scrollTop).toBe(0);
    expect(buttons(render(true, key)).map(button => button.props['data-direction'])).toEqual(['down']);
  }
});
