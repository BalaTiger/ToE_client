import { describe, expect, it, vi } from 'vitest';
import {
  buildAiHuntWaitPresentation,
  buildAiTurnRecoveryState,
  buildRoseThornSnapshot,
  clearPendingAnimDeathPlayers,
  collectExplicitAiTurnLogs,
  finalizeAiPresentationState,
  stripAiExecutionFields,
  stripAiPresentationFields,
} from '../aiTurnPresentation';

describe('AI turn presentation helpers', () => {
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

    expect(result.queue[0]).toBe(replayStep);
    expect(result.queue.some(step => step.type === 'DRAW_CARD')).toBe(false);
    expect(result.externalVisualLocks).toEqual([replayLock]);
    expect(result.shouldMaskDiscardedTurnDraw).toBe(true);
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
