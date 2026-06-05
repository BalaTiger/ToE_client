import { useCallback, useEffect, useRef, useState } from "react";

function useSyncedRef(value) {
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);
  return ref;
}

function isLocalTestHost() {
  if (typeof window === 'undefined') return false;
  const host = (window.location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function getMultiplayerIdentityStorage() {
  if (typeof window === 'undefined') return null;
  return isLocalTestHost() ? window.sessionStorage : window.localStorage;
}

const RESERVED_ROLE_NAMES = new Set(['寻宝者', '追猎者', '邪祀者']);
const RESERVED_ROLE_NAME_MESSAGE = '与游戏身份重复，请换一个名字';

export function useMultiplayerLobby({ socketRef }) {
  const [playerUUID, setPlayerUUID] = useState(() => {
    try { return getMultiplayerIdentityStorage()?.getItem('cthulhu_player_uuid') || null; }
    catch { return null; }
  });
  const playerUUIDRef = useSyncedRef(playerUUID);
  const [multiLoading, setMultiLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [roomModal, setRoomModal] = useState(null);
  const roomModalRef = useSyncedRef(roomModal);
  const [connErrModal, setConnErrModal] = useState(false);
  const [onlineOptionsModal, setOnlineOptionsModal] = useState(false);
  const [playerUsername, setPlayerUsername] = useState('');
  const [playerUsernameSpecial, setPlayerUsernameSpecial] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [renameCdActive, setRenameCdActive] = useState(false);
  const [renameInputVisible, setRenameInputVisible] = useState(false);
  const renameCdTimerRef = useRef(null);
  const [joinRoomInput, setJoinRoomInput] = useState('');
  const [lobbyModal, setLobbyModal] = useState(false);
  const [lobbyRooms, setLobbyRooms] = useState([]);
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [showPrivacyToggleConfirm, setShowPrivacyToggleConfirm] = useState(false);
  const [privacyWarnDontShow, setPrivacyWarnDontShow] = useState(false);
  const [skipPrivacyWarning, setSkipPrivacyWarning] = useState(() => {
    try { return localStorage.getItem('cthulhu_skip_privacy_warning') || false; }
    catch { return false; }
  });

  useEffect(() => () => {
    if (renameCdTimerRef.current) {
      clearTimeout(renameCdTimerRef.current);
      renameCdTimerRef.current = null;
    }
  }, []);

  const addToast = useCallback((text) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, text }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  function handleCreateRoom() {
    if (!socketRef.current) return;
    socketRef.current.emit('createRoom', { uuid: playerUUID });
    setMultiLoading(true);
  }

  function handleJoinRoom() {
    if (!socketRef.current) return;
    const rid = joinRoomInput.trim();
    if (!rid) {
      addToast('请输入房间号');
      return;
    }
    socketRef.current.emit('joinRoom', { uuid: playerUUID, roomId: rid });
    setMultiLoading(true);
  }

  function handleSetReady(ready) {
    if (!socketRef.current || !playerUUID) return;
    socketRef.current.emit('setReady', { uuid: playerUUID, ready });
  }

  function closeOnlineOptions() {
    setOnlineOptionsModal(false);
    if (renameCdTimerRef.current) {
      clearTimeout(renameCdTimerRef.current);
      renameCdTimerRef.current = null;
    }
    setRenameCdActive(false);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }

  function handleOpenLobby() {
    if (!socketRef.current) return;
    setLobbyLoading(true);
    socketRef.current.emit('getLobbyRooms');
    setLobbyModal(true);
  }

  function handleRefreshLobby() {
    if (!socketRef.current) return;
    setLobbyLoading(true);
    socketRef.current.emit('getLobbyRooms');
  }

  function handleJoinLobbyRoom(roomId) {
    if (!socketRef.current) return;
    socketRef.current.emit('joinRoom', { uuid: playerUUID, roomId });
    setMultiLoading(true);
    setLobbyModal(false);
  }

  function closeLobbyModal() {
    setLobbyModal(false);
  }

  function handleTogglePrivacy(isPrivate) {
    if (!socketRef.current || !roomModal) return;
    if (!isPrivate && !skipPrivacyWarning) {
      setPrivacyWarnDontShow(false);
      setShowPrivacyToggleConfirm(true);
    } else {
      socketRef.current.emit('toggleRoomPrivacy', { uuid: playerUUID, roomId: roomModal.roomId, isPrivate });
    }
  }

  function handleConfirmPrivacyToggle() {
    if (!socketRef.current || !roomModal) return;
    if (privacyWarnDontShow) {
      setSkipPrivacyWarning(true);
      try { localStorage.setItem('cthulhu_skip_privacy_warning', true); } catch { /* ignore */ }
    }
    socketRef.current.emit('toggleRoomPrivacy', { uuid: playerUUID, roomId: roomModal.roomId, isPrivate: false });
    setShowPrivacyToggleConfirm(false);
  }

  function handleCancelPrivacyToggle() {
    setShowPrivacyToggleConfirm(false);
  }

  function startRenameCooldown() {
    setRenameCdActive(true);
    renameCdTimerRef.current = setTimeout(() => {
      setRenameCdActive(false);
      renameCdTimerRef.current = null;
    }, 5000);
  }

  function handleRename() {
    if (renameCdActive || !socketRef.current) return;
    if (RESERVED_ROLE_NAMES.has(renameInput.trim())) {
      addToast(RESERVED_ROLE_NAME_MESSAGE);
      return;
    }
    socketRef.current.emit('renameUser', { uuid: playerUUID, newName: renameInput });
    startRenameCooldown();
  }

  function handleRandomUsername() {
    if (!socketRef.current) return;
    socketRef.current.emit('randomUsername', { uuid: playerUUID });
  }

  function closeRoomModal() {
    if (socketRef.current && roomModalRef.current?.roomId) {
      socketRef.current.emit('leaveRoom', { uuid: playerUUID, roomId: roomModalRef.current.roomId });
    }
    setRoomModal(null);
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }

  return {
    playerUUID,
    setPlayerUUID,
    playerUUIDRef,
    multiLoading,
    setMultiLoading,
    toasts,
    addToast,
    roomModal,
    setRoomModal,
    roomModalRef,
    connErrModal,
    setConnErrModal,
    onlineOptionsModal,
    setOnlineOptionsModal,
    playerUsername,
    setPlayerUsername,
    playerUsernameSpecial,
    setPlayerUsernameSpecial,
    renameInput,
    setRenameInput,
    renameCdActive,
    setRenameCdActive,
    renameInputVisible,
    setRenameInputVisible,
    joinRoomInput,
    setJoinRoomInput,
    lobbyModal,
    lobbyRooms,
    setLobbyRooms,
    lobbyLoading,
    setLobbyLoading,
    showPrivacyToggleConfirm,
    privacyWarnDontShow,
    setPrivacyWarnDontShow,
    handleCreateRoom,
    handleJoinRoom,
    handleSetReady,
    closeOnlineOptions,
    handleOpenLobby,
    handleRefreshLobby,
    handleJoinLobbyRoom,
    closeLobbyModal,
    handleTogglePrivacy,
    handleConfirmPrivacyToggle,
    handleCancelPrivacyToggle,
    handleRename,
    handleRandomUsername,
    closeRoomModal,
  };
}
