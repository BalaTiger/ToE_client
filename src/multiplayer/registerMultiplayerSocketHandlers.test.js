import { describe, expect, it, vi } from 'vitest';
import { registerMultiplayerSocketHandlers } from './registerMultiplayerSocketHandlers';
import { buildPhaseUiState, getHuntRevealPromptId } from '../game/phaseUi';
import { isLocalHuntTargetSeat } from '../game/rotateState';
import { isResolvedMpHuntWaitState } from './multiplayerHuntReplayGuard';

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
    dismissedHuntRevealPromptId: null,
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
      leavingRoomRef: { current: false },
      setLobbyLoading: vi.fn(),
      setLobbyRooms: vi.fn(),
      addToast: vi.fn(),
      copyRoomIdToClipboard: vi.fn(),
      setFirstBattleStarted: vi.fn(),
      setMyPlayerIndex: vi.fn((idx) => { state.myPlayerIndex = idx; }),
      myPlayerIndexRef: { current: 0 },
      setIsMultiplayer: vi.fn((value) => { state.isMultiplayer = value; }),
      isMultiplayerRef: { current: false },
      setIsDisconnected: vi.fn((value) => { state.isDisconnected = value; }),
      mpRoleRevealedRef: { current: true },
      mpOpeningRoleRevealPendingRef: { current: true },
      consumedVisualEventIdsRef: { current: new Set(['old']) },
      completedMpHuntRevealPromptIdsRef: { current: new Set(['old-session-prompt']) },
      setDismissedHuntRevealPromptId: vi.fn(value => { state.dismissedHuntRevealPromptId = value; }),
      mpAiTakeoverSeqRef: { current: 0 },
      pendingMpAiTakeoverRef: { current: { stale: true } },
      gameEndSentRef: { current: true },
      gameOverPresentationFrozenRef: { current: true },
      animQueueRef: { current: ['old'] },
      pendingGsRef: { current: { old: true } },
      setAnimExiting: vi.fn(),
      clearDamageAnimations: vi.fn(),
      setAnim: vi.fn(),
      setGs: vi.fn(),
      receivedGsRef: { current: false },
      setRoleRevealAnim: vi.fn(),
      restoreVisibleLog: vi.fn(),
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
  it.each([{ ok: true }, { ok: false, reason: 'room_in_game' }])('settles a replayed waiting-room exit after server confirmation: %j', result => {
    const { socket, deps } = makeDeps();
    deps.pendingRoomExitRef = { current: { roomId: 'old-room', socket } };
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('userInfo', { username: 'me', waitingRoomExitResult: { roomId: 'old-room', ...result } });
    expect(deps.pendingRoomExitRef.current).toBeNull();
    expect(deps.setOnlineOptionsModal).toHaveBeenCalledWith(true);
  });

  it('keeps a newer exit intent when a previous request confirms the same room', () => {
    const { socket, deps } = makeDeps({ leavingRoomRef: { current: true } });
    const pendingExit = { roomId: 'old-room' };
    deps.pendingRoomExitRef = { current: pendingExit };
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('userInfo', { username: 'me', waitingRoomExitResult: { roomId: 'old-room', ok: true } });
    expect(deps.pendingRoomExitRef.current).toBe(pendingExit);
    expect(deps.setOnlineOptionsModal).not.toHaveBeenCalled();
  });

  it.each([
    ['connect', undefined],
    ['connect_error', new Error('late failure')],
    ['uuidAssigned', { uuid: 'old-id', identityToken: 'old-token' }],
    ['userInfo', { username: 'old-name' }],
    ['roomCreated', { roomId: 'old-room', players: [] }],
    ['roomUpdated', { roomId: 'old-room', players: [] }],
    ['gameStart', { roomId: 'old-room', players: [{ uuid: 'u1' }, { uuid: 'u2' }] }],
    ['matchRestored', { roomId: 'old-room', playerIndex: 1, players: [{ uuid: 'u1' }, { uuid: 'u2' }],
      gs: { phase: 'ACTION', currentTurn: 1, players: [{ name: 'host' }, { name: 'me' }] } }],
    ['mpStateSync', { gs: { phase: 'ACTION' } }],
    ['mpAiTakeover', { seq: 9, playerIndex: 1 }],
    ['kickedFromRoom', { reason: 'old room kicked' }],
    ['roomClosed', { reason: 'old room expired' }],
    ['disconnect', undefined],
    ['serverError', 'old error'],
    ['heartbeatPing', undefined],
  ])('ignores stale %s after a newer socket owns the session', (event, payload) => {
    const { socket, deps } = makeDeps({ isMultiplayerRef: { current: true } });
    registerMultiplayerSocketHandlers(deps);
    const currentSocket = makeSocket();
    deps.socketRef.current = currentSocket;
    socket.trigger(event, payload);
    for (const value of Object.values(deps)) {
      if (vi.isMockFunction(value)) expect(value).not.toHaveBeenCalled();
    }
    expect(deps.socketRef.current).toBe(currentSocket);
    expect(currentSocket.disconnect).not.toHaveBeenCalled();
    expect(currentSocket.emit).not.toHaveBeenCalled();
    expect(deps.playerUUIDRef.current).toBe('u2');
    expect(deps.mpAiTakeoverSeqRef.current).toBe(0);
  });

  it('settles a connection whose automatic restore was cancelled before connect', () => {
    const { socket, deps } = makeDeps({ onConnected: vi.fn(() => false) });
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('connect');
    expect(deps.cleanupConnection).toHaveBeenCalledOnce();
    expect(deps.setMultiLoading).toHaveBeenCalledWith(false);
    expect(deps.socketRef.current).toBeNull();
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it('ignores an event after the current connection handshake deadline has expired', () => {
    const { socket, deps } = makeDeps({ isConnectionActive: vi.fn(() => false) });
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('userInfo', { username: 'late-name' });
    expect(deps.setPlayerUsername).not.toHaveBeenCalled();
    expect(deps.cleanupConnection).not.toHaveBeenCalled();
  });

  it('releases an unfinished handshake when its current socket disconnects', () => {
    const { socket, deps } = makeDeps();
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('disconnect');
    expect(deps.cleanupConnection).toHaveBeenCalledOnce();
    expect(deps.setMultiLoading).toHaveBeenCalledWith(false);
  });

  it('does not reopen online options for a room closure arriving during the exit acknowledgement window', () => {
    const { socket, deps } = makeDeps({ leavingRoomRef: { current: true } });
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('roomClosed', { reason: 'Room expired while leaving' });
    expect(deps.setOnlineOptionsModal).not.toHaveBeenCalled();
    expect(deps.setRoomModal).not.toHaveBeenCalled();
    expect(deps.addToast).not.toHaveBeenCalled();
  });

  it.each(['gameStart', 'matchRestored'])('ignores %s while waiting for the room exit acknowledgement', event => {
    const { socket, deps } = makeDeps({ leavingRoomRef: { current: true } });
    registerMultiplayerSocketHandlers(deps);
    socket.trigger(event, { roomId: 'leaving-room', playerIndex: 1,
      players: [{ uuid: 'u1' }, { uuid: 'u2' }],
      gs: { phase: 'ACTION', currentTurn: 1, players: [{ name: 'host' }, { name: 'me' }] } });
    expect(deps.setRoomModal).not.toHaveBeenCalled();
    expect(deps.setIsMultiplayer).not.toHaveBeenCalled();
    expect(deps.setGs).not.toHaveBeenCalled();
  });

  it('accepts the next connection after a previous room exit', () => {
    const { socket, deps, state } = makeDeps({ leavingRoomRef: { current: true } });
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('connect');
    socket.trigger('roomUpdated', { roomId: 'restored-room', players: [{ uuid: 'u2' }] });
    expect(state.roomModal?.roomId).toBe('restored-room');
  });

  it.each([false, true])('ends the stale match when automatic reconnect restores only a room: %s', roomRestored => {
    const { socket, deps, state } = makeDeps({
      silentConnectionErrors: true,
      isMultiplayerRef: { current: true },
      latestGsRef: { current: { phase: 'AI_TURN' } },
      pendingMpRawQueueRef: { current: [{ old: true }] },
      pendingMpLatestStateRawRef: { current: { old: true } },
    });
    state.roomModal = { roomId: 'old-room' };
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('userInfo', { username: 'me', roomRestored });
    expect(deps.isMultiplayerRef.current).toBe(false);
    expect(state.isDisconnected).toBe(false);
    expect(deps.setGs).toHaveBeenCalledWith(null);
    expect(deps.latestGsRef.current).toBeNull();
    expect(deps.animQueueRef.current).toEqual([]);
    expect(deps.pendingGsRef.current).toBeNull();
    expect(deps.pendingMpRawQueueRef.current).toEqual([]);
    expect(deps.pendingMpLatestStateRawRef.current).toBeNull();
    expect(deps.setRoleRevealAnim).toHaveBeenCalledWith(null);
    expect(socket.disconnect).not.toHaveBeenCalled();
    if (roomRestored) {
      socket.trigger('roomUpdated', { roomId: 'old-room', players: [{ uuid: 'u2' }] });
      expect(state.roomModal?.roomId).toBe('old-room');
    } else {
      expect(state.roomModal).toBeNull();
      expect(deps.setOnlineOptionsModal).toHaveBeenCalledWith(true);
    }
  });

  it('leaves an unrestorable waiting room after its transport reconnect succeeds', () => {
    const { socket, deps, state } = makeDeps({ silentConnectionErrors: true, latestGsRef: { current: null } });
    state.roomModal = { roomId: 'removed-room' };
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('userInfo', { username: 'me' });
    expect(state.roomModal).toBeNull();
    expect(deps.setOnlineOptionsModal).toHaveBeenCalledWith(true);
    expect(deps.addToast).toHaveBeenCalled();
  });

  it('does not reopen online options or clear a solo match after abandoning an in-flight restore', () => {
    const soloGs = { phase: 'AI_TURN', _isMP: false };
    const { socket, deps } = makeDeps({
      silentConnectionErrors: true,
      leavingRoomRef: { current: true },
      isMultiplayerRef: { current: false },
      latestGsRef: { current: soloGs },
    });
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('userInfo', { username: 'me', waitingRoomExpired: true });
    socket.trigger('aiTakeover', { reason: 'late takeover result' });
    expect(deps.cleanupConnection).toHaveBeenCalledTimes(2);
    expect(deps.setMultiLoading).toHaveBeenCalledWith(false);
    expect(deps.setIsDisconnected).not.toHaveBeenCalled();
    expect(deps.setOnlineOptionsModal).not.toHaveBeenCalled();
    expect(deps.setGs).not.toHaveBeenCalled();
    expect(deps.latestGsRef.current).toBe(soloGs);
    expect(deps.addToast).not.toHaveBeenCalled();
  });

  it('keeps an active match intact until the promised restored snapshot arrives', () => {
    const { socket, deps } = makeDeps({ silentConnectionErrors: true, isMultiplayerRef: { current: true } });
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('userInfo', { username: 'me', roomRestored: true, matchRestored: true });
    expect(deps.isMultiplayerRef.current).toBe(true);
    expect(deps.setGs).not.toHaveBeenCalled();
    expect(deps.animQueueRef.current).toEqual(['old']);
  });

  it('registers expected multiplayer socket events', () => {
    const { socket, deps } = makeDeps();
    registerMultiplayerSocketHandlers(deps);

    expect(socket.on).toHaveBeenCalledTimes(23);
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
      'matchRestored',
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

  it('keeps automatic reconnect failures silent', () => {
    const { socket, deps } = makeDeps({ silentConnectionErrors: true });
    registerMultiplayerSocketHandlers(deps);

    socket.trigger('connect_error', new Error('temporary outage'));

    expect(deps.cleanupConnection).toHaveBeenCalled();
    expect(deps.setMultiLoading).toHaveBeenCalledWith(false);
    expect(deps.setConnErrModal).not.toHaveBeenCalled();
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

  it('ignores room updates received while the local player is leaving', () => {
    const { socket, deps, state } = makeDeps({ leavingRoomRef: { current: true } });
    registerMultiplayerSocketHandlers(deps);

    socket.trigger('roomUpdated', {
      roomId: 'abc',
      owner: 'u2',
      isPrivate: false,
      players: [{ uuid: 'u2' }],
      count: 1,
      max: 12,
    });

    expect(state.roomModal).toBe(null);
    expect(deps.setRoomModal).not.toHaveBeenCalled();
    expect(deps.setOnlineOptionsModal).not.toHaveBeenCalled();
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

  it('restores an active match snapshot without replaying opening state', () => {
    const { socket, deps, state } = makeDeps();
    registerMultiplayerSocketHandlers(deps);
    const rawGs = {
      phase: 'ACTION',
      currentTurn: 1,
      players: [{ name: '房主' }, { name: '我' }],
      _visualEvents: [{ id: 'already-seen' }],
      log: ['historical action'],
    };

    socket.trigger('matchRestored', {
      roomId: 'room-1',
      owner: 'u1',
      isPrivate: true,
      players: [{ uuid: 'u1' }, { uuid: 'u2' }],
      count: 2,
      max: 12,
      playerIndex: 1,
      gs: rawGs,
      takeoverSeq: 3,
    });

    expect(state.isMultiplayer).toBe(true);
    expect(deps.isMultiplayerRef.current).toBe(true);
    expect(state.isDisconnected).toBe(false);
    expect(state.myPlayerIndex).toBe(1);
    expect(state.roomModal).toMatchObject({ roomId: 'room-1', count: 2 });
    expect(deps.mpAiTakeoverSeqRef.current).toBe(3);
    expect([...deps.consumedVisualEventIdsRef.current]).toEqual(['already-seen']);
    expect([...deps.completedMpHuntRevealPromptIdsRef.current]).toEqual([]);
    expect(deps.restoreVisibleLog).toHaveBeenCalledWith(rawGs.log, expect.objectContaining({currentTurn:0}));
    expect(deps.animQueueRef.current).toEqual([]);
    expect(deps.pendingGsRef.current).toBe(null);
    expect(deps.receivedGsRef.current).toBe(true);
    expect(deps.setRoleRevealAnim).toHaveBeenCalledWith(null);
    expect(deps.setGs).toHaveBeenCalledWith(expect.objectContaining({
      currentTurn: 0,
      players: [{ name: '我' }, { name: '房主' }],
    }));
  });

  it('starts a new game without retaining a previous session hunt completion', () => {
    const { socket, deps, state } = makeDeps();
    state.dismissedHuntRevealPromptId = 'old-session-prompt';
    registerMultiplayerSocketHandlers(deps);
    // This receiver is seat 1, so the host owns initialization and broadcasting.
    socket.trigger('gameStart', { roomId: 'new-room', players: [
      { uuid: 'u1', username: '房主' }, { uuid: 'u2', username: '我' },
    ] });
    expect([...deps.completedMpHuntRevealPromptIdsRef.current]).toEqual([]);
    expect(state.dismissedHuntRevealPromptId).toBe(null);
    expect(deps.setDismissedHuntRevealPromptId).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('reopens an authoritative restored wait after the same prompt was locally dismissed and claimed', () => {
    const promptId = 'restored-pending-hunt';
    const { socket, deps, state } = makeDeps({
      completedMpHuntRevealPromptIdsRef: { current: new Set([promptId]) },
    });
    state.dismissedHuntRevealPromptId = promptId;
    let adoptedGs;
    deps.setGs = vi.fn(next => {
      // Reset local speculation before adopting the server's pending decision.
      expect(state.dismissedHuntRevealPromptId).toBe(null);
      expect([...deps.completedMpHuntRevealPromptIdsRef.current]).toEqual([]);
      adoptedGs = next;
    });
    registerMultiplayerSocketHandlers(deps);

    socket.trigger('matchRestored', { roomId: 'room-1', playerIndex: 1,
      players: [{ uuid: 'u1' }, { uuid: 'u2' }],
      gs: { _isMP: true, phase: 'HUNT_WAIT_REVEAL', currentTurn: 0,
        players: [{ name: '追猎者' }, { name: '我' }],
        abilityData: { huntTi: 1, huntPromptId: promptId }, log: ['等待亮牌'] } });

    expect(deps.setDismissedHuntRevealPromptId).toHaveBeenCalledExactlyOnceWith(null);
    expect(getHuntRevealPromptId(adoptedGs)).toBe(promptId);
    expect(isResolvedMpHuntWaitState(adoptedGs, deps.completedMpHuntRevealPromptIdsRef.current)).toBe(false);
    expect(isLocalHuntTargetSeat(adoptedGs)).toBe(true);
    const ui = buildPhaseUiState({ gs: adoptedGs, phase: adoptedGs.phase,
      local: { huntTarget: isLocalHuntTargetSeat(adoptedGs) },
      isLocalHuntRevealPrompt: true,
      huntRevealPromptActive: getHuntRevealPromptId(adoptedGs) !== state.dismissedHuntRevealPromptId });
    expect(ui.phaseLabel).toContain('请选择一张手牌亮出（20秒）');
    expect(ui.isPhaseWarningText).toBe(true);
  });

  it('restores only the current confirmed hunt into the session guard before a stale wait can arrive', () => {
    const { socket, deps, state } = makeDeps();
    state.dismissedHuntRevealPromptId = 'restored-hunt';
    registerMultiplayerSocketHandlers(deps);
    const rawGs = { phase: 'HUNT_CONFIRM', currentTurn: 0,
      players: [{ name: '房主' }, { name: '我' }],
      abilityData: { huntTi: 1, huntPromptId: 'restored-hunt', revCard: { id: 'card' } },
      log: ['我亮出手牌'] };
    socket.trigger('matchRestored', { roomId: 'room-1', playerIndex: 1,
      players: [{ uuid: 'u1' }, { uuid: 'u2' }], gs: rawGs });
    expect([...deps.completedMpHuntRevealPromptIdsRef.current]).toEqual(['restored-hunt']);
    expect(state.dismissedHuntRevealPromptId).toBe(null);
    expect(deps.setDismissedHuntRevealPromptId).toHaveBeenCalledExactlyOnceWith(null);
    expect(deps.setGs).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'HUNT_CONFIRM', currentTurn: 1,
      abilityData: expect.objectContaining({ huntTi: 0, huntPromptId: 'restored-hunt' }),
    }));
  });

  it('keeps restoration compatible with callers that do not provide a hunt guard ref', () => {
    const { socket, deps } = makeDeps({ completedMpHuntRevealPromptIdsRef: undefined, setDismissedHuntRevealPromptId: undefined });
    registerMultiplayerSocketHandlers(deps);
    expect(() => socket.trigger('matchRestored', { roomId: 'room-1', playerIndex: 1,
      players: [{ uuid: 'u1' }, { uuid: 'u2' }], gs: { phase: 'HUNT_CONFIRM',
        currentTurn: 0, players: [{ name: '房主' }, { name: '我' }],
        abilityData: { huntTi: 1, huntPromptId: 'legacy-consumer' }, log: [] } })).not.toThrow();
  });

  it('resets multiplayer refs when AI takeover disconnects the player', () => {
    const { socket, deps, state } = makeDeps({ isMultiplayerRef: { current: true } });
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

  it('keeps a refused home-screen entry accessible without changing its identity', () => {
    const { socket, deps, state } = makeDeps({ latestGsRef: { current: null } });
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('aiTakeover', { reason: '座位已由 AI 接管' });
    expect(state.isDisconnected).toBe(false);
    expect(deps.setOnlineOptionsModal).toHaveBeenCalledWith(true);
    expect(state.roomModal).toBeNull();
    expect(deps.cleanupConnection).toHaveBeenCalled();
    expect(deps.setMultiLoading).toHaveBeenCalledWith(false);
    expect(deps.addToast).toHaveBeenCalledWith(expect.stringContaining('不能创建或加入'));
    expect(deps.playerUUIDRef.current).toBe('u2');
    expect(deps.setPlayerUUID).not.toHaveBeenCalled();
    expect(deps.setIdentityToken).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('retains the exit boundary for a repeated terminal packet until the old game view is cleared', () => {
    const { socket, deps, state } = makeDeps({ latestGsRef: { current: { phase: 'ACTION' } } });
    registerMultiplayerSocketHandlers(deps);
    socket.trigger('aiTakeover');
    socket.trigger('aiTakeover');
    expect(state.isDisconnected).toBe(true);
    expect(deps.setOnlineOptionsModal).toHaveBeenLastCalledWith(false);
    expect(deps.latestGsRef.current).toEqual({ phase: 'ACTION' });
  });

  it('ignores an old socket terminal result after a different connection owns the session', () => {
    const { socket, deps } = makeDeps({ isMultiplayerRef: { current: true } });
    registerMultiplayerSocketHandlers(deps);
    deps.socketRef.current = { connected: true };
    socket.trigger('aiTakeover', { reason: 'stale old connection' });
    expect(deps.isMultiplayerRef.current).toBe(true);
    expect(deps.setIsDisconnected).not.toHaveBeenCalled();
    expect(deps.setOnlineOptionsModal).not.toHaveBeenCalled();
    expect(deps.addToast).not.toHaveBeenCalled();
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
    expect(deps.gameOverPresentationFrozenRef.current).toBe(false);
    expect(socket.emit).not.toHaveBeenCalledWith('mpStateSync', expect.anything());
  });
});
