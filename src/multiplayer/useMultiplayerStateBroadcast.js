import { useEffect } from 'react';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../game/coreUtils';
import { derotateGs } from '../game/rotateState';
import { markConsumedVisualEvents, pruneConsumedVisualEvents } from '../game/visualEvents';

const WINNER_ROLES = new Set([ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST]);

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

export function emitMultiplayerGameEnd({ socket, gs, playerUUID, roomId, myPlayerIndex }) {
  if (!socket?.connected || !gs?.gameOver) return false;
  socket.emit('gameEnd', {
    uuid: playerUUID,
    roomId,
    winnerRole: getMultiplayerWinnerRole(gs.gameOver),
  });
  socket.emit('mpStateSync', {
    roomId,
    gs: derotateGs(gs, myPlayerIndex),
  });
  return true;
}

export function emitMultiplayerStateBroadcast({ socket, broadcast }) {
  if (!socket || !broadcast) return false;
  socket.emit('mpStateSync', {
    roomId: broadcast.roomId,
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
  useEffect(() => {
    if (!isMultiplayer || !gs?.gameOver) return;
    if (gameEndSentRef.current) return;
    gameEndSentRef.current = true;
    emitMultiplayerGameEnd({
      socket: socketRef.current,
      gs,
      playerUUID,
      roomId: roomModal?.roomId,
      myPlayerIndex: myPlayerIndexRef.current,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs?.gameOver, isMultiplayer, playerUUID, roomModal?.roomId]);

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
          room: roomModal,
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
      room: roomModal,
      myPlayerIndex: myPlayerIndexRef.current,
      consumedVisualEventIds: consumedVisualEventIdsRef.current,
    });
    if (!emitMultiplayerStateBroadcast({ socket: socketRef.current, broadcast })) return;

    if (broadcast.clearLocalVisualEvents) {
      if (broadcast.freshVisualEvents.length) {
        markConsumedVisualEvents(consumedVisualEventIdsRef.current, broadcast.freshVisualEvents);
      }
      receivedGsRef.current = true;
      setGs(prev => prev ? { ...prev, _visualEvents: [] } : prev);
    }
  }, [gs, anim, animExiting, showTutorial, isMultiplayer, roomModal]);
}
