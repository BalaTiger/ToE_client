import { describe, expect, it } from 'vitest';
import { buildBattleResponsiveLayout } from '../useBattleResponsiveLayout';

describe('buildBattleResponsiveLayout', () => {
  it('keeps portrait phone board layout compact while enlarging interaction text', () => {
    const layout = buildBattleResponsiveLayout(390, 844);

    expect(layout.isMobile).toBe(true);
    expect(layout.isMobileLandscape).toBe(false);
    expect(layout.compactBoardScaleRatio).toBe(1);
    expect(layout.boardScaleRatio).toBeCloseTo(390 / 1200);
    expect(layout.middleRowHeight).toBe(292);
    expect(layout.interactionFontSizes.body).toBeGreaterThan(layout.fontSizes.body);
    expect(layout.mobileHandUsesCompact).toBe(false);
    expect(layout.selfHandCardScale).toBeCloseTo(1200 / 390);
  });

  it('keeps larger portrait phones on the portrait strategy', () => {
    const layout = buildBattleResponsiveLayout(430, 932);

    expect(layout.isMobile).toBe(true);
    expect(layout.isMobileLandscape).toBe(false);
    expect(layout.compactBoardScaleRatio).toBe(1);
    expect(layout.middleRowHeight).toBe(292);
    expect(layout.mobileHandUsesCompact).toBe(false);
  });

  it('uses a separate compressed strategy for phone landscape', () => {
    const layout = buildBattleResponsiveLayout(844, 390);

    expect(layout.isMobile).toBe(false);
    expect(layout.isMobileLandscape).toBe(true);
    expect(layout.mobileZoomCompensate).toBeCloseTo(1.14);
    expect(layout.layoutScaleRatio).toBeCloseTo(1 / 1.14);
    expect(layout.boardScaleRatio).toBe(layout.layoutScaleRatio);
    expect(layout.compactBoardScaleRatio).toBe(layout.layoutScaleRatio);
    expect(layout.middleRowHeight).toBe(150);
    expect(layout.mobileHandUsesCompact).toBe(true);
    expect(layout.selfHandCardScale).toBeCloseTo(1.14);
  });

  it('keeps larger phone landscape on the height-fit strategy', () => {
    const layout = buildBattleResponsiveLayout(932, 430);

    expect(layout.isMobile).toBe(false);
    expect(layout.isMobileLandscape).toBe(true);
    expect(layout.mobileZoomCompensate).toBeCloseTo(1.14);
    expect(layout.layoutScaleRatio).toBeCloseTo(1 / 1.14);
    expect(layout.middleRowHeight).toBe(150);
    expect(layout.mobileHandUsesCompact).toBe(true);
  });

  it('keeps desktop at the base layout until the upscale threshold', () => {
    const layout = buildBattleResponsiveLayout(1200, 800);

    expect(layout.isMobile).toBe(false);
    expect(layout.isMobileLandscape).toBe(false);
    expect(layout.scaleRatio).toBe(1);
    expect(layout.mobileZoomCompensate).toBe(1);
    expect(layout.boardScaleRatio).toBe(1);
    expect(layout.middleRowHeight).toBe(282);
  });
});
