import { describe, expect, it } from 'vitest';
import { buildBattleResponsiveLayout } from './useBattleResponsiveLayout';

describe('buildBattleResponsiveLayout', () => {
  it('uses partial board compensation on narrow desktop so middle-row piles shrink with the hand area', () => {
    const layout = buildBattleResponsiveLayout(900, 800);

    expect(layout.scaleRatio).toBeCloseTo(0.75);
    expect(layout.boardScaleRatio).toBeCloseTo(Math.sqrt(0.75));
    expect(layout.compactBoardScaleRatio).toBeCloseTo(Math.sqrt(0.75));
  });
});
