import { afterAll, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import VisualGallery, { GalleryScenePreview } from './VisualGallery';

vi.mock('react-dom', async importOriginal => ({
  ...await importOriginal(),
  createPortal: children => children,
}));

vi.hoisted(() => {
  vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 });
  vi.stubGlobal('document', { body: {}, querySelector: () => null });
});
afterAll(() => vi.unstubAllGlobals());

describe('fixed functional UI gallery', () => {
  it('has unique, directly addressable scenes', () => {
    const ids = VisualGallery.scenes.map(scene => scene[0]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders the same long-description card at the four requested widths with live captions', () => {
    const scene = VisualGallery.scenes.find(item => item[0] === 'card-clarity');
    const html = renderToString(<GalleryScenePreview scene={scene} expansionKey="地神的潜影" onAction={() => {}} onScene={() => {}} />);
    for (const width of [82, 124, 196, 300]) expect(html).toContain(`data-clarity-width="${width}"`);
    expect(html.match(/data-rendered-card-id="gallery-clarity-zone"/g)).toHaveLength(4);
    expect(html.match(/data-card-caption="true"/g)).toHaveLength(8);
    expect(html).toContain('data-card-kind="god"');
    expect(html).toContain('data-card-kind="token"');
  });

  it.each(VisualGallery.scenes.map(scene => [scene[0], scene]))('renders %s without running game orchestration', (_id, scene) => {
    const html = renderToString(<GalleryScenePreview scene={scene} expansionKey="地神的潜影" onAction={() => {}} onScene={() => {}} />);
    expect(html.length).toBeGreaterThan(100);
  });
});
