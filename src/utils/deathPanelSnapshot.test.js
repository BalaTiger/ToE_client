import { afterEach, expect, it, vi } from 'vitest';
import { captureDeathPanelSnapshot } from './deathPanelSnapshot';

const loader = vi.hoisted(() => {
  let release;
  return {
    loaded: new Promise(resolve => { release = resolve; }),
    release: () => release(),
    render: vi.fn(async () => ({ toDataURL: () => 'data:image/png;base64,compact' })),
  };
});
vi.mock('html2canvas', async () => {
  await loader.loaded;
  return { default: loader.render };
});

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('remeasures a panel collapsed while html2canvas loads so the death image is not stretched', async () => {
  let rect = { left: 500, top: 10, width: 154, height: 170 };
  let style = { background: '#111', borderTopColor: '#444', boxShadow: '0 2px 3px #000' };
  const panel = {
    getBoundingClientRect: () => rect,
    get offsetWidth() { return rect.width; },
    get offsetHeight() { return rect.height; },
  };
  vi.stubGlobal('document', { querySelector: () => panel });
  vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 680, getComputedStyle: () => style });

  const capture = captureDeathPanelSnapshot(3);
  expect(loader.render).not.toHaveBeenCalled();
  rect = { left: 540, top: 12, width: 64, height: 118 };
  style = { background: '#090c0d', borderTopColor: 'transparent', boxShadow: 'none' };
  loader.release();
  const snapshot = await capture;

  expect(loader.render).toHaveBeenCalledWith(panel, expect.objectContaining({ width: 64, height: 118 }));
  expect(snapshot).toMatchObject({
    pi: 3, x: 540, y: 12, w: 64, h: 118, cx: 572, cy: 71,
    snapshotUrl: 'data:image/png;base64,compact',
    panelBackground: '#090c0d', panelBorderColor: 'transparent', panelBoxShadow: 'none',
  });
});

it('includes visible self-side tags in the death image with zoom-compensated bounds', async () => {
  const rail = { getBoundingClientRect: () => ({ left: 310, top: 228, width: 136, height: 120 }) };
  const panel = {
    getBoundingClientRect: () => ({ left: 20, top: 200, width: 300, height: 600 }),
    offsetWidth: 150,
    offsetHeight: 300,
    querySelector: () => rail,
  };
  vi.stubGlobal('document', { querySelector: () => panel });
  vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 900, getComputedStyle: () => ({ visibility: 'visible', opacity: '1' }) });

  const snapshot = await captureDeathPanelSnapshot(0);

  expect(loader.render).toHaveBeenCalledWith(panel, expect.objectContaining({ x: 0, y: 0, width: 213, height: 300 }));
  expect(snapshot).toMatchObject({ pi: 0, x: 20, y: 200, w: 426, h: 600, cx: 233, cy: 500 });
  expect(panel.offsetWidth).toBe(150);
});

it.each([
  [0, 'hidden'],
  [1, 'visible'],
])('does not expand player %s for an inapplicable side rail (%s)', async (idx, visibility) => {
  const rail = { getBoundingClientRect: () => ({ left: 245, top: 30, width: 68, height: 120 }) };
  const panel = {
    getBoundingClientRect: () => ({ left: 100, top: 20, width: 150, height: 300 }),
    offsetWidth: 150,
    offsetHeight: 300,
    querySelector: () => rail,
  };
  vi.stubGlobal('document', { querySelector: () => panel });
  vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 680, getComputedStyle: () => ({ visibility, opacity: '1' }) });

  const snapshot = await captureDeathPanelSnapshot(idx);

  expect(loader.render).toHaveBeenCalledWith(panel, expect.objectContaining({ width: 150, height: 300 }));
  expect(snapshot).toMatchObject({ pi: idx, x: 100, y: 20, w: 150, h: 300, cx: 175, cy: 170 });
});
