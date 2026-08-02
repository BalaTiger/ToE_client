import { describe, expect, it, vi } from 'vitest';
import { MP_REMOTE_REPLAY } from '../game/multiplayerRemoteReplay';
import { createEndlessCorridorReplayEvent } from '../game/visualEvents';
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
  it('keeps the local hand snapshot across a remote swap followed by a buffered slime draw', () => {
    const annaKept = { id: 'anna-kept', name: 'Anna kept card' };
    const alanGiven = { id: 'alan-given', name: 'Alan given card' };
    const alanTaken = { id: 'alan-taken', name: 'Alan taken card' };
    const slime = { id: 'slime', name: 'Tsathoggua slime', isTsathogguaSlime: true };
    const extraDraw = { id: 'extra-draw', name: 'Extra draw', key: 'D3', type: 'zone' };
    const normalDraw = { id: 'normal-draw', name: 'Normal draw', godKey: 'NYA', isGod: true };

    // Server/canonical order is Anna(0), Alan(1). The receiving client is Alan,
    // so every replay snapshot must rotate Alan to local seat 0.
    const beforeSwap = [
      player('Anna', { hand: [annaKept, alanGiven] }),
      player('Alan', { hand: [alanTaken, slime] }),
    ];
    const afterSwap = [
      player('Anna', { hand: [annaKept, alanTaken] }),
      player('Alan', { hand: [alanGiven, slime] }),
    ];
    const swapLog = 'Anna swapped one card with Alan';
    const swapPacket = state({
      players: afterSwap,
      currentTurn: 0,
      _turnKey: 1,
      log: [swapLog],
      _visualEvents: [{
        id: 'swap-1',
        type: 'swapCards',
        sourceIdx: 0,
        targetIdx: 1,
        sourceCount: 1,
        targetCount: 1,
        takenCard: alanTaken,
        givenCard: alanGiven,
        beforePlayers: beforeSwap,
        afterPlayers: afterSwap,
        msgs: [swapLog],
      }],
    });
    const drawPacket = state({
      players: [
        afterSwap[0],
        player('Alan', { hand: [alanGiven, extraDraw], san: 8 }),
      ],
      deck: [],
      currentTurn: 1,
      phase: 'GOD_CHOICE',
      abilityData: { godCard: normalDraw, drawerIdx: 1 },
      _turnKey: 2,
      _preTurnPlayers: afterSwap,
      _playersBeforeThisDraw: afterSwap,
      _turnStartLogs: ['Alan turn starts'],
      _drawLogs: ['slime disappears', 'Alan extra draws D3', 'Alan encounters NYA'],
      _turnDrawEvents: [
        { card: extraDraw, drawerIdx: 1, drawerName: 'Alan', fromTsathogguaSlime: true, msgs: ['Alan extra draws D3'] },
        { card: normalDraw, drawerIdx: 1, drawerName: 'Alan', msgs: ['Alan encounters NYA'] },
      ],
      log: [swapLog, 'Alan turn starts', 'slime disappears', 'Alan extra draws D3', 'Alan encounters NYA'],
    });
    const ctx = context({
      myPlayerIndexRef: ref(1),
      latestGsRef: ref(state({ players: beforeSwap, currentTurn: 0, _turnKey: 1 })),
    });

    const first = processIncomingMultiplayerStateSync({
      rawState: swapPacket,
      currentState: ctx.latestGsRef.current,
      roleRevealAnim: null,
      anim: null,
      animExiting: false,
      context: ctx,
    });
    expect(first).toBe('applied');
    const swapActionQueue = ctx.triggerAnimQueue.mock.calls[0][0];
    const swapLanding = swapActionQueue.findLast(step => step.type === 'STATE_PATCH');
    expect(swapLanding.players[0].name).toBe('Alan');
    expect(swapLanding.players[0].hand).toEqual([alanGiven, slime]);

    // Match the live socket path: latest state advances immediately, while the
    // public replay is still busy and the next animated packet is buffered.
    ctx.latestGsRef.current = ctx.setGs.mock.calls[0][0];
    ctx.animQueueRef.current = [{ type: 'CARD_TRANSFER' }];
    const second = processIncomingMultiplayerStateSync({
      rawState: drawPacket,
      currentState: ctx.latestGsRef.current,
      roleRevealAnim: null,
      anim: { type: 'SKILL_SWAP' },
      animExiting: false,
      context: ctx,
    });
    expect(second).toBe('buffered');
    expect(ctx.pendingMpRawQueueRef.current).toEqual([drawPacket]);

    ctx.animQueueRef.current = [];
    ctx.pendingGsRef.current = null;
    const third = processIncomingMultiplayerStateSync({
      rawState: ctx.pendingMpRawQueueRef.current.shift(),
      allowBuffer: false,
      currentState: ctx.latestGsRef.current,
      roleRevealAnim: null,
      anim: null,
      animExiting: false,
      context: ctx,
    });
    expect(third).toBe('applied');
    const drawLock = ctx.visualStateLocks.lock.mock.calls.at(-1)[0].players;
    expect(drawLock[0].name).toBe('Alan');
    expect(drawLock[0].hand).toEqual([alanGiven, slime]);
    expect(drawLock[1].name).toBe('Anna');
    expect(drawLock[1].hand).toEqual([annaKept, alanTaken]);
    const drawQueue = ctx.triggerAnimQueue.mock.calls.at(-1)[0];
    expect(drawQueue.filter(step => step.type === 'DRAW_CARD').map(step => step.card)).toEqual([extraDraw, normalDraw]);
  });

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

  it('applies a fresh endless-corridor visual delta even when the public state is unchanged', () => {
    const current = state({
      _turnKey: 'turn-1',
      log: ['end-turn state already synchronized'],
      _visualEvents: [],
    });
    const replayEvent = createEndlessCorridorReplayEvent({
      id: 'corridor-opening-delta',
      actorIdx: 1,
      actorName: 'remote player',
      queue: [{ type: 'ENDLESS_CORRIDOR_TUNNEL' }],
    });
    const incoming = { ...current, _visualEvents: [replayEvent] };
    const ctx = context({ latestGsRef: ref(current) });

    const result = processIncomingMultiplayerStateSync({
      rawState: incoming,
      currentState: current,
      roleRevealAnim: null,
      anim: null,
      animExiting: false,
      context: ctx,
    });

    expect(result).toBe('applied');
    expect(ctx.triggerAnimQueue).toHaveBeenCalledWith(
      [expect.objectContaining({ type: 'ENDLESS_CORRIDOR_TUNNEL' }), expect.objectContaining({ type: 'STATE_PATCH' })],
      expect.objectContaining({ _visualEvents: [] }),
    );
    expect(ctx.consumedVisualEventIdsRef.current).toContain(replayEvent.id);
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
