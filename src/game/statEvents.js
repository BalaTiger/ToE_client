const STAT_EVENT_TYPES = new Set([
  'HP_LOSS',
  'HP_GAIN',
  'SAN_LOSS',
  'SAN_GAIN',
  'HP_SAN_LOSS',
  'HP_SAN_GAIN',
]);

function statOf(player) {
  return {
    hp: player?.hp ?? 0,
    san: player?.san ?? 0,
    isDead: !!player?.isDead,
  };
}

function normalizeStatEvent(event) {
  if (!event || !STAT_EVENT_TYPES.has(event.type) || event.target == null) return null;
  return {
    ...event,
    target: Number(event.target),
    from: event.from || {},
    to: event.to || {},
  };
}

export function buildStatEvents(beforePlayers = [], afterPlayers = [], logs = [], options = {}) {
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
