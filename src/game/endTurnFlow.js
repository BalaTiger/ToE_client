import { copyPlayers } from './coreUtils';
import { getEndTurnEvents } from './endTurnEvents';
import { startNextTurn as defaultAdvanceTurn } from './turnEngine';

export const END_TURN_DECISION = {
  DISCARD: 'DISCARD',
  SCHEDULE_EVENTS: 'SCHEDULE_EVENTS',
  APPLY_NEXT_TURN: 'APPLY_NEXT_TURN',
};

/**
 * Pure resolver for the end-turn transition.
 *
 * Given a game state at the moment a player presses 【结束回合】,
 * decides whether to:
 *  - enter hand-limit discard phase,
 *  - schedule end-of-turn events (CTH rest draw / TSG slime / endless corridor), or
 *  - apply the next turn directly.
 *
 * All React refs, animation triggers, and multiplayer broadcasts stay outside.
 */
export function resolveEndTurn(gs, {
  effectiveHandLimit,
  actorIndex = 0,
  advanceTurn = defaultAdvanceTurn,
} = {}) {
  if (!gs) throw new Error('resolveEndTurn requires gs');
  const actor = gs.players?.[actorIndex];
  if (!actor) throw new Error(`resolveEndTurn: missing player at index ${actorIndex}`);

  // 手牌超上限：进入弃牌阶段，弃完后再触发回合结束事件。
  if ((actor.hand?.length || 0) > effectiveHandLimit) {
    return {
      decision: END_TURN_DECISION.DISCARD,
      gs: {
        ...gs,
        phase: 'DISCARD_PHASE',
        abilityData: { discardSelected: [], fromEndTurn: true },
      },
    };
  }

  // 准备不可变副本，供纯状态变换使用。
  const P = copyPlayers(gs.players);
  const D = [...gs.deck];
  const Disc = [...gs.discard];
  const L = [...gs.log];

  // 有登记的回合结束事件：交给 App.jsx 的 Phase C 调度器按 registry 顺序结算。
  const endTurnEvents = getEndTurnEvents(P, actorIndex);
  if (endTurnEvents.length) {
    return {
      decision: END_TURN_DECISION.SCHEDULE_EVENTS,
      baseGs: {
        ...gs,
        players: P,
        deck: D,
        discard: Disc,
        log: L,
        currentTurn: actorIndex,
        abilityData: {},
      },
    };
  }

  // 无事件：直接进入下家回合。
  const newGs = advanceTurn({
    ...gs,
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    currentTurn: actorIndex,
  });

  return { decision: END_TURN_DECISION.APPLY_NEXT_TURN, newGs };
}
