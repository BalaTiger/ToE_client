import { bindAnimLogChunks, splitAnimBoundLogs } from './animLogs';
import { cardTransferStep, statePatchStep } from './animQueueHelpers';
import { compileFreshVisualEventReplay } from './visualEventTransactionCompiler';
import { treasureDodgeModeConfig } from './treasureDodgeFlow';

export function createTreasureDodgeDiceAnim({ transaction, tutorialHold = false, onTutorialSettled } = {}) {
  const roll = transaction?.roll || {};
  const config = treasureDodgeModeConfig(!!transaction?.isAOE);
  return {
    type: 'DICE_ROLL',
    d1: roll.d1,
    d2: 0,
    heal: 0,
    rollerName: config.rollerName || roll.rollerName,
    dodgeSuccess: !!roll.dodgeSuccess,
    ...(tutorialHold && config.supportsTutorialHold ? {
      durationMs: 2147483647,
      onSettled: onTutorialSettled,
    } : {}),
  };
}

function buildEffectQueue(transaction) {
  const beforeState = transaction?.beforeState || {};
  const afterState = transaction?.afterState || {};
  const inspectionAware = compileFreshVisualEventReplay(beforeState, afterState);
  return inspectionAware.inspectionEvents.length
    ? inspectionAware.queue
    : bindAnimLogChunks(inspectionAware.queue, splitAnimBoundLogs(transaction?.logDelta || []));
}

/**
 * Compile a resolved dodge transaction into one canonical presentation queue.
 * The builder owns dice/effect/card movement ordering; it does not mutate game
 * state or choose the continuation route.
 */
export function buildTreasureDodgeRollPresentation(transaction, {
  flowKind = 'standard',
  tutorialHold = false,
  onTutorialSettled,
} = {}) {
  if (!transaction?.beforeState || !transaction?.afterState) {
    throw new TypeError('buildTreasureDodgeRollPresentation requires a resolved transaction');
  }
  const config = treasureDodgeModeConfig(!!transaction.isAOE);
  const effectQueue = buildEffectQueue(transaction);
  const dice = createTreasureDodgeDiceAnim({ transaction, tutorialHold, onTutorialSettled });
  const shouldTransfer = config.includeStandardTransfer && !transaction.drawReveal?.fromEndTurnReplay;
  const transfer = shouldTransfer ? cardTransferStep({
    fromPid: transaction.drawerIdx,
    dest: 'player',
    toPid: transaction.drawerIdx,
    count: 1,
    sourceAnchor: 'playerArea',
    effect: 'draw',
    cards: [transaction.resolutionCard],
  }) : null;
  const queue = [dice, ...effectQueue, transfer].filter(Boolean);

  if (flowKind === 'rest' || flowKind === 'slime') {
    queue.push(statePatchStep({
      players: transaction.afterState.players,
      deck: transaction.afterState.deck,
      discard: transaction.afterState.discard,
      log: transaction.afterState.log,
      phase: transaction.afterState.phase,
      drawReveal: transaction.afterState.drawReveal,
      abilityData: transaction.afterState.abilityData,
    }));
    queue.push({ type: 'TURN_BOUNDARY_PAUSE', durationMs: 300 });
  } else if (transaction.drawReveal?.fromEndTurnReplay) {
    queue.push(statePatchStep({
      players: transaction.afterState.players,
      discard: transaction.afterState.discard,
    }));
  }

  return {
    type: 'treasureDodgePresentation',
    flowKind,
    queue,
    beforeState: transaction.beforeState,
    afterState: transaction.afterState,
    logDelta: transaction.logDelta,
  };
}
