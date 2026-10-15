import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMultiplayerSessionReconnect } from './useMultiplayerUiSession';

const hooks = vi.hoisted(() => ({ effect: null }));
vi.mock('react', () => ({
  useRef: value => ({ current: value }),
  useEffect: effect => { hooks.effect = effect; },
  useCallback: callback => callback,
}));

let cleanup;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function eventTarget() {
  const target = new EventTarget();
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatch: name => target.dispatchEvent(new Event(name)),
  };
}

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
  const document = { ...eventTarget(), visibilityState: 'visible' };
  const window = eventTarget();
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  const handlers = new Map();
  const socket = {
    connected: true,
    on: vi.fn((event, fn) => handlers.set(event, fn)),
    off: vi.fn((event, fn) => { if (handlers.get(event) === fn) handlers.delete(event); }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    drop() { this.connected = false; handlers.get('disconnect')?.('transport close'); },
  };
  const args = {
    gs: null,
    isMultiplayerRef: { current: false },
    roomModalRef: { current: { roomId: 'room-a' } },
    multiLoading: false,
    socketRef: { current: socket },
    connectSocket: vi.fn(),
    playerUUIDRef: { current: 'me' },
    playerUUID: 'me',
    identityTokenRef: { current: 'token' },
    identityToken: 'token',
  };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Execute the production effect and its browser/socket events.
  useMultiplayerSessionReconnect(args);
  cleanup = hooks.effect();
  return { args, socket, document, window, handlers };
}

describe('multiplayer reconnect browser lifecycle', () => {
  it('reconnects a waiting room after a transport drop without an online event or rerender', async () => {
    const { args, socket } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(args.connectSocket).not.toHaveBeenCalled();
    socket.drop();
    await vi.advanceTimersByTimeAsync(0);
    expect(args.connectSocket).toHaveBeenCalledOnce();
    expect(args.connectSocket).toHaveBeenCalledWith(expect.any(Function), { silent: true });
  });

  it('wakes on pageshow and coalesces repeated foreground and online events', async () => {
    const { args, socket, document, window } = setup();
    document.visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(0);
    socket.connected = false;
    document.visibilityState = 'visible';
    window.dispatch('pageshow');
    await vi.advanceTimersByTimeAsync(0);
    expect(args.connectSocket).toHaveBeenCalledOnce();
    for (let i = 0; i < 4; i++) {
      window.dispatch('online');
      window.dispatch('pageshow');
      document.dispatch('visibilitychange');
    }
    await vi.advanceTimersByTimeAsync(1499);
    expect(args.connectSocket).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(args.connectSocket).toHaveBeenCalledTimes(2);
  });

  it.each([null, { roomId: 'room-b' }])('cancels an in-flight restore after leaving its room: %j', async room => {
    const { args, socket } = setup();
    socket.connected = false;
    await vi.advanceTimersByTimeAsync(0);
    const onConnected = args.connectSocket.mock.calls[0][0];
    args.roomModalRef.current = room;
    expect(onConnected(socket)).toBe(false);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('restores the same room with current credentials and removes listeners on cleanup', async () => {
    const { args, socket, document, window, handlers } = setup();
    socket.connected = false;
    await vi.advanceTimersByTimeAsync(0);
    args.identityTokenRef.current = 'latest-token';
    const onConnected = args.connectSocket.mock.calls[0][0];
    onConnected(socket);
    expect(socket.emit).toHaveBeenCalledWith('openOnlineOptions', { uuid: 'me', identityToken: 'latest-token' });
    cleanup();
    cleanup = null;
    expect(handlers.size).toBe(0);
    window.dispatch('online');
    window.dispatch('pageshow');
    document.dispatch('visibilitychange');
    socket.drop();
    await vi.advanceTimersByTimeAsync(6000);
    expect(args.connectSocket).toHaveBeenCalledOnce();
  });
});
