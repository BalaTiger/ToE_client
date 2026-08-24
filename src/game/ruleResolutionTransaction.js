export function statEventIdentity(event = {}) {
  if (event.id) return `id:${event.id}`;
  return [
    event.seq ?? 'no-seq',
    event.type || 'unknown',
    event.target ?? 'no-target',
    event.phaseOrder ?? 0,
    event.from?.hp ?? 'no-from-hp',
    event.from?.san ?? 'no-from-san',
    event.from?.isDead ? 'from-dead' : 'from-alive',
    event.to?.hp ?? 'no-to-hp',
    event.to?.san ?? 'no-to-san',
    event.to?.isDead ? 'to-dead' : 'to-alive',
  ].join(':');
}

export function createRuleResolutionTransaction({
  id,
  phase = 'action',
  barrier = 'continuation',
  events = [],
  terminalBoundary = null,
} = {}) {
  if (!id) throw new TypeError('createRuleResolutionTransaction requires id');
  const normalizedEvents = (Array.isArray(events) ? events : []).filter(Boolean).map((event, index) => ({
    ...event,
    transactionId: id,
    order: event.order ?? index,
    resolutionPhase: event.resolutionPhase || phase,
    barrier: event.barrier || barrier,
    ...(
      event.terminalBoundary === true
      || terminalBoundary === index
      || (event.id && terminalBoundary === event.id)
        ? { terminalBoundary: true }
        : {}
    ),
  }));
  return {
    id,
    phase,
    barrier,
    events: normalizedEvents,
    terminalBoundary: normalizedEvents.find(event => event.terminalBoundary === true)?.id || null,
  };
}

export function orderRuleResolutionEvents(events = []) {
  const source = Array.isArray(events) ? events.filter(Boolean) : [];
  const groups = new Map();
  source.forEach((event, index) => {
    if (!event?.transactionId || event?.turnStartStage) return;
    if (!groups.has(event.transactionId)) groups.set(event.transactionId, []);
    groups.get(event.transactionId).push({ event, index });
  });
  const emitted = new Set();
  return source.flatMap(event => {
    if (!event?.transactionId || event?.turnStartStage) return [event];
    if (emitted.has(event.transactionId)) return [];
    emitted.add(event.transactionId);
    return [...(groups.get(event.transactionId) || [])]
      .sort((left, right) => (
        Number(left.event.order ?? left.event.phaseOrder ?? left.index) - Number(right.event.order ?? right.event.phaseOrder ?? right.index) ||
        left.index - right.index
      ))
      .map(item => item.event);
  });
}

export function validateRuleResolutionEvents(events = []) {
  const source = Array.isArray(events) ? events.filter(Boolean) : [];
  const issues = [];
  const transactionGroups = new Map();
  const statOwners = new Map();

  source.forEach((event, index) => {
    if (event?.transactionId && !event?.turnStartStage) {
      if (!transactionGroups.has(event.transactionId)) transactionGroups.set(event.transactionId, []);
      transactionGroups.get(event.transactionId).push({ event, index });
    }
    (Array.isArray(event?.statEvents) ? event.statEvents : []).forEach(statEvent => {
      const key = statEventIdentity(statEvent);
      if (!statOwners.has(key)) statOwners.set(key, []);
      statOwners.get(key).push(event);
    });
  });

  transactionGroups.forEach((items, transactionId) => {
    const seenOrders = new Map();
    items.forEach(({ event }) => {
      const eventOrder = event.order ?? event.phaseOrder;
      if (eventOrder == null || !Number.isFinite(Number(eventOrder))) {
        issues.push({ code: 'MISSING_RULE_TRANSACTION_ORDER', transactionId, eventId: event.id || null });
        return;
      }
      const order = Number(eventOrder);
      if (seenOrders.has(order)) {
        issues.push({
          code: 'DUPLICATE_RULE_TRANSACTION_ORDER',
          transactionId,
          order,
          eventIds: [seenOrders.get(order), event.id || null],
        });
      } else {
        seenOrders.set(order, event.id || null);
      }
    });
  });

  statOwners.forEach((owners, statEventKey) => {
    const semanticOwners = owners.filter(event => event?.type !== 'statEvents');
    if (semanticOwners.length <= 1) return;
    issues.push({
      code: 'DUPLICATE_STAT_EVENT_OWNER',
      statEventKey,
      eventIds: semanticOwners.map(event => event.id || null),
    });
  });
  return issues;
}

export function assertValidRuleResolutionEvents(events = []) {
  const issues = validateRuleResolutionEvents(events);
  if (issues.length) {
    throw new TypeError(`[rule resolution transaction] ${JSON.stringify(issues)}`);
  }
  return events;
}
