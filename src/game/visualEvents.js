import { cardLogText } from './coreUtils';
import { localDisplayName } from './rotateState';
import { statEventsToAnimQueue } from './statEvents';
import { cardIdentity } from './cardIdentity';

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
  SPHINX_RESULT: 'sphinxResult',
  HAND_LIMIT_DISCARD: 'handLimitDiscard',
  CARD_EFFECT: 'cardEffect',
  EARTHQUAKE: 'earthquake',
  ANIM_TRANSACTION: 'animTransaction',
  ENDLESS_CORRIDOR_REPLAY: 'endlessCorridorReplay',
  GOD_POWER_BLOCKED: 'godPowerBlocked',
  TSG_SLIME_POP: 'tsgSlimePop',
  GOD_STATUS_CHANGED: 'godStatusChanged',
  THROW_STONE: 'throwStone',
  APOPHIS_TARGET: 'apophisTarget',
  INSPECTION: 'inspection',
  TSG_SLIME_GRANT: 'tsgSlimeGrant',
  MULTIPLY: 'multiply',
  RANDOM_TARGET: 'randomTarget',
};

const visualEventInstanceId = Math.random().toString(36).slice(2, 10);
let actionEventSeq = 0;
let visualEventSeq = 0;
let cardEffectEventSeq = 0;
let earthquakeEventSeq = 0;
let animTransactionEventSeq = 0;
let godPowerBlockedEventSeq = 0;
let tsgSlimePopEventSeq = 0;
let godStatusChangedEventSeq = 0;

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
  if (event.card) parts.push(`c${cardIdentity(event.card) || 'none'}`);
  if (Array.isArray(event.cards) && event.cards.length) {
    parts.push(`cards${event.cards.map(card => cardIdentity(card) || 'none').join(',')}`);
  }
  if (Array.isArray(event.statEvents) && event.statEvents.length) {
    parts.push(`seq${event.statEvents.map(ev => ev?.seq ?? `${ev?.type || 'stat'}:${ev?.target ?? ''}`).join(',')}`);
  }
  if (Array.isArray(event.discardEvents) && event.discardEvents.length) {
    parts.push(`quake${event.discardEvents.map(ev => `${ev?.playerIndex ?? ''}:${cardIdentity(ev?.card) || 'none'}`).join(',')}`);
  }
  if (event.effectKey) parts.push(`effect${event.effectKey}`);
  const msgKey = msgsIdentity(event.msgs);
  if (msgKey) parts.push(`m${msgKey}`);
  return parts.join('|');
}

function withVisualEventMeta(event, scope = 'action', generateUniqueId = true) {
  if (!event) return null;
  const scoped = {
    ...event,
    scope: event.scope || scope,
  };
  return {
    ...scoped,
    id: event.id || (generateUniqueId
      ? `${event.type}:${visualEventInstanceId}:${++visualEventSeq}`
      : makeVisualEventId(scoped)),
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

function createTurnStartEvent({ playerIdx = 0, playerName = '该玩家', msgs = [] } = {}) {
  return withVisualEventMeta({
    type: VISUAL_EVENT.TURN_START,
    turnStartStage: 'turnStart',
    turnStartStageOrder: 0,
    playerIdx,
    playerName,
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'turn');
}

function createDrawCardEvent({ playerIdx = 0, playerName = '该玩家', card, msgs = [], sourcePile = null } = {}) {
  if (!card) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.DRAW_CARD,
    turnStartStage: 'draw',
    turnStartStageOrder: 0,
    playerIdx,
    playerName,
    card,
    ...(sourcePile ? { sourcePile } : {}),
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'turn');
}

function createStatEventsEvent({ statEvents = [], msgs = [], turnStartStage = null } = {}) {
  const events = Array.isArray(statEvents) ? statEvents.filter(Boolean) : [];
  if (!events.length) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.STAT_EVENTS,
    ...(turnStartStage ? { turnStartStage, turnStartStageOrder: 1 } : {}),
    statEvents: events,
    msgs: Array.isArray(msgs) ? msgs : [],
  }, 'stat');
}

export function createBewitchGiftEvent({
  sourceIdx = 0,
  targetIdx = 0,
  targetName = '该玩家',
  card,
  msgs = [],
  encounterState = null,
} = {}) {
  if (!card) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.BEWITCH_GIFT,
    id: `${VISUAL_EVENT.BEWITCH_GIFT}:${visualEventInstanceId}:${++actionEventSeq}`,
    sourceIdx,
    targetIdx,
    targetName,
    card,
    msgs: Array.isArray(msgs) ? msgs : [],
    ...(encounterState ? { encounterState } : {}),
  }, 'action');
}

export function createSwapCardsEvent({
  sourceIdx = 0,
  targetIdx = 0,
  sourceCount = 1,
  targetCount = 1,
  msgs = [],
  takenCard = null,
  givenCard = null,
  sourceName = null,
  sourceLabel = null,
  beforePlayers = null,
  afterPlayers = null,
  beforeDiscard = null,
  afterDiscard = null,
} = {}) {
  return withVisualEventMeta({
    type: VISUAL_EVENT.SWAP_CARDS,
    id: `${VISUAL_EVENT.SWAP_CARDS}:${visualEventInstanceId}:${++actionEventSeq}`,
    sourceIdx,
    targetIdx,
    sourceCount,
    targetCount,
    ...(takenCard ? { takenCard } : {}),
    ...(givenCard ? { givenCard } : {}),
    ...(sourceName ? { sourceName } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(Array.isArray(beforePlayers) ? { beforePlayers } : {}),
    ...(Array.isArray(afterPlayers) ? { afterPlayers } : {}),
    ...(Array.isArray(beforeDiscard) ? { beforeDiscard } : {}),
    ...(Array.isArray(afterDiscard) ? { afterDiscard } : {}),
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

export function createSphinxResultEvent({ actorIdx = 0, card, guessCorrect = false, msgs = [] } = {}) {
  if (!card) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.SPHINX_RESULT,
    id: `${VISUAL_EVENT.SPHINX_RESULT}:${visualEventInstanceId}:${++actionEventSeq}`,
    actorIdx,
    card,
    guessCorrect: !!guessCorrect,
    msgs: Array.isArray(msgs) ? msgs : [],
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

export function createAnimTransactionEvent({
  actorIdx = 0,
  actorName = '该玩家',
  queue = [],
  msgs = [],
  beforePlayers = null,
  beforeDiscard = null,
  zhuLight = null,
  context = 'generic',
  barrier = 'continuation',
  id = null,
} = {}) {
  const replayQueue = Array.isArray(queue) ? queue.filter(Boolean) : [];
  if (!replayQueue.length) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.ANIM_TRANSACTION,
    id: id || `${VISUAL_EVENT.ANIM_TRANSACTION}:${visualEventInstanceId}:${++animTransactionEventSeq}`,
    actorIdx,
    actorName,
    context,
    barrier,
    queue: replayQueue,
    msgs: Array.isArray(msgs) ? msgs : [],
    beforePlayers: Array.isArray(beforePlayers) ? beforePlayers : null,
    beforeDiscard: Array.isArray(beforeDiscard) ? beforeDiscard : null,
    zhuLight: zhuLight || null,
  }, 'turn');
}

// Compatibility wrapper for states/tests produced before animation transactions
// were generalized. New callers that are not endless-corridor flows should use
// createAnimTransactionEvent and provide their own context.
export function createEndlessCorridorReplayEvent(options = {}) {
  const event = createAnimTransactionEvent({ ...options, context: 'endlessCorridor' });
  return event ? { ...event, type: VISUAL_EVENT.ENDLESS_CORRIDOR_REPLAY } : null;
}

export function buildHuntRevealStepFromVisualEvent(event, state, opts = {}) {
  if (!event?.card || event.targetIdx == null) return null;
  if (event.targetIdx === 0 && !opts.allowTargetZero) return null;
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
  return createCardEffectEvent({
    effectKey: 'earthquake',
    id: `${VISUAL_EVENT.EARTHQUAKE}:${visualEventInstanceId}:${++earthquakeEventSeq}`,
    beforePlayers,
    beforeDiscard,
    discardEvents,
    msgs,
  });
}

export function createCardEffectEvent({
  effectKey,
  card = null,
  actorIdx = null,
  id = null,
  beforePlayers = [],
  beforeDiscard = [],
  afterPlayers = null,
  afterDiscard = null,
  discardEvents = [],
  statEvents = [],
  msgs = [],
  payload = {},
} = {}) {
  if (!effectKey) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.CARD_EFFECT,
    id: id || `${VISUAL_EVENT.CARD_EFFECT}:${effectKey}:${visualEventInstanceId}:${++cardEffectEventSeq}`,
    effectKey,
    card: card || null,
    actorIdx,
    beforePlayers: Array.isArray(beforePlayers) ? beforePlayers : [],
    beforeDiscard: Array.isArray(beforeDiscard) ? beforeDiscard : [],
    afterPlayers: Array.isArray(afterPlayers) ? afterPlayers : null,
    afterDiscard: Array.isArray(afterDiscard) ? afterDiscard : null,
    discardEvents: Array.isArray(discardEvents) ? discardEvents.filter(Boolean) : [],
    statEvents: Array.isArray(statEvents) ? statEvents.filter(Boolean) : [],
    msgs: Array.isArray(msgs) ? msgs : [],
    payload: payload && typeof payload === 'object' ? payload : {},
  }, 'effect');
}

function buildSyncedCardEffectTimeline({
  beforePlayers = [],
  beforeDiscard = [],
  afterPlayers = null,
  afterDiscard = null,
  state = null,
  finalAtMs = 0,
} = {}) {
  const initialPlayers = Array.isArray(beforePlayers) ? beforePlayers : [];
  const initialDiscard = Array.isArray(beforeDiscard) ? beforeDiscard : [];
  const finalPlayers = Array.isArray(afterPlayers) ? afterPlayers : state?.players;
  const finalDiscard = Array.isArray(afterDiscard) ? afterDiscard : state?.discard;
  return {
    visualSetupTiming: 'queueStart',
    visualSetupPatch: {
      players: initialPlayers,
      discard: initialDiscard,
    },
    visualTimeline: [
      { atMs: 0, patch: { players: initialPlayers, discard: initialDiscard } },
      {
        atMs: finalAtMs,
        patch: {
          players: finalPlayers,
          discard: finalDiscard,
        },
      },
    ],
  };
}

export function buildSnakeTrapAnimStep(event, state) {
  const payload = event.payload || {};
  const assignmentList = Array.isArray(payload.assignmentList) ? payload.assignmentList : [];
  const assignmentHits = Array.isArray(payload.assignmentHits) ? payload.assignmentHits : [];
  const beforePlayers = Array.isArray(event.beforePlayers) ? event.beforePlayers : [];
  const afterPlayers = Array.isArray(event.afterPlayers) ? event.afterPlayers : state?.players || [];
  const totalLayers = payload.totalLayers || assignmentList.length;
  const livingCount = (beforePlayers.length ? beforePlayers : afterPlayers).filter(p => p && !p.isDead).length;
  const animMs = Math.max(3200, 1900 + totalLayers * 340);
  const sync = buildSyncedCardEffectTimeline({
    beforePlayers,
    beforeDiscard: event.beforeDiscard || [],
    afterPlayers,
    afterDiscard: event.afterDiscard || state?.discard,
    state,
    finalAtMs: animMs,
  });
  const snakeRays = Math.max(1, livingCount || totalLayers || assignmentList.length || 1);
  const rayAngles = Array.from({ length: snakeRays }, (_, i) => (i * 360) / snakeRays);
  return {
    type: 'SNAKE_TRAP',
    card: event.card,
    actorIdx: event.actorIdx,
    beforePlayers,
    afterPlayers,
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
    assignmentList,
    assignmentHits,
    totalLayers,
    rayAngles,
    durationMs: animMs,
    ...sync,
  };
}

export function createGodPowerBlockedEvent({
  playerIdx = 0,
  playerName = '该玩家',
  msgs = [],
  turnStartStage = null,
  turnStartStageOrder = null,
} = {}) {
  return withVisualEventMeta({
    type: VISUAL_EVENT.GOD_POWER_BLOCKED,
    id: `${VISUAL_EVENT.GOD_POWER_BLOCKED}:${visualEventInstanceId}:${++godPowerBlockedEventSeq}`,
    playerIdx,
    playerName,
    msgs: Array.isArray(msgs) ? msgs : [],
    ...(turnStartStage ? { turnStartStage } : {}),
    ...(Number.isFinite(turnStartStageOrder) ? { turnStartStageOrder } : {}),
  }, 'action');
}

export function createTsathogguaSlimePopEvent({ playerIdx = 0, playerName = '该玩家', cards = [], msgs = [], playersBefore = null, playersAfter = null } = {}) {
  const slimeCards = Array.isArray(cards) ? cards.filter(Boolean) : [];
  return withVisualEventMeta({
    type: VISUAL_EVENT.TSG_SLIME_POP,
    id: `${VISUAL_EVENT.TSG_SLIME_POP}:${visualEventInstanceId}:${++tsgSlimePopEventSeq}`,
    playerIdx,
    playerName,
    count: slimeCards.length || 1,
    cards: slimeCards,
    msgs: Array.isArray(msgs) ? msgs : [],
    ...(Array.isArray(playersBefore) ? { playersBefore } : {}),
    ...(Array.isArray(playersAfter) ? { playersAfter } : {}),
  }, 'action');
}

export function createGodStatusChangedEvent({
  playerIdx = 0,
  playerName = '该玩家',
  godKey = null,
  godLevel = 0,
  msgs = [],
  playersBefore = null,
  playersAfter = null,
  faithSettlement = null,
  presentAfterInspectionSeq = null,
} = {}) {
  if (!godKey || !Array.isArray(playersAfter)) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.GOD_STATUS_CHANGED,
    id: `${VISUAL_EVENT.GOD_STATUS_CHANGED}:${visualEventInstanceId}:${++godStatusChangedEventSeq}`,
    playerIdx,
    playerName,
    godKey,
    godLevel,
    msgs: Array.isArray(msgs) ? msgs : [],
    ...(Array.isArray(playersBefore) ? { playersBefore } : {}),
    playersAfter,
    ...(faithSettlement ? { faithSettlement } : {}),
    ...(presentAfterInspectionSeq != null ? { presentAfterInspectionSeq } : {}),
  }, 'action');
}

export function createThrowStoneEvent({ sourceIdx = 0, targetIdx = 0, roll = 1, distance = 0, damage = 0, resultText = '', msgs = [], playersBefore = null, playersAfter = null, statEvents = [], legacySeq = null } = {}) {
  return withVisualEventMeta({
    type: VISUAL_EVENT.THROW_STONE,
    sourceIdx,
    targetIdx,
    roll,
    distance,
    damage,
    resultText,
    msgs: Array.isArray(msgs) ? msgs : [],
    ...(Array.isArray(playersBefore) ? { playersBefore } : {}),
    ...(Array.isArray(playersAfter) ? { playersAfter } : {}),
    statEvents: Array.isArray(statEvents) ? statEvents : [],
    ...(legacySeq != null ? { legacySeq } : {}),
  }, 'action');
}

export function buildThrowStoneSteps(event, state = null) {
  if (!event || event.sourceIdx == null || event.targetIdx == null || event.roll == null) return [];
  const players = event.playersAfter || state?.players || [];
  return [
    {
      type: 'DICE_ROLL',
      visualEventId: event.id,
      diceMode: 'throwStone',
      d1: event.roll,
      d2: 0,
      rollerName: players?.[event.sourceIdx]?.name || '角色',
      msgs: [],
    },
    {
      type: 'RANDOM_TARGET',
      visualEventId: event.id,
      sourceIdx: event.sourceIdx,
      targetIdx: event.targetIdx,
      roll: event.roll,
      distance: event.distance,
      damage: event.damage || 0,
      label: '投掷石块',
      players,
      msgs: event.resultText ? [event.resultText] : [],
    },
    {
      type: 'THROW_STONE',
      visualEventId: event.id,
      sourceIdx: event.sourceIdx,
      targetIdx: event.targetIdx,
      damage: event.damage || 0,
      players,
      msgs: Array.isArray(event.msgs) ? event.msgs : [],
    },
    ...statEventsToAnimQueue(event.statEvents || [], event.playersBefore || players, []),
  ];
}

export function createApophisTargetVisualEvent(event = {}, { playersBefore = null, playersAfter = null, statEvents = [] } = {}) {
  if (!event?.seq || event.actorIdx == null || event.targetIdx == null) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.APOPHIS_TARGET,
    ...event,
    legacySeq: event.seq,
    ...(Array.isArray(playersBefore) ? { playersBefore } : {}),
    ...(Array.isArray(playersAfter) ? { playersAfter } : {}),
    statEvents: Array.isArray(statEvents) ? statEvents : [],
  }, 'action');
}

export function buildApophisTargetSteps(event, state = null) {
  if (!event?.legacySeq || event.roll == null) return [];
  const players = event.playersAfter || state?.players || [];
  const night = event.apophisNight || null;
  const steps = [{
    type: 'DICE_ROLL',
    visualEventId: event.id,
    _apophisTargetSeq: event.legacySeq,
    _apophisNight: night,
    diceMode: 'apophisNight',
    apophisChanged: !!event.changed,
    d1: event.roll,
    d2: 0,
    heal: 0,
    rollerName: event.actorName || players?.[event.actorIdx]?.name || '???',
    msgs: event.log ? [event.log] : [],
    _logChunk: event.log ? [event.log] : [],
  }];
  if (event.changed && /追捕/.test(event.label || '')) {
    steps.push({ type: 'SKILL_HUNT', visualEventId: event.id, _apophisTargetSeq: event.legacySeq, _apophisNight: night, targetIdx: event.targetIdx, msgs: [] });
  } else if (event.changed && /蛊惑/.test(event.label || '')) {
    steps.push({ type: 'SKILL_BEWITCH', visualEventId: event.id, _apophisTargetSeq: event.legacySeq, _apophisNight: night, targetIdx: event.targetIdx, msgs: [] });
  }
  steps.push(...statEventsToAnimQueue(event.statEvents || [], event.playersBefore || players, []));
  return steps;
}

export function createInspectionVisualEvent(inspectionEvent = {}) {
  if (!inspectionEvent?.card || inspectionEvent.target == null) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.INSPECTION,
    ...inspectionEvent,
    legacySeq: inspectionEvent.seq,
  }, 'inspection');
}

export function createTsathogguaSlimeGrantEvent(event = {}) {
  if (event.ownerIdx == null || !event.count) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.TSG_SLIME_GRANT,
    turnStartStage: 'turnBoundary',
    turnStartStageOrder: 0,
    playerIdx: event.ownerIdx,
    ...event,
  }, 'turn');
}

export function buildTsathogguaSlimeGrantSteps(event, state = null) {
  if (!event || event.ownerIdx == null || !event.count) return [];
  return [
    { type: 'VISUAL_LOCK', visualEventId: event.id, players: event.playersBefore, zhuLight: state?.zhuLight || null },
    {
      type: 'CARD_TRANSFER',
      visualEventId: event.id,
      fromPid: event.ownerIdx,
      dest: 'player',
      toPid: event.ownerIdx,
      count: event.count,
      sourceAnchor: 'playerArea',
      effect: 'tsgSlime',
      durationMs: 950,
      cards: event.cards || [],
      msgs: event.msgs || [],
    },
    { type: 'STATE_PATCH', visualEventId: event.id, players: event.playersAfter },
    { type: 'TURN_BOUNDARY_PAUSE', visualEventId: event.id, durationMs: 180 },
  ];
}

export function createMultiplyVisualEvent({ fromIdx = 0, toIdx = 0, count = 1, cards = [], msgs = [], playersBefore = null, playersAfter = null, discardAfter = null } = {}) {
  if (fromIdx == null || toIdx == null) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.MULTIPLY,
    sourceIdx: fromIdx,
    targetIdx: toIdx,
    fromIdx,
    toIdx,
    count,
    cards: Array.isArray(cards) ? cards : [],
    msgs: Array.isArray(msgs) ? msgs : [],
    ...(Array.isArray(playersBefore) ? { playersBefore } : {}),
    ...(Array.isArray(playersAfter) ? { playersAfter } : {}),
    ...(Array.isArray(discardAfter) ? { discardAfter } : {}),
  }, 'action');
}

export function createRandomTargetVisualEvent(event = {}, { players = null } = {}) {
  if (event.sourceIdx == null || event.targetIdx == null) return null;
  return withVisualEventMeta({
    type: VISUAL_EVENT.RANDOM_TARGET,
    ...event,
    ...(Array.isArray(players) ? { playersAfter: players } : {}),
    legacySeq: event.seq,
  }, 'action');
}

export function buildRandomTargetSteps(event, state = null) {
  if (!event || event.sourceIdx == null || event.targetIdx == null) return [];
  return [{
    type: 'RANDOM_TARGET',
    visualEventId: event.id,
    ...event,
    players: event.playersAfter || state?.players || [],
    msgs: event.resultText ? [event.resultText] : (event.msgs || []),
  }];
}

export function buildMultiplySteps(event) {
  if (!event || event.fromIdx == null || event.toIdx == null) return [];
  return [
    {
      type: 'CARD_TRANSFER',
      visualEventId: event.id,
      fromPid: event.fromIdx,
      dest: 'player',
      toPid: event.toIdx,
      count: event.count || 1,
      cards: event.cards || [],
      effect: 'blackGoat',
      durationMs: 1500,
      msgs: event.msgs || [],
    },
    ...(Array.isArray(event.playersAfter) ? [{
      type: 'STATE_PATCH',
      visualEventId: event.id,
      players: event.playersAfter,
      ...(Array.isArray(event.discardAfter) ? { discard: event.discardAfter } : {}),
    }] : []),
  ];
}

export function buildGodStatusChangedStep(event) {
  if (!event?.godKey || event.playerIdx == null) return null;
  const setupPlayers = Array.isArray(event.playersBefore)
    ? event.playersBefore
    : event.playersAfter;
  return {
    type: 'GOD_HIGHLIGHT',
    visualEventId: event.id,
    targetPid: event.playerIdx,
    godKey: event.godKey,
    godLevel: event.godLevel || 0,
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
    ...(Array.isArray(setupPlayers) ? { visualSetupPatch: { players: setupPlayers } } : {}),
    ...(Array.isArray(event.playersAfter) ? { visualTimeline: [{ atMs: 0, patch: { players: event.playersAfter } }] } : {}),
  };
}

function buildStatEventsFromPlayerSnapshots(beforePlayers = [], afterPlayers = [], msgs = [], reason = '卡牌效果') {
  if (!Array.isArray(beforePlayers) || !Array.isArray(afterPlayers)) return [];
  const logHint = Array.isArray(msgs) ? msgs[0] : undefined;
  return beforePlayers.flatMap((before, target) => {
    const after = afterPlayers[target];
    if (!before || !after) return [];
    const hpLoss = Math.max(0, Number(before.hp ?? 0) - Number(after.hp ?? before.hp ?? 0));
    const hpGain = Math.max(0, Number(after.hp ?? 0) - Number(before.hp ?? after.hp ?? 0));
    const sanLoss = Math.max(0, Number(before.san ?? 0) - Number(after.san ?? before.san ?? 0));
    const sanGain = Math.max(0, Number(after.san ?? 0) - Number(before.san ?? after.san ?? 0));
    const from = { hp: before.hp, san: before.san, isDead: !!before.isDead };
    const to = { hp: after.hp, san: after.san, isDead: !!after.isDead };
    const events = [];
    if (hpLoss && sanLoss) events.push({ type: 'HP_SAN_LOSS', target, from, to, reason, logHint });
    else {
      if (hpLoss) events.push({ type: 'HP_LOSS', target, from, to, reason, logHint });
      if (sanLoss) events.push({ type: 'SAN_LOSS', target, from, to, reason, logHint });
    }
    if (hpGain && sanGain) events.push({ type: 'HP_SAN_GAIN', target, from, to, reason, logHint });
    else {
      if (hpGain) events.push({ type: 'HP_GAIN', target, from, to, reason, logHint });
      if (sanGain) events.push({ type: 'SAN_GAIN', target, from, to, reason, logHint });
    }
    return events;
  });
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
  const turnDrawEvent = (Array.isArray(state._turnDrawEvents) ? state._turnDrawEvents : [])
    .findLast(event => event?.card);
  const drawCard = state.phase === 'GOD_CHOICE'
    ? state.abilityData?.godCard
    : (state.drawReveal?.card || turnDrawEvent?.card);
  if (drawCard) {
    const drawerIdx = state.phase === 'GOD_CHOICE'
      ? (state.abilityData?.drawerIdx ?? state.currentTurn ?? 0)
      : (state.drawReveal?.drawerIdx ?? turnDrawEvent?.drawerIdx ?? state.currentTurn ?? 0);
    const drawEvent = createDrawCardEvent({
      playerIdx: drawerIdx,
      playerName: turnDrawEvent?.drawerName || state.players?.[drawerIdx]?.name || '该玩家',
      card: drawCard,
      sourcePile: state.drawReveal?.sourcePile || turnDrawEvent?.sourcePile || state.abilityData?.sourcePile || state._drawSourcePile || null,
      msgs: state._drawLogs,
    });
    if (drawEvent) events.push(drawEvent);
  }
  return events;
}

export function buildFreshStatVisualEvents(state, previousStatSeq = 0) {
  const statLogSet = new Set((Array.isArray(state?._statLogs) ? state._statLogs : []).filter(Boolean));
  const freshStatEvents = Array.isArray(state?._statEvents)
    ? state._statEvents.filter(ev => (
      ev &&
      (ev.seq == null || ev.seq > (previousStatSeq || 0)) &&
      (!statLogSet.size || !ev.logHint || statLogSet.has(ev.logHint))
    ))
    : [];
  const statLogs = Array.isArray(state?._statLogs) ? state._statLogs : [];
  const msgsFor = (events, otherEvents) => {
    if (!otherEvents.length) return statLogs;
    const hints = new Set(events.map(event => event?.logHint).filter(Boolean));
    return statLogs.filter(msg => hints.has(msg));
  };
  const preDrawEvents = freshStatEvents.filter(isPreDrawTurnStartStatEvent);
  const drawEvents = freshStatEvents.filter(event => !isPreDrawTurnStartStatEvent(event));
  return [
    createStatEventsEvent({
      statEvents: preDrawEvents,
      msgs: msgsFor(preDrawEvents, drawEvents),
      turnStartStage: 'turnStart',
    }),
    createStatEventsEvent({
      statEvents: drawEvents,
      msgs: msgsFor(drawEvents, preDrawEvents),
      turnStartStage: 'draw',
    }),
  ].filter(Boolean);
}

export function isPreDrawTurnStartStatEvent(event) {
  return event?.reason === '黑山羊幼仔' ||
    String(event?.logHint || '').includes('黑山羊幼仔') ||
    event?.reason === '两人一绳' ||
    String(event?.logHint || '').includes('【两人一绳】');
}

export function getVisualEvents(state) {
  return Array.isArray(state?._visualEvents)
    ? state._visualEvents.map(event => withVisualEventMeta(event, 'action', false)).filter(Boolean)
    : [];
}

function legacyVisualEventId(type, parts = []) {
  return `legacy:${type}:${parts.map(part => String(part ?? '')).join(':')}`;
}

function legacyCardKey(card) {
  return cardIdentity(card) || card?.id || card?.key || card?.name || 'none';
}

export function promoteLegacyVisualEvents(state) {
  if (!state) return [];
  const explicit = getVisualEvents(state);
  const promoted = [];
  const hasEvent = predicate => explicit.some(predicate) || promoted.some(predicate);

  const coveredStatSeqs = new Set(explicit.flatMap(event => (
    Array.isArray(event?.statEvents) ? event.statEvents.map(stat => stat?.seq).filter(seq => seq != null) : []
  )));
  const currentStatSeq = state._statEventSeq;
  const currentStatLogs = new Set((state._statLogs || []).filter(Boolean));
  const legacyStats = (Array.isArray(state._statEvents) ? state._statEvents : [])
    .filter(event => event &&
      (event.seq == null || !coveredStatSeqs.has(event.seq)) &&
      (
        currentStatSeq == null ||
        event.seq == null ||
        event.seq === currentStatSeq ||
        (event.logHint && currentStatLogs.has(event.logHint))
      ));
  const statGroups = new Map();
  legacyStats.forEach(event => {
    const key = event.seq ?? `${event.type}:${event.target ?? ''}`;
    if (!statGroups.has(key)) statGroups.set(key, []);
    statGroups.get(key).push(event);
  });
  statGroups.forEach((statEvents, key) => promoted.push({
    type: VISUAL_EVENT.STAT_EVENTS,
    id: legacyVisualEventId(VISUAL_EVENT.STAT_EVENTS, [key]),
    scope: 'stat',
    statEvents,
    msgs: state._statLogs || [],
  }));

  (state._inspectionEvents || []).forEach(event => {
    if (hasEvent(candidate => candidate.type === VISUAL_EVENT.INSPECTION && candidate.legacySeq === event?.seq)) return;
    promoted.push({
      ...event,
      type: VISUAL_EVENT.INSPECTION,
      id: legacyVisualEventId(VISUAL_EVENT.INSPECTION, [event?.seq, event?.target, legacyCardKey(event?.card)]),
      scope: 'inspection',
      legacySeq: event?.seq,
    });
  });

  const apophis = state._apophisTargetEvent;
  if (apophis?.seq && !hasEvent(event => event.type === VISUAL_EVENT.APOPHIS_TARGET && event.legacySeq === apophis.seq)) {
    promoted.push({
      ...apophis,
      type: VISUAL_EVENT.APOPHIS_TARGET,
      id: legacyVisualEventId(VISUAL_EVENT.APOPHIS_TARGET, [apophis.seq]),
      scope: 'action',
      legacySeq: apophis.seq,
    });
  }

  (state._randomTargetEvents || []).forEach(event => {
    const type = event?.label === '投掷石块' ? VISUAL_EVENT.THROW_STONE : VISUAL_EVENT.RANDOM_TARGET;
    if (hasEvent(candidate => candidate.type === type && candidate.legacySeq === event?.seq)) return;
    promoted.push({
      ...event,
      type,
      id: legacyVisualEventId(type, [event?.seq, event?.sourceIdx, event?.targetIdx]),
      scope: 'action',
      legacySeq: event?.seq,
    });
  });

  (state._aiHuntEvents || []).forEach((event, index) => {
    if (hasEvent(candidate => candidate.type === VISUAL_EVENT.HUNT_RESULT && candidate.hunterIdx === event?.hunterIdx && candidate.targetIdx === event?.targetIdx)) return;
    promoted.push({
      ...event,
      type: VISUAL_EVENT.HUNT_RESULT,
      id: legacyVisualEventId(VISUAL_EVENT.HUNT_RESULT, [state._turnKey, index, event?.hunterIdx, event?.targetIdx]),
      scope: 'action',
      sourceIdx: event?.sourceIdx ?? event?.hunterIdx,
    });
  });

  const sphinx = state._animSphinxReveal;
  if (sphinx?.card && !hasEvent(event => event.type === VISUAL_EVENT.SPHINX_RESULT && event.actorIdx === sphinx.actorIdx && legacyCardKey(event.card) === legacyCardKey(sphinx.card))) {
    promoted.push({
      ...sphinx,
      type: VISUAL_EVENT.SPHINX_RESULT,
      id: legacyVisualEventId(VISUAL_EVENT.SPHINX_RESULT, [state._turnKey, sphinx.actorIdx, legacyCardKey(sphinx.card)]),
      scope: 'action',
      msgs: state._statLogs || [],
    });
  }

  (state._tsgSlimeGrantEvents || []).forEach((event, index) => {
    if (hasEvent(candidate => candidate.type === VISUAL_EVENT.TSG_SLIME_GRANT && candidate.playerIdx === event?.ownerIdx && candidate.count === event?.count)) return;
    promoted.push({
      ...event,
      type: VISUAL_EVENT.TSG_SLIME_GRANT,
      turnStartStage: 'turnBoundary',
      turnStartStageOrder: 0,
      id: legacyVisualEventId(VISUAL_EVENT.TSG_SLIME_GRANT, [state._turnKey, index, event?.ownerIdx, event?.count]),
      scope: 'turn',
      playerIdx: event?.ownerIdx,
    });
  });

  (state._turnDrawEvents || []).forEach((event, index) => {
    if (!event?.card || hasEvent(candidate => candidate.type === VISUAL_EVENT.DRAW_CARD && candidate.playerIdx === event.drawerIdx && legacyCardKey(candidate.card) === legacyCardKey(event.card))) return;
    promoted.push({
      type: VISUAL_EVENT.DRAW_CARD,
      id: legacyVisualEventId(VISUAL_EVENT.DRAW_CARD, [state._turnKey, index, event.drawerIdx, legacyCardKey(event.card)]),
      scope: 'turn',
      playerIdx: event.drawerIdx,
      playerName: event.drawerName,
      card: event.card,
      msgs: event.msgs || [],
      sourcePile: event.sourcePile || null,
    });
  });

  return [...explicit, ...promoted];
}

export function ensureVisualEventState(state) {
  if (!state) return state;
  const events = promoteLegacyVisualEvents(state);
  return { ...state, _visualEvents: events };
}

export function clearVisualEvents(state) {
  return state ? { ...state, _visualEvents: [] } : state;
}

export function getVisualEventIds(events) {
  return (Array.isArray(events) ? events : [])
    .map(event => withVisualEventMeta(event, 'action', false)?.id)
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
    cards: Array.isArray(event.cards) ? event.cards : [],
    count: Array.isArray(event.cards) ? event.cards.length : 1,
    triggerName: displayName,
    targetPid: playerIdx,
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
  }];
}

export function buildTurnStartStepFromVisualEvents(state) {
  const event = getVisualEvents(state).findLast(ev =>
    ev?.type === VISUAL_EVENT.TURN_START &&
    (ev.playerIdx == null || ev.playerIdx === (state?.currentTurn ?? 0))
  );
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
  const event = getVisualEvents(state).findLast(ev =>
    ev?.type === VISUAL_EVENT.DRAW_CARD &&
    ev.card &&
    (ev.playerIdx == null || ev.playerIdx === (state?.currentTurn ?? 0))
  );
  if (!event) return null;
  const playerIdx = event.playerIdx ?? state?.currentTurn ?? 0;
  const playerName = event.playerName || state?.players?.[playerIdx]?.name || '???';
  return {
    type: 'DRAW_CARD',
    card: event.card,
    triggerName: localDisplayName(playerIdx, playerName),
    targetPid: playerIdx,
    sourcePile: event.sourcePile || state?.drawReveal?.sourcePile || state?._drawSourcePile || 'deck',
    msgs: Array.isArray(event.msgs) ? event.msgs : [],
  };
}

export function buildStatStepsFromVisualEvents(state, players) {
  const event = getVisualEvents(state).findLast(ev => ev?.type === VISUAL_EVENT.STAT_EVENTS && Array.isArray(ev.statEvents) && ev.statEvents.length);
  if (!event) return [];
  return statEventsToAnimQueue(event.statEvents, players || state?.players || [], event.msgs || []);
}

export function buildGodPowerBlockedStepsFromVisualEvents(state, oldState = null) {
  const oldIds = new Set(getVisualEventIds(getVisualEvents(oldState)));
  const events = getVisualEvents(state)
    .filter(ev => ev?.type === VISUAL_EVENT.GOD_POWER_BLOCKED && ev?.id && !oldIds.has(ev.id));
  return events
    .map(event => {
      const playerIdx = event.playerIdx ?? 0;
      const playerName = event.playerName || state?.players?.[playerIdx]?.name || '该玩家';
      return {
        type: 'GOD_POWER_BLOCKED',
        targetPid: playerIdx,
        name: localDisplayName(playerIdx, playerName),
        msgs: Array.isArray(event.msgs) ? event.msgs : [],
      };
    });
}

export function buildCardEffectAnimStep(event, state) {
  if (!event) return null;
  if (event.effectKey === 'earthquake' || event.type === VISUAL_EVENT.EARTHQUAKE) {
    return buildEarthquakeAnimStep({
      beforePlayers: event.beforePlayers,
      beforeDiscard: event.beforeDiscard,
      discardEvents: event.discardEvents,
      finalPlayers: state?.players,
      msgs: event.msgs,
    });
  }
  if (event.effectKey === 'forcedRandomDiscard') {
    const initialPlayers = Array.isArray(event.beforePlayers) ? event.beforePlayers : [];
    const initialDiscard = Array.isArray(event.beforeDiscard) ? event.beforeDiscard : [];
    let cursorPlayers = initialPlayers;
    let cursorDiscard = initialDiscard;
    const discardEvents = Array.isArray(event.discardEvents) ? event.discardEvents : [];
    const steps = discardEvents.map((discardEvent, index) => {
      const playerIndex = discardEvent?.playerIndex ?? event.actorIdx ?? 0;
      const playerName = state?.players?.[playerIndex]?.name || initialPlayers?.[playerIndex]?.name || '该玩家';
      const nextPlayers = Array.isArray(discardEvent?.afterPlayers)
        ? discardEvent.afterPlayers
        : (event.afterPlayers || state?.players || cursorPlayers);
      const nextDiscard = Array.isArray(discardEvent?.afterDiscard)
        ? discardEvent.afterDiscard
        : (event.afterDiscard || state?.discard || cursorDiscard);
      const step = {
        type: 'DISCARD',
        card: discardEvent?.card || null,
        cards: discardEvent?.card ? [discardEvent.card] : [],
        count: 1,
        triggerName: localDisplayName(playerIndex, playerName),
        targetPid: playerIndex,
        msgs: index === 0 && Array.isArray(event.msgs) ? event.msgs : [],
        // Unlike queueStart setup, stepStart keeps the preceding draw/income
        // presentation intact and restores the hand only when the forced
        // discard itself begins.
        visualSetupTiming: 'stepStart',
        visualSetupPatch: {
          players: cursorPlayers,
          discard: cursorDiscard,
        },
        visualTimeline: [
          { atMs: 0, patch: { players: cursorPlayers, discard: cursorDiscard } },
          { atMs: 900, patch: { players: nextPlayers, discard: nextDiscard } },
        ],
      };
      cursorPlayers = nextPlayers;
      cursorDiscard = nextDiscard;
      return step;
    });
    return {
      type: 'COMPOSITE',
      steps,
    };
  }
  if (event.effectKey === 'geomagneticReversal') {
    const payload = event.payload || {};
    const baseSync = buildSyncedCardEffectTimeline({
      beforePlayers: event.beforePlayers,
      beforeDiscard: event.beforeDiscard,
      afterPlayers: event.beforePlayers,
      afterDiscard: event.beforeDiscard,
      state,
      finalAtMs: 0,
    });
    const restoreSync = buildSyncedCardEffectTimeline({
      beforePlayers: event.beforePlayers,
      beforeDiscard: event.beforeDiscard,
      afterPlayers: event.afterPlayers || state?.players,
      afterDiscard: event.afterDiscard || state?.discard,
      state,
      finalAtMs: 880,
    });
    return {
      type: 'COMPOSITE',
      steps: [
        {
          type: 'GEOMAGNETIC_REVERSAL',
          card: event.card,
          actorIdx: event.actorIdx,
          beforePlayers: event.beforePlayers || [],
          beforeDiscard: event.beforeDiscard || [],
          msgs: [],
          ...baseSync,
        },
        {
          type: 'GEOMAGNETIC_RESTORE_SHUFFLE',
          card: payload.restoreCard || null,
          actorIdx: event.actorIdx,
          restoreCard: payload.restoreCard || null,
          beforePlayers: event.beforePlayers || [],
          beforeDiscard: event.beforeDiscard || [],
          msgs: Array.isArray(event.msgs) ? event.msgs : [],
          ...restoreSync,
        },
      ],
    };
  }
  if (event.effectKey === 'volcano') {
    const volcanoStatEvents = Array.isArray(event.statEvents) && event.statEvents.length
      ? event.statEvents
      : buildStatEventsFromPlayerSnapshots(
        event.beforePlayers,
        event.afterPlayers || state?.players || [],
        event.msgs || [],
        event.card?.name || '活火山'
      );
    const sync = buildSyncedCardEffectTimeline({
      beforePlayers: event.beforePlayers,
      beforeDiscard: event.beforeDiscard,
      afterPlayers: event.afterPlayers || state?.players,
      afterDiscard: event.afterDiscard || state?.discard,
      state,
      finalAtMs: 2400,
    });
    const statSteps = statEventsToAnimQueue(
      volcanoStatEvents,
      event.beforePlayers || state?.players || [],
      event.msgs || []
    );
    return {
      type: 'COMPOSITE',
      steps: [
        {
          type: 'VOLCANO',
          card: event.card,
          actorIdx: event.actorIdx,
          beforePlayers: event.beforePlayers || [],
          beforeDiscard: event.beforeDiscard || [],
          msgs: Array.isArray(event.msgs) ? event.msgs : [],
          ...sync,
        },
        ...statSteps,
      ],
    };
  }
  if (event.effectKey === 'undergroundSpring') {
    const springStatEvents = Array.isArray(event.statEvents) && event.statEvents.length
      ? event.statEvents
      : buildStatEventsFromPlayerSnapshots(
        event.beforePlayers,
        event.afterPlayers || state?.players || [],
        event.msgs || [],
        event.card?.name || '地下泉'
      );
    const sync = buildSyncedCardEffectTimeline({
      beforePlayers: event.beforePlayers,
      beforeDiscard: event.beforeDiscard,
      afterPlayers: event.afterPlayers || state?.players,
      afterDiscard: event.afterDiscard || state?.discard,
      state,
      finalAtMs: 300,
    });
    const statSteps = statEventsToAnimQueue(
      springStatEvents,
      event.beforePlayers || state?.players || [],
      event.msgs || []
    );
    return {
      type: 'COMPOSITE',
      steps: [
        {
          type: 'UNDERGROUND_SPRING',
          card: event.card,
          actorIdx: event.actorIdx,
          beforePlayers: event.beforePlayers || [],
          beforeDiscard: event.beforeDiscard || [],
          msgs: Array.isArray(event.msgs) ? event.msgs : [],
          ...sync,
        },
        ...statSteps,
      ],
    };
  }
  if (event.effectKey === 'startledBats') {
    const batsStatEvents = Array.isArray(event.statEvents) && event.statEvents.length
      ? event.statEvents
      : buildStatEventsFromPlayerSnapshots(
        event.beforePlayers,
        event.afterPlayers || state?.players || [],
        event.msgs || [],
        event.card?.name || '惊扰蝙蝠'
      );
    const sync = buildSyncedCardEffectTimeline({
      beforePlayers: event.beforePlayers,
      beforeDiscard: event.beforeDiscard,
      afterPlayers: event.afterPlayers || state?.players,
      afterDiscard: event.afterDiscard || state?.discard,
      state,
      finalAtMs: 1320,
    });
    const statSteps = statEventsToAnimQueue(
      batsStatEvents,
      event.beforePlayers || state?.players || [],
      event.msgs || []
    );
    return {
      type: 'COMPOSITE',
      steps: [
        {
          type: 'STARTLED_BATS',
          card: event.card,
          actorIdx: event.actorIdx,
          beforePlayers: event.beforePlayers || [],
          beforeDiscard: event.beforeDiscard || [],
          msgs: Array.isArray(event.msgs) ? event.msgs : [],
          ...sync,
        },
        ...statSteps,
      ],
    };
  }
  if (event.effectKey === 'nightWind') {
    const nightWindStatEvents = Array.isArray(event.statEvents) && event.statEvents.length
      ? event.statEvents
      : buildStatEventsFromPlayerSnapshots(
        event.beforePlayers,
        event.afterPlayers || state?.players || [],
        event.msgs || [],
        event.card?.name || '夜风呼啸'
      );
    const sync = buildSyncedCardEffectTimeline({
      beforePlayers: event.beforePlayers,
      beforeDiscard: event.beforeDiscard,
      afterPlayers: event.afterPlayers || state?.players,
      afterDiscard: event.afterDiscard || state?.discard,
      state,
      finalAtMs: 1250,
    });
    const statSteps = statEventsToAnimQueue(
      nightWindStatEvents,
      event.beforePlayers || state?.players || [],
      event.msgs || []
    );
    return {
      type: 'COMPOSITE',
      steps: [
        {
          type: 'NIGHT_WIND',
          card: event.card,
          actorIdx: event.actorIdx,
          beforePlayers: event.beforePlayers || [],
          beforeDiscard: event.beforeDiscard || [],
          msgs: Array.isArray(event.msgs) ? event.msgs : [],
          ...sync,
        },
        ...statSteps,
      ],
    };
  }
  if (event.effectKey === 'burrowingWorm') {
    const sync = buildSyncedCardEffectTimeline({
      beforePlayers: event.beforePlayers,
      beforeDiscard: event.beforeDiscard,
      afterPlayers: event.beforePlayers,
      afterDiscard: event.beforeDiscard,
      state,
      finalAtMs: 0,
    });
    return {
      type: 'BURROWING_WORM',
      card: event.card,
      actorIdx: event.actorIdx,
      beforePlayers: event.beforePlayers || [],
      beforeDiscard: event.beforeDiscard || [],
      msgs: Array.isArray(event.msgs) ? event.msgs : [],
      durationMs: 2750,
      ...sync,
    };
  }
  if (event.effectKey === 'etherealizeGain') {
    const payload = event.payload || {};
    const sync = buildSyncedCardEffectTimeline({
      beforePlayers: event.beforePlayers,
      beforeDiscard: event.beforeDiscard,
      afterPlayers: event.afterPlayers || state?.players,
      afterDiscard: event.afterDiscard || state?.discard,
      state,
      finalAtMs: 3600,
    });
    return {
      type: 'ETHEREALIZE_GAIN',
      card: event.card,
      actorIdx: event.actorIdx,
      stackCount: Math.max(0, payload.stackCount || 0),
      beforePlayers: event.beforePlayers || [],
      beforeDiscard: event.beforeDiscard || [],
      msgs: Array.isArray(event.msgs) ? event.msgs : [],
      durationMs: 3800,
      ...sync,
    };
  }
  if (event.effectKey === 'snakeTrap') {
    return buildSnakeTrapAnimStep(event, state);
  }
  return null;
}

export function getCardEffectVisualEvents(state, effectKey = null) {
  const events = getVisualEvents(state).filter(ev => (
    ev?.type === VISUAL_EVENT.CARD_EFFECT ||
    ev?.type === VISUAL_EVENT.EARTHQUAKE
  ));
  const normalized = events.map(ev => (
    ev.type === VISUAL_EVENT.EARTHQUAKE
      ? { ...ev, type: VISUAL_EVENT.CARD_EFFECT, effectKey: 'earthquake' }
      : ev
  ));
  return effectKey ? normalized.filter(ev => ev.effectKey === effectKey) : normalized;
}

export function buildCardEffectStepsFromVisualEvents(state, oldState = null, predicate = null) {
  const oldIds = new Set(getVisualEventIds(getCardEffectVisualEvents(oldState)));
  return getCardEffectVisualEvents(state)
    .filter(event => event?.id && !oldIds.has(event.id))
    .filter(event => (typeof predicate === 'function' ? predicate(event) : true))
    .flatMap(event => {
      const step = buildCardEffectAnimStep(event, state);
      return step?.type === 'COMPOSITE' ? step.steps : [step];
    })
    .filter(Boolean);
}

export function getAnimTransactionVisualEvent(state) {
  return getVisualEvents(state).find(ev => (
    (ev?.type === VISUAL_EVENT.ANIM_TRANSACTION || ev?.type === VISUAL_EVENT.ENDLESS_CORRIDOR_REPLAY)
    && Array.isArray(ev.queue)
    && ev.queue.length
  ));
}

export const getEndlessCorridorReplayVisualEvent = getAnimTransactionVisualEvent;

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

export function getSphinxResultVisualEvent(state) {
  return getVisualEvents(state).find(ev => ev?.type === VISUAL_EVENT.SPHINX_RESULT && ev.actorIdx != null && ev.card);
}

export function buildHuntRevealStepFromVisualEvents(state) {
  const event = getHuntRevealVisualEvent(state);
  return event ? buildHuntRevealStepFromVisualEvent(event, state) : null;
}
