import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PileDisplay } from '../board';
import { CoastalBoardEffects } from './CoastalBoardEffects';

const appearance = vi.hoisted(() => ({ battleLayout: 'coastal' }));
vi.mock('../../ui/UiAppearance', () => ({ useUiAppearance: () => ({ appearance }) }));

beforeEach(() => { vi.stubGlobal('window', { __PUBLIC_BASE__: '/' }); });
afterEach(() => {
  vi.unstubAllGlobals();
  appearance.battleLayout = 'coastal';
});

describe('coastal persistent board effects', () => {
  it('leaves no empty rail when effects are inactive or have no usable progress', () => {
    const hiddenStates = [
      {},
      { formula: { active: false, progress: 3 }, night: { active: false }, houndsActive: false, secondsLeft: 8 },
      ...[undefined, null, NaN, Infinity, '3'].map(progress => ({ formula: { active: true, progress } })),
      { houndsActive: true, secondsLeft: null },
      { houndsActive: true },
    ];
    for (const props of hiddenStates) {
      expect(renderToStaticMarkup(<CoastalBoardEffects {...props} />)).toBe('');
    }
  });

  it('keeps all three concurrent effects and their current values visible', () => {
    const markup = renderToStaticMarkup(<CoastalBoardEffects
      formula={{ active: true, progress: 4 }}
      night={{ active: true, count: 7, limit: 12 }}
      houndsActive secondsLeft={8}
    />);
    expect(markup).toContain('aria-label="场上持续效果"');
    expect(markup).toContain('title="石化配方进度：4"');
    expect(markup).toContain('data-dice-value="4"');
    expect(markup.match(/data-dice-value=/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="长夜进度 7/12"');
    expect(markup).toContain('<strong>7 / 12</strong>');
    expect(markup).toContain('aria-label="廷达罗斯猎犬，剩余 8 秒"');
    expect(markup).toContain('<strong>8 秒</strong>');
  });

  it('does not treat a zero countdown or initial night progress as inactive', () => {
    const markup = renderToStaticMarkup(<CoastalBoardEffects
      night={{ active: true, count: 0, limit: 12 }} houndsActive secondsLeft={0}
    />);
    expect(markup).toContain('aria-label="长夜进度 0/12"');
    expect(markup).toContain('aria-label="廷达罗斯猎犬，剩余 0 秒"');
    expect(markup).toContain('<strong>0 秒</strong>');
    expect(markup).not.toContain('石化配方进度');
  });

  it('removes the old formula position only from coastal piles', () => {
    const props = {
      deckCount: 20, inspectionCount: 10, discardCount: 0, discardCards: [], scaleRatio: 1,
      petrifyingFormula: { active: true, progress: 3 },
    };
    const coastal = renderToStaticMarkup(<PileDisplay {...props} />);
    expect(coastal).not.toContain('石化配方进度');
    expect(coastal).not.toContain('data-dice-value');
    for (const selector of ['data-deck-pile', 'data-inspection-pile', 'data-discard-pile']) {
      expect(coastal).toContain(selector);
    }

    appearance.battleLayout = 'arch';
    const arch = renderToStaticMarkup(<PileDisplay {...props} />);
    expect(arch).toContain('title="石化配方进度：3"');
    expect(arch.match(/data-dice-value="3"/g)).toHaveLength(1);
  });
});
