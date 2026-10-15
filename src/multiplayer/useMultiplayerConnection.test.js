import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSocketIO } from '../utils/socketIoClient';
import { registerMultiplayerSocketHandlers } from './registerMultiplayerSocketHandlers';
import { useMultiplayerConnection } from './useMultiplayerConnection';

vi.mock('react', () => ({ useRef: value => ({ current: value }) }));
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
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('multiplayer connection attempt lifetime', () => {
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
