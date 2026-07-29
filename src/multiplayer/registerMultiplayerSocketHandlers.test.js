import { describe, expect, it, vi } from 'vitest';
import { registerMultiplayerSocketHandlers } from './registerMultiplayerSocketHandlers';

function makeSocket() {
  const handlers = new Map();
  return {
    handlers,
    on: vi.fn((event, handler) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    trigger(event, payload) {
      const handler = handlers.get(event);
      if (!handler) throw new Error(`Missing handler: ${event}`);
      return handler(payload);
    },
  };
}

function makeDeps(overrides = {}) {
  const socket = makeSocket();
  const socketRef = { current: socket };
  const state = {
    roomModal: null,
    isMultiplayer: null,
    isDisconnected: null,
    myPlayerIndex: null,
    serverAnnouncement: null,
  };
  const setRoomModal = vi.fn((next) => {
    state.roomModal = typeof next === 'function' ? next(state.roomModal) : next;
  });

  return {
    state,
    socket,
    deps: {
      socket,
      socketRef,
      serverUrl: 'http://127.0.0.1:3002',
      socketPath: '/socket.io',
      cleanupConnection: vi.fn(),
      onConnected: vi.fn(),
      playerUUIDRef: { current: 'u2' },
      setPlayerUUID: vi.fn(),
      identityTokenRef: { current: null },
      setIdentityToken: vi.fn(),
      setPlayerUsername: vi.fn(),
      setPlayerUsernameSpecial: vi.fn(),
      setRenameInput: vi.fn(),
      setMultiLoading: vi.fn(),
      setConnErrModal: vi.fn(),
      setOnlineOptionsModal: vi.fn(),
      setRoomModal,
      setLobbyLoading: vi.fn(),
      setLobbyRooms: vi.fn(),
      addToast: vi.fn(),
      copyRoomIdToClipboard: vi.fn(),
      setFirstBattleStarted: vi.fn(),
      setOnlineResourcesUnlocked: vi.fn(),
      setMyPlayerIndex: vi.fn((idx) => { state.myPlayerIndex = idx; }),
      myPlayerIndexRef: { current: 0 },
      setIsMultiplayer: vi.fn((value) => { state.isMultiplayer = value; }),
      isMultiplayerRef: { current: false },
      setIsDisconnected: vi.fn((value) => { state.isDisconnected = value; }),
      mpRoleRevealedRef: { current: true },
      mpOpeningRoleRevealPendingRef: { current: true },
      consumedVisualEventIdsRef: { current: new Set(['old']) },
      mpAiTakeoverSeqRef: { current: 0 },
      pendingMpAiTakeoverRef: { current: { stale: true } },
      gameEndSentRef: { current: true },
      animQueueRef: { current: ['old'] },
      pendingGsRef: { current: { old: true } },
      setAnimExiting: vi.fn(),
      clearDamageAnimations: vi.fn(),
      setAnim: vi.fn(),
      setGs: vi.fn(),
      receivedGsRef: { current: false },
      setRoleRevealAnim: vi.fn(),
      startNextTurn: vi.fn(),
      processIncomingMpStateSync: vi.fn(),
      handleMpAiTakeover: vi.fn(),
      setFlyingEmojis: vi.fn(),
      discardPileRef: { current: null },
      setServerAnnouncement: vi.fn((announcement) => { state.serverAnnouncement = announcement; }),
      ...overrides,
    },
  };
}

describe('registerMultiplayerSocketHandlers', () => {
  it('registers expected multiplayer socket events', () => {
    const { socket, deps } = makeDeps();
    registerMultiplayerSocketHandlers(deps);

    expect(socket.on).toHaveBeenCalledTimes(22);
    expect([...socket.handlers.keys()]).toEqual([
      'connect_error',
      'uuidAssigned',
      'userInfo',
      'renameSuccess',
      'randomUsernameResult',
      'renameError',
      'roomCreated',
      'roomUpdated',
      'joinError',
      'kickedFromRoom',
      'roomClosed',
      'lobbyRooms',
      'gameStart',
      'mpStateSync',
      'mpAiTakeover',
      'emojiReceived',
      'heartbeatPing',
      'serverAnnouncement',
      'aiTakeover',
      'disconnect',
      'serverError',
      'connect',
    ]);
  });

  it('handles connection errors through the shared failure path', () => {
    const { socket, deps } = makeDeps();
    registerMultiplayerSocketHandlers(deps);

    socket.trigger('connect_error', new Error('boom'));

    expect(deps.cleanupConnection).toHaveBeenCalled();
    expect(deps.setMultiLoading).toHaveBeenCalledWith(false);
    expect(deps.setConnErrModal).toHaveBeenCalledWith(true);
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('updates room state from roomUpdated payloads', () => {
    const { socket, deps, state } = makeDeps();
    state.roomModal = { roomId: 'old', count: 1, max: 12, countdown: 9 };
    registerMultiplayerSocketHandlers(deps);

    socket.trigger('roomUpdated', {
      roomId: 'abc',
      owner: 'u1',
      isPrivate: false,
      players: [{ uuid: 'u1' }, { uuid: 'u2' }],
      count: 2,
      max: 6,
      countdown: 3,
    });

    expect(deps.setMultiLoading).toHaveBeenCalledWith(false);
    expect(deps.setOnlineOptionsModal).toHaveBeenCalledWith(false);
    expect(state.roomModal).toMatchObject({ roomId: 'abc', owner: 'u1', isPrivate: false, count: 2, max: 6, countdown: 3 });
  });

  it('forwards remote state sync and dedupes mpAiTakeover by sequence', () => {
    const { socket, deps } = makeDeps();
    registerMultiplayerSocketHandlers(deps);

    socket.trigger('mpStateSync', { gs: { phase: 'ACTION' } });
    socket.trigger('mpAiTakeover', { seq: 2, playerIndex: 1 });
    socket.trigger('mpAiTakeover', { seq: 1, playerIndex: 1 });

    expect(deps.processIncomingMpStateSync).toHaveBeenCalledWith({ phase: 'ACTION' });
    expect(deps.handleMpAiTakeover).toHaveBeenCalledTimes(1);
    expect(deps.handleMpAiTakeover).toHaveBeenCalledWith({ seq: 2, playerIndex: 1 });
    expect(deps.mpAiTakeoverSeqRef.current).toBe(2);
  });

  it('resets multiplayer refs when AI takeover disconnects the player', () => {
    const { socket, deps, state } = makeDeps();
    registerMultiplayerSocketHandlers(deps);

    socket.trigger('aiTakeover');

    expect(state.isDisconnected).toBe(true);
    expect(state.isMultiplayer).toBe(false);
    expect(deps.isMultiplayerRef.current).toBe(false);
    expect(state.myPlayerIndex).toBe(0);
    expect(deps.myPlayerIndexRef.current).toBe(0);
    expect(deps.mpRoleRevealedRef.current).toBe(false);
    expect([...deps.consumedVisualEventIdsRef.current]).toEqual([]);
    expect(deps.pendingMpAiTakeoverRef.current).toBe(null);
  });

  it('updates announcement state from server broadcasts', () => {
    const { socket, deps, state } = makeDeps();
    registerMultiplayerSocketHandlers(deps);

    socket.trigger('serverAnnouncement', { announcement: '维护提示' });

    expect(state.serverAnnouncement).toBe('维护提示');
  });

  it('initializes non-host game start state without broadcasting a new game state', () => {
    const { socket, deps, state } = makeDeps();
    registerMultiplayerSocketHandlers(deps);

    socket.trigger('gameStart', {
      roomId: 'room-1',
      players: [
        { uuid: 'u1', username: '房主', ready: true },
        { uuid: 'u2', username: '我', ready: true },
      ],
      expansionPlan: '地神的潜影',
    });

    expect(deps.setFirstBattleStarted).toHaveBeenCalledWith(true);
    expect(deps.setOnlineResourcesUnlocked).toHaveBeenCalledWith(true);
    expect(state.myPlayerIndex).toBe(1);
    expect(deps.myPlayerIndexRef.current).toBe(1);
    expect(state.isMultiplayer).toBe(true);
    expect(deps.isMultiplayerRef.current).toBe(true);
    expect(state.isDisconnected).toBe(false);
    expect(state.roomModal.players.every(player => player.ready === false)).toBe(true);
    expect(deps.mpRoleRevealedRef.current).toBe(false);
    expect(deps.mpOpeningRoleRevealPendingRef.current).toBe(false);
    expect([...deps.consumedVisualEventIdsRef.current]).toEqual([]);
    expect(deps.pendingMpAiTakeoverRef.current).toBe(null);
    expect(deps.gameEndSentRef.current).toBe(false);
    expect(socket.emit).not.toHaveBeenCalledWith('mpStateSync', expect.anything());
  });
});
