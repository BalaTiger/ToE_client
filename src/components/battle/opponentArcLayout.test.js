import { describe, expect, it } from 'vitest';
import { getOpponentArcLayout } from './opponentArcLayout';

describe('opponent arc geometry', () => {
  it.each([1, 4, 5, 7, 11])('keeps %i seats in one symmetric arch inside the available width', count => {
    const { panelWidth, step, seats } = getOpponentArcLayout(count, 1180);
    expect(panelWidth + step * (count - 1)).toBeLessThanOrEqual(1140);
    seats.forEach((seat, index) => {
      const mirror = seats[count - index - 1];
      expect(seat.y).toBeCloseTo(mirror.y);
      expect(seat.rotation).toBeCloseTo(-mirror.rotation);
    });
    if (count > 5) {
      expect(step).toBeLessThan(panelWidth);
      expect(step / panelWidth).toBeCloseTo(0.94);
    }
    if (count > 2) expect(seats[0].y).toBeGreaterThan(seats[Math.floor(count / 2)].y);
  });
  it('retains readable physical panel width in a zoomed, horizontally scrollable compact arch', () => {
    const zoom = 0.325;
    const panelMinimum = 136 / zoom;
    const width = panelMinimum * (1 + 6 * 0.94) + 20;
    const layout = getOpponentArcLayout(7, width, true, panelMinimum);
    expect(layout.panelWidth * zoom).toBeCloseTo(136);
    expect(layout.step).toBeLessThan(layout.panelWidth);
    expect(layout.step / layout.panelWidth).toBeCloseTo(0.94);
    expect(layout.panelWidth + layout.step * 6).toBeLessThanOrEqual(width);
    expect(layout.depth * zoom).toBeGreaterThan(20);
  });
});
