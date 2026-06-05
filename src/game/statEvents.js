const STAT_EVENT_TYPES = new Set([
  'HP_LOSS',
  'HP_GAIN',
  'SAN_LOSS',
  'SAN_GAIN',
  'HP_SAN_LOSS',
  'HP_SAN_GAIN',
  'DAMAGE_LINK_BREAK',
  'PETRIFY_DEATH',
]);

function statOf(player) {
  return {
    hp: player?.hp ?? 0,
    san: player?.san ?? 0,
    isDead: !!player?.isDead,
  };
}

function normalizeStatEvent(event) {
  if (!event || !STAT_EVENT_TYPES.has(event.type)) return null;
  if (event.type === 'DAMAGE_LINK_BREAK') return { ...event };
  if (event.target == null) return null;
  return { ...event, target: Number(event.target), from: event.from || {}, to: event.to || {} };
}

function clonePlayersForStatPatch(players = []) {
  return players.map(player => ({
    ...player,
    hand: [...(player?.hand || [])],
    godZone: [...(player?.godZone || [])],
    zoneCards: [...(player?.zoneCards || [])],
    peekMemories: Object.fromEntries(Object.entries(player?.peekMemories || {}).map(([k, v]) => [k, [...(v || [])]])),
  }));
}

function findDamageLinkBreakTimeline(beforePlayers = [], afterPlayers = [], logs = [], options = {}) {
  const logText = (Array.isArray(logs) ? logs : []).join('\n');
  if (!logText.includes('【两人一绳】绳索断裂')) return null;

  for (let i = 0; i < beforePlayers.length; i += 1) {
    const before = beforePlayers[i];
    const partnerIdx = before?.damageLink?.active ? before.damageLink.partner : null;
    if (partnerIdx == null || partnerIdx <= i) continue;
    const partnerBefore = beforePlayers[partnerIdx];
    const after = afterPlayers[i];
    const partnerAfter = afterPlayers[partnerIdx];
    if (!partnerBefore?.damageLink?.active || !after || !partnerAfter) continue;
    if (after.damageLink?.active || partnerAfter.damageLink?.active) continue;

    const aName = before.name;
    const bName = partnerBefore.name;
    const breakLine = (Array.isArray(logs) ? logs : []).find(line => (
      typeof line === 'string' &&
      line.includes('【两人一绳】绳索断裂') &&
      ((line.includes(`${aName} 和 ${bName}`)) || line.includes(`${bName} 和 ${aName}`))
    ));
    if (!breakLine) continue;

    const linkDamage = Number(breakLine.match(/各失去\s*(\d+)\s*HP/)?.[1]) || 3;
    const firstName = breakLine.match(/绳索断裂！(.+?) 和 /)?.[1];
    const triggerIdx = firstName === bName ? partnerIdx : i;
    const otherIdx = triggerIdx === i ? partnerIdx : i;
    const triggerBefore = beforePlayers[triggerIdx];
    const triggerAfter = afterPlayers[triggerIdx];
    const otherBefore = beforePlayers[otherIdx];
    const otherAfter = afterPlayers[otherIdx];
    const triggerTotalLoss = Math.max(0, (triggerBefore?.hp || 0) - (triggerAfter?.hp || 0));
    const directLoss = Math.max(0, triggerTotalLoss - linkDamage);
    const preBreakPlayers = clonePlayersForStatPatch(beforePlayers);
    const preBreakHp = Math.max(0, (triggerBefore?.hp || 0) - directLoss);
    preBreakPlayers[triggerIdx] = { ...preBreakPlayers[triggerIdx], hp: preBreakHp };
    if (preBreakPlayers[i]?.damageLink) preBreakPlayers[i].damageLink = { ...preBreakPlayers[i].damageLink, active: false };
    if (preBreakPlayers[partnerIdx]?.damageLink) preBreakPlayers[partnerIdx].damageLink = { ...preBreakPlayers[partnerIdx].damageLink, active: false };

    const seq = options.seq;
    const base = { reason: options.reason || '', logHint: breakLine, ...(seq != null ? { seq } : {}) };
    const events = [];
    if (directLoss > 0) {
      events.push({
        ...base,
        type: 'HP_LOSS',
        target: triggerIdx,
        from: statOf(triggerBefore),
        to: { ...statOf(triggerBefore), hp: preBreakHp },
        phaseOrder: 0,
      });
    }
    events.push({
      ...base,
      type: 'DAMAGE_LINK_BREAK',
      players: preBreakPlayers,
      phaseOrder: 1,
      _logChunk: [breakLine],
      pair: [i, partnerIdx],
    });
    events.push({
      ...base,
      type: 'HP_LOSS',
      target: triggerIdx,
      from: { ...statOf(triggerBefore), hp: preBreakHp },
      to: statOf(triggerAfter),
      phaseOrder: 2,
      linkDamage: true,
    });
    events.push({
      ...base,
      type: 'HP_LOSS',
      target: otherIdx,
      from: statOf(otherBefore),
      to: statOf(otherAfter),
      phaseOrder: 2,
      linkDamage: true,
    });
    return events.filter(event => event.type === 'DAMAGE_LINK_BREAK' || (event.to?.hp ?? 0) < (event.from?.hp ?? 0));
  }
  return null;
}

export function buildStatEvents(beforePlayers = [], afterPlayers = [], logs = [], options = {}) {
  const damageLinkTimeline = findDamageLinkBreakTimeline(beforePlayers, afterPlayers, logs, options);

  const reason = options.reason || '';
  const logHint = Array.isArray(logs) ? logs.find(Boolean) : '';
  const seq = options.seq;
  const events = [];
  const len = Math.max(beforePlayers.length, afterPlayers.length);
  for (let i = 0; i < len; i += 1) {
    const before = beforePlayers[i];
    const after = afterPlayers[i];
    if (!before || !after) continue;
    const from = statOf(before);
    const to = statOf(after);
    const base = { target: i, from, to, reason, logHint, ...(seq != null ? { seq } : {}) };
    if (to.hp < from.hp) events.push({ ...base, type: 'HP_LOSS' });
    if (to.hp > from.hp) events.push({ ...base, type: 'HP_GAIN' });
    if (to.san < from.san) events.push({ ...base, type: 'SAN_LOSS' });
    if (to.san > from.san) events.push({ ...base, type: 'SAN_GAIN' });
  }
  if (damageLinkTimeline) {
    const linkHpTargets = new Set(
      damageLinkTimeline
        .filter(event => event.type === 'HP_LOSS' && event.target != null)
        .map(event => event.target)
    );
    const extraEvents = events
      .filter(event => !(event.type === 'HP_LOSS' && linkHpTargets.has(event.target)))
      .map(event => ({ ...event, phaseOrder: 0 }));
    return [...damageLinkTimeline, ...extraEvents];
  }
  return events;
}

export function makeTargetStats(players = [], statEvents = []) {
  const targetStats = players.map(statOf);
  statEvents.map(normalizeStatEvent).filter(Boolean).forEach(event => {
    targetStats[event.target] = {
      ...targetStats[event.target],
      ...event.to,
      isDead: event.to?.isDead ?? targetStats[event.target]?.isDead ?? false,
    };
  });
  return targetStats;
}

export function statEventsToAnimQueue(statEvents = [], players = [], msgs = []) {
  const events = statEvents.map(normalizeStatEvent).filter(Boolean);
  if (!events.length) return [];
  const hasTimelineOrder = events.some(event => event.type === 'DAMAGE_LINK_BREAK' || event.phaseOrder != null);
  if (hasTimelineOrder) {
    const queue = [];
    const orders = [...new Set(events.map(event => event.phaseOrder ?? 0))].sort((a, b) => a - b);
    orders.forEach(order => {
      const orderedEvents = events.filter(event => (event.phaseOrder ?? 0) === order);
      const breakEvent = orderedEvents.find(event => event.type === 'DAMAGE_LINK_BREAK');
      const statOnly = orderedEvents
        .filter(event => event.type !== 'DAMAGE_LINK_BREAK')
        .map(({ phaseOrder, ...event }) => event);
      if (statOnly.length) {
        const breakLine = events.find(event => event.type === 'DAMAGE_LINK_BREAK')?._logChunk?.[0];
        const preBreakMsgs = Array.isArray(msgs) && breakLine
          ? msgs.slice(0, Math.max(0, msgs.findIndex(line => line === breakLine)))
          : [];
        queue.push(...statEventsToAnimQueue(statOnly, players, order === 0 ? preBreakMsgs : []));
      }
      if (breakEvent) {
        queue.push({ type: 'STATE_PATCH', players: breakEvent.players, _logChunk: breakEvent._logChunk || [] });
        queue.push({ type: 'TURN_BOUNDARY_PAUSE', durationMs: breakEvent.durationMs || 560 });
      }
    });
    return queue;
  }

  const targetStats = makeTargetStats(players, events);
  const byType = {
    HP_DAMAGE: new Set(),
    HP_HEAL: new Set(),
    SAN_DAMAGE: new Set(),
    SAN_HEAL: new Set(),
  };

  events.forEach(event => {
    if (event.type === 'HP_LOSS' || event.type === 'HP_SAN_LOSS') byType.HP_DAMAGE.add(event.target);
    if (event.type === 'HP_GAIN' || event.type === 'HP_SAN_GAIN') byType.HP_HEAL.add(event.target);
    if (event.type === 'SAN_LOSS' || event.type === 'HP_SAN_LOSS') byType.SAN_DAMAGE.add(event.target);
    if (event.type === 'SAN_GAIN' || event.type === 'HP_SAN_GAIN') byType.SAN_HEAL.add(event.target);
  });

  const hpHeal = [...byType.HP_HEAL];
  const sanHeal = [...byType.SAN_HEAL];
  const sameHealTargets = hpHeal.length && sanHeal.length && hpHeal.length === sanHeal.length && hpHeal.every((v, i) => v === sanHeal[i]);
  const queue = [];
  const petrifyEvents = events.filter(event => event.type === 'PETRIFY_DEATH');
  petrifyEvents.forEach(event => {
    queue.push({
      type: 'PETRIFY_DEATH',
      msgs,
      hitIndices: [event.target],
      targetStats,
      statEvents: events,
    });
  });
  const push = (type, hitIndices) => {
    if (hitIndices.length) queue.push({ type, msgs, hitIndices, targetStats, statEvents: events });
  };

  push('HP_DAMAGE', [...byType.HP_DAMAGE]);
  if (sameHealTargets) {
    push('HP_SAN_HEAL', hpHeal);
  } else {
    push('HP_HEAL', hpHeal);
    push('SAN_HEAL', sanHeal);
  }
  push('SAN_DAMAGE', [...byType.SAN_DAMAGE]);
  return queue;
}

export function applyStatEventsToDisplayStats(displayStats = [], statEvents = []) {
  const next = [...displayStats];
  statEvents.map(normalizeStatEvent).filter(Boolean).forEach(event => {
    next[event.target] = {
      ...(next[event.target] || {}),
      ...event.to,
    };
  });
  return next;
}
