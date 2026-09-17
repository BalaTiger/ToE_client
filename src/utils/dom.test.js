import { afterEach, describe, expect, it, vi } from 'vitest';
import { _getZoomCompensatedRect, getCardElementAnchor, getCardRevealMetrics, getPileCardAnchor, getPlayerAreaCardAnchor, getPlayerHandAnchorCenter, getRevealCardAnchor } from './dom';
import { getCardFlightStyle } from '../components/anim/cardSizing';
import { projectTableCard } from './cardPlane';

afterEach(() => vi.unstubAllGlobals());

function zoomedCard({ scale = .5, legacy = false, left = 320, top = 180 } = {}) {
  const container = {
    dataset: { boardZoom: String(scale) },
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    getBoundingClientRect: () => ({ left, top }),
  };
  const cardRect = { left: left + 80, top: top + 40, width: 100, height: 150, right: left + 180, bottom: top + 190 };
  const card = { closest: () => container, getBoundingClientRect: () => cardRect };
  const createElement = vi.fn(() => ({
    style: {},
    getBoundingClientRect: () => ({ width: legacy ? 100 : 100 * Number(container.dataset.boardZoom) }),
  }));
  vi.stubGlobal('document', { createElement, querySelector: () => card });
  vi.stubGlobal('getComputedStyle', () => ({ zoom: scale }));
  return { container, card, cardRect, createElement };
}

describe('zoomed board viewport anchors', () => {
  it('keeps native screen coordinates when board zoom differs from the window scale', () => {
    vi.stubGlobal('window', { innerWidth: 3440, innerHeight: 1440 });
    const { card, cardRect } = zoomedCard({ scale: 2.28 });
    expect(_getZoomCompensatedRect(card)).toBe(cardRect);
    expect(getPlayerHandAnchorCenter(0)).toEqual({ x: 450, y: 295 });
  });

  it.each([.5, 2])('compensates legacy zoom %s around the board origin', scale => {
    const { card } = zoomedCard({ scale, legacy: true });
    expect(_getZoomCompensatedRect(card)).toEqual({
      left: 320 + 80 * scale, top: 180 + 40 * scale,
      width: 100 * scale, height: 150 * scale,
      right: 320 + 180 * scale, bottom: 180 + 190 * scale,
      x: 320 + 80 * scale, y: 180 + 40 * scale,
    });
  });

  it('rechecks a resized zoom container and does not reuse another board detection', () => {
    const { card, container, createElement } = zoomedCard();
    _getZoomCompensatedRect(card);
    _getZoomCompensatedRect(card);
    expect(createElement).toHaveBeenCalledTimes(1);
    container.dataset.boardZoom = '.3';
    _getZoomCompensatedRect(card);
    expect(createElement).toHaveBeenCalledTimes(2);
    const legacy = zoomedCard({ legacy: true });
    expect(_getZoomCompensatedRect(legacy.card).width).toBe(50);
  });

  it('uses actual CSS zoom for layouts without an explicit board zoom attribute', () => {
    const { card, container } = zoomedCard({ legacy: true });
    delete container.dataset.boardZoom;
    expect(_getZoomCompensatedRect(card).left).toBe(360);
  });

  it('leaves viewport overlays outside a zoom container alone', () => {
    const rect = { left: 70, top: 90, width: 300, height: 450 };
    expect(_getZoomCompensatedRect({ closest: () => null, getBoundingClientRect: () => rect })).toBe(rect);
    expect(_getZoomCompensatedRect(null)).toBeNull();
  });
});

describe('card flight perspective', () => {
  it.each([[1280, 720], [844, 390], [667, 320], [3440, 1440]])('keeps the reveal and its fallback aligned at %s×%s with room for choices', (innerWidth, innerHeight) => {
    vi.stubGlobal('window', { innerWidth, innerHeight });
    vi.stubGlobal('document', { querySelector: () => null });
    const metrics = getCardRevealMetrics();
    expect(metrics.height / metrics.width).toBeCloseTo(590 / 392);
    expect(metrics.y - metrics.height / 2).toBeGreaterThanOrEqual(29.99);
    expect(innerHeight - metrics.y - metrics.height / 2).toBeGreaterThanOrEqual(107.99);
    expect(getRevealCardAnchor()).toEqual({ x: metrics.x, y: metrics.y, width: metrics.width, height: metrics.height, rotation: 0 });
    if (innerWidth === 1280) expect(metrics).toMatchObject({ x: 640, y: 360, width: 225 });
  });

  it.each([
    [-3, 117.51556863476048, 155.827802437665],
    [3, 330.6802523754865, 364.172197562335],
  ])('recovers shared-camera card centers at half zoom (roll %s)', (rotation, left, centerX) => {
    const camera = { closest: () => null, getBoundingClientRect: () => ({ left: 100, top: 200, width: 320, height: 150 }) };
    const table = {};
    const card = {
      matches: selector => selector === '[data-pile-card]',
      closest: selector => selector === '[data-pile-camera]' ? camera : selector === '[data-pile-table]' ? table : null,
      getBoundingClientRect: () => ({ left, top: 250.38409806579176, width: 71.80417898975304, height: 70.14618011723559 }),
    };
    vi.stubGlobal('getComputedStyle', node => node === camera ? { width: '640px', perspective: '1024px' }
      : { width: '120px', getPropertyValue: key => ({ '--toe-table-tilt': '45deg', '--toe-card-depth': '18px', '--toe-card-rotation': `${rotation}deg` })[key] });
    const anchor = getCardElementAnchor(card);
    expect(anchor.x).toBeCloseTo(centerX, 7);
    expect(anchor.y).toBeCloseTo(283.1026954038175, 7);
    expect(anchor.width).toBe(60);
    expect(anchor.height / anchor.width).toBeCloseTo(590 / 392);
    // Off-axis perspective gives opposite shears to the left and right piles.
    expect(Math.sign(anchor.projection.b)).toBe(Math.sign(rotation));
    const flight = getCardFlightStyle(anchor, { x: 400, y: 500, width: 200 });
    const matrix = flight['--from-plane'].slice(9, -1).split(',').map(Number);
    const points = [-100, 100].flatMap(x => [-100 * 590 / 392, 100 * 590 / 392].map(y => {
      const den = matrix[3] * x + matrix[7] * y + 1;
      return {
        x: anchor.x + flight['--from-scale'] * (matrix[0] * x + matrix[4] * y) / den,
        y: anchor.y + flight['--from-scale'] * (matrix[1] * x + matrix[5] * y) / den,
      };
    }));
    expect(Math.min(...points.map(p => p.x))).toBeCloseTo(left, 7);
    expect(Math.min(...points.map(p => p.y))).toBeCloseTo(250.38409806579176, 7);
    expect(Math.max(...points.map(p => p.x)) - left).toBeCloseTo(71.80417898975304, 7);
  });

  it('flies outward from a tilted pile and inward when returning to it', () => {
    const pile = { x: 600, y: 260, width: 120, tilt: 45 };
    const hand = { x: 600, y: 620, width: 220, rotation: -8 };
    const outward = getCardFlightStyle(pile, hand);
    const inward = getCardFlightStyle(hand, pile);
    expect(outward['--from-tilt']).toBe('45deg');
    expect(outward['--to-tilt']).toBe('0deg');
    expect(Number.parseFloat(outward['--flight-depth'])).toBeGreaterThan(0);
    expect(Number.parseFloat(inward['--flight-depth'])).toBeLessThan(0);
    expect(inward['--to-tilt']).toBe('45deg');
    expect(outward.width * outward['--from-scale']).toBeCloseTo(120);
    expect(inward.width * inward['--to-scale']).toBeCloseTo(120);
  });

  it('starts an opponent draw at the central reveal after the flip has unmounted', () => {
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 });
    vi.stubGlobal('document', { querySelector: () => null });
    expect(getPlayerAreaCardAnchor(2, { id: 'opponent-draw' }, true)).toMatchObject({ x: 640, y: 360, width: 225, rotation: 0 });
  });

  it('approaches the pile angle monotonically when discarding and reverses it when drawing', () => {
    const pile = { x: 600, y: 260, width: 120, tilt: 45 };
    const hand = { x: 600, y: 620, width: 220, rotation: -8 };
    const draw = getCardFlightStyle(pile, hand, 0, 'endpoints');
    const discard = getCardFlightStyle(hand, pile, 0, 'endpoints');
    expect(draw['--from-tilt']).toBe('45deg');
    expect(parseFloat(draw['--mid-tilt'])).toBeCloseTo(20.25);
    expect(draw['--to-tilt']).toBe('0deg');
    expect(parseFloat(discard['--mid-tilt'])).toBeCloseTo(24.75);
    expect(discard['--to-tilt']).toBe('45deg');
    expect(draw['--flight-bank']).toBe('0deg');
  });

  it('keeps income facing the camera for both actors without losing endpoint sizes or depth', () => {
    const pile = projectTableCard({ x: 100, y: 80, width: 120, perspective: 1300 });
    for (const width of [48, 220]) {
      const hand = { x: 400, y: 620, width, rotation: -8 };
      const style = getCardFlightStyle(pile, hand, 0, 'camera');
      for (const stage of ['from', 'mid', 'to']) expect(style[`--${stage}-tilt`]).toBe('0deg');
      expect(style['--flight-bank']).toBe('0deg');
      expect(style['--from-plane']).toBeUndefined();
      expect(style['--to-plane']).toBeUndefined();
      expect(style.width * style['--from-scale']).toBeCloseTo(pile.width);
      expect(style.width * style['--to-scale']).toBeCloseTo(width);
      expect(Math.sign(parseFloat(style['--flight-depth']))).toBe(Math.sign(width - pile.width));
    }
  });

  it('removes fan rotation from measured width without stretching the card', () => {
    const ratio = 590 / 392;
    const angle = 18 * Math.PI / 180;
    const width = 200;
    const bboxWidth = width * (Math.cos(angle) + ratio * Math.sin(angle));
    const bboxHeight = width * (Math.sin(angle) + ratio * Math.cos(angle));
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ rotate: '18deg', transform: 'none' }));
    const anchor = getCardElementAnchor({ matches: () => true, getBoundingClientRect: () => ({ left: 100, top: 400, width: bboxWidth, height: bboxHeight }) });
    expect(anchor.width).toBeCloseTo(200);
    expect(anchor.height / anchor.width).toBeCloseTo(ratio);
    expect(anchor.x).toBeCloseTo(100 + bboxWidth / 2);
    expect(anchor.rotation).toBe(18);
  });

  it('uses the actual top card instead of the pile padding', () => {
    const card = { matches: () => true, getBoundingClientRect: () => ({ left: 80, top: 160, width: 120, height: 120 * 590 / 392 }) };
    const pile = { querySelector: () => card };
    vi.stubGlobal('document', { querySelector: () => pile });
    vi.stubGlobal('getComputedStyle', () => ({ rotate: 'none', transform: 'none' }));
    expect(getPileCardAnchor('[data-deck-pile]')).toMatchObject({ x: 140, width: 120, rotation: 0 });
  });

  it.each([[210, 120], [36, 210], [120, 210]])('interpolates %s → %s without a tiny fixed-size endpoint', (fromWidth, toWidth) => {
    const style = getCardFlightStyle({ x: 320, y: 550, width: fromWidth, rotation: -12 }, { x: 750, y: 200, width: toWidth, rotation: 2 });
    expect(style.width * style['--from-scale']).toBeCloseTo(fromWidth);
    expect(style.width * style['--to-scale']).toBeCloseTo(toWidth);
    expect(style.width * style['--mid-scale']).toBeCloseTo(fromWidth + (toWidth - fromWidth) * .55);
    expect(style.height / style.width).toBeCloseTo(590 / 392);
    expect(style['--tx']).toBe('430px');
    expect(style['--ty']).toBe('-350px');
  });
});
