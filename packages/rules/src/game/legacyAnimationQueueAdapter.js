import { dedupeInferredDiscardTransfers } from './animQueueHelpers.js';
import { normalizeApophisQueueForPlayback } from './apophisAnimQueue.js';
import { compileFreshVisualEventQueue } from './visualEventTransactionCompiler.js';

// Compatibility belongs to transaction preparation. The player receives one
// resolved order and must never claim or move another action's consequences.
export function prepareLegacyAnimationQueue(queue, previousState, nextState, {
  preserveQueueOrder = false,
  consumedEventIds = null,
} = {}) {
  const ordered = nextState
    ? normalizeApophisQueueForPlayback(queue, previousState, nextState, {
        preserveQueueOrder,
        buildQueue: (before, after) => compileFreshVisualEventQueue(before, after, { consumedEventIds }),
      })
    : queue;
  return dedupeInferredDiscardTransfers(ordered);
}
