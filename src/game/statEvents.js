const STAT_EVENT_TYPES = new Set([
  'HP_LOSS',
  'HP_GAIN',
  'SAN_LOSS',
  'SAN_GAIN',
  'HP_SAN_LOSS',
  'HP_SAN_GAIN',
  'DAMAGE_LINK_BREAK',
  'PLAYER_DEFEATED',
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
    damageLink: player?.damageLink ? { ...player.damageLink } : player?.damageLink,
    damageLinks: Array.isArray(player?.damageLinks) ? player.damageLinks.map(link => ({ ...link })) : player?.damageLinks,
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

export function createPlayerDefeatedStatEvent({
  target,
  cause = 'hpDepleted',
  from = {},
  to = {},
  reason = '',
  logHint = '',
  seq,
  phaseOrder,
  playersBefore = [],
  playersAfter = [],
  discardBefore = null,
  discardAfter = null,
  settlementOwner = null,
} = {}) {
  if (target == null) return null;
  const beforeSnapshot = clonePlayersForStatPatch(playersBefore);
  const afterSnapshot = clonePlayersForStatPatch(playersAfter);
  const beforePlayer = beforeSnapshot[target];
  const afterPlayer = afterSnapshot[target];
  const committedPlayers = clonePlayersForStatPatch(beforeSnapshot);
  if (committedPlayers[target]) {
    committedPlayers[target] = {
      ...committedPlayers[target],
      hp: afterPlayer?.hp ?? to?.hp ?? committedPlayers[target].hp,
      san: afterPlayer?.san ?? to?.san ?? committedPlayers[target].san,
      isDead: true,
      roleRevealed: true,
    };
  }
  return {
    type: 'PLAYER_DEFEATED',
    target: Number(target),
    cause,
    from,
    to: { ...to, isDead: true },
    reason,
    logHint,
    ...(seq != null ? { seq } : {}),
    ...(phaseOrder != null ? { phaseOrder } : {}),
    ...(settlementOwner ? { settlementOwner } : {}),
    playersBefore: beforeSnapshot,
    committedPlayers,
    playersAfter: afterSnapshot,
    ...(Array.isArray(discardBefore) ? { discardBefore: [...discardBefore] } : {}),
    ...(Array.isArray(discardAfter) ? { discardAfter: [...discardAfter] } : {}),
    deathCards: [
      ...(beforePlayer?.hand || []),
      ...(beforePlayer?.godZone || []),
    ],
  };
}

function buildExplicitDamageLinkTimeline(beforePlayers = [], afterPlayers = [], options = {}) {
  const timeline = Array.isArray(afterPlayers?._damageLinkBreakTimeline)
    ? afterPlayers._damageLinkBreakTimeline
    : [];
  if (!timeline.length) return null;
  delete afterPlayers._damageLinkBreakTimeline;
  const seq = options.seq;
  const eventBase = item => ({
    reason: options.reason || '',
    logHint: item.breakLine,
    ...(seq != null ? { seq } : {}),
  });
  const events = [];
  const firstBeforeBreak = timeline[0].beforePlayers;
  for (let idx = 0; idx < beforePlayers.length; idx += 1) {
    const from = statOf(beforePlayers[idx]);
    const to = statOf(firstBeforeBreak[idx]);
    if (to.hp < from.hp) events.push({ type: 'HP_LOSS', target: idx, from, to, phaseOrder: 0, ...eventBase(timeline[0]) });
    if (to.san < from.san) events.push({ type: 'SAN_LOSS', target: idx, from, to, phaseOrder: 0, ...eventBase(timeline[0]) });
  }
  timeline.forEach((item, index) => {
    const breakOrder = index * 2 + 1;
    const damageOrder = breakOrder + 1;
    events.push({
      type: 'DAMAGE_LINK_BREAK',
      players: item.breakPlayers,
      pair: item.pair,
      linkId: item.linkId,
      phaseOrder: breakOrder,
      _logChunk: [item.breakLine],
      ...eventBase(item),
    });
    item.pair.forEach(target => {
      const from = statOf(item.beforePlayers[target]);
      const to = statOf(item.afterPlayers[target]);
      if (to.hp < from.hp) events.push({
        type: 'HP_LOSS', target, from, to, phaseOrder: damageOrder, linkDamage: true, ...eventBase(item),
      });
    });
  });
  return events;
}

export function buildStatEvents(beforePlayers = [], afterPlayers = [], logs = [], options = {}) {
  const withEventIds = list => options.eventIdPrefix
    ? list.map((event, index) => ({ ...event, id: event.id || `${options.eventIdPrefix}:${index}` }))
    : list;
  const damageLinkTimeline = buildExplicitDamageLinkTimeline(beforePlayers, afterPlayers, options)
    || findDamageLinkBreakTimeline(beforePlayers, afterPlayers, logs, options);

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
    if (options.includeDefeat !== false && !from.isDead && to.isDead && to.hp <= 0 && to.hp < from.hp) {
      const defeatPlayersBefore = options.defeatPlayersBefore?.[i] && !options.defeatPlayersBefore[i].isDead
        ? options.defeatPlayersBefore
        : beforePlayers;
      const defeatDiscardBefore = defeatPlayersBefore === options.defeatPlayersBefore
        ? options.defeatDiscardBefore
        : options.discardBefore;
      const defeatLog = (Array.isArray(logs) ? logs : []).find(line => (
        typeof line === 'string'
        && (!before.name || line.includes(before.name))
        && (line.includes('倒下了') || line.includes('被石化了') || line.includes('立即死亡并石化'))
      ));
      events.push(createPlayerDefeatedStatEvent({
        ...base,
        logHint: defeatLog || logHint,
        cause: 'hpDepleted',
        playersBefore: defeatPlayersBefore,
        playersAfter: afterPlayers,
        discardBefore: defeatDiscardBefore,
        discardAfter: options.discardAfter,
        settlementOwner: options.defeatSettlementOwner || null,
      }));
    }
  }
  let resultEvents = events;
  if (damageLinkTimeline) {
    const linkHpTargets = new Set(
      damageLinkTimeline
        .filter(event => event.type === 'HP_LOSS' && event.target != null)
        .map(event => event.target)
    );
    const extraEvents = events
      .filter(event => !(event.type === 'HP_LOSS' && linkHpTargets.has(event.target)))
      .map(event => {
        if (event.type !== 'PLAYER_DEFEATED') return { ...event, phaseOrder: 0 };
        const lethalHpOrder = damageLinkTimeline
          .filter(item => item.type === 'HP_LOSS' && item.target === event.target)
          .reduce((max, item) => Math.max(max, item.phaseOrder ?? 0), 0);
        return { ...event, phaseOrder: lethalHpOrder };
      });
    resultEvents = [...damageLinkTimeline, ...extraEvents];
  }

  // 不灭之躯的规则终态是 1 HP，但视觉上必须先完整呈现致死伤害，
  // 等翻牌结果公开后再恢复到 1。仅用 before/final 快照会把 3→1
  // 错编译成一次普通扣血，提前泄露“判定成功”。
  const logLines = Array.isArray(logs) ? logs : [];
  beforePlayers.forEach((before, target) => {
    const after = afterPlayers[target];
    if (!before || !after || before.isDead || after.isDead || after.hp !== 1 || !(before.hp > 0)) return;
    const revealLine = logLines.find(line => (
      typeof line === 'string'
      && line.includes('【不灭之躯】')
      && line.includes('翻开')
      && (line.includes('未见邪神牌') || line.includes('HP恢复至1'))
      && (line.includes(`【不灭之躯】${before.name} `) || (target === 0 && line.includes('【不灭之躯】你 ')))
    ));
    if (!revealLine) return;

    const targetLosses = resultEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event?.type === 'HP_LOSS' && Number(event.target) === target);
    const lastLoss = targetLosses.at(-1);
    const zeroStats = { ...statOf(after), hp: 0, isDead: false };
    let damageOrder = 0;
    if (lastLoss) {
      damageOrder = lastLoss.event.phaseOrder ?? 0;
      resultEvents[lastLoss.index] = {
        ...lastLoss.event,
        to: zeroStats,
        phaseOrder: damageOrder,
        vritraImmortalStage: 'damageToZero',
      };
    } else {
      resultEvents.push({
        type: 'HP_LOSS',
        target,
        from: statOf(before),
        to: zeroStats,
        reason,
        logHint: revealLine,
        ...(seq != null ? { seq } : {}),
        phaseOrder: damageOrder,
        vritraImmortalStage: 'damageToZero',
      });
    }
    resultEvents.push({
      type: 'HP_GAIN',
      target,
      from: zeroStats,
      to: statOf(after),
      reason: '不灭之躯',
      logHint: revealLine,
      ...(seq != null ? { seq } : {}),
      phaseOrder: damageOrder + 2,
      vritraImmortalStage: 'recoverToOne',
    });
  });

  return withEventIds(resultEvents);
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

function eventMatchesAnimationType(event, animationType) {
  if (animationType === 'HP_DAMAGE') return event.type === 'HP_LOSS' || event.type === 'HP_SAN_LOSS';
  if (animationType === 'HP_HEAL') return event.type === 'HP_GAIN' || event.type === 'HP_SAN_GAIN';
  if (animationType === 'SAN_DAMAGE') return event.type === 'SAN_LOSS' || event.type === 'HP_SAN_LOSS';
  if (animationType === 'SAN_HEAL') return event.type === 'SAN_GAIN' || event.type === 'HP_SAN_GAIN';
  return true;
}

export const STAT_ANIMATION_TYPES = Object.freeze([
  'HP_DAMAGE',
  'HP_HEAL',
  'SAN_DAMAGE',
  'SAN_HEAL',
]);

export function isStatAnimationType(type) {
  return STAT_ANIMATION_TYPES.includes(type);
}

function statFieldsForAnimationType(type) {
  if (type === 'HP_DAMAGE' || type === 'HP_HEAL') return ['hp'];
  if (type === 'SAN_DAMAGE' || type === 'SAN_HEAL') return ['san'];
  return [];
}

export function expandCombinedStatAnimationSteps(queue = []) {
  return (Array.isArray(queue) ? queue : []).flatMap(step => {
    if (step?.type !== 'HP_SAN_HEAL' && step?.type !== 'HP_SAN_DAMAGE') return [step];
    const healing = step.type === 'HP_SAN_HEAL';
    return [
      { ...step, type: healing ? 'HP_HEAL' : 'HP_DAMAGE' },
      { ...step, type: healing ? 'SAN_HEAL' : 'SAN_DAMAGE', msgs: [] },
    ];
  });
}

export function primeDisplayStatsForStatQueue(displayStats = [], queue = []) {
  const next = displayStats.map(stat => ({ ...stat }));
  const primed = new Set();
  (Array.isArray(queue) ? queue : []).forEach(step => {
    if (step?.type === 'TSG_SLIME_POP' && step.statPresentation) {
      const { target, from } = step.statPresentation;
      if (target != null && from) {
        next[target] = {
          ...(next[target] || {}),
          ...(from.hp != null ? { hp: from.hp } : {}),
          ...(from.san != null ? { san: from.san } : {}),
        };
      }
      return;
    }
    const fields = statFieldsForAnimationType(step?.type);
    if (!fields.length) return;
    const matchingEvents = (Array.isArray(step.statEvents) ? step.statEvents : [])
      .map(normalizeStatEvent)
      .filter(Boolean)
      .filter(event => eventMatchesAnimationType(event, step.type));
    if (matchingEvents.length) {
      matchingEvents.forEach(event => {
        fields.forEach(field => {
          const key = `${event.target}:${field}`;
          if (primed.has(key) || event.from?.[field] == null) return;
          next[event.target] = { ...(next[event.target] || {}), [field]: event.from[field] };
          primed.add(key);
        });
      });
      return;
    }
    const setupPlayers = step.visualSetupPatch?.players ||
      step.visualTimeline?.find(point => point?.patch?.players)?.patch?.players;
    (Array.isArray(step.hitIndices) ? step.hitIndices : []).forEach(target => {
      fields.forEach(field => {
        const key = `${target}:${field}`;
        if (primed.has(key) || setupPlayers?.[target]?.[field] == null) return;
        next[target] = { ...(next[target] || {}), [field]: setupPlayers[target][field] };
        primed.add(key);
      });
    });
  });
  return next;
}

export function applyStatAnimationImpact(displayStats = [], anim = {}) {
  if (anim?.type === 'TSG_SLIME_POP' && anim.statPresentation) {
    const { target, to } = anim.statPresentation;
    if (target == null || !to) return displayStats;
    const next = displayStats.map(stat => ({ ...stat }));
    next[target] = {
      ...(next[target] || {}),
      ...(to.hp != null ? { hp: to.hp } : {}),
      ...(to.san != null ? { san: to.san } : {}),
    };
    return next;
  }
  if (!isStatAnimationType(anim?.type)) return displayStats;
  if (Array.isArray(anim.statEvents) && anim.statEvents.length) {
    return applyStatEventsToDisplayStats(displayStats, anim.statEvents, anim.type);
  }
  const fields = statFieldsForAnimationType(anim.type);
  const next = displayStats.map(stat => ({ ...stat }));
  const targets = new Set([
    ...(Array.isArray(anim.hitIndices) ? anim.hitIndices : []),
    ...(Array.isArray(anim.targets) ? anim.targets : []),
    ...([anim.targetPid, anim.targetIdx, anim.triggerPid].filter(target => target != null)),
  ]);
  targets.forEach(target => {
    const patch = {};
    fields.forEach(field => {
      const value = anim.targetStats?.[target]?.[field];
      if (value != null) patch[field] = value;
    });
    if (!Object.keys(patch).length) return;
    next[target] = { ...(next[target] || {}), ...patch };
  });
  return next;
}

export function validateStatAnimationContinuity(queue = []) {
  const expected = new Map();
  const issues = [];
  (Array.isArray(queue) ? queue : []).forEach((step, stepIndex) => {
    const fields = statFieldsForAnimationType(step?.type);
    if (!fields.length || !Array.isArray(step.statEvents)) return;
    step.statEvents
      .map(normalizeStatEvent)
      .filter(Boolean)
      .filter(event => eventMatchesAnimationType(event, step.type))
      .forEach(event => {
        fields.forEach(field => {
          const key = `${event.target}:${field}`;
          if (expected.has(key) && event.from?.[field] !== expected.get(key)) {
            issues.push({
              stepIndex,
              type: step.type,
              target: event.target,
              field,
              expectedFrom: expected.get(key),
              actualFrom: event.from?.[field],
            });
          }
          if (event.to?.[field] != null) expected.set(key, event.to[field]);
        });
      });
  });
  return issues;
}

export function statEventsToAnimQueue(statEvents = [], players = [], msgs = []) {
  const events = statEvents.map(normalizeStatEvent).filter(Boolean);
  if (!events.length) return [];
  const seqs = [...new Set(events.map(event => event.seq).filter(seq => seq != null))];
  if (seqs.length > 1 && !events.some(event => event.type === 'DAMAGE_LINK_BREAK' || event.phaseOrder != null)) {
    const queue = [];
    let cursorPlayers = clonePlayersForStatPatch(players);
    seqs
      .sort((a, b) => a - b)
      .forEach((seq, idx) => {
        const seqEvents = events.filter(event => event.seq === seq);
        queue.push(...statEventsToAnimQueue(seqEvents, cursorPlayers, idx === 0 ? msgs : []));
        seqEvents.forEach(event => {
          if (event.target == null || !cursorPlayers[event.target]) return;
          cursorPlayers[event.target] = {
            ...cursorPlayers[event.target],
            ...event.to,
          };
        });
      });
    return queue;
  }
  const hasTimelineOrder = events.some(event => event.type === 'DAMAGE_LINK_BREAK' || event.phaseOrder != null);
  if (hasTimelineOrder) {
    const queue = [];
    const orders = [...new Set(events.map(event => event.phaseOrder ?? 0))].sort((a, b) => a - b);
    orders.forEach(order => {
      const orderedEvents = events.filter(event => (event.phaseOrder ?? 0) === order);
      const breakEvent = orderedEvents.find(event => event.type === 'DAMAGE_LINK_BREAK');
      const statOnly = orderedEvents
        .filter(event => event.type !== 'DAMAGE_LINK_BREAK')
        .map(event => Object.fromEntries(
          Object.entries(event).filter(([key]) => key !== 'phaseOrder'),
        ));
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
  const queue = [];
  const push = (type, hitIndices) => {
    if (!hitIndices.length) return;
    const matchingEvents = events.filter(event => eventMatchesAnimationType(event, type));
    queue.push({
      type,
      msgs,
      hitIndices,
      statEvents: matchingEvents,
    });
  };

  const animationGroups = [
    ['HP_DAMAGE', [...byType.HP_DAMAGE]],
    ['HP_HEAL', hpHeal],
    ['SAN_HEAL', sanHeal],
    ['SAN_DAMAGE', [...byType.SAN_DAMAGE]],
  ];
  animationGroups
    .map(([type, hitIndices], stableOrder) => ({
      type,
      hitIndices,
      stableOrder,
      firstEventIndex: events.findIndex(event => eventMatchesAnimationType(event, type)),
    }))
    .filter(group => group.hitIndices.length)
    .sort((a, b) => a.firstEventIndex - b.firstEventIndex || a.stableOrder - b.stableOrder)
    .forEach(group => push(group.type, group.hitIndices));
  const defeatEvents = events.filter(event => event.type === 'PLAYER_DEFEATED');
  let deathCursorPlayers = clonePlayersForStatPatch(
    defeatEvents[0]?.playersBefore?.length ? defeatEvents[0].playersBefore : players,
  );
  const ordinarySettlements = [];
  defeatEvents.forEach(event => {
    const target = event.target;
    const allDeathMsgs = (Array.isArray(msgs) ? msgs : []).filter(line => (
      typeof line === 'string' && (
        line.includes('倒下了')
        || line.includes('被石化了')
        || line.includes('立即死亡并石化')
      )
    ));
    const targetName = event.playersBefore?.[target]?.name || event.committedPlayers?.[target]?.name;
    const matchingDeathMsgs = targetName
      ? allDeathMsgs.filter(line => line.includes(targetName))
      : allDeathMsgs;
    const deathMsgs = matchingDeathMsgs.length ? matchingDeathMsgs : allDeathMsgs;
    const eventCommittedPlayers = event.committedPlayers?.length
      ? clonePlayersForStatPatch(event.committedPlayers)
      : clonePlayersForStatPatch(players).map((player, index) => index === target ? {
          ...player,
          hp: event.to?.hp ?? player.hp,
          san: event.to?.san ?? player.san,
          isDead: true,
          roleRevealed: true,
        } : player);
    const afterPlayers = event.playersAfter?.length
      ? clonePlayersForStatPatch(event.playersAfter)
      : eventCommittedPlayers;
    const committedTarget = eventCommittedPlayers[target];
    if (committedTarget && deathCursorPlayers[target]) {
      deathCursorPlayers[target] = {
        ...deathCursorPlayers[target],
        ...committedTarget,
        hand: [...(committedTarget.hand || [])],
        godZone: [...(committedTarget.godZone || [])],
      };
    }
    const committedPlayers = clonePlayersForStatPatch(deathCursorPlayers);
    queue.push({
      type: event.cause === 'petrification' ? 'PETRIFY_DEATH' : 'GUILLOTINE',
      msgs: event.cause === 'petrification'
        ? []
        : (deathMsgs.length ? deathMsgs : (event.logHint ? [event.logHint] : [])),
      hitIndices: [target],
    });
    queue.push({
      type: 'DEATH',
      msgs: deathMsgs.length ? deathMsgs : (event.logHint ? [event.logHint] : ['死亡降临']),
      hitIndices: [target],
      visualSetupTiming: 'stepStart',
      visualSetupPatch: { players: committedPlayers },
      visualTimeline: [{ atMs: 0, patch: { players: committedPlayers } }],
    });
    if (!event.settlementOwner) {
      ordinarySettlements.push({ event, target, afterPlayers });
    }
  });
  let settlementPlayers = clonePlayersForStatPatch(deathCursorPlayers);
  let settlementDiscard = ordinarySettlements.find(({ event }) => Array.isArray(event.discardBefore))?.event.discardBefore;
  ordinarySettlements.forEach(({ event, target, afterPlayers }) => {
    const deathCards = Array.isArray(event.deathCards) ? event.deathCards.filter(Boolean) : [];
    const beforePlayers = clonePlayersForStatPatch(settlementPlayers);
    if (afterPlayers[target]) {
      settlementPlayers[target] = {
        ...settlementPlayers[target],
        ...afterPlayers[target],
        hand: [...(afterPlayers[target].hand || [])],
        godZone: [...(afterPlayers[target].godZone || [])],
      };
    }
    const discardAfter = Array.isArray(event.discardAfter) ? [...event.discardAfter] : settlementDiscard;
    if (deathCards.length) {
      queue.push({
        type: 'DISCARD',
        card: deathCards[0],
        cards: deathCards,
        count: deathCards.length,
        targetPid: target,
        triggerName: beforePlayers[target]?.name || '角色',
        deathSettlementStep: true,
        visualSetupTiming: 'stepStart',
        visualSetupPatch: {
          players: beforePlayers,
          ...(Array.isArray(settlementDiscard) ? { discard: [...settlementDiscard] } : {}),
        },
        visualTimeline: [{
          atMs: 360,
          patch: {
            players: clonePlayersForStatPatch(settlementPlayers),
            ...(Array.isArray(discardAfter) ? { discard: [...discardAfter] } : {}),
          },
        }],
      });
    }
    settlementDiscard = discardAfter;
  });
  if (ordinarySettlements.length) {
    const finalAfterPlayers = ordinarySettlements.at(-1).afterPlayers;
    queue.push({
      type: 'STATE_PATCH',
      players: finalAfterPlayers,
      ...(Array.isArray(settlementDiscard) ? { discard: [...settlementDiscard] } : {}),
    });
  }
  return queue;
}

export function applyStatEventsToDisplayStats(displayStats = [], statEvents = [], animationType = null) {
  const next = [...displayStats];
  statEvents.map(normalizeStatEvent).filter(Boolean).filter(event => eventMatchesAnimationType(event, animationType)).forEach(event => {
    const current = next[event.target] || {};
    // Segmented AI actions may encounter an older snapshot after a newer one.
    // A damage/heal animation must never move its displayed bar backwards.
    const targetPatch = animationType === 'HP_DAMAGE'
      ? { hp: Math.min(current.hp ?? event.to.hp, event.to.hp) }
      : animationType === 'HP_HEAL'
        ? { hp: Math.max(current.hp ?? event.to.hp, event.to.hp) }
        : animationType === 'SAN_DAMAGE'
          ? { san: Math.min(current.san ?? event.to.san, event.to.san) }
          : animationType === 'SAN_HEAL'
            ? { san: Math.max(current.san ?? event.to.san, event.to.san) }
            : event.to;
    next[event.target] = {
      ...current,
      ...targetPatch,
    };
  });
  return next;
}
