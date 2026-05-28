import { hasGodPowerImmunity } from './godPowerImmunity';

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
  END_TURN_REPLAY_HAND: 'endTurnReplayHand',
};

export function getCthRestDrawCount(player) {
  return player?.isResting && !hasGodPowerImmunity(player) && player?.godName === 'CTH' && (player?.godLevel || 0) >= 1
    ? player.godLevel
    : 0;
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
