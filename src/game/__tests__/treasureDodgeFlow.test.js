import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyTreasureDodgeRoll,
  classifyTreasureDodgeSkip,
  getTreasureDodgeDrawerIdx,
  treasureDodgeModeConfig,
} from '../treasureDodgeFlow';
import {
  buildTreasureDodgeRollPresentation,
  createTreasureDodgeDiceAnim,
} from '../treasureDodgePresentation';
import { resolveTreasureDodge } from '../treasureDodgeResolution';
import { authoritativeResolvedTransitionQueueMeta } from '../animationQueuePolicy';
import { createRandomTargetVisualEvent } from '../visualEvents';
import { makeGs, makePlayer, makeZoneCard } from './factory';

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
    const transaction = { isAOE: false, roll: { d1: 6, rollerName: '艾伦', dodgeSuccess: true } };
    expect(createTreasureDodgeDiceAnim({ transaction, tutorialHold: true, onTutorialSettled: onSettled }))
      .toMatchObject({ rollerName: '艾伦', durationMs: 2147483647, onSettled });
    expect(createTreasureDodgeDiceAnim({ transaction: { ...transaction, isAOE: true }, tutorialHold: true, onTutorialSettled: onSettled }))
      .toEqual(expect.not.objectContaining({ durationMs: expect.anything() }));
  });

  it('keeps a CTH rest dodge in one explicit transaction despite historical visual events', () => {
    const players = [
      makePlayer({ name: '你', role: '寻宝者', san: 8 }),
      makePlayer({ name: '艾伦', role: '猎人', san: 8 }),
      makePlayer({ name: '贝拉', role: '邪祀者', san: 8 }),
      makePlayer({ name: '卡洛斯', role: '猎人', san: 8 }),
    ];
    const card = makeZoneCard('A4', 1, { id: 'echoing-valley' });
    const historicalEvent = createRandomTargetVisualEvent({
      seq: 1,
      sourceIdx: 0,
      targetIdx: 1,
      resultText: '历史事件',
    }, { players });
    const drawReveal = { card, drawerIdx: 0, fromRest: true, needsDecision: true };
    const gs = makeGs({
      players,
      phase: 'TREASURE_DODGE_DECISION',
      drawReveal,
      abilityData: { fromRest: true, cthDrawsRemaining: 1 },
      _visualEvents: [historicalEvent],
      log: ['你即将承受 [A4] 空谷传音 的负面效果！是否掷骰子尝试规避？'],
    });

    const result = resolveTreasureDodge(gs, drawReveal, { roll: 6, actorLabel: '你' });
    const presentation = buildTreasureDodgeRollPresentation(result.transaction, { flowKind: 'rest' });
    const types = presentation.queue.map(step => step.type);

    expect(result.transaction).toMatchObject({
      type: 'treasureDodge',
      beforeState: gs,
      outcome: 'resolved',
      roll: { d1: 6, dodgeSuccess: true },
    });
    expect(types[0]).toBe('DICE_ROLL');
    expect(types).toContain('CARD_TRANSFER');
    expect(types.slice(-2)).toEqual(['STATE_PATCH', 'TURN_BOUNDARY_PAUSE']);
    expect(() => authoritativeResolvedTransitionQueueMeta(
      gs,
      result.newGs,
      presentation.queue,
      new Set(),
    )).not.toThrow();
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
    expect(handler).not.toMatch(/setGs\s*\(/);
    expect(handler).toContain('resolveTreasureDodge(gs,dr');
    expect(handler).toContain('buildTreasureDodgeRollPresentation(result.transaction');
    expect(handler).toContain('authoritativeResolvedTransitionQueueMeta(gs,afterState,queue');
  });

  it('routes Sphinx dodge and AI-ZHU turn banner through the animation queue state machine', () => {
    const appPath = fileURLToPath(new URL('../../App.jsx', import.meta.url));
    const source = fs.readFileSync(appPath, 'utf8');

    const sphinxStart = source.indexOf('function settleSphinxDodge(');
    const sphinxEnd = source.indexOf('function handleDrawDiscard()', sphinxStart);
    const sphinx = source.slice(sphinxStart, sphinxEnd);
    expect(sphinxStart).toBeGreaterThan(-1);
    expect(sphinxEnd).toBeGreaterThan(sphinxStart);
    expect(sphinx).not.toContain('pendingGsRef.current=');
    expect(sphinx).not.toContain('animQueueRef.current=');
    expect(sphinx).not.toMatch(/setAnim\s*\(/);
    expect(sphinx).toContain('finishTargetContinuation({');
    expect(sphinx).toContain('queue:fullQueue');
    expect(sphinx).toContain('continuation:continuationAbilityData');
    expect(sphinx).toContain("statEventReason:'斯芬克斯'");
    expect(sphinx).toContain('damageStatPatch=buildStatChangeStatePatch(gs,damageDecision)');
    expect(sphinx).toContain('...damageStatPatch');
    expect(sphinx).toContain('continueRest:!damageDecision?.phase&&!win&&!!continuationAbilityData.fromRest');

    // The AI-ZHU hide turn banner must also play through the queue machine.
    expect(source).not.toContain("setAnim({type:'YOUR_TURN'");
  });
});
