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
  connectSocket,
  playerUUIDRef,
  playerUUID,
  identityTokenRef,
  identityToken,
  retryMs = 1500,
}) {
  const lastReconnectAttemptRef = useRef(0);
  const backgroundedRef = useRef(false);
  const resumeReconnectRef = useRef(false);
  const resumeProbeRef = useRef(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let retryTimer = null;

    const scheduleReconnect = (delay = 0) => {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(handleSessionReconnect, delay);
    };

    const handleSessionReconnect = () => {
      const roomId = roomModalRef.current?.roomId;
      const socket = socketRef.current;
      const previousProbe = resumeProbeRef.current;
      if (multiLoading) return;
      if (!roomId || (previousProbe && (previousProbe.roomId !== roomId || previousProbe.socket !== socket))) {
        resumeReconnectRef.current = false;
        resumeProbeRef.current = null;
      }
      if (!shouldReconnectMultiplayerSession({
        visibilityState: document.visibilityState,
        gs,
        isMultiplayer: isMultiplayerRef.current,
        roomModal: roomModalRef.current,
        multiLoading,
        socket: resumeReconnectRef.current ? null : socket,
      })) {
        return;
      }
      if (socket?.connected) {
        if (!resumeProbeRef.current) {
          // Preserve healthy waiting-room guests: disconnecting them releases their seat.
          const probe = { socket, roomId, deadline: Date.now() + 2000, settled: false, ok: false };
          resumeProbeRef.current = probe;
          socket.timeout(2000).emit('heartbeatPong', (error, response) => {
            if (resumeProbeRef.current !== probe || Date.now() >= probe.deadline) return;
            probe.settled = true;
            probe.ok = !error && response?.ok === true;
          });
        }
        const probe = resumeProbeRef.current;
        if (probe.ok) {
          resumeReconnectRef.current = false;
          resumeProbeRef.current = null;
          return;
        }
        if (!probe.settled && Date.now() < probe.deadline) {
          scheduleReconnect(probe.deadline - Date.now());
          return;
        }
      }
      const elapsed = Date.now() - lastReconnectAttemptRef.current;
      if (elapsed < retryMs) {
        scheduleReconnect(retryMs - elapsed);
        return;
      }
      lastReconnectAttemptRef.current = Date.now();
      const preserveCurrentSocket = !!socket?.connected;
      if (!preserveCurrentSocket) {
        resumeReconnectRef.current = false;
        resumeProbeRef.current = null;
      }
      const reconnectRoomId = roomModalRef.current.roomId;
      connectSocket(socket => {
        if (roomModalRef.current?.roomId !== reconnectRoomId) return false;
        return emitOpenOnlineOptions(
          socket,
          playerUUIDRef.current || playerUUID,
          identityTokenRef.current || identityToken,
        );
      }, { silent: true, ...(preserveCurrentSocket ? { preserveCurrentSocket: true } : {}) });
      scheduleReconnect(retryMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        backgroundedRef.current = true;
        return;
      }
      if (backgroundedRef.current) resumeReconnectRef.current = true;
      backgroundedRef.current = false;
      scheduleReconnect(0);
    };
    const handleOnline = () => scheduleReconnect(0);
    const handlePageHide = () => { backgroundedRef.current = true; };
    const handlePageShow = event => {
      if (event.persisted || backgroundedRef.current) resumeReconnectRef.current = true;
      if (document.visibilityState === 'visible') backgroundedRef.current = false;
      scheduleReconnect(0);
    };
    const socket = socketRef.current;

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    socket?.on('disconnect', handleOnline);
    scheduleReconnect(0);
    return () => {
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      socket?.off('disconnect', handleOnline);
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
