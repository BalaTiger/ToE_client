import { describe, expect, it } from 'vitest';
import { ROLE_CULTIST } from '../coreUtils';
import { shouldPlayGodResurrection } from '../gameOverPresentation';

describe('game-over presentation', () => {
  it('plays resurrection for zero-SAN all-player defeat', () => {
    expect(shouldPlayGodResurrection({
      winner: 'LOSE_ALL',
      reason: '艾伦 的理智归零，邪神复活，无人幸存！全员失败！',
    })).toBe(true);
  });

  it('keeps cultist endings and excludes unrelated defeats', () => {
    expect(shouldPlayGodResurrection({ winner: ROLE_CULTIST, reason: '邪祀者获胜' })).toBe(true);
    expect(shouldPlayGodResurrection({ winner: 'LOSE_ALL', reason: '所有探险者均已覆灭' })).toBe(false);
  });
});
