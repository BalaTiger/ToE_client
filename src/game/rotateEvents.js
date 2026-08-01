export function rotatePlayersArray(players, myIndex) {
  if (!Array.isArray(players) || myIndex === 0) return players;
  const N = players.length;
  // 玩家对象里的座位索引字段必须与数组重排同步重映射，
  // 否则两人一绳的互指校验（partner 互为对方）在旋转视角下必然失败，远端看不到链条特效
  const rotateIndex = i => (i == null || i < 0 ? i : (i - myIndex + N) % N);
  return [...players.slice(myIndex), ...players.slice(0, myIndex)].map(p => (
    p?.damageLink
      ? {
        ...p,
        damageLink: {
          ...p.damageLink,
          partner: rotateIndex(p.damageLink.partner),
          expiryOwner: rotateIndex(p.damageLink.expiryOwner),
        },
      }
      : p
  ));
}

export function rotateStatEvent(statEvent, rotateIndex, myIndex) {
  if (!statEvent) return statEvent;
  return {
    ...statEvent,
    target: statEvent?.target != null ? rotateIndex(statEvent.target) : statEvent?.target,
    pair: Array.isArray(statEvent?.pair) ? statEvent.pair.map(rotateIndex) : statEvent?.pair,
    players: rotatePlayersArray(statEvent?.players, myIndex),
  };
}

export function rotateStatEvents(events, rotateIndex, myIndex) {
  return Array.isArray(events)
    ? events.map(event => rotateStatEvent(event, rotateIndex, myIndex))
    : events;
}

export function rotateInspectionEvents(events, rotateIndex, myIndex) {
  if (!Array.isArray(events)) return events;
  return events.map(event => ({
    ...event,
    target: event?.target != null ? rotateIndex(event.target) : event?.target,
    beforePlayers: rotatePlayersArray(event?.beforePlayers, myIndex),
    afterPlayers: rotatePlayersArray(event?.afterPlayers, myIndex),
    statEvents: rotateStatEvents(event?.statEvents, rotateIndex, myIndex),
  }));
}
