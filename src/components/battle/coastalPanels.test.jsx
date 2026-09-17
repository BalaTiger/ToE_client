import React, { Children } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerPanel, PileDisplay, CoastalPortrait } from '../board';
import { SelfPlayerPanel } from './SelfPlayerPanel';

const appearance = vi.hoisted(() => ({ battleLayout: 'coastal' }));
vi.mock('../../ui/UiAppearance', () => ({ useUiAppearance: () => ({ appearance }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); appearance.battleLayout = 'coastal'; });

describe('coastal panel presentation', () => {
  it('keeps hidden opponent roles anonymous and reads presentation stats', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const props = {
      player: { role: '邪祀者', name: '旅者', hp: 10, san: 10, hand: [1, 2, 3, 4].map(id => ({ id })), zoneCards: [] },
      playerIndex: 1, displayStats: [null, { hp: 7, san: 5 }], scaleRatio: 1, viewportWidth: 1280,
    };
    const hidden = renderToStaticMarkup(<PlayerPanel {...props} />);
    expect(hidden).toContain('portrait-1-gray.webp');
    expect(hidden).toContain('toe-coastal-portrait-framed');
    expect(hidden).not.toContain('邪祀者');
    const san = hidden.slice(hidden.indexOf('data-stat-label="SAN"'), hidden.indexOf('toe-opponent-zones'));
    expect(san).toContain('>5</span>');
    expect(san).toContain('left:60%');
    expect(san).not.toContain('>6<');
    expect(hidden.match(/aspect-ratio:392\s*\/\s*590/g)).toHaveLength(4);
    const publicRole = renderToStaticMarkup(<PlayerPanel {...props} player={{ ...props.player, roleRevealed: true }} />);
    expect(publicRole).toContain('portrait-1-gray.webp');
    expect(publicRole).toContain('aria-label="邪祀者"');
    expect(publicRole).toMatch(/class="toe-opponent-role"[^>]*>[^<]*邪祀者<\/span>/);
    expect(publicRole).toContain('--toe-role-color:');
    const otherHiddenRole = renderToStaticMarkup(<PlayerPanel {...props} player={{ ...props.player, role: '追猎者' }} />);
    expect(otherHiddenRole.match(/src="([^"]*portrait-[^"]+)"/)[1]).toBe(hidden.match(/src="([^"]*portrait-[^"]+)"/)[1]);
    expect(renderToStaticMarkup(<CoastalPortrait playerIndex={5} />)).toContain('portrait-1.webp');
    const derivative = renderToStaticMarkup(<PlayerPanel {...props} player={{ ...props.player, hand: [
      { id: 'goat', isBlackGoatYoung: true, name: '黑山羊幼仔', type: 'blackGoatYoung' },
      { id: 'slime', isTsathogguaSlime: true, name: '撒托古亚黏液', type: 'tsathogguaSlime' },
      { id: 'secret', name: '不可公开的普通牌' },
    ] }} />);
    expect(derivative).toContain('cardbg_token.png');
    expect(derivative).toContain('黑山羊幼仔');
    expect(derivative).toContain('撒托古亚黏液');
    expect(derivative).toContain('data-player-hand-card-id="goat"');
    expect(derivative).toContain('data-player-hand-card-id="slime"');
    expect(derivative).toContain('data-player-hand-card-id="back-1-2"');
    expect(derivative).not.toContain('不可公开的普通牌');
  });

  it.each([false, true])('separates pendants from the frame without losing card selection (revealed: %s)', showFaceUp => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    vi.spyOn(React, 'useRef').mockReturnValue({ current: null });
    vi.spyOn(React, 'useState').mockImplementation(initial => [initial, () => {}]);
    vi.spyOn(React, 'useLayoutEffect').mockImplementation(() => {});
    const onSelect = vi.fn(), onCardSelect = vi.fn();
    const panel = PlayerPanel({
      player: { role: '寻宝者', name: '旅者', hp: 10, san: 10, godName: 'CTH', godLevel: 2, hand: [{ id: 'first' }, { id: 'second' }], zoneCards: [] },
      playerIndex: 1, scaleRatio: 1, viewportWidth: 1200, isSelectable: true, onSelect, onCardSelect, showFaceUp,
    });
    const children = Children.toArray(panel.props.children);
    const core = children.find(child => child.props.className === 'toe-opponent-core');
    const pendants = children.find(child => child.props.className === 'toe-opponent-pendants');
    expect(core).toBeDefined();
    expect(pendants).toBeDefined();
    expect(children.indexOf(pendants)).toBeGreaterThan(children.indexOf(core));
    expect(panel.props['data-death-panel']).toBe(1);
    const hand = Children.toArray(core.props.children).find(child => child.props['data-player-hand-strip'] === 1);
    expect(hand.props.ref).toEqual({ current: null });
    const cards = Children.toArray(hand.props.children);
    expect(cards.map(card => card.props['data-player-hand-card-id'])).toEqual(showFaceUp ? ['first', 'second'] : ['back-1-0', 'back-1-1']);
    panel.props.onClick();
    cards[1].props.children.props.onClick();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onCardSelect).toHaveBeenCalledWith(1);
  });

  it('keeps status and zone-card anchors beneath only the coastal frame', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const props = {
      player: {
        role: '寻宝者', name: '旅者', hp: 10, san: 10, hand: [],
        godName: 'CTH', godLevel: 2, godEncounters: 8, godEncounterCount: 16, etherealizeStacks: 2, poisonStacks: 3, isResting: true,
        zoneCards: [{ id: 'visible-zone', type: 'blankZone', name: '空白区域牌', isZone: true }],
      },
      playerIndex: 1, scaleRatio: 1, viewportWidth: 1200,
    };
    const coastal = renderToStaticMarkup(<PlayerPanel {...props} />);
    const [frame, pendants] = coastal.split('<div class="toe-opponent-pendants">');
    expect(pendants).toBeDefined();
    expect(frame).toContain('data-player-hand-strip="1"');
    expect(frame).not.toContain('data-player-god-status');
    expect(frame).not.toContain('data-resting-marker');
    expect(frame).not.toContain('data-rendered-card-id="visible-zone"');
    expect(pendants).toContain('data-player-god-status="1"');
    expect(pendants).toContain('data-god-power-anchor="1"');
    expect(pendants).toContain('data-god-power-badge="1"');
    expect(pendants).toContain('梦访拉莱耶 · 2');
    expect(pendants).toContain('title="梦访拉莱耶 Lv.2"');
    expect(pendants).toContain('god-power-chevron-layer');
    expect(frame).toContain('data-encounter-skulls="1"');
    expect(frame.match(/src="[^"]*encounter-skull.webp"/g)).toHaveLength(8);
    expect(pendants).not.toContain('data-encounter-skulls');
    expect(pendants).not.toContain('💀');
    expect(pendants).toContain('data-etherealize-badge="1"');
    expect(pendants).toContain('虚化 2');
    expect(pendants).toContain('中毒 3');
    expect(pendants).toContain('data-resting-marker="1"');
    expect(pendants).toContain('data-rendered-card-id="visible-zone"');
    expect(pendants).toContain('空白区域牌');
    expect(coastal.match(/data-resting-marker="1"/g)).toHaveLength(1);

    appearance.battleLayout = 'arch';
    const arch = renderToStaticMarkup(<PlayerPanel {...props} />);
    expect(arch).not.toContain('toe-opponent-pendants');
    expect(arch).not.toContain('toe-coastal-portrait-framed');
    expect(arch).toContain('梦访拉莱耶 Lv.2');
    expect(arch.match(/src="[^"]*encounter-skull.webp"/g)).toHaveLength(8);
    expect(arch).not.toContain('💀');
    expect(arch).toContain('data-player-god-status="1"');
    expect(arch).toContain('data-rendered-card-id="visible-zone"');
  });

  it('keeps local faith and status descriptions on the banner with animation-owned values', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const markup = renderToStaticMarkup(<SelfPlayerPanel
      player={{ role: '寻宝者', hp: 10, san: 10, godName: 'CTH', godLevel: 2, godEncounters: 2, etherealizeStacks: 2, poisonStacks: 1, zoneCards: [] }}
      displayStats={[{ hp: 8, san: 5 }]} ri={{ icon: '✦', col: '#fff', goal: '执行期望' }}
      phase="ACTION" isMobile={false} isMobileLandscape={false} boardCssPx={value => value}
      middleRowHeight={180} fontSizes={{ tiny: 9, small: 10, body: 12 }} boardScaleRatio={1} vw={1280}
      hitIndices={[]} sanHitIndices={[]} hpHealIndices={[]} sanHealIndices={[]} guillotinedPids={new Set()} godHighlightPanelBursts={{}}
    />);
    expect(markup).toContain('当前信仰');
    expect(markup).toContain('梦访拉莱耶 Lv.2');
    expect(markup).toContain('toe-self-skull-anchor');
    expect(markup).toContain('aria-label="骷髅标记：2 枚"');
    expect(markup.match(/src="[^"]*encounter-skull.webp"/g)).toHaveLength(2);
    expect(markup.slice(markup.indexOf('class="toe-self-faith"'))).not.toContain('data-encounter-skulls');
    expect(markup).not.toContain('邪神遭遇');
    expect(markup).toContain('虚化 2');
    expect(markup).toContain('中毒 1');
    expect(markup).toContain('portrait-self.webp');
    expect(markup.slice(markup.indexOf('data-stat-label="SAN"'))).toContain('>5</span>');
  });

  it('removes only coastal pile captions while preserving piles and accessible counts', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const props = { deckCount: 41, inspectionCount: 30, discardCount: 0, discardCards: [], scaleRatio: 1 };
    const coastal = renderToStaticMarkup(<PileDisplay {...props} />);
    expect(coastal).toContain('data-inspection-pile');
    expect(coastal).toContain('data-deck-pile');
    expect(coastal).toContain('data-discard-pile');
    expect(coastal).toContain('aria-label="牌堆，41张"');
    expect(coastal).not.toContain('>牌堆:41<');
    expect(coastal).not.toContain('>检定:30<');
    expect(coastal).not.toContain('>弃牌堆:0<');
    appearance.battleLayout = 'arch';
    const arch = renderToStaticMarkup(<PileDisplay {...props} />);
    expect(arch).toContain('>牌堆:41<');
    expect(arch).toContain('>检定:30<');
  });
});
