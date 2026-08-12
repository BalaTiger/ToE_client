import { ensureVisualEventState } from './visualEvents';
import {
  ANIMATION_QUEUE_AUTHORITY,
  compileRuleVisualEventsToAnimTransaction,
  getAnimationQueueVisualEventIds,
  mergeAnimationTransactionQueue,
} from './visualEventTransactionCompiler';

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
  };
}

// Migration adapter: compiles legacy/event authority before playback. The
// animation hook receives only the resulting queue-authoritative transaction.
// This adapter is intentionally retained until the final legacy deletion pass.
export function prepareAnimationTransaction({
  queue = [],
  nextState = null,
  callback,
  transactionMeta = null,
  consumedEventIds = null,
  buildAnimQueue,
  context = 'legacy-adapter',
} = {}) {
  diagnostics.preparedTransactionCount += 1;
  const declaredAuthority = transactionMeta?.authority;
  if (!declaredAuthority) {
    diagnostics.implicitAuthorityCount += 1;
    throw new TypeError(`[animation-transaction] ${context}: authority is required`);
  }
  const authority = declaredAuthority;
  const shouldCompile = authority !== ANIMATION_QUEUE_AUTHORITY.QUEUE;
  const compileState = getRuleEventCompileState(nextState, transactionMeta);
  const compileEventIds = getRuleEventCompileIds(transactionMeta);
  if (shouldCompile && Array.isArray(compileEventIds)) diagnostics.uncoveredEventCount += compileEventIds.length;
  const ruleTransaction = compileState && shouldCompile
    ? compileRuleVisualEventsToAnimTransaction(ensureVisualEventState(compileState), null, {
        consumedEventIds,
        buildAnimQueue,
        ...(Array.isArray(compileEventIds) ? { eventIds: compileEventIds } : {}),
        ...(transactionMeta?.visualEventScope ? { visualEventScope: transactionMeta.visualEventScope } : {}),
      })
    : null;
  diagnostics.recompiledEventCount += ruleTransaction?.eventIds?.length || 0;
  const preparedQueue = mergeAnimationTransactionQueue(queue, ruleTransaction, { authority });
  return createQueueAnimationTransaction({
    queue: preparedQueue,
    nextState,
    callback,
    eventIds: collectPendingVisualEventIds(preparedQueue, ruleTransaction, transactionMeta),
    context,
  });
}
