import { describe, expect, it, vi } from 'vitest';
import { MP_REMOTE_REPLAY } from '../game/multiplayerRemoteReplay';
import {
  applyMultiplayerReplayAction,
  getPendingZhuHideCardForState,
  isLocalZhuHideDecisionPhase,
  isMultiplayerReplayBusy,
  processIncomingMultiplayerStateSync,
} from './multiplayerRemoteReplayExecutor';

function ref(current) {
  return { current };
}

function player(name, overrides = {}) {
  return {
    name,
    role: '寻宝者',
    hand: [],
    hp: 10,
    san: 10,
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    players: [player('你'), player('远端玩家')],
    deck: [],
    discard: [],
    currentTurn: 1,
    phase: 'ACTION',
    abilityData: {},
    drawReveal: null,
    log: [],
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    myPlayerIndexRef: ref(0),
    latestGsRef: ref(null),
    mpOpeningRoleRevealPendingRef: ref(false),
    mpRoleRevealedRef: ref(true),
    consumedVisualEventIdsRef: ref(new Set()),
    pendingMpRawQueueRef: ref([]),
    pendingMpLatestStateRawRef: ref(null),
    receivedGsRef: ref(false),
    animQueueRef: ref([]),
    pendingGsRef: ref(null),
    suppressNextBroadcastRef: ref(false),
    syncVisibleLog: vi.fn(),
    setGs: vi.fn(),
    setAnim: vi.fn(),
    setRoleRevealAnim: vi.fn(),
    setAnimExiting: vi.fn(),
    clearDamageAnimations: vi.fn(),
    markInspectionEventsSeen: vi.fn(),
    visualStateLocks: { lock: vi.fn() },
    triggerAnimQueue: vi.fn(),
    ...overrides,
  };
}

describe('multiplayer remote replay executor', () => {
  it('detects replay work and local ZHU hide decisions', () => {
    expect(isMultiplayerReplayBusy({
      roleRevealAnim: null,
      anim: null,
      animExiting: false,
      animQueueRef: ref([{ type: 'DRAW_CARD' }]),
      pendingGsRef: ref(null),
    })).toBe(true);

    const card = { id: 'guard' };
    const zhuState = state({
      phase: 'DRAW_REVEAL',
      players: [player('你', { godName: 'ZHU' })],
      drawReveal: { card, zhuResolved: false },
      zhuLight: { ownerIdx: 0, cardIds: ['guard'] },
    });
    expect(getPendingZhuHideCardForState(zhuState)).toBe(card);
    expect(isLocalZhuHideDecisionPhase(zhuState)).toBe(true);
    expect(getPendingZhuHideCardForState({
      ...zhuState,
      gameOver: { winner: '寻宝者' },
    })).toBeNull();
  });

  it('applies a start animation with locks and an Apophis-safe baseline', () => {
    const latest = state({ apophisNight: { level: 2 } });
    const ctx = context({ latestGsRef: ref(latest) });
    const pendingGs = state({ phase: 'ACTION' });
    const animation = { type: 'APOPHIS_ECLIPSE' };
    const lock = { players: latest.players };

    applyMultiplayerReplayAction({
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: state({ apophisNight: null }),
      pendingGs,
      anim: animation,
      queue: [{ type: 'PAUSE' }],
      visualLock: lock,
      inspectionEvents: [{ seq: 2 }],
    }, pendingGs, ctx);

    expect(ctx.setGs).toHaveBeenCalledWith(expect.objectContaining({
      apophisNight: latest.apophisNight,
    }));
    expect(ctx.visualStateLocks.lock).toHaveBeenCalledWith(lock);
    expect(ctx.markInspectionEventsSeen).toHaveBeenCalledWith([{ seq: 2 }]);
    expect(ctx.triggerAnimQueue).toHaveBeenCalledWith([
      animation,
      { type: 'PAUSE' },
    ], pendingGs);
    expect(ctx.setAnim).not.toHaveBeenCalled();
    expect(ctx.receivedGsRef.current).toBe(true);
    expect(ctx.suppressNextBroadcastRef.current).toBe(true);
  });

  it('routes a local turn draw through the same normalized queue entry as remote viewers', () => {
    const ctx = context();
    const pendingGs = state({ currentTurn: 0, phase: 'DRAW_REVEAL' });
    const turn = { type: 'YOUR_TURN' };
    const draw = { type: 'DRAW_CARD', card: { id: 'draw-1', name: '测试牌' } };

    applyMultiplayerReplayAction({
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: state({ currentTurn: 0 }),
      pendingGs,
      anim: turn,
      queue: [draw],
    }, pendingGs, ctx);

    expect(ctx.triggerAnimQueue).toHaveBeenCalledWith([turn, draw], pendingGs);
    expect(ctx.pendingGsRef.current).toBeNull();
    expect(ctx.animQueueRef.current).toEqual([]);
  });

  it('ignores stale duplicate state packets', () => {
    const current = state({
      _turnKey: 'turn-1',
      log: ['existing'],
    });
    const ctx = context({ latestGsRef: ref(current) });

    const result = processIncomingMultiplayerStateSync({
      rawState: current,
      currentState: current,
      roleRevealAnim: null,
      anim: null,
      animExiting: false,
      context: ctx,
    });

    expect(result).toBe('ignored');
    expect(ctx.setGs).not.toHaveBeenCalled();
    expect(ctx.setAnimExiting).not.toHaveBeenCalled();
  });

  it('buffers animated packets while another replay is active', () => {
    const rawState = state({
      players: [player('你'), player('远端玩家')],
    });
    const ctx = context({
      latestGsRef: ref(null),
      mpRoleRevealedRef: ref(false),
    });

    const result = processIncomingMultiplayerStateSync({
      rawState,
      currentState: null,
      roleRevealAnim: { role: '寻宝者' },
      anim: null,
      animExiting: false,
      context: ctx,
    });

    expect(result).toBe('buffered');
    expect(ctx.pendingMpRawQueueRef.current).toEqual([rawState]);
    expect(ctx.setGs).not.toHaveBeenCalled();
  });
});
