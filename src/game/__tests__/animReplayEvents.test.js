import { describe, expect, it, vi } from 'vitest';
import { buildAnimQueue } from '../animQueueCore';
import {
  buildBewitchGiftReplay,
  buildInspectionReplay,
  buildRandomTargetReplay,
  findFreshBewitchReplayLog,
  hasFreshRandomTargetEvents,
  isFreshActionReplayEvent,
  isFreshBewitchReplayEvent,
  isStatAnimationStep,
} from '../animReplayEvents';
import { copyPlayers } from '../coreUtils';
import { makePlayer, makeZoneCard } from './factory';

describe('animReplayEvents', () => {
  it('识别会更新数值或承载数值日志的动画步骤', () => {
    expect(isStatAnimationStep({ type: 'HP_DAMAGE' })).toBe(true);
    expect(isStatAnimationStep({ type: 'STATE_PATCH', _logChunk: ['失去 1 SAN'] })).toBe(true);
    expect(isStatAnimationStep({ type: 'CARD_TRANSFER' })).toBe(false);
    expect(isStatAnimationStep(null)).toBe(false);
  });

  it('事件消息之后跨入摸牌边界时视为旧回放事件', () => {
    const event = { msgs: ['事件蛊惑'] };
    expect(isFreshActionReplayEvent(event, ['事件蛊惑', '── 贝拉 的回合开始 ──'])).toBe(false);
    expect(isFreshBewitchReplayEvent(event, ['事件蛊惑', '贝拉 摸到 [B2] 下一张牌'])).toBe(false);
    expect(isFreshActionReplayEvent(event, ['事件掉包', '── 贝拉 的回合开始 ──'])).toBe(false);
    expect(isFreshActionReplayEvent({ msgs: ['事件掉包'] }, ['事件掉包', '结算完成'])).toBe(true);
  });

  it('蛊惑日志 fallback 不会跨过后续摸牌边界', () => {
    expect(findFreshBewitchReplayLog([
      '艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物',
      '── 贝拉 的回合开始 ──',
      '贝拉 摸到 [B2] 下一张牌',
    ])).toBeNull();
    expect(findFreshBewitchReplayLog([
      '艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物',
      '贝拉 失去 1 SAN',
    ])).toBe('艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物');
  });

  it('蛊惑赠牌回放优先使用显式 visual stat，避免旧差分数值动画重复', () => {
    const gift = makeZoneCard('A1', 0);
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' }), makePlayer({ name: '贝拉' })];
    const oldGs = { players, currentTurn: 0, log: [] };
    const newGs = { players: copyPlayers(players), currentTurn: 0, log: ['你对 贝拉 【蛊惑】'] };
    const buildAnimQueue = vi.fn(() => [
      { type: 'CARD_TRANSFER', fromPid: 2, toPid: 0, count: 1 },
      { type: 'SAN_DAMAGE', hitIndices: [1], msgs: ['旧差分伤害'] },
      { type: 'STATE_PATCH', _logChunk: ['旧数值日志'] },
    ]);
    const visualSanDamage = { type: 'SAN_DAMAGE', hitIndices: [2], msgs: ['事件伤害'] };

    const replay = buildBewitchGiftReplay({
      oldGs,
      newGs,
      bewitchEvent: {
        sourceIdx: 0,
        targetIdx: 2,
        targetName: '贝拉',
        card: gift,
        msgs: ['事件蛊惑'],
      },
      logDelta: ['你对 贝拉 【蛊惑】', '贝拉 失去 1 SAN'],
      visualStatQueue: [visualSanDamage],
      buildAnimQueue,
      copyPlayers,
    });

    expect(replay.queue.map(step => step.type)).toEqual(['SKILL_BEWITCH', 'CARD_TRANSFER', 'DRAW_CARD', 'SAN_DAMAGE']);
    expect(replay.queue[0]).toMatchObject({ targetIdx: 2, msgs: ['事件蛊惑'] });
    expect(replay.queue[1]).toMatchObject({ fromPid: 0, toPid: 2, count: 1 });
    expect(replay.queue[2]).toMatchObject({ card: gift, triggerName: '贝拉', targetPid: 2, skipTravel: true });
    expect(replay.queue[3]).toBe(visualSanDamage);
    expect(replay.queue.some(step => step.msgs?.includes('旧差分伤害'))).toBe(false);
    expect(replay.queue.some(step => step._logChunk?.includes('旧数值日志'))).toBe(false);
  });

  it('检定回放委托 inspection-aware 队列并返回新的检定事件', () => {
    const inspectionCard = { id: 'inspect-1', name: '迫害妄想' };
    const beforePlayers = [makePlayer({ name: '你', san: 6 })];
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[0].san = 5;
    const oldGs = {
      players: beforePlayers,
      log: ['旧日志'],
      _inspectionSeq: 0,
      _statEventSeq: 0,
    };
    const newGs = {
      players: afterPlayers,
      log: ['旧日志', '你 的SAN检定结果为"迫害妄想"', '你 失去 1 SAN'],
      _inspectionSeq: 1,
      _inspectionEvents: [{
        seq: 1,
        card: inspectionCard,
        target: 0,
        beforePlayers,
        beforeLog: ['旧日志'],
        afterPlayers,
        afterLog: ['旧日志', '你 的SAN检定结果为"迫害妄想"', '你 失去 1 SAN'],
      }],
    };

    const replay = buildInspectionReplay(oldGs, newGs, {
      buildAnimQueue: vi.fn(() => []),
      copyPlayers,
    });

    expect(replay.inspectionEvents).toHaveLength(1);
    expect(replay.inspectionSeq).toBe(1);
    expect(replay.queue.map(step => step.type)).toEqual(['VISUAL_LOCK', 'DRAW_CARD', 'STATE_PATCH']);
    expect(replay.queue[1]).toMatchObject({ card: inspectionCard, triggerName: '检定牌', targetPid: 0 });
  });

  it('随机目标回放生成完整队列并追加最终状态补丁', () => {
    const beforePlayers = [
      makePlayer({ name: '你', hp: 10 }),
      makePlayer({ name: '艾伦', hp: 10 }),
    ];
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[1].hp = 7;
    const oldGs = {
      players: beforePlayers,
      log: [],
      _randomTargetSeq: 0,
      _statEventSeq: 0,
    };
    const newGs = {
      players: afterPlayers,
      discard: [{ id: 'discard-1' }],
      phase: 'ACTION',
      abilityData: {},
      log: ['你 掷出 4 点，随机砸向 艾伦（距离1），造成 3 HP 伤害'],
      _randomTargetSeq: 1,
      _randomTargetEvents: [{
        seq: 1,
        sourceIdx: 0,
        targetIdx: 1,
        label: '投掷石块',
        roll: 4,
        distance: 1,
        damage: 3,
        diceBefore: true,
        phaseOrder: 1,
      }],
      _statEventSeq: 1,
      _statEvents: [{
        type: 'HP_LOSS',
        target: 1,
        from: { hp: 10, san: 10, isDead: false },
        to: { hp: 7, san: 10, isDead: false },
        seq: 1,
        phaseOrder: 2,
      }],
    };

    expect(hasFreshRandomTargetEvents(newGs, oldGs)).toBe(true);
    const replay = buildRandomTargetReplay({
      oldGs,
      newGs,
      logDelta: newGs.log,
      buildAnimQueue,
      copyPlayers,
    });

    expect(replay.queue.map(step => step.type)).toEqual(['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE', 'HP_DAMAGE', 'STATE_PATCH']);
    expect(replay.queue[0]).toMatchObject({ diceMode: 'throwStone', d1: 4 });
    expect(replay.queue[1]).toMatchObject({ sourceIdx: 0, targetIdx: 1, label: '投掷石块' });
    expect(replay.queue[2]).toMatchObject({ type: 'THROW_STONE', sourceIdx: 0, targetIdx: 1, damage: 3 });
    expect(replay.queue[3]).toMatchObject({ hitIndices: [1] });
    expect(replay.queue.at(-1)).toMatchObject({
      players: afterPlayers,
      discard: newGs.discard,
      log: newGs.log,
      phase: 'ACTION',
      abilityData: {},
    });
  });
});
