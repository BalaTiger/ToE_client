import { describe, expect, it } from 'vitest';
import {
  buildAiHuntEventAnimQueue,
  buildAnimQueue,
  buildHandDeltaInferenceQueue,
  getAiPreHuntActionSteps,
} from '../animQueueCore';
import { dedupeInferredDiscardTransfers } from '../animQueueHelpers';
import { copyPlayers } from '../coreUtils';
import { buildFreshStatVisualEvents, createCardEffectEvent, createEarthquakeEvent, createGodPowerBlockedEvent, createGodStatusChangedEvent } from '../visualEvents';
import { makeGodCard, makeGs, makePlayer } from './factory';

describe('buildAnimQueue stat animations', () => {
  it('uses distinct explicit events for consecutive worship and upgrade highlights', () => {
    const initial = [makePlayer({ name: '你' }), makePlayer({ name: '贝拉' })];
    const worshipped = [initial[0], { ...initial[1], godName: 'TSG', godLevel: 1 }];
    const upgraded = [initial[0], { ...worshipped[1], godLevel: 2 }];
    const worship = createGodStatusChangedEvent({ playerIdx: 1, godKey: 'TSG', godLevel: 1, playersBefore: initial, playersAfter: worshipped, msgs: ['贝拉 信仰了 蟾蜍之神'] });
    const upgrade = createGodStatusChangedEvent({ playerIdx: 1, godKey: 'TSG', godLevel: 2, playersBefore: worshipped, playersAfter: upgraded, msgs: ['贝拉 从手牌升级邪神之力至 Lv.2'] });
    const oldGs = makeGs({ players: initial, log: [] });
    const newGs = makeGs({ players: upgraded, log: [...worship.msgs, ...upgrade.msgs], _visualEvents: [worship, upgrade] });

    const highlights = buildAnimQueue(oldGs, newGs).filter(step => step.type === 'GOD_HIGHLIGHT');

    expect(highlights).toHaveLength(2);
    expect(highlights.map(step => step.visualEventId)).toEqual([worship.id, upgrade.id]);
    expect(highlights.map(step => step.godLevel)).toEqual([1, 2]);
  });

  it('显式回放其他角色因坠落被强制弃置的卡牌', () => {
    const fallCard = { id: 'fall-card', key: 'A1', name: '坠落', type: 'selfDamageDiscardHP' };
    const discardedCard = { id: 'forced-discard', key: 'B2', name: '地动山摇', type: 'allDiscard' };
    const beforePlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦', hand: [fallCard, discardedCard] }),
    ];
    const afterPlayers = [
      beforePlayers[0],
      { ...beforePlayers[1], hp: 7, hand: [fallCard] },
    ];
    const oldGs = makeGs({ players: beforePlayers, discard: [], log: [] });
    const event = createCardEffectEvent({
      effectKey: 'forcedRandomDiscard',
      card: fallCard,
      actorIdx: 1,
      beforePlayers,
      beforeDiscard: [],
      afterPlayers,
      afterDiscard: [discardedCard],
      discardEvents: [{
        playerIndex: 1,
        card: discardedCard,
        afterPlayers,
        afterDiscard: [discardedCard],
      }],
      msgs: ['艾伦 失去了 [B2] 地动山摇'],
    });
    const newGs = {
      ...oldGs,
      players: afterPlayers,
      discard: [discardedCard],
      log: ['艾伦 失去了 [B2] 地动山摇'],
      _visualEvents: [event],
    };

    const queue = dedupeInferredDiscardTransfers(buildAnimQueue(oldGs, newGs));

    expect(queue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'DISCARD',
        card: discardedCard,
        cards: [discardedCard],
        targetPid: 1,
        triggerName: '艾伦',
        visualSetupTiming: 'stepStart',
      }),
    ]));
    expect(queue).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'CARD_TRANSFER',
        fromPid: 1,
        dest: 'discard',
      }),
    ]));
  });

  it('显式回放其他角色收入引燃火把后弃置的卡牌', () => {
    const torchCard = { id: 'torch-card', key: 'C3', name: '引燃火把', type: 'igniteTorch' };
    const discardedCard = { id: 'torch-discard', key: 'NYA', name: '伏行之混沌', type: 'god' };
    const oldPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '黛安娜', hand: [discardedCard] }),
    ];
    const beforeEffectPlayers = [
      oldPlayers[0],
      { ...oldPlayers[1], hand: [discardedCard, torchCard] },
    ];
    const afterPlayers = [
      oldPlayers[0],
      { ...oldPlayers[1], hand: [torchCard] },
    ];
    const oldGs = makeGs({ players: oldPlayers, discard: [], log: [] });
    const event = createCardEffectEvent({
      effectKey: 'forcedRandomDiscard',
      card: torchCard,
      actorIdx: 1,
      beforePlayers: beforeEffectPlayers,
      beforeDiscard: [],
      afterPlayers,
      afterDiscard: [discardedCard],
      discardEvents: [{
        playerIndex: 1,
        card: discardedCard,
        afterPlayers,
        afterDiscard: [discardedCard],
      }],
      msgs: ['黛安娜 失去了 伏行之混沌'],
    });
    const newGs = {
      ...oldGs,
      players: afterPlayers,
      discard: [discardedCard],
      log: ['黛安娜 失去了 伏行之混沌'],
      _visualEvents: [event],
    };

    const queue = dedupeInferredDiscardTransfers(buildAnimQueue(oldGs, newGs));

    expect(queue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'DISCARD',
        card: discardedCard,
        targetPid: 1,
        triggerName: '黛安娜',
        visualSetupTiming: 'stepStart',
      }),
    ]));
  });

  it('从手牌信仰后立即生成可排序的邪神高亮步骤', () => {
    const godCard = { id: 'vri-faith', name: '弗栗多', godKey: 'VRI', isGod: true, type: 'god' };
    const oldGs = makeGs({
      players: [makePlayer({ name: '艾伦', hand: [godCard], godName: null, godLevel: 0, godZone: [] })],
      log: [],
    });
    const msg = '艾伦 从手牌信仰 弗栗多，获得不灭之躯(Lv.1)（骷髅头不计）';
    const afterPlayers = [{ ...oldGs.players[0], hand: [], godName: 'VRI', godLevel: 1, godZone: [godCard] }];
    const event = createGodStatusChangedEvent({
      playerIdx: 0,
      playerName: '艾伦',
      godKey: 'VRI',
      godLevel: 1,
      msgs: [msg],
      playersBefore: oldGs.players,
      playersAfter: afterPlayers,
    });
    const newGs = {
      ...oldGs,
      players: afterPlayers,
      log: [msg],
      _visualEvents: [event],
    };

    expect(buildAnimQueue(oldGs, newGs)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'GOD_HIGHLIGHT', targetPid: 0, godKey: 'VRI', msgs: [msg] }),
    ]));
  });

  it('抢夺同一邪神信仰时显式播放旧信徒神牌进入弃牌堆', () => {
    const oldGod = makeGodCard('VRI');
    const newGod = makeGodCard('VRI');
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '新信徒', hand: [newGod], godName: null, godZone: [] }),
        makePlayer({ name: '旧信徒', godName: 'VRI', godLevel: 1, godZone: [oldGod] }),
      ],
      log: [],
    });
    const newGs = makeGs({
      players: [
        makePlayer({ name: '新信徒', hand: [], godName: 'VRI', godLevel: 1, godZone: [newGod] }),
        makePlayer({ name: '旧信徒', san: 9, godName: null, godLevel: 0, godZone: [] }),
      ],
      discard: [oldGod],
      log: ['新信徒 从手牌信仰 弗栗多', '旧信徒 被邪神抛弃，失去1SAN'],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    expect(queue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'CARD_TRANSFER',
        fromPid: 1,
        dest: 'discard',
        count: 1,
        cards: [oldGod],
        sourceAnchor: 'godPower',
        effect: 'godAbandon',
        faceUp: true,
      }),
    ]));
  });

  it('邪神抛弃不会被检定前的中间快照吞掉', () => {
    const oldGod = makeGodCard('VRI');
    const oldFollower = makePlayer({ name: '旧信徒', godName: 'VRI', godLevel: 1, godZone: [oldGod] });
    const abandoned = makePlayer({ name: '旧信徒', san: 9, godName: null, godLevel: 0, godZone: [] });
    const oldGs = makeGs({ players: [oldFollower], log: [] });
    const newGs = makeGs({
      players: [abandoned],
      discard: [oldGod],
      log: ['旧信徒 被邪神抛弃，失去1SAN'],
      _inspectionEvents: [{ seq: 1, beforePlayers: [oldFollower], beforeLog: [] }],
    });

    expect(buildAnimQueue(oldGs, newGs)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'CARD_TRANSFER',
        dest: 'discard',
        cards: [oldGod],
        effect: 'godAbandon',
        faceUp: true,
      }),
    ]));
  });

  it('显式改信事件会先把旧神牌正面送入弃牌堆，再高亮新神', () => {
    const oldGod = makeGodCard('VRI');
    const newGod = makeGodCard('APO');
    const oldGs = makeGs({
      players: [makePlayer({ name: '你', godName: 'VRI', godLevel: 1, godZone: [oldGod] })],
      log: [],
    });
    const playersAfterExit = [makePlayer({ name: '你', san: 9, godName: null, godLevel: 0, godZone: [] })];
    const playersAfter = [makePlayer({ name: '你', san: 9, godName: 'APO', godLevel: 1, godZone: [newGod] })];
    const event = createGodStatusChangedEvent({
      playerIdx: 0,
      playerName: '你',
      godKey: 'APO',
      godLevel: 1,
      msgs: ['你 信仰了 阿波菲斯，获得噬日灭世(Lv.1)'],
      playersBefore: playersAfterExit,
      playersAfter,
      faithSettlement: {
        previousFaithExit: {
          playerIdx: 0,
          cards: [oldGod],
          msgs: ['你 改信新神，失去1SAN，旧神牌入弃牌堆'],
          effect: 'godConvertDiscard',
          playersBefore: oldGs.players,
          playersAfter: playersAfterExit,
          discardBefore: [],
          discardAfter: [oldGod],
        },
        abandonedFollowers: [],
      },
    });
    const newGs = makeGs({
      players: playersAfter,
      discard: [oldGod],
      log: ['你 改信新神，失去1SAN，旧神牌入弃牌堆', '你 信仰了 阿波菲斯，获得噬日灭世(Lv.1)'],
      _visualEvents: [event],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const discardIdx = queue.findIndex(step => step?.effect === 'godConvertDiscard');
    const highlightIdx = queue.findIndex(step => step?.type === 'GOD_HIGHLIGHT');
    expect(queue[discardIdx]).toMatchObject({
      type: 'CARD_TRANSFER', fromPid: 0, dest: 'discard', cards: [oldGod], faceUp: true,
    });
    expect(discardIdx).toBeGreaterThanOrEqual(0);
    expect(highlightIdx).toBeGreaterThan(discardIdx);
  });

  it('远端繁衍生成带黑山羊奔跑音效标记的专属转牌步骤', () => {
    const goat = { id: 'goat-young', name: '黑山羊幼仔', type: 'blackGoatYoung' };
    const oldGs = makeGs({
      players: [makePlayer({ name: '艾伦' }), makePlayer({ name: '贝拉' })],
      log: [],
    });
    const newGs = makeGs({
      players: [oldGs.players[0], { ...oldGs.players[1], hand: [goat] }],
      log: ['【繁衍】艾伦 将黑山羊幼仔传播给了 贝拉'],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    expect(queue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'CARD_TRANSFER',
        fromPid: 0,
        toPid: 1,
        count: 1,
        effect: 'blackGoat',
        durationMs: 1500,
      }),
    ]));
  });

  it('旧状态已携带的统计事件不会因标量水位滞后而跨回合重播', () => {
    const allenRestLog = '艾伦 选择【休息】，掷骰 5、1，取高值回复 5HP，翻面休息中';
    const playerGoatLog = '【黑山羊幼仔】你 失去 2 HP 和 2 SAN';
    const playersBeforeTurn = [
      makePlayer({ name: '你', hp: 8, san: 8 }),
      makePlayer({ name: '艾伦', hp: 8, san: 5 }),
    ];
    const playersAfterTurnStart = [
      makePlayer({ name: '你', hp: 6, san: 6 }),
      makePlayer({ name: '艾伦', hp: 8, san: 5 }),
    ];
    const oldGs = makeGs({
      players: playersBeforeTurn,
      log: [allenRestLog],
      _statEventSeq: 0,
      _statEvents: [{
        seq: 7,
        type: 'HP_GAIN',
        target: 1,
        from: { hp: 3, san: 5 },
        to: { hp: 8, san: 5 },
        logHint: allenRestLog,
      }],
    });
    const newGs = makeGs({
      players: playersAfterTurnStart,
      log: [allenRestLog, playerGoatLog],
      _statEventSeq: 8,
      _statEvents: [
        ...oldGs._statEvents,
        { seq: 8, type: 'HP_LOSS', target: 0, from: { hp: 8, san: 8 }, to: { hp: 6, san: 8 }, logHint: playerGoatLog },
        { seq: 8, type: 'SAN_LOSS', target: 0, from: { hp: 6, san: 8 }, to: { hp: 6, san: 6 }, logHint: playerGoatLog },
      ],
    });

    const queue = buildAnimQueue(oldGs, newGs);

    expect(queue.filter(step => step.type === 'HP_HEAL')).toHaveLength(0);
    expect(queue.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(1);
    expect(queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
    expect(queue.find(step => step.type === 'SAN_DAMAGE')).toMatchObject({ hitIndices: [0] });
  });

  it('stat visual event 只包含本次 statLogs 对应的事件，避免重播上个 AI 的 SAN 扣减', () => {
    const allenLog = '艾伦 遭遇邪神 森之领主！（第1次）失去1SAN';
    const bellaLog = '贝拉 遭遇邪神 阿波菲斯！（第1次）失去1SAN';
    const events = buildFreshStatVisualEvents({
      _statLogs: [bellaLog],
      _statEvents: [
        { type: 'SAN_LOSS', target: 1, from: { san: 10 }, to: { san: 9 }, logHint: allenLog, seq: 1 },
        { type: 'SAN_LOSS', target: 2, from: { san: 10 }, to: { san: 9 }, logHint: bellaLog, seq: 2 },
      ],
    }, 0);

    expect(events).toHaveLength(1);
    expect(events[0].statEvents).toMatchObject([{ target: 2, seq: 2 }]);
  });

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

  it('弗栗多不灭之躯触发时会公示翻开的牌并在死亡动画前播放', () => {
    const revealed = [
      { id: 'a1', name: '偷吃龙蛋', key: 'A1', letter: 'A', number: 1, type: 'selfHealHP', isZone: true },
      { id: 'b2', name: '强心剂', key: 'B2', letter: 'B', number: 2, type: 'selfHealHP', isZone: true },
    ];
    const oldGs = makeGs({
      players: [makePlayer({ name: '你' }), makePlayer({ name: '贝拉', hp: 3, godName: 'VRI', godLevel: 3 })],
      discard: [],
      log: ['旧日志'],
      _statEventSeq: 0,
    });
    const vriLog = '【不灭之躯】贝拉 在濒死之际激发龙血之力，翻开 2 张：[A1] 偷吃龙蛋、[B2] 强心剂；未见邪神牌，HP恢复至1！';
    const newGs = makeGs({
      players: [makePlayer({ name: '你' }), makePlayer({ name: '贝拉', hp: 1, godName: 'VRI', godLevel: 3 })],
      discard: revealed,
      log: ['旧日志', '贝拉 失去 5 HP', vriLog],
      _statEventSeq: 1,
      _statEvents: [{ type: 'HP_LOSS', target: 1, from: { hp: 3, san: 10, isDead: false }, to: { hp: 1, san: 10, isDead: false }, seq: 1, logHint: '贝拉 失去 5 HP' }],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const hpIdx = queue.findIndex(step => step.type === 'HP_DAMAGE');
    const revealIdx = queue.findIndex(step => step.type === 'VRI_IMMORTAL_REVEAL');
    const deathIdx = queue.findIndex(step => step.type === 'DEATH');

    expect(revealIdx).toBeGreaterThan(hpIdx);
    expect(deathIdx).toBe(-1);
    expect(queue[revealIdx]).toMatchObject({
      targetPid: 1,
      playerName: '贝拉',
      success: true,
      cards: revealed,
      msgs: [vriLog],
    });
  });

  it('死亡全屏公告只绑定倒下日志，不带入同一效果的其他日志', () => {
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '卡洛斯', hp: 6 }),
        makePlayer({ name: '黛安娜', hp: 2, role: '邪祀者' }),
      ],
      log: ['旧日志'],
    });
    const newGs = makeGs({
      players: [
        makePlayer({ name: '卡洛斯', hp: 9 }),
        makePlayer({ name: '黛安娜', hp: 0, role: '邪祀者', isDead: true }),
      ],
      log: [
        '旧日志',
        '卡洛斯 摸到 [D3] 偷吃龙蛋，选择收入手牌并触发效果',
        '卡洛斯 回复了 3 HP，相邻角色各失去 2 HP',
        '☠ 黛安娜（邪祀者）倒下了！',
      ],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const death = queue.find(step => step.type === 'DEATH');
    const guillotine = queue.find(step => step.type === 'GUILLOTINE');

    expect(death?.msgs).toEqual(['☠ 黛安娜（邪祀者）倒下了！']);
    expect(guillotine?.msgs).toEqual(['☠ 黛安娜（邪祀者）倒下了！']);
  });

  it('非追捕死亡在断头台与死亡置灰之间显式弃置手牌和邪神牌', () => {
    const handCard = { id: 'dead-hand', key: 'A1', name: '坠落' };
    const godCard = { id: 'dead-god', key: 'GOD', name: '邪神牌', isGod: true };
    const oldGs = makeGs({
      players: [makePlayer({
        name: '黛安娜', hp: 2, role: '邪祀者', hand: [handCard],
        godName: 'CTH', godLevel: 1, godZone: [godCard],
      })],
      discard: [],
      log: ['旧日志'],
    });
    const newGs = makeGs({
      players: [makePlayer({
        name: '黛安娜', hp: 0, role: '邪祀者', isDead: true,
        _pendingAnimDeath: true, hand: [], godName: null, godLevel: 0, godZone: [],
      })],
      discard: [handCard, godCard],
      log: ['旧日志', '☠ 黛安娜（邪祀者）倒下了！'],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const guillotineIdx = queue.findIndex(step => step.type === 'GUILLOTINE');
    const discardIdx = queue.findIndex(step => step.type === 'DISCARD' && step.deathSettlementStep);
    const deathIdx = queue.findIndex(step => step.type === 'DEATH');

    expect(guillotineIdx).toBeGreaterThanOrEqual(0);
    expect(discardIdx).toBeGreaterThan(guillotineIdx);
    expect(deathIdx).toBeGreaterThan(discardIdx);
    expect(queue[discardIdx]).toMatchObject({
      targetPid: 0,
      cards: [handCard, godCard],
      count: 2,
    });
    expect(queue[discardIdx].visualSetupPatch.players[0]).toMatchObject({
      _pendingAnimDeath: true,
      hand: [handCard],
      godName: 'CTH',
      godZone: [godCard],
    });
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

  it('霉变食物骰子动画使用独立模式与规避标记', () => {
    const oldGs = makeGs({
      players: [makePlayer({ name: '你', hp: 10 })],
      log: ['旧日志'],
      _moldyFoodDiceSeq: 1,
    });
    const newGs = makeGs({
      players: [makePlayer({ name: '你', hp: 10 })],
      log: ['旧日志', '你 掷出 5 点，成功规避负面效果！', '【霉变食物】你 掷出 1 点（单数），负面效果已规避'],
      _moldyFoodDiceSeq: 2,
      _moldyFoodDiceRoll: { d1: 1, isEven: false, actorIdx: 0, seq: 2, negativeAvoided: true },
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const dice = queue.find(step => step.type === 'DICE_ROLL' && step.diceMode === 'moldyFood');

    expect(dice).toMatchObject({ d1: 1, d2: 0, diceMode: 'moldyFood', negativeAvoided: true, rollerName: '你' });
    expect(dice).not.toHaveProperty('dodgeSuccess');
  });

  it('跨回合残留的霉变食物结果没有新日志时不会重播骰子', () => {
    const oldGs = makeGs({
      players: [makePlayer({ name: '你' }), makePlayer({ name: '贝拉' }), makePlayer({ name: '卡洛斯' })],
      log: ['黛安娜 的SAN检定结果为"乏力"'],
    });
    const newGs = makeGs({
      players: oldGs.players,
      currentTurn: 2,
      log: [...oldGs.log, '── 卡洛斯 的回合开始 ──', '卡洛斯 摸到 [C3] 龙之心，选择收入手牌并触发效果'],
      _moldyFoodDiceSeq: 4,
      _moldyFoodDiceRoll: { d1: 1, isEven: false, actorIdx: 2, seq: 4 },
    });

    const queue = buildAnimQueue(oldGs, newGs);

    expect(queue.some(step => step.type === 'DICE_ROLL' && step.diceMode === 'moldyFood')).toBe(false);
  });

  it('钻地魔虫会先播放触发动画，再播放全场扣血、转盘和随机扣血', () => {
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
      _visualEvents: [
        createCardEffectEvent({
          effectKey: 'burrowingWorm',
          card: { id: 'worm', name: '钻地魔虫', key: 'D1', type: 'allDamageHPRandomExtra' },
          actorIdx: 0,
          beforePlayers: playersBefore,
          beforeDiscard: [],
          afterPlayers: playersAfter,
          afterDiscard: [],
          msgs: ['全体存活角色失去 2 HP'],
        }),
      ],
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
    const wormIdx = queue.findIndex(step => step.type === 'BURROWING_WORM');
    const firstHpIdx = queue.findIndex(step => step.type === 'HP_DAMAGE');
    const randomIdx = queue.findIndex(step => step.type === 'RANDOM_TARGET');
    const secondHpIdx = queue.findIndex((step, idx) => step.type === 'HP_DAMAGE' && idx > randomIdx);

    expect(wormIdx).toBeGreaterThanOrEqual(0);
    expect(firstHpIdx).toBeGreaterThanOrEqual(0);
    expect(firstHpIdx).toBeGreaterThan(wormIdx);
    expect(randomIdx).toBeGreaterThan(firstHpIdx);
    expect(secondHpIdx).toBeGreaterThan(randomIdx);
    expect(queue[wormIdx]).toMatchObject({ actorIdx: 0, durationMs: 2750 });
    expect(queue[firstHpIdx].hitIndices).toEqual([0, 1, 2]);
    expect(queue[secondHpIdx].hitIndices).toEqual([1]);
    expect(queue[firstHpIdx].visualSetupTiming).toBe('queueStart');
    expect(queue[firstHpIdx].visualTimeline[0].patch.players.map(p => p.hp)).toEqual([10, 10, 10]);
    expect(queue[firstHpIdx].visualTimeline[1].patch.players.map(p => p.hp)).toEqual([8, 8, 8]);
    expect(queue[randomIdx].visualSetupPatch.players.map(p => p.hp)).toEqual([8, 8, 8]);
    expect(queue[randomIdx].visualTimeline[0].patch.players.map(p => p.hp)).toEqual([8, 8, 8]);
    expect(queue[secondHpIdx].visualSetupPatch.players.map(p => p.hp)).toEqual([8, 8, 8]);
    expect(queue[secondHpIdx].visualTimeline.at(-1).patch.players.map(p => p.hp)).toEqual([8, 6, 8]);
  });

  it('显式改信结算中 SAN 动画保持无信仰，之后才高亮新邪神', () => {
    const oldGod = makeGodCard('NYA');
    const newGod = makeGodCard('VRI');
    const bystander = makePlayer({ name: '你' });
    const beforeFaithExit = makePlayer({ name: '贝拉', san: 7, godEncounters: 2, godName: 'NYA', godLevel: 1, godZone: [oldGod] });
    const afterFaithExit = { ...beforeFaithExit, godName: null, godLevel: 0, godZone: [] };
    const afterSanResolution = { ...afterFaithExit, san: 6 };
    const afterFaithEstablished = { ...afterSanResolution, godName: 'VRI', godLevel: 1, godZone: [newGod] };
    const playersBefore = [bystander, beforeFaithExit];
    const playersAfterExit = [bystander, afterFaithExit];
    const playersAfterSan = [bystander, afterSanResolution];
    const playersAfter = [bystander, afterFaithEstablished];
    const statusEvent = createGodStatusChangedEvent({
      playerIdx: 1,
      playerName: '贝拉',
      godKey: 'VRI',
      godLevel: 1,
      msgs: ['贝拉 信仰了 弗栗多，获得不灭之躯(Lv.1)'],
      playersBefore: playersAfterSan,
      playersAfter,
      faithSettlement: {
        previousFaithExit: {
          playerIdx: 1,
          cards: [oldGod],
          msgs: ['贝拉 被迫改信新神，失去 1 SAN'],
          playersBefore,
          playersAfter: playersAfterExit,
          discardBefore: [],
          discardAfter: [oldGod],
          statEventSeqBefore: 0,
          statEventSeqAfter: 1,
          inspectionSeqBefore: 0,
          inspectionSeqAfter: 0,
          playersAfterResolution: playersAfterSan,
          discardAfterResolution: [oldGod],
          effect: 'godConvertDiscard',
        },
        abandonedFollowers: [],
      },
    });
    const oldGs = makeGs({ players: playersBefore, log: [], _statEventSeq: 0 });
    const newGs = makeGs({
      players: playersAfter,
      discard: [oldGod],
      log: ['贝拉 被迫改信新神，失去 1 SAN', '贝拉 信仰了 弗栗多，获得不灭之躯(Lv.1)'],
      _statEventSeq: 1,
      _statEvents: [
        { type: 'SAN_LOSS', target: 1, from: { hp: 10, san: 7, isDead: false }, to: { hp: 10, san: 6, isDead: false }, seq: 1, reason: '改信新神' },
      ],
      _visualEvents: [statusEvent],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const exitIdx = queue.findIndex(step => step?.effect === 'godConvertDiscard');
    const sanIdx = queue.findIndex(step => step?.type === 'SAN_DAMAGE');
    const highlightIdx = queue.findIndex(step => step?.type === 'GOD_HIGHLIGHT');

    expect([exitIdx, sanIdx, highlightIdx].every(index => index >= 0)).toBe(true);
    expect(exitIdx).toBeLessThan(sanIdx);
    expect(sanIdx).toBeLessThan(highlightIdx);
    expect(queue[sanIdx].visualSetupPatch.players[1]).toMatchObject({
      san: 7,
      godName: null,
      godLevel: 0,
      godZone: [],
    });
    expect(queue[sanIdx].visualTimeline.at(-1).patch.players[1]).toMatchObject({
      san: 6,
      godName: null,
      godLevel: 0,
      godZone: [],
    });
    expect(queue[highlightIdx].visualSetupPatch.players[1]).toMatchObject({
      san: 6,
      godName: null,
      godLevel: 0,
    });
    expect(queue[highlightIdx].visualTimeline.at(-1).patch.players[1]).toMatchObject({
      san: 6,
      godName: 'VRI',
      godLevel: 1,
    });
  });

  it('中途 HP/SAN 结算不提前改变手牌图像（手牌只在动画落地后变化）', () => {
    const keep = { id: 'keep', key: 'A1', name: '保留' };
    const sent = { id: 'sent', key: 'B1', name: '送出' };
    const playersBefore = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '贝拉', san: 7, hand: [keep, sent] }),
    ];
    const playersAfter = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '贝拉', san: 6, hand: [keep] }), // 送出 sent 的同时失去 1 SAN
    ];
    const oldGs = makeGs({ players: playersBefore, log: [], _statEventSeq: 0 });
    const newGs = makeGs({
      players: playersAfter,
      log: ['贝拉 失去 1 SAN'],
      _statEventSeq: 1,
      _statEvents: [
        { type: 'SAN_LOSS', target: 1, from: { hp: 10, san: 7, isDead: false }, to: { hp: 10, san: 6, isDead: false }, seq: 1 },
      ],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const sanStep = queue.find(step => step.type === 'SAN_DAMAGE');
    expect(sanStep).toBeTruthy();
    // SAN 仍按原时序结算
    expect(sanStep.visualTimeline[0].patch.players[1].san).toBe(7);
    expect(sanStep.visualTimeline.at(-1).patch.players[1].san).toBe(6);
    // 但所有中途视觉补丁里手牌都保持"出手前"的两张，不提前变成最终的一张
    sanStep.visualTimeline.forEach(frame => {
      expect(frame.patch.players[1].hand.map(c => c.id)).toEqual(['keep', 'sent']);
    });
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

  it('手牌减少推断为弃牌时标记为推断动画', () => {
    const card = { id: 'c1', name: '普通区域牌', type: 'normal' };
    const oldGs = makeGs({
      players: [makePlayer({ hand: [card] })],
      log: [],
    });
    const effectivePlayers = [makePlayer({ hand: [] })];

    const transfer = buildHandDeltaInferenceQueue({ oldGs, effectivePlayers, newMsgs: [] })[0];

    expect(transfer).toMatchObject({
      type: 'CARD_TRANSFER',
      fromPid: 0,
      dest: 'discard',
      count: 1,
      inferredHandLoss: true,
    });
  });

  it('撒托古亚黏液手牌减少推断为泡泡破裂而不是弃牌', () => {
    const slime = { id: 'slime-1', name: '撒托古亚的赐福黏液', isTsathogguaSlime: true };
    const oldGs = makeGs({
      players: [makePlayer({ hand: [slime] })],
      log: [],
    });
    const effectivePlayers = [makePlayer({ hand: [] })];

    const queue = buildHandDeltaInferenceQueue({
      oldGs,
      effectivePlayers,
      newMsgs: ['【无定形体】你 的1张撒托古亚的赐福黏液消失'],
    });

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      type: 'TSG_SLIME_POP',
      targetPid: 0,
      count: 1,
      cards: [slime],
    });
    expect(queue.some(step => step.type === 'CARD_TRANSFER')).toBe(false);
  });

  it('手牌减少且其他角色手牌增加时推断为玩家间飞牌', () => {
    const card = { id: 'c1', name: '被交出的牌', type: 'normal' };
    const oldGs = makeGs({
      players: [makePlayer({ hand: [card] }), makePlayer({ hand: [] })],
      log: [],
    });
    const effectivePlayers = [
      makePlayer({ hand: [] }),
      makePlayer({ hand: [card] }),
    ];

    const transfer = buildHandDeltaInferenceQueue({ oldGs, effectivePlayers, newMsgs: [] })[0];

    expect(transfer).toMatchObject({
      type: 'CARD_TRANSFER',
      fromPid: 0,
      dest: 'player',
      toPid: 1,
      count: 1,
    });
    expect(transfer).not.toHaveProperty('inferredHandLoss');
  });

  it('蛊惑赠牌已有显式飞牌时不再用手牌差异补第二个普通飞牌', () => {
    const gift = { id: 'gift-1', name: '蛊惑礼物', type: 'normal' };
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你', hand: [gift] }),
        makePlayer({ name: '艾伦', hand: [] }),
      ],
      log: [],
    });
    const effectivePlayers = [
      makePlayer({ name: '你', hand: [] }),
      makePlayer({ name: '艾伦', hand: [gift] }),
    ];

    expect(buildHandDeltaInferenceQueue({
      oldGs,
      effectivePlayers,
      newMsgs: ['你（邪祀者）对 艾伦 【蛊惑】，赠予 [A1] 蛊惑礼物'],
    })).toEqual([]);
  });

  it('蛊惑森之领主触发黑山羊幼仔时只保留黑暗子嗣专属飞牌', () => {
    const god = makeGodCard('SHU');
    const goat = { id: 'goat-1', name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true };
    const oldGs = makeGs({
      currentTurn: 0,
      players: [
        makePlayer({ name: '你', hand: [god] }),
        makePlayer({ name: '艾伦', hand: [] }),
      ],
      log: [],
    });
    const effectivePlayers = [
      makePlayer({ name: '你', hand: [] }),
      makePlayer({ name: '艾伦', hand: [goat] }),
    ];

    const queue = buildHandDeltaInferenceQueue({
      oldGs,
      effectivePlayers,
      newMsgs: [
        '你（邪祀者）对 艾伦 【蛊惑】，赠予 森之领主',
        '艾伦 信仰了 森之领主，获得黑暗子嗣(Lv.1)',
        '【黑暗子嗣】艾伦 获得1张黑山羊幼仔',
      ],
    });

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      type: 'CARD_TRANSFER',
      dest: 'player',
      toPid: 1,
      effect: 'blackGoat',
      sourceAnchor: 'godPower',
    });
  });

  it('被蛊惑者信仰森之领主后，黑山羊幼仔从信仰者飞向目标', () => {
    const god = makeGodCard('SHU');
    const goat = { id: 'goat-1', name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true };
    const oldGs = makeGs({
      currentTurn: 0,
      players: [
        makePlayer({ name: '你', hand: [god] }),
        makePlayer({ name: '黛安娜', hand: [] }),
      ],
      log: [],
    });
    const effectivePlayers = [
      makePlayer({ name: '你', hand: [goat] }),
      makePlayer({
        name: '黛安娜',
        hand: [],
        godName: 'SHU',
        godLevel: 1,
        hasBelievedGod: true,
        godZone: [god],
      }),
    ];

    const queue = buildHandDeltaInferenceQueue({
      oldGs,
      effectivePlayers,
      newMsgs: [
        '你（邪祀者）对 黛安娜 【蛊惑】，赠予 森之领主',
        '黛安娜 信仰了 森之领主，获得黑暗子嗣(Lv.1)',
        '【黑暗子嗣】你 获得1张黑山羊幼仔',
      ],
    });

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      type: 'CARD_TRANSFER',
      fromPid: 1,
      toPid: 0,
      dest: 'player',
      effect: 'blackGoat',
      sourceAnchor: 'godPower',
    });
  });

  it('手牌减少但 godZone 增加时不补通用飞牌动画', () => {
    const godCard = makeGodCard('NYA');
    const oldGs = makeGs({
      players: [makePlayer({ hand: [godCard], godZone: [] })],
      log: [],
    });
    const effectivePlayers = [makePlayer({ hand: [], godZone: [godCard] })];

    expect(buildHandDeltaInferenceQueue({ oldGs, effectivePlayers, newMsgs: [] })).toEqual([]);
  });

  it('黑暗子嗣发放黑山羊幼仔从邪神之力标记飞向手牌', () => {
    const goat = { id: 'goat-1', name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true };
    const oldGs = makeGs({
      currentTurn: 1,
      players: [makePlayer({ name: '你' }), makePlayer({ name: '卡洛斯', hand: [] })],
      log: [],
    });
    const newGs = makeGs({
      currentTurn: 1,
      players: [makePlayer({ name: '你' }), makePlayer({ name: '卡洛斯', hand: [goat] })],
      log: ['【黑暗子嗣】卡洛斯 获得1张黑山羊幼仔'],
    });

    const transfer = buildAnimQueue(oldGs, newGs).find(step => step.type === 'CARD_TRANSFER');

    expect(transfer).toMatchObject({
      fromPid: 1,
      toPid: 1,
      count: 1,
      effect: 'blackGoat',
      sourceAnchor: 'godPower',
    });
  });

  it('黑暗子嗣日志没有对应手牌增量时不重复播放发放动画', () => {
    const goat = { id: 'goat-1', name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true };
    const oldGs = makeGs({
      currentTurn: 0,
      players: [makePlayer({ name: '贝拉' }), makePlayer({ name: '卡洛斯', hand: [goat] })],
      log: [],
    });
    const newGs = makeGs({
      currentTurn: 1,
      players: [makePlayer({ name: '贝拉' }), makePlayer({ name: '卡洛斯', hand: [goat] })],
      log: ['【黑暗子嗣】卡洛斯 获得1张黑山羊幼仔'],
    });

    expect(buildAnimQueue(oldGs, newGs).some(step => step.type === 'CARD_TRANSFER' && step.effect === 'blackGoat')).toBe(false);
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

    const queue = buildAnimQueue(oldGs, newGs);
    const volcanoIdx = queue.findIndex(item => item.type === 'VOLCANO');
    const hpDamageIdx = queue.findIndex(item => item.type === 'HP_DAMAGE');
    const step = queue[volcanoIdx];

    expect(step).toMatchObject({
      type: 'VOLCANO',
      actorIdx: 0,
      beforePlayers,
      visualSetupTiming: 'queueStart',
      visualSetupPatch: { players: beforePlayers, discard: [] },
    });
    expect(step.visualTimeline[0]).toEqual({ atMs: 0, patch: { players: beforePlayers, discard: [] } });
    expect(step.visualTimeline[1]).toEqual({ atMs: 2400, patch: { players: afterPlayers, discard: [] } });
    expect(hpDamageIdx).toBeGreaterThan(volcanoIdx);
  });

  it('地下泉 visualEvent 会先播放水滴涟漪动画再回复 HP', () => {
    const beforePlayers = [makePlayer({ name: '你', hp: 6 })];
    const afterPlayers = [makePlayer({ name: '你', hp: 8 })];
    const oldGs = makeGs({
      players: beforePlayers,
      discard: [],
      log: ['旧日志'],
    });
    const event = createCardEffectEvent({
      effectKey: 'undergroundSpring',
      card: { id: 'spring', name: '地下泉', key: 'C2', type: 'allHealHP' },
      actorIdx: 0,
      beforePlayers,
      beforeDiscard: [],
      afterPlayers,
      afterDiscard: [],
      msgs: ['全体存活角色回复 2 HP'],
    });
    const newGs = makeGs({
      players: afterPlayers,
      discard: [],
      log: ['旧日志', '全体存活角色回复 2 HP'],
      _visualEvents: [event],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const springIdx = queue.findIndex(item => item.type === 'UNDERGROUND_SPRING');
    const hpHealIdx = queue.findIndex(item => item.type === 'HP_HEAL');
    const step = queue[springIdx];

    expect(step).toMatchObject({
      type: 'UNDERGROUND_SPRING',
      actorIdx: 0,
      beforePlayers,
      visualSetupTiming: 'queueStart',
      visualSetupPatch: { players: beforePlayers, discard: [] },
    });
    expect(step.visualTimeline[1]).toEqual({ atMs: 300, patch: { players: afterPlayers, discard: [] } });
    expect(hpHealIdx).toBeGreaterThan(springIdx);
  });

  it('惊扰蝙蝠 visualEvent 会先播放蝙蝠动画再扣 HP', () => {
    const beforePlayers = [
      makePlayer({ name: '你', hp: 10 }),
      makePlayer({ name: '艾伦', hp: 10 }),
    ];
    const afterPlayers = [
      makePlayer({ name: '你', hp: 8 }),
      makePlayer({ name: '艾伦', hp: 8 }),
    ];
    const oldGs = makeGs({
      players: beforePlayers,
      discard: [],
      log: ['旧日志'],
    });
    const event = createCardEffectEvent({
      effectKey: 'startledBats',
      card: { id: 'bats', name: '惊扰蝙蝠', key: 'C2', type: 'adjDamageHP' },
      actorIdx: 0,
      beforePlayers,
      beforeDiscard: [],
      afterPlayers,
      afterDiscard: [],
      msgs: ['你 与相邻角色各失去 2 HP'],
    });
    const newGs = makeGs({
      players: afterPlayers,
      discard: [],
      log: ['旧日志', '你 与相邻角色各失去 2 HP'],
      _visualEvents: [event],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const batsIdx = queue.findIndex(item => item.type === 'STARTLED_BATS');
    const hpDamageIdx = queue.findIndex(item => item.type === 'HP_DAMAGE');
    const step = queue[batsIdx];

    expect(step).toMatchObject({
      type: 'STARTLED_BATS',
      actorIdx: 0,
      beforePlayers,
      visualSetupTiming: 'queueStart',
      visualSetupPatch: { players: beforePlayers, discard: [] },
    });
    expect(step.visualTimeline[1]).toEqual({ atMs: 1320, patch: { players: afterPlayers, discard: [] } });
    expect(hpDamageIdx).toBeGreaterThan(batsIdx);
  });

  it('夜风呼啸 visualEvent 会先播放沙尘动画再扣 HP/SAN', () => {
    const beforePlayers = [
      makePlayer({ name: '你', hp: 10, san: 10 }),
      makePlayer({ name: '艾伦', hp: 9, san: 8 }),
    ];
    const afterPlayers = [
      makePlayer({ name: '你', hp: 9, san: 9 }),
      makePlayer({ name: '艾伦', hp: 8, san: 7 }),
    ];
    const oldGs = makeGs({
      players: beforePlayers,
      discard: [],
      log: ['旧日志'],
    });
    const event = createCardEffectEvent({
      effectKey: 'nightWind',
      card: { id: 'night-wind', name: '夜风呼啸', key: 'C4', type: 'allDamageBoth' },
      actorIdx: 0,
      beforePlayers,
      beforeDiscard: [],
      afterPlayers,
      afterDiscard: [],
      msgs: ['全体存活角色失去 1 HP 和 SAN'],
    });
    const newGs = makeGs({
      players: afterPlayers,
      discard: [],
      log: ['旧日志', '全体存活角色失去 1 HP 和 SAN'],
      _visualEvents: [event],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const windIdx = queue.findIndex(item => item.type === 'NIGHT_WIND');
    const hpDamageIdx = queue.findIndex(item => item.type === 'HP_DAMAGE');
    const sanDamageIdx = queue.findIndex(item => item.type === 'SAN_DAMAGE');
    const step = queue[windIdx];

    expect(step).toMatchObject({
      type: 'NIGHT_WIND',
      actorIdx: 0,
      beforePlayers,
      visualSetupTiming: 'queueStart',
      visualSetupPatch: { players: beforePlayers, discard: [] },
    });
    expect(step.visualTimeline[1]).toEqual({ atMs: 1250, patch: { players: afterPlayers, discard: [] } });
    expect(hpDamageIdx).toBeGreaterThan(windIdx);
    expect(sanDamageIdx).toBeGreaterThan(windIdx);
  });

  it('半物质化 visualEvent 会先播放面板切片动画再显示虚化层数', () => {
    const beforePlayers = [
      makePlayer({ name: '你', etherealizeStacks: 0 }),
      makePlayer({ name: '艾伦' }),
    ];
    const afterPlayers = [
      makePlayer({ name: '你', etherealizeStacks: 4 }),
      makePlayer({ name: '艾伦' }),
    ];
    const oldGs = makeGs({
      players: beforePlayers,
      discard: [],
      log: ['旧日志'],
    });
    const event = createCardEffectEvent({
      effectKey: 'etherealizeGain',
      card: { id: 'etherealize', name: '半物质化', key: 'C4', type: 'etherealize' },
      actorIdx: 0,
      beforePlayers,
      beforeDiscard: [],
      afterPlayers,
      afterDiscard: [],
      msgs: ['【半物质化】你 进入半物质化状态，获得 4 层虚化'],
      payload: { stackCount: 4 },
    });
    const newGs = makeGs({
      players: afterPlayers,
      discard: [],
      log: ['旧日志', '【半物质化】你 进入半物质化状态，获得 4 层虚化'],
      _visualEvents: [event],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const step = queue.find(item => item.type === 'ETHEREALIZE_GAIN');

    expect(step).toMatchObject({
      type: 'ETHEREALIZE_GAIN',
      actorIdx: 0,
      stackCount: 4,
      durationMs: 3800,
      visualSetupTiming: 'queueStart',
      visualSetupPatch: { players: beforePlayers, discard: [] },
    });
    expect(step.visualTimeline[1]).toEqual({ atMs: 3600, patch: { players: afterPlayers, discard: [] } });
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

  it('火把免疫邪神之力视觉事件会生成角色面板护罩动画', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const msg = '【引燃火把】艾伦 本回合不受邪神之力影响';
    const oldGs = makeGs({ players, log: [] });
    const event = createGodPowerBlockedEvent({ playerIdx: 1, playerName: '艾伦', msgs: [msg] });
    const newGs = makeGs({
      players,
      log: [msg],
      _visualEvents: [event],
    });

    const queue = buildAnimQueue(oldGs, newGs);
    const blockedSteps = queue.filter(step => step.type === 'GOD_POWER_BLOCKED');

    expect(blockedSteps).toEqual([
      expect.objectContaining({
        type: 'GOD_POWER_BLOCKED',
        targetPid: 1,
        msgs: [msg],
        visualEventId: event.id,
      }),
    ]);
  });
});

describe('buildAiHuntEventAnimQueue', () => {
  it('AI 从手牌信仰后连续追捕时保留追捕前的邪神高亮步骤', () => {
    const worshipMsg = '黛安娜 从手牌信仰 弗栗多，获得不灭之躯(Lv.1)（骷髅头不计）';
    const firstNightMsg = '【黑夜】黛安娜 选择【追捕】目标掷出 1，目标由 你 错乱为 贝拉，失去 1 SAN';
    const firstHuntMsg = '黛安娜（追猎者）对 贝拉 【追捕】，亮出 [D4]';
    const damageMsg = '弃 [D4] 钻地魔虫 → 贝拉 受 3HP 伤害！';
    const actionMsgs = [worshipMsg, firstNightMsg, firstHuntMsg, damageMsg];
    const godHighlight = { type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'VRI', msgs: [worshipMsg] };
    // In production the inferred damage step receives the complete action log.
    // The worship line must not make this hunt result look like a pre-hunt step.
    const duplicatedHuntDamage = { type: 'HP_DAMAGE', hitIndices: [2], msgs: actionMsgs };
    const huntDamage = { type: 'HP_DAMAGE', hitIndices: [2], msgs: [damageMsg] };

    expect(getAiPreHuntActionSteps(
      [godHighlight, duplicatedHuntDamage],
      actionMsgs,
      [huntDamage],
    )).toEqual([godHighlight]);
  });

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

  it('AI 连续追捕事件会在每次追捕特效前播放对应的黑夜骰子', () => {
    const firstReveal = { id: 'rev-a', key: 'A1', name: '坠落' };
    const secondReveal = { id: 'rev-b', key: 'B1', name: '圣甲虫' };
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯' }),
      makePlayer({ name: '艾伦', hand: [firstReveal] }),
      makePlayer({ name: '贝拉', hand: [secondReveal] }),
    ];

    const firstQueue = buildAiHuntEventAnimQueue({
      hunterIdx: 1,
      targetIdx: 2,
      revealedCard: firstReveal,
      beforePlayers: players,
      msgs: ['卡洛斯（追猎者）对 艾伦 【追捕】，亮出 [A1]'],
      apophisTargetEvent: {
        seq: 3,
        actorIdx: 1,
        actorName: '卡洛斯',
        selectedIdx: 2,
        targetIdx: 2,
        roll: 5,
        changed: false,
        label: '选择【追捕】目标',
        log: '【黑夜】卡洛斯 选择【追捕】目标掷出 5，目标未偏移',
      },
    }, '卡洛斯');
    const secondQueue = buildAiHuntEventAnimQueue({
      hunterIdx: 1,
      targetIdx: 3,
      revealedCard: secondReveal,
      beforePlayers: players,
      msgs: ['卡洛斯（追猎者）对 贝拉 【追捕】，亮出 [B1]'],
      apophisTargetEvent: {
        seq: 4,
        actorIdx: 1,
        actorName: '卡洛斯',
        selectedIdx: 3,
        targetIdx: 3,
        roll: 4,
        changed: false,
        label: '选择【追捕】目标',
        log: '【黑夜】卡洛斯 选择【追捕】目标掷出 4，目标未偏移',
      },
    }, '卡洛斯');
    const queue = [...firstQueue, ...secondQueue];

    expect(queue.map(step => step.type).slice(0, 6)).toEqual([
      'DICE_ROLL',
      'SKILL_HUNT',
      'HUNT_REVEAL_CARD',
      'DICE_ROLL',
      'SKILL_HUNT',
      'HUNT_REVEAL_CARD',
    ]);
    expect(queue[0]).toMatchObject({ diceMode: 'apophisNight', _apophisTargetSeq: 3 });
    expect(queue[3]).toMatchObject({ diceMode: 'apophisNight', _apophisTargetSeq: 4 });
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

  it('追捕击杀无信仰角色时按伤害、断头台、死亡、夺牌、一次弃牌、置灰结算', () => {
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
      makePlayer({ name: '艾伦', hp: 0, isDead: true, _pendingAnimDeath: true, hand: [stolenA, stolenB, leftover] }),
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
    const damageIdx = types.indexOf('HP_DAMAGE');
    const guillotineIdx = types.indexOf('GUILLOTINE');
    const deathIdx = types.indexOf('DEATH');
    const lootIdx = types.findIndex((type, idx) => type === 'CARD_TRANSFER' && idx > deathIdx);
    const leftoverDiscardIdx = types.findIndex((type, idx) => type === 'DISCARD' && idx > lootIdx && queue[idx].card?.id === leftover.id);
    const finalPatchIdx = types.length - 1;

    const hunterDiscardSteps = queue.filter(step =>
      step.type === 'DISCARD' && step.card?.id === hunterDiscard.id
    );
    const prematureTargetDiscardSteps = queue.slice(0, lootIdx).filter(step =>
      step.fromPid === 2 && step.dest === 'discard'
    );
    expect(hunterDiscardSteps).toHaveLength(1);
    expect(hunterDiscardSteps[0]).toMatchObject({ targetPid: 1 });
    expect(prematureTargetDiscardSteps).toHaveLength(0);

    expect(guillotineIdx).toBeGreaterThan(-1);
    expect(guillotineIdx).toBeGreaterThan(damageIdx);
    expect(deathIdx).toBe(guillotineIdx + 1);
    expect(queue[deathIdx]).toMatchObject({ deferDeathCommit: true });
    expect(lootIdx).toBeGreaterThan(deathIdx);
    expect(leftoverDiscardIdx).toBeGreaterThan(lootIdx);
    expect(queue[leftoverDiscardIdx]).toMatchObject({
      targetPid: 2,
      count: 1,
      cards: [leftover],
    });
    expect(queue.filter(step => step.type === 'DISCARD' && step.targetPid === 2)).toHaveLength(1);
    expect(types[finalPatchIdx]).toBe('STATE_PATCH');
  });

  it('追捕击杀信仰角色时在夺牌后连续弃置剩余手牌与邪神牌', () => {
    const hunterDiscard = { id: 'hunter-d1', key: 'D1', name: '钻地魔虫' };
    const stolen = { id: 'stolen', key: 'A1', name: '坠落' };
    const leftover = { id: 'leftover', key: 'C1', name: '亡者军团' };
    const defeatedGod = { id: 'defeated-god', key: 'GOD', name: '邪神牌', isGod: true };
    const beforePlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯', hp: 9, hand: [hunterDiscard] }),
      makePlayer({ name: '艾伦', hp: 3, hand: [stolen, leftover], godName: 'CTH', godLevel: 1, godZone: [defeatedGod] }),
    ];
    const afterDiscardPlayers = copyPlayers(beforePlayers);
    afterDiscardPlayers[1].hand = [];
    const afterDamagePlayers = copyPlayers(afterDiscardPlayers);
    afterDamagePlayers[2] = { ...afterDamagePlayers[2], hp: 0, isDead: true, _pendingAnimDeath: true, godName: null, godLevel: 0, godZone: [] };
    const afterPlayers = copyPlayers(afterDamagePlayers);
    afterPlayers[1].hand = [stolen];
    afterPlayers[2] = { ...afterPlayers[2], hand: [], _pendingAnimDeath: false };

    const queue = buildAiHuntEventAnimQueue({
      hunterIdx: 1,
      targetIdx: 2,
      discardedCard: hunterDiscard,
      beforePlayers,
      afterDiscardPlayers,
      afterDiscardDiscard: [hunterDiscard],
      afterDamagePlayers,
      afterDamageDiscard: [hunterDiscard, defeatedGod],
      afterDamageLog: ['旧日志', '☠ 艾伦（邪祀者）倒下了！'],
      afterPlayers,
      afterResultDiscard: [hunterDiscard, leftover, defeatedGod],
      beforeLog: ['旧日志'],
      afterLog: ['旧日志', '☠ 艾伦（邪祀者）倒下了！', '卡洛斯 从 艾伦 的手牌中暗抽了一张！'],
      msgs: ['追捕', '伤害', '☠ 艾伦（邪祀者）倒下了！', '卡洛斯 从 艾伦 的手牌中暗抽了一张！'],
      lootTransferCount: 1,
      lootDiscardCards: [leftover],
      defeatedGodCards: [defeatedGod],
    }, '卡洛斯');

    const deathIdx = queue.findIndex(step => step.type === 'DEATH');
    const lootIdx = queue.findIndex((step, index) => step.type === 'CARD_TRANSFER' && index > deathIdx);
    const targetDiscards = queue
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => step.type === 'DISCARD' && step.targetPid === 2);

    expect(targetDiscards).toHaveLength(2);
    expect(targetDiscards[0]).toMatchObject({ index: lootIdx + 1, step: { cards: [leftover] } });
    expect(targetDiscards[1]).toMatchObject({ index: targetDiscards[0].index + 1, step: { cards: [defeatedGod], sourceZone: 'god' } });
  });
});
