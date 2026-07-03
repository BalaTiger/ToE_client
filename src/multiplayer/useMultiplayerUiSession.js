import { useCallback, useEffect, useRef } from 'react';

export function shouldReconnectWaitingRoom({
  visibilityState,
  gs,
  isMultiplayer,
  roomModal,
  multiLoading,
  socket,
}) {
  if (visibilityState !== 'visible') return false;
  if (gs || isMultiplayer) return false;
  if (!roomModal?.roomId) return false;
  if (multiLoading) return false;
  if (socket?.connected) return false;
  return true;
}

export function emitOpenOnlineOptions(socket, uuid) {
  if (!socket) return false;
  socket.emit('openOnlineOptions', { uuid });
  return true;
}

export function emitEmojiSend({ socket, playerUUID, roomId, emoji }) {
  if (!socket || !roomId) return false;
  socket.emit('emojiSend', {
    uuid: playerUUID,
    roomId,
    emojis: [emoji],
  });
  return true;
}

export function useWaitingRoomReconnect({
  gs,
  isMultiplayerRef,
  roomModalRef,
  multiLoading,
  socketRef,
  setOnlineResourcesUnlocked,
  connectSocket,
  playerUUIDRef,
  playerUUID,
}) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleWaitingRoomReconnect = () => {
      if (!shouldReconnectWaitingRoom({
        visibilityState: document.visibilityState,
        gs,
        isMultiplayer: isMultiplayerRef.current,
        roomModal: roomModalRef.current,
        multiLoading,
        socket: socketRef.current,
      })) {
        return;
      }
      setOnlineResourcesUnlocked(true);
      connectSocket(socket => {
        emitOpenOnlineOptions(socket, playerUUIDRef.current || playerUUID);
      });
    };
    document.addEventListener('visibilitychange', handleWaitingRoomReconnect);
    return () => document.removeEventListener('visibilitychange', handleWaitingRoomReconnect);
  }, [
    gs,
    multiLoading,
    playerUUID,
    connectSocket,
    isMultiplayerRef,
    playerUUIDRef,
    roomModalRef,
    socketRef,
    setOnlineResourcesUnlocked,
  ]);
}

export function useMultiplayerEmojiSender({
  socketRef,
  roomModalRef,
  playerUUIDRef,
  debounceMs = 300,
}) {
  const emojiClickDebounceRef = useRef(false);
  const emojiClickTimerRef = useRef(null);

  useEffect(() => () => {
    clearTimeout(emojiClickTimerRef.current);
  }, []);

  return useCallback((emoji) => {
    if (emojiClickDebounceRef.current) return false;
    emojiClickDebounceRef.current = true;
    clearTimeout(emojiClickTimerRef.current);
    emojiClickTimerRef.current = setTimeout(() => {
      emojiClickDebounceRef.current = false;
      emojiClickTimerRef.current = null;
    }, debounceMs);

    return emitEmojiSend({
      socket: socketRef.current,
      playerUUID: playerUUIDRef.current,
      roomId: roomModalRef.current?.roomId,
      emoji,
    });
  }, [debounceMs, playerUUIDRef, roomModalRef, socketRef]);
}
