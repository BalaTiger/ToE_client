import { describe, expect, it, vi } from 'vitest';
import { BATTLE_CAMERA_BY_EXPANSION, getBattleCamera } from './theme';
import { GLOBAL_STYLES } from '../components/GlobalStyles';

vi.mock('../utils/url', () => ({ buildPublicUrl: path => path }));

describe('theme-bound exploration camera', () => {
  it.each([
    [1600, 1000], [1900, 1000], [1280, 720], [844, 390], [390, 844],
  ])('keeps the visible sea horizon stationary through cover and zoom at %i × %i', (width, height) => {
    const camera = getBattleCamera('群星呼唤', { width, height });
    const coverScale = Math.max(width / 1597, height / 985);
    const coveredHeight = 985 * coverScale;
    const horizon = (height - coveredHeight) / 2 + coveredHeight * 0.32;
    const origin = Number.parseFloat(camera.origin.split(' ')[1]) / 100 * height;
    expect(origin).toBeCloseTo(horizon, 3);
    for (const scale of [1, 1.11, 1.24]) {
      expect(origin + (horizon - origin) * scale).toBeCloseTo(horizon, 3);
    }
    // The cover geometry above is valid for a viewport-sized scroll background.
    expect(camera).toMatchObject({ inset: '0px', attachment: 'scroll' });
  });

  it('preserves every other theme and the unknown-theme walking fallback', () => {
    for (const theme of ['地神的潜影', '先贤的馈赠', '析骨为柴', 'unknown']) {
      expect(getBattleCamera(theme, { width: 1900, height: 1000 })).toBe(BATTLE_CAMERA_BY_EXPANSION['地神的潜影']);
    }
    expect(getBattleCamera('群星呼唤')).toBe(BATTLE_CAMERA_BY_EXPANSION['群星呼唤']);
  });

  it('uses stronger forward surges without vertical drift or a longer exploration phase', () => {
    const sea = GLOBAL_STYLES.split('@keyframes toeDrawBackgroundSea')[1].split('@keyframes')[0];
    expect(sea).toContain('scale(1.24)');
    expect(sea).not.toMatch(/translate|rotate/);
    expect(GLOBAL_STYLES).toContain('0.92s cubic-bezier(0.34,0,0.24,1) 3 both');
  });
});
