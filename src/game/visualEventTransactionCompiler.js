import {
  VISUAL_EVENT,
  buildCardEffectAnimStep,
  buildGodPowerBlockedStepsFromVisualEvents,
  buildGodStatusChangedStep,
  buildThrowStoneSteps,
  buildApophisTargetSteps,
  buildMultiplySteps,
  buildTsathogguaSlimeGrantSteps,
  buildRandomTargetSteps,
  buildTurnStartStepFromVisualEvents,
  buildDrawCardStepFromVisualEvents,
  buildHandLimitDiscardStepsFromVisualEvents,
  buildStatStepsFromVisualEvents,
  buildTimedOutDrawDiscardStepFromVisualEvents,
  getVisualEventIdsFromState,
} from './visualEvents';
import { buildAiHuntEventAnimQueue, buildAnimQueue } from './animQueueCore';
import { buildInspectionEventFlow, buildSphinxResultQueue, swapCardsSteps } from './animQueueHelpers';
import { buildBewitchGiftReplay } from './animReplayEvents';
import { copyPlayers } from './coreUtils';

function stateWithSingleEvent(state, event) {
  return { ...(state || {}), _visualEvents: event ? [event] : [] };
}

function flattenStep(step) {
  if (!step) return [];
  return step.type === 'COMPOSITE' ? (step.steps || []).filter(Boolean) : [step];
}

function tagVisualEventSteps(event, steps = []) {
  return (Array.isArray(steps) ? steps : []).map(step => (
    step
      ? {
          ...step,
          ...(event?.id && !step.visualEventId ? { visualEventId: event.id } : {}),
          ...(event?.turnStartStage && !step.turnStartStage
            ? { turnStartStage: event.turnStartStage }
            : {}),
        }
      : step
  ));
}

function orderTurnStartVisualEvents(events = []) {
  if (!events.some(event => event?.turnStartStage)) return events;
  const rank = stage => stage === 'turnBoundary' ? 0 : stage === 'turnBanner' ? 1 : stage === 'turnStart' ? 2 : stage === 'draw' ? 3 : 4;
  const result = [];
  let stagedGroup = [];
  const flushStagedGroup = () => {
    if (!stagedGroup.length) return;
    result.push(...stagedGroup
      .map((event, index) => ({ event, index }))
      .sort((left, right) => (
        rank(left.event?.turnStartStage) - rank(right.event?.turnStartStage) ||
        (left.event?.turnStartStageOrder || 0) - (right.event?.turnStartStageOrder || 0) ||
        left.index - right.index
      ))
      .map(item => item.event));
    stagedGroup = [];
  };
  events.forEach(event => {
    if (event?.turnStartStage) {
      stagedGroup.push(event);
      return;
    }
    // An unscoped action event is a hard transaction boundary. Never move a
    // later turn-start/draw event across it merely to normalize stage order.
    flushStagedGroup();
    result.push(event);
  });
  flushStagedGroup();
  return result;
}

function visualEventMatchesCompileScope(event, options = {}) {
  if (Array.isArray(options.eventIds)) {
    const requestedIds = new Set(options.eventIds.filter(Boolean));
    return !!event?.id && requestedIds.has(event.id);
  }
  if (options.visualEventScope === 'action') return !event?.turnStartStage;
  if (options.visualEventScope === 'turnStart') return !!event?.turnStartStage;
  return true;
}

function sameCard(left, right) {
  if (!left || !right) return left === right;
  return (left.id && right.id && left.id === right.id) ||
    (left.key && right.key && left.key === right.key && left.name === right.name);
}

function sameStatEvents(left = [], right = []) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  if (!a.length || !b.length) return false;
  return a.some(x => b.some(y => (
    x?.id && y?.id ? x.id === y.id : x?.seq === y?.seq && x?.type === y?.type && x?.target === y?.target
  )));
}

const CARD_EFFECTS_OWNING_STAT_PRESENTATION = new Set([
  'volcano',
  'undergroundSpring',
  'startledBats',
  'nightWind',
]);

function suppressStatsOwnedByCardEffects(events = []) {
  const owningStatEvents = events
    .filter(event => (
      event?.type === VISUAL_EVENT.CARD_EFFECT &&
      CARD_EFFECTS_OWNING_STAT_PRESENTATION.has(event?.effectKey) &&
      Array.isArray(event?.statEvents) &&
      event.statEvents.length
    ))
    .flatMap(event => event.statEvents);
  if (!owningStatEvents.length) return { events, suppressedEventIds: [] };

  const suppressedEventIds = [];
  const filteredEvents = events.flatMap(event => {
    if (event?.type !== VISUAL_EVENT.STAT_EVENTS || !Array.isArray(event.statEvents)) return [event];
    const remainingStatEvents = event.statEvents.filter(statEvent => (
      !owningStatEvents.some(ownedStatEvent => sameStatEvents([statEvent], [ownedStatEvent]))
    ));
    if (remainingStatEvents.length === event.statEvents.length) return [event];
    if (!remainingStatEvents.length) {
      if (event.id) suppressedEventIds.push(event.id);
      return [];
    }
    return [{ ...event, statEvents: remainingStatEvents }];
  });
  return { events: filteredEvents, suppressedEventIds };
}

function statStepTargets(step) {
  const targets = [
    ...(Array.isArray(step?.statEvents) ? step.statEvents.map(event => event?.target) : []),
    ...(Array.isArray(step?.hitIndices) ? step.hitIndices : []),
    ...(Array.isArray(step?.targets) ? step.targets : []),
    step?.targetPid,
    step?.targetIdx,
    step?.triggerPid,
  ].filter(target => target != null).map(Number);
  return [...new Set(targets)].sort((a, b) => a - b);
}

function sameStatStepTargets(left, right) {
  const a = statStepTargets(left);
  const b = statStepTargets(right);
  return a.length > 0 && a.length === b.length && a.every((target, index) => target === b[index]);
}

function isEquivalentAnimationStep(left, right) {
  if (!left || !right || left.type !== right.type) return false;
  if (left.visualEventId && right.visualEventId) return left.visualEventId === right.visualEventId;
  if (left.type === 'DRAW_CARD') return sameCard(left.card, right.card) && left.targetPid === right.targetPid;
  if (left.type === 'DICE_ROLL') return left.diceMode === right.diceMode && left.d1 === right.d1 && left.rollerName === right.rollerName;
  if (['RANDOM_TARGET', 'THROW_STONE', 'SKILL_HUNT', 'SKILL_BEWITCH'].includes(left.type)) {
    return left.sourceIdx === right.sourceIdx && left.targetIdx === right.targetIdx;
  }
  if (['HP_DAMAGE', 'SAN_DAMAGE', 'HP_HEAL', 'SAN_HEAL'].includes(left.type)) {
    return sameStatEvents(left.statEvents, right.statEvents) || sameStatStepTargets(left, right);
  }
  if (left.type === 'DISCARD') {
    return left.targetPid === right.targetPid && (sameCard(left.card, right.card) || left.count === right.count);
  }
  if (left.type === 'CARD_TRANSFER') {
    return left.fromPid === right.fromPid && left.toPid === right.toPid && left.dest === right.dest && left.effect === right.effect;
  }
  return true;
}

export const ANIMATION_QUEUE_AUTHORITY = Object.freeze({
  QUEUE: 'queue',
  EVENTS: 'events',
  LEGACY_MERGE: 'legacyMerge',
});

export function mergeAnimationTransactionQueue(queue = [], transaction = null, options = {}) {
  const legacyQueue = Array.isArray(queue) ? queue.filter(Boolean).map(step => ({ ...step })) : [];
  const canonicalQueue = Array.isArray(transaction?.queue) ? transaction.queue.filter(Boolean) : [];
  const authority = options.authority || ANIMATION_QUEUE_AUTHORITY.LEGACY_MERGE;
  // A queue produced by a stage-aware orchestrator is already the canonical
  // transaction. Recompiling state events here would create a second ordering
  // authority and can move settlement steps across their phase boundaries.
  if (authority === ANIMATION_QUEUE_AUTHORITY.QUEUE) return legacyQueue;
  if (authority === ANIMATION_QUEUE_AUTHORITY.EVENTS) return canonicalQueue.map(step => ({ ...step }));
  if (!canonicalQueue.length) return legacyQueue;

  // During migration some callers still submit an inferred queue alongside
  // the canonical rule transaction. Treat the transaction as one atomic
  // block: retain useful legacy-only fields/callbacks, remove equivalent
  // inferred steps, and restore the rule-defined order without interleaving.
  const usedLegacyIndices = new Set();
  const canonicalBlock = canonicalQueue.map(canonicalStep => {
    const matchingIndex = legacyQueue.findIndex((legacyStep, index) => (
      !usedLegacyIndices.has(index) && isEquivalentAnimationStep(legacyStep, canonicalStep)
    ));
    if (matchingIndex < 0) return canonicalStep;
    usedLegacyIndices.add(matchingIndex);
    return { ...legacyQueue[matchingIndex], ...canonicalStep };
  });
  const insertionIndex = usedLegacyIndices.size
    ? Math.min(...usedLegacyIndices)
    : legacyQueue.length;
  const retainedBefore = legacyQueue.filter((_, index) => index < insertionIndex && !usedLegacyIndices.has(index));
  const retainedAfter = legacyQueue.filter((_, index) => index >= insertionIndex && !usedLegacyIndices.has(index));
  return [...retainedBefore, ...canonicalBlock, ...retainedAfter];
}

export function getAnimationQueueVisualEventIds(queue = []) {
  return [...new Set((Array.isArray(queue) ? queue : []).map(step => step?.visualEventId).filter(Boolean))];
}

function transactionIdFromEventIds(eventIds = []) {
  const ids = (Array.isArray(eventIds) ? eventIds : []).filter(Boolean);
  if (!ids.length) return null;
  return ids.length === 1 ? ids[0] : `visual-transaction:${ids.join('+')}`;
}

export function validateVisualEventTransaction(transaction, events = []) {
  if (!transaction) return [];
  const issues = [];
  const queue = Array.isArray(transaction.queue) ? transaction.queue : [];
  const eventIds = Array.isArray(transaction.eventIds) ? transaction.eventIds : [];
  if (!transaction.id) issues.push({ code: 'MISSING_TRANSACTION_ID' });
  if (!queue.length) issues.push({ code: 'EMPTY_TRANSACTION_QUEUE' });
  if (!eventIds.length) issues.push({ code: 'MISSING_TRANSACTION_EVENT_IDS' });

  (Array.isArray(events) ? events : []).forEach(event => {
    const eventQueue = queue.filter(step => step?.visualEventId === event?.id);
    if (!eventQueue.length) {
      issues.push({ code: 'EMPTY_VISUAL_EVENT_QUEUE', eventId: event?.id, eventType: event?.type });
      return;
    }
    if (event.type !== VISUAL_EVENT.THROW_STONE) return;
    const types = eventQueue.map(step => step?.type);
    const required = ['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE'];
    const indices = required.map(type => types.indexOf(type));
    if (indices.some(index => index < 0)) {
      issues.push({ code: 'INCOMPLETE_THROW_STONE_TRANSACTION', eventId: event.id, types });
      return;
    }
    if (!(indices[0] < indices[1] && indices[1] < indices[2])) {
      issues.push({ code: 'INVALID_THROW_STONE_ORDER', eventId: event.id, types });
    }
    if ((event.damage || 0) > 0) {
      const damageIndex = types.indexOf('HP_DAMAGE');
      if (damageIndex <= indices[2]) {
        issues.push({ code: 'MISSING_THROW_STONE_DAMAGE', eventId: event.id, types });
      }
    }
  });
  return issues;
}

function reportTransactionIssues(stage, issues = []) {
  if (!issues.length || !import.meta.env?.DEV) return;
  console.error(`[visual-transaction] ${stage}`, issues);
}

export function compileVisualEventToAnimSteps(event, state, previousState = null, options = {}) {
  if (!event) return [];
  const isolated = stateWithSingleEvent(state, event);
  switch (event.type) {
    case VISUAL_EVENT.ANIM_TRANSACTION:
    case VISUAL_EVENT.ENDLESS_CORRIDOR_REPLAY:
      return Array.isArray(event.queue) ? event.queue.filter(Boolean) : [];
    case VISUAL_EVENT.TIMED_OUT_DRAW_DISCARD:
      return [buildTimedOutDrawDiscardStepFromVisualEvents(isolated)].filter(Boolean);
    case VISUAL_EVENT.TURN_START:
      return [buildTurnStartStepFromVisualEvents(isolated)].filter(Boolean);
    case VISUAL_EVENT.DRAW_CARD:
      return [buildDrawCardStepFromVisualEvents(isolated)].filter(Boolean);
    case VISUAL_EVENT.HAND_LIMIT_DISCARD:
      return buildHandLimitDiscardStepsFromVisualEvents(isolated);
    case VISUAL_EVENT.STAT_EVENTS:
      return buildStatStepsFromVisualEvents(isolated, options.players || event.beforePlayers || previousState?.players || state?.players);
    case VISUAL_EVENT.GOD_POWER_BLOCKED:
      return buildGodPowerBlockedStepsFromVisualEvents(isolated, null);
    case VISUAL_EVENT.TSG_SLIME_POP: {
      const targetPid = event.playerIdx ?? 0;
      return [{
        type: 'TSG_SLIME_POP',
        targetPid,
        count: Array.isArray(event.cards) ? event.cards.length : 1,
        cards: Array.isArray(event.cards) ? event.cards : [],
        msgs: Array.isArray(event.msgs) ? event.msgs : [],
        ...(Array.isArray(event.playersBefore) ? { visualSetupPatch: { players: event.playersBefore } } : {}),
        ...(Array.isArray(event.playersAfter) ? { visualTimeline: [{ atMs: 700, patch: { players: event.playersAfter } }] } : {}),
      }];
    }
    case VISUAL_EVENT.GOD_STATUS_CHANGED:
      return [buildGodStatusChangedStep(event)].filter(Boolean);
    case VISUAL_EVENT.THROW_STONE:
      return buildThrowStoneSteps(event, state);
    case VISUAL_EVENT.APOPHIS_TARGET:
      return buildApophisTargetSteps(event, state);
    case VISUAL_EVENT.INSPECTION:
      return buildInspectionEventFlow(
        {
          players: event.beforePlayers || previousState?.players || state?.players || [],
          log: event.beforeLog || previousState?.log || [],
          discard: event.beforeDiscard || previousState?.discard || [],
          _statEventSeq: event.beforeStatEventSeq || 0,
        },
        [event],
        { buildAnimQueue, copyPlayers },
      ).queue;
    case VISUAL_EVENT.TSG_SLIME_GRANT:
      return buildTsathogguaSlimeGrantSteps(event, state);
    case VISUAL_EVENT.MULTIPLY:
      return buildMultiplySteps(event);
    case VISUAL_EVENT.RANDOM_TARGET:
      return buildRandomTargetSteps(event, state);
    case VISUAL_EVENT.CARD_EFFECT:
    case VISUAL_EVENT.EARTHQUAKE:
      return flattenStep(buildCardEffectAnimStep(event, state));
    case VISUAL_EVENT.SWAP_CARDS: {
      const hideCards = options.hidePrivateCards === true;
      return [
        { type: 'SKILL_SWAP', msgs: event.msgs || [] },
        ...swapCardsSteps({
          sourceIdx: event.sourceIdx,
          targetIdx: event.targetIdx,
          sourceCount: event.sourceCount || 1,
          targetCount: event.targetCount || 1,
          takenCard: hideCards ? null : (event.takenCard || null),
          givenCard: hideCards ? null : (event.givenCard || null),
          msgs: event.msgs || [],
          playersBefore: event.beforePlayers || previousState?.players || null,
          zhuLight: previousState?.zhuLight || state?.zhuLight || null,
        }),
      ];
    }
    case VISUAL_EVENT.HUNT_TARGET:
      return [{ type: 'SKILL_HUNT', targetIdx: event.targetIdx, msgs: event.msgs || [] }];
    case VISUAL_EVENT.HUNT_REVEAL:
      if (event.targetIdx === 0 && options.allowTargetZero !== true) return [];
      return event.card ? [{
        type: 'HUNT_REVEAL_CARD',
        card: event.card,
        targetPid: event.targetIdx,
        targetName: state?.players?.[event.targetIdx]?.name || event.targetName || '对方',
        msgs: event.msgs || [],
      }] : [];
    case VISUAL_EVENT.HUNT_RESULT:
      return buildAiHuntEventAnimQueue(event, state?.players?.[event.hunterIdx]?.name || '???');
    case VISUAL_EVENT.SPHINX_RESULT: {
      const resultQueue = typeof options.buildAnimQueue === 'function' && !event.guessCorrect
        ? options.buildAnimQueue(previousState || state, state)
        : [];
      return buildSphinxResultQueue({
        card: event.card,
        actorIdx: event.actorIdx,
        guessCorrect: !!event.guessCorrect,
        msgs: event.msgs || [],
        resultQueue,
      });
    }
    case VISUAL_EVENT.BEWITCH_GIFT: {
      if (typeof options.buildAnimQueue !== 'function') return [];
      return buildBewitchGiftReplay({
        oldGs: previousState || state,
        newGs: state,
        bewitchEvent: event,
        logDelta: options.logDelta || event.msgs || [],
        visualStatQueue: options.visualStatQueue || [],
        buildAnimQueue: options.buildAnimQueue,
        copyPlayers,
      }).queue;
    }
    default:
      return [];
  }
}

function visualEventPhaseOrder(event) {
  if (!event) return null;
  if (event.phaseOrder != null) return event.phaseOrder;
  if (Array.isArray(event.statEvents) && event.statEvents.some(statEvent => statEvent?.phaseOrder != null)) {
    return Math.min(...event.statEvents.map(statEvent => statEvent?.phaseOrder ?? 0));
  }
  return null;
}

// phaseOrder is local to one settlement, not global to the state packet.
// Events that need cross-event interleaving share a phaseGroupId. Compile each
// group as one stable block at its first event, while preserving boundaries
// between independent settlements.
function interleavePhaseOrderedVisualEvents(events = []) {
  const groups = new Map();
  events.forEach((event, index) => {
    if (!event?.phaseGroupId) return;
    if (!groups.has(event.phaseGroupId)) groups.set(event.phaseGroupId, []);
    groups.get(event.phaseGroupId).push({ event, index });
  });
  if (!groups.size) return events;

  const emittedGroups = new Set();
  const result = [];
  events.forEach(event => {
    const groupId = event?.phaseGroupId;
    if (!groupId) {
      result.push(event);
      return;
    }
    if (emittedGroups.has(groupId)) return;
    emittedGroups.add(groupId);
    const split = groups.get(groupId).flatMap(({ event: groupedEvent, index }) => {
      if (groupedEvent?.type !== VISUAL_EVENT.STAT_EVENTS || !Array.isArray(groupedEvent.statEvents)) {
        return [{ event: groupedEvent, index, phase: visualEventPhaseOrder(groupedEvent) }];
      }
      const orders = [...new Set(groupedEvent.statEvents.map(statEvent => statEvent?.phaseOrder ?? 0))].sort((a, b) => a - b);
      return orders.map((order, sliceIndex) => ({
        event: {
          ...groupedEvent,
          statEvents: groupedEvent.statEvents.filter(statEvent => (statEvent?.phaseOrder ?? 0) === order),
          msgs: sliceIndex === 0 ? groupedEvent.msgs : [],
        },
        index: index + (sliceIndex / Math.max(1, orders.length)),
        phase: order,
      }));
    });
    result.push(...split
      .sort((left, right) => (
        (left.phase ?? Number.NEGATIVE_INFINITY) - (right.phase ?? Number.NEGATIVE_INFINITY) ||
        left.index - right.index
      ))
      .map(item => item.event));
  });
  return result;
}

export function compileRuleVisualEventsToAnimTransaction(state, previousState = null, options = {}) {
  const previousIds = new Set(getVisualEventIdsFromState(previousState));
  const consumedIds = options.consumedEventIds;
  const scopedEvents = (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .filter(event => (
      event?.id &&
      !previousIds.has(event.id) &&
      !(consumedIds?.has?.(event.id)) &&
      visualEventMatchesCompileScope(event, options)
    ));
  const {
    events: presentationEvents,
    suppressedEventIds,
  } = suppressStatsOwnedByCardEffects(scopedEvents);
  const events = interleavePhaseOrderedVisualEvents(orderTurnStartVisualEvents(presentationEvents));
  const compiledWithEmpty = events.map(event => ({
      event,
      steps: tagVisualEventSteps(event, compileVisualEventToAnimSteps(event, state, previousState, options)),
    }));
  reportTransactionIssues('visual event compiled to an empty queue', compiledWithEmpty
    .filter(item => !item.steps.length)
    .map(item => ({ code: 'EMPTY_VISUAL_EVENT_QUEUE', eventId: item.event.id, eventType: item.event.type })));
  const compiled = compiledWithEmpty
    .filter(item => item.steps.length);
  if (!compiled.length) return null;
  const first = compiled[0].event;
  const compiledEventIds = new Set(compiled.map(item => item.event.id));
  const suppressedIdSet = new Set(suppressedEventIds);
  const eventIds = scopedEvents
    .map(event => event.id)
    .filter(id => compiledEventIds.has(id) || suppressedIdSet.has(id));
  const queue = compiled.flatMap(item => item.steps);
  const transaction = {
    id: transactionIdFromEventIds(eventIds),
    context: compiled.length === 1
      ? (first.context || first.effectKey || first.type || 'ruleEvent')
      : 'ruleEventBatch',
    barrier: state?.phase && state.phase !== 'ACTION' && state.phase !== 'AI_TURN' ? 'decision' : 'continuation',
    queue,
    ...(events.some(event => event?.turnStartStage) ? {
      stageQueues: {
        turnBoundary: queue.filter(step => step?.turnStartStage === 'turnBoundary'),
        turnBanner: queue.filter(step => step?.turnStartStage === 'turnBanner'),
        turnStart: queue.filter(step => step?.turnStartStage === 'turnStart'),
        draw: queue.filter(step => step?.turnStartStage === 'draw'),
      },
    } : {}),
    eventIds,
    beforePlayers: first.beforePlayers || first.playersBefore || previousState?.players || null,
    beforeDiscard: first.beforeDiscard || previousState?.discard || null,
  };
  reportTransactionIssues('invalid compiled transaction', validateVisualEventTransaction(
    transaction,
    compiled.map(item => item.event),
  ));
  return transaction;
}

export function compileVisualEventToAnimTransaction(event, state, previousState = null, options = {}) {
  if (!event) return null;
  if (event.type === VISUAL_EVENT.BEWITCH_GIFT && typeof options.buildAnimQueue === 'function') {
    const replay = buildBewitchGiftReplay({
      oldGs: previousState || state,
      newGs: state,
      bewitchEvent: event,
      logDelta: options.logDelta || event.msgs || [],
      visualStatQueue: options.visualStatQueue || [],
      buildAnimQueue: options.buildAnimQueue,
      copyPlayers,
    });
    const transaction = {
      id: event.id || null,
      context: 'bewitchGift',
      barrier: state?.phase && state.phase !== 'ACTION' && state.phase !== 'AI_TURN' ? 'decision' : 'continuation',
      queue: tagVisualEventSteps(event, replay.queue || []),
      eventIds: event.id ? [event.id] : [],
      beforePlayers: previousState?.players || null,
      beforeDiscard: previousState?.discard || null,
      inspectionEvents: replay.inspectionEvents || [],
    };
    reportTransactionIssues('invalid compiled transaction', validateVisualEventTransaction(transaction, [event]));
    return transaction;
  }
  const queue = tagVisualEventSteps(
    event,
    compileVisualEventToAnimSteps(event, state, previousState, options),
  );
  const transaction = queue.length ? {
    id: event.id || null,
    context: event.context || event.effectKey || event.type || 'visualEvent',
    barrier: state?.phase && state.phase !== 'ACTION' && state.phase !== 'AI_TURN' ? 'decision' : 'continuation',
    queue,
    eventIds: event.id ? [event.id] : [],
    beforePlayers: event.beforePlayers || event.playersBefore || previousState?.players || null,
    beforeDiscard: event.beforeDiscard || previousState?.discard || null,
    inspectionEvents: [],
  } : null;
  reportTransactionIssues('invalid compiled transaction', validateVisualEventTransaction(transaction, transaction ? [event] : []));
  return transaction;
}

export function compileFreshVisualEventsToAnimSteps(state, previousState = null, types = [], options = {}) {
  const accepted = new Set(Array.isArray(types) ? types : [types]);
  const previousIds = new Set(getVisualEventIdsFromState(previousState));
  return (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .filter(event => event && (!event.id || !previousIds.has(event.id)) && (!accepted.size || accepted.has(event.type)))
    .flatMap(event => compileVisualEventToAnimSteps(event, state, previousState, options));
}
