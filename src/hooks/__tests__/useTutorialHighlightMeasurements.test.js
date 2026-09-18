import { afterEach, describe, expect, it, vi } from 'vitest';
import { unionTutorialRects, useTutorialHighlightMeasurements } from '../useTutorialHighlightMeasurements';

const hooks = vi.hoisted(() => ({ effect: null }));
vi.mock('react', () => ({ useEffect: callback => { hooks.effect = callback; } }));
vi.mock('../../utils/dom', () => ({ _getZoomCompensatedRect: element => element?.rect }));
afterEach(() => vi.unstubAllGlobals());

const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const node = (rect, children = {}) => ({ rect, querySelector: selector => children[selector] || null, querySelectorAll: selector => children[selector] || [] });
function MountMeasurements(highlight, supplied = {}) {
  const windowEvents = {}, documentEvents = {}, observers = {};
  vi.stubGlobal('window', {
    addEventListener: (event, handler) => { windowEvents[event] = handler; },
    removeEventListener: event => { delete windowEvents[event]; },
  });
  vi.stubGlobal('document', { body: {},
    addEventListener: (event, handler) => { documentEvents[event] = handler; },
    removeEventListener: event => { delete documentEvents[event]; },
  });
  for (const kind of ['ResizeObserver', 'MutationObserver']) vi.stubGlobal(kind, class {
    constructor(callback) { this.callback = callback; observers[kind] = this; }
    observe = vi.fn();
    disconnect = vi.fn();
  });
  const targets = Object.fromEntries(['selfPanel', 'roleText', 'handArea', 'aiPanelArea', 'drawRevealKeepButton', 'godKeepHandButton', 'dodgeRollButton', 'skillButton', 'swapBlindHand', 'deckArea']
    .map(key => [key, { current: supplied[key] || null }]));
  const rects = {};
  const setRects = new Proxy({}, { get: (_, key) => update => { rects[key] = update(rects[key] ?? null); } });
  useTutorialHighlightMeasurements({ enabled: true, step: 'test', stepDef: { highlight }, targets, setRects });
  const unmount = hooks.effect();
  return { rects, targets, observers, windowEvents, documentEvents, unmount };
}

describe('tutorial highlights use actual coastal objects', () => {
  it('limits the player introduction to the portrait, title and continuous stat bars', () => {
    const self = node(box(5, 120, 180, 490), {
      '.toe-coastal-portrait': node(box(25, 128, 95, 95)),
      '.toe-self-title': node(box(30, 226, 140, 20)),
      '.toe-self-stats': node(box(20, 250, 155, 42)),
    });
    const screen = MountMeasurements('selfPanel', { selfPanel: self });
    expect(screen.rects.panel).toEqual(box(20, 128, 155, 164));
    const first = screen.rects.panel;
    screen.windowEvents.resize();
    expect(screen.rects.panel).toBe(first);
  });

  it('includes the profession beside the name and the frame-mounted skulls beside god tags', () => {
    const title = node(box(20, 200, 140, 23));
    const role = { ...node(box(20, 200, 20, 23)), closest: () => title };
    expect(MountMeasurements('roleText', { roleText: role }).rects.roleText).toEqual(title.rect);
    const opponent = node(box(300, 0, 180, 100), {
      '[data-encounter-skulls="1"]': node(box(320, 85, 30, 20)),
      '[data-player-god-status="1"]': node(box(320, 108, 100, 22)),
    });
    expect(MountMeasurements('opponentGodStatus', { aiPanelArea: node(box(250, 0, 800, 130), { '[data-pid="1"]': opponent }) }).rects.opponentGodStatus)
      .toEqual(box(320, 85, 100, 45));
  });

  it('measures actual rotated hand cards instead of the full hand-and-actions container', () => {
    const hand = node(box(0, 260, 844, 130), {
      '[data-self-hand-card]': [node(box(160, 210, 110, 185)), node(box(250, 204, 110, 180))],
    });
    expect(MountMeasurements('handArea', { handArea: hand }).rects.handArea).toEqual(box(160, 204, 200, 191));
  });

  it('picks up a late flip decision mount, follows its final position and clears a removed control', () => {
    const screen = MountMeasurements('drawRevealKeepButton');
    expect(screen.rects.drawRevealKeepButton).toBeNull();
    screen.targets.drawRevealKeepButton.current = node(box(300, 270, 120, 48));
    screen.observers.MutationObserver.callback();
    expect(screen.rects.drawRevealKeepButton).toEqual(box(300, 270, 120, 48));
    screen.targets.drawRevealKeepButton.current.rect = box(300, 288, 120, 48);
    screen.documentEvents.animationend();
    expect(screen.rects.drawRevealKeepButton.top).toBe(288);
    screen.targets.drawRevealKeepButton.current = null;
    screen.observers.MutationObserver.callback();
    expect(screen.rects.drawRevealKeepButton).toBeNull();
    screen.unmount();
    expect(screen.observers.ResizeObserver.disconnect).toHaveBeenCalledOnce();
    expect(screen.observers.MutationObserver.disconnect).toHaveBeenCalledOnce();
    expect(screen.documentEvents).toEqual({});
    expect(screen.windowEvents).toEqual({});
  });

  it('ignores hidden zero-sized elements when forming a spotlight', () => {
    expect(unionTutorialRects([null, box(0, 0, 0, 0), box(100, 80, 30, 12)])).toEqual(box(100, 80, 30, 12));
  });
});
