import { cardLogText } from './coreUtils';
import { getEndTurnReplayHandCards } from './endTurnEvents';

export function buildEndTurnReplayStartState({
  baseGs,
  players,
  deck,
  discard,
  log,
  actorIndex = 0,
  actorLabel = '你',
}) {
  const actor = players?.[actorIndex];
  const handCards = [...(actor?.hand || [])];
  const replayCards = getEndTurnReplayHandCards(actor);
  if (!replayCards.length) return null;

  const replay = {
    actorIndex,
    cards: replayCards.map(card => card.id),
    index: 0,
  };
  const introLog = `【无尽通道】${actorLabel}展示所有手牌：${handCards.map(card => cardLogText(card, { alwaysShowName: true })).join(' ')}`;

  return {
    ...baseGs,
    players,
    deck,
    discard,
    log: [...(log || []), introLog],
    currentTurn: actorIndex,
    phase: 'ACTION',
    drawReveal: null,
    abilityData: {},
    _endTurnReplay: replay,
  };
}

export function endlessCorridorTunnelStep() {
  return { type: 'ENDLESS_CORRIDOR_TUNNEL' };
}

export function getCurrentEndTurnReplayCard(stateLike) {
  const replay = stateLike?._endTurnReplay;
  if (!replay) return null;

  const index = replay.index || 0;
  const cardId = (replay.cards || [])[index];
  if (cardId == null) return null;

  const actorIndex = replay.actorIndex ?? 0;
  const card = (stateLike.players?.[actorIndex]?.hand || []).find(handCard => handCard?.id === cardId);
  return card ? { actorIndex, card, index } : null;
}

export function buildEndTurnReplayGodEncounter({
  stateLike,
  players,
  replay,
  actorIndex,
  index,
  card,
  isCultist,
  actorLabel = '你',
}) {
  const P = players;
  P[actorIndex].godEncounters = (P[actorIndex].godEncounters || 0) + 1;
  const encounterCount = P[actorIndex].godEncounters;
  const cost = encounterCount;
  if (isCultist) P[actorIndex].roleRevealed = true;
  const effectMsg = isCultist
    ? `${actorLabel}（邪祀者）遭遇邪神 ${card.name}！（第${encounterCount}次）免疫SAN损耗`
    : `${actorLabel} 遭遇邪神 ${card.name}！（第${encounterCount}次）失去${cost}SAN`;

  return {
    players: P,
    cost,
    effectMsg,
    replayPatch: { _endTurnReplay: { ...replay, index } },
    abilityData: {
      ...(stateLike.abilityData || {}),
      godCard: card,
      drawerIdx: actorIndex,
      godEncounterCost: 0,
      fromEndTurnReplay: true,
    },
  };
}

export function buildEndTurnReplayZoneDraw({
  stateLike,
  players,
  replay,
  actorIndex,
  index,
  card,
  actorName = '你',
}) {
  return {
    state: {
      ...stateLike,
      players,
      phase: 'DRAW_REVEAL',
      drawReveal: {
        card,
        msgs: [],
        needsDecision: true,
        forcedKeep: false,
        drawerIdx: actorIndex,
        drawerName: actorName,
        fromEndTurnReplay: true,
      },
      abilityData: { ...(stateLike.abilityData || {}) },
      _endTurnReplay: { ...replay, index },
    },
    drawStep: {
      type: 'DRAW_CARD',
      card,
      triggerName: '无尽通道',
      targetPid: actorIndex,
      skipTravel: true,
      msgs: [`【无尽通道】重新摸到 ${cardLogText(card, { alwaysShowName: true })}`],
    },
  };
}

export function buildEndTurnReplayFinishedState({
  stateLike,
  players,
}) {
  const actorIndex = stateLike?._endTurnReplay?.actorIndex ?? 0;
  return {
    ...stateLike,
    players,
    currentTurn: actorIndex,
    phase: 'ACTION',
    drawReveal: null,
    abilityData: {},
    _endTurnReplay: null,
  };
}

export function advanceEndTurnReplayPatch(stateLike) {
  return stateLike?._endTurnReplay
    ? { _endTurnReplay: { ...stateLike._endTurnReplay, index: (stateLike._endTurnReplay.index || 0) + 1 } }
    : {};
}
