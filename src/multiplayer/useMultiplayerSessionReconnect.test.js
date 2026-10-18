import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMultiplayerSessionReconnect } from './useMultiplayerUiSession';

const hooks = vi.hoisted(() => ({ effect: null, refs: [], cursor: 0 }));
vi.mock('react', () => ({
  useRef: value => (hooks.refs[hooks.cursor++] ||= { current: value }),
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
  const listeners = new Map();
  return {
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
      target.addEventListener(name, callback);
    },
    removeEventListener(name, callback) {
      listeners.get(name)?.delete(callback);
      target.removeEventListener(name, callback);
    },
    listenerCount: name => listeners.get(name)?.size || 0,
    dispatch: (name, fields = {}) => target.dispatchEvent(Object.assign(new Event(name), fields)),
  };
}

function makeSocket(probeReply = true) {
  const handlers = new Map();
  return {
    handlers,
    connected: true,
    on: vi.fn((event, fn) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
    }),
    off: vi.fn((event, fn) => {
      const callbacks = handlers.get(event);
      callbacks?.delete(fn);
      if (!callbacks?.size) handlers.delete(event);
    }),
    emit: vi.fn((event, callback) => {
      if (event === 'heartbeatPong' && probeReply) callback(null, { ok: true });
    }),
    timeout: vi.fn(function () { return this; }),
    disconnect: vi.fn(),
    drop() { this.connected = false; handlers.get('disconnect')?.forEach(fn => fn('transport close')); },
  };
}

function setup({ probeReply = true } = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
  const document = { ...eventTarget(), visibilityState: 'visible' };
  const window = eventTarget();
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  const socket = makeSocket(probeReply);
  const { handlers } = socket;
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
  hooks.refs = [];
  const render = () => {
    cleanup?.();
    hooks.cursor = 0;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Execute the production effect and its browser/socket events.
    useMultiplayerSessionReconnect(args);
    cleanup = hooks.effect();
  };
  render();
  return { args, socket, document, window, handlers, render };
}

describe('multiplayer reconnect browser lifecycle', () => {
  it('retries five failed probe replacements without accumulating listeners or accepting old ACKs', async () => {
    const { args, socket, window, render } = setup({ probeReply: false });
    window.dispatch('pageshow', { persisted: true });
    await vi.advanceTimersByTimeAsync(2000);
    const staleAck = socket.emit.mock.calls[0][1];
    const failed = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(args.connectSocket).toHaveBeenCalledTimes(attempt);
      expect(args.connectSocket.mock.calls.at(-1)[1]).toEqual({ silent: true, preserveCurrentSocket: true });
      const candidate = makeSocket();
      failed.push(candidate);
      args.multiLoading = true;
      args.socketRef.current = candidate;
      render();
      await vi.advanceTimersByTimeAsync(5000);
      candidate.connected = false;
      args.socketRef.current = socket;
      args.multiLoading = false;
      staleAck(null, { ok: true });
      render();
      await vi.advanceTimersByTimeAsync(0);
      expect(socket.emit).toHaveBeenCalledOnce();
      expect(socket.handlers.get('disconnect').size).toBe(1);
      for (const old of failed) expect(old.handlers.size).toBe(0);
    }
    expect(args.connectSocket).toHaveBeenCalledTimes(6);
    args.socketRef.current = makeSocket();
    render();
    await vi.advanceTimersByTimeAsync(6000);
    expect(args.connectSocket).toHaveBeenCalledTimes(6);
    expect(socket.handlers.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps one listener per target through one hundred disconnects and foreground resumes', async () => {
    const { args, document, window, render } = setup();
    const retired = [];
    for (let round = 1; round <= 100; round++) {
      const previous = args.socketRef.current;
      previous.drop();
      await vi.advanceTimersByTimeAsync(0);
      if (args.connectSocket.mock.calls.length < round) await vi.advanceTimersByTimeAsync(1500);
      expect(args.connectSocket).toHaveBeenCalledTimes(round);
      const onConnected = args.connectSocket.mock.calls.at(-1)[0];
      const candidate = makeSocket();
      args.socketRef.current = candidate;
      args.multiLoading = true;
      render();
      args.identityTokenRef.current = `token-${round}`;
      onConnected(candidate);
      expect(candidate.emit).toHaveBeenCalledWith('openOnlineOptions', { uuid: 'me', identityToken: `token-${round}` });
      args.multiLoading = false;
      render();
      await vi.advanceTimersByTimeAsync(0);
      retired.push(previous);
      document.visibilityState = 'hidden';
      document.dispatch('visibilitychange');
      document.visibilityState = 'visible';
      document.dispatch('visibilitychange');
      await vi.advanceTimersByTimeAsync(0);
      for (let rerender = 0; rerender < 3; rerender++) render();
      await vi.advanceTimersByTimeAsync(0);
      expect(args.connectSocket).toHaveBeenCalledTimes(round);
      expect(candidate.emit.mock.calls.filter(([event]) => event === 'heartbeatPong')).toHaveLength(1);
      expect(candidate.handlers.get('disconnect').size).toBe(1);
      expect(document.listenerCount('visibilitychange')).toBe(1);
      for (const event of ['online', 'pagehide', 'pageshow']) expect(window.listenerCount(event)).toBe(1);
      for (const old of retired) {
        expect(old.handlers.size).toBe(0);
        old.drop();
      }
      expect(vi.getTimerCount()).toBe(0);
    }
    cleanup();
    cleanup = null;
    expect(document.listenerCount('visibilitychange')).toBe(0);
    for (const event of ['online', 'pagehide', 'pageshow']) expect(window.listenerCount(event)).toBe(0);
    expect(args.socketRef.current.handlers.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['visibilitychange', 'pagehide'])('does not reuse an acknowledged probe across a later %s interval', async hideEvent => {
    const { args, socket, document, window } = setup({ probeReply: false });
    window.dispatch('pageshow', { persisted: true });
    await vi.advanceTimersByTimeAsync(100);
    socket.emit.mock.calls[0][1](null, { ok: true });
    document.visibilityState = 'hidden';
    if (hideEvent === 'pagehide') window.dispatch('pagehide');
    else document.dispatch('visibilitychange');
    // The previous successful ACK is still waiting for its two-second check.
    vi.setSystemTime(Date.now() + 60_000);
    document.visibilityState = 'visible';
    if (hideEvent === 'pagehide') window.dispatch('pageshow', { persisted: true });
    else document.dispatch('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.emit).toHaveBeenCalledTimes(2);
    expect(args.connectSocket).not.toHaveBeenCalled();
    // This foreground interval has no reply, so the stale success cannot hide a blackhole.
    await vi.advanceTimersByTimeAsync(2000);
    expect(args.connectSocket).toHaveBeenCalledWith(expect.any(Function), {
      silent: true, preserveCurrentSocket: true,
    });
  });

  it('revalidates a connected socket after a hidden interval even if the transport timeout was suspended', async () => {
    const { args, socket, document, window } = setup({ probeReply: false });
    await vi.advanceTimersByTimeAsync(0);
    document.visibilityState = 'hidden';
    document.dispatch('visibilitychange');
    vi.setSystemTime(Date.now() + 60_000);
    document.visibilityState = 'visible';
    document.dispatch('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.connected).toBe(true);
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('heartbeatPong', expect.any(Function));
    expect(args.connectSocket).not.toHaveBeenCalled();
    document.dispatch('visibilitychange');
    window.dispatch('pageshow');
    window.dispatch('online');
    await vi.advanceTimersByTimeAsync(1999);
    expect(args.connectSocket).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(args.connectSocket).toHaveBeenCalledOnce();
  });

  it('keeps a healthy waiting guest on the same socket after background resume', async () => {
    const { args, socket, document } = setup();
    document.visibilityState = 'hidden';
    document.dispatch('visibilitychange');
    document.visibilityState = 'visible';
    document.dispatch('visibilitychange');
    await vi.advanceTimersByTimeAsync(2000);
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('heartbeatPong', expect.any(Function));
    expect(args.connectSocket).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('requests a replacement that preserves the guest seat when a healthy ACK takes 2100 ms', async () => {
    const { args, socket, window } = setup({ probeReply: false });
    socket.emit.mockImplementation((event, ack) => {
      if (event === 'heartbeatPong') setTimeout(() => ack(null, { ok: true }), 2100);
    });
    window.dispatch('pageshow', { persisted: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(args.connectSocket).toHaveBeenCalledWith(expect.any(Function), {
      silent: true, preserveCurrentSocket: true,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(args.connectSocket).toHaveBeenCalledOnce();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('retains a failed probe while replacing the socket and retries if the old socket is restored', async () => {
    const { args, socket, window, render } = setup({ probeReply: false });
    window.dispatch('pageshow', { persisted: true });
    await vi.advanceTimersByTimeAsync(2000);
    args.multiLoading = true;
    args.socketRef.current = { connected: false, on: vi.fn(), off: vi.fn() };
    render();
    await vi.advanceTimersByTimeAsync(5000);
    args.multiLoading = false;
    args.socketRef.current = socket;
    render();
    await vi.advanceTimersByTimeAsync(0);
    expect(args.connectSocket).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenCalledOnce();
  });

  it('does not accept a previous background interval ACK ahead of the suspended probe timer', async () => {
    const { args, socket, window, document } = setup({ probeReply: false });
    window.dispatch('pageshow', { persisted: true });
    await vi.advanceTimersByTimeAsync(0);
    document.visibilityState = 'hidden';
    document.dispatch('visibilitychange');
    vi.setSystemTime(Date.now() + 60_000);
    socket.emit.mock.calls[0][1](null, { ok: true });
    document.visibilityState = 'visible';
    document.dispatch('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.emit).toHaveBeenCalledTimes(2);
    expect(args.connectSocket).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(args.connectSocket).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
      silent: true, preserveCurrentSocket: true,
    });
  });

  it('does not extend an unanswered probe across renders or trust it after moving to another socket', async () => {
    const { args, socket, window, render } = setup({ probeReply: false });
    window.dispatch('pageshow', { persisted: true });
    await vi.advanceTimersByTimeAsync(1000);
    render();
    await vi.advanceTimersByTimeAsync(999);
    expect(socket.emit).toHaveBeenCalledOnce();
    expect(args.connectSocket).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(args.connectSocket).toHaveBeenCalledOnce();
    const delayedAck = socket.emit.mock.calls[0][1];
    args.socketRef.current = { connected: true, on: vi.fn(), off: vi.fn() };
    delayedAck(null, { ok: true });
    render();
    await vi.advanceTimersByTimeAsync(3000);
    expect(args.connectSocket).toHaveBeenCalledOnce();
  });

  it.each([null, { roomId: 'room-b' }])('discards a resume probe after leaving its room: %j', async room => {
    const { args, socket, window } = setup({ probeReply: false });
    window.dispatch('pageshow', { persisted: true });
    await vi.advanceTimersByTimeAsync(0);
    args.roomModalRef.current = room;
    socket.emit.mock.calls[0][1](new Error('late timeout'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(args.connectSocket).not.toHaveBeenCalled();
  });

  it('retains a persisted pageshow request until the page actually becomes visible', async () => {
    const { args, socket, document, window } = setup();
    await vi.advanceTimersByTimeAsync(0);
    document.visibilityState = 'hidden';
    window.dispatch('pagehide');
    window.dispatch('pageshow', { persisted: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(args.connectSocket).not.toHaveBeenCalled();
    document.visibilityState = 'visible';
    document.dispatch('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('heartbeatPong', expect.any(Function));
    await vi.advanceTimersByTimeAsync(2000);
    expect(args.connectSocket).not.toHaveBeenCalled();
  });

  it('does not replace a healthy visible connection on an ordinary pageshow', async () => {
    const { args, window } = setup();
    window.dispatch('pageshow');
    await vi.advanceTimersByTimeAsync(1500);
    expect(args.connectSocket).not.toHaveBeenCalled();
  });

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
