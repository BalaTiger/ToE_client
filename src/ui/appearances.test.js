import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UI_APPEARANCE_KEY,
  UI_APPEARANCES,
  applyUiAppearance,
  readUiAppearance,
  resolveUiAppearance,
  selectUiAppearance,
} from './appearances';

afterEach(() => vi.unstubAllGlobals());

describe('UI appearance preference', () => {
  it('selects and persists coastal while expansion themes change independently', () => {
    const values = new Map([['expansionKey', 'SHU']]);
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    expect(UI_APPEARANCES.find(item => item.id === 'coastal')?.label).toContain('3号');
    expect(selectUiAppearance('coastal', storage).battleLayout).toBe('coastal');
    expect(values.get(UI_APPEARANCE_KEY)).toBe('coastal');
    expect(values.get('expansionKey')).toBe('SHU');
    values.set('expansionKey', 'CTH');
    expect(readUiAppearance(storage).id).toBe('coastal');
    expect(readUiAppearance(storage).assets.skill).toContain('/coastal/action-skill-b.webp');
    expect([...values.keys()]).toEqual(['expansionKey', UI_APPEARANCE_KEY]);
  });

  it('switches and restores the local composition without writing an expansion setting', () => {
    const values = new Map([['expansionKey', 'SHU']]);
    const storage = {
      getItem: key => values.get(key),
      setItem: (key, value) => values.set(key, value),
    };
    expect(readUiAppearance(storage).id).toBe('arcane-table');
    expect(selectUiAppearance('classic', storage).battleLayout).toBe('grid');
    expect(readUiAppearance(storage).id).toBe('classic');
    expect(values.get('expansionKey')).toBe('SHU');
    expect([...values.keys()]).toEqual(['expansionKey', UI_APPEARANCE_KEY]);
    expect(selectUiAppearance('arcane-table', storage).assets.handTable).toContain('table-weathered.webp');
  });

  it('uses valid preview URLs ahead of saved preferences without persisting the preview', () => {
    const storage = { getItem: () => 'classic', setItem: vi.fn() };
    expect(readUiAppearance(storage, '?ui-appearance=arcane-table').id).toBe('arcane-table');
    expect(readUiAppearance(storage, '?ui-appearance=missing').id).toBe('arcane-table');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('falls back safely for unknown IDs, missing storage, and blocked storage', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(readUiAppearance(null).id).toBe('arcane-table');
    expect(readUiAppearance({ getItem: () => 'removed-layout' }).id).toBe('arcane-table');
    expect(readUiAppearance(storage).id).toBe('arcane-table');
    expect(selectUiAppearance('classic', storage).id).toBe('classic');
    expect(selectUiAppearance('missing', storage).id).toBe('arcane-table');
  });

  it('applies appearance to the document root and removes old variables when switching', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: './' });
    const attributes = new Map();
    const styles = new Map([['--toe-ui-accent', '#123456'], ['--unrelated', 'preserved']]);
    const root = {
      getAttribute: key => attributes.get(key) ?? null,
      setAttribute: (key, value) => attributes.set(key, value),
      removeAttribute: key => attributes.delete(key),
      style: {
        getPropertyValue: name => styles.get(name) ?? '',
        setProperty: (name, value) => styles.set(name, value),
        removeProperty: name => styles.delete(name),
      },
    };
    const cleanup = applyUiAppearance({
      ...resolveUiAppearance('arcane-table'),
      cssVariables: { '--toe-ui-accent': '#abcdef', '--experiment-only': '17px' },
    }, root);
    expect(attributes.get('data-ui-appearance')).toBe('arcane-table');
    expect(attributes.get('data-ui-layout')).toBe('arch');
    expect(styles.get('--toe-action-skill-image')).toBe("url('./img/ui/hand-table/skill.webp')");
    expect(styles.get('--toe-ui-accent')).toBe('#abcdef');
    cleanup();
    expect(styles.has('--experiment-only')).toBe(false);
    expect(styles.get('--toe-ui-accent')).toBe('#123456');
    expect(attributes.has('data-ui-appearance')).toBe(false);
    expect(attributes.has('data-ui-layout')).toBe(false);

    applyUiAppearance(resolveUiAppearance('classic'), root);
    expect(attributes.get('data-ui-appearance')).toBe('classic');
    expect(attributes.get('data-ui-layout')).toBe('grid');
    expect(styles.get('--unrelated')).toBe('preserved');

    const cleanupAlternate = applyUiAppearance({ ...resolveUiAppearance('arcane-table'), id: 'alternate' }, root);
    expect(attributes.get('data-ui-appearance')).toBe('alternate');
    expect(attributes.get('data-ui-layout')).toBe('arch');
    cleanupAlternate();
    expect(attributes.get('data-ui-appearance')).toBe('classic');
    expect(attributes.get('data-ui-layout')).toBe('grid');
  });
});
