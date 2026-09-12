import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerPanel } from './index';

afterEach(() => vi.unstubAllGlobals());

describe('battle player presentation', () => {
  it('preserves canonical card frames and animation-owned HP/SAN', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const markup = renderToStaticMarkup(
      <PlayerPanel
        player={{ role: '寻宝者', name: '旅者', hp: 10, san: 10, hand: [1, 2, 3, 4].map(id => ({ id })), zoneCards: [] }}
        playerIndex={1}
        isCurrentTurn={false}
        displayStats={[null, { hp: 4, san: 6 }]}
        scaleRatio={1}
        viewportWidth={1280}
      />,
    );
    expect(markup.match(/aspect-ratio:392\s*\/\s*590/g)).toHaveLength(4);
    const hp = markup.slice(markup.indexOf('data-stat-label="HP"'), markup.indexOf('data-stat-label="SAN"'));
    expect(hp).toContain('>4</span>');
    expect(hp).not.toContain('>10</span>');
    expect(markup.slice(markup.indexOf('data-stat-label="SAN"'))).toContain('>6</span>');
    expect(markup).toContain('data-death-panel="1"');
    expect(markup).toContain('data-player-hand-strip="1"');
  });
});
