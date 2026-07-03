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

  async function connectSocket(onConnected) {
    if (isArtifact) {
      addToast('联机功能在预览环境中不可用，请部署到服务器后使用');
      return;
    }
    if (multiLoading) return;
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
      setMultiLoading(false);
      setConnErrModal(true);
    }, 5000);

    let ioFn;
    try {
      ioFn = await loadSocketIO();
    } catch {
      clearTimeout(connTimeoutRef.current);
      connTimeoutRef.current = null;
      setMultiLoading(false);
      addToast('网络加载失败，请检查连接后重试');
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
    }

    registerMultiplayerSocketHandlers({
      ...handlerDeps,
      socket,
      socketRef,
      serverUrl,
      socketPath,
      cleanupConnection,
      onConnected,
    });
  }

  return { connectSocket };
}
