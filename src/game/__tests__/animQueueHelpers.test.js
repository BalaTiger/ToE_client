import { describe, expect, it } from 'vitest';
import {
  buildBewitchForcedCardQueue,
  buildFullHandSwapStepsFromLogs,
  buildInspectionAwareAnimQueue,
  buildInspectionEventFlow,
  buryToDeckStep,
  cardTransferStep,
  dedupeInferredDiscardTransfers,
  fullHandSwapSteps,
  mergePlayerStatsIntoSnapshot,
  resolveTurnHighlightForStep,
  swapCardsSteps,
  zhuHideCardStep,
} from '../animQueueHelpers';
import { copyPlayers } from '../coreUtils';
import { buildAnimQueue } from '../animQueueCore';
import { createCardEffectEvent } from '../visualEvents';
import { makeGodCard, makePlayer, makeZoneCard } from './factory';

describe('animQueueHelpers', () => {
  it('蛊惑中间快照保留牌区外观但使用结算后的 HP/SAN', () => {
    const oldGod = { id: 'old-god', godKey: 'VRI' };
    const newGod = { id: 'new-god', godKey: 'ZHU' };
    const visualSnapshot = [
      makePlayer({ name: '贝拉', hand: [{ id: 'gift' }], san: 9 }),
      makePlayer({ name: '艾伦', hand: [{ id: 'keep' }], san: 9, godName: 'VRI', godZone: [oldGod] }),
    ];
    const resolvedPlayers = [
      makePlayer({ name: '贝拉', hand: [], san: 8 }),
      makePlayer({ name: '艾伦', hand: [{ id: 'keep' }], san: 6, godName: 'ZHU', godZone: [newGod] }),
    ];

    const merged = mergePlayerStatsIntoSnapshot(visualSnapshot, resolvedPlayers);

    expect(merged.map(player => player.san)).toEqual([8, 6]);
    expect(merged[1].godName).toBe('VRI');
    expect(merged[1].godZone).toEqual([oldGod]);
    expect(visualSnapshot.map(player => player.san)).toEqual([9, 9]);
  });

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

  it('掉包单牌交换 helper 先播放目标牌飞向掉包者，再播放还牌飞回目标', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const takenCard = { id: 'taken' };
    const givenCard = { id: 'given' };

    expect(swapCardsSteps({
      sourceIdx: 1,
      targetIdx: 0,
      sourceCount: 1,
      targetCount: 1,
      takenCard,
      givenCard,
      msgs: ['艾伦（寻宝者）对 你 【掉包】'],
      playersBefore: players,
    })).toEqual([
      { type: 'VISUAL_LOCK', players, zhuLight: null },
      { type: 'CARD_TRANSFER', fromPid: 0, dest: 'player', toPid: 1, count: 1, cards: [takenCard] },
      { type: 'CARD_TRANSFER', fromPid: 1, dest: 'player', toPid: 0, count: 1, cards: [givenCard], msgs: ['艾伦（寻宝者）对 你 【掉包】'] },
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

  it('显式弃牌动画会覆盖同一来源的自动推断弃牌转移', () => {
    const queue = [
      { type: 'DISCARD', card: { id: 'a' }, targetPid: 1 },
      { type: 'CARD_TRANSFER', fromPid: 1, dest: 'discard', count: 1, inferredHandLoss: true },
      { type: 'HP_DAMAGE', hitIndices: [1] },
    ];

    expect(dedupeInferredDiscardTransfers(queue).map(step => step.type)).toEqual(['DISCARD', 'HP_DAMAGE']);
  });

  it('自动推断弃牌转移在没有显式动画时保留兜底能力', () => {
    const queue = [
      { type: 'CARD_TRANSFER', fromPid: 1, dest: 'discard', count: 1, inferredHandLoss: true },
    ];

    expect(dedupeInferredDiscardTransfers(queue)).toEqual(queue);
  });

  it('黏液爆裂动画会覆盖同一来源的自动推断弃牌转移', () => {
    const queue = [
      { type: 'TSG_SLIME_POP', targetPid: 2, count: 1 },
      { type: 'CARD_TRANSFER', fromPid: 2, dest: 'discard', count: 1, inferredHandLoss: true },
    ];

    expect(dedupeInferredDiscardTransfers(queue).map(step => step.type)).toEqual(['TSG_SLIME_POP']);
  });

  it('蛊惑强制赠牌动画先播放技能，再飞牌入目标手牌，最后播放结算状态', () => {
    const gift = makeZoneCard('A1', 0);
    const queue = buildBewitchForcedCardQueue(0, 2, gift, '目标角色', [
      { type: 'CARD_TRANSFER', fromPid: 2, dest: 'discard' },
      { type: 'YOUR_TURN', name: '目标角色' },
      { type: 'DRAW_CARD', card: { id: 'stale-draw', name: '残留摸牌' } },
      { type: 'DAMAGE', targetPid: 2 },
    ], ['邪祀者对目标角色【蛊惑】']);

    expect(queue.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'DRAW_CARD',
      'DAMAGE',
    ]);
    expect(queue[1]).toMatchObject({ fromPid: 0, toPid: 2, dest: 'player' });
    expect(queue[2]).toMatchObject({
      card: gift,
      triggerName: '目标角色',
      targetPid: 2,
      skipTravel: true,
      disableDrawBackgroundCamera: true,
    });
  });

  it('蛊惑赠牌后可先提交施法者手牌中间态，再继续目标结算', () => {
    const gift = makeZoneCard('A1', 0);
    const sourceAfterGift = makePlayer({ name: '贝拉', hand: [makeZoneCard('B1', 0)] });
    const queue = buildBewitchForcedCardQueue(1, 2, gift, '目标角色', [
      { type: 'TURN_BOUNDARY_PAUSE', msgs: ['目标结算'] },
    ], ['贝拉（邪祀者）对目标角色【蛊惑】'], {
      afterGiftPatch: { players: [makePlayer({ name: '你' }), sourceAfterGift, makePlayer({ name: '目标角色' })] },
    });

    expect(queue.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'STATE_PATCH',
      'DRAW_CARD',
      'TURN_BOUNDARY_PAUSE',
    ]);
    expect(queue[2]).toMatchObject({ players: expect.any(Array) });
    expect(queue[2].players[1].hand).toHaveLength(1);
  });

  it('蛊惑强制结算时保留带语义的连锁飞牌动画', () => {
    const gift = { id: 'shu-1', name: '森之领主', isGod: true };
    const queue = buildBewitchForcedCardQueue(0, 3, gift, '黛安娜', [
      { type: 'CARD_TRANSFER', fromPid: 3, dest: 'discard' },
      cardTransferStep({
        fromPid: 0,
        dest: 'player',
        toPid: 2,
        count: 1,
        sourceAnchor: 'godPower',
        effect: 'blackGoat',
        durationMs: 1500,
        msgs: ['【黑暗子嗣】卡洛斯 获得1张黑山羊幼仔'],
      }),
      cardTransferStep({
        fromPid: 1,
        dest: 'player',
        toPid: 0,
        count: 1,
        sourceAnchor: 'chainEffect',
        effect: 'futureChain',
        msgs: ['未来连锁飞牌'],
      }),
      { type: 'SAN_DAMAGE', hitIndices: [1] },
    ], ['你对 黛安娜 【蛊惑】，赠予 森之领主']);

    expect(queue.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'DRAW_CARD',
      'CARD_TRANSFER',
      'CARD_TRANSFER',
      'SAN_DAMAGE',
    ]);
    expect(queue[3]).toMatchObject({
      effect: 'blackGoat',
      sourceAnchor: 'godPower',
      toPid: 2,
      msgs: ['【黑暗子嗣】卡洛斯 获得1张黑山羊幼仔'],
    });
    expect(queue[4]).toMatchObject({
      effect: 'futureChain',
      sourceAnchor: 'chainEffect',
      msgs: ['未来连锁飞牌'],
    });
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
      'VISUAL_LOCK',
      'DRAW_CARD',
      'LOG_STEP',
      'DAMAGE',
      'STATE_PATCH',
    ]);
    expect(flow.queue[3]).toMatchObject({ triggerName: '检定牌', card, targetPid: 0 });
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

    expect(flow.queue.map(step => step.type)).toEqual(['VISUAL_LOCK', 'DRAW_CARD', 'SAN_HEAL', 'STATE_PATCH']);
    expect(flow.queue[2]).toMatchObject({ hitIndices: [0] });
    expect(flow.queue[2].statEvents).toMatchObject([{ type: 'SAN_GAIN', seq: 7 }]);
    expect(flow.statEventSeq).toBe(7);
  });

  it('全体 SAN 扣减后的多名检定牌翻牌排在 SAN 扣减动画之后', () => {
    const calmCard = { name: '暂时的平静', effect: 'calm' };
    const amnesiaCard = { name: '失忆', effect: 'amnesia' };
    const oldPlayers = [
      makePlayer({ name: '诺亚', hp: 9, san: 7 }),
      makePlayer({ name: '奥托', hp: 10, san: 7 }),
    ];
    const afterSanPlayers = copyPlayers(oldPlayers);
    afterSanPlayers[0].san = 6;
    afterSanPlayers[1].san = 6;
    const afterNoahInspectionPlayers = copyPlayers(afterSanPlayers);
    const finalPlayers = copyPlayers(afterNoahInspectionPlayers);
    finalPlayers[1].skillDisabledNextTurn = true;
    const newLog = [
      '你 收入了 [D3] 鼠群',
      '全体存活角色失去 1 SAN',
      '诺亚 的SAN检定结果为"暂时的平静"',
      '奥托 的SAN检定结果为"失忆"',
      '奥托 失忆，下一回合禁用技能',
    ];
    const result = buildInspectionAwareAnimQueue(
      {
        players: oldPlayers,
        log: [],
        _statEventSeq: 0,
        _inspectionSeq: 0,
      },
      {
        players: finalPlayers,
        log: newLog,
        _statEventSeq: 1,
        _statEvents: [{
          seq: 1,
          type: 'SAN_LOSS',
          target: 0,
          from: { hp: 9, san: 7, isDead: false },
          to: { hp: 9, san: 6, isDead: false },
          reason: '鼠群',
        }, {
          seq: 1,
          type: 'SAN_LOSS',
          target: 1,
          from: { hp: 10, san: 7, isDead: false },
          to: { hp: 10, san: 6, isDead: false },
          reason: '鼠群',
        }],
        _inspectionSeq: 2,
        _inspectionEvents: [{
          seq: 1,
          card: calmCard,
          target: 0,
          beforePlayers: afterSanPlayers,
          beforeLog: newLog.slice(0, 2),
          afterPlayers: afterNoahInspectionPlayers,
          afterLog: newLog.slice(0, 3),
          statEvents: [],
          statEventSeq: null,
        }, {
          seq: 2,
          card: amnesiaCard,
          target: 1,
          beforePlayers: afterNoahInspectionPlayers,
          beforeLog: newLog.slice(0, 3),
          afterPlayers: finalPlayers,
          afterLog: newLog,
          statEvents: [],
          statEventSeq: null,
        }],
      },
      { buildAnimQueue, copyPlayers },
    );

    const sanIdx = result.queue.findIndex(step => step.type === 'SAN_DAMAGE');
    const drawIdxs = result.queue
      .map((step, idx) => (step.type === 'DRAW_CARD' ? idx : -1))
      .filter(idx => idx >= 0);
    expect(sanIdx).toBeGreaterThanOrEqual(0);
    expect(drawIdxs).toHaveLength(2);
    expect(drawIdxs[0]).toBeGreaterThan(sanIdx);
    expect(result.queue[drawIdxs[0]]).toMatchObject({ card: calmCard, triggerName: '检定牌', targetPid: 0 });
    expect(result.queue[drawIdxs[1]]).toMatchObject({ card: amnesiaCard, triggerName: '检定牌', targetPid: 1 });
  });

  it('决策后续播剩余 SAN 检定时不会重播检定前的夜风呼啸', () => {
    const nightWind = { id: 'night-wind', name: '夜风呼啸', key: 'C4', type: 'allDamageBoth' };
    const inspectionCard = { id: 'amnesia', name: '失忆', effect: 'disableSkill' };
    const beforePlayers = [
      makePlayer({ name: '你', hp: 9, san: 6 }),
      makePlayer({ name: '艾伦', hp: 9, san: 6 }),
    ];
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[1].disableSkillNextTurn = true;
    const nightWindEvent = createCardEffectEvent({
      effectKey: 'nightWind',
      card: nightWind,
      actorIdx: 0,
      beforePlayers,
      afterPlayers: beforePlayers,
      msgs: ['全体存活角色失去 1 HP 和 SAN'],
    });
    const inspectionEvent = {
      seq: 2,
      card: inspectionCard,
      target: 1,
      beforePlayers,
      beforeLog: ['全体存活角色失去 1 HP 和 SAN'],
      afterPlayers,
      afterLog: [
        '全体存活角色失去 1 HP 和 SAN',
        '艾伦 的SAN检定结果为"失忆"',
        '艾伦 失忆，下一回合禁用技能',
      ],
      statEvents: [],
      statEventSeq: null,
    };
    const baseState = {
      players: beforePlayers,
      log: inspectionEvent.beforeLog,
      _inspectionSeq: 1,
      _visualEvents: [nightWindEvent],
    };
    const resolvedState = {
      ...baseState,
      players: afterPlayers,
      log: inspectionEvent.afterLog,
      _inspectionSeq: 2,
      _inspectionEvents: [inspectionEvent],
    };

    const result = buildInspectionAwareAnimQueue(
      baseState,
      resolvedState,
      { buildAnimQueue, copyPlayers },
    );

    expect(result.queue.filter(step => step.type === 'NIGHT_WIND')).toHaveLength(0);
    expect(result.queue.filter(step => step.type === 'DRAW_CARD')).toEqual([
      expect.objectContaining({ card: inspectionCard, targetPid: 1 }),
    ]);
  });

  it('分阶段结算第二次 SAN 检定时不重播旧状态已有的第一次检定', () => {
    const insomnia = { name: '失眠' };
    const amnesia = { name: '失忆' };
    const players = [makePlayer({ name: '艾伦', san: 5 })];
    const firstEvent = {
      seq: 1,
      card: insomnia,
      target: 0,
      beforePlayers: players,
      beforeLog: [],
      afterPlayers: players,
      afterLog: ['艾伦 的SAN检定结果为"失眠"'],
    };
    const secondEvent = {
      seq: 2,
      card: amnesia,
      target: 0,
      beforePlayers: players,
      beforeLog: firstEvent.afterLog,
      afterPlayers: players,
      afterLog: [...firstEvent.afterLog, '艾伦 的SAN检定结果为"失忆"'],
    };

    const result = buildInspectionAwareAnimQueue(
      {
        players,
        log: firstEvent.afterLog,
        _inspectionSeq: 0,
        _inspectionEvents: [firstEvent],
      },
      {
        players,
        log: secondEvent.afterLog,
        _inspectionSeq: 2,
        _inspectionEvents: [firstEvent, secondEvent],
      },
      { buildAnimQueue, copyPlayers },
    );

    const inspectionCards = result.queue
      .filter(step => step.type === 'DRAW_CARD' && step.triggerName === '检定牌')
      .map(step => step.card.name);
    expect(inspectionCards).toEqual(['失忆']);
    expect(result.inspectionSeq).toBe(2);
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

    expect(flow.queue.map(step => step.type)).toEqual(['VISUAL_LOCK', 'DRAW_CARD', 'STATE_PATCH']);
    expect(tailQueue.some(step => step.type === 'HP_DAMAGE')).toBe(false);
  });
  it('揭开真相的额外摸牌保留暗抽飞牌，但去除背景运镜与翻牌', () => {
    const inspectionCard = { id: 'truth', name: '揭开真相', effect: 'drawCard' };
    const actualCard = { id: 'vri', name: '弗栗多', godKey: 'VRI', isGod: true, type: 'god' };
    const gainedCard = { id: 'hidden-draw', hiddenDraw: true };
    const beforePlayers = [makePlayer({ name: '贝拉', hand: [] })];
    const afterPlayers = [makePlayer({ name: '贝拉', hand: [actualCard] })];
    const gainedCardLog = '贝拉 揭开真相，直接摸1张牌收入手牌（不触发效果）';

    const flow = buildInspectionEventFlow(
      { players: beforePlayers, log: [] },
      [{
        seq: 3,
        card: inspectionCard,
        target: 0,
        beforePlayers,
        beforeLog: ['贝拉 的SAN检定结果为"揭开真相"'],
        afterPlayers,
        afterLog: ['贝拉 的SAN检定结果为"揭开真相"', gainedCardLog],
        gainedCard,
        gainedCardLog,
      }],
      { buildAnimQueue, copyPlayers },
    );

    const draws = flow.queue.filter(step => step.type === 'DRAW_CARD');
    expect(draws).toHaveLength(2);
    expect(draws[0]).toMatchObject({ card: inspectionCard, triggerName: '检定牌', inspectionSeq: 3 });
    expect(draws[1]).toMatchObject({
      card: gainedCard,
      triggerName: '贝拉',
      targetPid: 0,
      inspectionGainSeq: 3,
      travelOnly: true,
      disableDrawBackgroundCamera: true,
      durationMs: 700,
      msgs: [gainedCardLog],
    });
  });

  it('蛊惑分段回放不会重复播放同一个属性事件', () => {
    const repeatedEvent = {
      seq: 7,
      type: 'SAN_LOSS',
      target: 2,
      from: { hp: 10, san: 1 },
      to: { hp: 10, san: 0 },
      logHint: '黛安娜 被迫改信新神，失去 1 SAN',
    };
    const makeSanStep = () => ({
      type: 'SAN_DAMAGE',
      hitIndices: [2],
      statEvents: [repeatedEvent],
    });

    const queue = buildBewitchForcedCardQueue(
      1,
      2,
      makeGodCard('SHU'),
      '黛安娜',
      [makeSanStep(), { type: 'STATE_PATCH', players: [] }, makeSanStep()],
      ['艾伦 对 黛安娜 【蛊惑】，赠予 森之领主'],
    );

    expect(queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
    expect(queue.some(step => step.type === 'STATE_PATCH')).toBe(true);
  });

  it('蛊惑属性事件去重不会吞掉同一事件的另一种动画', () => {
    const combinedEvent = {
      seq: 8,
      type: 'HP_SAN_LOSS',
      target: 2,
      from: { hp: 3, san: 2 },
      to: { hp: 2, san: 1 },
    };
    const queue = buildBewitchForcedCardQueue(1, 2, null, '黛安娜', [
      { type: 'HP_DAMAGE', hitIndices: [2], statEvents: [combinedEvent] },
      { type: 'SAN_DAMAGE', hitIndices: [2], statEvents: [combinedEvent] },
    ], []);

    expect(queue.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(1);
    expect(queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
  });
});
