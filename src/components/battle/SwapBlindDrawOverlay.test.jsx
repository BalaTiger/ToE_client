import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SwapBlindDrawOverlay } from './SwapBlindDrawOverlay';

beforeEach(() => vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const blindDrawProps = (phase = 'selecting') => ({
  swapBlindDraw: { phase, targetPi: 1, selectedIdx: 0,
    handSnapshot: [
      { idx: 0, isFaceUp: false, card: { id: 'secret', name: '不得暴露的隐藏牌', key: 'A1' } },
      { idx: 1, isFaceUp: false, card: { id: 'other-secret', name: '另一张隐藏牌', key: 'B2' } },
    ],
  },
  swapBlindCardLayout: { width: 110, height: 165, gap: 18, maxWidth: '92vw', titleFontSize: 22 },
  targetName: '艾伦', expansionKey: '地神的潜影', swapBlindHandRef: { current: null },
  handleSwapBlindDrawSelect: vi.fn(),
});

const cardSlots = html => [...html.matchAll(/<button\b[^>]*data-blind-card-index="\d+"[^>]*>/g)].map(match => match[0]);

describe('blind draw controls', () => {
  it('exposes named native buttons without revealing hidden card identities', () => {
    const html = renderToString(<SwapBlindDrawOverlay {...blindDrawProps()} />);
    const slots = cardSlots(html);
    expect(slots).toHaveLength(2);
    slots.forEach((slot, index) => {
      expect(slot).toContain('type="button"');
      expect(slot).toContain(`aria-label="暗抽第 ${index + 1} 张牌"`);
      expect(slot).not.toContain('disabled=');
    });
    expect(html).not.toContain('不得暴露的隐藏牌');
    expect(html).not.toContain('另一张隐藏牌');
  });

  it('names a revealed card using its already public identity', () => {
    const props = blindDrawProps();
    props.swapBlindDraw.handSnapshot[0].isFaceUp = true;
    props.swapBlindDraw.handSnapshot[0].card.name = '已公开的石刻';
    const html = renderToString(<SwapBlindDrawOverlay {...props} />);
    expect(cardSlots(html)[0]).toContain('aria-label="抽取第 1 张牌：已公开的石刻"');
    expect(html).not.toContain('另一张隐藏牌');
  });

  it.each(['shuffling', 'flying'])('disables all card slots during %s', phase => {
    const html = renderToString(<SwapBlindDrawOverlay {...blindDrawProps(phase)} />);
    const slots = cardSlots(html);
    expect(slots).toHaveLength(2);
    slots.forEach(slot => expect(slot).toContain('disabled=""'));
    expect(html).not.toContain('不得暴露的隐藏牌');
    expect(html).not.toContain('另一张隐藏牌');
  });

  it('passes the chosen snapshot index once through the native click callback', () => {
    vi.spyOn(React, 'useState').mockReturnValue([{}, vi.fn()]);
    vi.spyOn(React, 'useLayoutEffect').mockImplementation(() => {});
    const props = blindDrawProps();
    props.swapBlindDraw.handSnapshot[1].idx = 4;
    const tree = SwapBlindDrawOverlay(props);
    const slot = tree.props.children[1].props.children[1];
    expect(slot.type).toBe('button');
    expect(slot.props.disabled).toBe(false);
    slot.props.onClick();
    expect(props.handleSwapBlindDrawSelect).toHaveBeenCalledExactlyOnceWith(4);
  });
});

describe('blind draw flight', () => {
  it('keeps a hidden card hidden while flying from its measured slot into a larger hand', () => {
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 });
    const html = renderToString(<SwapBlindDrawOverlay
      swapBlindDraw={{ phase: 'flying', targetPi: 1, selectedIdx: 0,
        handSnapshot: [{ idx: 0, isFaceUp: false, card: { id: 'secret', name: '不得暴露的隐藏牌', key: 'A1' } }],
        flyFrom: { x: 420, y: 280, width: 110, rotation: 0, tilt: 0 },
        flyTo: { x: 720, y: 590, width: 230, rotation: -7, tilt: 0 },
      }}
      swapBlindCardLayout={{ width: 110, height: 165, gap: 18, maxWidth: '92vw', titleFontSize: 22 }}
      targetName="艾伦" expansionKey="地神的潜影" swapBlindHandRef={{ current: null }} handleSwapBlindDrawSelect={() => {}}
    />);
    expect(html).not.toContain('不得暴露的隐藏牌');
    expect(html).toContain('data-card-back=');
    const planeStyle = html.match(/data-blind-card-plane="true" style="([^"]+)"/)[1];
    expect(cardSlots(html)[0]).toContain('width:110px');
    expect(cardSlots(html)[0]).toContain('box-sizing:border-box;padding:0;margin:0;border:0;');
    expect(planeStyle).toContain('position:fixed;left:420px;top:280px');
    expect(planeStyle).toContain('width:230px');
    expect(planeStyle).toContain('margin-left:-115px');
    expect(planeStyle).toContain('--tx:300px;--ty:310px');
    expect(planeStyle).toContain('--from-scale:0.4782608695652174;--to-scale:1');
    expect(planeStyle).toContain('--from-tilt:0deg;--to-tilt:0deg');
    expect(planeStyle).toContain('swapBlindFlyCard 0.7s');
  });
});
