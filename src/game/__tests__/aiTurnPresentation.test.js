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
  scopeAiActionReplayMetadata,
  shouldBuildQueuedAiTurnStartReplay,
  stripAiExecutionFields,
  stripAiPresentationFields,
} from '../aiTurnPresentation';
import { createGodStatusChangedEvent } from '../visualEvents';

describe('AI turn presentation helpers', () => {
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
    expect(result.shouldMaskDiscardedTurnDraw).toBe(false);
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
    expect(result.shouldMaskDiscardedTurnDraw).toBe(true);
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
