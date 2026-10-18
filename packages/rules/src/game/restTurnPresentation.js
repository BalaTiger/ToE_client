import { statEventsToAnimQueue } from './statEvents.js';

/**
 * Compile the rule-layer rest transaction into its presentation queue.
 *
 * The resolver intentionally returns rule data and state snapshots only. The
 * dice roll and stat animation are presentation concerns and are built here,
 * at the boundary where the UI is about to submit the animation transaction.
 */
export function buildRestActionQueue(transaction) {
  if (!transaction?.beforeState || !transaction?.afterState) return [];
  const statQueue = statEventsToAnimQueue(
    transaction.statEvents || [],
    transaction.beforeState.players || [],
    transaction.msgs || [],
  );
  // At full HP the rule transaction has no stat delta. Its rest outcome still
  // needs a playback cue after the dice, without inventing a heal animation.
  const outcomeQueue = statQueue.length > 0
    ? statQueue
    : (transaction.msgs?.length ? [{ type: 'STATE_PATCH', msgs: [...transaction.msgs] }] : []);
  return [
    {
      type: 'DICE_ROLL',
      ...(transaction.dice || {}),
    },
    ...outcomeQueue,
  ];
}
