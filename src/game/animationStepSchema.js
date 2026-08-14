import { expandCombinedStatAnimationSteps } from './statEvents';

const GENERIC_STAT_STEP_TYPES = new Set([
  'HP_DAMAGE',
  'HP_HEAL',
  'SAN_DAMAGE',
  'SAN_HEAL',
]);

const COMBINED_STAT_STEP_TYPES = new Set([
  'HP_SAN_DAMAGE',
  'HP_SAN_HEAL',
]);

const PRESENTATION_ONLY_DEATH_TYPES = new Set([
  'GUILLOTINE',
  'PETRIFY_DEATH',
]);

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function issue(code, stepIndex, details = {}) {
  return { code, stepIndex, ...details };
}

function hasExplicitStatEvents(step) {
  return Array.isArray(step?.statEvents) && step.statEvents.length > 0;
}

function hasStatTarget(step) {
  return hasOwn(step, 'targetStats') && Array.isArray(step.targetStats);
}

function isFiniteStatPair(value) {
  return value && Number.isFinite(value.hp) && Number.isFinite(value.san);
}

function isValidSlimePresentation(step) {
  const presentation = step?.statPresentation;
  return !!presentation &&
    Number.isInteger(presentation.target) && presentation.target >= 0 &&
    isFiniteStatPair(presentation.from) &&
    isFiniteStatPair(presentation.to) &&
    (step.targetPid == null || Number(step.targetPid) === presentation.target);
}

export function normalizeAnimationQueueSteps(queue = []) {
  return expandCombinedStatAnimationSteps(queue)
    .map(step => {
      if (!step || typeof step !== 'object') return step;
      const normalized = { ...step };
      if (hasExplicitStatEvents(normalized) && hasOwn(normalized, 'targetStats')) {
        delete normalized.targetStats;
      } else if (GENERIC_STAT_STEP_TYPES.has(normalized.type) && hasStatTarget(normalized)) {
        normalized.legacyStatTarget = true;
      }
      return normalized;
    });
}

export function validateAnimationQueueSteps(queue = [], { allowCombined = false } = {}) {
  const steps = Array.isArray(queue) ? queue : [];
  const issues = [];
  const stepIds = new Map();
  const eventIds = new Map();

  steps.forEach((step, stepIndex) => {
    if (!step || typeof step !== 'object') {
      issues.push(issue('INVALID_STEP', stepIndex));
      return;
    }

    if (Number.isFinite(step.durationMs) && Number.isFinite(step.impactAtMs) && step.impactAtMs > step.durationMs) {
      issues.push(issue('IMPACT_AFTER_DURATION', stepIndex, {
        durationMs: step.durationMs,
        impactAtMs: step.impactAtMs,
      }));
    }

    if (!allowCombined && COMBINED_STAT_STEP_TYPES.has(step.type)) {
      issues.push(issue('UNNORMALIZED_COMBINED_STAT_STEP', stepIndex, { type: step.type }));
    }

    const explicitStatEvents = hasExplicitStatEvents(step);
    const targetStats = hasStatTarget(step);
    if (targetStats && (step.visualEventId || step.turnStartStage)) {
      issues.push(issue('LEGACY_TARGET_STATS_IN_EVENT_TRANSACTION', stepIndex, {
        type: step.type,
        visualEventId: step.visualEventId,
        turnStartStage: step.turnStartStage,
      }));
    }
    if (explicitStatEvents && hasOwn(step, 'targetStats')) {
      issues.push(issue('STAT_EVENTS_TARGET_STATS_CONFLICT', stepIndex, { type: step.type }));
    }
    const authorizedCombinedStatEvents = allowCombined && COMBINED_STAT_STEP_TYPES.has(step.type);
    if (explicitStatEvents && !GENERIC_STAT_STEP_TYPES.has(step.type) && !authorizedCombinedStatEvents) {
      issues.push(issue('UNAUTHORIZED_STAT_EVENTS', stepIndex, { type: step.type }));
    }
    if (targetStats && !GENERIC_STAT_STEP_TYPES.has(step.type) && !COMBINED_STAT_STEP_TYPES.has(step.type)) {
      issues.push(issue('UNAUTHORIZED_TARGET_STATS', stepIndex, { type: step.type }));
    }
    if (hasOwn(step, 'statPresentation') && step.type !== 'TSG_SLIME_POP') {
      issues.push(issue('UNAUTHORIZED_STAT_PRESENTATION', stepIndex, { type: step.type }));
    }
    if (PRESENTATION_ONLY_DEATH_TYPES.has(step.type) && (
      explicitStatEvents || targetStats || hasOwn(step, 'statPresentation')
    )) {
      issues.push(issue('DEATH_PRESENTATION_WRITES_STATS', stepIndex, { type: step.type }));
    }
    if (step.type === 'TSG_SLIME_POP' && hasOwn(step, 'statPresentation') && !isValidSlimePresentation(step)) {
      issues.push(issue('INVALID_SLIME_STAT_PRESENTATION', stepIndex));
    }

    if (step.id != null) {
      if (stepIds.has(step.id)) {
        issues.push(issue('DUPLICATE_STEP_ID', stepIndex, { id: step.id, firstStepIndex: stepIds.get(step.id) }));
      } else {
        stepIds.set(step.id, stepIndex);
      }
    }
    (Array.isArray(step.statEvents) ? step.statEvents : []).forEach((event, eventIndex) => {
      if (event?.id == null) return;
      if (eventIds.has(event.id)) {
        const firstOccurrence = eventIds.get(event.id);
        const firstStep = steps[firstOccurrence.stepIndex];
        const isSplitCombinedEvent =
          (event.type === 'HP_SAN_LOSS' || event.type === 'HP_SAN_GAIN') &&
          ((firstStep?.type === 'HP_DAMAGE' && step.type === 'SAN_DAMAGE') ||
            (firstStep?.type === 'SAN_DAMAGE' && step.type === 'HP_DAMAGE') ||
            (firstStep?.type === 'HP_HEAL' && step.type === 'SAN_HEAL') ||
            (firstStep?.type === 'SAN_HEAL' && step.type === 'HP_HEAL'));
        // A combined HP/SAN event is deliberately shared by the two normalized
        // resource animations. It is one rule event with two visual impacts,
        // not a duplicated write in the same resource timeline.
        if (!isSplitCombinedEvent) {
          issues.push(issue('DUPLICATE_STAT_EVENT_ID', stepIndex, {
            id: event.id,
            eventIndex,
            firstOccurrence,
          }));
        }
      } else {
        eventIds.set(event.id, { stepIndex, eventIndex });
      }
    });
  });

  return issues;
}

export function validateThrowStoneTransactions(queue = []) {
  const steps = Array.isArray(queue) ? queue : [];
  const eventIds = [...new Set(steps
    .filter(step => step?.visualEventId && (
      (step.type === 'DICE_ROLL' && step.diceMode === 'throwStone') ||
      step.type === 'RANDOM_TARGET' ||
      step.type === 'THROW_STONE'
    ))
    .map(step => step.visualEventId))];

  return eventIds.flatMap(visualEventId => {
    const eventSteps = steps
      .map((step, stepIndex) => ({ step, stepIndex }))
      .filter(item => item.step?.visualEventId === visualEventId);
    const requiredTypes = ['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE'];
    const requiredIndices = requiredTypes.map(type => eventSteps.find(item => (
      item.step.type === type && (type !== 'DICE_ROLL' || item.step.diceMode === 'throwStone')
    ))?.stepIndex ?? -1);
    if (requiredIndices.some(stepIndex => stepIndex < 0)) {
      return [issue('INCOMPLETE_THROW_STONE_TRANSACTION', requiredIndices.find(index => index >= 0) ?? -1, {
        visualEventId,
        types: eventSteps.map(item => item.step.type),
        missingTypes: requiredTypes.filter((_, index) => requiredIndices[index] < 0),
      })];
    }
    if (!(requiredIndices[0] < requiredIndices[1] && requiredIndices[1] < requiredIndices[2])) {
      return [issue('INVALID_THROW_STONE_ORDER', requiredIndices[0], {
        visualEventId,
        types: eventSteps.map(item => item.step.type),
      })];
    }
    return [];
  });
}

export function assertCompleteThrowStoneTransactions(queue = []) {
  const issues = validateThrowStoneTransactions(queue);
  if (issues.length) {
    throw new TypeError(`[animation-transaction] incomplete throw-stone transaction: ${JSON.stringify(issues)}`);
  }
  return queue;
}

export function prepareAnimationQueueSteps(queue = []) {
  const sourceIssues = [
    ...validateAnimationQueueSteps(queue, { allowCombined: true }),
    ...validateThrowStoneTransactions(queue),
  ];
  const steps = normalizeAnimationQueueSteps(queue);
  const normalizedIssues = validateAnimationQueueSteps(steps);
  const issueKey = value => JSON.stringify(value);
  const seen = new Set();
  const issues = [...sourceIssues, ...normalizedIssues].filter(value => {
    const key = issueKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { steps, issues };
}
