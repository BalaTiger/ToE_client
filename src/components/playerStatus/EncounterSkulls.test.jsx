import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EncounterSkulls } from './EncounterSkulls';
import { PlayerStatusTags } from './PlayerStatusTags';

afterEach(() => vi.unstubAllGlobals());

describe('encounter skull ornaments', () => {
  it.each([0, 1, 8, 17])('renders all %i skulls as images without visible count text', count => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const markup = renderToStaticMarkup(<EncounterSkulls count={count} playerIndex={2} />);
    expect((markup.match(/<img /g) || []).length).toBe(count);
    expect(markup.replace(/<[^>]*>/g, '')).toBe('');
    if (count) {
      expect(markup).toContain(`aria-label="骷髅标记：${count} 枚"`);
      expect(markup).toContain('data-encounter-skulls="2"');
      expect(markup).toContain(`--toe-skull-columns:${Math.min(count, 8)}`);
    } else {
      expect(markup).toBe('');
    }
  });

  it.each(['compact', 'stack', 'pendant'])('keeps skulls out of the %s status region', variant => {
    const markup = renderToStaticMarkup(<PlayerStatusTags player={{ godEncounters: 8 }} playerIndex={1} variant={variant} />);
    expect(markup).toBe('');
  });

  it.each([1, 5, 6, 7, 10, 17, 30])('fits all %i portrait skulls to one left rim by uniformly shrinking them', count => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const markup = renderToStaticMarkup(<EncounterSkulls count={count} playerIndex={2} variant="portrait-arc" />);
    expect(markup).toContain('data-skull-layout="portrait-arc"');
    expect(markup.replace(/<[^>]*>/g, '')).toBe('');
    const skulls = [...markup.matchAll(/<img [^>]*style="left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%"/g)];
    expect(skulls).toHaveLength(count);
    const points = [];
    for (const [, leftValue, topValue, widthValue] of skulls) {
      const [left, top, width] = [leftValue, topValue, widthValue].map(Number);
      // The 50px portrait sits 6px inside the 64px death snapshot root.
      expect(6 + (left - width / 2) / 100 * 50).toBeGreaterThanOrEqual(0);
      expect(left + width / 2).toBeLessThanOrEqual(50);
      expect(top - width / 2).toBeGreaterThanOrEqual(0);
      expect(top + width / 2).toBeLessThanOrEqual(100);
      const x = left / 100 * 50, y = top / 100 * 51;
      expect(Math.hypot(x - 25, y - 25.5)).toBeCloseTo(22);
      expect(Math.abs(Math.atan2(y - 25.5, 25 - x))).toBeLessThanOrEqual(65 * Math.PI / 180 + 1e-10);
      expect(width).toBe(Number(skulls[0][3]));
      expect(width).toBeLessThanOrEqual(20);
      points.push([x, y, width / 100 * 50]);
    }
    for (let i = 1; i < points.length; i++) {
      expect(points[i][1]).toBeGreaterThan(points[i - 1][1]);
      expect(Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])).toBeGreaterThan(points[i][2]);
    }
    if (count > 5) expect(points[0][2]).toBeLessThan(10);
  });
});
