import { describe, expect, it } from 'vitest';
import { buildAiHuntEventAnimQueue, buildAnimQueue } from '../animQueueCore';
import { createCardEffectEvent, createEarthquakeEvent } from '../visualEvents';
import { makeGodCard, makeGs, makePlayer } from './factory';

describe('buildAnimQueue stat animations', () => {
  it('阿波菲斯黑夜降临会播放日食动画', () => {
    const oldGs = makeGs({
      players: [makePlayer()],
      log: ['旧日志'],
      apophisNight: null,
    });
    const newGs = makeGs({
      players: [makePlayer()],
      log: ['旧日志', '【噬日灭世】黑夜降临，选中目标累计12次后结束'],
      apophisNight: { active: true, threshold: 2, count: 0, limit: 12 },
    });

    expect(buildAnimQueue(oldGs, newGs).map(step => step.type)).toContain('APOPHIS_ECLIPSE');
  });

  it('投掷石块会先播放骰子，再播放转盘，最后播放扣血', () => {
    const playersBefore = [makePlayer({ name: '你', hp: 10 }), makePlayer({ name: '艾伦', hp: 10 })];
    const playersAfter = [makePlayer({ name: '你', hp: 10 }), makePlayer({ name: '艾伦', hp: 7 })];
    const oldGs = makeGs({ players: playersBefore, log: [], _randomTargetSeq: 0, _statEventSeq: 0 });
    const newGs = makeGs({
      players: playersAfter,
      log: ['你 掷出 4 点，随机砸向 艾伦（距离1），造成 3 HP 伤害'],
      _randomTargetSeq: 1,
      _randomTargetEvents: [{ seq: 1, sourceIdx: 0, targetIdx: 1, label: '投掷石块', roll: 4, distance: 1, damage: 3, diceBefore: true, phaseOrder: 1 }],
      _statEventSeq: 1,
      _statEvents: [{ type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10, isDead: false }, to: { hp: 7, san: 10, isDead: false }, seq: 1, phaseOrder: 2 }],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const diceIdx = queue.findIndex(step => step.type === 'DICE_ROLL' && step.diceMode === 'throwStone');
    const randomIdx = queue.findIndex(step => step.type === 'RANDOM_TARGET');
    const hpIdx = queue.findIndex(step => step.type === 'HP_DAMAGE');

    expect(queue[diceIdx]).toMatchObject({ d1: 4 });
    expect(queue[diceIdx]).not.toHaveProperty('throwStoneDamage');
    expect(queue[diceIdx]).not.toHaveProperty('throwStoneDistance');
    expect(queue[randomIdx]).toMatchObject({ sourceIdx: 0, targetIdx: 1, roll: 4, damage: 3 });
    expect(randomIdx).toBeGreaterThan(diceIdx);
    expect(hpIdx).toBeGreaterThan(randomIdx);
  });

  it('钻地魔虫会先播放全场扣血，再播放转盘和随机扣血', () => {
    const playersBefore = [
      makePlayer({ name: '你', hp: 10 }),
      makePlayer({ name: '艾伦', hp: 10 }),
      makePlayer({ name: '贝拉', hp: 10 }),
    ];
    const playersAfter = [
      makePlayer({ name: '你', hp: 8 }),
      makePlayer({ name: '艾伦', hp: 6 }),
      makePlayer({ name: '贝拉', hp: 8 }),
    ];
    const oldGs = makeGs({ players: playersBefore, log: [], _randomTargetSeq: 0, _statEventSeq: 0 });
    const newGs = makeGs({
      players: playersAfter,
      log: ['全体存活角色失去 2 HP', '艾伦 额外失去 2 HP'],
      _randomTargetSeq: 1,
      _randomTargetEvents: [{ seq: 1, sourceIdx: 0, targetIdx: 1, label: '钻地魔虫', phaseOrder: 1 }],
      _statEventSeq: 1,
      _statEvents: [
        { type: 'HP_LOSS', target: 0, from: { hp: 10, san: 10, isDead: false }, to: { hp: 8, san: 10, isDead: false }, seq: 1, phaseOrder: 0 },
        { type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10, isDead: false }, to: { hp: 8, san: 10, isDead: false }, seq: 1, phaseOrder: 0 },
        { type: 'HP_LOSS', target: 2, from: { hp: 10, san: 10, isDead: false }, to: { hp: 8, san: 10, isDead: false }, seq: 1, phaseOrder: 0 },
        { type: 'HP_LOSS', target: 1, from: { hp: 8, san: 10, isDead: false }, to: { hp: 6, san: 10, isDead: false }, seq: 1, phaseOrder: 2 },
      ],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const firstHpIdx = queue.findIndex(step => step.type === 'HP_DAMAGE');
    const randomIdx = queue.findIndex(step => step.type === 'RANDOM_TARGET');
    const secondHpIdx = queue.findIndex((step, idx) => step.type === 'HP_DAMAGE' && idx > randomIdx);

    expect(firstHpIdx).toBeGreaterThanOrEqual(0);
    expect(randomIdx).toBeGreaterThan(firstHpIdx);
    expect(secondHpIdx).toBeGreaterThan(randomIdx);
    expect(queue[firstHpIdx].hitIndices).toEqual([0, 1, 2]);
    expect(queue[secondHpIdx].hitIndices).toEqual([1]);
  });

  it('阿波菲斯黑夜选目标会播放掷骰，追捕偏移时重播锁定动画', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' }), makePlayer({ name: '贝拉' })];
    const oldGs = makeGs({ players, log: [], _apophisTargetSeq: 1 });
    const newGs = makeGs({
      players,
      log: ['【黑夜】你 选择【追捕】目标掷出 1，目标由 艾伦 错乱为 贝拉，失去1SAN'],
      _apophisTargetSeq: 2,
      apophisNight: { active: true, threshold: 2, count: 3, limit: 12 },
      _apophisTargetEvent: {
        seq: 2,
        actorIdx: 0,
        actorName: '你',
        selectedIdx: 1,
        selectedName: '艾伦',
        targetIdx: 2,
        targetName: '贝拉',
        roll: 1,
        threshold: 2,
        changed: true,
        label: '选择【追捕】目标',
        log: '【黑夜】你 选择【追捕】目标掷出 1，目标由 艾伦 错乱为 贝拉，失去1SAN',
      },
    });

    const queue = buildAnimQueue(oldGs, newGs);

    expect(queue[0]).toMatchObject({ type: 'DICE_ROLL', diceMode: 'apophisNight', apophisChanged: true, d1: 1, rollerName: '你' });
    expect(queue[0]._apophisNight).toEqual(newGs.apophisNight);
    expect(queue[1]).toMatchObject({ type: 'SKILL_HUNT', targetIdx: 2 });
    expect(queue[1]._apophisNight).toEqual(newGs.apophisNight);
  });

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

  it('恢复 HP 同时失去 SAN 时同时播放治疗和 SAN 损失动画', () => {
    const oldGs = makeGs({
      players: [makePlayer({ hp: 5, san: 8 })],
      log: [],
    });
    const newGs = makeGs({
      players: [makePlayer({ hp: 10, san: 6 })],
      log: ['你 回复 5 HP，失去 2 SAN'],
    });

    expect(buildAnimQueue(oldGs, newGs).map(step => step.type)).toEqual(['HP_HEAL', 'SAN_DAMAGE']);
  });

  it('手牌邪神牌进入 godZone 时不播放通用飞牌动画', () => {
    const godCard = makeGodCard('NYA');
    const oldGs = makeGs({
      players: [makePlayer({ hand: [godCard], godZone: [] })],
      log: [],
    });
    const newGs = makeGs({
      players: [makePlayer({ hand: [], godZone: [godCard], godName: 'NYA', godLevel: 1 })],
      log: ['你从手牌直接信仰 伏行之混沌，获得千人千貌(Lv.1)（骷髅头不计）'],
    });

    expect(buildAnimQueue(oldGs, newGs).some(step => step.type === 'CARD_TRANSFER')).toBe(false);
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

  it('地动山摇 visualEvent 会显式产生独立地震动画', () => {
    const oldGs = makeGs({
      players: [makePlayer()],
      log: ['旧日志'],
    });
    const event = createEarthquakeEvent({ msgs: ['你 摸到 [B2] 地动山摇（强制触发）'] });
    const newGs = makeGs({
      players: [makePlayer()],
      log: ['旧日志', '你 摸到 [B2] 地动山摇（强制触发）'],
      _visualEvents: [event],
    });

    expect(buildAnimQueue(oldGs, newGs).map(step => step.type)).toContain('EARTHQUAKE');
  });

  it('地磁反转 visualEvent 会显式产生指南针动画', () => {
    const oldGs = makeGs({
      players: [makePlayer()],
      discard: [],
      log: ['旧日志'],
    });
    const restoreCard = { id: 'gmr-test', name: '反转复原', type: 'geomagneticRestore', isGeomagneticRestore: true };
    const event = createCardEffectEvent({
      effectKey: 'geomagneticReversal',
      card: { id: 'gm', name: '地磁反转', key: 'C2', type: 'geomagneticReversal' },
      actorIdx: 0,
      beforePlayers: oldGs.players,
      beforeDiscard: [],
      afterPlayers: oldGs.players,
      afterDiscard: [restoreCard],
      msgs: ['【地磁反转】一张"反转复原"被洗入弃牌堆，场地被地磁反转笼罩！'],
      payload: { restoreCard },
    });
    const newGs = makeGs({
      players: [makePlayer()],
      discard: [restoreCard],
      log: ['旧日志', '【地磁反转】一张"反转复原"被洗入弃牌堆，场地被地磁反转笼罩！'],
      _visualEvents: [event],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const reversalIdx = queue.findIndex(item => item.type === 'GEOMAGNETIC_REVERSAL');
    const restoreIdx = queue.findIndex(item => item.type === 'GEOMAGNETIC_RESTORE_SHUFFLE');
    const step = queue[reversalIdx];
    const restoreStep = queue[restoreIdx];

    expect(step).toMatchObject({
      type: 'GEOMAGNETIC_REVERSAL',
      actorIdx: 0,
      visualSetupTiming: 'queueStart',
    });
    expect(restoreIdx).toBe(reversalIdx + 1);
    expect(restoreStep).toMatchObject({
      type: 'GEOMAGNETIC_RESTORE_SHUFFLE',
      actorIdx: 0,
      restoreCard,
      visualSetupTiming: 'queueStart',
      visualSetupPatch: { players: oldGs.players, discard: [] },
    });
    expect(restoreStep.visualTimeline[0]).toEqual({ atMs: 0, patch: { players: oldGs.players, discard: [] } });
    expect(restoreStep.visualTimeline[1]).toEqual({ atMs: 880, patch: { players: oldGs.players, discard: [restoreCard] } });
  });

  it('活火山 visualEvent 会显式产生喷发动画', () => {
    const beforePlayers = [makePlayer({ name: '你', hp: 10 })];
    const afterPlayers = [makePlayer({ name: '你', hp: 6 })];
    const oldGs = makeGs({
      players: beforePlayers,
      discard: [],
      log: ['旧日志'],
    });
    const event = createCardEffectEvent({
      effectKey: 'volcano',
      card: { id: 'volcano', name: '活火山', key: 'C1', type: 'allDamageHP' },
      actorIdx: 0,
      beforePlayers,
      beforeDiscard: [],
      afterPlayers,
      afterDiscard: [],
      msgs: ['全体存活角色失去 4 HP'],
    });
    const newGs = makeGs({
      players: afterPlayers,
      discard: [],
      log: ['旧日志', '全体存活角色失去 4 HP'],
      _visualEvents: [event],
    });

    const step = buildAnimQueue(oldGs, newGs).find(item => item.type === 'VOLCANO');

    expect(step).toMatchObject({
      type: 'VOLCANO',
      actorIdx: 0,
      beforePlayers,
      visualSetupTiming: 'queueStart',
      visualSetupPatch: { players: beforePlayers, discard: [] },
    });
    expect(step.visualTimeline[0]).toEqual({ atMs: 0, patch: { players: beforePlayers, discard: [] } });
    expect(step.visualTimeline[1]).toEqual({ atMs: 1250, patch: { players: afterPlayers, discard: [] } });
  });

  it('开局遮蔽态已带最新日志时仍能从地震 visualEvent 产生动画', () => {
    const drawLog = '你 摸到 [B2] 地动山摇（强制触发）';
    const beforePlayers = [makePlayer({ hand: [{ id: 'before' }] })];
    const event = createEarthquakeEvent({ beforePlayers, beforeDiscard: [], msgs: [drawLog] });
    const oldGs = makeGs({
      players: [makePlayer()],
      log: ['游戏开始。每人获得四张初始手牌。', drawLog],
    });
    const newGs = makeGs({
      players: [makePlayer()],
      log: ['游戏开始。每人获得四张初始手牌。', drawLog],
      _drawLogs: [drawLog],
      _playersBeforeThisDraw: beforePlayers,
      _visualEvents: [event],
    });

    expect(buildAnimQueue(oldGs, newGs).map(step => step.type)).toContain('EARTHQUAKE');
  });

  it('后续行动不会因为残留地动山摇摸牌日志重播地震动画', () => {
    const drawLog = '你 摸到 [B2] 地动山摇（强制触发）';
    const oldGs = makeGs({
      players: [makePlayer(), makePlayer()],
      log: ['游戏开始。每人获得四张初始手牌。', drawLog],
      _drawLogs: [drawLog],
      _earthquakeSeq: 1,
    });
    const newGs = makeGs({
      players: [makePlayer(), makePlayer({ hp: 7 })],
      log: ['游戏开始。每人获得四张初始手牌。', drawLog, '弃 [A1] 测试 → 艾伦 受 3HP 伤害！'],
      _drawLogs: [drawLog],
      _earthquakeSeq: 1,
    });

    expect(buildAnimQueue(oldGs, newGs).map(step => step.type)).not.toContain('EARTHQUAKE');
  });

  it('地震动画携带结算前手牌和分段弃牌事件', () => {
    const beforePlayers = [makePlayer({ hand: [{ id: 'a' }] })];
    const midEffectPlayers = [makePlayer({ hand: [] })];
    const finalPlayers = [makePlayer({ hand: [{ id: 'quake' }] })];
    const oldGs = makeGs({
      players: beforePlayers,
      discard: [],
      log: ['旧日志'],
    });
    const event = createEarthquakeEvent({
      beforePlayers,
      beforeDiscard: [],
      discardEvents: [{ playerIndex: 0, card: { id: 'a', letter: 'A' }, afterPlayers: midEffectPlayers }],
    });
    const newGs = makeGs({
      players: finalPlayers,
      log: ['旧日志'],
      _visualEvents: [event],
    });

    const earthquake = buildAnimQueue(oldGs, newGs).find(step => step.type === 'EARTHQUAKE');

    expect(earthquake.beforePlayers).toBe(beforePlayers);
    expect(earthquake.beforeDiscard).toEqual([]);
    expect(earthquake.visualSetupTiming).toBe('queueStart');
    expect(earthquake.visualSetupPatch).toEqual({ discard: [] });
    expect(earthquake.discardEvents).toHaveLength(1);
    expect(earthquake.discardEvents[0].delayMs).toBe(420);
    expect(earthquake.discardEvents[0].durationMs).toBe(620);
    expect(earthquake.discardEvents[0].afterPlayers[0].hand).toEqual([{ id: 'quake' }]);
    expect(earthquake.visualTimeline[0]).toEqual({ atMs: 0, patch: { players: beforePlayers, discard: [] } });
    expect(earthquake.visualTimeline[1].atMs).toBe(1040);
    expect(earthquake.visualTimeline[1].patch.players[0].hand).toEqual([{ id: 'quake' }]);
  });

  it('活埋动画锁定埋牌前的手牌显示', () => {
    const beforePlayers = [makePlayer({ name: '你', hand: [{ id: 'a' }] })];
    const afterPlayers = [makePlayer({ name: '你', hand: [] })];
    const oldGs = makeGs({
      players: beforePlayers,
      log: ['旧日志'],
    });
    const newGs = makeGs({
      players: afterPlayers,
      log: ['旧日志', '【活埋】你 将 [A1] 测试牌 放到了牌堆底'],
    });

    const bury = buildAnimQueue(oldGs, newGs).find(step => step.type === 'BURY_TO_DECK');

    expect(bury).toMatchObject({
      fromPid: 0,
      visualSetupPatch: { players: beforePlayers },
    });
  });
});

describe('buildAiHuntEventAnimQueue', () => {
  it('AI追捕亮牌使用角色区域亮牌动画而非摸牌翻牌', () => {
    const revealedCard = { id: 'rev-a', key: 'A1', name: '坠落' };
    const beforePlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯' }),
      makePlayer({ name: '艾伦', hand: [revealedCard] }),
    ];

    const queue = buildAiHuntEventAnimQueue({
      hunterIdx: 1,
      targetIdx: 2,
      revealedCard,
      beforePlayers,
      msgs: ['卡洛斯（追猎者）对 艾伦 【追捕】，亮出 [A1]'],
    }, '卡洛斯');

    expect(queue.map(step => step.type)).toEqual(['SKILL_HUNT', 'HUNT_REVEAL_CARD']);
    expect(queue[1]).toMatchObject({ card: revealedCard, targetPid: 2 });
  });

  it('联机追捕结算事件可跳过已播放的追捕和亮牌动画', () => {
    const hunterDiscard = { id: 'hunter-d1', key: 'D1', name: '钻地魔虫' };
    const beforePlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯', hp: 9, hand: [hunterDiscard] }),
      makePlayer({ name: '艾伦', hp: 9 }),
    ];
    const afterDiscardPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯', hp: 9, hand: [] }),
      makePlayer({ name: '艾伦', hp: 9 }),
    ];
    const afterPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯', hp: 9, hand: [] }),
      makePlayer({ name: '艾伦', hp: 6 }),
    ];

    const queue = buildAiHuntEventAnimQueue({
      hunterIdx: 1,
      targetIdx: 2,
      discardedCard: hunterDiscard,
      beforePlayers,
      afterDiscardPlayers,
      afterDiscardDiscard: [hunterDiscard],
      afterPlayers,
      afterResultDiscard: [hunterDiscard],
      beforeLog: ['旧日志'],
      afterLog: ['旧日志', '弃 [D1] 钻地魔虫 → 艾伦 受 3HP 伤害'],
      msgs: ['弃 [D1] 钻地魔虫 → 艾伦 受 3HP 伤害'],
      skipIntro: true,
      skipReveal: true,
    }, '卡洛斯');

    expect(queue.map(step => step.type)).not.toContain('SKILL_HUNT');
    expect(queue.map(step => step.type)).not.toContain('HUNT_REVEAL_CARD');
    expect(queue[0]).toMatchObject({ type: 'DISCARD', card: hunterDiscard });
    expect(queue.map(step => step.type)).toContain('HP_DAMAGE');
  });

  it('追捕击杀后先播放死亡公告，再暗抽，最后弃置剩余手牌', () => {
    const hunterDiscard = { id: 'hunter-d1', key: 'D1', name: '钻地魔虫' };
    const stolenA = { id: 'stolen-a', key: 'A1', name: '坠落' };
    const stolenB = { id: 'stolen-b', key: 'B1', name: '圣甲虫' };
    const leftover = { id: 'leftover', key: 'C1', name: '亡者军团' };
    const beforePlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯', hp: 9, hand: [hunterDiscard] }),
      makePlayer({ name: '艾伦', hp: 3, hand: [stolenA, stolenB, leftover] }),
    ];
    const afterDiscardPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯', hp: 9, hand: [] }),
      makePlayer({ name: '艾伦', hp: 3, hand: [stolenA, stolenB, leftover] }),
    ];
    const afterDamagePlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯', hp: 9, hand: [] }),
      makePlayer({ name: '艾伦', hp: 0, isDead: true, hand: [stolenA, stolenB, leftover] }),
    ];
    const afterPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯', hp: 9, hand: [stolenA, stolenB] }),
      makePlayer({ name: '艾伦', hp: 0, isDead: true, hand: [] }),
    ];

    const queue = buildAiHuntEventAnimQueue({
      hunterIdx: 1,
      targetIdx: 2,
      discardedCard: hunterDiscard,
      beforePlayers,
      afterDiscardPlayers,
      afterDiscardDiscard: [hunterDiscard],
      afterDamagePlayers,
      afterDamageDiscard: [hunterDiscard],
      afterDamageLog: [
        '旧日志',
        '卡洛斯（追猎者）对 艾伦 【追捕】，亮出 [D1]',
        '弃 [D1] 钻地魔虫 → 艾伦 受 3HP 伤害！',
        '☠ 艾伦（邪祀者）倒下了！',
      ],
      afterPlayers,
      afterResultDiscard: [hunterDiscard, leftover],
      beforeLog: ['旧日志'],
      afterLog: [
        '旧日志',
        '卡洛斯（追猎者）对 艾伦 【追捕】，亮出 [D1]',
        '弃 [D1] 钻地魔虫 → 艾伦 受 3HP 伤害！',
        '☠ 艾伦（邪祀者）倒下了！',
        '卡洛斯 从 艾伦 的手牌中暗抽了一张！',
        '卡洛斯 从 艾伦 的手牌中暗抽了一张！',
      ],
      msgs: [
        '卡洛斯（追猎者）对 艾伦 【追捕】，亮出 [D1]',
        '弃 [D1] 钻地魔虫 → 艾伦 受 3HP 伤害！',
        '☠ 艾伦（邪祀者）倒下了！',
        '卡洛斯 从 艾伦 的手牌中暗抽了一张！',
        '卡洛斯 从 艾伦 的手牌中暗抽了一张！',
      ],
      lootTransferCount: 2,
      lootDiscardCards: [leftover],
    }, '卡洛斯');

    const types = queue.map(step => step.type);
    const deathIdx = types.indexOf('DEATH');
    const lootIdx = types.findIndex((type, idx) => type === 'CARD_TRANSFER' && idx > deathIdx);
    const leftoverDiscardIdx = types.findIndex((type, idx) => type === 'DISCARD' && idx > lootIdx && queue[idx].card?.id === leftover.id);
    const finalPatchIdx = types.length - 1;

    expect(deathIdx).toBeGreaterThan(-1);
    expect(lootIdx).toBeGreaterThan(deathIdx);
    expect(leftoverDiscardIdx).toBeGreaterThan(lootIdx);
    expect(types[finalPatchIdx]).toBe('STATE_PATCH');
  });
});
