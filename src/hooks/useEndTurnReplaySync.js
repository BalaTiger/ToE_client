import { useCallback, useEffect, useRef } from 'react';
import { copyPlayers } from '../game/coreUtils';
import { createEndlessCorridorReplayEvent } from '../game/visualEvents';

// Owns only the synchronization accumulator for an already-built authoritative
// queue. It never compiles, reorders, or plays animation steps.
export function useEndTurnReplaySync({ broadcastState } = {}) {
  const syncRef = useRef(null);
  const broadcastStateRef = useRef(broadcastState);
  useEffect(() => {
    broadcastStateRef.current = broadcastState;
  }, [broadcastState]);

  const startEndTurnReplaySyncQueue = useCallback((actorIndex = 0, actorName = '你', stateLike = null) => {
    syncRef.current = {
      actorIndex,
      actorName,
      queue: [],
      msgs: [],
      broadcastedCount: 0,
      broadcastedMsgCount: 0,
      beforePlayers: copyPlayers(stateLike?.players || []),
      beforeDiscard: [...(stateLike?.discard || [])],
      zhuLight: stateLike?.zhuLight || null,
    };
  }, []);

  const appendEndTurnReplaySyncQueue = useCallback((steps = [], msgs = []) => {
    const sync = syncRef.current;
    if (!sync) return;
    const queue = Array.isArray(steps) ? steps.filter(Boolean) : [];
    if (queue.length) sync.queue.push(...queue);
    const lines = Array.isArray(msgs) ? msgs.filter(Boolean) : [];
    if (lines.length) sync.msgs.push(...lines);
  }, []);

  const broadcastEndTurnReplaySyncDelta = useCallback(state => {
    const sync = syncRef.current;
    if (!state?._isMP || !sync) return state;
    const queue = sync.queue.slice(sync.broadcastedCount || 0);
    const msgs = sync.msgs.slice(sync.broadcastedMsgCount || 0);
    if (!queue.length) return state;
    const isFirstDelta = (sync.broadcastedCount || 0) === 0;
    const event = createEndlessCorridorReplayEvent({
      actorIdx: sync.actorIndex,
      actorName: sync.actorName,
      queue,
      msgs,
      beforePlayers: isFirstDelta ? sync.beforePlayers : null,
      beforeDiscard: isFirstDelta ? sync.beforeDiscard : null,
      zhuLight: sync.zhuLight,
    });
    sync.broadcastedCount = sync.queue.length;
    sync.broadcastedMsgCount = sync.msgs.length;
    const stateWithEvent = event
      ? { ...state, _visualEvents: [event, ...(state?._visualEvents || [])] }
      : state;
    broadcastStateRef.current?.(stateWithEvent);
    return stateWithEvent;
  }, []);

  const broadcastEndTurnDecisionAnimTransaction = useCallback((state, steps = [], msgs = []) => {
    if (!state?._isMP || !syncRef.current) return false;
    appendEndTurnReplaySyncQueue(steps, msgs);
    broadcastEndTurnReplaySyncDelta(state);
    return true;
  }, [appendEndTurnReplaySyncQueue, broadcastEndTurnReplaySyncDelta]);

  const withEndTurnReplaySyncEvent = useCallback(state => {
    const sync = syncRef.current;
    syncRef.current = null;
    if (!sync?.queue?.length) return state;
    const queue = sync.queue.slice(sync.broadcastedCount || 0);
    const msgs = sync.msgs.slice(sync.broadcastedMsgCount || 0);
    if (!queue.length) return state;
    const event = createEndlessCorridorReplayEvent({
      actorIdx: sync.actorIndex,
      actorName: sync.actorName,
      queue,
      msgs,
      beforePlayers: (sync.broadcastedCount || 0) === 0 ? sync.beforePlayers : null,
      beforeDiscard: (sync.broadcastedCount || 0) === 0 ? sync.beforeDiscard : null,
      zhuLight: sync.zhuLight,
    });
    return event ? { ...state, _visualEvents: [event, ...(state?._visualEvents || [])] } : state;
  }, []);

  return {
    startEndTurnReplaySyncQueue,
    appendEndTurnReplaySyncQueue,
    broadcastEndTurnReplaySyncDelta,
    broadcastEndTurnDecisionAnimTransaction,
    withEndTurnReplaySyncEvent,
  };
}
