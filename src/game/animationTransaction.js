import {
  ANIMATION_QUEUE_AUTHORITY,
  compileRuleVisualEventsToAnimTransaction,
  getAnimationQueueVisualEventIds,
  getVisualEventIdsCoveredByAnimationQueue,
} from './visualEventTransactionCompiler';
import { truncateQueueAtTerminalPresentation } from './terminalPresentation';
import { prepareLegacyAnimationQueue } from './legacyAnimationQueueAdapter';
import { buildAnimationQueueStepManifest, validateAnimationQueueEventDependencies } from './animationEventCoverage';
import { adaptLegacyStatEventGraph } from './statEventIdentity';

export const PLAYBACK_TRANSACTION_SCHEMA_VERSION = 1;

export function assertPreparedAnimationTransaction(transaction) {
  if (!transaction || transaction.authority !== ANIMATION_QUEUE_AUTHORITY.QUEUE
    || !Array.isArray(transaction.queue)
    || transaction.queueSchemaVersion !== PLAYBACK_TRANSACTION_SCHEMA_VERSION) {
    throw new TypeError('[animation-transaction] playback requires a prepared queue transaction');
  }
  if (JSON.stringify(transaction.stepManifest) !== JSON.stringify(buildAnimationQueueStepManifest(transaction.queue))) {
    throw new TypeError('[animation-transaction] prepared queue changed after compilation');
  }
  return transaction;
}

function assertUnambiguousIdentity(issues, context) {
  if (!issues?.length) return;
  const error = new TypeError(`[animation-transaction] ${context}: ambiguous legacy stat identity (${issues.map(issue => issue.code).join(', ')})`);
  error.identityIssues = issues;
  throw error;
}

const diagnostics = {
  preparedTransactionCount: 0,
  implicitAuthorityCount: 0,
  uncoveredEventCount: 0,
  recompiledEventCount: 0,
};

export function getAnimationTransactionDiagnostics() {
  return { ...diagnostics };
}

export function resetAnimationTransactionDiagnostics() {
  Object.keys(diagnostics).forEach(key => { diagnostics[key] = 0; });
}

export function getRuleEventCompileIds(transactionMeta = null) {
  if (Array.isArray(transactionMeta?.compileEventIds)) return transactionMeta.compileEventIds;
  if (Array.isArray(transactionMeta?.eventIds)) return transactionMeta.eventIds;
  return null;
}

export function getRuleEventCompileState(nextState = null, transactionMeta = null) {
  return nextState || transactionMeta?.compileState || null;
}

export function collectPendingVisualEventIds(queue, ruleTransaction = null, transactionMeta = null) {
  return [...new Set([
    ...getAnimationQueueVisualEventIds(queue),
    ...(Array.isArray(ruleTransaction?.eventIds) ? ruleTransaction.eventIds : []),
    ...(Array.isArray(transactionMeta?.eventIds) ? transactionMeta.eventIds : []),
  ].filter(Boolean))];
}

// Explicit metadata scopes candidates; only a complete compiled presentation
// proves that a known event can be consumed. Opaque legacy ids remain supported
// when their rule event payload is unavailable at this boundary.
function getConsumableEventIds(queue, state, ruleTransaction, transactionMeta, isTerminal) {
  const candidates = isTerminal
    ? getAnimationQueueVisualEventIds(queue)
    : collectPendingVisualEventIds(queue, ruleTransaction, transactionMeta);
  const knownEvents = (state?._visualEvents || []).flatMap(event => [event, ...(event?.settlementEvents || [])]);
  if (!knownEvents.length) return candidates;
  const knownIds = new Set(knownEvents.map(event => event?.id).filter(Boolean));
  const coveredIds = new Set(getVisualEventIdsCoveredByAnimationQueue({ ...state, _visualEvents: knownEvents }, queue));
  return candidates.filter(id => !knownIds.has(id) || coveredIds.has(id));
}

export function createQueueAnimationTransaction({
  queue = [],
  nextState = null,
  callback,
  eventIds = [],
  context = 'unknown',
  preserveQueueOrder = false,
} = {}) {
  if (!Array.isArray(queue)) throw new TypeError(`[animation-transaction] ${context}: queue must be an array`);
  if (!Array.isArray(eventIds)) throw new TypeError(`[animation-transaction] ${context}: eventIds must be an array`);
  return {
    authority: ANIMATION_QUEUE_AUTHORITY.QUEUE,
    queueSchemaVersion: PLAYBACK_TRANSACTION_SCHEMA_VERSION,
    queue: queue.filter(Boolean),
    stepManifest: buildAnimationQueueStepManifest(queue),
    nextState,
    callback,
    eventIds: [...new Set(eventIds.filter(Boolean))],
    context,
    preserveQueueOrder: preserveQueueOrder === true,
  };
}

// Resolve the declared authority exactly once before playback. Queue and event
// authority are mutually exclusive; there is no merge/reordering fallback.
export function prepareAnimationTransaction({
  queue = [],
  previousState = null,
  nextState = null,
  callback,
  transactionMeta = null,
  consumedEventIds = null,
  context = 'animation-transaction',
} = {}) {
  diagnostics.preparedTransactionCount += 1;
  const declaredAuthority = transactionMeta?.authority;
  if (!declaredAuthority) {
    diagnostics.implicitAuthorityCount += 1;
    throw new TypeError(`[animation-transaction] ${context}: authority is required`);
  }
  const authority = declaredAuthority;
  if (![ANIMATION_QUEUE_AUTHORITY.QUEUE, ANIMATION_QUEUE_AUTHORITY.EVENTS].includes(authority)) {
    throw new TypeError(`[animation-transaction] ${context}: unsupported authority ${String(authority)}`);
  }
  const shouldCompile = authority === ANIMATION_QUEUE_AUTHORITY.EVENTS;
  const adapted = adaptLegacyStatEventGraph({
    state: getRuleEventCompileState(nextState, transactionMeta), previousState, queue,
  });
  assertUnambiguousIdentity(adapted.issues, context);
  const compileState = adapted.state;
  previousState = adapted.previousState;
  queue = adapted.queue;
  if (nextState) nextState = compileState;
  const compileEventIds = getRuleEventCompileIds(transactionMeta);
  if (shouldCompile && Array.isArray(compileEventIds)) diagnostics.uncoveredEventCount += compileEventIds.length;
  const ruleTransaction = compileState && shouldCompile
      ? compileRuleVisualEventsToAnimTransaction(compileState, null, {
         consumedEventIds,
         ...(transactionMeta?.compileOptions || {}),
        ...(Array.isArray(compileEventIds) ? { eventIds: compileEventIds } : {}),
        ...(transactionMeta?.visualEventScope ? { visualEventScope: transactionMeta.visualEventScope } : {}),
      })
    : null;
  diagnostics.recompiledEventCount += ruleTransaction?.eventIds?.length || 0;
  assertUnambiguousIdentity(ruleTransaction?.identityIssues, context);
  const preparedQueue = shouldCompile
    ? (ruleTransaction?.queue || [])
    : prepareLegacyAnimationQueue(queue, previousState, nextState, {
        preserveQueueOrder: transactionMeta?.preserveQueueOrder === true,
        consumedEventIds,
      });
  const terminalQueue = truncateQueueAtTerminalPresentation(preparedQueue, nextState);
  const dependencyIssues = validateAnimationQueueEventDependencies(terminalQueue, compileState?._visualEvents || []);
  if (dependencyIssues.length) {
    const error = new TypeError(`[animation-transaction] ${context}: event dependencies are out of playback order`);
    error.dependencyIssues = dependencyIssues;
    throw error;
  }
  const isTerminalTransaction = !!nextState?.gameOver;
  return createQueueAnimationTransaction({
    queue: terminalQueue,
    nextState,
    // A terminal commit is the continuation barrier. Never let a stale AI or
    // turn-flow callback run after the causative presentation has completed.
    callback: isTerminalTransaction ? undefined : callback,
    eventIds: getConsumableEventIds(terminalQueue, compileState, ruleTransaction, transactionMeta, isTerminalTransaction),
    context,
    preserveQueueOrder: true,
  });
}

// Canonical presentation boundary for new call sites. Callers describe the
// authority and event scope; this function owns transaction preparation and
// hands the player one queue-authoritative transaction.
export function submitAnimationPresentation({
  playTransaction,
  queue = [],
  previousState = null,
  nextState = null,
  callback,
  authority = ANIMATION_QUEUE_AUTHORITY.QUEUE,
  eventIds,
  compileEventIds,
  compileState,
  visualEventScope,
  compileOptions,
  preserveQueueOrder = false,
  consumedEventIds = null,
  context = 'presentation',
} = {}) {
  if (typeof playTransaction !== 'function') {
    throw new TypeError(`[animation-transaction] ${context}: playTransaction must be a function`);
  }
  const transactionMeta = {
    authority,
    ...(Array.isArray(eventIds) ? { eventIds } : {}),
    ...(Array.isArray(compileEventIds) ? { compileEventIds } : {}),
    ...(compileState ? { compileState } : {}),
    ...(visualEventScope ? { visualEventScope } : {}),
    ...(compileOptions ? { compileOptions } : {}),
    ...(preserveQueueOrder ? { preserveQueueOrder: true } : {}),
  };
  const transaction = prepareAnimationTransaction({
    queue,
    previousState,
    nextState,
    callback,
    transactionMeta,
    consumedEventIds,
    context,
  });
  playTransaction(transaction);
  return transaction;
}
