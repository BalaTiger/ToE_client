import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeckPile, DiscardPile, InspectionPile, PileDisplay, PlayerPanel } from './index';
import { CARD_FACE_RATIO } from '../cards/CardFaceAssets';
import { AnimatedCardBack } from '../cards/AnimatedCardBack';
import { UiAppearanceProvider } from '../../ui/UiAppearance';
import { PILE_CARD_TILT } from '../../utils/cardPlane';

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
      zhuLitCards={[{ deckIndex: 1, card: { id: 'lit-card', name: '新鲜空气', isZone: true } }]} />);
    const topStyle = markup.match(/data-pile-card-top="true"[^>]+style="([^"]+)"/)[1];
    expect(topStyle).toContain('translateZ(4.2px) rotate(0deg)');
    expect(topStyle).not.toContain('animation:');
    expect(markup).toContain('--zhu-pop-x:6.25px;animation:zhuLitCardPop');
  });

  it.each([['ordinary', DeckPile, 8], ['inspection', InspectionPile, 5]])(
    'aligns every %s pile layer into a square column without moving its top anchor', (_name, Component, left) => {
      vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
      const markup = renderToStaticMarkup(createElement(Component, { count: 30, scale: 100 / 36, compactStack: true }));
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

  it.each([[1, [2]], [2, [1, 2, 3]], [3, [0, 1, 2, 3, 4]]])(
    'exposes one real corner of complete level %i buried cards without changing their planes', (_level, litIndices) => {
      vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
      const zhuLitCards = litIndices.map(deckIndex => ({ deckIndex, card: { id: `lit-${deckIndex}`, name: '新鲜空气', isZone: true } }));
      const planeStyles = markup => [...markup.matchAll(/data-pile-card="[^"]+"[^>]+style="([^"]+)"/g)]
        .reverse().map(match => Object.fromEntries(match[1].split(';').filter(Boolean).map(property => property.split(':'))));
      const geometry = [72, 144].map(width => {
        const props = { count: 7, scale: width / 36, compactStack: true };
        const normal = planeStyles(renderToStaticMarkup(<DeckPile {...props} />));
        const markup = renderToStaticMarkup(<DeckPile {...props} zhuLitCards={zhuLitCards} />);
        const lit = planeStyles(markup);
        const hidden = planeStyles(renderToStaticMarkup(<DeckPile {...props} zhuLitCards={zhuLitCards} zhuHiddenCardId={zhuLitCards[0].card.id} />));
        expect(lit).toHaveLength(7);
        lit.forEach((style, deckIndex) => {
          for (const property of ['left', 'top', 'width', 'height', 'aspect-ratio', '--toe-card-depth', '--toe-card-rotation', 'transform']) {
            expect(style[property]).toBe(normal[deckIndex][property]);
            expect(hidden[deckIndex][property]).toBe(style[property]);
          }
          expect(style.animation).toBeUndefined();
        });
        expect(hidden[litIndices[0]].opacity).toBe('0');
        const peeks = markup.split(/(?=<div data-pile-card=")/).filter(block => block.includes('data-zhu-lit-peek='));
        expect(peeks).toHaveLength(litIndices.filter(index => index > 0).length);
        const poses = peeks.map(block => {
          const deckIndex = Number(block.match(/data-pile-card="(\d+)"/)[1]);
          const [, style, animationStyle] = block.match(/data-zhu-lit-peek="[^"]*"[^>]*style="([^"]+)"><div style="([^"]+)"/);
          expect(style).not.toContain('clip-path:');
          expect(animationStyle).not.toContain('clip-path:');
          expect(block).not.toMatch(/clip-path:polygon\(0 0, [\d.]+px 0, 0 [\d.]+px\)/);
          expect(block.match(/data-card-face-id=/g)).toHaveLength(1);
          const values = Object.fromEntries(style.split(';').filter(Boolean).map(property => property.split(':')));
          const buriedWidth = Number.parseFloat(values.width);
          const buriedHeight = Number.parseFloat(values.height);
          const left = Number.parseFloat(values.left);
          const depthDifference = Number.parseFloat(lit[0]['--toe-card-depth']) - Number.parseFloat(lit[deckIndex]['--toe-card-depth']);
          const top = Number.parseFloat(values.top) + depthDifference * Math.tan(PILE_CARD_TILT * Math.PI / 180);
          const angle = Number(values.transform.match(/rotate\(([-\d.]+)deg\)/)[1]) * Math.PI / 180;
          const cosine = Math.cos(angle), sine = Math.sin(angle);
          expect(buriedHeight / buriedWidth).toBeCloseTo(CARD_FACE_RATIO);
          const corners = [[0, 0], [buriedWidth, 0], [buriedWidth, buriedHeight], [0, buriedHeight]]
            .map(([x, y]) => [left + x * cosine - y * sine, top + x * sine + y * cosine]);
          expect(corners[0][0]).toBeLessThan(0);
          // The other three corners really fit underneath the covering card;
          // the exposed triangle comes from occlusion, not a cropped image.
          for (const [x, y] of corners.slice(1)) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(width);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(width * CARD_FACE_RATIO);
          }
          const short = -left / cosine;
          const long = left / sine;
          expect(short).toBeGreaterThanOrEqual(buriedWidth / 5);
          expect(short).toBeLessThanOrEqual(buriedWidth / 4);
          expect(long).toBeLessThan(buriedHeight);
          const outline = block.match(/<polyline points="([^"]+)"/);
          if (outline) {
            const points = outline[1].split(' ').map(point => point.split(',').map(Number));
            expect(points[0][0]).toBeCloseTo(buriedWidth);
            expect(points[0][1]).toBe(0);
            expect(points[1]).toEqual([0, 0]);
            expect(points[2][0]).toBe(0);
            expect(points[2][1]).toBeCloseTo(buriedHeight);
          }
          return [buriedWidth, buriedHeight, left, top, angle];
        });
        for (const pose of poses) pose.forEach((value, index) => expect(value).toBeCloseTo(poses[0][index]));
        return poses[0].slice(0, -1);
      });
      geometry[1].forEach((value, index) => expect(value).toBeCloseTo(geometry[0][index] * 2));
    },
  );

  it.each([
    ['unsorted lit cards', 7, [4, 2, 1], null, 1],
    ['out-of-range lit cards', 3, [7, -1, 2, 1], null, 1],
    ['hidden nearest card', 7, [4, 2, 1], 'lit-1', 2],
    ['uncovered top card', 7, [4, 2, 0], null, 0],
    ['only visible card hidden', 3, [7, -1, 1], 'lit-1', null],
    ['no lit cards', 7, [], null, null],
    ['empty pile', 0, [0, 1], null, null],
  ])('assigns one corner highlight and hover target with %s', (_case, count, litIndices, hiddenId, expectedIndex) => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const zhuLitCards = litIndices.map(deckIndex => ({ deckIndex, card: { id: `lit-${deckIndex}`, name: '新鲜空气', isZone: true } }));
    const markup = renderToStaticMarkup(<DeckPile count={count} zhuLitCards={zhuLitCards} zhuHiddenCardId={hiddenId} />);
    const litPlanes = [...markup.matchAll(/<div data-pile-card="(\d+)"[^>]*>/g)]
      .filter(match => match[0].includes('data-zhu-lit-interactive='));
    const interactivePlanes = litPlanes.filter(match => match[0].includes('data-zhu-lit-interactive="true"'));
    expect(interactivePlanes.map(match => Number(match[1]))).toEqual(expectedIndex === null ? [] : [expectedIndex]);
    expect((markup.match(/data-zhu-lit-corner=/g) || []).length).toBe(expectedIndex === null || expectedIndex === 0 ? 0 : 1);
    for (const [tag, deckIndex] of litPlanes) {
      expect(tag).toContain(`pointer-events:${Number(deckIndex) === expectedIndex ? 'auto' : 'none'}`);
    }
  });

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
