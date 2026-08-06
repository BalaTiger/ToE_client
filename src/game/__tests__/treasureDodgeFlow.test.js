import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyTreasureDodgeRoll,
  classifyTreasureDodgeSkip,
  createTreasureDodgeDiceAnim,
  getTreasureDodgeDrawerIdx,
  treasureDodgeModeConfig,
} from '../treasureDodgeFlow';

describe('treasure dodge flow variants', () => {
  it('preserves normal and AOE mode differences', () => {
    expect(treasureDodgeModeConfig(false)).toMatchObject({
      rollContext: 'treasureDodge', includeStandardTransfer: true, supportsTutorialHold: true,
      deriveSkipDecision: true, broadcastEndTurnReplayDelta: true,
    });
    expect(treasureDodgeModeConfig(true)).toMatchObject({
      rollContext: 'treasureAoeDodge', includeStandardTransfer: false, supportsTutorialHold: false,
      deriveSkipDecision: false, broadcastEndTurnReplayDelta: false,
    });
    expect(getTreasureDodgeDrawerIdx({ abilityData: { drawerIdx: 2 } }, { drawerIdx: 1 }, false)).toBe(1);
    expect(getTreasureDodgeDrawerIdx({ abilityData: { drawerIdx: 2 } }, { drawerIdx: 1 }, true)).toBe(2);
  });

  it.each([
    [{ fromRest: true }, false, false, 'rest'],
    [{ fromRest: true }, true, false, 'standard'],
    [{ fromRest: true }, true, true, 'rest'],
    [{ fromTsathogguaSlime: true }, false, false, 'slime'],
    [{ fromTsathogguaSlime: true }, true, false, 'standard'],
    [{ fromTsathogguaSlime: true }, true, true, 'slime'],
    [{}, false, false, 'standard'],
  ])('classifies skip continuation %#', (drawReveal, hasDecision, aoe, expected) => {
    expect(classifyTreasureDodgeSkip(drawReveal, hasDecision, aoe)).toBe(expected);
  });

  it.each([
    [{ win: {} }, {}, false, 'win'],
    [{ pendingWinGs: {} }, {}, false, 'pendingWin'],
    [{ hasDecision: false }, { fromRest: true }, false, 'rest'],
    [{ hasDecision: true }, { fromRest: true }, false, 'standard'],
    [{ hasDecision: true }, { fromRest: true }, true, 'rest'],
    [{ hasDecision: false }, { fromTsathogguaSlime: true }, false, 'slime'],
    [{ hasDecision: true }, { fromTsathogguaSlime: true }, true, 'standard'],
  ])('classifies result %#', (result, drawReveal, aoe, expected) => {
    expect(classifyTreasureDodgeRoll(drawReveal, result, aoe)).toBe(expected);
  });

  it('keeps tutorial hold only on the normal roll', () => {
    const onSettled = vi.fn();
    const result = { d1: 6, who: '艾伦', dodgeSuccess: true };
    expect(createTreasureDodgeDiceAnim({ result, tutorialHold: true, onTutorialSettled: onSettled }))
      .toMatchObject({ rollerName: '艾伦', durationMs: 2147483647, onSettled });
    expect(createTreasureDodgeDiceAnim({ result, aoe: true, tutorialHold: true, onTutorialSettled: onSettled }))
      .toEqual(expect.not.objectContaining({ durationMs: expect.anything() }));
  });

  it('routes every treasure-dodge roll branch through the animation queue state machine', () => {
    const appPath = fileURLToPath(new URL('../../App.jsx', import.meta.url));
    const source = fs.readFileSync(appPath, 'utf8');
    const start = source.indexOf('function handleTreasureDodgeRollMode');
    const end = source.indexOf('function handleTreasureDodgeRoll()', start);
    const handler = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(handler).not.toContain('pendingGsRef.current=');
    expect(handler).not.toContain('animQueueRef.current=');
    expect(handler).not.toMatch(/setAnim\s*\(/);
    expect(handler.match(/triggerAnimQueue\s*\(/g)).toHaveLength(4);
  });
});
