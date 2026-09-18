import { cardTransferStep, statePatchStep } from './animQueueHelpers';
import { compileFreshVisualEventReplay } from './visualEventTransactionCompiler';
import { treasureDodgeModeConfig } from './treasureDodgeFlow';

export function createTreasureDodgeDiceAnim({ transaction } = {}) {
  const roll = transaction?.roll || {};
  const config = treasureDodgeModeConfig(!!transaction?.isAOE);
  return {
    type: 'DICE_ROLL',
    d1: roll.d1,
    d2: 0,
    heal: 0,
    rollerName: config.rollerName || roll.rollerName,
    dodgeSuccess: !!roll.dodgeSuccess,
    // The displayed dice settle after twelve 100ms frames. Disclose the
    // result there, not when the roll starts or when the next guide opens.
    impactAtMs: 1200,
    msgs: transaction?.rollLog ? [transaction.rollLog] : [],
  };
}

/**
 * Compile a resolved dodge transaction into one canonical presentation queue.
 * The builder owns dice/effect/card movement ordering; it does not mutate game
 * state or choose the continuation route.
 */
export function buildTreasureDodgeRollPresentation(transaction, {
  flowKind = 'standard',
} = {}) {
  if (!transaction?.beforeState || !transaction?.afterState) {
    throw new TypeError('buildTreasureDodgeRollPresentation requires a resolved transaction');
  }
  const config = treasureDodgeModeConfig(!!transaction.isAOE);
  const effectQueue = compileFreshVisualEventReplay(transaction.beforeState, transaction.afterState).queue;
  const dice = createTreasureDodgeDiceAnim({ transaction });
  const shouldTransfer = config.includeStandardTransfer
    && !transaction.drawReveal?.fromEndTurnReplay
    && !transaction.afterState.abilityData?.pendingZoneIncome;
  const transfer = shouldTransfer ? cardTransferStep({
    fromPid: transaction.drawerIdx,
    dest: transaction.afterState.players[transaction.drawerIdx]?.isDead ? 'discard' : 'player',
    toPid: transaction.drawerIdx,
    count: 1,
    sourceAnchor: 'playerArea',
    effect: 'draw',
    cards: [transaction.resolutionCard],
    msgs: transaction.incomeLog ? [transaction.incomeLog] : [],
  }) : null;
  const queue = [dice, ...effectQueue, transfer].filter(Boolean);
  // AOE and deferred-income decisions have no landing flight. Their explicit
  // choice/income message still follows the effects, without restoring logs.
  if (!transfer && transaction.incomeLog) queue.push(statePatchStep({ msgs: [transaction.incomeLog] }));

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
