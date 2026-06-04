import { cardLogText } from './coreUtils';
import { localDisplayName } from './rotateState';
import { statEventsToAnimQueue } from './statEvents';

export const VISUAL_EVENT = {
  TIMED_OUT_DRAW_DISCARD: 'timedOutDrawDiscard',
  TURN_START: 'turnStart',
  DRAW_CARD: 'drawCard',
  STAT_EVENTS: 'statEvents',
  BEWITCH_GIFT: 'bewitchGift',
  SWAP_CARDS: 'swapCards',
  HUNT_TARGET: 'huntTarget',
  HUNT_REVEAL: 'huntReveal',
  HUNT_RESULT: 'huntResult',
  HAND_LIMIT_DISCARD: 'handLimitDiscard',
  EARTHQUAKE: 'earthquake',
  ENDLESS_CORRIDOR_REPLAY: 'endlessCorridorReplay',
};

const visualEventInstanceId = Math.random().toString(36).slice(2, 10);
let actionEventSeq = 0;
let earthquakeEventSeq = 0;
let endlessCorridorEventSeq = 0;

function cardIdentity(card) {
  if (!card) return 'none';
  return card.id || card.uid || [card.key, card.godKey, card.name, card.type].filter(Boolean).join(':') || 'card';
}

function msgsIdentity(msgs) {
  return Array.isArray(msgs) ? msgs.join('|') : '';
}

function makeVisualEventId(event) {
  if (!event?.type) return null;
  const parts = [event.type];
  if (event.playerIdx != null) parts.push(`p${event.playerIdx}`);
  if (event.drawerIdx != null) parts.push(`d${event.drawerIdx}`);
  if (event.sourceIdx != null) parts.push(`s${event.sourceIdx}`);
  if (event.targetIdx != null) parts.push(`t${event.targetIdx}`);
  if (event.card) parts.push(`c${cardIdentity(event.card)}`);
  if (Array.isArray(event.cards) && event.cards.length) {
    parts.push(`cards${event.cards.map(cardIdentity).join(',')}`);
  }
  if (Array.isArray(event.statEvents) && event.statEvents.length) {
    parts.push(`seq${event.statEvents.map(ev => ev?.seq ?? `${ev?.type || 'stat'}:${ev?.target ?? ''}`).join(',')}`);
  }
  if (Array.isArray(event.discardEvents) && event.discardEvents.length) {
    parts.push(`quake${event.discardEvents.map(ev => `${ev?.playerIndex ?? ''}:${cardIdentity(ev?.card)}`).join(',')}`);
  }
  const msgKey = msgsIdentity(event.msgs);
  if (msgKey) parts.push(`m${msgKey}`);
  return parts.join('|');
}

function withVisualEventMeta(event, scope = 'action') {
  if (!event) return null;
  const scoped = {
    ...event,
    scope: event.scope || scope,
  };
  return {
    ...scoped,
    id: event.id || makeVisualEventId(scoped),
  };
}

export function createTimedOutDrawDiscardEvent({ card, drawerIdx = 0, drawerName = '该玩家' } = {}) {
  if (!card) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.TIMED_OUT_DRAW_DISCARD,
    card,
    drawerIdx,
    drawerName,
  }, 'turn');
}

export function createTurnStartEvent({ playerIdx = 0, playerName = '该玩家', msgs = [] } = {}) {
  return withVisualEventMeta({
    type: VISUAL_EVENT.TURN_START,
    playerIdx,
    playerName,
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'turn');
}

export function createDrawCardEvent({ playerIdx = 0, playerName = '该玩家', card, msgs = [] } = {}) {
  if (!card) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.DRAW_CARD,
    playerIdx,
    playerName,
    card,
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'turn');
}

export function createStatEventsEvent({ statEvents = [], msgs = [] } = {}) {
  const events = Array.isArray(statEvents) ? statEvents.filter(Boolean) : [];
  if (!events.length) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.STAT_EVENTS,
    statEvents: events,
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'stat');
}

export function createBewitchGiftEvent({ sourceIdx = 0, targetIdx = 0, targetName = '该玩家', card, msgs = [] } = {}) {
  if (!card) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.BEWITCH_GIFT,
    id: `${VISUAL_EVENT.BEWITCH_GIFT}:${visualEventInstanceId}:${++actionEventSeq}`,
    sourceIdx,
    targetIdx,
    targetName,
    card,
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'action');
}

export function createSwapCardsEvent({ sourceIdx = 0, targetIdx = 0, sourceCount = 1, targetCount = 1, msgs = [] } = {}) {
  return withVisualEventMeta({
    type: VISUAL_EVENT.SWAP_CARDS,
    id: `${VISUAL_EVENT.SWAP_CARDS}:${visualEventInstanceId}:${++actionEventSeq}`,
    sourceIdx,
    targetIdx,
    sourceCount,
    targetCount,
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'action');
}

export function createHuntTargetEvent({ sourceIdx = 0, targetIdx = 0, msgs = [] } = {}) {
  return withVisualEventMeta({
    type: VISUAL_EVENT.HUNT_TARGET,
    id: `${VISUAL_EVENT.HUNT_TARGET}:${visualEventInstanceId}:${++actionEventSeq}`,
    sourceIdx,
    targetIdx,
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'action');
}

export function createHuntRevealEvent({ sourceIdx = 0, targetIdx = 0, card, msgs = [] } = {}) {
  if (!card) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.HUNT_REVEAL,
    id: `${VISUAL_EVENT.HUNT_REVEAL}:${visualEventInstanceId}:${++actionEventSeq}`,
    sourceIdx,
    targetIdx,
    card,
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'action');
}

export function createHuntResultEvent(event = {}) {
  if (!event || event.hunterIdx == null || event.targetIdx == null) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.HUNT_RESULT,
    id: `${VISUAL_EVENT.HUNT_RESULT}:${visualEventInstanceId}:${++actionEventSeq}`,
    skipIntro: true,
    skipReveal: true,
    ...event,
    sourceIdx: event.sourceIdx ?? event.hunterIdx,
    hunterIdx: event.hunterIdx,
    targetIdx: event.targetIdx,
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
  }, 'action');
}

export function createHandLimitDiscardEvent({ playerIdx = 0, playerName = '该玩家', cards = [], msgs = [] } = {}) {
  const normalizedCards = Array.isArray(cards) ? cards.filter(Boolean) : [];
  if (!normalizedCards.length && !(Array.isArray(msgs) && msgs.length)) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.HAND_LIMIT_DISCARD,
    playerIdx,
    playerName,
    cards: normalizedCards,
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'turn');
}

export function createEndlessCorridorReplayEvent({
  actorIdx = 0,
  actorName = '该玩家',
  queue = [],
  msgs = [],
  beforePlayers = null,
  beforeDiscard = null,
  zhuLight = null,
} = {}) {
  const replayQueue = Array.isArray(queue) ? queue.filter(Boolean) : [];
  if (!replayQueue.length) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.ENDLESS_CORRIDOR_REPLAY,
    id: `${VISUAL_EVENT.ENDLESS_CORRIDOR_REPLAY}:${visualEventInstanceId}:${++endlessCorridorEventSeq}`,
    actorIdx,
    actorName,
    queue: replayQueue,
    msgs: Array.isArray(msgs) ? msgs : [],
    beforePlayers: Array.isArray(beforePlayers) ? beforePlayers : null,
    beforeDiscard: Array.isArray(beforeDiscard) ? beforeDiscard : null,
    zhuLight: zhuLight || null,
  }, 'turn');
}

export function buildHuntRevealStepFromVisualEvent(event, state) {
  if (!event?.card || event.targetIdx == null || event.targetIdx === 0) return null;
  const targetIdx = event.targetIdx;
  const targetName = event.targetName || state?.players?.[targetIdx]?.name || '对方';
  return {
    type: 'HUNT_REVEAL_CARD',
    card: event.card,
    targetPid: targetIdx,
    targetName: localDisplayName(targetIdx, targetName),
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
  };
}

export function createEarthquakeEvent({
  beforePlayers = [],
  beforeDiscard = [],
  discardEvents = [],
  msgs = [],
} = {}) {
  return withVisualEventMeta({
    type: VISUAL_EVENT.EARTHQUAKE,
    id: `${VISUAL_EVENT.EARTHQUAKE}:${visualEventInstanceId}:${++earthquakeEventSeq}`,
    beforePlayers: Array.isArray(beforePlayers) ? beforePlayers : [],
    beforeDiscard: Array.isArray(beforeDiscard) ? beforeDiscard : [],
    discardEvents: Array.isArray(discardEvents) ? discardEvents.filter(Boolean) : [],
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'effect');
}

export function buildEarthquakeAnimStep({
  beforePlayers = [],
  beforeDiscard = [],
  discardEvents = [],
  finalPlayers = [],
  msgs = [],
} = {}) {
  const initialPlayers = Array.isArray(beforePlayers) ? beforePlayers : [];
  const initialDiscard = Array.isArray(beforeDiscard) ? beforeDiscard : [];
  const finalPlayerList = Array.isArray(finalPlayers) ? finalPlayers : [];
  let stagedPlayers = initialPlayers.map(p => ({ ...p, hand: [...(p?.hand || [])] }));
  const normalizedDiscardEvents = Array.isArray(discardEvents)
    ? discardEvents.map((event, index, events) => {
      const playerIndex = event?.playerIndex;
      if (playerIndex != null && finalPlayerList?.[playerIndex]) {
        stagedPlayers = stagedPlayers.map((player, i) => (
          i === playerIndex
            ? { ...finalPlayerList[playerIndex], hand: [...(finalPlayerList[playerIndex].hand || [])] }
            : player
        ));
      } else if (Array.isArray(event?.afterPlayers)) {
        stagedPlayers = event.afterPlayers.map(p => ({ ...p, hand: [...(p?.hand || [])] }));
      }
      return {
        ...event,
        afterPlayers: stagedPlayers.map(p => ({ ...p, hand: [...(p?.hand || [])] })),
        delayMs: 420 + (events.length > 1 ? Math.round((1600 / (events.length - 1)) * index) : 0),
        durationMs: 620,
      };
    })
    : [];
  return {
    type: 'EARTHQUAKE',
    msgs: Array.isArray(msgs) ? msgs : [],
    beforePlayers: initialPlayers,
    beforeDiscard: initialDiscard,
    discardEvents: normalizedDiscardEvents,
    visualSetupTiming: 'queueStart',
    visualSetupPatch: { discard: initialDiscard },
    visualTimeline: [
      { atMs: 0, patch: { players: initialPlayers, discard: initialDiscard } },
      ...normalizedDiscardEvents.map(event => ({
        atMs: (event.delayMs || 0) + (event.durationMs || 0),
        patch: {
          players: event.afterPlayers,
          ...(Array.isArray(event.afterDiscard) ? { discard: event.afterDiscard } : {}),
        },
      })),
    ],
  };
}

export function buildTurnStartDrawVisualEvents(state) {
  if (!state || state.gameOver) return [];
  const events = [];
  if (Array.isArray(state._turnStartLogs) && state._turnStartLogs.length) {
    events.push(createTurnStartEvent({
      playerIdx: state.currentTurn ?? 0,
      playerName: state.players?.[state.currentTurn]?.name || '该玩家',
      msgs: state._turnStartLogs,
    }));
  }
  const drawCard = state.phase === 'GOD_CHOICE'
    ? state.abilityData?.godCard
    : state.drawReveal?.card;
  if (drawCard) {
    const drawerIdx = state.phase === 'GOD_CHOICE'
      ? (state.abilityData?.drawerIdx ?? state.currentTurn ?? 0)
      : (state.drawReveal?.drawerIdx ?? state.currentTurn ?? 0);
    const drawEvent = createDrawCardEvent({
      playerIdx: drawerIdx,
      playerName: state.players?.[drawerIdx]?.name || '该玩家',
      card: drawCard,
      msgs: state._drawLogs,
    });
    if (drawEvent) events.push(drawEvent);
  }
  return events;
}

export function buildFreshStatVisualEvents(state, previousStatSeq = 0) {
  const freshStatEvents = Array.isArray(state?._statEvents)
    ? state._statEvents.filter(ev => ev && (ev.seq == null || ev.seq > (previousStatSeq || 0)))
    : [];
  const event = createStatEventsEvent({ statEvents: freshStatEvents, msgs: state?._statLogs || [] });
  return event ? [event] : [];
}

export function getVisualEvents(state) {
  return Array.isArray(state?._visualEvents)
    ? state._visualEvents.map(event => withVisualEventMeta(event)).filter(Boolean)
    : [];
}

export function clearVisualEvents(state) {
  return state ? { ...state, _visualEvents: [] } : state;
}

export function getVisualEventIds(events) {
  return (Array.isArray(events) ? events : [])
    .map(event => withVisualEventMeta(event)?.id)
    .filter(Boolean);
}

export function getVisualEventIdsFromState(state) {
  return getVisualEventIds(getVisualEvents(state));
}

export function markConsumedVisualEvents(consumedIds, events) {
  const ids = getVisualEventIds(events);
  if (!ids.length || !consumedIds?.add) return;
  ids.forEach(id => consumedIds.add(id));
}

export function pruneConsumedVisualEvents(state, consumedIds) {
  if (!state || !consumedIds?.has) return state;
  const events = getVisualEvents(state).filter(event => !consumedIds.has(event.id));
  return events.length === (state._visualEvents || []).length
    ? state
    : { ...state, _visualEvents: events };
}

export function buildTimedOutDrawDiscardStepFromVisualEvents(state) {
  const event = getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.TIMED_OUT_DRAW_DISCARD && ev.card);
  if (!event) return null;
  const drawerIdx = event.drawerIdx ?? 0;
  const drawerName = event.drawerName || state?.players?.[drawerIdx]?.name || '???';
  const displayName = localDisplayName(drawerIdx, drawerName);
  return {
    type: 'DISCARD',
    card: event.card,
    triggerName: displayName,
    targetPid: drawerIdx,
    msgs: [`(超时) ${displayName} 弃置了 ${cardLogText(event.card, { alwaysShowName: true })}`],
  };
}

export function buildHandLimitDiscardStepsFromVisualEvents(state) {
  const event = getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.HAND_LIMIT_DISCARD);
  if (!event) return [];
  const playerIdx = event.playerIdx ?? 0;
  const playerName = event.playerName || state?.players?.[playerIdx]?.name || '???';
  const displayName = localDisplayName(playerIdx, playerName);
  return [{
    type: 'DISCARD',
    card: Array.isArray(event.cards) ? event.cards[0] : null,
    triggerName: displayName,
    targetPid: playerIdx,
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
  }];
}

export function buildTurnStartStepFromVisualEvents(state) {
  const event = getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.TURN_START);
  if (!event) return null;
  const playerIdx = event.playerIdx ?? state?.currentTurn ?? 0;
  const playerName = event.playerName || state?.players?.[playerIdx]?.name || '???';
  return {
    type: 'YOUR_TURN',
    name: localDisplayName(playerIdx, playerName),
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
  };
}

export function buildDrawCardStepFromVisualEvents(state) {
  const event = getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.DRAW_CARD && ev.card);
  if (!event) return null;
  const playerIdx = event.playerIdx ?? state?.currentTurn ?? 0;
  const playerName = event.playerName || state?.players?.[playerIdx]?.name || '???';
  return {
    type: 'DRAW_CARD',
    card: event.card,
    triggerName: localDisplayName(playerIdx, playerName),
    targetPid: playerIdx,
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
  };
}

export function buildStatStepsFromVisualEvents(state, players) {
  const event = getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.STAT_EVENTS && Array.isArray(ev.statEvents) && ev.statEvents.length);
  if (!event) return [];
  return statEventsToAnimQueue(event.statEvents, players || state?.players || [], event.msgs || []);
}

export function buildEarthquakeStepFromVisualEvents(state) {
  const event = getEarthquakeVisualEvent(state);
  if (!event) return null;
  return buildEarthquakeAnimStep({
    beforePlayers: event.beforePlayers,
    beforeDiscard: event.beforeDiscard,
    discardEvents: event.discardEvents,
    finalPlayers: state?.players,
    msgs: event.msgs,
  });
}

export function getEarthquakeVisualEvent(state) {
  return getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.EARTHQUAKE);
}

export function getEndlessCorridorReplayVisualEvent(state) {
  return getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.ENDLESS_CORRIDOR_REPLAY && Array.isArray(ev.queue) && ev.queue.length);
}

export function getBewitchGiftVisualEvent(state) {
  return getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.BEWITCH_GIFT && ev.card);
}

export function getSwapCardsVisualEvent(state) {
  return getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.SWAP_CARDS && ev.sourceIdx != null && ev.targetIdx != null);
}

export function getHuntTargetVisualEvent(state) {
  return getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.HUNT_TARGET && ev.targetIdx != null);
}

export function getHuntRevealVisualEvent(state) {
  return getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.HUNT_REVEAL && ev.targetIdx != null && ev.card);
}

export function getHuntResultVisualEvent(state) {
  return getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.HUNT_RESULT && ev.hunterIdx != null && ev.targetIdx != null);
}

export function buildHuntRevealStepFromVisualEvents(state) {
  const event = getHuntRevealVisualEvent(state);
  return event ? buildHuntRevealStepFromVisualEvent(event, state) : null;
}
