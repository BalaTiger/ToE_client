import { describe, expect, it } from 'vitest';
import {
  createCardEffectEvent,
  createGodPowerBlockedEvent,
  createGodStatusChangedEvent,
  createSwapCardsEvent,
  createApophisTargetVisualEvent,
  createInspectionVisualEvent,
  createThrowStoneEvent,
  createHandLimitDiscardEvent,
  createHuntResultEvent,
  createTimedOutDrawDiscardEvent,
  createTsathogguaSlimeGrantEvent,
  createTsathogguaSlimePopEvent,
  buildTsathogguaSlimeGrantSteps,
  buildFreshStatVisualEvents,
  buildTurnStartDrawVisualEvents,
  getVisualEvents,
  ensureVisualEventState,
  promoteLegacyVisualEvents,
  pruneConsumedVisualEvents,
} from '../visualEvents';
import {
  ANIMATION_QUEUE_AUTHORITY,
  compileRuleVisualEventsToAnimTransaction,
  compileVisualEventToAnimSteps,
  getAnimationQueueVisualEventIds,
  getVisualEventIdsCoveredByAnimationQueue,
  mergeAnimationTransactionQueue,
  validateVisualEventTransaction,
} from '../visualEventTransactionCompiler';
import { prepareAnimationQueueSteps } from '../animationStepSchema';

const player = (name, patch = {}) => ({ name, hp: 10, san: 10, hand: [], ...patch });

describe('visualEventTransactionCompiler', () => {
  it('queue authority consumes only the stat event covered by an endless-corridor replay step', () => {
    const staleStat = { seq: 4, type: 'SAN_LOSS', target: 0, from: { san: 9 }, to: { san: 8 } };
    const corridorStat = { seq: 5, type: 'SAN_LOSS', target: 0, from: { san: 8 }, to: { san: 7 } };
    const state = {
      players: [player('卡洛斯', { san: 7 })],
      _statEvents: [staleStat, corridorStat],
      _statEventSeq: 5,
      _statLogs: ['卡洛斯 遭遇邪神 伏行之混沌！（第1次）失去 1 SAN'],
    };
    const queue = [
      { type: 'DRAW_CARD', card: { name: '伏行之混沌' }, triggerName: '无尽通道' },
      { type: 'SAN_DAMAGE', hitIndices: [0], statEvents: [corridorStat] },
    ];

    expect(getVisualEventIdsCoveredByAnimationQueue(state, queue)).toEqual([
      'legacy:statEvents:5',
    ]);
    expect(mergeAnimationTransactionQueue(queue, null, {
      authority: ANIMATION_QUEUE_AUTHORITY.QUEUE,
    }).map(step => step.type)).toEqual(['DRAW_CARD', 'SAN_DAMAGE']);
  });

  it('keeps end-turn boundary events before the next turn banner after canonical merge', () => {
    const slime = { id: 'boundary-slime', name: '撒托古亚的赐福黏液', isTsathogguaSlime: true };
    const before = [player('蟾蜍信徒'), player('下一名AI')];
    const after = [player('蟾蜍信徒', { hand: [slime] }), before[1]];
    const grant = createTsathogguaSlimeGrantEvent({
      ownerIdx: 0,
      count: 1,
      cards: [slime],
      msgs: ['蟾蜍信徒获得黏液'],
      playersBefore: before,
      playersAfter: after,
    });
    const nextTurnState = {
      players: after,
      currentTurn: 1,
      phase: 'AI_TURN',
      _turnStartLogs: ['── 下一名AI 的回合开始 ──'],
    };
    const turnStart = buildTurnStartDrawVisualEvents(nextTurnState)[0];
    const transaction = compileRuleVisualEventsToAnimTransaction({
      ...nextTurnState,
      _visualEvents: [turnStart, grant],
    }, null, { visualEventScope: 'turnStart' });
    const legacyQueue = [
      ...buildTsathogguaSlimeGrantSteps(grant, nextTurnState),
      { type: 'YOUR_TURN', name: '下一名AI' },
    ];
    const merged = mergeAnimationTransactionQueue(legacyQueue, transaction);
    const types = merged.map(step => step.type);

    expect(transaction.queue.map(step => step.type)).toEqual([
      'VISUAL_LOCK', 'CARD_TRANSFER', 'STATE_PATCH', 'TURN_BOUNDARY_PAUSE', 'YOUR_TURN',
    ]);
    expect(types.indexOf('CARD_TRANSFER')).toBeLessThan(types.indexOf('YOUR_TURN'));
    expect(transaction.stageQueues.turnBoundary.map(step => step.type)).toEqual([
      'VISUAL_LOCK', 'CARD_TRANSFER', 'STATE_PATCH', 'TURN_BOUNDARY_PAUSE',
    ]);
  });

  it('keeps end-turn god-power-blocked feedback before the next turn banner', () => {
    const state = {
      players: [player('蟾蜍信徒'), player('下一名AI')],
      currentTurn: 1,
      phase: 'AI_TURN',
      _turnStartLogs: ['── 下一名AI 的回合开始 ──'],
    };
    const turnStart = buildTurnStartDrawVisualEvents(state)[0];
    const blocked = createGodPowerBlockedEvent({
      playerIdx: 0,
      playerName: '蟾蜍信徒',
      msgs: ['【引燃火把】蟾蜍信徒 本回合不受邪神之力影响'],
      turnStartStage: 'turnBoundary',
      turnStartStageOrder: 0,
    });
    const transaction = compileRuleVisualEventsToAnimTransaction({
      ...state,
      _visualEvents: [turnStart, blocked],
    }, null, { visualEventScope: 'turnStart' });

    expect(transaction.queue.map(step => step.type)).toEqual(['GOD_POWER_BLOCKED', 'YOUR_TURN']);
  });

  it('compiles a god status event into one idempotent highlight step', () => {
    const before = [player('你'), player('贝拉', { godName: 'TSG', godLevel: 1 })];
    const after = [before[0], { ...before[1], godLevel: 2 }];
    const event = createGodStatusChangedEvent({
      playerIdx: 1,
      playerName: '贝拉',
      godKey: 'TSG',
      godLevel: 2,
      msgs: ['贝拉 从手牌升级邪神之力至 Lv.2'],
      playersBefore: before,
      playersAfter: after,
    });

    expect(compileVisualEventToAnimSteps(event, { players: after })).toEqual([expect.objectContaining({
      type: 'GOD_HIGHLIGHT',
      visualEventId: event.id,
      targetPid: 1,
      godKey: 'TSG',
      godLevel: 2,
      visualSetupPatch: { players: before },
      visualTimeline: [{ atMs: 0, patch: { players: after } }],
    })]);
  });

  it('gives repeated events unique ids while keeping legacy packet ids stable', () => {
    const card = { id: 'repeat', name: '重复牌', type: 'zone' };
    const first = createTimedOutDrawDiscardEvent({ card, drawerIdx: 1, drawerName: '艾伦' });
    const second = createTimedOutDrawDiscardEvent({ card, drawerIdx: 1, drawerName: '艾伦' });
    expect(second.id).not.toBe(first.id);
    expect(pruneConsumedVisualEvents({ _visualEvents: [second] }, new Set([first.id]))._visualEvents).toEqual([second]);

    const legacyState = { _visualEvents: [{ type: 'timedOutDrawDiscard', card, drawerIdx: 1 }] };
    expect(getVisualEvents(legacyState)[0].id).toBe(getVisualEvents(legacyState)[0].id);
  });

  it('compiles rule-owned discard and god-power events in event order', () => {
    const card = { id: 'discard-me', name: '弃牌', type: 'zone' };
    const discard = createHandLimitDiscardEvent({ playerIdx: 1, playerName: '艾伦', cards: [card], msgs: ['艾伦弃牌'] });
    const blocked = createGodPowerBlockedEvent({ playerIdx: 1, playerName: '艾伦', msgs: ['神力被阻挡'] });
    const state = {
      players: [player('你'), player('艾伦')],
      discard: [card],
      phase: 'ACTION',
      _visualEvents: [discard, blocked],
    };

    const transaction = compileRuleVisualEventsToAnimTransaction(state, { players: state.players, discard: [] });

    expect(transaction.context).toBe('ruleEventBatch');
    expect(transaction.id).toBe(`visual-transaction:${discard.id}+${blocked.id}`);
    expect(transaction.barrier).toBe('continuation');
    expect(transaction.eventIds).toEqual([discard.id, blocked.id]);
    expect(transaction.queue.map(step => step.type)).toEqual(['DISCARD', 'GOD_POWER_BLOCKED']);
    expect(transaction.queue[0]).toMatchObject({ targetPid: 1, cards: [card] });
  });

  it('compiles slime pop with its before/after visual timeline', () => {
    const slime = { id: 'slime', name: '黏液' };
    const before = [player('你', { hand: [slime] })];
    const after = [player('你', { hand: [] })];
    const event = createTsathogguaSlimePopEvent({
      playerIdx: 0,
      cards: [slime],
      playersBefore: before,
      playersAfter: after,
      msgs: ['黏液消失'],
    });

    expect(compileVisualEventToAnimSteps(event, { players: after })).toEqual([expect.objectContaining({
      type: 'TSG_SLIME_POP',
      targetPid: 0,
      cards: [slime],
      visualSetupPatch: { players: before },
      visualTimeline: [{ atMs: 700, patch: { players: after } }],
    })]);
  });

  it('compiles timeout discard and card-effect events without UI state inference', () => {
    const card = { id: 'timeout', name: '超时牌', type: 'zone' };
    const timeout = createTimedOutDrawDiscardEvent({ card, drawerIdx: 1, drawerName: '艾伦' });
    expect(compileVisualEventToAnimSteps(timeout, { players: [player('你'), player('艾伦')] })[0])
      .toMatchObject({ type: 'DISCARD', card, targetPid: 1 });

    const effect = createCardEffectEvent({
      effectKey: 'burrowingWorm',
      actorIdx: 1,
      card,
      beforePlayers: [player('你'), player('艾伦')],
      beforeDiscard: [],
      msgs: ['蠕虫效果'],
    });
    expect(compileVisualEventToAnimSteps(effect, { players: [player('你'), player('艾伦')] })[0])
      .toMatchObject({ type: 'BURROWING_WORM', actorIdx: 1, durationMs: 2750 });
  });

  it('compiles throw stone as one ordered transaction', () => {
    const before = [player('你'), player('贝拉')];
    const after = [before[0], player('贝拉', { hp: 7 })];
    const event = createThrowStoneEvent({
      sourceIdx: 0,
      targetIdx: 1,
      roll: 4,
      distance: 1,
      damage: 3,
      playersBefore: before,
      playersAfter: after,
      statEvents: [{ type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10 }, to: { hp: 7, san: 10 }, seq: 1 }],
    });

    expect(compileVisualEventToAnimSteps(event, { players: after }).map(step => step.type))
      .toEqual(['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE', 'HP_DAMAGE']);
    const transaction = compileRuleVisualEventsToAnimTransaction({
      players: after,
      phase: 'ACTION',
      _visualEvents: [event],
    });
    expect(transaction.id).toBe(event.id);
    expect(validateVisualEventTransaction(transaction, [event])).toEqual([]);
  });

  it('compiles rule-owned turn start and draw events without state diffs', () => {
    const card = { id: 'draw-card', name: '本回合摸牌', type: 'zone' };
    const state = {
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      players: [player('你'), player('艾伦')],
      drawReveal: { card, drawerIdx: 1, sourcePile: 'deck' },
      _visualEvents: [
        { type: 'turnStart', id: 'turn-start-5', playerIdx: 1, playerName: '艾伦', msgs: ['艾伦的回合'] },
        { type: 'drawCard', id: 'draw-5', playerIdx: 1, playerName: '艾伦', card, sourcePile: 'deck', msgs: ['艾伦摸牌'] },
      ],
    };

    const transaction = compileRuleVisualEventsToAnimTransaction(state);
    expect(transaction.eventIds).toEqual(['turn-start-5', 'draw-5']);
    expect(transaction.queue.map(step => step.type)).toEqual(['YOUR_TURN', 'DRAW_CARD']);
    expect(getAnimationQueueVisualEventIds(transaction.queue)).toEqual(['turn-start-5', 'draw-5']);
  });

  it('keeps an AI god draw ahead of encounter SAN loss and worship highlight', () => {
    const god = { id: 'zhu-draw', name: '烛九阴', godKey: 'ZHU', isGod: true };
    const before = [player('你'), player('艾伦')];
    const after = [before[0], player('艾伦', {
      san: 9,
      godName: 'ZHU',
      godLevel: 1,
      godZone: [god],
    })];
    const encounterLog = '艾伦 遭遇邪神 烛九阴！（第1次）失去 1 SAN';
    const statEvent = {
      type: 'SAN_LOSS',
      target: 1,
      from: { hp: 10, san: 10, isDead: false },
      to: { hp: 10, san: 9, isDead: false },
      reason: '邪神遭遇',
      logHint: encounterLog,
      seq: 1,
    };
    const baseState = {
      currentTurn: 1,
      phase: 'AI_TURN',
      players: after,
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['[调试] 艾伦（追猎者）起手摸到 烛九阴'],
      _turnDrawEvents: [{ card: god, drawerIdx: 1, drawerName: '艾伦', sourcePile: 'deck' }],
      _statEventSeq: 1,
      _statEvents: [statEvent],
      _statLogs: [encounterLog],
    };
    const worshipEvent = createGodStatusChangedEvent({
      playerIdx: 1,
      playerName: '艾伦',
      godKey: 'ZHU',
      godLevel: 1,
      playersBefore: before,
      playersAfter: after,
    });
    const state = {
      ...baseState,
      _visualEvents: [
        ...buildTurnStartDrawVisualEvents(baseState),
        ...buildFreshStatVisualEvents(baseState, 0),
        worshipEvent,
      ],
    };

    const transaction = compileRuleVisualEventsToAnimTransaction(state);
    expect(transaction.queue.map(step => step.type)).toEqual([
      'YOUR_TURN',
      'DRAW_CARD',
      'SAN_DAMAGE',
      'GOD_HIGHLIGHT',
    ]);
    expect(transaction.queue[1]).toMatchObject({ card: god, targetPid: 1 });
    expect(transaction.queue.slice(0, 3).map(step => step.turnStartStage)).toEqual([
      'turnBanner',
      'draw',
      'draw',
    ]);
  });

  it('compiles AI pre-draw effects in the turn-start stage before the draw stage', () => {
    const card = { id: 'ai-fixed-draw', name: '下一张牌', key: 'B2', type: 'zone' };
    const goatLog = '【黑山羊幼仔】艾伦 失去 1 HP 和 1 SAN';
    const baseState = {
      currentTurn: 1,
      phase: 'AI_TURN',
      players: [player('你'), player('艾伦', { hp: 9, san: 9 })],
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['艾伦 摸到 [B2] 下一张牌'],
      _turnDrawEvents: [{ card, drawerIdx: 1, drawerName: '艾伦', sourcePile: 'deck' }],
      _statEventSeq: 2,
      _statLogs: [goatLog],
      _statEvents: [
        {
          type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10 }, to: { hp: 9, san: 10 },
          reason: '黑山羊幼仔', logHint: goatLog, seq: 1,
        },
        {
          type: 'SAN_LOSS', target: 1, from: { hp: 9, san: 10 }, to: { hp: 9, san: 9 },
          reason: '黑山羊幼仔', logHint: goatLog, seq: 2,
        },
      ],
    };
    const state = {
      ...baseState,
      // The producer appends stats after the draw event. Stage ordering must
      // still move these turn-start effects ahead of the reveal.
      _visualEvents: [
        ...buildTurnStartDrawVisualEvents(baseState),
        ...buildFreshStatVisualEvents(baseState, 0),
      ],
    };

    const transaction = compileRuleVisualEventsToAnimTransaction(state);

    expect(transaction.queue.map(step => step.type)).toEqual([
      'YOUR_TURN',
      'HP_DAMAGE',
      'SAN_DAMAGE',
      'DRAW_CARD',
    ]);
    expect(transaction.stageQueues.turnBanner.map(step => step.type)).toEqual(['YOUR_TURN']);
    expect(transaction.stageQueues.turnStart.map(step => step.type)).toEqual([
      'HP_DAMAGE',
      'SAN_DAMAGE',
    ]);
    expect(transaction.stageQueues.draw.map(step => step.type)).toEqual(['DRAW_CARD']);
  });

  it('keeps a future fatal draw out of the current AI action transaction', () => {
    const fall = { id: 'fall-card', name: '坠落', key: 'A1', type: 'zone' };
    const before = [player('你', { hp: 3 }), player('卡洛斯'), player('黛安娜')];
    const after = [player('你', { hp: 0, isDead: true }), before[1], before[2]];
    const swapEvent = createSwapCardsEvent({
      sourceIdx: 1,
      targetIdx: 2,
      beforePlayers: before,
      afterPlayers: before,
      msgs: ['卡洛斯（寻宝者）对 黛安娜 【掉包】'],
    });
    const nextTurnState = {
      currentTurn: 0,
      phase: 'ACTION',
      players: after,
      drawReveal: { card: fall, drawerIdx: 0, sourcePile: 'deck' },
      _turnStartLogs: ['── 你 的回合开始 ──'],
      _drawLogs: ['你 摸到 [A1] 坠落（强制触发）'],
      _statLogs: ['你 失去 3 HP'],
      _statEvents: [{
        type: 'HP_LOSS',
        target: 0,
        from: { hp: 3, san: 10, isDead: false },
        to: { hp: 0, san: 10, isDead: true },
        reason: '坠落',
        logHint: '你 失去 3 HP',
        seq: 9,
      }],
    };
    const stagedTurnEvents = [
      ...buildTurnStartDrawVisualEvents(nextTurnState),
      ...buildFreshStatVisualEvents(nextTurnState, 8),
    ];
    const state = { ...nextTurnState, _visualEvents: [swapEvent, ...stagedTurnEvents] };

    const currentAction = compileRuleVisualEventsToAnimTransaction(state, null, {
      visualEventScope: 'action',
    });
    const nextTurn = compileRuleVisualEventsToAnimTransaction(state, null, {
      visualEventScope: 'turnStart',
    });
    const mergedCurrentQueue = mergeAnimationTransactionQueue([
      { type: 'SKILL_SWAP', sourceIdx: 1, targetIdx: 2 },
    ], currentAction);

    expect(currentAction.eventIds).toEqual([swapEvent.id]);
    expect(mergedCurrentQueue.map(step => step.type)).not.toContain('HP_DAMAGE');
    expect(mergedCurrentQueue.map(step => step.type)).not.toContain('DRAW_CARD');
    expect(nextTurn.queue.map(step => step.type)).toEqual(['YOUR_TURN', 'DRAW_CARD', 'HP_DAMAGE']);
    expect(nextTurn.queue.find(step => step.type === 'HP_DAMAGE')).toMatchObject({
      turnStartStage: 'draw',
      statEvents: [expect.objectContaining({ target: 0, seq: 9 })],
    });

    const completeTransaction = compileRuleVisualEventsToAnimTransaction(state);
    expect(completeTransaction.queue.findIndex(step => step.type === 'SKILL_SWAP'))
      .toBeLessThan(completeTransaction.queue.findIndex(step => step.type === 'YOUR_TURN'));
  });

  it('lets the startled-bats card effect own its HP impact after the bats animation', () => {
    const bats = { id: 'bats-card', name: '惊扰蝙蝠', key: 'C2', type: 'adjDamageHP' };
    const before = [player('你'), player('艾伦')];
    const after = [player('你', { hp: 8 }), player('艾伦', { hp: 8 })];
    const damageLog = '你 与相邻角色各失去 2 HP';
    const statEvents = [
      {
        type: 'HP_LOSS', target: 0, from: { hp: 10, san: 10 }, to: { hp: 8, san: 10 },
        reason: '惊扰蝙蝠', logHint: damageLog, seq: 4,
      },
      {
        type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10 }, to: { hp: 8, san: 10 },
        reason: '惊扰蝙蝠', logHint: damageLog, seq: 4,
      },
    ];
    const baseState = {
      currentTurn: 0,
      phase: 'ACTION',
      players: after,
      drawReveal: { card: bats, drawerIdx: 0, sourcePile: 'deck' },
      _turnStartLogs: ['── 你 的回合开始 ──'],
      _drawLogs: ['你 摸到 [C2] 惊扰蝙蝠，选择收入手牌并触发效果'],
      _statLogs: [damageLog],
      _statEvents: statEvents,
    };
    const standaloneStatEvent = buildFreshStatVisualEvents(baseState, 3)[0];
    const batsEffectEvent = createCardEffectEvent({
      effectKey: 'startledBats',
      card: bats,
      actorIdx: 0,
      beforePlayers: before,
      beforeDiscard: [],
      afterPlayers: after,
      afterDiscard: [],
      statEvents,
      msgs: [damageLog],
    });
    const state = {
      ...baseState,
      _visualEvents: [
        ...buildTurnStartDrawVisualEvents(baseState),
        standaloneStatEvent,
        { ...batsEffectEvent, turnStartStage: 'draw', turnStartStageOrder: 2 },
      ],
    };

    const transaction = compileRuleVisualEventsToAnimTransaction(state, null, {
      visualEventScope: 'turnStart',
    });

    expect(transaction.queue.map(step => step.type)).toEqual([
      'YOUR_TURN',
      'DRAW_CARD',
      'STARTLED_BATS',
      'HP_DAMAGE',
    ]);
    expect(transaction.queue.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(1);
    expect(transaction.eventIds).toEqual(expect.arrayContaining([
      standaloneStatEvent.id,
      batsEffectEvent.id,
    ]));
  });

  it('honors an explicit visual-event id allowlist', () => {
    const first = createGodPowerBlockedEvent({ playerIdx: 0, playerName: '你', msgs: ['first'] });
    const second = createGodPowerBlockedEvent({ playerIdx: 1, playerName: '艾伦', msgs: ['second'] });
    const transaction = compileRuleVisualEventsToAnimTransaction({
      players: [player('你'), player('艾伦')],
      _visualEvents: [first, second],
    }, null, { eventIds: [second.id] });

    expect(transaction.eventIds).toEqual([second.id]);
    expect(transaction.queue).toEqual([
      expect.objectContaining({ type: 'GOD_POWER_BLOCKED', targetPid: 1 }),
    ]);
  });

  it('compiles black-night target selection from the event id instead of a watermark', () => {
    const players = [player('你'), player('艾伦'), player('贝拉')];
    const event = createApophisTargetVisualEvent({
      seq: 9,
      actorIdx: 0,
      actorName: '你',
      selectedIdx: 1,
      targetIdx: 2,
      roll: 1,
      changed: true,
      label: '选择【追捕】目标',
      log: '黑夜目标偏移',
      apophisNight: { active: true },
    }, { playersAfter: players });

    // The target event owns only the roll and its immediate SAN consequence.
    // The actual hunt transaction owns the scope overlay so an intervening
    // inspection can finish before target lock.
    expect(compileVisualEventToAnimSteps(event, { players }).map(step => step.type))
      .toEqual(['DICE_ROLL']);
  });

  it('compiles one inspection event as a self-contained reveal flow', () => {
    const before = [player('你')];
    const after = [player('你', { hp: 8 })];
    const event = createInspectionVisualEvent({
      seq: 3,
      card: { id: 'inspection', name: '自残', effect: 'selfDamageHP' },
      target: 0,
      beforePlayers: before,
      beforeLog: [],
      beforeDiscard: [],
      afterPlayers: after,
      afterLog: ['你 的SAN检定结果为"自残"', '你 自残，失去 2 HP'],
      afterDiscard: [],
      statEvents: [{ type: 'HP_LOSS', target: 0, from: { hp: 10, san: 10 }, to: { hp: 8, san: 10 }, seq: 1 }],
      statEventSeq: 1,
    });

    const steps = compileVisualEventToAnimSteps(event, { players: after });
    expect(steps.map(step => step.type)).toEqual(expect.arrayContaining(['VISUAL_LOCK', 'DRAW_CARD', 'HP_DAMAGE', 'STATE_PATCH']));
    expect(steps.find(step => step.type === 'DRAW_CARD')).toMatchObject({ inspectionSeq: 3 });
  });

  it('promotes legacy replay metadata to deterministic visual-event ids', () => {
    const card = { id: 'legacy-card', name: '旧检定牌' };
    const state = {
      _turnKey: 4,
      _statEventSeq: 3,
      _statEvents: [{ type: 'HP_LOSS', target: 1, seq: 3 }],
      _inspectionEvents: [{ seq: 2, target: 1, card }],
      _animSphinxReveal: { actorIdx: 1, card, guessCorrect: true },
    };

    const first = promoteLegacyVisualEvents(state);
    const second = promoteLegacyVisualEvents(state);
    expect(first.map(event => event.type)).toEqual(['statEvents', 'inspection', 'sphinxResult']);
    expect(second.map(event => event.id)).toEqual(first.map(event => event.id));
  });

  it('merges canonical transactions without duplicating equivalent legacy steps', () => {
    const transaction = {
      eventIds: ['event-1'],
      queue: [{ type: 'DICE_ROLL', diceMode: 'throwStone', d1: 4, rollerName: '你', visualEventId: 'event-1' }],
    };
    const merged = mergeAnimationTransactionQueue(
      [{ type: 'DICE_ROLL', diceMode: 'throwStone', d1: 4, rollerName: '你' }],
      transaction,
    );
    expect(merged).toHaveLength(1);
    expect(getAnimationQueueVisualEventIds(merged)).toEqual(['event-1']);
  });

  it('keeps a stage-aware bewitch queue authoritative at the playback boundary', () => {
    const encounterSan = {
      type: 'SAN_DAMAGE',
      hitIndices: [1],
      visualSetupPatch: { players: [player('你'), player('黛安娜')] },
    };
    const faithHighlight = {
      type: 'GOD_HIGHLIGHT',
      targetPid: 1,
      godKey: 'CTH',
    };
    const stagedQueue = [
      { type: 'SKILL_BEWITCH', targetIdx: 1 },
      { type: 'CARD_TRANSFER', fromPid: 0, toPid: 1, dest: 'player' },
      { type: 'DRAW_CARD', targetPid: 1 },
      encounterSan,
      faithHighlight,
    ];
    const conflictingRecompile = {
      queue: [faithHighlight, encounterSan],
    };

    const result = mergeAnimationTransactionQueue(stagedQueue, conflictingRecompile, {
      authority: ANIMATION_QUEUE_AUTHORITY.QUEUE,
    });

    expect(result.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'DRAW_CARD',
      'SAN_DAMAGE',
      'GOD_HIGHLIGHT',
    ]);
    expect(result[3].visualSetupPatch.players[1].godName).toBeUndefined();
  });

  it('replaces inferred albino-creature stat effects with one canonical HP/SAN pair', () => {
    const before = [player('你'), player('艾伦'), player('贝拉')];
    const after = [before[0], before[1], player('贝拉', { hp: 8, san: 8 })];
    const statEvents = [
      { type: 'HP_LOSS', target: 2, from: { hp: 10, san: 10 }, to: { hp: 8, san: 8 }, reason: '白化生物', seq: 1 },
      { type: 'SAN_LOSS', target: 2, from: { hp: 10, san: 10 }, to: { hp: 8, san: 8 }, reason: '白化生物', seq: 1 },
    ];
    const state = ensureVisualEventState({
      players: after,
      phase: 'ACTION',
      _statEventSeq: 1,
      _statEvents: statEvents,
    });
    const transaction = compileRuleVisualEventsToAnimTransaction(state);
    const legacyQueue = [
      { type: 'HUNT_REVEAL_CARD', targetPid: 0, card: { id: 'fire-card', name: '活火山' } },
      { type: 'HP_DAMAGE', hitIndices: [2], targetStats: after.map(({ hp, san }) => ({ hp, san })) },
      { type: 'SAN_DAMAGE', hitIndices: [2], targetStats: after.map(({ hp, san }) => ({ hp, san })) },
    ];
    const prepared = prepareAnimationQueueSteps(
      mergeAnimationTransactionQueue(legacyQueue, transaction),
    ).steps;

    expect(prepared.map(step => step.type)).toEqual(['HUNT_REVEAL_CARD', 'HP_DAMAGE', 'SAN_DAMAGE']);
    expect(prepared.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(1);
    expect(prepared.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
    expect(prepared.filter(step => step.type === 'HP_DAMAGE')[0].statEvents).toEqual([statEvents[0]]);
    expect(prepared.filter(step => step.type === 'SAN_DAMAGE')[0].statEvents).toEqual([statEvents[1]]);
  });

  it('restores a canonical event as one ordered block when legacy inference interleaves it', () => {
    const transaction = {
      id: 'stone-event',
      eventIds: ['stone-event'],
      queue: [
        { type: 'DICE_ROLL', diceMode: 'throwStone', d1: 4, rollerName: '你', visualEventId: 'stone-event' },
        { type: 'RANDOM_TARGET', sourceIdx: 0, targetIdx: 1, visualEventId: 'stone-event' },
        { type: 'THROW_STONE', sourceIdx: 0, targetIdx: 1, visualEventId: 'stone-event' },
      ],
    };
    const merged = mergeAnimationTransactionQueue([
      transaction.queue[0],
      { type: 'PAUSE', durationMs: 100 },
      transaction.queue[2],
      transaction.queue[1],
    ], transaction);

    expect(merged.map(step => step.type)).toEqual(['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE', 'PAUSE']);
  });

  it('does not anchor an action transaction to an unrelated unbound state patch', () => {
    const transaction = {
      id: 'hunt-result',
      eventIds: ['hunt-result'],
      queue: [
        { type: 'DICE_ROLL', diceMode: 'apophisNight', d1: 1, rollerName: '贝拉', visualEventId: 'hunt-result' },
        { type: 'STATE_PATCH', players: [player('你'), player('贝拉')], visualEventId: 'hunt-result' },
      ],
    };
    const drawPatch = { type: 'STATE_PATCH', players: [player('你'), player('贝拉')] };
    const merged = mergeAnimationTransactionQueue([
      { type: 'DRAW_CARD', card: { id: 'underground-sky', name: '地底天空' }, targetPid: 1 },
      drawPatch,
      { type: 'DICE_ROLL', diceMode: 'apophisNight', d1: 1, rollerName: '贝拉' },
      { type: 'SKILL_HUNT', targetIdx: 2 },
    ], transaction);

    expect(merged.indexOf(drawPatch)).toBeLessThan(
      merged.findIndex(step => step.type === 'DICE_ROLL')
    );
    expect(merged.map(step => step.type)).toEqual([
      'DRAW_CARD',
      'STATE_PATCH',
      'DICE_ROLL',
      'STATE_PATCH',
      'SKILL_HUNT',
    ]);
  });

  it('reports incomplete throw-stone transactions at the compiler boundary', () => {
    const event = { type: 'throwStone', id: 'broken-stone', damage: 3 };
    expect(validateVisualEventTransaction({
      id: event.id,
      eventIds: [event.id],
      queue: [{ type: 'DICE_ROLL', visualEventId: event.id }],
    }, [event])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INCOMPLETE_THROW_STONE_TRANSACTION', eventId: event.id }),
    ]));
  });

  it('uses transaction order instead of legacy visual-event array order', () => {
    const first = {
      ...createGodPowerBlockedEvent({ playerIdx: 0, playerName: '你', msgs: ['first'] }),
      transactionId: 'action-1',
      order: 0,
    };
    const second = {
      ...createGodPowerBlockedEvent({ playerIdx: 1, playerName: '贝拉', msgs: ['second'] }),
      transactionId: 'action-1',
      order: 1,
    };
    const transaction = compileRuleVisualEventsToAnimTransaction({
      players: [player('你'), player('贝拉')],
      _visualEvents: [second, first],
    });

    expect(transaction.queue.map(step => step.targetPid)).toEqual([0, 1]);
  });

  it('validates explicit hunt target dependencies at the transaction boundary', () => {
    const targetEvent = createApophisTargetVisualEvent({
      seq: 1,
      actorIdx: 1,
      targetIdx: 2,
      roll: 4,
      transactionId: 'action-1',
      phaseGroupId: 'attempt-1',
      phaseOrder: 0,
    });
    const huntEvent = createHuntResultEvent({
      hunterIdx: 1,
      targetIdx: 2,
      targetResolutionEventId: targetEvent.id,
      transactionId: 'action-1',
      phaseGroupId: 'attempt-1',
      phaseOrder: 30,
    });
    const transaction = {
      id: 'action-1',
      eventIds: [targetEvent.id, huntEvent.id],
      queue: [
        { type: 'DICE_ROLL', visualEventId: targetEvent.id },
        { type: 'SKILL_HUNT', visualEventId: huntEvent.id },
      ],
    };

    expect(validateVisualEventTransaction(transaction, [targetEvent, huntEvent])).toEqual([]);
    expect(validateVisualEventTransaction(transaction, [huntEvent, targetEvent])).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'VISUAL_EVENT_DEPENDENCY_OUT_OF_ORDER',
        eventId: huntEvent.id,
        dependencyId: targetEvent.id,
      }),
    ]));
  });
});
