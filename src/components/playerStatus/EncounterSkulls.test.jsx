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
});
