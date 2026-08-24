import { EXPANSION_RANDOM_KEY, initGame } from '../game';
import { isLocalSeatIndex, rotateGsForViewer } from '../game/rotateState';
import { getMultiplayerIdentityStorage } from '../hooks/useMultiplayerLobby';
import { _getZoomCompensatedRect } from '../utils/dom';
import { FIRST_BATTLE_DONE_KEY, safeLS } from '../utils/runtime';

export function registerMultiplayerSocketHandlers({
  socket,
  socketRef,
  serverUrl,
  socketPath,
  cleanupConnection,
  onConnected,
  playerUUIDRef,
  setPlayerUUID,
  identityTokenRef,
  setIdentityToken,
  setPlayerUsername,
  setPlayerUsernameSpecial,
  setRenameInput,
  setMultiLoading,
  setConnErrModal,
  setOnlineOptionsModal,
  setRoomModal,
  leavingRoomRef,
  setLobbyLoading,
  setLobbyRooms,
  addToast,
  copyRoomIdToClipboard,
  setFirstBattleStarted,
  setOnlineResourcesUnlocked,
  setMyPlayerIndex,
  myPlayerIndexRef,
  setIsMultiplayer,
  isMultiplayerRef,
  setIsDisconnected,
  mpRoleRevealedRef,
  mpOpeningRoleRevealPendingRef,
  consumedVisualEventIdsRef,
  mpAiTakeoverSeqRef,
  pendingMpAiTakeoverRef,
  gameEndSentRef,
  gameOverPresentationFrozenRef,
  animQueueRef,
  pendingGsRef,
  setAnimExiting,
  clearDamageAnimations,
  setAnim,
  setGs,
  receivedGsRef,
  setRoleRevealAnim,
  startNextTurn,
  processIncomingMpStateSync,
  handleMpAiTakeover,
  setFlyingEmojis,
  discardPileRef,
  setServerAnnouncement,
  silentConnectionErrors = false,
}) {
  socket.on('connect_error', (err) => {
    cleanupConnection();
    setMultiLoading(false);
    console.error('[multiplayer connect_error]', serverUrl, socketPath, err?.message || err);
    if (!silentConnectionErrors) setConnErrModal(true);
    socket.disconnect();
  });

  socket.on('uuidAssigned', ({ uuid, identityToken }) => {
    setPlayerUUID(uuid);
    playerUUIDRef.current = uuid;
    setIdentityToken(identityToken);
    identityTokenRef.current = identityToken;
    try {
      const storage = getMultiplayerIdentityStorage();
      storage?.setItem('cthulhu_player_uuid', uuid);
      storage?.setItem('cthulhu_identity_token', identityToken);
    } catch { /* ignore */ }
  });

  socket.on('userInfo', ({ username, isSpecialName, wasForceReset, waitingRoomExpired }) => {
    setPlayerUsername(username);
    setPlayerUsernameSpecial(!!isSpecialName);
    setRenameInput(username);
    cleanupConnection();
    setMultiLoading(false);
    if (waitingRoomExpired) {
      setRoomModal(null);
      setOnlineOptionsModal(true);
      addToast('由于你长时间离开页面，您已离线，请重新创建房间。');
    }
    if (wasForceReset) {
      addToast('您上次在游戏房间强制下线，已退出房间');
    }
  });

  socket.on('renameSuccess', ({ username, isSpecialName }) => {
    setPlayerUsername(username);
    setPlayerUsernameSpecial(!!isSpecialName);
    setRenameInput(username);
  });

  socket.on('randomUsernameResult', ({ username }) => {
    setRenameInput(username);
  });

  socket.on('renameError', ({ msg }) => {
    addToast(msg);
  });

  socket.on('roomCreated', ({ roomId, owner, isPrivate, players, count, max, countdown }) => {
    leavingRoomRef.current = false;
    setMultiLoading(false);
    setOnlineOptionsModal(false);
    copyRoomIdToClipboard(roomId, { created: true });
    setRoomModal({ roomId, owner, isPrivate, players, count: count || 1, max: max || 12, countdown: countdown || null });
  });

  socket.on('roomUpdated', ({ roomId, owner, isPrivate, players, count, max, countdown }) => {
    if (leavingRoomRef.current) return;
    setMultiLoading(false);
    setOnlineOptionsModal(false);
    setRoomModal(prev => prev
      ? { ...prev, roomId, owner, isPrivate, players, count: count ?? prev.count, max: max ?? prev.max, countdown: countdown !== undefined ? countdown : prev.countdown }
      : { roomId, owner, isPrivate, players, count: count || players.length, max: max || 12, countdown: countdown || null });
  });

  socket.on('joinError', ({ msg }) => {
    setMultiLoading(false);
    addToast(msg);
  });

  socket.on('kickedFromRoom', ({ reason }) => {
    setRoomModal(null);
    addToast(reason || '你已被踢出房间');
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  });

  socket.on('roomClosed', ({ reason }) => {
    setRoomModal(null);
    setOnlineOptionsModal(true);
    addToast(reason || '房间已失效，请重新创建房间。');
  });

  socket.on('lobbyRooms', ({ rooms }) => {
    setLobbyLoading(false);
    setLobbyRooms(rooms || []);
  });

  socket.on('gameStart', ({ roomId, players, expansionPlan }) => {
    setFirstBattleStarted(true);
    safeLS.set(FIRST_BATTLE_DONE_KEY, '1');
    setOnlineResourcesUnlocked(true);
    const myIdx = players.findIndex(p => p.uuid === playerUUIDRef.current);
    const safeIdx = myIdx < 0 ? 0 : myIdx;
    myPlayerIndexRef.current = safeIdx;
    setMyPlayerIndex(safeIdx);
    const resetPlayers = players.map(p => ({ ...p, ready: false }));
    setRoomModal(prev => prev ? { ...prev, players: resetPlayers, countdown: null } : { roomId, players: resetPlayers, count: players.length, max: 12, countdown: null, owner: null, isPrivate: true });
    setIsMultiplayer(true);
    isMultiplayerRef.current = true;
    setIsDisconnected(false);
    addToast('多人游戏开始！');
    mpRoleRevealedRef.current = false;
    mpOpeningRoleRevealPendingRef.current = false;
    consumedVisualEventIdsRef.current = new Set();
    mpAiTakeoverSeqRef.current = 0;
    pendingMpAiTakeoverRef.current = null;
    gameEndSentRef.current = false;
    if (gameOverPresentationFrozenRef) gameOverPresentationFrozenRef.current = false;
    if (isLocalSeatIndex(safeIdx)) {
      const names = players.map(p => p.username);
      const mpExpansionKey = expansionPlan || EXPANSION_RANDOM_KEY;
      const rawGs = initGame(
        names,
        null,
        null,
        'auto',
        null,
        null,
        null,
        null,
        startNextTurn,
        mpExpansionKey,
      );
      animQueueRef.current = [];
      pendingGsRef.current = null;
      setAnimExiting(false);
      clearDamageAnimations();
      setAnim(null);
      const rotatedGs = rotateGsForViewer(rawGs, 0);
      receivedGsRef.current = true;
      mpRoleRevealedRef.current = true;
      setGs({ ...rotatedGs, phase: 'ACTION', drawReveal: null, abilityData: {} });
      setAnim(null);
      mpOpeningRoleRevealPendingRef.current = true;
      setRoleRevealAnim({ role: rotatedGs.players[0].role, pendingGs: rotatedGs });
      socket.emit('mpStateSync', { roomId, gs: rawGs });
    }
  });

  socket.on('matchRestored', ({
    roomId,
    owner,
    isPrivate,
    players,
    count,
    max,
    playerIndex,
    gs: rawGs,
    takeoverSeq,
  }) => {
    const safePlayers = Array.isArray(players) ? players : [];
    const safeIdx = Number.isInteger(playerIndex) && playerIndex >= 0 ? playerIndex : 0;
    setFirstBattleStarted(true);
    safeLS.set(FIRST_BATTLE_DONE_KEY, '1');
    setOnlineResourcesUnlocked(true);
    setRoomModal({
      roomId,
      owner,
      isPrivate: !!isPrivate,
      players: safePlayers,
      count: count ?? safePlayers.length,
      max: max || 12,
      countdown: null,
    });
    myPlayerIndexRef.current = safeIdx;
    setMyPlayerIndex(safeIdx);
    setIsMultiplayer(true);
    isMultiplayerRef.current = true;
    setIsDisconnected(false);
    mpRoleRevealedRef.current = true;
    mpOpeningRoleRevealPendingRef.current = false;
    mpAiTakeoverSeqRef.current = takeoverSeq || 0;
    pendingMpAiTakeoverRef.current = null;
    consumedVisualEventIdsRef.current = new Set(
      (rawGs?._visualEvents || []).map(event => event?.id).filter(Boolean),
    );
    animQueueRef.current = [];
    pendingGsRef.current = null;
    setAnimExiting(false);
    clearDamageAnimations();
    setAnim(null);
    setRoleRevealAnim(null);
    if (gameOverPresentationFrozenRef) gameOverPresentationFrozenRef.current = false;
    if (rawGs) {
      receivedGsRef.current = true;
      setGs(rotateGsForViewer(rawGs, safeIdx));
    }
    addToast('连接已恢复，已返回当前对局');
  });

  socket.on('mpStateSync', ({ gs: rawGs }) => {
    processIncomingMpStateSync(rawGs);
  });

  socket.on('mpAiTakeover', (payload) => {
    if (!payload) return;
    if (payload.seq && payload.seq <= mpAiTakeoverSeqRef.current) return;
    if (payload.seq) mpAiTakeoverSeqRef.current = payload.seq;
    handleMpAiTakeover(payload);
  });

  socket.on('emojiReceived', ({ fromUuid, emojis }) => {
    emojis.forEach((emoji, i) => {
      setTimeout(() => {
        const isSelf = fromUuid === playerUUIDRef.current;
        let sx;
        let sy;
        if (isSelf) {
          const handRect = _getZoomCompensatedRect(document.querySelector('[data-hand-area]'));
          if (handRect) {
            sx = handRect.left + handRect.width / 2;
            sy = handRect.top + handRect.height * 0.3;
          } else {
            sx = window.innerWidth * 0.15;
            sy = window.innerHeight * 0.85;
          }
        } else {
          sx = window.innerWidth * 0.1 + Math.random() * window.innerWidth * 0.5;
          sy = 60 + Math.random() * 40;
        }
        const dp = _getZoomCompensatedRect(discardPileRef.current);
        const ex = dp ? dp.left + dp.width / 2 : window.innerWidth / 2;
        const ey = dp ? dp.top + dp.height / 2 : window.innerHeight * 0.45;
        const rand = (v, pct) => v * (1 + (Math.random() * 2 - 1) * pct);
        const arc = rand(window.innerHeight * 0.10, 0.20);
        const dur = rand(900, 0.20);
        const jx = ex + rand(18, 0.20);
        const jy = ey + rand(12, 0.20);
        const uid = `${Date.now()}-${Math.random()}`;
        setFlyingEmojis(prev => [...prev, { id: uid, emoji, startX: sx, startY: sy, endX: jx, endY: jy, arcHeight: arc, durationMs: dur }]);
      }, i * 80);
    });
  });

  socket.on('heartbeatPing', () => {
    if (socketRef.current) socketRef.current.emit('heartbeatPong');
  });

  socket.on('serverAnnouncement', ({ announcement }) => {
    setServerAnnouncement(announcement || null);
  });

  socket.on('aiTakeover', ({ reason } = {}) => {
    setIsDisconnected(true);
    setIsMultiplayer(false);
    isMultiplayerRef.current = false;
    setMyPlayerIndex(0);
    myPlayerIndexRef.current = 0;
    mpRoleRevealedRef.current = false;
    consumedVisualEventIdsRef.current = new Set();
    pendingMpAiTakeoverRef.current = null;
    if (reason) addToast(reason);
  });

  socket.on('disconnect', () => {
    if (isMultiplayerRef.current) setIsDisconnected(true);
  });

  socket.on('serverError', (msg) => {
    cleanupConnection();
    setMultiLoading(false);
    addToast(`错误：${msg}`);
  });

  socket.on('connect', () => {
    onConnected(socket);
  });
}
