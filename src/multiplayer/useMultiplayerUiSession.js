import { useCallback, useEffect, useRef } from 'react';

export function shouldReconnectMultiplayerSession({
  visibilityState,
  gs,
  isMultiplayer,
  roomModal,
  multiLoading,
  socket,
}) {
  if (visibilityState !== 'visible') return false;
  const isWaitingRoom = !gs && !isMultiplayer;
  const isActiveMatch = isMultiplayer;
  if (!isWaitingRoom && !isActiveMatch) return false;
  if (!roomModal?.roomId) return false;
  if (multiLoading) return false;
  if (socket?.connected) return false;
  return true;
}

export function emitOpenOnlineOptions(socket, uuid, identityToken) {
  if (!socket) return false;
  socket.emit('openOnlineOptions', { uuid, identityToken });
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

export function useMultiplayerSessionReconnect({
  gs,
  isMultiplayerRef,
  roomModalRef,
  multiLoading,
  socketRef,
  setOnlineResourcesUnlocked,
  connectSocket,
  playerUUIDRef,
  playerUUID,
  identityTokenRef,
  identityToken,
  retryMs = 1500,
}) {
  const lastReconnectAttemptRef = useRef(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let retryTimer = null;

    const scheduleReconnect = (delay = 0) => {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(handleSessionReconnect, delay);
    };

    const handleSessionReconnect = () => {
      if (!shouldReconnectMultiplayerSession({
        visibilityState: document.visibilityState,
        gs,
        isMultiplayer: isMultiplayerRef.current,
        roomModal: roomModalRef.current,
        multiLoading,
        socket: socketRef.current,
      })) {
        return;
      }
      const elapsed = Date.now() - lastReconnectAttemptRef.current;
      if (elapsed < retryMs) {
        scheduleReconnect(retryMs - elapsed);
        return;
      }
      lastReconnectAttemptRef.current = Date.now();
      setOnlineResourcesUnlocked(true);
      connectSocket(socket => {
        emitOpenOnlineOptions(
          socket,
          playerUUIDRef.current || playerUUID,
          identityTokenRef.current || identityToken,
        );
      }, { silent: true });
      scheduleReconnect(retryMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleReconnect(0);
    };
    const handleOnline = () => scheduleReconnect(0);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    scheduleReconnect(0);
    return () => {
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [
    gs,
    multiLoading,
    playerUUID,
    identityToken,
    connectSocket,
    identityTokenRef,
    isMultiplayerRef,
    playerUUIDRef,
    roomModalRef,
    socketRef,
    setOnlineResourcesUnlocked,
    retryMs,
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
