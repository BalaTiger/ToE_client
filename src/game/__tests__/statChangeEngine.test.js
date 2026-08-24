import { describe, expect, it } from 'vitest';
import { submitLossEvents } from '../effectEngine';
import { compileFreshVisualEventQueue as buildAnimQueue } from '../visualEventTransactionCompiler';
import { buildSphinxResultQueue } from '../animQueueHelpers';
import { appendStatChangeResult, buildStatChangeStatePatch, submitRecoveryEvents } from '../statChangeEngine';
import { makePlayer } from './factory';

describe('stat change rule entry points', () => {
  it('submitLossEvents settles HP and SAN in one transaction and emits canonical stat events', () => {
    const players = [makePlayer({ hp: 5, san: 4 })];
    const result = submitLossEvents({
      players,
      events: [{ targetIdx: 0, lostHp: 2, lostSan: 1, source: '组合伤害' }],
      statEventSeq: 7,
    });

    expect(players[0]).toMatchObject({ hp: 3, san: 3 });
    expect(result.statEvents).toMatchObject([
      { type: 'HP_LOSS', target: 0, seq: 7, reason: '组合伤害', from: { hp: 5, san: 4 }, to: { hp: 3, san: 3 } },
      { type: 'SAN_LOSS', target: 0, seq: 7, reason: '组合伤害', from: { hp: 5, san: 4 }, to: { hp: 3, san: 3 } },
    ]);
  });

  it('submitRecoveryEvents clamps actual gains and emits continuous canonical events', () => {
    const players = [makePlayer({ hp: 9, san: 6 })];
    const result = submitRecoveryEvents({
      players,
      events: [
        { targetIdx: 0, gainHp: 5, source: '休息', order: 0 },
        { targetIdx: 0, gainSan: 2, source: '泉水', order: 1 },
      ],
      statEventSeq: 8,
    });

    expect(players[0]).toMatchObject({ hp: 10, san: 8 });
    expect(result.statEvents).toMatchObject([
      { type: 'HP_GAIN', seq: 8, from: { hp: 9, san: 6 }, to: { hp: 10, san: 6 } },
      { type: 'SAN_GAIN', seq: 8, from: { hp: 10, san: 6 }, to: { hp: 10, san: 8 } },
    ]);
    expect(appendStatChangeResult({ _statEvents: [], _statEventSeq: 7 }, result)).toMatchObject({
      _statEventSeq: 8,
      _statEvents: result.statEvents,
    });
  });

  it('does not recover dead players or emit zero-delta events', () => {
    const players = [makePlayer({ hp: 0, san: 4, isDead: true }), makePlayer({ hp: 10, san: 10 })];
    const result = submitRecoveryEvents({
      players,
      events: [
        { targetIdx: 0, gainHp: 3 },
        { targetIdx: 1, gainHp: 3, gainSan: 3 },
      ],
      statEventSeq: 2,
    });

    expect(result.statEvents).toEqual([]);
  });

  it('turns a controller-owned Sphinx loss into an HP damage presentation step', () => {
    const oldPlayers = [makePlayer({ hp: 10, san: 8 })];
    const players = [makePlayer({ hp: 10, san: 8 })];
    const oldState = {
      players: oldPlayers,
      discard: [],
      log: [],
      _statEvents: [],
      _statEventSeq: 4,
    };
    const damage = submitLossEvents({
      players,
      discard: [],
      log: [],
      currentTurn: 0,
      events: [{ targetIdx: 0, lostHp: 3, source: '斯芬克斯' }],
      statEventSeq: 5,
      statEventReason: '斯芬克斯',
      statEventLogs: ['猜测错误！你失去 3 HP'],
    });
    const nextState = {
      ...oldState,
      players,
      log: ['猜测错误！你失去 3 HP'],
      ...buildStatChangeStatePatch(oldState, damage),
    };

    expect(buildStatChangeStatePatch(oldState, damage)).toMatchObject({
      _statEventSeq: 5,
      _statEvents: [expect.objectContaining({
        type: 'HP_LOSS',
        target: 0,
        seq: 5,
        reason: '斯芬克斯',
        from: expect.objectContaining({ hp: 10, san: 8 }),
        to: expect.objectContaining({ hp: 7, san: 8 }),
      })],
    });
    const resultQueue = buildAnimQueue(oldState, nextState);
    expect(resultQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'HP_DAMAGE',
        hitIndices: [0],
        statEvents: [expect.objectContaining({ type: 'HP_LOSS', target: 0, seq: 5 })],
      }),
    ]));
    const sphinxQueue = buildSphinxResultQueue({
      card: { id: 'sphinx-top-card', name: '牌堆顶', type: 'zone' },
      actorIdx: 0,
      guessCorrect: false,
      msgs: nextState.log,
      resultQueue,
    });
    expect(sphinxQueue.map(step => step.type)).toEqual(['DRAW_CARD', 'CARD_TRANSFER', 'HP_DAMAGE']);
  });

  it('不灭之躯成功时把致死伤害与恢复拆成连续的 0 HP 翻牌边界', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '贝拉', hp: 3, godName: 'VRI', godLevel: 1 }),
    ];
    const deck = Array.from({ length: 6 }, (_, index) => ({
      id: `vri-${index}`,
      name: `区域牌${index}`,
      isZone: true,
    }));
    const log = ['贝拉 失去 5 HP'];
    const result = submitLossEvents({
      players,
      deck,
      discard: [],
      log,
      currentTurn: 0,
      events: [{ targetIdx: 1, lostHp: 5, source: '致死伤害' }],
      statEventSeq: 9,
      statEventLogs: log,
    });

    expect(players[1]).toMatchObject({ hp: 1, isDead: false });
    expect(result.statEvents.filter(event => event.target === 1)).toMatchObject([
      { type: 'HP_LOSS', seq: 9, phaseOrder: 0, vritraImmortalStage: 'damageToZero', from: { hp: 3 }, to: { hp: 0 } },
      { type: 'HP_GAIN', seq: 9, phaseOrder: 2, vritraImmortalStage: 'recoverToOne', from: { hp: 0 }, to: { hp: 1 } },
    ]);
  });

  it('不灭之躯失败时在扣至 0 后翻牌，再进入死亡结算', () => {
    const oldPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '贝拉', hp: 2, godName: 'VRI', godLevel: 3 }),
    ];
    const players = oldPlayers.map(player => ({ ...player, hand: [...player.hand], godZone: [...player.godZone] }));
    const deck = [
      { id: 'failed-god', name: '邪神牌', isGod: true },
      { id: 'failed-zone', name: '区域牌', isZone: true },
    ];
    const discard = [];
    const log = ['贝拉 失去 3 HP'];
    const damage = submitLossEvents({
      players,
      deck,
      discard,
      log,
      currentTurn: 0,
      events: [{ targetIdx: 1, lostHp: 3, source: '致死伤害' }],
      statEventSeq: 10,
      statEventLogs: log,
    });
    const oldState = { players: oldPlayers, deck: [...deck, ...discard], discard: [], log: [], _statEvents: [], _statEventSeq: 9 };
    const nextState = {
      ...oldState,
      players,
      deck,
      discard,
      log,
      ...buildStatChangeStatePatch(oldState, damage),
    };

    const queue = buildAnimQueue(oldState, nextState);
    const damageIndex = queue.findIndex(step => step.type === 'HP_DAMAGE');
    const revealIndex = queue.findIndex(step => step.type === 'VRI_IMMORTAL_REVEAL');
    const deathIndex = queue.findIndex(step => step.type === 'GUILLOTINE');

    expect(players[1]).toMatchObject({ hp: 0, isDead: true });
    expect(damageIndex).toBeGreaterThanOrEqual(0);
    expect(revealIndex).toBeGreaterThan(damageIndex);
    expect(deathIndex).toBeGreaterThan(revealIndex);
  });
});
