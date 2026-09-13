import { statEventIdentity } from './ruleResolutionTransaction';

export const ANIMATION_COMPILED_SCHEMA_VERSION = 1;

// COMPOSITE owns its children unless a nested semantic event supplies an owner.
// Combined legacy animations represent two projections of the same stat event.
export function flattenAnimationCoverageSteps(queue = [], inheritedOwner = null) {
  return (Array.isArray(queue) ? queue : []).flatMap(step => {
    if (!step) return [];
    const owner = step.visualEventId || inheritedOwner;
    if (step.type === 'COMPOSITE') return flattenAnimationCoverageSteps(step.steps, owner);
    const owned = owner && !step.visualEventId ? { ...step, visualEventId: owner } : step;
    if (step.type === 'HP_SAN_DAMAGE' || step.type === 'HP_SAN_HEAL') {
      const suffix = step.type === 'HP_SAN_HEAL' ? 'HEAL' : 'DAMAGE';
      return [{ ...owned, type: `HP_${suffix}` }, { ...owned, type: `SAN_${suffix}` }];
    }
    return [owned];
  });
}

const statKeys = step => (Array.isArray(step?.statEvents) ? step.statEvents : []).map(statEventIdentity);
const sourceKeys = step => (Array.isArray(step?.sourceStatEventIds) ? step.sourceStatEventIds : []).map(id => `id:${id}`);
const cardKey = card => card?.id || (card ? `${card.key || ''}:${card.name || ''}` : null);

function stepSubject(step) {
  const subject = {};
  for (const key of [
    'targetPid', 'targetIdx', 'targetIndex', 'sourceIdx', 'sourcePid',
    'playerIdx', 'playerIndex', 'actorIdx', 'ownerIdx', 'casterIdx',
    'fromPid', 'toPid', 'fromIdx', 'toIdx', 'dest', 'count', 'effect', 'succeeded',
  ]) {
    if (step?.[key] != null) subject[key] = step[key];
  }
  for (const key of ['hitIndices', 'deadIndices', 'targetIndices', 'playerIndices', 'affectedIndices']) {
    if (Array.isArray(step?.[key])) subject[key] = [...step[key]].sort((a, b) => a - b);
  }
  if (step?.card) subject.card = cardKey(step.card);
  if (Array.isArray(step?.cards)) subject.cards = step.cards.map(cardKey);
  return subject;
}

function sameSubject(expected, actual) {
  const subject = stepSubject(expected);
  const candidate = stepSubject(actual);
  return Object.entries(subject).every(([key, value]) => JSON.stringify(candidate[key]) === JSON.stringify(value));
}

export function buildAnimationQueueStepManifest(queue = []) {
  return flattenAnimationCoverageSteps(queue).map(step => ({
    visualEventId: step.visualEventId || null,
    type: step.type,
    statEventKeys: statKeys(step),
    sourceStatEventIds: [...(step.sourceStatEventIds || [])],
    subject: stepSubject(step),
  }));
}

// Independent events may already have been consumed or be outside this queue's
// scope. Compare only explicit dependencies represented on both sides here.
export function validateAnimationQueueEventDependencies(queue = [], events = []) {
  const known = new Map();
  const ancestors = new Map();
  const visit = (event, parentIds = []) => {
    if (!event?.id) return;
    known.set(event.id, event);
    if (!ancestors.has(event.id)) ancestors.set(event.id, new Set());
    parentIds.forEach(id => ancestors.get(event.id).add(id));
    (event.settlementEvents || []).forEach(child => visit(child, [...parentIds, event.id]));
  };
  events.forEach(event => visit(event));
  const positions = new Map();
  flattenAnimationCoverageSteps(queue).forEach((step, index) => {
    if (!step.visualEventId) return;
    if (!positions.has(step.visualEventId)) positions.set(step.visualEventId, []);
    positions.get(step.visualEventId).push(index);
  });
  const issues = [];
  known.forEach(event => {
    for (const field of ['causedByEventId', 'targetResolutionEventId']) {
      const dependencyId = event[field];
      const before = positions.get(dependencyId);
      const after = positions.get(event.id);
      if (!before?.length || !after?.length) continue;
      // A parent settlement deliberately surrounds its nested event; that is
      // containment, not two independent blocks that can be ordered end/start.
      if (ancestors.get(event.id)?.has(dependencyId) || ancestors.get(dependencyId)?.has(event.id)) continue;
      if (before.at(-1) >= after[0]) issues.push({
        code: 'VISUAL_EVENT_DEPENDENCY_PLAYBACK_OUT_OF_ORDER',
        eventId: event.id,
        field,
        dependencyId,
        dependencyEndIndex: before.at(-1),
        eventStartIndex: after[0],
      });
    }
  });
  return issues;
}

// Coverage records the complete work represented in an assembled queue. It is
// deliberately independent of which event ids playback has actually consumed.
export function queueCoversCompiledEvent(event, expectedQueue, actualQueue, visualEvents = []) {
  const expected = flattenAnimationCoverageSteps(expectedQueue);
  const actual = flattenAnimationCoverageSteps(actualQueue);
  if (!expected.length) return false;
  const wrapper = event?.type === 'statEvents';
  const eventStatKeys = new Set((event?.statEvents || []).map(statEventIdentity));
  const explicitOwners = new Set(visualEvents
    .filter(candidate => candidate?.type !== 'statEvents'
      && (candidate?.statEvents || []).some(stat => eventStatKeys.has(statEventIdentity(stat))))
    .map(candidate => candidate.id).filter(Boolean));
  const ownerMatches = (requirement, candidate) => {
    if (candidate.visualEventId === requirement.visualEventId) return true;
    return wrapper && (!candidate.visualEventId || explicitOwners.has(candidate.visualEventId));
  };
  const ownerStats = new Map(visualEvents.map(owner => [owner?.id,
    new Set((owner?.statEvents || []).map(statEventIdentity))]));
  const sourceMatches = (requirement, candidate, keys) => {
    const sources = sourceKeys(candidate);
    if (sources.length) return keys.every(key => sources.includes(key));
    // Old serialized consequences had no source ids. Infer only an unambiguous
    // consequence in this owner's timeline; two deaths of the same target must
    // never become interchangeable merely because both render GUILLOTINE.
    const equivalent = expected.filter(step => step.type === requirement.type && sameSubject(requirement, step));
    if (equivalent.length !== 1) return false;
    if (!candidate.visualEventId) return wrapper;
    const owned = ownerStats.get(candidate.visualEventId);
    return !!owned && keys.every(key => owned.has(key));
  };
  const usedProjections = new Set();
  let cursor = -1;
  return expected.every(requirement => {
    const requiredStats = statKeys(requirement);
    if (requiredStats.length) {
      const positions = [];
      for (const key of requiredStats) {
        let found = null;
        for (let index = cursor + 1; index < actual.length && !found; index += 1) {
          const candidate = actual[index];
          if (candidate.type !== requirement.type || !ownerMatches(requirement, candidate)) continue;
          const member = statKeys(candidate).findIndex((candidateKey, memberIndex) => (
            candidateKey === key && !usedProjections.has(`${index}:${memberIndex}`)
          ));
          if (member >= 0) found = { index, member };
        }
        if (!found) return false;
        usedProjections.add(`${found.index}:${found.member}`);
        positions.push(found.index);
      }
      cursor = Math.max(...positions);
      return true;
    }
    const requiredSources = sourceKeys(requirement);
    const positions = (requiredSources.length ? requiredSources : [null]).map(source => (
      actual.findIndex((candidate, index) => (
        index > cursor && candidate.type === requirement.type && ownerMatches(requirement, candidate)
        && sameSubject(requirement, candidate)
        && (source == null || sourceMatches(requirement, candidate, [source]))
      ))
    ));
    if (positions.some(index => index < 0)) return false;
    cursor = Math.max(...positions);
    return true;
  });
}
