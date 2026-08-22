import { getAiActionQueueCoverage } from './aiTurnPresentation';
import {
  ANIMATION_QUEUE_AUTHORITY,
  getAnimationQueueVisualEventIds,
  getVisualEventIdsCoveredByAnimationQueue,
} from './visualEventTransactionCompiler';

export const AUTHORITATIVE_QUEUE_META = Object.freeze({
  authority: ANIMATION_QUEUE_AUTHORITY.QUEUE,
});

export const LEGACY_MERGE_ACTION_SCOPE_META = Object.freeze({
  authority: ANIMATION_QUEUE_AUTHORITY.LEGACY_MERGE,
  visualEventScope: 'action',
});

export function authoritativeTurnStartQueueMeta(state) {
  const eventIds = (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .filter(event => event?.turnStartStage && event?.id)
    .map(event => event.id);
  return eventIds.length
    ? { ...AUTHORITATIVE_QUEUE_META, eventIds }
    : AUTHORITATIVE_QUEUE_META;
}

export function strictActionQueueMeta(
  state,
  queue,
  consumedEventIds = null,
  context = 'action queue',
  coverageOptions = {},
) {
  const declaredEventIds = Array.isArray(coverageOptions?.eventIds)
    ? [...new Set(coverageOptions.eventIds.filter(Boolean))]
    : null;
  if (declaredEventIds) {
    const declaredSet = new Set(declaredEventIds);
    const stateEvents = Array.isArray(state?._visualEvents) ? state._visualEvents : [];
    const stateEventIds = new Set(stateEvents.map(event => event?.id).filter(Boolean));
    const missingDeclaredEventIds = declaredEventIds.filter(id => !stateEventIds.has(id));
    const foreignQueueEventIds = getAnimationQueueVisualEventIds(queue)
      .filter(id => !declaredSet.has(id));
    if (missingDeclaredEventIds.length || foreignQueueEventIds.length) {
      throw new TypeError(`[${context}] queue ownership mismatch: ${JSON.stringify({
        missingDeclaredEventIds,
        foreignQueueEventIds,
      })}`);
    }
    // Unscoped action events are migration-era journal orphans. They must not
    // make an unrelated declared transaction fail, but keep them observable so
    // their producer can be migrated instead of being silently forgotten.
    const isConsumed = id => !!id && (
      consumedEventIds?.has?.(id)
      || (Array.isArray(consumedEventIds) && consumedEventIds.includes(id))
    );
    const orphanEventIds = stateEvents
      .filter(event => (
        event?.id
        && !event?.turnStartStage
        && !event?.transactionId
        && !declaredSet.has(event.id)
        && !isConsumed(event.id)
      ))
      .map(event => event.id);
    if (orphanEventIds.length && import.meta.env?.DEV) {
      console.warn(`[${context}] unowned visual event journal entries`, { orphanEventIds });
    }
  }
  const coverage = getAiActionQueueCoverage(
    state,
    queue,
    steps => getVisualEventIdsCoveredByAnimationQueue(state, steps),
    consumedEventIds,
    coverageOptions,
  );
  if (coverage.uncoveredEventIds.length) {
    const uncoveredSet = new Set(coverage.uncoveredEventIds);
    const uncoveredEvents = (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
      .filter(event => uncoveredSet.has(event?.id))
      .map(event => ({
        id: event.id,
        type: event.type,
        scope: event.scope,
        transactionId: event.transactionId || null,
      }));
    const queueTypes = (Array.isArray(queue) ? queue : []).map(step => step?.type || 'UNKNOWN');
    throw new TypeError(`[${context}] queue is missing visual events: ${JSON.stringify({ uncoveredEvents, queueTypes })}`);
  }
  return coverage.eventIds.length
    ? { ...AUTHORITATIVE_QUEUE_META, eventIds: coverage.eventIds }
    : AUTHORITATIVE_QUEUE_META;
}

export function authoritativeResolvedQueueMeta(
  state,
  queue,
  consumedEventIds = null,
  additionalEventIds = [],
  coverageOptions = {},
) {
  const base = strictActionQueueMeta(
    state,
    queue,
    consumedEventIds,
    'resolved action queue',
    coverageOptions,
  );
  const eventIds = [...new Set([
    ...(base.eventIds || []),
    ...(Array.isArray(additionalEventIds) ? additionalEventIds : []),
  ].filter(Boolean))];
  return eventIds.length ? { ...AUTHORITATIVE_QUEUE_META, eventIds } : AUTHORITATIVE_QUEUE_META;
}

// Transaction-aware adapter for local action flows. The previous state marks
// the input snapshot, so coverage includes only visual events introduced by
// this resolved action and leaves replay history out of the invariant check.
export function authoritativeResolvedTransitionQueueMeta(
  previousState,
  state,
  queue,
  consumedEventIds = null,
  additionalEventIds = [],
) {
  return authoritativeResolvedQueueMeta(
    state,
    queue,
    consumedEventIds,
    additionalEventIds,
    { previousState },
  );
}

export function authoritativeEndTurnReplayQueueMeta(state, queue, consumedEventIds = null) {
  return strictActionQueueMeta(state, queue, consumedEventIds, 'end-turn replay queue');
}

export function resolveTutorialQueueMeta(state, queue, consumedEventIds = null) {
  const coverage = getAiActionQueueCoverage(
    state,
    queue,
    steps => getVisualEventIdsCoveredByAnimationQueue(state, steps),
    consumedEventIds,
  );
  if (coverage.uncoveredEventIds.length) {
    if (import.meta.env.DEV) {
      console.warn('[tutorial queue] authoritative coverage incomplete; using scoped legacy merge', {
        uncoveredEventIds: coverage.uncoveredEventIds,
      });
    }
    return {
      ...LEGACY_MERGE_ACTION_SCOPE_META,
      compileEventIds: coverage.uncoveredEventIds,
      compileState: state,
    };
  }
  return coverage.eventIds.length
    ? { ...AUTHORITATIVE_QUEUE_META, eventIds: coverage.eventIds }
    : AUTHORITATIVE_QUEUE_META;
}

export function actionQueueMetaForMode(
  state,
  queue,
  consumedEventIds,
  { tutorial = false, context = 'action queue' } = {},
) {
  return tutorial
    ? resolveTutorialQueueMeta(state, queue, consumedEventIds)
    : strictActionQueueMeta(state, queue, consumedEventIds, context);
}
