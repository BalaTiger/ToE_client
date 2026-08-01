import { describe, expect, it, vi } from 'vitest';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../game/coreUtils';
import {
  buildNormalStateBroadcast,
  buildPlayerWinWaitBroadcast,
  emitMultiplayerGameEnd,
  getMultiplayerWinnerRole,
  isEndTurnReplayDecisionState,
  shouldSuppressNormalStateBroadcast,
} from './useMultiplayerStateBroadcast';

describe('useMultiplayerStateBroadcast helpers', () => {
  it('only forwards multiplayer winner roles to gameEnd', () => {
    expect(getMultiplayerWinnerRole({ winner: ROLE_TREASURE })).toBe(ROLE_TREASURE);
    expect(getMultiplayerWinnerRole({ winner: ROLE_HUNTER })).toBe(ROLE_HUNTER);
    expect(getMultiplayerWinnerRole({ winner: ROLE_CULTIST })).toBe(ROLE_CULTIST);
    expect(getMultiplayerWinnerRole({ winner: 'LOSE_ALL' })).toBe(null);
    expect(getMultiplayerWinnerRole(null)).toBe(null);
  });

  it('detects end-turn replay decision states that still need syncing', () => {
    expect(isEndTurnReplayDecisionState({
      _endTurnReplay: true,
      phase: 'DRAW_REVEAL',
      drawReveal: { fromEndTurnReplay: true },
    })).toBe(true);
    expect(isEndTurnReplayDecisionState({
      _endTurnReplay: true,
      phase: 'GOD_CHOICE',
      abilityData: { fromEndTurnReplay: true },
    })).toBe(true);
    expect(isEndTurnReplayDecisionState({
      _endTurnReplay: true,
      phase: 'ACTION',
    })).toBe(false);
  });

  it('suppresses private, wait-only, timeout-marker, and non-decision replay states', () => {
    expect(shouldSuppressNormalStateBroadcast({ phase: 'MP_PLAYER_WIN_WAIT' })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'SWAP_STEAL_CARD' })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'SWAP_GIVE_CARD' })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'ACTION', _mpEndTurn: true })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'ACTION', _mpAutoDiscard: true })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'ACTION', _mpAutoCthDecision: true })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'ACTION', _endTurnReplay: true })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({
      phase: 'DRAW_REVEAL',
      _endTurnReplay: true,
      drawReveal: { fromEndTurnReplay: true },
    })).toBe(false);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'ACTION' })).toBe(false);
  });

  it('builds a wait-state broadcast for local treasure win screens', () => {
    const swapEvent = {
      id: 'swap-win-1',
      type: 'swapCards',
      sourceIdx: 0,
      targetIdx: 1,
      sourceCount: 1,
      targetCount: 1,
    };
    const broadcast = buildPlayerWinWaitBroadcast({
      gs: {
        phase: 'TREASURE_WIN',
        drawReveal: { card: { id: 'hidden' } },
        abilityData: { winReason: 'done' },
        _visualEvents: [swapEvent],
        players: [{ name: '我' }],
      },
      room: { roomId: 'room-1' },
      myPlayerIndex: 0,
    });

    expect(broadcast.roomId).toBe('room-1');
    expect(broadcast.rawGs.phase).toBe('MP_PLAYER_WIN_WAIT');
    expect(broadcast.rawGs.drawReveal).toBe(null);
    expect(broadcast.rawGs.abilityData).toMatchObject({
      winReason: 'done',
      winnerIdx: 0,
      waitingForTreasureReveal: true,
    });
    expect(broadcast.rawGs._visualEvents).toEqual([swapEvent]);
    expect(broadcast.clearLocalVisualEvents).toBe(false);
  });

  it('rotates the wait-state winnerIdx so remote viewers see the correct winner seat', async () => {
    const { rotateGsForViewer } = await import('../game/rotateState');
    const broadcast = buildPlayerWinWaitBroadcast({
      gs: {
        phase: 'TREASURE_WIN',
        drawReveal: null,
        abilityData: {},
        players: [{ name: '甲' }, { name: '乙' }, { name: '丙' }],
      },
      room: { roomId: 'room-1' },
      myPlayerIndex: 2,
    });

    // 获胜者（自己视角 seat 0）在原始座位表中位于 seat 2
    expect(broadcast.rawGs.abilityData.winnerIdx).toBe(2);
    // 远端（原始 seat 1）旋转后，获胜者应显示在远端视角的 seat 1，且就是获胜者本人（甲）
    const rotated = rotateGsForViewer(broadcast.rawGs, 1);
    expect(rotated.abilityData.winnerIdx).toBe(1);
    expect(rotated.players[rotated.abilityData.winnerIdx].name).toBe('甲');
  });

  it('prunes consumed visual events from normal state broadcasts', () => {
    const broadcast = buildNormalStateBroadcast({
      gs: {
        phase: 'ACTION',
        players: [{ name: '我' }],
        _visualEvents: [
          { type: 'drawCard', id: 'old-event' },
          { type: 'drawCard', id: 'fresh-event' },
        ],
      },
      room: { roomId: 'room-1' },
      myPlayerIndex: 0,
      consumedVisualEventIds: new Set(['old-event']),
    });

    expect(broadcast.roomId).toBe('room-1');
    expect(broadcast.clearLocalVisualEvents).toBe(true);
    expect(broadcast.freshVisualEvents).toEqual([{ type: 'drawCard', id: 'fresh-event', scope: 'action' }]);
    expect(broadcast.rawGs._visualEvents).toEqual([{ type: 'drawCard', id: 'fresh-event', scope: 'action' }]);
  });

  it('emits gameEnd and final state sync once the socket is connected', () => {
    const socket = { connected: true, emit: vi.fn() };
    const gs = {
      phase: 'ACTION',
      players: [{ name: '我' }],
      gameOver: { winner: ROLE_HUNTER },
    };

    expect(emitMultiplayerGameEnd({
      socket,
      gs,
      playerUUID: 'u1',
      roomId: 'room-1',
      myPlayerIndex: 0,
    })).toBe(true);

    expect(socket.emit).toHaveBeenCalledWith('gameEnd', {
      uuid: 'u1',
      roomId: 'room-1',
      winnerRole: ROLE_HUNTER,
    });
    expect(socket.emit).toHaveBeenCalledWith('mpStateSync', {
      roomId: 'room-1',
      gs,
    });
    expect(socket.emit.mock.calls.map(([event]) => event)).toEqual(['mpStateSync', 'gameEnd']);
  });
});
