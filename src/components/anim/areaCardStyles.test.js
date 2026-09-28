import { describe, expect, it } from 'vitest';
import { AREA_CARD_ANIMATION_STYLES } from './areaCardStyles';

function getRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = AREA_CARD_ANIMATION_STYLES.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] || '';
}

describe('etherealize panel snapshot styles', () => {
  it('keeps a visual bleed around clipped panel copies', () => {
    const stageRule = getRule('.etherealize-stage');
    const sliceRule = getRule('.etherealize-slice');
    const unifiedRule = getRule('.etherealize-unified-panel');
    const htmlRule = getRule('.etherealize-panel-html');

    expect(stageRule).toContain('--ethereal-panel-bleed: 28px');
    expect(sliceRule).toContain('inset: calc(0px - var(--ethereal-panel-bleed))');
    expect(sliceRule).toContain('overflow: hidden');
    expect(unifiedRule).toContain('inset: calc(0px - var(--ethereal-panel-bleed))');
    expect(unifiedRule).toContain('overflow: hidden');
    expect(htmlRule).toContain('left: var(--ethereal-panel-bleed)');
    expect(htmlRule).toContain('top: var(--ethereal-panel-bleed)');
    expect(htmlRule).toContain('width: calc(100% - var(--ethereal-panel-bleed) - var(--ethereal-panel-bleed))');
    expect(htmlRule).toContain('height: calc(100% - var(--ethereal-panel-bleed) - var(--ethereal-panel-bleed))');
  });
});
