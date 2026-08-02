import {
  VISUAL_EVENT,
  buildCardEffectAnimStep,
  buildGodPowerBlockedStepsFromVisualEvents,
  buildHandLimitDiscardStepsFromVisualEvents,
  buildStatStepsFromVisualEvents,
  buildTimedOutDrawDiscardStepFromVisualEvents,
  getVisualEventIdsFromState,
} from './visualEvents';
import { buildAiHuntEventAnimQueue } from './animQueueCore';
import { buildSphinxResultQueue, swapCardsSteps } from './animQueueHelpers';
import { buildBewitchGiftReplay } from './animReplayEvents';
import { copyPlayers } from './coreUtils';

function stateWithSingleEvent(state, event) {
  return { ...(state || {}), _visualEvents: event ? [event] : [] };
}

function flattenStep(step) {
  if (!step) return [];
  return step.type === 'COMPOSITE' ? (step.steps || []).filter(Boolean) : [step];
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

export function compileRuleVisualEventsToAnimTransaction(state, previousState = null) {
  const previousIds = new Set(getVisualEventIdsFromState(previousState));
  const events = (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .filter(event => event?.id && !previousIds.has(event.id));
  const compiled = events
    .map(event => ({ event, steps: compileVisualEventToAnimSteps(event, state, previousState) }))
    .filter(item => item.steps.length);
  if (!compiled.length) return null;
  const first = compiled[0].event;
  return {
    context: compiled.length === 1
      ? (first.context || first.effectKey || first.type || 'ruleEvent')
      : 'ruleEventBatch',
    barrier: state?.phase && state.phase !== 'ACTION' && state.phase !== 'AI_TURN' ? 'decision' : 'continuation',
    queue: compiled.flatMap(item => item.steps),
    eventIds: compiled.map(item => item.event.id),
    beforePlayers: first.beforePlayers || first.playersBefore || previousState?.players || null,
    beforeDiscard: first.beforeDiscard || previousState?.discard || null,
  };
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
    return {
      context: 'bewitchGift',
      barrier: state?.phase && state.phase !== 'ACTION' && state.phase !== 'AI_TURN' ? 'decision' : 'continuation',
      queue: replay.queue || [],
      eventIds: event.id ? [event.id] : [],
      beforePlayers: previousState?.players || null,
      beforeDiscard: previousState?.discard || null,
      inspectionEvents: replay.inspectionEvents || [],
    };
  }
  const queue = compileVisualEventToAnimSteps(event, state, previousState, options);
  return queue.length ? {
    context: event.context || event.effectKey || event.type || 'visualEvent',
    barrier: state?.phase && state.phase !== 'ACTION' && state.phase !== 'AI_TURN' ? 'decision' : 'continuation',
    queue,
    eventIds: event.id ? [event.id] : [],
    beforePlayers: event.beforePlayers || event.playersBefore || previousState?.players || null,
    beforeDiscard: event.beforeDiscard || previousState?.discard || null,
    inspectionEvents: [],
  } : null;
}

export function compileFreshVisualEventsToAnimSteps(state, previousState = null, types = [], options = {}) {
  const accepted = new Set(Array.isArray(types) ? types : [types]);
  const previousIds = new Set(getVisualEventIdsFromState(previousState));
  return (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .filter(event => event && (!event.id || !previousIds.has(event.id)) && (!accepted.size || accepted.has(event.type)))
    .flatMap(event => compileVisualEventToAnimSteps(event, state, previousState, options));
}
