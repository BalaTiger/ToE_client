import { describe, expect, it } from 'vitest';
import { CARD_FACE_RATIO } from '../cards/CardFaceAssets';
import { COASTAL_HAND_HOVER, COASTAL_HAND_SELECTED_LIFT, COASTAL_PILE_CLEARANCE, getCoastalGeometry } from './coastalGeometry';

const viewports = [[1280, 720], [1600, 900], [2548, 1303], [1920, 800]];

describe('coastal shared play space', () => {
  it.each(viewports.flatMap(([width, height]) => [2, 4, 5, 8].map(count => [width, height, count])))(
  'keeps rotated and hovered hands clear of piles at %ix%i with %i cards', (viewportWidth, viewportHeight, count) => {
    const zoom = viewportWidth / 1200;
    const geometry = getCoastalGeometry({ width: 1200, height: Math.max(620, viewportHeight / zoom), handCount: count, rolesBottom: 210 });
    const { hand, piles, actions } = geometry;
    expect(hand.cardHeight / hand.cardWidth).toBeCloseTo(CARD_FACE_RATIO);
    expect(hand.step / hand.cardWidth).toBeCloseTo(.8);
    expect(hand.right).toBe(actions.left - 16);
    expect(hand.width).toBeLessThanOrEqual(hand.right - hand.left);
    expect(piles.top).toBeGreaterThanOrEqual(geometry.rolesBottom + 18);
    expect(piles.height).toBeGreaterThanOrEqual(108);
    for (let index = 0; index < count; index++) {
      const x = (index - (count - 1) / 2) * hand.step;
      const angle = Math.atan(x / hand.radius);
      const baseline = hand.top + hand.paddingTop - hand.lift + x * x / (2 * hand.radius);
      const topCorner = baseline - Math.abs(Math.sin(angle)) * hand.cardWidth / 2;
      const bottomCorner = baseline + Math.cos(angle) * hand.cardHeight + Math.abs(Math.sin(angle)) * hand.cardWidth / 2;
      expect((topCorner - COASTAL_HAND_HOVER - COASTAL_HAND_SELECTED_LIFT - piles.top - piles.height) * zoom)
        .toBeGreaterThanOrEqual(COASTAL_PILE_CLEARANCE * zoom - .001);
      expect(bottomCorner).toBeLessThanOrEqual(geometry.height - geometry.bottomInset + .001);
    }
  });

  it.each([210, 310, 420])('reserves a scrollable log above controls whose measured height is %ipx', controlsHeight => {
    const geometry = getCoastalGeometry({ height: 620, handCount: 5, controlsHeight });
    expect(geometry.log.height).toBeGreaterThanOrEqual(100);
    expect(geometry.log.height).toBeLessThanOrEqual(175);
    expect(geometry.actions.top - geometry.log.top - geometry.log.height).toBeGreaterThanOrEqual(12);
    expect(geometry.actions.top + controlsHeight + 24).toBe(geometry.height - geometry.bottomInset);
    if (controlsHeight === 420) expect(geometry.height).toBeGreaterThan(620);
  });

  it('recalculates after role content grows or the viewport height changes', () => {
    const base = getCoastalGeometry({ height: 675, rolesBottom: 190, handCount: 4 });
    const tallerRoles = getCoastalGeometry({ height: 675, rolesBottom: 245, handCount: 4 });
    const shortScreen = getCoastalGeometry({ height: 620, rolesBottom: 190, handCount: 4 });
    expect(tallerRoles.hand.cardWidth).toBeLessThan(base.hand.cardWidth);
    expect(shortScreen.hand.cardWidth).toBeLessThan(base.hand.cardWidth);
    const crowdedRoles = getCoastalGeometry({ height: 620, rolesBottom: 360, handCount: 8 });
    expect(crowdedRoles.height).toBeGreaterThan(620);
    expect(crowdedRoles.piles.top).toBeGreaterThan(360);
  });

  it('keeps empty-hand and single-card states finite and usable', () => {
    for (const handCount of [0, 1]) {
      const { hand, piles } = getCoastalGeometry({ handCount });
      expect(Number.isFinite(hand.cardWidth)).toBe(true);
      expect(hand.top - COASTAL_HAND_HOVER - COASTAL_HAND_SELECTED_LIFT - piles.top - piles.height).toBeGreaterThanOrEqual(COASTAL_PILE_CLEARANCE - .001);
    }
  });
});
