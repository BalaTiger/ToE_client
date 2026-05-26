import { describe, expect, it } from 'vitest';
import { buildAnimQueue } from '../animQueueCore';
import { makeGs, makePlayer } from './factory';

describe('buildAnimQueue stat animations', () => {
  it('不会仅因 SAN 数值上升就播放 SAN 回复特效', () => {
    const oldGs = makeGs({
      players: [makePlayer({ san: 3 })],
      log: ['旧日志'],
    });
    const newGs = makeGs({
      players: [makePlayer({ san: 5 })],
      log: ['旧日志', '你 的SAN检定结果为"昏睡"'],
    });

    expect(buildAnimQueue(oldGs, newGs).some(step => step.type === 'SAN_HEAL')).toBe(false);
  });

  it('有 SAN 回复日志且数值上升时播放 SAN 回复特效', () => {
    const oldGs = makeGs({
      players: [makePlayer({ san: 3 })],
      log: [],
    });
    const newGs = makeGs({
      players: [makePlayer({ san: 5 })],
      log: ['你 回复 2 SAN'],
    });

    expect(buildAnimQueue(oldGs, newGs).some(step => step.type === 'SAN_HEAL')).toBe(true);
  });

  it('存在显式 stat events 时不再根据状态差分猜测回复动画', () => {
    const oldGs = makeGs({
      players: [makePlayer({ hp: 10, san: 3 })],
      log: [],
    });
    const newGs = makeGs({
      players: [makePlayer({ hp: 8, san: 5 })],
      log: ['你 失去 2 HP'],
      _statEvents: [
        { type: 'HP_LOSS', target: 0, from: { hp: 10, san: 3 }, to: { hp: 8, san: 3 } },
      ],
    });
    const queue = buildAnimQueue(oldGs, newGs);

    expect(queue.map(step => step.type)).toEqual(['HP_DAMAGE']);
    expect(queue.some(step => step.type === 'SAN_HEAL')).toBe(false);
  });

  it('不会重复消费已经播放过的显式 stat events', () => {
    const event = { type: 'HP_LOSS', target: 0, from: { hp: 10, san: 5 }, to: { hp: 8, san: 5 }, seq: 3 };
    const oldGs = makeGs({
      players: [makePlayer({ hp: 8, san: 5 })],
      log: ['旧日志'],
      _statEvents: [event],
      _statEventSeq: 3,
    });
    const newGs = makeGs({
      players: [makePlayer({ hp: 8, san: 5 })],
      log: ['旧日志', '普通日志'],
      _statEvents: [event],
      _statEventSeq: 3,
    });

    expect(buildAnimQueue(oldGs, newGs).some(step => step.type === 'HP_DAMAGE')).toBe(false);
  });

  it('检定事件的 stat events 不会在检定翻牌前被普通队列提前消费', () => {
    const oldGs = makeGs({
      players: [makePlayer({ hp: 10, san: 7 })],
      log: [],
      _statEventSeq: 0,
    });
    const beforeInspectionPlayers = [makePlayer({ hp: 10, san: 6 })];
    const newGs = makeGs({
      players: [makePlayer({ hp: 9, san: 6 })],
      log: ['遭遇邪神，失去1SAN', '你 的SAN检定结果为"自残"', '你 自残，失去 1 HP'],
      _statEvents: [
        { type: 'SAN_LOSS', target: 0, from: { hp: 10, san: 7 }, to: { hp: 10, san: 6 }, seq: 1 },
        { type: 'HP_LOSS', target: 0, from: { hp: 10, san: 6 }, to: { hp: 9, san: 6 }, seq: 2 },
      ],
      _statEventSeq: 2,
      _inspectionEvents: [{
        seq: 1,
        statEventSeq: 2,
        beforePlayers: beforeInspectionPlayers,
        beforeLog: ['遭遇邪神，失去1SAN'],
      }],
    });

    const queue = buildAnimQueue(oldGs, newGs);

    expect(queue.map(step => step.type)).toEqual(['SAN_DAMAGE']);
  });

  it('下一回合摸牌队列可用已消费 statEventSeq 避免重播上一回合伤害', () => {
    const oldGs = makeGs({
      players: [makePlayer({ hp: 10, san: 10 }), makePlayer({ hp: 8, san: 9 })],
      log: ['旧日志'],
      _statEventSeq: 0,
    });
    const previousEvents = [
      { type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10 }, to: { hp: 8, san: 10 }, seq: 1 },
      { type: 'SAN_LOSS', target: 1, from: { hp: 8, san: 10 }, to: { hp: 8, san: 9 }, seq: 1 },
    ];
    const newGs = makeGs({
      players: [makePlayer({ hp: 10, san: 10 }), makePlayer({ hp: 8, san: 9 })],
      log: ['旧日志', '你 摸到 [D2] 穴居人战争'],
      _statEvents: previousEvents,
      _statEventSeq: 1,
    });

    expect(buildAnimQueue(oldGs, newGs).some(step => step.type === 'HP_DAMAGE')).toBe(true);
    expect(buildAnimQueue({ ...oldGs, _statEventSeq: 1 }, newGs).some(step => step.type === 'HP_DAMAGE')).toBe(false);
  });

  it('地动山摇强制触发日志会显式产生独立地震动画', () => {
    const oldGs = makeGs({
      players: [makePlayer()],
      log: ['旧日志'],
      _earthquakeSeq: 1,
    });
    const newGs = makeGs({
      players: [makePlayer()],
      log: ['旧日志', '你 摸到 [B2] 地动山摇（强制触发）'],
      _earthquakeSeq: 1,
    });

    expect(buildAnimQueue(oldGs, newGs).map(step => step.type)).toContain('EARTHQUAKE');
  });

  it('开局遮蔽态已带最新日志时仍能从摸牌日志产生地震动画', () => {
    const drawLog = '你 摸到 [B2] 地动山摇（强制触发）';
    const oldGs = makeGs({
      players: [makePlayer()],
      log: ['游戏开始。每人获得四张初始手牌。', drawLog],
      _earthquakeSeq: 1,
    });
    const newGs = makeGs({
      players: [makePlayer()],
      log: ['游戏开始。每人获得四张初始手牌。', drawLog],
      _drawLogs: [drawLog],
      _earthquakeSeq: 1,
    });

    expect(buildAnimQueue(oldGs, newGs).map(step => step.type)).toContain('EARTHQUAKE');
  });

  it('地震动画携带结算前手牌和分段弃牌事件', () => {
    const beforePlayers = [makePlayer({ hand: [{ id: 'a' }] })];
    const midEffectPlayers = [makePlayer({ hand: [] })];
    const finalPlayers = [makePlayer({ hand: [{ id: 'quake' }] })];
    const oldGs = makeGs({
      players: beforePlayers,
      discard: [],
      log: ['旧日志'],
      _earthquakeSeq: 1,
    });
    const newGs = makeGs({
      players: finalPlayers,
      log: ['旧日志'],
      _earthquakeSeq: 2,
      _earthquakeBeforePlayers: beforePlayers,
      _earthquakeBeforeDiscard: [],
      _earthquakeDiscardEvents: [{ playerIndex: 0, card: { id: 'a', letter: 'A' }, afterPlayers: midEffectPlayers }],
    });

    const earthquake = buildAnimQueue(oldGs, newGs).find(step => step.type === 'EARTHQUAKE');

    expect(earthquake.beforePlayers).toBe(beforePlayers);
    expect(earthquake.beforeDiscard).toEqual([]);
    expect(earthquake.discardEvents).toHaveLength(1);
    expect(earthquake.discardEvents[0].delayMs).toBe(420);
    expect(earthquake.discardEvents[0].durationMs).toBe(620);
    expect(earthquake.discardEvents[0].afterPlayers[0].hand).toEqual([{ id: 'quake' }]);
  });
});
