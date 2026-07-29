import { describe, expect, it, vi } from 'vitest';
import {
  emitEmojiSend,
  emitOpenOnlineOptions,
  shouldReconnectWaitingRoom,
} from './useMultiplayerUiSession';

describe('useMultiplayerUiSession helpers', () => {
  it('reconnects only when a waiting room is visible and disconnected', () => {
    expect(shouldReconnectWaitingRoom({
      visibilityState: 'visible',
      gs: null,
      isMultiplayer: false,
      roomModal: { roomId: 'room-1' },
      multiLoading: false,
      socket: null,
    })).toBe(true);

    expect(shouldReconnectWaitingRoom({
      visibilityState: 'hidden',
      gs: null,
      isMultiplayer: false,
      roomModal: { roomId: 'room-1' },
      multiLoading: false,
      socket: null,
    })).toBe(false);
    expect(shouldReconnectWaitingRoom({
      visibilityState: 'visible',
      gs: { phase: 'ACTION' },
      isMultiplayer: false,
      roomModal: { roomId: 'room-1' },
      multiLoading: false,
      socket: null,
    })).toBe(false);
    expect(shouldReconnectWaitingRoom({
      visibilityState: 'visible',
      gs: null,
      isMultiplayer: true,
      roomModal: { roomId: 'room-1' },
      multiLoading: false,
      socket: null,
    })).toBe(false);
    expect(shouldReconnectWaitingRoom({
      visibilityState: 'visible',
      gs: null,
      isMultiplayer: false,
      roomModal: null,
      multiLoading: false,
      socket: null,
    })).toBe(false);
    expect(shouldReconnectWaitingRoom({
      visibilityState: 'visible',
      gs: null,
      isMultiplayer: false,
      roomModal: { roomId: 'room-1' },
      multiLoading: true,
      socket: null,
    })).toBe(false);
    expect(shouldReconnectWaitingRoom({
      visibilityState: 'visible',
      gs: null,
      isMultiplayer: false,
      roomModal: { roomId: 'room-1' },
      multiLoading: false,
      socket: { connected: true },
    })).toBe(false);
  });

  it('emits openOnlineOptions with the resolved uuid', () => {
    const socket = { emit: vi.fn() };

    expect(emitOpenOnlineOptions(socket, 'u1', 'token-1')).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith('openOnlineOptions', {
      uuid: 'u1',
      identityToken: 'token-1',
    });
    expect(emitOpenOnlineOptions(null, 'u1')).toBe(false);
  });

  it('emits one emoji payload when a socket and room are available', () => {
    const socket = { emit: vi.fn() };

    expect(emitEmojiSend({
      socket,
      playerUUID: 'u1',
      roomId: 'room-1',
      emoji: ':fire:',
    })).toBe(true);

    expect(socket.emit).toHaveBeenCalledWith('emojiSend', {
      uuid: 'u1',
      roomId: 'room-1',
      emojis: [':fire:'],
    });
    expect(emitEmojiSend({ socket: null, playerUUID: 'u1', roomId: 'room-1', emoji: ':fire:' })).toBe(false);
    expect(emitEmojiSend({ socket, playerUUID: 'u1', roomId: '', emoji: ':fire:' })).toBe(false);
  });
});
