import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EarthquakeOverlay } from './EarthquakeOverlay';
import { BuryToDeckOverlay, DiscardMoveOverlay, ZhuHideCardOverlay } from './MoveOverlays';
import { CardBackLayer } from '../cards/AnimatedCardBack';
import { MiniCardFace } from '../cards';
import { getPileCardAnchor, getPlayerHandCardAnchor } from '../../utils/dom';
import { EARTHQUAKE_ANIMATION_STYLES } from './earthquakeStyles';

vi.mock('../../utils/dom', async importOriginal => ({ ...await importOriginal(),
  getPileCardAnchor: vi.fn(), getPlayerHandCardAnchor: vi.fn(),
}));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function find(root, predicate) {
  if (!root || typeof root !== 'object') return null;
  if (predicate(root)) return root;
  return React.Children.toArray(root.props?.children).map(child => find(child, predicate)).find(Boolean);
}

describe('discard destinations preserve card proportions and explicit destruction', () => {
  it.each([false, true])('ZHU uses the original top-to-bottom path and renders hidden=%s safely', hidden => {
    vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 800 });
    getPileCardAnchor.mockReturnValue({ x: 800, y: 200, width: 80, height: 80 * 590 / 392 });
    let effect, style;
    vi.spyOn(React, 'useState').mockImplementation(() => [style, value => { style = value; }]);
    vi.spyOn(React, 'useEffect').mockImplementation(callback => { effect = callback; });
    const props = { anim: { type: 'ZHU_HIDE_CARD', card: hidden ? { _back: true } : { id: 'authorized', letter: 'A', number: 1 } }, expansionKey: 'coastal' };
    ZhuHideCardOverlay(props);
    effect();
    const rendered = ZhuHideCardOverlay(props);
    const flight = find(rendered, item => item.props?.style?.animation?.startsWith('zhuHideCardPath'));
    expect(flight.props.style.height / flight.props.style.width).toBeCloseTo(590 / 392);
    expect(find(rendered, item => item.type === CardBackLayer)?.props.expansionKey).toBe(hidden ? 'coastal' : undefined);
    expect(!!find(rendered, item => item.type === MiniCardFace)).toBe(!hidden);
  });

  it('burial retains the original hand-to-deck path and a card back even for its authorized owner', () => {
    vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 800 });
    getPlayerHandCardAnchor.mockReturnValue({ x: 200, y: 600, width: 80, height: 80 * 590 / 392 });
    getPileCardAnchor.mockReturnValue({ x: 800, y: 200, width: 50, height: 50 * 590 / 392 });
    let effect, style;
    vi.spyOn(React, 'useState').mockImplementation(() => [style, value => { style = value; }]);
    vi.spyOn(React, 'useEffect').mockImplementation(callback => { effect = callback; });
    const props = { anim: { type: 'BURY_TO_DECK', fromPid: 1, card: { id: 'private-owner-card' } } };
    BuryToDeckOverlay(props);
    effect();
    const rendered = BuryToDeckOverlay(props);
    expect(getPlayerHandCardAnchor).toHaveBeenCalledWith(1, props.anim.card);
    const flight = find(rendered, item => item.props?.style?.animation?.startsWith('buryToDeckPath'));
    expect(flight.props.style.height / flight.props.style.width).toBeCloseTo(590 / 392);
    expect(find(rendered, item => item.type === CardBackLayer)).toBeTruthy();
    expect(find(rendered, item => item.type === MiniCardFace)).toBeFalsy();
  });

  it.each(['discard', 'destroyed'])('earthquake renders %s at its actual destination', destination => {
    vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 800 });
    getPlayerHandCardAnchor.mockReturnValue({ x: 200, y: 600, width: 80, rotation: 12 });
    getPileCardAnchor.mockReturnValue({ x: 600, y: 300, width: 50 });
    let effect, style;
    vi.spyOn(React, 'useState').mockImplementation(() => [style, value => { style = value; }]);
    vi.spyOn(React, 'useEffect').mockImplementation(callback => { effect = callback; });
    const event = { playerIndex: 1, card: { id: 'revealed', letter: 'A', number: 1 }, destination, delayMs: 420, durationMs: 620 };
    const tree = EarthquakeOverlay({ anim: { discardEvents: [event] } });
    const child = find(tree, item => typeof item.type === 'function' && item.type.name === 'EarthquakeDiscardCard');
    child.type(child.props);
    effect();
    const rendered = child.type(child.props);
    expect(rendered.props.style.aspectRatio).toBe('392 / 590');
    expect(rendered.props.style.height / rendered.props.style.width).toBeCloseTo(590 / 392);
    expect(rendered.props.style.animationName).toBe(destination === 'destroyed' ? 'authorityCardDissolve' : 'earthquakeDiscardFly');
    expect(rendered.props.style['--tx']).toBe(destination === 'destroyed' ? '0px' : '400px');
    expect(getPileCardAnchor).toHaveBeenCalledTimes(destination === 'destroyed' ? 0 : 1);
  });

  it('a destroyed ordinary card dissolves in place without measuring the discard pile', () => {
    vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 800 });
    getPlayerHandCardAnchor.mockReturnValue({ x: 200, y: 600, width: 80 });
    let effect, style;
    vi.spyOn(React, 'useState').mockImplementationOnce(() => [{}, value => { style = value; }])
      .mockImplementationOnce(() => [[], vi.fn()]);
    vi.spyOn(React, 'useEffect').mockImplementation(callback => { effect = callback; });
    DiscardMoveOverlay({ anim: { type: 'DISCARD', destination: 'destroyed', targetPid: 1, card: { id: 'public', letter: 'A' } } });
    effect();
    expect(style.animation).toContain('authorityCardDissolve');
    expect(style['--tx']).toBe('0px');
    expect(style['--ty']).toBe('0px');
    expect(style.aspectRatio).toBe('392 / 590');
    expect(getPileCardAnchor).not.toHaveBeenCalled();
    expect(EARTHQUAKE_ANIMATION_STYLES).toContain('@keyframes authorityCardDissolve');
  });
});
