import { describe, expect, it, vi } from 'vitest';
import {
  buildAiHuntWaitPresentation,
  buildAiTurnRecoveryState,
  buildRoseThornSnapshot,
  bindVisualEventToSteps,
  clearPendingAnimDeathPlayers,
  collectExplicitAiTurnLogs,
  finalizeAiPresentationState,
  getAiActionQueueCoverage,
  insertAiRestDiceBeforeSettlement,
  scopeAiActionReplayMetadata,
  scopeAiPreHuntReplayMetadata,
  shouldBuildQueuedAiTurnStartReplay,
  shouldPrependAiSkillSnapshot,
  stripAiExecutionFields,
  stripAiPresentationFields,
} from '../aiTurnPresentation';
import {
  createApophisTargetVisualEvent,
  createGodStatusChangedEvent,
  createHuntResultEvent,
  createInspectionVisualEvent,
} from '../visualEvents';
import { getVisualEventIdsCoveredByAnimationQueue } from '../visualEventTransactionCompiler';

describe('AI turn presentation helpers', () => {
  it('keeps a complete hand-worship transaction before the rest dice and heal', () => {
    const worshipMsg = '贝拉 从手牌信仰 烛九阴，获得衔烛照幽(Lv.1)（骷髅头不计）';
    const restMsg = '贝拉 选择【休息】，掷骰 3、3，取高值回复 3HP，翻面休息中';
    const dice = { type: 'DICE_ROLL', d1: 3, d2: 3, heal: 3 };
    const queue = [
      { type: 'GOD_HIGHLIGHT', msgs: [worshipMsg], visualEventId: 'god-status' },
      { type: 'STATE_PATCH', zhuLight: { active: true }, visualEventId: 'god-status' },
      {
        type: 'HP_HEAL',
        msgs: [restMsg],
        statEvents: [{ type: 'HP_GAIN', reason: '休息', logHint: restMsg }],
      },
    ];

    expect(insertAiRestDiceBeforeSettlement(queue, dice, restMsg).map(step => step.type)).toEqual([
      'GOD_HIGHLIGHT',
      'STATE_PATCH',
      'DICE_ROLL',
      'HP_HEAL',
    ]);
    expect(shouldPrependAiSkillSnapshot({
      playersBeforeSkillAction: [{ godName: 'ZHU' }],
      restMsg,
      actionMsgs: [worshipMsg, restMsg],
      visualEvents: [{
        type: 'godStatusChanged',
        msgs: [worshipMsg],
        playersBefore: [{ godName: null }],
        playersAfter: [{ godName: 'ZHU' }],
      }],
    })).toBe(false);
  });

  it('preserves the pre-skill snapshot when rest has no complete hand-worship transaction', () => {
    expect(shouldPrependAiSkillSnapshot({
      playersBeforeSkillAction: [{ godName: 'ZHU' }],
      restMsg: '贝拉 选择【休息】，掷骰 3、3，取高值回复 3HP，翻面休息中',
      actionMsgs: [],
      visualEvents: [],
    })).toBe(true);
  });

  it('binds hand-built action steps to their rule visual event', () => {
    expect(bindVisualEventToSteps([
      { type: 'SKILL_SWAP' },
      { type: 'CARD_TRANSFER', visualEventId: 'nested-event' },
    ], { id: 'swap-event' })).toEqual([
      { type: 'SKILL_SWAP', visualEventId: 'swap-event' },
      { type: 'CARD_TRANSFER', visualEventId: 'nested-event' },
    ]);
  });

  it('proves authoritative AI action coverage without consuming next-turn events', () => {
    const state = {
      _visualEvents: [
        { id: 'swap-event', type: 'swapCards' },
        { id: 'god-event', type: 'godStatusChanged' },
        { id: 'next-draw', type: 'drawCard', turnStartStage: 'draw' },
      ],
    };
    const queue = [
      { type: 'SKILL_SWAP', visualEventId: 'swap-event' },
      { type: 'GOD_HIGHLIGHT', visualEventId: 'god-event' },
    ];

    expect(getAiActionQueueCoverage(
      state,
      queue,
      steps => steps.map(step => step.visualEventId).filter(Boolean),
    )).toEqual({
      eventIds: ['swap-event', 'god-event'],
      coveredEventIds: ['swap-event', 'god-event'],
      uncoveredEventIds: [],
    });
  });

  it('reports unrepresented action events instead of silently consuming them', () => {
    const state = {
      _visualEvents: [
        { id: 'swap-event', type: 'swapCards' },
        { id: 'future-event', type: 'futureActionMechanic' },
      ],
    };

    expect(getAiActionQueueCoverage(
      state,
      [{ type: 'SKILL_SWAP', visualEventId: 'swap-event' }],
      steps => steps.map(step => step.visualEventId).filter(Boolean),
    )).toMatchObject({
      coveredEventIds: ['swap-event'],
      uncoveredEventIds: ['future-event'],
    });
  });

  it('ignores action events consumed by an earlier hunt segment', () => {
    const state = {
      _visualEvents: [
        { id: 'faith-before-hunt', type: 'godStatusChanged' },
        { id: 'current-hunt-result', type: 'huntResult' },
        { id: 'next-turn-draw', type: 'drawCard', turnStartStage: 'draw' },
      ],
    };
    const queue = [{ type: 'HP_DAMAGE', visualEventId: 'current-hunt-result' }];

    expect(getAiActionQueueCoverage(
      state,
      queue,
      steps => steps.map(step => step.visualEventId).filter(Boolean),
      new Set(['faith-before-hunt']),
    )).toEqual({
      eventIds: ['current-hunt-result'],
      coveredEventIds: ['current-hunt-result'],
      uncoveredEventIds: [],
    });
  });

  it('allows a later hunt segment with no new rule event after prior events were consumed', () => {
    const state = {
      _visualEvents: [{ id: 'previous-hunt-target', type: 'huntTarget' }],
    };

    expect(getAiActionQueueCoverage(
      state,
      [{ type: 'DISCARD' }, { type: 'HP_DAMAGE' }],
      steps => steps.map(step => step.visualEventId).filter(Boolean),
      new Set(['previous-hunt-target']),
    )).toEqual({
      eventIds: [],
      coveredEventIds: [],
      uncoveredEventIds: [],
    });
  });

  it('counts a suppressed stat wrapper as covered by its represented owner event', () => {
    const statEvent = { type: 'SAN_LOSS', seq: 18 };
    const state = {
      _visualEvents: [
        { id: 'god-event', type: 'godStatusChanged', statEvents: [statEvent] },
        { id: 'stat-wrapper', type: 'statEvents', statEvents: [statEvent] },
      ],
    };

    expect(getAiActionQueueCoverage(
      state,
      [{ type: 'GOD_HIGHLIGHT', visualEventId: 'god-event' }],
      steps => steps.map(step => step.visualEventId).filter(Boolean),
    ).uncoveredEventIds).toEqual([]);
  });

  it('keeps the next AI draw heal out of the previous AI action replay', () => {
    const swapEvent = { id: 'allen-swap', type: 'swapCards' };
    const healEvent = {
      type: 'HP_GAIN',
      target: 2,
      from: { hp: 8, san: 10 },
      to: { hp: 9, san: 10 },
      reason: '蚂蚁虽小',
      logHint: '贝拉 回复了 1 HP',
      seq: 12,
    };
    const state = {
      _statEventSeq: 12,
      _statEvents: [healEvent],
      _visualEvents: [
        swapEvent,
        { id: 'bella-turn', type: 'turnStart', turnStartStage: 'turnStart' },
        { id: 'bella-draw', type: 'drawCard', turnStartStage: 'draw' },
        { id: 'bella-heal', type: 'statEvents', turnStartStage: 'draw', statEvents: [healEvent] },
      ],
    };

    expect(scopeAiActionReplayMetadata(state)).toEqual({
      visualEvents: [swapEvent],
      statEvents: [],
      statEventSeq: 0,
    });
  });

  it('keeps a terminal incoming AI turn eligible for queued presentation', () => {
    const nextState = {
      currentTurn: 1,
      gameOver: { winner: 'treasure' },
      _turnStartLogs: ['turn starts', 'damage link breaks', 'player dies'],
    };

    expect(shouldBuildQueuedAiTurnStartReplay({
      nextState,
      fromTurn: 0,
      isAiSeat: (_state, idx) => idx === 1,
      getTurnStartDrawnCard: () => null,
    })).toBe(true);
  });

  it('builds the hunt-wait timeline and returns presentation state without side effects', () => {
    const introStep = { type: 'YOUR_TURN', triggerName: 'Bot' };
    const previousState = {
      phase: 'ACTION',
      currentTurn: 1,
      players: [
        { name: 'Human', hand: [], godZone: [] },
        { name: 'Bot', hand: [], godZone: [] },
      ],
      discard: [],
      log: ['before'],
    };
    const nextState = {
      ...previousState,
      phase: 'PLAYER_REVEAL_FOR_HUNT',
      players: [
        previousState.players[0],
        {
          ...previousState.players[1],
          _pendingAnimDeath: true,
          hand: [{ id: 'thorn', roseThornHolderId: 1 }],
        },
      ],
      log: ['before', 'unbound result'],
    };
    const buildActorTurnStartReplay = vi.fn();
    const buildTurnStartIntroQueue = vi.fn(() => [introStep]);

    const result = buildAiHuntWaitPresentation({
      previousState,
      rawResult: {},
      nextState,
      isDrawnCardActuallyDiscarded: vi.fn(() => false),
      buildActorTurnStartReplay,
      buildTurnStartIntroQueue,
    });

    expect(buildActorTurnStartReplay).not.toHaveBeenCalled();
    expect(buildTurnStartIntroQueue).toHaveBeenCalledWith(previousState, 'Bot');
    expect(result.queue[0]).toMatchObject(introStep);
    expect(result.queue.flatMap(step => step.msgs || [])).toContain('unbound result');
    expect(result.nextState.players[1]._pendingAnimDeath).toBe(false);
    expect(result.roseThornSnapshot).toEqual([
      { idx: 0, marked: [] },
      { idx: 1, marked: ['thorn'] },
    ]);
    expect(result.externalVisualLocks).toEqual([]);
  });

  it('describes replay visual effects for App to execute', () => {
    const players = [
      { name: 'Human', hand: [], godZone: [] },
      { name: 'Bot', hand: [], godZone: [] },
    ];
    const replayStep = { type: 'REPLAY_START' };
    const replayLock = { players, zhuLight: null };
    const previousState = {
      phase: 'ACTION',
      currentTurn: 1,
      players,
      _playersBeforeThisDraw: players,
      _drawLogs: [],
      _statLogs: [],
      _aiDrawnCard: { id: 'drawn' },
      discard: [],
      log: [],
    };

    const result = buildAiHuntWaitPresentation({
      previousState,
      rawResult: {},
      nextState: {
        ...previousState,
        phase: 'PLAYER_REVEAL_FOR_HUNT',
      },
      isDrawnCardActuallyDiscarded: vi.fn(() => false),
      buildActorTurnStartReplay: vi.fn(() => ({
        queue: [replayStep],
        visualLock: replayLock,
      })),
      buildTurnStartIntroQueue: vi.fn(() => [{ type: 'YOUR_TURN' }]),
    });

    expect(result.queue[0]).toMatchObject({ type: 'VISUAL_LOCK', players });
    expect(result.queue[1]).toBe(replayStep);
    expect(result.queue.some(step => step.type === 'DRAW_CARD')).toBe(false);
    expect(result.externalVisualLocks).toEqual([replayLock]);
  });

  it('treats queued rest and CTH spring heals as authoritative stat-event coverage', () => {
    const restHeal = {
      seq: 21,
      type: 'HP_GAIN',
      target: 1,
      from: { hp: 7, san: 10 },
      to: { hp: 9, san: 10 },
      reason: '休息',
    };
    const springHeal = {
      seq: 22,
      type: 'HP_GAIN',
      target: 1,
      from: { hp: 9, san: 10 },
      to: { hp: 10, san: 10 },
      reason: '地下泉',
    };
    const state = {
      players: [
        { name: '你', hp: 10, san: 10 },
        { name: '艾伦', hp: 10, san: 10 },
      ],
      _statEvents: [restHeal, springHeal],
      _statEventSeq: 22,
      _visualEvents: [
        { id: 'rest-stats', type: 'statEvents', statEvents: [restHeal] },
        { id: 'spring-stats', type: 'statEvents', statEvents: [springHeal] },
      ],
    };
    const queue = [
      { type: 'HP_HEAL', hitIndices: [1], statEvents: [restHeal] },
      { type: 'CTH_RLYEH_DREAM', targetPid: 1 },
      { type: 'DRAW_CARD', card: { key: 'C2', name: '地下泉' }, targetPid: 1 },
      { type: 'HP_HEAL', hitIndices: [1], statEvents: [springHeal] },
    ];

    expect(getAiActionQueueCoverage(
      state,
      queue,
      steps => getVisualEventIdsCoveredByAnimationQueue(state, steps),
    )).toEqual({
      eventIds: ['rest-stats', 'spring-stats'],
      coveredEventIds: ['rest-stats', 'spring-stats'],
      uncoveredEventIds: [],
    });
    expect(queue.map(step => step.type)).toEqual([
      'HP_HEAL',
      'CTH_RLYEH_DREAM',
      'DRAW_CARD',
      'HP_HEAL',
    ]);
  });

  it('does not treat retained inspection metadata as part of a later throw-stone action', () => {
    const state = {
      _inspectionEvents: [{
        seq: 1,
        target: 2,
        card: { id: 'old-inspection', name: '失眠' },
      }],
      _visualEvents: [{
        id: 'throw-stone-event',
        type: 'throwStone',
        sourceIdx: 0,
        targetIdx: 1,
        roll: 1,
        damage: 0,
      }],
    };
    const queue = [
      { type: 'DICE_ROLL', visualEventId: 'throw-stone-event' },
      { type: 'RANDOM_TARGET', visualEventId: 'throw-stone-event' },
      { type: 'THROW_STONE', visualEventId: 'throw-stone-event' },
    ];

    expect(getAiActionQueueCoverage(
      state,
      queue,
      steps => steps.map(step => step.visualEventId).filter(Boolean),
    )).toEqual({
      eventIds: ['throw-stone-event'],
      coveredEventIds: ['throw-stone-event'],
      uncoveredEventIds: [],
    });
  });

  it('repairs a missing drawn-card discard after the AI turn intro was already shown', () => {
    const drawnCard = { id: 'a4', key: 'A4', name: '空谷传音' };
    const players = [
      { name: '艾伦', hand: [], godZone: [] },
      { name: '卡洛斯', hand: [], godZone: [] },
    ];
    const previousState = {
      phase: 'AI_TURN',
      currentTurn: 1,
      players,
      _playersBeforeThisDraw: players,
      _aiTurnIntroShown: true,
      _aiDrawnCard: drawnCard,
      _discardedDrawnCard: true,
      discard: [drawnCard],
      log: ['卡洛斯 摸到 [A4] 空谷传音，评估后选择弃置'],
    };

    const result = buildAiHuntWaitPresentation({
      previousState,
      rawResult: { _animDiscardedDrawnCard: true },
      nextState: {
        ...previousState,
        phase: 'PLAYER_REVEAL_FOR_HUNT',
      },
      isDrawnCardActuallyDiscarded: () => true,
      buildActorTurnStartReplay: vi.fn(),
      buildTurnStartIntroQueue: vi.fn(),
    });

    expect(result.queue).toContainEqual(expect.objectContaining({
      type: 'DISCARD',
      card: drawnCard,
      targetPid: 1,
    }));
    expect(result.queue.some(step => step.type === 'DRAW_CARD')).toBe(false);
  });

  it('does not replay a drawn-card discard that was already included in the intro queue', () => {
    const drawnCard = { id: 'a4', key: 'A4', name: '空谷传音' };
    const players = [
      { name: '艾伦', hand: [], godZone: [] },
      { name: '卡洛斯', hand: [], godZone: [] },
    ];
    const previousState = {
      currentTurn: 1,
      players,
      _playersBeforeThisDraw: players,
      _aiTurnIntroShown: true,
      _aiTurnDiscardShown: true,
      _aiDrawnCard: drawnCard,
      _discardedDrawnCard: true,
      discard: [drawnCard],
      log: [],
    };

    const result = buildAiHuntWaitPresentation({
      previousState,
      rawResult: { _animDiscardedDrawnCard: true },
      nextState: { ...previousState, phase: 'PLAYER_REVEAL_FOR_HUNT' },
      isDrawnCardActuallyDiscarded: () => true,
      buildActorTurnStartReplay: vi.fn(),
      buildTurnStartIntroQueue: vi.fn(),
    });

    expect(result.queue.some(step => step.type === 'DISCARD')).toBe(false);
  });

  it('plays the complete worship-from-hand settlement before an AI hunt wait', () => {
    const oldGod = { id: 'old-zhu', name: '烛九阴', godKey: 'ZHU', isGod: true };
    const newGod = { id: 'new-zhu', name: '烛九阴', godKey: 'ZHU', isGod: true };
    const beforePlayers = [
      { name: '你', hp: 10, san: 10, isDead: false, hand: [{ id: 'reveal' }], godName: 'ZHU', godLevel: 1, godZone: [oldGod] },
      { name: '贝拉', hp: 10, san: 10, isDead: false, hand: [newGod], godName: null, godLevel: 0, godZone: [] },
    ];
    const afterHighlightPlayers = [
      beforePlayers[0],
      { ...beforePlayers[1], hand: [], godName: 'ZHU', godLevel: 1, godZone: [newGod] },
    ];
    const afterAbandonPlayers = [
      { ...beforePlayers[0], san: 10, godName: null, godLevel: 0, godZone: [] },
      afterHighlightPlayers[1],
    ];
    const settledPlayers = [
      { ...afterAbandonPlayers[0], san: 9 },
      afterHighlightPlayers[1],
    ];
    const worshipMsg = '贝拉 从手牌信仰 烛九阴，获得衔烛照幽(Lv.1)（骷髅头不计）';
    const abandonMsg = '你 被邪神抛弃，失去 1 SAN';
    const huntMsg = '贝拉（追猎者）向你发动【追捕】！请选择亮出一张手牌';
    const godStatusEvent = createGodStatusChangedEvent({
      playerIdx: 1,
      playerName: '贝拉',
      godKey: 'ZHU',
      godLevel: 1,
      msgs: [worshipMsg],
      playersBefore: beforePlayers,
      playersAfter: afterHighlightPlayers,
      faithSettlement: {
        previousFaithExit: null,
        abandonedFollowers: [{
          playerIdx: 0,
          cards: [oldGod],
          msgs: [abandonMsg],
          playersBefore: afterHighlightPlayers,
          playersAfter: afterAbandonPlayers,
          discardBefore: [],
          discardAfter: [oldGod],
          statEventSeqBefore: 0,
          statEventSeqAfter: 1,
          playersAfterResolution: settledPlayers,
          discardAfterResolution: [oldGod],
          effect: 'godAbandon',
        }],
      },
    });
    const previousState = {
      phase: 'AI_TURN',
      currentTurn: 1,
      players: beforePlayers,
      discard: [],
      log: [],
      _aiTurnIntroShown: true,
      _statEvents: [],
      _statEventSeq: 0,
      _visualEvents: [],
    };
    const nextState = {
      ...previousState,
      phase: 'PLAYER_REVEAL_FOR_HUNT',
      players: settledPlayers,
      discard: [oldGod],
      log: [worshipMsg, abandonMsg, huntMsg],
      _visualEvents: [godStatusEvent],
      _statEvents: [{
        type: 'SAN_LOSS',
        target: 0,
        from: { hp: 10, san: 10, isDead: false },
        to: { hp: 10, san: 9, isDead: false },
        seq: 1,
        reason: '被邪神抛弃',
      }],
      _statEventSeq: 1,
    };
    const rawResult = {
      _playersBeforeSkillAction: settledPlayers,
      _preSkillLogs: [worshipMsg, abandonMsg],
      _preSkillDiscard: [oldGod],
      _aiHuntEvents: [{
        hunterIdx: 1,
        targetIdx: 0,
        beforePlayers: settledPlayers,
        msgs: [huntMsg],
      }],
    };

    const result = buildAiHuntWaitPresentation({
      previousState,
      rawResult,
      nextState,
      isDrawnCardActuallyDiscarded: () => false,
      buildActorTurnStartReplay: vi.fn(),
      buildTurnStartIntroQueue: vi.fn(),
    });

    const highlightIdx = result.queue.findIndex(step => step.type === 'GOD_HIGHLIGHT');
    const abandonIdx = result.queue.findIndex(step => step.effect === 'godAbandon');
    const sanIdx = result.queue.findIndex(step => step.type === 'SAN_DAMAGE');
    const huntIdx = result.queue.findIndex(step => step.type === 'SKILL_HUNT');

    expect([highlightIdx, abandonIdx, sanIdx, huntIdx].every(index => index >= 0)).toBe(true);
    expect(highlightIdx).toBeLessThan(abandonIdx);
    expect(abandonIdx).toBeLessThan(sanIdx);
    expect(sanIdx).toBeLessThan(huntIdx);
    expect(result.queue[abandonIdx]).toMatchObject({
      fromPid: 0,
      dest: 'discard',
      cards: [oldGod],
      faithSettlementStep: true,
    });
  });

  it('binds consecutive AI hunt-wait steps to their rule events so playback stays authoritative', () => {
    const players = [
      { name: '你', hp: 10, san: 10, hand: [{ id: 'local-card' }] },
      { name: '贝拉', hp: 10, san: 10, hand: [] },
      { name: '卡洛斯', hp: 7, san: 9, hand: [{ id: 'revealed', key: 'C4' }] },
    ];
    const firstNight = {
      seq: 1,
      actorIdx: 1,
      actorName: '贝拉',
      targetIdx: 2,
      roll: 1,
      changed: true,
      label: '选择【追捕】目标',
      log: '【黑夜】贝拉 选择【追捕】目标掷出 1，目标由 你 错乱为 卡洛斯，失去 1 SAN',
    };
    const secondNight = {
      seq: 2,
      actorIdx: 1,
      actorName: '贝拉',
      targetIdx: 0,
      roll: 6,
      changed: false,
      label: '选择【追捕】目标',
      log: '【黑夜】贝拉 选择【追捕】目标掷出 6，目标未偏移',
    };
    const rawHunts = [
      {
        apophisTargetEvent: firstNight,
        hunterIdx: 1,
        targetIdx: 2,
        revealedCard: players[2].hand[0],
        beforePlayers: players,
        msgs: ['贝拉（追猎者）对 卡洛斯 【追捕】，亮出 [C4]'],
      },
      {
        apophisTargetEvent: secondNight,
        hunterIdx: 1,
        targetIdx: 0,
        beforePlayers: players,
        msgs: ['贝拉（追猎者）向你发动【追捕】！请选择亮出一张手牌'],
        skipReveal: true,
      },
    ];
    const huntEvents = rawHunts.map(createHuntResultEvent);
    const apophisEvents = rawHunts.map(event => createApophisTargetVisualEvent(
      event.apophisTargetEvent,
      { playersAfter: players },
    ));
    const previousState = {
      phase: 'AI_TURN',
      currentTurn: 1,
      players,
      discard: [],
      log: [],
      _aiTurnIntroShown: true,
      _visualEvents: [],
    };
    const nextState = {
      ...previousState,
      phase: 'PLAYER_REVEAL_FOR_HUNT',
      log: rawHunts.flatMap(event => [event.apophisTargetEvent.log, ...event.msgs]),
      _visualEvents: [apophisEvents[0], huntEvents[0], apophisEvents[1], huntEvents[1]],
      _apophisTargetSeq: 2,
      _apophisTargetEvent: secondNight,
    };

    const result = buildAiHuntWaitPresentation({
      previousState,
      rawResult: { _aiHuntEvents: rawHunts },
      nextState,
      isDrawnCardActuallyDiscarded: () => false,
      buildActorTurnStartReplay: vi.fn(),
      buildTurnStartIntroQueue: vi.fn(),
    });
    const orderedSteps = result.queue.filter(step =>
      step.type === 'DICE_ROLL' || step.type === 'SKILL_HUNT'
    );

    expect(orderedSteps.map(step => step.type)).toEqual([
      'DICE_ROLL',
      'SKILL_HUNT',
      'DICE_ROLL',
      'SKILL_HUNT',
    ]);
    expect(orderedSteps[0].visualEventId).toBe(apophisEvents[0].id);
    expect(orderedSteps[1].visualEventId).toBe(huntEvents[0].id);
    expect(orderedSteps[2].visualEventId).toBe(apophisEvents[1].id);
    expect(orderedSteps[3].visualEventId).toBe(huntEvents[1].id);
    expect(getAiActionQueueCoverage(
      nextState,
      result.queue,
      queue => queue.map(step => step.visualEventId).filter(Boolean),
    ).uncoveredEventIds).toEqual([]);
  });

  it('plays an Apophis SAN inspection before the huntResult transaction', () => {
    const beforePlayers = [
      { name: '你', hp: 10, san: 10, hand: [] },
      { name: '贝拉', hp: 10, san: 7, hand: [{ id: 'hunt-card', key: 'A1' }] },
      { name: '卡洛斯', hp: 10, san: 10, hand: [{ id: 'reveal-card', key: 'A1' }] },
    ];
    const afterSanPlayers = beforePlayers.map((player, index) => (
      index === 1 ? { ...player, san: 6 } : player
    ));
    const night = {
      seq: 1,
      actorIdx: 1,
      actorName: '贝拉',
      selectedIdx: 0,
      targetIdx: 2,
      roll: 1,
      changed: true,
      label: '选择【追捕】目标',
      log: '【黑夜】贝拉 选择【追捕】目标掷出 1，目标由 你 错乱为 卡洛斯，失去 1 SAN',
      statSeq: 1,
    };
    const inspectionCard = { id: 'inspection', name: '暂时的平静', effect: 'nothing' };
    const inspectionLog = '贝拉 的SAN检定结果为"暂时的平静"';
    const inspectionEvent = {
      seq: 1,
      target: 1,
      card: inspectionCard,
      beforePlayers: afterSanPlayers,
      afterPlayers: afterSanPlayers,
      beforeLog: [night.log],
      afterLog: [night.log, inspectionLog],
      beforeDiscard: [],
      afterDiscard: [],
      beforeStatEventSeq: 1,
      statEvents: [],
    };
    const rawHunt = {
      apophisTargetEvent: night,
      hunterIdx: 1,
      targetIdx: 2,
      revealedCard: beforePlayers[2].hand[0],
      beforePlayers: afterSanPlayers,
      afterPlayers: afterSanPlayers,
      beforeLog: [night.log, inspectionLog],
      afterLog: [night.log, inspectionLog, '贝拉（追猎者）对 卡洛斯 【追捕】，亮出 [A1]'],
      msgs: ['贝拉（追猎者）对 卡洛斯 【追捕】，亮出 [A1]'],
    };
    const apophisEvent = createApophisTargetVisualEvent(night, {
      playersBefore: beforePlayers,
      playersAfter: afterSanPlayers,
      statEvents: [{ type: 'SAN_LOSS', target: 1, amount: 1, seq: 1 }],
    });
    const inspectionVisualEvent = createInspectionVisualEvent(inspectionEvent);
    const huntEvent = createHuntResultEvent(rawHunt);
    const state = {
      phase: 'PLAYER_REVEAL_FOR_HUNT',
      currentTurn: 1,
      players: afterSanPlayers,
      discard: [],
      log: rawHunt.afterLog,
      _inspectionEvents: [inspectionEvent],
      _statEvents: apophisEvent.statEvents,
      _visualEvents: [apophisEvent, inspectionVisualEvent, huntEvent],
    };

    const result = buildAiHuntWaitPresentation({
      previousState: { ...state, phase: 'AI_TURN', log: [], _inspectionEvents: [], _visualEvents: [], _aiTurnIntroShown: true },
      rawResult: { _aiHuntEvents: [rawHunt] },
      nextState: state,
      isDrawnCardActuallyDiscarded: () => false,
      buildActorTurnStartReplay: vi.fn(),
      buildTurnStartIntroQueue: vi.fn(),
    });
    const diceIdx = result.queue.findIndex(step => step.type === 'DICE_ROLL');
    const sanIdx = result.queue.findIndex(step => step.type === 'SAN_DAMAGE');
    const inspectionIdx = result.queue.findIndex(step => step.type === 'DRAW_CARD' && step.inspectionSeq === 1);
    const huntIdx = result.queue.findIndex(step => step.type === 'SKILL_HUNT');

    expect(diceIdx).toBeGreaterThanOrEqual(0);
    expect(sanIdx).toBeGreaterThan(diceIdx);
    expect(inspectionIdx).toBeGreaterThan(sanIdx);
    expect(huntIdx).toBeGreaterThan(inspectionIdx);
    expect(result.queue[diceIdx].visualEventId).toBe(apophisEvent.id);
    expect(result.queue[inspectionIdx].visualEventId).toBe(inspectionVisualEvent.id);
    expect(result.queue[huntIdx].visualEventId).toBe(huntEvent.id);
    expect(result.inspectionEvents).toEqual([inspectionEvent]);
    expect(getAiActionQueueCoverage(
      state,
      result.queue,
      queue => queue.map(step => step.visualEventId).filter(Boolean),
    ).uncoveredEventIds).toEqual([]);
  });

  it('keeps worship and consecutive hunts on one monotonic hand timeline', () => {
    const cards = Array.from({ length: 6 }, (_, index) => ({
      id: `diana-${index + 1}`,
      key: index < 3 ? `D${index + 1}` : `A${index + 1}`,
      name: `手牌${index + 1}`,
    }));
    const godCard = { ...cards[0], godKey: 'CTH', isGod: true, name: '拉莱耶之主' };
    const beforeFaith = [
      { name: '艾伦', hp: 10, san: 10, isDead: false, hand: [{ id: 'allen-card', key: 'D3' }], godZone: [] },
      { name: '黛安娜', hp: 10, san: 10, isDead: false, hand: [godCard, ...cards.slice(1)], godZone: [] },
      { name: '贝拉', hp: 10, san: 10, isDead: false, hand: [{ id: 'bella-card', key: 'D3' }], godZone: [] },
    ];
    const afterFaith = [
      beforeFaith[0],
      { ...beforeFaith[1], hand: cards.slice(1), godName: 'CTH', godLevel: 1, godZone: [godCard] },
      beforeFaith[2],
    ];
    const afterFirstDiscard = [
      beforeFaith[0],
      { ...afterFaith[1], hand: cards.slice(2) },
      beforeFaith[2],
    ];
    const afterFirstHunt = [
      { ...beforeFaith[0], hp: 7 },
      afterFirstDiscard[1],
      beforeFaith[2],
    ];
    const afterSecondDiscard = [
      afterFirstHunt[0],
      { ...afterFaith[1], hand: cards.slice(3) },
      beforeFaith[2],
    ];
    const afterSecondHunt = [
      afterFirstHunt[0],
      afterSecondDiscard[1],
      { ...beforeFaith[2], hp: 7 },
    ];
    const worshipMsg = '黛安娜 从手牌信仰 拉莱耶之主，获得梦访拉莱耶(Lv.1)（骷髅头不计）';
    const rawHunts = [
      {
        hunterIdx: 1,
        targetIdx: 0,
        revealedCard: beforeFaith[0].hand[0],
        discardedCard: cards[1],
        beforePlayers: afterFaith,
        afterDiscardPlayers: afterFirstDiscard,
        afterDiscardDiscard: [cards[1]],
        afterPlayers: afterFirstHunt,
        afterResultDiscard: [cards[1]],
        beforeLog: [worshipMsg],
        afterLog: [worshipMsg, '黛安娜（追猎者）对 艾伦 【追捕】，亮出 [D3]', '弃 [D1] 扭伤 → 艾伦 受 3HP 伤害！'],
        msgs: ['黛安娜（追猎者）对 艾伦 【追捕】，亮出 [D3]', '弃 [D1] 扭伤 → 艾伦 受 3HP 伤害！'],
      },
      {
        hunterIdx: 1,
        targetIdx: 2,
        revealedCard: beforeFaith[2].hand[0],
        discardedCard: cards[2],
        beforePlayers: afterFirstHunt,
        afterDiscardPlayers: afterSecondDiscard,
        afterDiscardDiscard: [cards[1], cards[2]],
        afterPlayers: afterSecondHunt,
        afterResultDiscard: [cards[1], cards[2]],
        beforeLog: [worshipMsg],
        afterLog: [worshipMsg, '黛安娜（追猎者）对 贝拉 【追捕】，亮出 [D3]', '弃 [D2] 鼠群 → 贝拉 受 3HP 伤害！'],
        msgs: ['黛安娜（追猎者）对 贝拉 【追捕】，亮出 [D3]', '弃 [D2] 鼠群 → 贝拉 受 3HP 伤害！'],
      },
      {
        hunterIdx: 1,
        targetIdx: 0,
        revealedCard: beforeFaith[0].hand[0],
        beforePlayers: afterSecondHunt,
        afterPlayers: afterSecondHunt,
        afterResultDiscard: [cards[1], cards[2]],
        beforeLog: [worshipMsg],
        afterLog: [worshipMsg, '黛安娜（追猎者）对 艾伦 【追捕】，亮出 [D3]', '无匹配手牌，放弃追捕 艾伦'],
        msgs: ['黛安娜（追猎者）对 艾伦 【追捕】，亮出 [D3]', '无匹配手牌，放弃追捕 艾伦'],
      },
    ];
    const godEvent = createGodStatusChangedEvent({
      playerIdx: 1,
      playerName: '黛安娜',
      godKey: 'CTH',
      godLevel: 1,
      msgs: [worshipMsg],
      playersBefore: beforeFaith,
      playersAfter: afterFaith,
    });
    const huntEvents = rawHunts.map(event => createHuntResultEvent({
      ...event,
      skipIntro: false,
      skipReveal: false,
    }));
    const previousState = {
      phase: 'AI_TURN',
      currentTurn: 1,
      players: beforeFaith,
      discard: [],
      log: [],
      _aiTurnIntroShown: true,
      _visualEvents: [],
      _statEvents: [],
      _statEventSeq: 0,
    };
    const nextState = {
      ...previousState,
      players: afterSecondHunt,
      discard: [cards[1], cards[2]],
      log: [worshipMsg, ...rawHunts.flatMap(event => event.msgs)],
      _visualEvents: [godEvent, ...huntEvents],
    };
    const rawResult = {
      _playersBeforeSkillAction: afterFaith,
      _preSkillLogs: [worshipMsg],
      _preSkillDiscard: [],
      _aiHuntEvents: rawHunts,
    };

    const scoped = scopeAiPreHuntReplayMetadata(nextState, rawResult);
    expect(scoped.players[1].hand.map(card => card.id)).toEqual(cards.slice(1).map(card => card.id));
    expect(scoped.visualEvents).toEqual([godEvent]);

    const result = buildAiHuntWaitPresentation({
      previousState,
      rawResult,
      nextState,
      isDrawnCardActuallyDiscarded: () => false,
      buildActorTurnStartReplay: vi.fn(),
      buildTurnStartIntroQueue: vi.fn(),
    });

    let visualPlayers = beforeFaith;
    const timeline = [];
    result.queue.forEach(step => {
      if (step?.visualSetupPatch?.players) visualPlayers = step.visualSetupPatch.players;
      if (step?.type === 'STATE_PATCH' && Array.isArray(step.players)) visualPlayers = step.players;
      (step?.visualTimeline || []).forEach(frame => {
        if (Array.isArray(frame?.patch?.players)) visualPlayers = frame.patch.players;
      });
      if (['GOD_HIGHLIGHT', 'SKILL_HUNT', 'STATE_PATCH'].includes(step?.type)) {
        timeline.push({
          type: step.type,
          hand: visualPlayers[1].hand.map(card => card.id),
        });
      }
    });

    const highlight = timeline.find(entry => entry.type === 'GOD_HIGHLIGHT');
    const hunts = timeline.filter(entry => entry.type === 'SKILL_HUNT');
    expect(highlight.hand).toEqual(cards.slice(1).map(card => card.id));
    expect(hunts.map(entry => entry.hand)).toEqual([
      cards.slice(1).map(card => card.id),
      cards.slice(2).map(card => card.id),
      cards.slice(3).map(card => card.id),
    ]);
    const highlightIndex = timeline.indexOf(highlight);
    const firstHuntIndex = timeline.indexOf(hunts[0]);
    expect(timeline.slice(highlightIndex, firstHuntIndex).some(entry => entry.hand.length === 3)).toBe(false);
  });

  it('keeps animation metadata available until the final presentation cleanup', () => {
    const raw = {
      phase: 'ACTION',
      _aiName: 'Bot',
      _playersBeforeEndTurnReplay: [{ id: 1 }],
      _aiHandLimitDiscards: [{ id: 2 }],
    };

    expect(stripAiExecutionFields(raw)).toEqual({
      phase: 'ACTION',
      _playersBeforeEndTurnReplay: [{ id: 1 }],
      _aiHandLimitDiscards: [{ id: 2 }],
    });
    expect(stripAiPresentationFields(raw)).toEqual({ phase: 'ACTION' });
    expect(raw._aiName).toBe('Bot');
  });

  it('builds rose-thorn snapshots from hand and god zones', () => {
    expect(buildRoseThornSnapshot([
      {
        hand: [
          { id: 'h0', roseThornHolderId: 0 },
          { id: 'other', roseThornHolderId: 1 },
        ],
        godZone: [{ id: 'g0', roseThornHolderId: 0 }],
      },
      { hand: [{ id: 'h1', roseThornHolderId: 1 }], godZone: [] },
    ])).toEqual([
      { idx: 0, marked: ['h0', 'g0'] },
      { idx: 1, marked: ['h1'] },
    ]);
  });

  it('clears pending animation deaths without mutating unaffected players', () => {
    const stable = { name: 'stable' };
    const players = clearPendingAnimDeathPlayers([
      { name: 'dying', _pendingAnimDeath: true },
      stable,
    ]);
    expect(players[0]).toEqual({ name: 'dying', _pendingAnimDeath: false });
    expect(players[1]).toBe(stable);
    expect(finalizeAiPresentationState({ phase: 'ACTION', players })).toEqual({
      phase: 'ACTION',
      players,
    });
  });

  it('collects explicit timeline logs in playback order', () => {
    expect(collectExplicitAiTurnLogs({
      _turnStartLogs: ['start'],
      _drawLogs: ['draw'],
      _statLogs: ['stat'],
    }, [
      { msgs: ['skill'] },
      { type: 'PAUSE' },
    ])).toEqual(['start', 'draw', 'stat', 'skill']);
  });

  it('builds stage-specific recovery through the turn engine', () => {
    const recovered = { recovered: true };
    const startNextTurn = vi.fn(() => recovered);
    const result = buildAiTurnRecoveryState({
      snapshot: {
        currentTurn: 1,
        players: [{}, { name: 'Bot' }],
        log: ['before'],
      },
      error: new Error('bad queue'),
      stage: 'presentation',
      startNextTurn,
    });

    expect(result).toBe(recovered);
    expect(startNextTurn).toHaveBeenCalledWith(expect.objectContaining({
      log: ['before', 'Bot 的动画结算异常（bad queue），系统强制结束其回合'],
      currentTurn: 1,
      skillUsed: false,
      restUsed: false,
      huntAbandoned: [],
    }));
  });
});
