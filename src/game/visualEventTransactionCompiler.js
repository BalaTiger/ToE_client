import {
  VISUAL_EVENT,
  buildCardEffectAnimStep,
  buildGodPowerBlockedStepsFromVisualEvents,
  buildGodStatusChangedStep,
  buildApophisEclipseStep,
  buildThrowStoneSteps,
  buildApophisTargetSteps,
  buildMultiplySteps,
  buildTsathogguaSlimeGrantSteps,
  buildRandomTargetSteps,
  buildTurnStartStepFromVisualEvents,
  buildDrawCardStepFromVisualEvents,
  buildDeckReshuffleStepFromVisualEvent,
  buildHandLimitDiscardStepsFromVisualEvents,
  buildStatStepsFromVisualEvents,
  buildTimedOutDrawDiscardStepFromVisualEvents,
  buildGodGiftDiscardStepFromVisualEvents,
  buildGodGiftKeepSteps,
  buildCardMoveSteps,
  buildCardRevealSteps,
  buildDiceResultSteps,
  getVisualEvents,
  getVisualEventIdsFromState,
} from './visualEvents';
import { buildAiHuntEventAnimQueue } from './animQueueCore';
import { buildBewitchForcedCardQueue, buildInspectionEventFlow, buildSphinxResultQueue, buildGraveDigTransferStep, swapCardsSteps, deriveHandTransferSnapshot, discardStep } from './animQueueHelpers';
import { copyPlayers } from './coreUtils';
import { statEventsToAnimQueue } from './statEvents';
import { assertValidRuleResolutionEvents, orderRuleResolutionEvents, statEventIdentity, validateRuleResolutionEvents } from './ruleResolutionTransaction';

function stateWithSingleEvent(state, event) {
  return { ...(state || {}), _visualEvents: event ? [event] : [] };
}

function flattenStep(step) {
  if (!step) return [];
  return step.type === 'COMPOSITE' ? (step.steps || []).filter(Boolean) : [step];
}

function compileDiscardStep(step, event, state, previousState = null) {
  if (!step) return step;
  const beforePlayers = event?.beforePlayers || event?.playersBefore || previousState?.players || null;
  const beforeDiscard = event?.beforeDiscard || event?.discardBefore || previousState?.discard || null;
  const afterDiscard = event?.afterDiscard || event?.discardAfter || null;
  return discardStep({
    ...step,
    playersBefore: beforePlayers,
    discardBefore: beforeDiscard,
    discardAfter: afterDiscard,
  });
}

function tagVisualEventSteps(event, steps = []) {
  const source = Array.isArray(steps) ? steps : [];
  return source.map((step, index) => (
    step
      ? {
          ...step,
          ...(event?.id && !step.visualEventId ? { visualEventId: event.id } : {}),
          ...(event?.turnStartStage && !step.turnStartStage
            ? { turnStartStage: event.turnStartStage }
            : {}),
          ...(event?.terminalBoundary === true && index === source.length - 1 && step.terminalBoundary !== true
            ? { terminalBoundary: true }
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

function addCardToPlayerSnapshot(players = [], playerIdx = 0, card = null, { prepend = false } = {}) {
  if (!Array.isArray(players) || !card || !players[playerIdx]) return players;
  return copyPlayers(players).map((player, idx) => idx === playerIdx ? {
    ...player,
    hand: (player.hand || []).some(candidate => sameCard(candidate, card))
      ? [...(player.hand || [])]
      : (prepend ? [card, ...(player.hand || [])] : [...(player.hand || []), card]),
  } : player);
}

function sameStatEvents(left = [], right = []) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  if (!a.length || !b.length) return false;
  return a.some(x => b.some(y => statEventIdentity(x) === statEventIdentity(y)));
}

function suppressStatsOwnedByExplicitEvents(events = []) {
  const owningStatEvents = events
    .filter(event => (
      event?.type !== VISUAL_EVENT.STAT_EVENTS &&
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

export const ANIMATION_QUEUE_AUTHORITY = Object.freeze({
  QUEUE: 'queue',
  EVENTS: 'events',
});

export function getAnimationQueueVisualEventIds(queue = []) {
  return [...new Set((Array.isArray(queue) ? queue : []).map(step => step?.visualEventId).filter(Boolean))];
}

// Queue-authoritative orchestrators sometimes build stat steps directly from
// canonical statEvents visual events. Resolve those wrapper ids without
// compiling them again, preserving the orchestrator's exact order.
export function getVisualEventIdsCoveredByAnimationQueue(state, queue = []) {
  const steps = Array.isArray(queue) ? queue.filter(Boolean) : [];
  const directIds = new Set(getAnimationQueueVisualEventIds(steps));
  const coveredStatSeqs = new Set(steps.flatMap(step => (
    Array.isArray(step?.statEvents)
      ? step.statEvents.map(event => event?.seq).filter(seq => seq != null)
      : []
  )));
  return getVisualEvents(state)
    .filter(event => {
      if (!event?.id) return false;
      if (directIds.has(event.id)) return true;
      if (event.type !== VISUAL_EVENT.STAT_EVENTS || !Array.isArray(event.statEvents) || !event.statEvents.length) return false;
      const seqs = event.statEvents.map(statEvent => statEvent?.seq);
      return seqs.every(seq => seq != null && coveredStatSeqs.has(seq));
    })
    .map(event => event.id);
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
  const scopedEvents = (Array.isArray(events) ? events : []).filter(Boolean);
  const knownEvents = scopedEvents.flatMap(event => [event, ...(event?.settlementEvents || [])]);
  issues.push(...validateRuleResolutionEvents(scopedEvents));
  const eventIndexById = new Map(
    knownEvents.map((event, index) => [event?.id, index]).filter(([id]) => !!id),
  );
  if (!transaction.id) issues.push({ code: 'MISSING_TRANSACTION_ID' });
  if (!queue.length) issues.push({ code: 'EMPTY_TRANSACTION_QUEUE' });
  if (!eventIds.length) issues.push({ code: 'MISSING_TRANSACTION_EVENT_IDS' });

  scopedEvents.forEach(event => {
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
  queue.forEach(step => {
    if (step?.visualEventId && !eventIndexById.has(step.visualEventId)) {
      issues.push({
        code: 'UNKNOWN_STEP_VISUAL_EVENT_ID',
        visualEventId: step.visualEventId,
        stepType: step.type || null,
      });
    }
  });
  scopedEvents.forEach(event => {
    ['causedByEventId', 'targetResolutionEventId'].forEach(field => {
      const dependencyId = event?.[field];
      if (!dependencyId) return;
      const dependencyIndex = eventIndexById.get(dependencyId);
      if (dependencyIndex == null) {
        issues.push({
          code: 'MISSING_VISUAL_EVENT_DEPENDENCY',
          eventId: event.id,
          eventType: event.type,
          field,
          dependencyId,
        });
        return;
      }
      if (dependencyIndex >= eventIndexById.get(event.id)) {
        issues.push({
          code: 'VISUAL_EVENT_DEPENDENCY_OUT_OF_ORDER',
          eventId: event.id,
          eventType: event.type,
          field,
          dependencyId,
        });
      }
    });
    if (event?.type === VISUAL_EVENT.HUNT_RESULT && event?.targetResolutionEventId) {
      const targetEvent = scopedEvents[eventIndexById.get(event.targetResolutionEventId)];
      if (targetEvent?.type !== VISUAL_EVENT.APOPHIS_TARGET) {
        issues.push({
          code: 'INVALID_HUNT_TARGET_RESOLUTION_EVENT',
          eventId: event.id,
          targetResolutionEventId: event.targetResolutionEventId,
          targetEventType: targetEvent?.type || null,
        });
      }
    }
  });
  return issues;
}

function suppressNestedSettlementEvents(events = []) {
  const coveredIds = new Set(events
    .filter(event => event?.type === VISUAL_EVENT.BEWITCH_GIFT)
    .flatMap(event => event?.settlementEvents || [])
    .map(event => event?.id)
    .filter(Boolean));
  if (!coveredIds.size) return { events, suppressedEventIds: [] };
  return {
    events: events.filter(event => !coveredIds.has(event?.id)),
    suppressedEventIds: events.filter(event => coveredIds.has(event?.id)).map(event => event.id),
  };
}

function faithTransitionOwnsStatEvent(transition, statEvent) {
  return transition?.statEventSeqBefore != null && transition?.statEventSeqAfter != null
    && statEvent?.seq > transition.statEventSeqBefore
    && statEvent.seq <= transition.statEventSeqAfter
    && Number(statEvent.target) === Number(transition.playerIdx);
}

function buildCanonicalFaithExitStep(transition, visualEventId) {
  const cards = Array.isArray(transition?.cards) ? transition.cards.filter(Boolean) : [];
  if (transition?.playerIdx == null || !cards.length) return null;
  const playersBefore = copyPlayers(transition.playersBefore || []);
  const playersAfter = copyPlayers(transition.playersAfter || playersBefore);
  const discardBefore = [...(transition.discardBefore || [])];
  const discardAfter = [...(transition.discardAfter || discardBefore)];
  return {
    type: 'CARD_TRANSFER',
    visualEventId,
    fromPid: transition.playerIdx,
    dest: 'discard',
    count: cards.length,
    cards,
    sourceAnchor: 'godPower',
    effect: transition.effect || 'godAbandon',
    durationMs: 1500,
    faceUp: true,
    msgs: transition.msgs || [],
    faithSettlementStep: true,
    visualSetupTiming: 'stepStart',
    visualSetupPatch: { players: playersBefore, discard: discardBefore },
    visualTimeline: [
      { atMs: 0, patch: { players: playersBefore, discard: discardBefore } },
      { atMs: 360, patch: { players: playersAfter, discard: discardAfter } },
    ],
  };
}

function applyStatEventsToPlayersSnapshot(players = [], statEvents = []) {
  const nextPlayers = copyPlayers(players);
  (Array.isArray(statEvents) ? statEvents : []).forEach(statEvent => {
    const target = Number(statEvent?.target);
    if (!Number.isInteger(target) || !nextPlayers[target] || !statEvent?.to) return;
    nextPlayers[target] = {
      ...nextPlayers[target],
      ...(statEvent.to.hp != null ? { hp: statEvent.to.hp } : {}),
      ...(statEvent.to.san != null ? { san: statEvent.to.san } : {}),
      ...(statEvent.to.isDead != null ? { isDead: statEvent.to.isDead } : {}),
    };
  });
  return nextPlayers;
}

function composeCanonicalFaithSettlementSteps(queue = [], events = []) {
  let result = [...queue];
  const inspectionEvents = events.filter(event => event?.type === VISUAL_EVENT.INSPECTION);
  events.filter(event => event?.type === VISUAL_EVENT.GOD_STATUS_CHANGED && event?.faithSettlement)
    .forEach(event => {
      const previous = event.faithSettlement?.previousFaithExit || null;
      const followers = event.faithSettlement?.abandonedFollowers || [];
      const transitions = [previous, ...followers].filter(Boolean);
      if (!transitions.length) return;
      const highlight = result.find(step => step?.type === 'GOD_HIGHLIGHT' && step?.visualEventId === event.id);
      if (!highlight) return;
      const ownedByTransition = transition => {
        const inspectionIds = new Set(inspectionEvents
          .filter(inspection => {
            const seq = inspection?.legacySeq ?? inspection?.seq;
            return seq > (transition.inspectionSeqBefore ?? Number.POSITIVE_INFINITY)
              && seq <= (transition.inspectionSeqAfter ?? Number.NEGATIVE_INFINITY);
          })
          .map(inspection => inspection.id));
        const steps = result.filter(step => (
          inspectionIds.has(step?.visualEventId)
          || (Array.isArray(step?.statEvents) && step.statEvents.some(statEvent => faithTransitionOwnsStatEvent(transition, statEvent)))
        ));
        let statCursorPlayers = copyPlayers(transition.playersAfter || transition.playersBefore || []);
        const statSteps = steps
          .filter(step => !inspectionIds.has(step?.visualEventId))
          .map(step => {
            const playersBeforeStep = statCursorPlayers;
            statCursorPlayers = applyStatEventsToPlayersSnapshot(playersBeforeStep, step?.statEvents);
            return {
              ...step,
              visualSetupTiming: step.visualSetupTiming || 'stepStart',
              visualSetupPatch: {
                ...(step.visualSetupPatch || {}),
                players: playersBeforeStep,
              },
              visualTimeline: [
                ...(step.visualTimeline || []),
                { atMs: 480, patch: { players: statCursorPlayers } },
              ],
            };
          });
        const inspectionSteps = steps.filter(step => inspectionIds.has(step?.visualEventId));
        return [buildCanonicalFaithExitStep(transition, event.id), ...statSteps, ...inspectionSteps].filter(Boolean);
      };
      const transitionBlocks = new Map(transitions.map(transition => [transition, ownedByTransition(transition)]));
      const ownedOriginalSteps = result.filter(step => transitions.some(transition => {
        const inspectionIds = new Set(inspectionEvents
          .filter(inspection => {
            const seq = inspection?.legacySeq ?? inspection?.seq;
            return seq > (transition.inspectionSeqBefore ?? Number.POSITIVE_INFINITY)
              && seq <= (transition.inspectionSeqAfter ?? Number.NEGATIVE_INFINITY);
          })
          .map(inspection => inspection.id));
        return inspectionIds.has(step?.visualEventId)
          || (Array.isArray(step?.statEvents) && step.statEvents.some(statEvent => faithTransitionOwnsStatEvent(transition, statEvent)));
      }));
      const ownedSet = new Set([highlight, ...ownedOriginalSteps]);
      const insertionIndex = Math.min(...result
        .map((step, index) => ownedSet.has(step) ? index : Number.POSITIVE_INFINITY));
      result = result.filter(step => !ownedSet.has(step));
      const phases = [
        ...(previous ? transitionBlocks.get(previous) : []),
        highlight,
        ...followers.flatMap(transition => transitionBlocks.get(transition)),
      ];
      result.splice(Number.isFinite(insertionIndex) ? insertionIndex : result.length, 0, ...phases);
    });
  return result;
}

function reportTransactionIssues(stage, issues = []) {
  if (!issues.length || !import.meta.env?.DEV) return;
  console.error(`[visual-transaction] ${stage}`, issues);
}

function assertNoEmptyVisualEventCompilations(compiled = [], options = {}, stage = 'compile') {
  const issues = (Array.isArray(compiled) ? compiled : [])
    .filter(item => item?.event && !(Array.isArray(item.steps) && item.steps.length))
    .map(item => ({
      code: 'EMPTY_VISUAL_EVENT_QUEUE',
      eventId: item.event.id || null,
      eventType: item.event.type || null,
    }));
  if (!issues.length) return;
  reportTransactionIssues(stage, issues);
  const strict = options.strictEventCompilation === true || import.meta.env?.MODE === 'test';
  if (strict) {
    throw new TypeError(`[visual-transaction] ${stage}: ${JSON.stringify(issues)}`);
  }
}

export function compileVisualEventToAnimSteps(event, state, previousState = null, options = {}) {
  if (!event) return [];
  const isolated = stateWithSingleEvent(state, event);
  switch (event.type) {
    case VISUAL_EVENT.ANIM_TRANSACTION:
    case VISUAL_EVENT.ENDLESS_CORRIDOR_REPLAY:
      return Array.isArray(event.queue) ? event.queue.filter(Boolean) : [];
    case VISUAL_EVENT.TIMED_OUT_DRAW_DISCARD:
      return [compileDiscardStep(
        buildTimedOutDrawDiscardStepFromVisualEvents(isolated),
        event,
        state,
        previousState,
      )].filter(Boolean);
    case VISUAL_EVENT.GOD_GIFT_DISCARD:
      return [compileDiscardStep(
        buildGodGiftDiscardStepFromVisualEvents(isolated),
        event,
        state,
        previousState,
      )].filter(Boolean);
    case VISUAL_EVENT.GOD_GIFT_KEEP:
      return buildGodGiftKeepSteps(event);
    case VISUAL_EVENT.TURN_START:
      return [buildTurnStartStepFromVisualEvents(isolated)].filter(Boolean);
    case VISUAL_EVENT.DECK_RESHUFFLE:
      return [buildDeckReshuffleStepFromVisualEvent(event)].filter(Boolean);
    case VISUAL_EVENT.DRAW_CARD:
      return (() => {
        const drawStep = buildDrawCardStepFromVisualEvents({
          ...isolated,
          currentTurn: event.playerIdx ?? isolated?.currentTurn,
        });
        if (!drawStep) return [];
        const playerIdx = event.playerIdx ?? state?.currentTurn ?? 0;
        if (event.discarded) {
          return [
            drawStep,
            compileDiscardStep({
              type: 'DISCARD',
              card: event.card,
              triggerName: drawStep.triggerName,
              targetPid: playerIdx,
            }, event, state, previousState),
            ...(
              Array.isArray(event.playersAfterDiscard) || Array.isArray(event.discardAfter)
                ? [{
                    type: 'STATE_PATCH',
                    ...(Array.isArray(event.playersAfterDiscard) ? { players: event.playersAfterDiscard } : {}),
                    ...(Array.isArray(event.discardAfter) ? { discard: event.discardAfter } : {}),
                  }]
                : []
            ),
          ];
        }
        if (event.keptInHand && Array.isArray(event.playersAfterKeep)) {
          return [
            drawStep,
            {
              type: 'CARD_TRANSFER',
              fromPid: playerIdx,
              dest: 'player',
              toPid: playerIdx,
              count: 1,
              sourceAnchor: 'playerArea',
              effect: 'draw',
              cards: [event.card],
            },
            { type: 'STATE_PATCH', players: event.playersAfterKeep },
          ];
        }
        return [drawStep];
      })();
    case VISUAL_EVENT.CARD_MOVE:
      return buildCardMoveSteps(event);
    case VISUAL_EVENT.CARD_REVEAL:
      return buildCardRevealSteps(event);
    case VISUAL_EVENT.DICE_RESULT:
      return buildDiceResultSteps(event);
    case VISUAL_EVENT.VRITRA_IMMORTAL_REVEAL:
      return [{
        type: 'VRI_IMMORTAL_REVEAL',
        targetPid: event.targetIdx,
        cards: event.cards || [],
        succeeded: !!event.succeeded,
        msgs: event.msgs || [],
      }];
    case VISUAL_EVENT.HAND_LIMIT_DISCARD:
      return buildHandLimitDiscardStepsFromVisualEvents(isolated)
        .map(step => compileDiscardStep(step, event, state, previousState));
    case VISUAL_EVENT.STAT_EVENTS: {
      const revealStatEvent = (event.statEvents || []).find(statEvent => statEvent?.vritraImmortalReveal);
      if (!revealStatEvent) {
        return buildStatStepsFromVisualEvents(isolated, options.players || event.beforePlayers || previousState?.players || state?.players);
      }
      const reveal = revealStatEvent.vritraImmortalReveal;
      const revealOrder = revealStatEvent.phaseOrder ?? 0;
      const isRevealTargetDefeat = statEvent => (
        statEvent?.type === 'PLAYER_DEFEATED'
        && Number(statEvent.target) === Number(reveal.targetIdx)
      );
      const beforeEvents = event.statEvents.filter(statEvent => (
        (statEvent.phaseOrder ?? 0) <= revealOrder
        && statEvent !== revealStatEvent
        && !isRevealTargetDefeat(statEvent)
      ));
      const afterEvents = event.statEvents.filter(statEvent => (
        statEvent === revealStatEvent
        || isRevealTargetDefeat(statEvent)
        || (statEvent.phaseOrder ?? 0) > revealOrder
      ));
      const damageEvent = { ...revealStatEvent };
      delete damageEvent.vritraImmortalReveal;
      return [
        ...statEventsToAnimQueue([...beforeEvents, damageEvent], options.players || event.beforePlayers || previousState?.players || state?.players, event.msgs || []),
        {
          type: 'VRI_IMMORTAL_REVEAL',
          targetPid: reveal.targetIdx,
          cards: reveal.cards || [],
          succeeded: !!reveal.succeeded,
          msgs: reveal.msgs || [],
        },
        ...statEventsToAnimQueue(afterEvents.filter(statEvent => statEvent !== revealStatEvent), options.players || event.beforePlayers || previousState?.players || state?.players, []),
      ];
    }
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
    case VISUAL_EVENT.APOPHIS_ECLIPSE:
      return [buildApophisEclipseStep(event)].filter(Boolean);
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
        { copyPlayers },
      ).queue;
    case VISUAL_EVENT.TSG_SLIME_GRANT:
      return buildTsathogguaSlimeGrantSteps(event, state);
    case VISUAL_EVENT.MULTIPLY:
      return buildMultiplySteps(event);
    case VISUAL_EVENT.GRAVE_DIG:
      return [buildGraveDigTransferStep(event)].filter(Boolean);
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
          playersAfter: event.afterPlayers || null,
          discardAfter: event.afterDiscard || null,
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
      const playersBeforeResult = addCardToPlayerSnapshot(
        event.playersBefore || previousState?.players || state?.players || [],
        event.actorIdx,
        event.sourceCard,
        { prepend: true },
      );
      const playersAfterResult = event.guessCorrect && (Array.isArray(event.playersAfter) || event.sourceCard)
        ? addCardToPlayerSnapshot(
            event.playersAfter || state?.players || [],
            event.actorIdx,
            event.sourceCard,
            { prepend: true },
          )
        : null;
      const resultQueue = statEventsToAnimQueue(
        Array.isArray(event.statEvents) ? event.statEvents : [],
        playersBeforeResult,
        event.msgs || [],
      );
      return buildSphinxResultQueue({
        card: event.card,
        actorIdx: event.actorIdx,
        guessCorrect: !!event.guessCorrect,
        msgs: event.msgs || [],
        resultQueue,
        playersAfterResult,
      });
    }
    case VISUAL_EVENT.BEWITCH_GIFT: {
      const settlementEvents = Array.isArray(event.settlementEvents) ? event.settlementEvents : [];
      const nestedStatKeys = new Set(settlementEvents
        .flatMap(settlementEvent => settlementEvent?.statEvents || [])
        .map(statEventIdentity));
      const directStatEvents = (Array.isArray(event.statEvents) ? event.statEvents : [])
        .filter(statEvent => !nestedStatKeys.has(statEventIdentity(statEvent)));
      const directStatQueue = statEventsToAnimQueue(
          directStatEvents,
          event.playersBefore || previousState?.players || state?.players || [],
          [],
        );
      const compiledSettlementEvents = settlementEvents.map(settlementEvent => ({
        event: settlementEvent,
        steps: tagVisualEventSteps(
          settlementEvent,
          compileVisualEventToAnimSteps(settlementEvent, state, previousState, options),
        ),
      }));
      const encounterEvents = compiledSettlementEvents
        .filter(item => item.event?.cardAcquisitionStage === 'godEncounter')
        .map(item => item.event);
      const acceptanceEvents = compiledSettlementEvents
        .filter(item => item.event?.cardAcquisitionStage !== 'godEncounter')
        .map(item => item.event);
      const encounterQueue = composeCanonicalFaithSettlementSteps(
        compiledSettlementEvents.filter(item => item.event?.cardAcquisitionStage === 'godEncounter').flatMap(item => item.steps),
        encounterEvents,
      );
      const acceptanceQueue = composeCanonicalFaithSettlementSteps([
        ...directStatQueue,
        ...compiledSettlementEvents
          .filter(item => item.event?.cardAcquisitionStage !== 'godEncounter')
          .flatMap(item => item.steps),
      ], acceptanceEvents);
      const settlementQueue = [...encounterQueue, ...acceptanceQueue];
      // 飞牌飞行中段提交“仅换牌”的手牌快照;事件级 playersAfter 含全部结算
      // 后果(全场扣SAN、死亡等),提前锁入会让结算表现跑在对应动画前面。
      const giftPlayersAfter = Array.isArray(event.playersBefore)
        ? deriveHandTransferSnapshot(event.playersBefore, {
            fromPid: event.sourceIdx,
            toPid: event.targetIdx,
            card: event.card,
            toHand: !!event.card && !event.card.isGod,
          })
        : null;
      return buildBewitchForcedCardQueue(
        event.sourceIdx,
        event.targetIdx,
        event.card,
        event.targetName || state?.players?.[event.targetIdx]?.name,
        settlementQueue,
        event.msgs || [],
        {
          ...(Array.isArray(event.playersBefore) ? { skillVisualSetupPatch: { players: event.playersBefore } } : {}),
          ...(Array.isArray(event.playersBefore) && giftPlayersAfter
            ? { transferSnapshots: { playersBefore: event.playersBefore, playersAfter: giftPlayersAfter } }
            : {}),
          playersAfter: event.playersAfter || state?.players,
          zhuLightBefore: event.zhuLightBefore || previousState?.zhuLight || null,
          zhuLightAfter: event.zhuLightAfter || state?.zhuLight || null,
          ...(event.card?.isGod ? { encounterQueue, acceptanceQueue } : {}),
        },
      );
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
  const freshScopedEvents = (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .filter(event => (
      event?.id &&
      !previousIds.has(event.id) &&
      !(consumedIds?.has?.(event.id)) &&
      visualEventMatchesCompileScope(event, options)
    ));
  assertValidRuleResolutionEvents(freshScopedEvents);
  const scopedEvents = orderRuleResolutionEvents(freshScopedEvents);
  const nestedSuppression = suppressNestedSettlementEvents(scopedEvents);
  const {
    events: presentationEvents,
    suppressedEventIds: suppressedStatEventIds,
  } = suppressStatsOwnedByExplicitEvents(nestedSuppression.events);
  const suppressedEventIds = [...nestedSuppression.suppressedEventIds, ...suppressedStatEventIds];
  const events = interleavePhaseOrderedVisualEvents(orderTurnStartVisualEvents(presentationEvents));
  const compiledWithEmpty = events.map(event => ({
      event,
      steps: tagVisualEventSteps(event, compileVisualEventToAnimSteps(event, state, previousState, options)),
    }));
  assertNoEmptyVisualEventCompilations(compiledWithEmpty, options, 'visual event compiled to an empty queue');
  const compiled = compiledWithEmpty
    .filter(item => item.steps.length);
  if (!compiled.length) return null;
  const first = compiled[0].event;
  const compiledEventIds = new Set(compiled.map(item => item.event.id));
  const suppressedIdSet = new Set(suppressedEventIds);
  const eventIds = scopedEvents
    .map(event => event.id)
    .filter(id => compiledEventIds.has(id) || suppressedIdSet.has(id));
  const queue = composeCanonicalFaithSettlementSteps(
    compiled.flatMap(item => item.steps),
    events,
  );
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
  const nestedInspectionEvents = (event?.settlementEvents || [])
    .filter(settlementEvent => settlementEvent?.type === VISUAL_EVENT.INSPECTION);
  const queue = tagVisualEventSteps(
    event,
    compileVisualEventToAnimSteps(event, state, previousState, options),
  );
  assertNoEmptyVisualEventCompilations([{ event, steps: queue }], options, 'visual event compiled to an empty queue');
  const transaction = queue.length ? {
    id: event.id || null,
    context: event.context || event.effectKey || event.type || 'visualEvent',
    barrier: state?.phase && state.phase !== 'ACTION' && state.phase !== 'AI_TURN' ? 'decision' : 'continuation',
    queue,
    eventIds: event.id ? [event.id] : [],
    beforePlayers: event.beforePlayers || event.playersBefore || previousState?.players || null,
    beforeDiscard: event.beforeDiscard || previousState?.discard || null,
    inspectionEvents: nestedInspectionEvents,
  } : null;
  reportTransactionIssues('invalid compiled transaction', validateVisualEventTransaction(transaction, transaction ? [event] : []));
  return transaction;
}

export function compileFreshVisualEventsToAnimSteps(state, previousState = null, types = [], options = {}) {
  const accepted = new Set(Array.isArray(types) ? types : [types]);
  const previousIds = new Set(getVisualEventIdsFromState(previousState));
  const events = (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .filter(event => event && (!event.id || !previousIds.has(event.id)) && (!accepted.size || accepted.has(event.type)));
  const compiled = events.map(event => ({
    event,
    steps: compileVisualEventToAnimSteps(event, state, previousState, options),
  }));
  assertNoEmptyVisualEventCompilations(compiled, options, 'fresh visual event compiled to an empty queue');
  return compiled.flatMap(item => item.steps);
}

// Compile every fresh rule event through the same canonical transaction,
// regardless of whether the settlement contains an inspection. Presentation
// callers must never switch back to state-diff replay merely because a
// particular resolution happened not to draw an inspection card.
export function compileFreshVisualEventReplay(oldGs, newGs, options = {}) {
  const baseInspectionSeq = oldGs?._inspectionSeq || 0;
  const oldIds = new Set(getVisualEventIdsFromState(oldGs));
  const inspectionEvents = getVisualEvents(newGs)
    .filter(event => event?.type === VISUAL_EVENT.INSPECTION && event?.id && !oldIds.has(event.id));
  const transaction = compileRuleVisualEventsToAnimTransaction(newGs, oldGs, {
    testMode: false,
    ...options,
  });
  const excludedStepTypes = new Set(options.excludedStepTypes || []);
  const queue = excludedStepTypes.size
    ? (transaction?.queue || []).filter(step => !excludedStepTypes.has(step?.type))
    : (transaction?.queue || []);
  return {
    queue,
    inspectionEvents,
    inspectionSeq: Math.max(baseInspectionSeq, ...inspectionEvents.map(event => event?.legacySeq ?? event?.seq ?? 0)),
  };
}

// Canonical convenience entry point for presentation composers. `oldGs` is
// used only as the visual-event ID watermark; HP/SAN, hand and log snapshots
// are never diffed to manufacture animation steps.
export function compileFreshVisualEventQueue(oldGs, newGs, options = {}) {
  return compileFreshVisualEventReplay(oldGs, newGs, options).queue;
}
