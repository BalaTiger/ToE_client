import { clamp, copyPlayers } from './coreUtils';
import { buildStatEvents } from './statEvents';

function normalizedRecoveryEvents(players = [], events = []) {
  return (Array.isArray(events) ? events : [])
    .map((event, index) => ({
      ...event,
      order: event?.order ?? index,
      gainHp: Math.max(0, Number(event?.gainHp) || 0),
      gainSan: Math.max(0, Number(event?.gainSan) || 0),
    }))
    .filter(event => (
      event.targetIdx != null &&
      players?.[event.targetIdx] &&
      !players[event.targetIdx].isDead &&
      (event.gainHp > 0 || event.gainSan > 0)
    ))
    .sort((left, right) => left.order - right.order);
}

export function submitRecoveryEvents({
  players,
  events = [],
  statEventSeq = null,
  reason = '恢复',
  logs = [],
} = {}) {
  const P = players;
  const beforePlayers = copyPlayers(P || []);
  const normalized = normalizedRecoveryEvents(P, events);
  const statEvents = [];

  normalized.forEach(event => {
    const eventBeforePlayers = copyPlayers(P || []);
    const target = P[event.targetIdx];
    if (event.gainHp > 0) target.hp = clamp((target.hp || 0) + event.gainHp);
    if (event.gainSan > 0) target.san = clamp((target.san || 0) + event.gainSan);
    const eventLogs = Array.isArray(event.logs)
      ? event.logs
      : event.logHint
        ? [event.logHint]
        : logs;
    statEvents.push(...buildStatEvents(eventBeforePlayers, P, eventLogs, {
      reason: event.source || reason,
      ...(statEventSeq != null ? { seq: statEventSeq } : {}),
      includeDefeat: false,
    }).map(statEvent => ({
      ...statEvent,
      ...(event.phaseOrder != null ? { phaseOrder: event.phaseOrder } : {}),
      ...(event.phaseGroupId ? { phaseGroupId: event.phaseGroupId } : {}),
    })));
  });

  return {
    players: P,
    beforePlayers,
    statEvents,
    statEventSeq: statEvents.length ? statEventSeq : null,
  };
}

export function appendStatChangeResult(meta = {}, result = {}) {
  const statEvents = Array.isArray(result?.statEvents) ? result.statEvents : [];
  if (!statEvents.length) return meta;
  const nextSeq = result.statEventSeq ?? Math.max(
    meta?._statEventSeq || 0,
    ...statEvents.map(event => event?.seq || 0),
  );
  return {
    ...meta,
    _statEvents: [...(meta?._statEvents || []), ...statEvents],
    _statEventSeq: nextSeq,
  };
}
