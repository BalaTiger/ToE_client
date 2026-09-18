import { describe, expect, it } from 'vitest';
import { getTutorialTooltipPosition } from './tutorialPosition';

const intersects = (position, width, height, rect) => position.left < rect.right && position.left + width > rect.left
  && position.top < rect.bottom && position.top + height > rect.top;

describe('tutorial placement on the coastal composition', () => {
  it.each([
    ['left character sidebar', 1280, 720, { left: 12, top: 180, right: 194, bottom: 430 }, 300, 240],
    ['upper opponents on a phone', 844, 390, { left: 200, top: 0, right: 664, bottom: 88 }, 300, 240],
    ['lower hand on a phone', 844, 390, { left: 150, top: 200, right: 644, bottom: 390 }, 300, 180],
    ['right skill plaque on a phone', 844, 390, { left: 676, top: 270, right: 830, bottom: 316 }, 300, 230],
  ])('keeps %s readable and clickable', (_, vw, vh, rect, width, height) => {
    const position = getTutorialTooltipPosition({ rect, width, height, vw, vh });
    expect(position.left).toBeGreaterThanOrEqual(10);
    expect(position.top).toBeGreaterThanOrEqual(10);
    expect(position.left + width).toBeLessThanOrEqual(vw - 10);
    expect(position.top + height).toBeLessThanOrEqual(vh - 10);
    expect(intersects(position, width, height, rect)).toBe(false);
  });

  it('avoids both the reveal card and its actual keep button', () => {
    const card = { left: 344, top: 15, right: 500, bottom: 255 };
    const button = { left: 312, top: 274, right: 420, bottom: 321 };
    const position = getTutorialTooltipPosition({ rect: button, width: 300, height: 220, vw: 844, vh: 390, avoid: [card] });
    expect(intersects(position, 300, 220, card)).toBe(false);
    expect(intersects(position, 300, 220, button)).toBe(false);
  });

  it('keeps an oversized explanation within the short viewport scroll area', () => {
    expect(getTutorialTooltipPosition({ width: 300, height: 700, vw: 844, vh: 390, centered: true }))
      .toEqual({ left: 272, top: 10 });
  });
});
