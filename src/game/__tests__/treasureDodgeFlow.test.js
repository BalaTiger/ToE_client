import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
  it.each([1, 6])('活埋规避掷出 %s 后等待所有埋牌完成再收入', roll => {
    const oldCard = makeZoneCard('B1');
    const adjacentCard = makeZoneCard('C2');
    const card = makeZoneCard('A4', 0, { id: 'incoming-bury', name: '活埋', type: 'buryAlive' });
    const players = [
      makePlayer({ role: '寻宝者', hand: [oldCard] }),
      makePlayer({ role: '追猎者', hand: [adjacentCard] }),
      makePlayer({ role: '邪祀者' }),
    ];
    const drawReveal = { card, drawerIdx: 0, fromRest: true };
    const gs = makeGs({ players, drawReveal, abilityData: { fromRest: true, cthDrawsRemaining: 2 } });
    const result = resolveTreasureDodge(gs, drawReveal, { roll });

    expect(result.newGs.phase).toBe('BURY_ALIVE_SELECT');
    expect(result.newGs.players[0].hand).toEqual([oldCard]);
    expect(result.newGs.abilityData).toMatchObject({
      targets: roll >= 4 ? [1] : [0, 1],
      fromRest: true, cthDrawsRemaining: 2,
      pendingZoneIncome: { card, ownerId: players[0].id },
    });
    expect(result.newGs.log.some(line => line.includes('收入了'))).toBe(false);
    expect(classifyTreasureDodgeRoll(drawReveal, result)).toBe('standard');
    const presentation = buildTreasureDodgeRollPresentation(result.transaction);
    expect(presentation.queue.some(step => step.type === 'CARD_TRANSFER')).toBe(false);
  });

  it('preserves normal and AOE mode differences', () => {
    expect(treasureDodgeModeConfig(false)).toMatchObject({
      rollContext: 'treasureDodge', includeStandardTransfer: true,
      deriveSkipDecision: true, broadcastEndTurnReplayDelta: true,
    });
    expect(treasureDodgeModeConfig(true)).toMatchObject({
      rollContext: 'treasureAoeDodge', includeStandardTransfer: false,
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

  it.each([false, true])('uses the queue-owned dice duration for AOE=%s', isAOE => {
    const transaction = { isAOE, roll: { d1: 6, rollerName: '艾伦', dodgeSuccess: true } };
    expect(createTreasureDodgeDiceAnim({ transaction })).toEqual({
      type: 'DICE_ROLL', d1: 6, d2: 0, heal: 0,
      rollerName: isAOE ? '你' : '艾伦', dodgeSuccess: true,
      impactAtMs: 1200, msgs: [],
    });
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
    expect(sphinx).toContain('buildStatChangeStatePatch({...gs,...damageStatPatch},damageDecision)');
    expect(sphinx).toContain('...damageStatPatch');
    expect(sphinx).toContain('continueRest:!damageDecision?.phase&&!win&&!!continuationAbilityData.fromRest');

    // The AI-ZHU hide turn banner must also play through the queue machine.
    expect(source).not.toContain("setAnim({type:'YOUR_TURN'");
  });
});
