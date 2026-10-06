import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMultiplayerLobby } from '../useMultiplayerLobby';

const hooks = vi.hoisted(() => ({ current: null }));
vi.mock('react', () => ({
  useCallback: (...args) => hooks.current.useCallback(...args),
  useEffect: (...args) => hooks.current.useEffect(...args),
  useRef: (...args) => hooks.current.useRef(...args),
  useState: (...args) => hooks.current.useState(...args),
}));

// Match the existing node-environment hook tests: execute the production hook,
// retaining its state, refs, effect dependencies, and cleanup between renders.
function renderLobby(socketRef) {
  const slots = [];
  let cursor = 0;
  let output;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const runtime = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === 'function' ? initial() : initial };
        slot.set = next => { slot.value = typeof next === 'function' ? next(slot.value) : next; };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !same(previous.deps, deps)) {
        slots[index] = { deps, callback, cleanup: previous?.cleanup, pending: true };
      }
    },
  };
  const renderer = {
    get current() { return output; },
    flush() {
      cursor = 0;
      hooks.current = runtime;
      // eslint-disable-next-line react-hooks/rules-of-hooks -- This independent slot renderer simulates the React hook lifecycle.
      output = useMultiplayerLobby({ socketRef });
      slots.filter(slot => slot.pending).forEach(slot => {
        slot.pending = false;
        slot.cleanup?.();
        slot.cleanup = slot.callback();
      });
    },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
  renderer.flush();
  return renderer;
}

function fakeSocket() {
  const socket = { connected: true, emit: vi.fn(), disconnect: vi.fn() };
  socket.disconnect.mockImplementation(() => { socket.connected = false; });
  return socket;
}

const renderers = [];
function setup(socket = fakeSocket(), room = { roomId: 'TOE022-A', owner: 'toe022-uuid' }) {
  const socketRef = { current: socket };
  const renderer = renderLobby(socketRef);
  renderers.push(renderer);
  renderer.current.setPlayerUUID('toe022-uuid');
  renderer.current.setRoomModal(room);
  renderer.flush();
  return { socket, socketRef, renderer };
}

function leaveAck(socket) {
  expect(socket.emit).toHaveBeenCalledWith('leaveRoom', expect.any(Object), expect.any(Function));
  return socket.emit.mock.calls.find(call => call[0] === 'leaveRoom')[2];
}

beforeEach(() => {
  vi.useFakeTimers();
  const storage = { getItem: () => null };
  vi.stubGlobal('window', { location: { hostname: '127.0.0.1' }, sessionStorage: storage, localStorage: storage });
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  renderers.splice(0).forEach(renderer => renderer.unmount());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  hooks.current = null;
});

describe('TOE022 confirmed room exit', () => {
  it('captures the room before clearing the modal and waits for successful acknowledgement', () => {
    const { socket, socketRef, renderer } = setup();

    renderer.current.closeRoomModal();
    renderer.flush();

    expect(renderer.current.roomModal).toBeNull();
    expect(renderer.current.roomModalRef.current).toBeNull();
    expect(renderer.current.leavingRoomRef.current).toBe(true);
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith(
      'leaveRoom', { uuid: 'toe022-uuid', roomId: 'TOE022-A' }, expect.any(Function),
    );
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socketRef.current).toBe(socket);

    leaveAck(socket)({ ok: true });
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socketRef.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('falls back after 1200ms without an acknowledgement and ignores a late acknowledgement', () => {
    const { socket, socketRef, renderer } = setup();
    renderer.current.closeRoomModal();
    const acknowledge = leaveAck(socket);

    vi.advanceTimersByTime(1199);
    expect(socket.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socketRef.current).toBeNull();
    acknowledge({ ok: true });
    vi.advanceTimersByTime(2000);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the UI and falls back once when a retained socket is already disconnected', () => {
    const offlineSocket = fakeSocket();
    offlineSocket.connected = false;
    const { socket, socketRef, renderer } = setup(offlineSocket);
    const close = renderer.current.closeRoomModal;
    close();
    renderer.flush();

    expect(renderer.current.roomModal).toBeNull();
    expect(renderer.current.roomModalRef.current).toBeNull();
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith(
      'leaveRoom', { uuid: 'toe022-uuid', roomId: 'TOE022-A' }, expect.any(Function),
    );
    const acknowledge = leaveAck(socket);
    close();
    renderer.current.closeRoomModal();
    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socketRef.current).toBe(socket);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(1199);
    expect(socket.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socketRef.current).toBeNull();
    acknowledge({ ok: true });
    acknowledge({ ok: true });
    vi.advanceTimersByTime(2000);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    // No acknowledgement means this test makes no claim that the server removed the room.
  });

  it('makes repeated exit clicks on the pending socket idempotent before acknowledgement', () => {
    const { socket, renderer } = setup();
    const close = renderer.current.closeRoomModal;
    close();
    close();
    renderer.flush();
    renderer.current.closeRoomModal();

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    leaveAck(socket)({ ok: true });
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('preserves in-game server rejection followed by the existing disconnect path', () => {
    const { socket, socketRef, renderer } = setup(fakeSocket(), { roomId: 'TOE022-GAME', inGame: true });
    renderer.current.closeRoomModal();

    expect(socket.emit).toHaveBeenCalledExactlyOnceWith(
      'leaveRoom', { uuid: 'toe022-uuid', roomId: 'TOE022-GAME' }, expect.any(Function),
    );
    expect(socket.disconnect).not.toHaveBeenCalled();
    leaveAck(socket)({ ok: false, reason: 'room_in_game' });

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socketRef.current).toBeNull();
    expect(socket.emit.mock.calls.map(call => call[0])).toEqual(['leaveRoom']);
    expect(vi.getTimerCount()).toBe(0);
    // Seat retention, the reconnect grace period, and AI takeover remain server rules.
  });

  it('clears a room without a socket and schedules no fallback', () => {
    const { socketRef, renderer } = setup(null);
    renderer.current.closeRoomModal();
    renderer.flush();

    expect(renderer.current.roomModal).toBeNull();
    expect(renderer.current.roomModalRef.current).toBeNull();
    expect(socketRef.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, { roomId: '' }])('disconnects immediately without a room id (%j)', room => {
    const { socket, socketRef, renderer } = setup(fakeSocket(), room);
    renderer.current.closeRoomModal();
    renderer.flush();

    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socketRef.current).toBeNull();
    expect(renderer.current.roomModal).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let an old acknowledgement disconnect or release the guard for a replacement socket', () => {
    const { socket, socketRef, renderer } = setup();
    renderer.current.closeRoomModal();
    const oldAck = leaveAck(socket);
    const replacement = fakeSocket();
    socketRef.current = replacement;
    renderer.current.setRoomModal({ roomId: 'TOE022-B' });
    renderer.flush();
    renderer.current.closeRoomModal();
    const replacementAck = leaveAck(replacement);

    oldAck({ ok: true });
    renderer.current.closeRoomModal();
    expect(socketRef.current).toBe(replacement);
    expect(replacement.disconnect).not.toHaveBeenCalled();
    expect(replacement.emit).toHaveBeenCalledTimes(1);

    replacementAck({ ok: true });
    expect(replacement.disconnect).toHaveBeenCalledTimes(1);
    expect(socketRef.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a later socket to exit after an earlier exit has settled', () => {
    const { socket, socketRef, renderer } = setup();
    renderer.current.closeRoomModal();
    leaveAck(socket)({ ok: true });
    expect(renderer.current.leavingRoomRef.current).toBe(true);

    const replacement = fakeSocket();
    socketRef.current = replacement;
    renderer.current.setRoomModal({ roomId: 'TOE022-NEXT' });
    renderer.flush();
    renderer.current.closeRoomModal();

    expect(replacement.emit).toHaveBeenCalledExactlyOnceWith(
      'leaveRoom', { uuid: 'toe022-uuid', roomId: 'TOE022-NEXT' }, expect.any(Function),
    );
    expect(replacement.disconnect).not.toHaveBeenCalled();
    leaveAck(replacement)({ ok: true });
    expect(replacement.disconnect).toHaveBeenCalledTimes(1);
    expect(socketRef.current).toBeNull();
  });
});
