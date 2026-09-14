import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerPanel, PileDisplay, CoastalPortrait } from '../board';
import { SelfPlayerPanel } from './SelfPlayerPanel';

const appearance = vi.hoisted(() => ({ battleLayout: 'coastal' }));
vi.mock('../../ui/UiAppearance', () => ({ useUiAppearance: () => ({ appearance }) }));
afterEach(() => { vi.unstubAllGlobals(); appearance.battleLayout = 'coastal'; });

describe('coastal panel presentation', () => {
  it('keeps hidden opponent roles anonymous and reads presentation stats', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const props = {
      player: { role: '邪祀者', name: '旅者', hp: 10, san: 10, hand: [1, 2, 3, 4].map(id => ({ id })), zoneCards: [] },
      playerIndex: 1, displayStats: [null, { hp: 7, san: 5 }], scaleRatio: 1, viewportWidth: 1280,
    };
    const hidden = renderToStaticMarkup(<PlayerPanel {...props} />);
    expect(hidden).toContain('portrait-1.webp');
    expect(hidden).not.toContain('邪祀者');
    const san = hidden.slice(hidden.indexOf('data-stat-label="SAN"'), hidden.indexOf('toe-opponent-zones'));
    expect(san).toContain('>5</span>');
    expect(san).toContain('left:60%');
    expect(san).not.toContain('>6<');
    expect(hidden.match(/aspect-ratio:392\s*\/\s*590/g)).toHaveLength(4);
    const publicRole = renderToStaticMarkup(<PlayerPanel {...props} player={{ ...props.player, roleRevealed: true }} />);
    expect(publicRole).toContain('portrait-1.webp');
    expect(publicRole).toContain('aria-label="邪祀者"');
    const otherHiddenRole = renderToStaticMarkup(<PlayerPanel {...props} player={{ ...props.player, role: '追猎者' }} />);
    expect(otherHiddenRole.match(/src="([^"]*portrait-[^"]+)"/)[1]).toBe(hidden.match(/src="([^"]*portrait-[^"]+)"/)[1]);
    expect(renderToStaticMarkup(<CoastalPortrait playerIndex={5} />)).toContain('portrait-1.webp');
    const derivative = renderToStaticMarkup(<PlayerPanel {...props} player={{ ...props.player, hand: [
      { id: 'goat', isBlackGoatYoung: true, name: '黑山羊幼仔', type: 'blackGoatYoung' },
      { id: 'secret', name: '不可公开的普通牌' },
    ] }} />);
    expect(derivative).toContain('cardbg_token.png');
    expect(derivative).toContain('黑山羊幼仔');
    expect(derivative).toContain('data-player-hand-card-id="back-1-1"');
    expect(derivative).not.toContain('不可公开的普通牌');
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
    expect(markup).toContain('邪神遭遇');
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
