import { describe, expect, it } from 'vitest';
import {
  buildBewitchForcedCardQueue,
  buildInspectionEventFlow,
  resolveTurnHighlightForStep,
} from '../animQueueHelpers';
import { copyPlayers } from '../coreUtils';
import { makePlayer, makeZoneCard } from './factory';

describe('animQueueHelpers', () => {
  it('从中文回合开始日志解析当前角色高亮', () => {
    const step = { type: 'YOUR_TURN', msgs: ['── 测试角色B 的回合开始 ──'] };
    const players = [makePlayer({ name: '测试角色A' }), makePlayer({ name: '测试角色B' })];

    expect(resolveTurnHighlightForStep(step, { players })).toBe(1);
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
});
