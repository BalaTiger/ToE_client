import React, { Children } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerPanel } from './index';
import { CardFaceTooltip } from '../cards';
import { CARD_FACE_RATIO } from '../cards/CardFaceAssets';

const hover = vi.hoisted(() => ({ active: false }));
vi.mock('../../ui/UiAppearance', () => ({
  useUiAppearance: () => ({ appearance: { battleLayout: 'coastal' } }),
}));
vi.mock('react-dom', () => ({ createPortal: children => children }));
vi.mock('../cards/useCardHoverTooltip', () => ({
  useCardHoverTooltip: () => ({
    hover: hover.active,
    tooltipPosition: null,
    cardRef: { current: null },
    handleMouseEnter: () => {},
    handleMouseMove: () => {},
    handleMouseLeave: () => {},
  }),
}));

const ordinary = id => ({
  id: `secret-${id}`, isZone: true, key: 'A1', letter: 'A',
  name: `Private Ordinary ${id}`, desc: `Private detail ${id}`,
});
const player = count => ({
  name: 'Opponent', role: '\u5bfb\u5b9d\u8005', hp: 6, san: 10,
  hand: Array.from({ length: count }, (_, id) => ordinary(id)), zoneCards: [],
});

beforeEach(() => {
  hover.active = false;
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, __PUBLIC_BASE__: '/' });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// These tests inspect the real component after its existing strip measurement.
// They do not treat a server-rendered or zero DOM rectangle as pixel evidence.
function panel(showFaceUp, count = 4, stripWidth = 144, viewportWidth = 1280, onCardSelect) {
  vi.spyOn(React, 'useState').mockImplementation(initial => [initial === 0 ? stripWidth : initial, () => {}]);
  vi.spyOn(React, 'useRef').mockReturnValue({ current: null });
  vi.spyOn(React, 'useLayoutEffect').mockImplementation(() => {});
  const element = PlayerPanel({
    player: player(count), playerIndex: 1, scaleRatio: 1, viewportWidth,
    showFaceUp, onCardSelect,
  });
  const core = Children.toArray(element.props.children).find(child => child.props.className === 'toe-opponent-core');
  const strip = Children.toArray(core.props.children).find(child => child.props['data-player-hand-strip'] === 1);
  return { element, strip, slots: Children.toArray(strip.props.children) };
}

function faceTree(slot) {
  const component = slot.props.children;
  const image = component.type(component.props);
  const fragment = image.type(image.props);
  const [face, tooltip] = Children.toArray(fragment.props.children);
  return { face, tooltip };
}

function backStyle(slot) {
  const back = slot.props.children.props.children;
  return back.type(back.props).props.style;
}

function measuredBox(style, slotWidth) {
  const zoom = style.zoom ?? 1;
  const width = style.width === '100%' ? slotWidth : style.width * zoom;
  return {
    width,
    minWidth: style.minWidth === '100%' ? slotWidth : style.minWidth * zoom,
    height: style.height === 'auto' ? width * CARD_FACE_RATIO : style.height * zoom,
    bottomOccupancy: (style.marginBottom ?? 0) * zoom,
    aspectRatio: style.aspectRatio,
    padding: style.padding,
    border: style.border,
  };
}

describe('public opponent hand occupancy and privacy', () => {
  it.each([4, 5])('renders %i public cards without text or extra space below the art', count => {
    const { strip, slots } = panel(true, count);
    const html = renderToStaticMarkup(strip);
    expect(html).not.toContain('data-card-caption');
    for (const slot of slots) {
      const { face } = faceTree(slot);
      expect(face.props.style.marginBottom).toBe(0);
      expect(face.props['aria-label']).toContain(slot.props.children.props.card.name);
    }
  });

  it.each([
    [4, 144, 1280], [4, 360, 1920], [4, 80, 390], [5, 144, 1280],
  ])('uses the same measured occupancy and spacing for %i public/back cards in a %ipx strip (%ipx viewport)', (count, stripWidth, viewportWidth) => {
    const visible = panel(true, count, stripWidth, viewportWidth);
    const hidden = panel(false, count, stripWidth, viewportWidth);
    const slotWidth = (stripWidth - 3 * 3) / 4;
    expect(visible.strip.props.style).toEqual(hidden.strip.props.style);
    visible.slots.forEach((slot, index) => {
      expect(slot.props.style).toEqual(hidden.slots[index].props.style);
      const { face } = faceTree(slot);
      const shownBox = measuredBox(face.props.style, slotWidth);
      const secretBox = measuredBox(backStyle(hidden.slots[index]), slotWidth);
      for (const dimension of ['width', 'minWidth', 'height', 'bottomOccupancy']) {
        expect(shownBox[dimension]).toBeCloseTo(secretBox[dimension], 10);
      }
      expect(shownBox.aspectRatio).toBe(secretBox.aspectRatio);
      expect(shownBox.padding).toBe(secretBox.padding);
      expect(shownBox.border).toBe(secretBox.border);
    });
  });

  it('keeps the existing public preview, accessible name, and target-card keyboard callback', () => {
    hover.active = true;
    const onCardSelect = vi.fn();
    const { slots } = panel(true, 4, 144, 1280, onCardSelect);
    const { face, tooltip } = faceTree(slots[1]);
    expect(tooltip.type).toBe(CardFaceTooltip);
    expect(tooltip.props.card).toEqual(ordinary(1));
    expect(tooltip.props.card.desc).toBe('Private detail 1');
    for (const event of ['onMouseEnter', 'onMouseMove', 'onMouseLeave']) {
      expect(typeof face.props[event]).toBe('function');
    }
    expect(face.props['aria-label']).toContain('A1');
    expect(face.props['aria-label']).toContain('Private Ordinary 1');
    expect(face.props.role).toBe('button');
    expect(face.props.tabIndex).toBe(0);
    const preventDefault = vi.fn();
    face.props.onKeyDown({ key: 'Enter', preventDefault });
    expect(onCardSelect).toHaveBeenCalledExactlyOnceWith(1);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(face)).not.toContain('data-card-caption');
  });

  it.each([4, 5])('does not expose private ordinary identities or preview payloads with %i hidden cards', count => {
    hover.active = true;
    const { strip, slots } = panel(false, count);
    const html = renderToStaticMarkup(strip);
    for (let id = 0; id < count; id += 1) {
      expect(html).not.toContain(`secret-${id}`);
      expect(html).not.toContain(`Private Ordinary ${id}`);
      expect(html).not.toContain(`Private detail ${id}`);
      expect(slots[id].props.children.props.children.props.card).toBeUndefined();
      expect(slots[id].props['data-player-hand-card-id']).toBe(`back-1-${id}`);
    }
    expect(html).not.toContain('data-card-caption');
  });
});
