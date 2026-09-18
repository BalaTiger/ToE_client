import { afterAll, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import VisualGallery, { GalleryScenePreview } from './VisualGallery';
import { getBattleBackgroundImage } from '../constants/theme';

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

  it.each([
    ['群星呼唤', 'toeDrawBackgroundSea', '50% 32%'],
    ['地神的潜影', 'toeDrawBackgroundWalk', '50% 48%'],
    ['未知主题', 'toeDrawBackgroundWalk', '50% 48%'],
  ])('binds the %s exploration camera and background to the battle root', (expansionKey, animation, origin) => {
    const scene = VisualGallery.scenes.find(item => item[0] === 'battle-camera');
    const html = renderToString(<GalleryScenePreview scene={scene} expansionKey={expansionKey} onAction={() => {}} onScene={() => {}} />);
    const root = html.match(/<div class="toe-battle-root toe-draw-camera-active"[^>]*>/)?.[0];
    expect(root).toContain(`--toe-draw-camera-animation:${animation}`);
    expect(root).toContain(`--toe-draw-camera-origin:${origin}`);
    expect(root).toContain('--toe-battle-bg-image:linear-gradient(180deg,');
    expect(root).toContain(getBattleBackgroundImage(expansionKey));
    expect(root).toContain('--toe-battle-bg-size:cover, cover');
    expect(root).toContain('--toe-battle-bg-repeat:no-repeat, no-repeat');
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

  it.each(['flight-self-discard', 'flight-opponent-self', 'flight-self-opponent', 'flight-pile-self', 'flight-pile-opponent', 'flight-reveal-self', 'flight-reveal-opponent'])('keeps %s anchored to the full battle with replay and freeze controls', id => {
    const scene = VisualGallery.scenes.find(item => item[0] === id);
    const html = renderToString(<GalleryScenePreview scene={scene} expansionKey="地神的潜影" onAction={() => {}} onScene={() => {}} />);
    expect(html).toContain('toe-battle-root');
    expect(html).toContain('data-self-hand-card=');
    expect(html).toContain('data-player-hand-strip="1"');
    expect(html).toContain('data-deck-pile=');
    expect(html).toContain('data-discard-pile=');
    expect(html).toContain(`data-flight-preview="${id}"`);
    expect(html).toContain('重播飞行');
    expect(html).toContain('aria-label="飞行定格进度"');
  });

  it.each([4, 5, 11])('keeps the player and current turn complete with %i other characters', count => {
    const scene = VisualGallery.scenes.find(item => item[0] === `battle-opponents-${count}`);
    const html = renderToString(<GalleryScenePreview scene={scene} expansionKey="地神的潜影" onAction={() => {}} onScene={() => {}} />);
    const collapsed = count >= 5 ? count - 1 : 0;
    expect(html.match(/data-opponent-simplified="true"/g) || []).toHaveLength(collapsed);
    expect(html.match(/data-opponent-simplified="false"/g) || []).toHaveLength(count - collapsed);
    expect(html.match(/data-opponent-collapsible="true"/g) || []).toHaveLength(collapsed);
    const handStrips = [...html.matchAll(/data-player-hand-strip="(\d+)"/g)].map(match => Number(match[1]));
    expect(handStrips).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(html.match(/data-skull-layout="portrait-arc"/g) || []).toHaveLength(collapsed);
    expect(html.match(/src="[^"]*encounter-skull.webp"/g)).toHaveLength((count + 1) * 2 + (count === 11 ? 8 : 0));

    const currentPanel = html.match(/<div[^>]*data-death-panel="4"[^>]*>/)?.[0];
    expect(currentPanel).toContain('data-current-turn="true"');
    expect(currentPanel).toContain('data-opponent-simplified="false"');
    const self = html.match(/<div[^>]*data-pid="0"[^>]*>/)?.[0];
    expect(self).toBeDefined();
    expect(self).not.toContain('data-opponent-collapsible');
    expect(html).toContain('data-self-hand-card=');
    expect(html).toContain('aria-label="切换当前回合角色"');
    if (count === 11) {
      expect(html).toContain('简化面板断头台');
      expect(html).toContain('简化面板石化');
      expect(html).toContain('data-roster-death-preview="idle"');
      expect(html).toContain('data-snapshot-count="0"');
      expect(html).toContain('aria-label="骷髅标记：10 枚"');
    }
  });

  it.each(VisualGallery.scenes.map(scene => [scene[0], scene]))('renders %s without running game orchestration', (_id, scene) => {
    const html = renderToString(<GalleryScenePreview scene={scene} expansionKey="地神的潜影" onAction={() => {}} onScene={() => {}} />);
    expect(html.length).toBeGreaterThan(100);
  });
});
