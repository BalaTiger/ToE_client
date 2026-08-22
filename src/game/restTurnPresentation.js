import { buildAnimQueue } from './animQueueCore';

/**
 * Compile the rule-layer rest transaction into its presentation queue.
 *
 * The resolver intentionally returns rule data and state snapshots only. The
 * dice roll and stat animation are presentation concerns and are built here,
 * at the boundary where the UI is about to submit the animation transaction.
 */
export function buildRestActionQueue(transaction) {
  if (!transaction?.beforeState || !transaction?.afterState) return [];
  return [
    {
      type: 'DICE_ROLL',
      ...(transaction.dice || {}),
    },
    ...buildAnimQueue(transaction.beforeState, transaction.afterState),
  ];
}

