import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeckPile, DiscardPile, InspectionPile, PileDisplay, PlayerPanel } from './index';
import { CARD_FACE_RATIO } from '../cards/CardFaceAssets';
import { AnimatedCardBack } from '../cards/AnimatedCardBack';
import { UiAppearanceProvider } from '../../ui/UiAppearance';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('battle player presentation', () => {
  it('preserves canonical card frames and animation-owned HP/SAN', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const markup = renderToStaticMarkup(
      <PlayerPanel
        player={{ role: '寻宝者', name: '旅者', hp: 10, san: 10, hand: [1, 2, 3, 4].map(id => ({ id })), zoneCards: [] }}
        playerIndex={1}
        isCurrentTurn={false}
        displayStats={[null, { hp: 4, san: 6 }]}
        scaleRatio={1}
        viewportWidth={1280}
      />,
    );
    expect(markup.match(/aspect-ratio:392\s*\/\s*590/g)).toHaveLength(4);
    const hp = markup.slice(markup.indexOf('data-stat-label="HP"'), markup.indexOf('data-stat-label="SAN"'));
    expect(hp).toContain('>4</span>');
    expect(hp).not.toContain('>10</span>');
    expect(markup.slice(markup.indexOf('data-stat-label="SAN"'))).toContain('>6</span>');
    expect(markup).toContain('data-death-panel="1"');
    expect(markup).toContain('data-player-hand-strip="1"');
  });
});

describe('pile card flight anchors', () => {
  it.each([DeckPile, DiscardPile, InspectionPile].flatMap(Component => [0, 7].map(count => [Component.name, count, Component])))(
    '%s exposes exactly one real top-card anchor with %i cards', (_name, count, Component) => {
      vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
      const markup = renderToStaticMarkup(createElement(Component, { count, scale: 100 / 36, compactStack: true }));
      expect(markup.match(/data-pile-card-top="true"/g)).toHaveLength(1);
      expect(markup).toContain(`width:100px;height:${100 * CARD_FACE_RATIO}px`);
      expect(markup).toContain('aspect-ratio:392/590;box-sizing:border-box');
      const planeStyles = [...markup.matchAll(/data-pile-card="[^"]+"[^>]+style="([^"]+)"/g)].map(match => match[1]);
      for (const style of planeStyles) {
        expect(style).toContain('--toe-card-depth:');
        expect(style).toContain('transform:translateZ(');
        expect(style).not.toContain('perspective');
        expect(style).not.toContain('rotateX(');
        expect(style).toContain('transform-origin:center center');
        expect(style).toContain('transform-style:preserve-3d');
      }
      expect((markup.match(/data-pile-edge=/g) || []).length).toBe(count ? Math.min(count, Component===InspectionPile?5:7)*3 : 0);
    },
  );

  it('keeps the lit-card plane stable while its inner pop animation runs', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const markup = renderToStaticMarkup(<DeckPile count={7} scale={100 / 36}
      zhuLitCards={[{ deckIndex: 0, card: { id: 'lit-card', name: '新鲜空气', isZone: true } }]} />);
    const topStyle = markup.match(/data-pile-card-top="true"[^>]+style="([^"]+)"/)[1];
    expect(topStyle).toContain('translateZ(4.2px) rotate(0deg)');
    expect(topStyle).not.toContain('animation:');
    expect(markup).toContain('--zhu-rot:0deg;animation:zhuLitCardPop');
  });

  it.each([['ordinary', DeckPile, 8], ['inspection', InspectionPile, 5]])(
    'aligns every %s pile layer into a square column without moving its top anchor', (_name, Component, left) => {
      vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
      const markup = renderToStaticMarkup(createElement(Component, { count: 30, scale: 100 / 36, compactStack: true,
        zhuLitCards: [{ deckIndex: 0, card: { id: 'lit', name: '新鲜空气', isZone: true } }],
      }));
      const planeStyles = [...markup.matchAll(/data-pile-card="[^"]+"[^>]+style="([^"]+)"/g)].map(match => match[1]);
      expect(planeStyles.length).toBeGreaterThan(1);
      for (const style of planeStyles) {
        expect(style).toContain(`left:${left}px;top:0`);
        expect(style).toContain('--toe-card-rotation:0deg');
      }
      const depths = planeStyles.map(style => Number(style.match(/--toe-card-depth:([\d.]+)px/)[1]));
      expect(new Set(depths).size).toBe(planeStyles.length);
    },
  );

  it('contains a static card back when a caller supplies a mismatched box', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const markup = renderToStaticMarkup(<AnimatedCardBack animated={false} style={{ width: 200, height: 100 }} />);
    expect(markup).toContain('background-size:contain');
    expect(markup).not.toContain('background-size:100% 100%');
  });

  it('contains decoded animation frames in a mismatched box as well', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    vi.spyOn(React, 'useState').mockImplementation(initial => [initial === false ? true : initial, () => {}]);
    const markup = renderToStaticMarkup(<AnimatedCardBack style={{ width: 200, height: 100 }} />);
    expect(markup).toContain('object-fit:contain');
    expect(markup).not.toContain('object-fit:fill');
  });
});

describe('middle-distance pile sizing', () => {
  it.each(['classic', 'arcane-table'].flatMap(appearance => [113, 140].map(height => [appearance, height])))(
    'keeps larger piles and readable captions within the existing %s %ipx row', (appearance, height) => {
      vi.stubGlobal('window', { __PUBLIC_BASE__: '/', location: { search: `?ui-appearance=${appearance}` } });
      const markup = renderToStaticMarkup(<UiAppearanceProvider>
        <PileDisplay deckCount={30} discardCount={7} inspectionCount={24} baseHeight={height} scaleRatio={1} />
      </UiAppearanceProvider>);
      const topCardStyles = [...markup.matchAll(/data-pile-card-top="true"[^>]+style="([^"]+)"/g)].map(match => match[1]);
      expect(topCardStyles).toHaveLength(3);
      for (const style of topCardStyles) {
        const width = Number(style.match(/(?:^|;)width:([\d.]+)px/)[1]);
        expect(width).toBeGreaterThanOrEqual(50);
        expect(width * CARD_FACE_RATIO + 36).toBeLessThanOrEqual(height);
      }
      expect(markup).toContain(`min-height:${height}px`);
      expect(markup.match(/line-height:1.25;white-space:nowrap;flex-shrink:0/g)).toHaveLength(3);
      expect(markup.match(/data-pile-camera=/g)).toHaveLength(1);
      expect(markup.match(/data-pile-table=/g)).toHaveLength(1);
      expect(markup.match(/perspective:/g)).toHaveLength(1);
      expect(markup).toContain('perspective-origin:50% 50%');
      expect(markup).toContain('transform:rotateX(45deg)');
      expect(markup).not.toContain('perspective(');
      expect(markup.indexOf('data-pile-captions')).toBeGreaterThan(markup.lastIndexOf('data-pile-card='));
    },
  );
});
