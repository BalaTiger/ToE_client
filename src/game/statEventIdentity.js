// Rules allocate identities once. This counter deliberately does not consume
// Math.random: doing so would change later dice rolls, targets and hidden loot.
const session = globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${globalThis.performance?.now?.().toString(36) || '0'}`;
let nextId = 0;
const referenceIds = new WeakMap();
const statTypes = new Set(['HP_LOSS', 'HP_GAIN', 'SAN_LOSS', 'SAN_GAIN',
  'HP_SAN_LOSS', 'HP_SAN_GAIN', 'DAMAGE_LINK_BREAK', 'PLAYER_DEFEATED']);

export function ensureStatEventId(event, { prefix = 'stat' } = {}) {
  if (!event || typeof event !== 'object') return event;
  if (event.id != null && event.id !== '') return event;
  let id = referenceIds.get(event);
  if (!id) {
    id = `${prefix}:${session}:${++nextId}`;
    referenceIds.set(event, id);
  }
  return { ...event, id };
}

export function statEventIdentity(event = {}) {
  return `id:${ensureStatEventId(event)?.id}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort()
    .filter(key => value[key] !== undefined)
    .map(key => [key, stableValue(value[key])]));
}

// Payload equality is compatibility evidence only, never runtime identity.
// phaseOrder is removed by the timeline compiler; all actual loss data remains.
function legacySignature(event) {
  return JSON.stringify(stableValue(Object.fromEntries(Object.entries(event)
    .filter(([key]) => key !== 'id' && key !== 'phaseOrder'))));
}

// Compatibility for pre-ownership black-night target records. Run once while
// constructing their queue; runtime matching consumes only the resulting IDs.
export function adaptLegacyApophisTargetOwnership({ targetEvent, builtQueue = [], queue = [] } = {}) {
  if (!targetEvent || Array.isArray(targetEvent.statEvents) || Array.isArray(targetEvent.statEventIds)
    || targetEvent.statSeq == null) return { targetEvent, issues: [] };
  const candidates = steps => {
    const events = steps.filter(step => (
      step?.type === 'SAN_DAMAGE'
      && (!targetEvent.id || !step.visualEventId || step.visualEventId === targetEvent.id)
      && (step._apophisTargetSeq == null || step._apophisTargetSeq === targetEvent.seq)
      && Array.isArray(step.statEvents) && step.statEvents.length
      && step.statEvents.every(event => (
        event?.seq === targetEvent.statSeq
        && (!event.type || event.type === 'SAN_LOSS')
        && (targetEvent.actorIdx == null || event.target === targetEvent.actorIdx)
        && (!event.reason || event.reason === '黑夜')
        && (!targetEvent.log || !event.logHint || event.logHint === targetEvent.log)
      ))
    )).flatMap(step => step.statEvents);
    return [...new Map(events.map(event => [event.id || event, event])).values()];
  };
  const built = candidates(builtQueue);
  const queued = candidates(queue);
  const conflict = built.length > 1 || queued.length > 1 || (built.length && queued.length && (
    (built[0].id && queued[0].id && built[0].id !== queued[0].id)
    || legacySignature(built[0]) !== legacySignature(queued[0])
  ));
  if (conflict) {
    return { targetEvent, issues: [{ code: 'AMBIGUOUS_LEGACY_APOPHIS_STATS',
      targetEventId: targetEvent.id || null, targetSequence: targetEvent.seq,
      candidateCount: Math.max(built.length, queued.length),
    }] };
  }
  if (!built.length) return { targetEvent: { ...targetEvent, statEventIds: [] }, issues: [] };
  const event = built[0], peer = queued[0];
  const id = event.id || peer?.id || referenceIds.get(event) || (peer && referenceIds.get(peer))
    || ensureStatEventId(event, { prefix: 'legacy-night-stat' }).id;
  if (!event.id) referenceIds.set(event, id);
  if (peer && !peer.id) referenceIds.set(peer, id);
  return { targetEvent: { ...targetEvent, statEventIds: [id] }, issues: [] };
}

function adaptLegacyStatMetadata(graph) {
  const issues = [...graph.issues];
  const adapt = state => {
    if (!state || typeof state !== 'object') return state;
    const visualEvents = state._visualEvents || [];
    const byId = new Map(visualEvents.filter(event => event?.id).map(event => [event.id, event]));
    const journal = state._statEvents || [];
    const unique = events => [...new Map(events.filter(event => event?.id).map(event => [event.id, event])).values()];
    const lookup = (value, parentOwner, path) => {
      if (Array.isArray(value.statEventIds)) return null;
      const seqs = value.statEventSeqs || value.statSeqs;
      const hasRange = value.statEventSeqBefore != null && value.statEventSeqAfter != null;
      if (!Array.isArray(seqs) && !hasRange) return null;
      const matches = event => (
        (Array.isArray(seqs) ? seqs.includes(event.seq)
          : event.seq > value.statEventSeqBefore && event.seq <= value.statEventSeqAfter)
        && (!hasRange || value.playerIdx == null || event.target === value.playerIdx)
      );
      const ownerIds = [...(value.statVisualEventIds || []), ...(value.effectVisualEventIds || []), ...(value.visualEventIds || [])];
      const explicitOwners = ownerIds.map(id => byId.get(id)).filter(Boolean);
      const localEvents = parentOwner?.statEvents || [];
      let candidates;
      if (explicitOwners.length) candidates = unique(explicitOwners.flatMap(owner => owner.statEvents || []).filter(matches));
      else if (localEvents.some(matches)) candidates = unique(localEvents.filter(matches));
      else {
        candidates = unique(journal.filter(matches));
        // Sequence metadata alone can identify one old loss, or a complete
        // batch belonging to one known owner. It cannot claim unrelated owners.
        const batches = Array.isArray(seqs)
          ? seqs.map(seq => candidates.filter(event => event.seq === seq))
          : [candidates];
        const ambiguous = batches.some(batch => {
          if (batch.length <= 1) return false;
          const ids = new Set(batch.map(event => event.id));
          const covers = owner => ids.size > 0 && [...ids].every(id => owner.statEvents?.some(event => event.id === id));
          const semantic = visualEvents.filter(owner => owner?.type !== 'statEvents' && owner.statEvents?.some(event => ids.has(event.id)));
          return semantic.length ? semantic.length !== 1 || !covers(semantic[0])
            : !visualEvents.some(owner => owner?.type === 'statEvents' && covers(owner));
        });
        if (ambiguous) {
          issues.push({ code: 'AMBIGUOUS_LEGACY_STAT_METADATA', path, ownerIds,
            candidateStatEventIds: candidates.map(event => event.id) });
          return null;
        }
      }
      return candidates.map(event => event.id);
    };
    const seen = new WeakMap();
    const rewrite = (value, parentOwner = null, path = 'state') => {
      if (!value || typeof value !== 'object' || statTypes.has(value.type)) return value;
      if (seen.has(value)) return seen.get(value);
      const owner = value.id && value.type ? value : parentOwner;
      const ids = lookup(value, owner, path);
      const copy = Array.isArray(value) ? [] : {};
      seen.set(value, copy);
      let changed = ids !== null;
      Object.entries(value).forEach(([key, item]) => {
        copy[key] = rewrite(item, owner, `${path}.${key}`);
        if (copy[key] !== item) changed = true;
      });
      if (ids !== null) copy.statEventIds = ids;
      if (!changed) seen.set(value, value);
      return changed ? copy : value;
    };
    return rewrite(state);
  };
  return { ...graph, state: adapt(graph.state), previousState: adapt(graph.previousState), issues };
}

export function adaptLegacyStatEventGraph({ state = null, previousState = null, queue = [] } = {}) {
  const nodes = new Map();
  const visited = new WeakMap();
  const collect = (value, context, path) => {
    if (!value || typeof value !== 'object') return;
    if (statTypes.has(value.type)) {
      if (!nodes.has(value)) nodes.set(value, { value, contexts: [] });
      nodes.get(value).contexts.push({ ...context, path });
      return;
    }
    const visitKey = `${context.root}:${context.kind}:${context.ownerId || ''}`;
    const priorVisits = visited.get(value) || new Set();
    if (priorVisits.has(visitKey)) return;
    priorVisits.add(visitKey);
    visited.set(value, priorVisits);
    if (Array.isArray(value)) {
      value.forEach((item, index) => collect(item, { ...context, index }, `${path}[${index}]`));
      return;
    }
    Object.entries(value).forEach(([key, item]) => {
      let nextContext = context;
      if (key === '_statEvents') nextContext = { root: context.root, kind: 'journal' };
      if (key === 'statEvents') {
        const inQueue = context.root === 'queue' || context.kind === 'projection';
        nextContext = {
          root: context.root,
          kind: inQueue ? 'projection' : value.type === 'statEvents' ? 'wrapper' : value.id ? 'owner' : 'reference',
          ownerId: inQueue ? value.visualEventId : value.id,
        };
      }
      collect(item, nextContext, `${path}.${key}`);
    });
  };
  collect(state, { root: 'state', kind: 'reference' }, 'state');
  collect(previousState, { root: 'previousState', kind: 'reference' }, 'previousState');
  collect(queue, { root: 'queue', kind: 'projection' }, 'queue');
  const entries = [...nodes.values()];
  if (!entries.some(node => node.value.id == null || node.value.id === '')) {
    return adaptLegacyStatMetadata({ state, previousState, queue, issues: [] });
  }
  entries.forEach(node => { node.signature = legacySignature(node.value); });

  const issues = [];
  const reportedConflicts = new Set();
  const parents = new Map(entries.map(node => [node, node]));
  const find = node => {
    if (parents.get(node) !== node) parents.set(node, find(parents.get(node)));
    return parents.get(node);
  };
  const unite = (left, right) => {
    const a = find(left), b = find(right);
    if (a === b) return;
    const members = entries.filter(node => find(node) === a || find(node) === b);
    const ids = [...new Set(members.map(node => node.value.id).filter(Boolean))];
    if (ids.length > 1) {
      const key = JSON.stringify([...ids].sort());
      if (!reportedConflicts.has(key)) {
        reportedConflicts.add(key);
        issues.push({ code: 'CONFLICTING_STAT_EVENT_IDENTITY', statEventIds: ids,
          paths: members.flatMap(node => node.contexts.map(context => context.path)) });
      }
      return;
    }
    parents.set(b, a);
  };
  const byId = new Map();
  entries.forEach(node => {
    const id = node.value.id;
    if (id == null || id === '') return;
    if (byId.has(id)) unite(node, byId.get(id));
    else byId.set(id, node);
  });
  const groups = new Map();
  entries.forEach(node => {
    if (!groups.has(node.signature)) groups.set(node.signature, []);
    groups.get(node.signature).push(node);
  });
  const distinct = list => [...new Set(list.map(find))];
  const hasKind = (node, kind) => node.contexts.some(context => context.kind === kind);
  groups.forEach(group => {
    if (!group.some(node => !node.value.id)) return;
    // A projection can identify its source even when another owner authored an
    // identical transition. Never infer this from only target or numeric seq.
    group.forEach(node => {
      node.contexts.filter(context => context.kind === 'projection' && context.ownerId).forEach(context => {
        const candidates = group.filter(candidate => candidate.contexts.some(owner => (
          (owner.kind === 'owner' || owner.kind === 'wrapper') && owner.ownerId === context.ownerId
        )));
        const roots = distinct(candidates);
        if (roots.length === 1) unite(candidates[0], node);
      });
    });
    // The same serialized owner and member index denote one old reference.
    const ownerSlots = new Map();
    group.forEach(node => node.contexts.filter(context => (
      (context.kind === 'owner' || context.kind === 'wrapper') && context.ownerId
    )).forEach(context => {
      const key = `${context.kind}:${context.ownerId}:${context.index}`;
      if (ownerSlots.has(key)) unite(ownerSlots.get(key), node);
      else ownerSlots.set(key, node);
    }));
    const rootsWith = kind => distinct(group.filter(node => hasKind(node, kind)));
    const owners = rootsWith('owner');
    // Separate old/new journals may repeat the same persisted member, but two
    // equal entries in one journal are two occurrences, not one event.
    const journalsByRoot = ['state', 'previousState'].map(root => distinct(group.filter(node => (
      node.contexts.some(context => context.kind === 'journal' && context.root === root)
    ))));
    const unbound = group.filter(node => {
      if (node.value.id) return false;
      const connected = group.filter(candidate => find(candidate) === find(node));
      if (connected.some(candidate => candidate.value.id)) return false;
      const contexts = connected.flatMap(candidate => candidate.contexts);
      const hasOwner = contexts.some(context => context.kind === 'owner');
      const hasReference = contexts.some(context => context.kind === 'journal' || context.kind === 'projection' || context.kind === 'reference');
      return !(hasOwner && hasReference);
    });
    const ids = new Set(group.map(node => node.value.id).filter(Boolean));
    const hasUniqueSource = owners.length === 1 || journalsByRoot.some(items => items.length === 1)
      || rootsWith('wrapper').length === 1;
    if (hasUniqueSource && owners.length <= 1 && journalsByRoot.every(items => items.length <= 1) && ids.size <= 1) {
      // One journal occurrence and at most one semantic owner is the only
      // payload-based bridge allowed for old JSON copies and generic wrappers.
      group.slice(1).forEach(node => unite(group[0], node));
      return;
    }
    const needsBridge = owners.length > 0 || group.some(node => hasKind(node, 'wrapper') || hasKind(node, 'projection'));
    const ambiguous = needsBridge && distinct(group).length > 1 && unbound.some(node => {
      const root = find(node);
      return !group.some(candidate => candidate !== node && find(candidate) === root);
    });
    if (ambiguous || (owners.length > 1 && journalsByRoot.every(items => !items.length) && ids.size <= 1)) {
      issues.push({ code: 'AMBIGUOUS_LEGACY_STAT_EVENT_IDENTITY',
        paths: group.flatMap(node => node.contexts.map(context => context.path)),
        ownerIds: [...new Set(group.flatMap(node => node.contexts
          .filter(context => context.kind === 'owner').map(context => context.ownerId)).filter(Boolean))],
      });
    }
  });

  const merged = new Map();
  entries.forEach(node => {
    const root = find(node);
    if (!merged.has(root)) merged.set(root, []);
    merged.get(root).push(node);
  });
  const replacements = new Map();
  merged.forEach(group => {
    let id = group.find(node => node.value.id)?.value.id
      || group.map(node => referenceIds.get(node.value)).find(Boolean);
    if (!id) {
      const owner = group.flatMap(node => node.contexts).find(context => context.kind === 'owner' && context.ownerId)
        || group.flatMap(node => node.contexts).find(context => context.kind === 'wrapper' && context.ownerId);
      id = owner ? `legacy-stat:${owner.ownerId}:${owner.index}`
        : referenceIds.get(group[0].value) || ensureStatEventId(group[0].value, { prefix: 'legacy-stat' }).id;
    }
    group.forEach(node => {
      if (node.value.id) return;
      referenceIds.set(node.value, id);
      replacements.set(node.value, { ...node.value, id });
    });
  });
  const cloned = new WeakMap();
  const rewrite = value => {
    if (!value || typeof value !== 'object') return value;
    if (replacements.has(value)) return replacements.get(value);
    if (cloned.has(value)) return cloned.get(value);
    const copy = Array.isArray(value) ? [] : {};
    cloned.set(value, copy);
    let changed = false;
    Object.entries(value).forEach(([key, item]) => {
      copy[key] = rewrite(item);
      if (copy[key] !== item) changed = true;
    });
    if (!changed) cloned.set(value, value);
    return changed ? copy : value;
  };
  return adaptLegacyStatMetadata({ state: rewrite(state), previousState: rewrite(previousState), queue: rewrite(queue), issues });
}
