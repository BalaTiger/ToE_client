import { useRef } from 'react';
import { loadSocketIO } from '../utils/socketIoClient';
import { registerMultiplayerSocketHandlers } from './registerMultiplayerSocketHandlers';

export function useMultiplayerConnection({
  isArtifact,
  multiLoading,
  socketRef,
  serverUrl,
  socketPath,
  setMultiLoading,
  setConnErrModal,
  addToast,
  handlerDeps,
}) {
  const connTimeoutRef = useRef(null);
  const connectingRef = useRef(false);
  const cancelAttemptRef = useRef(null);

  async function connectSocket(onConnected, { silent = false, preserveCurrentSocket = false } = {}) {
    if (isArtifact) {
      if (!silent) addToast('联机功能在预览环境中不可用，请部署到服务器后使用');
      return;
    }
    if (multiLoading || connectingRef.current) return;
    connectingRef.current = true;
    setMultiLoading(true);
    let preservedSocket = null;
    if (socketRef.current) {
      const previousSocket = socketRef.current;
      socketRef.current = null;
      if (preserveCurrentSocket) preservedSocket = previousSocket;
      else previousSocket.disconnect();
    }
    if (connTimeoutRef.current) {
      clearTimeout(connTimeoutRef.current);
      connTimeoutRef.current = null;
    }

    const deadline = Date.now() + 5000;
    let pending = true;
    let expired = false;
    function settlePreviousConnection(success) {
      if (!preservedSocket) return;
      const previous = preservedSocket;
      preservedSocket = null;
      if (success) previous.disconnect();
      else socketRef.current = previous.connected ? previous : null;
    }
    function expireConnection(showError = true) {
      if (expired) return;
      expired = true;
      clearTimeout(connTimeoutRef.current);
      connTimeoutRef.current = null;
      if (socketRef.current) {
        const socket = socketRef.current;
        socketRef.current = null;
        socket.disconnect();
      }
      settlePreviousConnection(false);
      cancelAttemptRef.current = null;
      connectingRef.current = false;
      setMultiLoading(false);
      if (showError && !silent) setConnErrModal(true);
    }
    function isConnectionActive() {
      if (pending && Date.now() >= deadline) expireConnection();
      return !expired;
    }
    connTimeoutRef.current = setTimeout(expireConnection, 5000);
    cancelAttemptRef.current = () => {
      if (!socketRef.current?.connected) return expireConnection(false);
      // Keep the connected transport available for the caller's leaveRoom acknowledgement.
      expired = true;
      cleanupConnection();
      setMultiLoading(false);
    };

    let ioFn;
    try {
      ioFn = await loadSocketIO();
    } catch {
      if (!isConnectionActive()) return;
      clearTimeout(connTimeoutRef.current);
      connTimeoutRef.current = null;
      settlePreviousConnection(false);
      cancelAttemptRef.current = null;
      connectingRef.current = false;
      setMultiLoading(false);
      if (!silent) addToast('网络加载失败，请检查连接后重试');
      return;
    }
    if (!isConnectionActive()) return;

    const socket = ioFn(serverUrl, {
      path: socketPath,
      transports: ['polling', 'websocket'],
      reconnection: false,
    });
    socketRef.current = socket;

    function cleanupConnection(success = true) {
      pending = false;
      clearTimeout(connTimeoutRef.current);
      connTimeoutRef.current = null;
      settlePreviousConnection(success);
      cancelAttemptRef.current = null;
      connectingRef.current = false;
    }

    registerMultiplayerSocketHandlers({
      ...handlerDeps,
      socket,
      socketRef,
      serverUrl,
      socketPath,
      cleanupConnection,
      isConnectionActive,
      onConnected,
      setMultiLoading,
      setConnErrModal,
      addToast,
      silentConnectionErrors: silent,
    });
  }

  const cancelConnection = () => cancelAttemptRef.current?.();
  return { connectSocket, cancelConnection };
}
