import {
  ANIMATION_QUEUE_AUTHORITY,
  compileRuleVisualEventsToAnimTransaction,
  getAnimationQueueVisualEventIds,
} from './visualEventTransactionCompiler';
import { truncateQueueAtTerminalPresentation } from './terminalPresentation';

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
    queue: queue.filter(Boolean),
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
  const compileState = getRuleEventCompileState(nextState, transactionMeta);
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
  const preparedQueue = shouldCompile ? (ruleTransaction?.queue || []) : queue;
  const terminalQueue = truncateQueueAtTerminalPresentation(preparedQueue, nextState);
  const isTerminalTransaction = !!nextState?.gameOver;
  return createQueueAnimationTransaction({
    queue: terminalQueue,
    nextState,
    // A terminal commit is the continuation barrier. Never let a stale AI or
    // turn-flow callback run after the causative presentation has completed.
    callback: isTerminalTransaction ? undefined : callback,
    eventIds: isTerminalTransaction
      ? getAnimationQueueVisualEventIds(terminalQueue)
      : collectPendingVisualEventIds(terminalQueue, ruleTransaction, transactionMeta),
    context,
    preserveQueueOrder: transactionMeta?.preserveQueueOrder === true,
  });
}

// Canonical presentation boundary for new call sites. Callers describe the
// authority and event scope; this function owns transaction preparation and
// hands the player one queue-authoritative transaction.
export function submitAnimationPresentation({
  playTransaction,
  queue = [],
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
    nextState,
    callback,
    transactionMeta,
    consumedEventIds,
    context,
  });
  playTransaction(transaction);
  return transaction;
}
