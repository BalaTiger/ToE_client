import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerPanel } from '../board';
import { SelfPlayerPanel } from '../battle/SelfPlayerPanel';
import { GodHighlightBurst } from './GodHighlightBurst';
import { ROLE_TREASURE } from '../../game/coreUtils';
import { RINFO } from '../../game/setup';

vi.mock('../../ui/UiAppearance', () => ({ useUiAppearance: () => ({ appearance: { battleLayout: 'coastal' } }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function find(root, type) {
  if (!root || typeof root !== 'object') return null;
  if (root.type === type) return root;
  return React.Children.toArray(root.props?.children).map(child => find(child, type)).find(Boolean);
}

describe('authority god highlight uses the original visible panel renderer', () => {
  it.each([0, 1])('routes the public god cue through panel %s and original proportional art', seat => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    vi.spyOn(React, 'useState').mockImplementation(initial => [typeof initial === 'function' ? initial() : initial, () => {}]);
    vi.spyOn(React, 'useRef').mockReturnValue({ current: null });
    vi.spyOn(React, 'useLayoutEffect').mockImplementation(() => {});
    const player = { id: seat, role: ROLE_TREASURE, name: 'Known player', hp: 8, san: 7, godName: 'CTH', godLevel: 2, hand: [], zoneCards: [] };
    const cue = { key: 'public-event:faith', godKey: 'CTH' };
    const panel = seat === 0 ? SelfPlayerPanel({ player, ri: RINFO[ROLE_TREASURE], phase: 'ACTION',
      displayStats: [{ hp: 8, san: 7 }], boardCssPx: value => value, middleRowHeight: 180,
      fontSizes: { tiny: 9, small: 10, body: 12 }, boardScaleRatio: 1, vw: 1280,
      hitIndices: [], sanHitIndices: [], hpHealIndices: [], sanHealIndices: [], guillotinedPids: new Set(),
      godHighlightPanelBursts: { 0: cue } })
      : PlayerPanel({ player, playerIndex: 1, displayStats: [null, { hp: 8, san: 7 }],
        scaleRatio: 1, viewportWidth: 1280, godHighlightBurst: cue });
    const burst = find(panel, GodHighlightBurst);
    expect(burst).toBeTruthy();
    expect(burst.props).toMatchObject({ godKey: 'CTH', panel: true, fit: 'contain' });
    expect(burst.props.durationMs).toBeGreaterThanOrEqual(920);
    // Advance only the renderer's local playing flag, leaving its real image,
    // CSS timing and aspect ratio intact for a visible markup assertion.
    vi.spyOn(React, 'useState').mockReturnValue([true, () => {}]);
    const markup = renderToStaticMarkup(<GodHighlightBurst {...burst.props} />);
    expect(markup).toContain('toe-god-highlight-burst');
    expect(markup).toContain('/img/card/highlight/cth.webp');
    expect(markup).toContain('aspect-ratio:4 / 3');
    expect(markup).toContain(`toeGodHighlightBurstLayer ${burst.props.durationMs}ms`);
    expect(markup).toContain('object-fit:contain');
  });
});
