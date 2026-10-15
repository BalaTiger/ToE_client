import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSocketIO } from '../utils/socketIoClient';
import { registerMultiplayerSocketHandlers } from './registerMultiplayerSocketHandlers';
import { useMultiplayerConnection } from './useMultiplayerConnection';
import { useMultiplayerLobby } from '../hooks/useMultiplayerLobby';

vi.mock('react', () => ({
  useRef: value => ({ current: value }),
  useState: value => [typeof value === 'function' ? value() : value, vi.fn()],
  useEffect: vi.fn(),
  useCallback: callback => callback,
}));
vi.mock('../utils/socketIoClient', () => ({ loadSocketIO: vi.fn() }));
vi.mock('./registerMultiplayerSocketHandlers', () => ({ registerMultiplayerSocketHandlers: vi.fn() }));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup() {
  const deps = {
    isArtifact: false,
    multiLoading: false,
    socketRef: { current: null },
    serverUrl: 'http://127.0.0.1:3002',
    socketPath: '/socket.io',
    setMultiLoading: vi.fn(),
    setConnErrModal: vi.fn(),
    addToast: vi.fn(),
    handlerDeps: {},
  };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Execute the real async hook flow with stable refs.
  return { deps, ...useMultiplayerConnection(deps) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('multiplayer connection attempt lifetime', () => {
  it('cancels an unconnected replacement before leaving through the preserved room socket', async () => {
    const { deps, connectSocket, cancelConnection } = setup();
    const previous = { connected: true, disconnect: vi.fn(), emit: vi.fn((event, data, ack) => ack({ ok: true })) };
    const candidate = { connected: false, disconnect: vi.fn(), emit: vi.fn() };
    deps.socketRef.current = previous;
    loadSocketIO.mockResolvedValueOnce(() => candidate);
    await connectSocket(vi.fn(), { silent: true, preserveCurrentSocket: true });
    const lobby = useMultiplayerLobby({ socketRef: deps.socketRef, cancelConnection });
    lobby.roomModalRef.current = { roomId: 'room-a' };
    lobby.closeRoomModal({ retainExitIntent: true });
    expect(candidate.disconnect).toHaveBeenCalledOnce();
    expect(candidate.emit).not.toHaveBeenCalled();
    expect(previous.emit).toHaveBeenCalledWith('leaveRoom', expect.objectContaining({ roomId: 'room-a' }), expect.any(Function));
    expect(previous.disconnect).toHaveBeenCalledOnce();
    expect(deps.socketRef.current).toBeNull();
    await vi.advanceTimersByTimeAsync(6000);
    expect(deps.socketRef.current).toBeNull();
    expect(deps.setConnErrModal).not.toHaveBeenCalled();
  });

  it('leaves through the authenticated replacement even before its userInfo arrives', async () => {
    const { deps, connectSocket, cancelConnection } = setup();
    const previous = { connected: true, disconnect: vi.fn() };
    let leaveAck;
    const candidate = {
      connected: true,
      disconnect: vi.fn(),
      emit: vi.fn((event, data, ack) => { leaveAck = ack; }),
    };
    deps.socketRef.current = previous;
    loadSocketIO.mockResolvedValueOnce(() => candidate);
    await connectSocket(vi.fn(), { silent: true, preserveCurrentSocket: true });
    // The server has rebound the seat and disconnected the old socket, while userInfo is still in flight.
    previous.connected = false;
    const lobby = useMultiplayerLobby({ socketRef: deps.socketRef, cancelConnection });
    lobby.roomModalRef.current = { roomId: 'room-a' };
    lobby.closeRoomModal({ retainExitIntent: true });
    expect(candidate.emit).toHaveBeenCalledWith('leaveRoom', expect.objectContaining({ roomId: 'room-a' }), expect.any(Function));
    expect(candidate.disconnect).not.toHaveBeenCalled();
    leaveAck({ ok: true });
    expect(candidate.disconnect).toHaveBeenCalledOnce();
    expect(deps.socketRef.current).toBeNull();
    await vi.advanceTimersByTimeAsync(6000);
    expect(deps.socketRef.current).toBeNull();
    expect(deps.setConnErrModal).not.toHaveBeenCalled();
  });

  it('ignores a cancelled loader after immediately starting another connection', async () => {
    const script = deferred();
    const current = { disconnect: vi.fn() };
    loadSocketIO.mockReturnValueOnce(script.promise).mockResolvedValueOnce(() => current);
    const { deps, connectSocket, cancelConnection } = setup();
    const cancelled = connectSocket(vi.fn());
    cancelConnection();
    await connectSocket(vi.fn());
    const oldIo = vi.fn();
    script.resolve(oldIo);
    await cancelled;
    expect(oldIo).not.toHaveBeenCalled();
    expect(deps.socketRef.current).toBe(current);
    registerMultiplayerSocketHandlers.mock.calls[0][0].cleanupConnection();
    await vi.advanceTimersByTimeAsync(6000);
    expect(deps.setConnErrModal).not.toHaveBeenCalled();
  });

  it('keeps the previous connection until its replacement authenticates', async () => {
    const { deps, connectSocket } = setup();
    const previous = { connected: true, disconnect: vi.fn() };
    const next = { connected: true, disconnect: vi.fn() };
    deps.socketRef.current = previous;
    loadSocketIO.mockResolvedValueOnce(() => next);
    await connectSocket(vi.fn(), { silent: true, preserveCurrentSocket: true });
    expect(previous.disconnect).not.toHaveBeenCalled();
    expect(deps.socketRef.current).toBe(next);
    registerMultiplayerSocketHandlers.mock.calls[0][0].cleanupConnection();
    expect(previous.disconnect).toHaveBeenCalledOnce();
    expect(deps.socketRef.current).toBe(next);
  });

  it.each(['timeout', 'connect_error', 'script'])('restores the previous connection when replacement fails: %s', async failure => {
    const { deps, connectSocket } = setup();
    const previous = { connected: true, disconnect: vi.fn() };
    const next = { connected: false, disconnect: vi.fn() };
    deps.socketRef.current = previous;
    if (failure === 'script') loadSocketIO.mockRejectedValueOnce(new Error('offline'));
    else loadSocketIO.mockResolvedValueOnce(() => next);
    await connectSocket(vi.fn(), { silent: true, preserveCurrentSocket: true });
    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(5000);
    if (failure === 'connect_error') registerMultiplayerSocketHandlers.mock.calls[0][0].cleanupConnection(false);
    expect(deps.socketRef.current).toBe(previous);
    expect(previous.disconnect).not.toHaveBeenCalled();
    if (failure !== 'connect_error') expect(deps.setMultiLoading).toHaveBeenLastCalledWith(false);
  });

  it.each(['timeout', 'connect_error', 'cancel'])('does not restore an old socket that disconnected during replacement: %s', async failure => {
    const { deps, connectSocket, cancelConnection } = setup();
    const previous = { connected: true, disconnect: vi.fn() };
    const candidate = { connected: false, disconnect: vi.fn() };
    deps.socketRef.current = previous;
    loadSocketIO.mockResolvedValueOnce(() => candidate);
    await connectSocket(vi.fn(), { silent: true, preserveCurrentSocket: true });
    previous.connected = false;
    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(5000);
    if (failure === 'connect_error') registerMultiplayerSocketHandlers.mock.calls[0][0].cleanupConnection(false);
    if (failure === 'cancel') cancelConnection();
    expect(deps.socketRef.current).toBeNull();
  });

  it('allows immediate retry after closing online options before authentication finishes', async () => {
    const actual = await vi.importActual('./registerMultiplayerSocketHandlers');
    registerMultiplayerSocketHandlers.mockImplementation(actual.registerMultiplayerSocketHandlers);
    const createSocket = () => {
      const handlers = new Map();
      return {
        connected: false,
        on: vi.fn((event, handler) => handlers.set(event, handler)),
        emit: vi.fn(),
        fire(event) { if (event === 'connect') this.connected = true; handlers.get(event)?.(); },
        disconnect: vi.fn(function () {
          if (!this.connected) return;
          this.connected = false;
          handlers.get('disconnect')?.();
        }),
      };
    };
    const first = createSocket();
    const second = createSocket();
    loadSocketIO.mockResolvedValueOnce(() => first).mockResolvedValueOnce(() => second);
    const { deps, connectSocket } = setup();
    deps.handlerDeps.isMultiplayerRef = { current: false };
    deps.handlerDeps.leavingRoomRef = { current: false };
    const lobby = useMultiplayerLobby({ socketRef: deps.socketRef });
    await connectSocket(socket => socket.emit('openOnlineOptions'));
    first.fire('connect');
    await vi.advanceTimersByTimeAsync(1000);
    lobby.closeOnlineOptions();
    expect(deps.socketRef.current).toBeNull();
    await connectSocket(vi.fn());
    expect(deps.socketRef.current).toBe(second);
    registerMultiplayerSocketHandlers.mock.calls[1][0].cleanupConnection();
    await vi.advanceTimersByTimeAsync(6000);
    expect(deps.setConnErrModal).not.toHaveBeenCalled();
    expect(second.disconnect).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'])('expires a frozen script %s using wall-clock time before the delayed timer runs', async outcome => {
    const script = deferred();
    loadSocketIO.mockReturnValueOnce(script.promise);
    const { deps, connectSocket } = setup();
    const attempt = connectSocket(vi.fn());
    vi.setSystemTime(Date.now() + 20_000);
    const io = vi.fn(() => ({ disconnect: vi.fn() }));
    if (outcome === 'resolve') script.resolve(io);
    else script.reject(new Error('late failure'));
    await attempt;
    expect(io).not.toHaveBeenCalled();
    expect(deps.setConnErrModal).toHaveBeenCalledExactlyOnceWith(true);
    expect(deps.setMultiLoading).toHaveBeenLastCalledWith(false);
    expect(deps.addToast).not.toHaveBeenCalled();
  });

  it('rejects a late handshake event after suspended timers and keeps authenticated sessions alive', async () => {
    const expiredSocket = { disconnect: vi.fn() };
    const currentSocket = { disconnect: vi.fn() };
    loadSocketIO.mockResolvedValueOnce(() => expiredSocket).mockResolvedValueOnce(() => currentSocket);
    const { deps, connectSocket } = setup();
    await connectSocket(vi.fn());
    const expiredHandlers = registerMultiplayerSocketHandlers.mock.calls[0][0];
    vi.setSystemTime(Date.now() + 5000);
    expect(expiredHandlers.isConnectionActive()).toBe(false);
    expect(expiredSocket.disconnect).toHaveBeenCalledOnce();
    expect(deps.socketRef.current).toBeNull();

    await connectSocket(vi.fn());
    const currentHandlers = registerMultiplayerSocketHandlers.mock.calls[1][0];
    expect(currentHandlers.isConnectionActive()).toBe(true);
    currentHandlers.cleanupConnection();
    vi.setSystemTime(Date.now() + 60_000);
    expect(currentHandlers.isConnectionActive()).toBe(true);
    expect(currentSocket.disconnect).not.toHaveBeenCalled();
  });

  it('retires the previous socket before its synchronous disconnect can clean up a new attempt', async () => {
    const script = deferred();
    loadSocketIO.mockReturnValueOnce(script.promise);
    const { deps, connectSocket } = setup();
    const previous = { disconnect: vi.fn(() => expect(deps.socketRef.current).toBeNull()) };
    deps.socketRef.current = previous;
    const attempt = connectSocket(vi.fn());
    script.resolve(() => ({ disconnect: vi.fn() }));
    await attempt;
    expect(previous.disconnect).toHaveBeenCalledOnce();
  });

  it('does not connect when the script finishes after the connection timed out', async () => {
    const script = deferred();
    loadSocketIO.mockReturnValueOnce(script.promise);
    const { deps, connectSocket } = setup();
    const attempt = connectSocket(vi.fn());
    await vi.advanceTimersByTimeAsync(5000);
    expect(deps.setConnErrModal).toHaveBeenCalledWith(true);

    const io = vi.fn(() => ({ disconnect: vi.fn() }));
    script.resolve(io);
    await attempt;
    expect(io).not.toHaveBeenCalled();
    expect(deps.socketRef.current).toBeNull();
    expect(registerMultiplayerSocketHandlers).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'])('ignores an expired script %s during the next connection attempt', async outcome => {
    const oldScript = deferred();
    const newScript = deferred();
    loadSocketIO.mockReturnValueOnce(oldScript.promise).mockReturnValueOnce(newScript.promise);
    const { deps, connectSocket } = setup();
    const expired = connectSocket(vi.fn());
    await vi.advanceTimersByTimeAsync(5000);
    const current = connectSocket(vi.fn());
    const socket = { disconnect: vi.fn() };
    newScript.resolve(vi.fn(() => socket));
    await current;

    const staleIo = vi.fn(() => ({ disconnect: vi.fn() }));
    if (outcome === 'resolve') oldScript.resolve(staleIo);
    else oldScript.reject(new Error('old script failed'));
    await expired;
    expect(staleIo).not.toHaveBeenCalled();
    expect(deps.socketRef.current).toBe(socket);
    expect(deps.addToast).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(deps.socketRef.current).toBeNull();
    expect(deps.setConnErrModal).toHaveBeenCalledTimes(2);
  });
});
