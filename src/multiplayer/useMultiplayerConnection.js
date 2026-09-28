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

  async function connectSocket(onConnected, { silent = false } = {}) {
    if (isArtifact) {
      if (!silent) addToast('联机功能在预览环境中不可用，请部署到服务器后使用');
      return;
    }
    if (multiLoading || connectingRef.current) return;
    connectingRef.current = true;
    setMultiLoading(true);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (connTimeoutRef.current) {
      clearTimeout(connTimeoutRef.current);
      connTimeoutRef.current = null;
    }

    connTimeoutRef.current = setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      connectingRef.current = false;
      setMultiLoading(false);
      if (!silent) setConnErrModal(true);
    }, 5000);

    let ioFn;
    try {
      ioFn = await loadSocketIO();
    } catch {
      clearTimeout(connTimeoutRef.current);
      connTimeoutRef.current = null;
      connectingRef.current = false;
      setMultiLoading(false);
      if (!silent) addToast('网络加载失败，请检查连接后重试');
      return;
    }

    const socket = ioFn(serverUrl, {
      path: socketPath,
      transports: ['polling', 'websocket'],
      reconnection: false,
    });
    socketRef.current = socket;

    function cleanupConnection() {
      clearTimeout(connTimeoutRef.current);
      connTimeoutRef.current = null;
      connectingRef.current = false;
    }

    registerMultiplayerSocketHandlers({
      ...handlerDeps,
      socket,
      socketRef,
      serverUrl,
      socketPath,
      cleanupConnection,
      onConnected,
      setMultiLoading,
      setConnErrModal,
      addToast,
      silentConnectionErrors: silent,
    });
  }

  return { connectSocket };
}
