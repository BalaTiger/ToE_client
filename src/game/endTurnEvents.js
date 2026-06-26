import { hasGodPowerImmunity } from './godPowerImmunity';
import { GOD_DEFS } from '../constants/card';

export const END_TURN_PRIORITY = {
  ACTIVE_GOD: 1,
  ACTIVE_GOD_DERIVATIVE: 2,
  ACTIVE_OTHER: 3,
  PASSIVE_GOD: 4,
  PASSIVE_GOD_DERIVATIVE: 5,
  PASSIVE_OTHER: 6,
};

export const END_TURN_EVENT = {
  CTH_REST_DRAW: 'cthRestDraw',
  TSG_SLIME_GRANT: 'tsgSlimeGrant',
  END_TURN_REPLAY_HAND: 'endTurnReplayHand',
};

export function getCthRestDrawCount(player) {
  return player?.isResting && !hasGodPowerImmunity(player) && player?.godName === 'CTH' && (player?.godLevel || 0) >= 1
    ? player.godLevel
    : 0;
}

// 蟾蜍之神回合结束发放的黄液数量；被神力免疫（如引燃火把）或非 TSG 信徒时为 0（与 CTH 休息摸牌同规则）。
export function getTsgSlimeGrantCount(player) {
  if (hasGodPowerImmunity(player) || player?.godName !== 'TSG' || (player?.godLevel || 0) < 1) return 0;
  return GOD_DEFS.TSG?.levels?.[(player.godLevel || 1) - 1]?.slimeCount || 0;
}

export function getEndTurnReplayHandCards(player) {
  const handCards = [...(player?.hand || [])];
  const corridorIndex = handCards.findIndex(card => card?.type === END_TURN_EVENT.END_TURN_REPLAY_HAND);
  return corridorIndex > 0 ? handCards.slice(0, corridorIndex).filter(card => card?.id != null) : [];
}

export function getEndTurnEvents(players = [], actorIndex = 0) {
  const actor = players[actorIndex];
  if (!actor || actor.isDead) return [];

  const events = [];
  const cthDrawCount = getCthRestDrawCount(actor);
  if (cthDrawCount > 0) {
    events.push({
      id: END_TURN_EVENT.CTH_REST_DRAW,
      priority: END_TURN_PRIORITY.ACTIVE_GOD,
      drawCount: cthDrawCount,
    });
  }

  const slimeCount = getTsgSlimeGrantCount(actor);
  if (slimeCount > 0) {
    events.push({
      id: END_TURN_EVENT.TSG_SLIME_GRANT,
      priority: END_TURN_PRIORITY.PASSIVE_GOD,
      slimeCount,
    });
  }

  const replayCards = getEndTurnReplayHandCards(actor);
  if (replayCards.length > 0) {
    events.push({
      id: END_TURN_EVENT.END_TURN_REPLAY_HAND,
      priority: END_TURN_PRIORITY.PASSIVE_OTHER,
      cardIds: replayCards.map(card => card.id),
    });
  }

  return events.sort((a, b) => a.priority - b.priority);
}

export function hasEndTurnReplayHandEvent(players = [], actorIndex = 0) {
  return getEndTurnReplayHandCards(players[actorIndex]).length > 0;
}

// 按优先级顺序依次执行回合结束事件（CPS：每个事件异步处理，处理完调用 advance() 推进到下一个；
// 若事件暂停等待玩家决策（如无尽通道翻到神牌进入 GOD_CHOICE），处理器不调用 advance，之后用
// 续跑游标 cursor 从下一个事件继续）。这样执行顺序由排序后的事件列表唯一决定，新增事件只需登记优先级。
export function runEndTurnEvents(events = [], { runEvent, onComplete, cursor = 0 } = {}) {
  if (cursor >= events.length) {
    onComplete?.();
    return;
  }
  const advance = () => runEndTurnEvents(events, { runEvent, onComplete, cursor: cursor + 1 });
  runEvent?.(events[cursor], cursor, advance);
}
