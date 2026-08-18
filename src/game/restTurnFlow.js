import { copyPlayers } from './coreUtils';
import { appendStatChangeResult, submitRecoveryEvents } from './statChangeEngine';
import { buildAnimQueue } from './animQueueCore';
import { getEndTurnEvents } from './endTurnEvents';
import { checkWin } from './turnEngine';
import { TURN_FLOW_STAGE } from './turnFlowStages';
import { enterTurnBoundary, transitionTurnFlowStage } from './turnFlowManager';

/**
 * Pure resolver for the rest action and its end-of-turn transition.
 *
 * The caller supplies the dice result; this function decides whether the rest
 * ends the game, enters a hand-limit discard phase, schedules end-of-turn
 * events, or advances to the next turn.
 *
 * React side effects (setGs, triggerAnimQueue, kickoffEndTurnSeq) stay outside.
 */
export function resolveRestTurnEnd(gs, {
  d1,
  d2,
  heal,
  effectiveHandLimit,
  actorIndex = 0,
  advanceTurn,
} = {}) {
  if (!gs) throw new Error('resolveRestTurnEnd requires gs');
  if (!advanceTurn) throw new Error('resolveRestTurnEnd requires advanceTurn');

  const actor = gs.players?.[actorIndex];
  if (!actor) throw new Error(`resolveRestTurnEnd: missing player at index ${actorIndex}`);

  const P = copyPlayers(gs.players);
  const restStatEventSeq = (gs._statEventSeq || 0) + 1;
  const recovery = submitRecoveryEvents({
    players: P,
    events: [{ targetIdx: actorIndex, gainHp: heal, source: '休息' }],
    statEventSeq: restStatEventSeq,
  });
  const wasResting = P[actorIndex].isResting;
  P[actorIndex].isResting = !wasResting;

  const restLog = `你选择【休息】，掷骰 ${d1}、${d2}，取高值回复 ${heal}HP，${wasResting ? '翻回正常状态' : '翻面休息中'}`;
  const L = [...gs.log, restLog];

  const restMeta = appendStatChangeResult(gs, recovery);
  const restStatPatch = recovery.statEvents.length
    ? { _statEvents: restMeta._statEvents, _statEventSeq: restMeta._statEventSeq }
    : {};

  const win = checkWin(P, gs._isMP);
  if (win) {
    return {
      decision: 'WIN',
      gs: { ...gs, players: P, log: L, gameOver: win, ...restStatPatch },
    };
  }

  const oldGs = { ...gs, players: copyPlayers(gs.players) };
  const newGs = { ...gs, players: P, log: L, restUsed: true, skillUsed: true, ...restStatPatch };

  // 如果手牌超限，先进入弃牌阶段，弃牌后再触发拉莱耶之主摸牌
  if ((actor.hand?.length || 0) > effectiveHandLimit) {
    const pendingGs = transitionTurnFlowStage(
      { ...newGs, abilityData: { discardSelected: [] } },
      TURN_FLOW_STAGE.DISCARD,
      { phase: 'DISCARD_PHASE' },
    );
    const statQueue = buildAnimQueue(oldGs, { ...newGs, players: P });
    const queue = [{ type: 'DICE_ROLL', d1, d2, heal, rollerName: actor.name || '你' }, ...statQueue];
    return { decision: 'DISCARD_PHASE', pendingGs, queue };
  }

  // 复制牌堆/弃牌堆，因为后续 startNextTurn 会直接修改它们
  const D = [...gs.deck];
  const Disc = [...gs.discard];
  const finalGs = { ...gs, players: P, deck: D, discard: Disc, log: L, restUsed: true, skillUsed: true, ...restStatPatch };
  const statQueue = buildAnimQueue(oldGs, { ...finalGs, players: P });
  const diceQueue = [{ type: 'DICE_ROLL', d1, d2, heal, rollerName: actor.name || '你' }, ...statQueue];
  const afterRest = transitionTurnFlowStage(
    { ...finalGs, currentTurn: actorIndex },
    TURN_FLOW_STAGE.END_TURN,
  );

  const endTurnEvents = getEndTurnEvents(P, actorIndex);
  if (endTurnEvents.length) {
    return { decision: 'SCHEDULE_EVENTS', afterRest, seedQueue: diceQueue };
  }

  const nextGs = advanceTurn(enterTurnBoundary(afterRest));
  return { decision: 'APPLY_NEXT_TURN', nextGs, queue: diceQueue };
}
