import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TsathogguaSlimePopOverlay } from './MoveOverlays';
import { getCardElementAnchor, getPlayerHandCardAnchor } from '../../utils/dom';

vi.mock('../../utils/dom', async importOriginal => ({
  ...await importOriginal(),
  getCardElementAnchor: vi.fn(),
  getPlayerHandCardAnchor: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('slime pop on collapsed opponent panels', () => {
  it.each(['unmounted', 'hidden'])('uses the visible hand badge when the card is %s', state => {
    const element = state === 'hidden' ? { setAttribute: vi.fn(), style: { setProperty: vi.fn() } } : null;
    vi.stubGlobal('document', { querySelector: () => element });
    vi.stubGlobal('window', {});
    getCardElementAnchor.mockReturnValue(null);
    getPlayerHandCardAnchor.mockReturnValue({ x: 540, y: 58, width: 24, height: 36 });
    const setTargets = vi.fn();
    let layoutEffect;
    vi.spyOn(React, 'useState').mockReturnValue([null, setTargets]);
    vi.spyOn(React, 'useLayoutEffect').mockImplementation(effect => { layoutEffect = effect; });
    const card = { id: 'slime-1' };

    TsathogguaSlimePopOverlay({ anim: { targetPid: 4, cards: [card] } });
    expect(() => layoutEffect()).not.toThrow();

    expect(getPlayerHandCardAnchor).toHaveBeenCalledWith(4);
    expect(setTargets).toHaveBeenCalledWith([{ card, x: 540, y: 58, width: 24, height: 36, anchored: false }]);
    if (element) expect(element.setAttribute).not.toHaveBeenCalled();
  });
});
