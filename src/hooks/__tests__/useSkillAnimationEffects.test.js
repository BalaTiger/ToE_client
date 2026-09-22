import { afterEach, expect, it, vi } from 'vitest';
import { getSkillTargetCenter } from '../useSkillAnimationEffects';

afterEach(() => vi.unstubAllGlobals());

it.each([0, 2])('aims hunt and bewitch at seat %s portrait rather than its extended panel', pid => {
  const portrait = { getBoundingClientRect: () => ({ left: 24, top: 200, width: 48, height: 48 }) };
  const panel = {
    querySelector: vi.fn(() => portrait),
    getBoundingClientRect: () => ({ left: 0, top: 190, width: 100, height: 600 }),
  };
  const querySelector = vi.fn(() => panel);
  vi.stubGlobal('document', { querySelector });
  expect(getSkillTargetCenter(pid)).toEqual({ cx: 48, cy: 224 });
  expect(querySelector).toHaveBeenCalledWith(`[data-pid="${pid}"]`);
  expect(panel.querySelector).toHaveBeenCalledWith('.toe-coastal-portrait');
  // Classic layouts keep decorative portraits mounted but display:none.
  portrait.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
  expect(getSkillTargetCenter(pid)).toEqual({ cx: 50, cy: 490 });
});

it('falls back to the viewport when the target has no measurable panel', () => {
  vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 800 });
  vi.stubGlobal('document', { querySelector: () => null });
  expect(getSkillTargetCenter(0)).toEqual({ cx: 600, cy: 200 });
});
