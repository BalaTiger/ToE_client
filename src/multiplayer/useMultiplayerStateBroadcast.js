import { useEffect, useRef } from 'react';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../game/coreUtils';
import { derotateGs } from '../game/rotateState';
import { pruneConsumedVisualEvents } from '../game/visualEvents';

const WINNER_ROLES = new Set([ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST, 'LOSE_ALL']);

export function getMultiplayerWinnerRole(gameOver) {
  return WINNER_ROLES.has(gameOver?.winner) ? gameOver.winner : null;
}

export function isPlayerWinBroadcastPhase(gs) {
  return gs?.phase === 'PLAYER_WIN_PENDING' || gs?.phase === 'TREASURE_WIN';
}

export function isEndTurnReplayDecisionState(gs) {
  return !!(
    gs?._endTurnReplay && (
      (gs.phase === 'DRAW_REVEAL' && gs.drawReveal?.fromEndTurnReplay) ||
      (gs.phase === 'GOD_CHOICE' && gs.abilityData?.fromEndTurnReplay)
    )
  );
}

export function shouldSuppressNormalStateBroadcast(gs) {
  if (!gs) return true;
  if (gs.gameOver) return true;
  if (gs.phase === 'MP_PLAYER_WIN_WAIT') return true;
  if (gs.phase === 'SWAP_STEAL_CARD' || gs.phase === 'SWAP_GIVE_CARD') return true;
  if (gs._mpEndTurn || gs._mpAutoDiscard || gs._mpAutoCthDecision) return true;
  return !!(gs._endTurnReplay && !isEndTurnReplayDecisionState(gs));
}

export function buildPlayerWinWaitState(gs) {
  return {
    ...gs,
    phase: 'MP_PLAYER_WIN_WAIT',
    drawReveal: null,
    abilityData: {
      ...(gs?.abilityData || {}),
      winnerIdx: 0,
      waitingForTreasureReveal: true,
    },
  };
}

export function buildPlayerWinWaitBroadcast({ gs, room, myPlayerIndex }) {
  if (!gs || !room?.roomId) return null;
  const waitGs = buildPlayerWinWaitState(gs);
  return {
    roomId: room.roomId,
    rawGs: derotateGs(waitGs, myPlayerIndex),
    clearLocalVisualEvents: false,
    freshVisualEvents: [],
  };
}

export function buildNormalStateBroadcast({ gs, room, myPlayerIndex, consumedVisualEventIds }) {
  if (!gs || !room?.roomId || shouldSuppressNormalStateBroadcast(gs)) return null;
  const hasVisualEvents = Array.isArray(gs._visualEvents) && gs._visualEvents.length > 0;
  const broadcastGs = hasVisualEvents ? pruneConsumedVisualEvents(gs, consumedVisualEventIds) : gs;
  const freshVisualEvents = Array.isArray(broadcastGs._visualEvents) ? broadcastGs._visualEvents : [];
  return {
    roomId: room.roomId,
    rawGs: derotateGs(broadcastGs, myPlayerIndex),
    clearLocalVisualEvents: hasVisualEvents,
    freshVisualEvents,
  };
}

export function emitMultiplayerGameEnd({ socket, gs, playerUUID, roomId, myPlayerIndex, onAcknowledged }) {
  if (!socket?.connected || !gs?.gameOver) return false;
  // Socket.IO preserves packet order. Publish the terminal snapshot while the
  // room is still in-game, then close the match. Reversing these two packets
  // lets a stale terminal snapshot repopulate an already-reset waiting room.
  socket.emit('mpStateSync', {
    roomId,
    ...(gs._mpMatchId ? { matchId: gs._mpMatchId } : {}),
    gs: derotateGs(gs, myPlayerIndex),
  });
  const payload = {
    uuid: playerUUID,
    roomId,
    ...(gs._mpMatchId ? { matchId: gs._mpMatchId } : {}),
    winnerRole: getMultiplayerWinnerRole(gs.gameOver),
  };
  if (onAcknowledged) socket.timeout(2000).emit('gameEnd', payload, (error, result) => onAcknowledged(error ? null : result));
  else socket.emit('gameEnd', payload);
  return true;
}

export function emitMultiplayerStateBroadcast({ socket, broadcast }) {
  if (!socket || !broadcast) return false;
  socket.emit('mpStateSync', {
    roomId: broadcast.roomId,
    ...(broadcast.rawGs._mpMatchId ? { matchId: broadcast.rawGs._mpMatchId } : {}),
    gs: broadcast.rawGs,
  });
  return true;
}

export function useMultiplayerStateBroadcast({
  gs,
  setGs,
  isMultiplayer,
  playerUUID,
  roomModal,
  socketRef,
  myPlayerIndexRef,
  gameEndSentRef,
  receivedGsRef,
  latestGsRef,
  consumedVisualEventIdsRef,
  anim,
  animExiting,
  showTutorial,
  animQueueRef,
  pendingGsRef,
}) {
  const roomId = roomModal?.roomId;
  const matchId = gs?._mpMatchId;
  const roomConfirmed = !!matchId && roomModal?.matchId === matchId && roomModal?.inGame === false;
  const returnRequestRef = useRef(null);
  const retrySettlementRef = useRef(null);

  function finishRequestedReturn() {
    const request = returnRequestRef.current;
    if (request?.matchId !== matchId || request.roomId !== roomId || !request.callback) return;
    const callback = request.callback;
    request.callback = null;
    callback();
  }

  function requestReturnToRoom(onConfirmed) {
    if (!isMultiplayer || !gs?.gameOver || !roomId || !matchId) return false;
    if (returnRequestRef.current?.matchId !== matchId || returnRequestRef.current?.roomId !== roomId) {
      returnRequestRef.current = { matchId, roomId, callback: onConfirmed };
    }
    if (gameEndSentRef.current || roomConfirmed) {
      finishRequestedReturn();
      return true;
    }
    retrySettlementRef.current?.();
    return false;
  }

  useEffect(() => {
    if (!isMultiplayer || !gs?.gameOver || !roomId || !matchId) {
      returnRequestRef.current = null;
      return;
    }
    let stopped = false;
    let inFlight = false;
    let retryTimer;
    const confirm = () => {
      if (stopped || latestGsRef.current?._mpMatchId !== matchId || !latestGsRef.current?.gameOver) return;
      gameEndSentRef.current = true;
      clearTimeout(retryTimer);
      finishRequestedReturn();
    };
    if (roomConfirmed || gameEndSentRef.current) {
      confirm();
      return;
    }
    const send = () => {
      if (stopped || inFlight || gameEndSentRef.current || latestGsRef.current?._mpMatchId !== matchId) return;
      inFlight = true;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { inFlight = false; send(); }, 2500);
      emitMultiplayerGameEnd({
        socket: socketRef.current, gs, playerUUID, roomId,
        myPlayerIndex: myPlayerIndexRef.current,
        onAcknowledged: result => {
          if (result?.ok && result.matchId === matchId) confirm();
        },
      });
    };
    retrySettlementRef.current = send;
    send();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      if (retrySettlementRef.current === send) retrySettlementRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs?.gameOver, isMultiplayer, playerUUID, roomId, matchId, roomConfirmed]);

  useEffect(() => {
    if (!gs || !isMultiplayer || !socketRef.current) return;
    if (anim || animExiting || animQueueRef.current.length > 0 || pendingGsRef.current) return;
    if (gs.gameOver) return;

    if (isPlayerWinBroadcastPhase(gs)) {
      if (receivedGsRef.current) {
        receivedGsRef.current = false;
        return;
      }
      if (latestGsRef.current !== gs) return;
      emitMultiplayerStateBroadcast({
        socket: socketRef.current,
        broadcast: buildPlayerWinWaitBroadcast({
          gs,
          room: { roomId },
          myPlayerIndex: myPlayerIndexRef.current,
        }),
      });
      return;
    }

    if (shouldSuppressNormalStateBroadcast(gs)) return;
    if (receivedGsRef.current) {
      receivedGsRef.current = false;
      return;
    }
    if (latestGsRef.current !== gs) return;

    const broadcast = buildNormalStateBroadcast({
      gs,
      room: { roomId },
      myPlayerIndex: myPlayerIndexRef.current,
      consumedVisualEventIds: consumedVisualEventIdsRef.current,
    });
    if (!emitMultiplayerStateBroadcast({ socket: socketRef.current, broadcast })) return;

    if (broadcast.clearLocalVisualEvents) {
      receivedGsRef.current = true;
      setGs(prev => prev ? { ...prev, _visualEvents: [] } : prev);
    }
  }, [
    gs,
    setGs,
    anim,
    animExiting,
    showTutorial,
    isMultiplayer,
    roomId,
    socketRef,
    myPlayerIndexRef,
    gameEndSentRef,
    receivedGsRef,
    latestGsRef,
    consumedVisualEventIdsRef,
    animQueueRef,
    pendingGsRef,
  ]);
  return { requestReturnToRoom };
}
