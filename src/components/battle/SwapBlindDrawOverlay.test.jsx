import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SwapBlindDrawOverlay } from './SwapBlindDrawOverlay';

afterEach(() => vi.unstubAllGlobals());

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
    expect(html).toContain('data-blind-card-index="0" style="position:relative;width:110px');
    expect(planeStyle).toContain('position:fixed;left:420px;top:280px');
    expect(planeStyle).toContain('width:230px');
    expect(planeStyle).toContain('margin-left:-115px');
    expect(planeStyle).toContain('--tx:300px;--ty:310px');
    expect(planeStyle).toContain('--from-scale:0.4782608695652174;--to-scale:1');
    expect(planeStyle).toContain('--from-tilt:0deg;--to-tilt:0deg');
    expect(planeStyle).toContain('swapBlindFlyCard 0.7s');
  });
});
