import { describe, expect, it } from 'vitest';
import {
  buildBewitchForcedCardQueue,
  buildFullHandSwapStepsFromLogs,
  buildInspectionEventFlow,
  buryToDeckStep,
  cardTransferStep,
  fullHandSwapSteps,
  resolveTurnHighlightForStep,
  zhuHideCardStep,
} from '../animQueueHelpers';
import { copyPlayers } from '../coreUtils';
import { buildAnimQueue } from '../animQueueCore';
import { makePlayer, makeZoneCard } from './factory';

describe('animQueueHelpers', () => {
  it('从中文回合开始日志解析当前角色高亮', () => {
    const step = { type: 'YOUR_TURN', msgs: ['── 测试角色B 的回合开始 ──'] };
    const players = [makePlayer({ name: '测试角色A' }), makePlayer({ name: '测试角色B' })];

    expect(resolveTurnHighlightForStep(step, { players })).toBe(1);
  });

  it('通用移动动画步骤携带各自的视觉预锁', () => {
    const players = [makePlayer({ hand: [{ id: 'old-card' }] })];

    expect(zhuHideCardStep({ id: 'zhu-card' })).toMatchObject({
      type: 'ZHU_HIDE_CARD',
      visualSetupPatch: { hiddenZhuCardId: 'zhu-card' },
    });
    expect(buryToDeckStep({ fromPid: 0, msgs: ['活埋'], players })).toMatchObject({
      type: 'BURY_TO_DECK',
      fromPid: 0,
      msgs: ['活埋'],
      visualSetupPatch: { players },
    });
    expect(cardTransferStep({ fromPid: 0, dest: 'player', toPid: 1, count: 1 })).toEqual({
      type: 'CARD_TRANSFER',
      fromPid: 0,
      dest: 'player',
      toPid: 1,
      count: 1,
    });
    expect(cardTransferStep()).toEqual({ type: 'CARD_TRANSFER' });
  });

  it('整手交换 helper 可统一生成视觉锁和双向飞牌', () => {
    const players = [
      makePlayer({ name: '你', hand: [{ id: 'a' }, { id: 'b' }] }),
      makePlayer({ name: '艾伦', hand: [{ id: 'c' }] }),
    ];

    expect(fullHandSwapSteps({
      fromPid: 0,
      toPid: 1,
      fromCount: 2,
      toCount: 1,
      msgs: ['交换完成'],
      playersBefore: players,
      zhuLight: { owner: 0 },
    })).toEqual([
      { type: 'VISUAL_LOCK', players, zhuLight: { owner: 0 } },
      { type: 'CARD_TRANSFER', fromPid: 0, dest: 'player', toPid: 1, count: 2 },
      { type: 'CARD_TRANSFER', fromPid: 1, dest: 'player', toPid: 0, count: 1, msgs: ['交换完成'] },
    ]);
  });

  it('可从交换全部手牌日志解析整手交换步骤', () => {
    const players = [
      makePlayer({ name: '你', hand: [{ id: 'a' }] }),
      makePlayer({ name: '艾伦', hand: [{ id: 'b' }, { id: 'c' }] }),
    ];

    const queue = buildFullHandSwapStepsFromLogs(
      ['你 与 艾伦 交换了全部手牌（1 张 ↔ 2 张）'],
      players,
      { playersBefore: players }
    );

    expect(queue.map(step => step.type)).toEqual(['VISUAL_LOCK', 'CARD_TRANSFER', 'CARD_TRANSFER']);
    expect(queue[1]).toMatchObject({ fromPid: 0, toPid: 1, count: 1 });
    expect(queue[2]).toMatchObject({ fromPid: 1, toPid: 0, count: 2 });
  });

  it('蛊惑强制赠牌动画先播放技能，再飞牌入目标手牌，最后播放结算状态', () => {
    const gift = makeZoneCard('A1', 0);
    const queue = buildBewitchForcedCardQueue(0, 2, gift, '目标角色', [
      { type: 'CARD_TRANSFER', fromPid: 2, dest: 'discard' },
      { type: 'DAMAGE', targetPid: 2 },
    ], ['邪祀者对目标角色【蛊惑】']);

    expect(queue.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'DRAW_CARD',
      'DAMAGE',
    ]);
    expect(queue[1]).toMatchObject({ fromPid: 0, toPid: 2, dest: 'player' });
    expect(queue[2]).toMatchObject({ card: gift, triggerName: '目标角色', targetPid: 2, skipTravel: true });
  });

  it('检定事件流保证前置变化、检定翻牌、检定效果按顺序入队', () => {
    const card = makeZoneCard('B2', 0);
    const basePlayers = [makePlayer({ name: '玩家', hp: 10, san: 10 })];
    const beforePlayers = copyPlayers(basePlayers);
    beforePlayers[0].san = 8;
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[0].hp = 7;
    const events = [{
      card,
      target: 0,
      beforePlayers,
      beforeLog: ['蛊惑发动'],
      afterPlayers,
      afterLog: ['蛊惑发动', '检定导致伤害'],
    }];
    const buildAnimQueue = (oldGs, newGs) => {
      const queue = [];
      if (oldGs.log.length !== newGs.log.length) queue.push({ type: 'LOG_STEP', to: newGs.log.at(-1) });
      if (oldGs.players[0].hp !== newGs.players[0].hp) queue.push({ type: 'DAMAGE', targetPid: 0 });
      if (oldGs.players[0].san !== newGs.players[0].san) queue.push({ type: 'SAN_CHANGE', targetPid: 0 });
      return queue;
    };

    const flow = buildInspectionEventFlow(
      { players: basePlayers, log: [] },
      events,
      { buildAnimQueue, copyPlayers },
    );

    expect(flow.queue.map(step => step.type)).toEqual([
      'LOG_STEP',
      'SAN_CHANGE',
      'DRAW_CARD',
      'LOG_STEP',
      'DAMAGE',
    ]);
    expect(flow.queue[2]).toMatchObject({ triggerName: '检定牌', card, targetPid: 0 });
  });

  it('检定效果动画优先使用显式 statEvents', () => {
    const card = { name: '超人意志', effect: 'healSAN', value: 1 };
    const beforePlayers = [makePlayer({ name: '玩家', hp: 10, san: 5 })];
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[0].san = 6;
    const events = [{
      card,
      target: 0,
      beforePlayers,
      beforeLog: ['玩家 的SAN检定结果为"超人意志"'],
      afterPlayers,
      afterLog: ['玩家 的SAN检定结果为"超人意志"', '检定结算完成'],
      statEventSeq: 7,
      statEvents: [{
        type: 'SAN_GAIN',
        target: 0,
        from: { hp: 10, san: 5, isDead: false },
        to: { hp: 10, san: 6, isDead: false },
        reason: '超人意志',
        seq: 7,
      }],
    }];

    const flow = buildInspectionEventFlow(
      { players: beforePlayers, log: [] },
      events,
      { buildAnimQueue, copyPlayers },
    );

    expect(flow.queue.map(step => step.type)).toEqual(['DRAW_CARD', 'SAN_HEAL']);
    expect(flow.queue[1]).toMatchObject({ hitIndices: [0] });
    expect(flow.queue[1].statEvents).toMatchObject([{ type: 'SAN_GAIN', seq: 7 }]);
    expect(flow.statEventSeq).toBe(7);
  });

  it('检定后的尾队列不会重放检定前已经存在的 HP statEvent', () => {
    const oldHpEvent = {
      type: 'HP_LOSS',
      target: 1,
      from: { hp: 10, san: 10, isDead: false },
      to: { hp: 8, san: 10, isDead: false },
      reason: '旧伤害',
      seq: 3,
    };
    const card = { name: '乏力', effect: 'handLimitDecrease', type: 'negative' };
    const beforePlayers = [
      makePlayer({ name: '卡洛斯', hp: 10, san: 3 }),
      makePlayer({ name: '贝拉', hp: 8, san: 10 }),
    ];
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[0].handLimitDecreaseNextTurn = 1;
    const events = [{
      card,
      target: 0,
      beforePlayers,
      beforeLog: ['卡洛斯 的SAN检定结果为"乏力"'],
      afterPlayers,
      afterLog: ['卡洛斯 的SAN检定结果为"乏力"', '卡洛斯 乏力，下一回合手牌上限-1'],
      statEventSeq: null,
      statEvents: [],
    }];
    const flow = buildInspectionEventFlow(
      { players: beforePlayers, log: [], _statEventSeq: 3 },
      events,
      { buildAnimQueue, copyPlayers },
    );
    const tailQueue = buildAnimQueue(
      { players: flow.players, log: flow.log, _statEventSeq: flow.statEventSeq },
      {
        players: afterPlayers,
        log: flow.log,
        _statEvents: [oldHpEvent],
        _statEventSeq: 3,
      },
    );

    expect(flow.queue.map(step => step.type)).toEqual(['DRAW_CARD']);
    expect(tailQueue.some(step => step.type === 'HP_DAMAGE')).toBe(false);
  });
});
