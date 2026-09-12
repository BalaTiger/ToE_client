import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardFaceTooltip, DDCard, DDCardBack, GodDDCard, MiniCardFace } from './index';
import { CardFaceImage } from './CardFaceImage';
import { CARD_FACE_RATIO } from './CardFaceAssets';

vi.mock('react-dom', () => ({ createPortal: children => children }));
vi.mock('./useCardHoverTooltip', () => ({
  useCardHoverTooltip: () => ({
    hover: false,
    tooltipPosition: null,
    cardRef: { current: null },
    handleMouseEnter: () => {},
    handleMouseMove: () => {},
    handleMouseLeave: () => {},
  }),
}));

const zone = { id: 'zone', isZone: true, key: 'A1', letter: 'A', name: '遭遇塌方', desc: '失去3HP并翻面' };
const god = { id: 'god', isGod: true, godKey: 'CTH', name: '克苏鲁' };

function imageCard(props, Component = DDCard) {
  const element = Component(props);
  const tree = element.type(element.props);
  return React.Children.toArray(tree.props.children)[0];
}

beforeEach(() => vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900, __PUBLIC_BASE__: '/' }));
afterEach(() => vi.unstubAllGlobals());

describe('image hand cards', () => {
  it.each([
    ['zone', zone],
    ['god', god],
    ['blank zone', { ...zone, type: 'blankZone', name: '空白区域牌' }],
    ['restore', { ...zone, type: 'geomagneticRestore', name: '反转复原' }],
    ['black goat', { ...zone, isBlackGoatYoung: true, name: '黑山羊幼崽' }],
    ['slime', { ...zone, isTsathogguaSlime: true, name: '黏液' }],
  ])('keeps the complete %s face at 392:590 despite legacy frame height', (_, card) => {
    const element = imageCard({ card, frameStyle: { width: 100, height: 60, padding: 8 } });
    expect(element.props.style).toMatchObject({ width: 100, height: 100 * CARD_FACE_RATIO, padding: 0, border: 'none' });
    const face = React.Children.toArray(element.props.children).find(child => child.type === CardFaceImage);
    expect(face.props.width).toBe(100);
    expect(face.props.card.id).toBe(card.id);
    expect(element.props['data-card-id']).toBeUndefined(); // Stone-carving drag slots own this selector.
    if (card.type === 'blankZone') expect(face.props.card.key).toBe('BLANK');
  });

  it('preserves click, selection, disabled state, and the holder-specific thorn marker', () => {
    const onClick = vi.fn();
    const card = { ...zone, roseThornHolderId: 2 };
    const selected = imageCard({ card, onClick, selected: true, holderId: 2 });
    expect(selected.props.onClick).toBe(onClick);
    expect(selected.props['aria-pressed']).toBe(true);
    expect(selected.props.style.transform).toBe('translateY(-5px)');
    expect(renderToStaticMarkup(selected)).toContain('倒刺');
    const disabled = imageCard({ card, onClick, disabled: true, holderId: 1 });
    expect(disabled.props.onClick).toBeUndefined();
    expect(disabled.props['aria-disabled']).toBe(true);
    expect(renderToStaticMarkup(disabled)).not.toContain('倒刺');
  });

  it('keeps readable live captions outside hand art and the supplied god level', () => {
    const element = imageCard({ card: god, godLevel: 3 }, GodDDCard);
    const children = React.Children.toArray(element.props.children);
    expect(children.find(child => child.type === CardFaceImage).props.godLevel).toBe(3);
    expect(renderToStaticMarkup(element)).toContain('data-card-caption');
    expect(renderToStaticMarkup(element)).toContain('克苏鲁');
    expect(renderToStaticMarkup(imageCard({ card: zone, small: true }))).not.toContain('data-card-caption');
  });

  it('derives card backs and moving-card dimensions from their width', () => {
    expect(DDCardBack({ frameStyle: { width: 90, height: 25 } }).props.style).toMatchObject({ width: 90, height: 90 * CARD_FACE_RATIO });
    expect(DDCardBack({ frameStyle: { width: '100%', height: 25 } }).props.style).toMatchObject({ width: '100%', height: 'auto', aspectRatio: '392 / 590' });
    expect(MiniCardFace({ card: zone, width: 70, height: 94 }).props.style).toMatchObject({ width: 70, height: 70 * CARD_FACE_RATIO });
  });
});

describe('card tooltip viewport fit', () => {
  it.each([[390, 844], [844, 390], [1440, 900]])('fits a %s×%s viewport with an exact card ratio', (vw, vh) => {
    vi.stubGlobal('window', { innerWidth: vw, innerHeight: vh, __PUBLIC_BASE__: '/' });
    vi.stubGlobal('document', { body: {} });
    for (const left of [0, vw - 82]) {
      const tree = CardFaceTooltip({ card: zone, position: { left, top: 120, width: 82, height: 82 * CARD_FACE_RATIO } });
      const panel = React.Children.toArray(tree.props.children).find(child => child.type === 'div');
      const { width, height, top, left: x } = panel.props.style;
      expect(height).toBe(width * CARD_FACE_RATIO);
      expect(x).toBeGreaterThanOrEqual(12);
      expect(x + width).toBeLessThanOrEqual(vw - 12);
      expect(top + height).toBeLessThanOrEqual(vh - 12);
      const faceTransform = panel.props.children.props.children.props.style.transform;
      if (vw < 640) expect(faceTransform).toBe('none');
      else expect(faceTransform).toContain('perspective(1500px)');
    }
  });
});
