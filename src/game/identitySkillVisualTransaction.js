import { createRuleResolutionTransaction } from './ruleResolutionTransaction';
import {
  compileFreshVisualEventQueue,
  compileRuleVisualEventsToAnimTransaction,
} from './visualEventTransactionCompiler';
import {
  getVisualEventIdsFromState,
  getVisualEvents,
  VISUAL_EVENT,
} from './visualEvents';

export const IDENTITY_SKILL_VISUAL_EVENT_TYPES = Object.freeze({
  swap: [VISUAL_EVENT.SWAP_CARDS],
  bewitch: [VISUAL_EVENT.BEWITCH_GIFT],
  hunt: [VISUAL_EVENT.HUNT_TARGET, VISUAL_EVENT.HUNT_REVEAL, VISUAL_EVENT.HUNT_RESULT],
});

const HUNT_EVENT_TYPES = new Set(IDENTITY_SKILL_VISUAL_EVENT_TYPES.hunt);
const HUNT_PHASE_ORDER = Object.freeze({
  [VISUAL_EVENT.HUNT_TARGET]: 0,
  [VISUAL_EVENT.HUNT_REVEAL]: 10,
  [VISUAL_EVENT.HUNT_RESULT]: 30,
  [VISUAL_EVENT.HAND_LIMIT_DISCARD]: 40,
});

function uniqueEvents(events = []) {
  const seenIds = new Set();
  const seenRefs = new Set();
  return (Array.isArray(events) ? events : []).filter(event => {
    if (!event) return false;
    if (event.id) {
      if (seenIds.has(event.id)) return false;
      seenIds.add(event.id);
      return true;
    }
    if (seenRefs.has(event)) return false;
    seenRefs.add(event);
    return true;
  });
}

export function appendIdentitySkillEvents(state, events, {
  transactionId,
  phase = 'identitySkill',
  barrier = 'continuation',
  decorateEvent = event => event,
} = {}) {
  const ownedEvents = uniqueEvents(events);
  if (!ownedEvents.length) return state;
  const resolvedTransactionId = transactionId || `identity:${ownedEvents[0].type}:${ownedEvents[0].id}`;
  const transaction = createRuleResolutionTransaction({
    id: resolvedTransactionId,
    phase,
    barrier,
    events: ownedEvents.map((event, index) => decorateEvent(event, index)),
  });
  const ownedIds = new Set(transaction.events.map(event => event?.id).filter(Boolean));
  return {
    ...state,
    _visualEvents: uniqueEvents([
      ...(state?._visualEvents || []).filter(event => !event?.id || !ownedIds.has(event.id)),
      ...transaction.events,
    ]),
  };
}

export function buildIdentitySkillVisualTransaction({
  previousState,
  state,
  events,
  transactionId,
  phase = 'identitySkill',
  barrier = 'continuation',
  decorateEvent,
  compileOptions = {},
} = {}) {
  const nextState = appendIdentitySkillEvents(state, events, {
    transactionId,
    phase,
    barrier,
    decorateEvent,
  });
  return {
    state: nextState,
    queue: compileFreshVisualEventQueue(previousState, nextState, compileOptions),
  };
}

function nestedOwnedEventIds(events = []) {
  return new Set(events.flatMap(event => (
    Array.isArray(event?.settlementEvents)
      ? event.settlementEvents.map(nested => nested?.id).filter(Boolean)
      : []
  )));
}

function ownedStatEventKeys(events = []) {
  return new Set(events.flatMap(event => [
    ...(event?.statEvents || []),
    ...(event?.settlementEvents || []).flatMap(nested => nested?.statEvents || []),
  ]).map(event => JSON.stringify(event)));
}

export function compileFreshIdentitySkillVisualTransaction(
  state,
  previousState = null,
  { eventTypes = [], compileOptions = {} } = {},
) {
  const acceptedTypes = new Set(Array.isArray(eventTypes) ? eventTypes : [eventTypes]);
  const normalizedVisualEvents = getVisualEvents(state);
  const previousIds = new Set(getVisualEventIdsFromState(previousState));
  const freshVisualEvents = normalizedVisualEvents.filter(event => (
    event?.id && !previousIds.has(event.id)
  ));
  const rootEvents = freshVisualEvents.filter(event => acceptedTypes.has(event?.type));
  if (!rootEvents.length) return null;

  const transactionIds = new Set(rootEvents.map(event => event?.transactionId).filter(Boolean));
  const phaseGroupIds = new Set(rootEvents.flatMap(event => (
    [event?.attemptId, event?.phaseGroupId].filter(Boolean)
  )));
  const dependencyIds = new Set(rootEvents.flatMap(event => (
    [event?.causedByEventId, event?.targetResolutionEventId].filter(Boolean)
  )));
  const nestedIds = nestedOwnedEventIds(rootEvents);
  const statKeys = ownedStatEventKeys(rootEvents);
  const ownedEvents = freshVisualEvents.filter(event => (
    rootEvents.includes(event)
    || dependencyIds.has(event?.id)
    || nestedIds.has(event?.id)
    || (
      event?.type === VISUAL_EVENT.STAT_EVENTS
      && (event?.statEvents || []).some(statEvent => statKeys.has(JSON.stringify(statEvent)))
    )
    || (event?.transactionId && transactionIds.has(event.transactionId))
    || (event?.phaseGroupId && phaseGroupIds.has(event.phaseGroupId))
  ));
  const compileState = { ...state, _visualEvents: normalizedVisualEvents };
  const transaction = compileRuleVisualEventsToAnimTransaction(compileState, previousState, {
    ...compileOptions,
    eventIds: ownedEvents.map(event => event.id),
  });
  return transaction ? { transaction, rootEvents, ownedEvents } : null;
}

export function buildSwapCardsVisualTransaction({ previousState, state, swapEvent, barrier = 'continuation' } = {}) {
  return buildIdentitySkillVisualTransaction({
    previousState,
    state,
    events: [swapEvent],
    transactionId: swapEvent?.transactionId || `identity:swap:${swapEvent?.id}`,
    phase: 'identitySkill:swap',
    barrier,
  });
}

export function compileFreshSwapVisualTransaction(state, previousState = null, compileOptions = {}) {
  return compileFreshIdentitySkillVisualTransaction(state, previousState, {
    eventTypes: IDENTITY_SKILL_VISUAL_EVENT_TYPES.swap,
    compileOptions,
  });
}

export function buildBewitchGiftVisualTransaction({
  previousState,
  state,
  bewitchEvent,
  relatedEvents = [],
  barrier = 'continuation',
} = {}) {
  const result = buildIdentitySkillVisualTransaction({
    previousState,
    state,
    events: [...relatedEvents, bewitchEvent].filter(Boolean),
    transactionId: bewitchEvent?.transactionId || `identity:bewitch:${bewitchEvent?.id}`,
    phase: 'identitySkill:bewitch',
    barrier,
  });
  const inspectionEvents = (bewitchEvent?.settlementEvents || [])
    .filter(event => event?.type === VISUAL_EVENT.INSPECTION);
  return {
    ...result,
    inspectionEvents,
    inspectionSeq: Math.max(previousState?._inspectionSeq || 0, ...inspectionEvents.map(event => event?.legacySeq ?? event?.seq ?? 0)),
  };
}

export function compileFreshBewitchVisualTransaction(state, previousState = null, compileOptions = {}) {
  const result = compileFreshIdentitySkillVisualTransaction(state, previousState, {
    eventTypes: IDENTITY_SKILL_VISUAL_EVENT_TYPES.bewitch,
    compileOptions,
  });
  if (!result) return null;
  const inspectionEvents = result.rootEvents.flatMap(event => (
    (event?.settlementEvents || []).filter(nested => nested?.type === VISUAL_EVENT.INSPECTION)
  ));
  return { ...result, inspectionEvents };
}

export function getHuntAttemptId(state, hunterIdx, targetIdx) {
  const recordedAttempt = [...(state?._visualEvents || [])].findLast(event => (
    HUNT_EVENT_TYPES.has(event?.type)
    && event?.attemptId
    && (hunterIdx == null || (event.sourceIdx ?? event.hunterIdx) === hunterIdx)
    && (targetIdx == null || event.targetIdx === targetIdx)
  ));
  return state?.abilityData?.huntPromptId
    || recordedAttempt?.attemptId
    || `hunt:${state?._turnKey ?? state?.turn ?? 0}:${hunterIdx ?? state?.currentTurn ?? 0}:${targetIdx ?? 0}:${state?.log?.length ?? 0}`;
}

export function appendHuntStageEvents(state, events, {
  attemptId,
  stage = 'settlement',
  barrier = 'decision',
} = {}) {
  const ownedEvents = uniqueEvents(events);
  if (!ownedEvents.length) return state;
  const resolvedAttemptId = attemptId || getHuntAttemptId(
    state,
    ownedEvents[0]?.sourceIdx ?? ownedEvents[0]?.hunterIdx,
    ownedEvents[0]?.targetIdx,
  );
  return appendIdentitySkillEvents(state, ownedEvents, {
    transactionId: `${resolvedAttemptId}:${stage}`,
    phase: `hunt:${stage}`,
    barrier,
    decorateEvent: event => ({
      ...event,
      attemptId: event.attemptId || resolvedAttemptId,
      phaseGroupId: event.phaseGroupId || resolvedAttemptId,
      phaseOrder: event.phaseOrder ?? HUNT_PHASE_ORDER[event.type] ?? 0,
    }),
  });
}

export function buildHuntStageVisualTransaction({
  previousState,
  state,
  events,
  attemptId,
  stage = 'settlement',
  barrier = 'decision',
  compileOptions = {},
} = {}) {
  const nextState = appendHuntStageEvents(state, events, { attemptId, stage, barrier });
  return {
    state: nextState,
    queue: compileFreshVisualEventQueue(previousState, nextState, compileOptions),
    attemptId: attemptId || getHuntAttemptId(nextState),
  };
}

export function compileFreshHuntVisualTransaction(state, previousState = null, compileOptions = {}) {
  const result = compileFreshIdentitySkillVisualTransaction(state, previousState, {
    eventTypes: IDENTITY_SKILL_VISUAL_EVENT_TYPES.hunt,
    compileOptions: { allowTargetZero: true, ...compileOptions },
  });
  return result ? {
    ...result,
    freshHuntEvents: result.rootEvents,
  } : null;
}
