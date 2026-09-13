import {
  isBlackGoatYoung,
  isBlankZoneCard,
  isTsathogguaSlime,
  isVanishingDerivedCard,
  isZoneCard,
  makeInspectionMeta,
} from './coreUtils';
import { applyInspectionForSanLoss, submitLossEvents } from './effectEngine';
import { buildBalanceDiscardLossEvents } from './balanceCards';
import { chooseAiAction, createAiObservationState, rankAiActions } from './aiPolicy';
import { resolveAiReactionPreview } from './aiReactionPreview';

const EXHAUSTIVE_ACTION_LIMIT = 4096;
const DISCARD_BEAM_WIDTH = 24;

function discardAction(hand, indices, extra = {}) {
  return {
    type: 'discard',
    cardIndices: [...indices],
    cardIds: indices.map(index => hand[index]?.id ?? null),
    ...extra,
  };
}

function noteUnresolved(state, resolution) {
  if (!resolution?.phase) return false;
  state.phase = resolution.phase;
  state.abilityData = resolution.abilityData || {};
  state._aiPendingResolution = {
    phase: resolution.phase,
    abilityData: structuredClone(resolution.abilityData || {}),
  };
  state._aiPreviewIncomplete = true;
  const ad = resolution.abilityData || {};
  const outstanding = [...(ad.pendingLosses || []), ...(ad.deferredDirectLosses || [])];
  const pendingAmount = outstanding.reduce((sum, loss) => sum + (loss.lostHp || 0) + (loss.lostSan || 0), 0);
  state._aiUnresolvedRisk = (state._aiUnresolvedRisk || 0) + Math.max(1, pendingAmount / 3);
  return true;
}

function submitPreviewLosses(state, events) {
  if (!events.length) return false;
  const beforeSan = state.players.map(player => player?.san);
  const unknownImmortality = state.players.flatMap((player, index) => (
    player?.godName === 'VRI' && index !== state.currentTurn
      && (state.deckCount || 0) > 0 ? [index] : []
  ));
  const result = submitLossEvents({
    players: state.players,
    deck: state.deck,
    discard: state.discard,
    log: state.log,
    currentTurn: state.currentTurn,
    events,
    continuation: { _turnOwner: state.currentTurn },
  });
  // VRI's real resolver treats an empty deck as a successful reveal. When the
  // observation has withheld an existing deck, that success is only one branch.
  const uncertainImmortalTargets = unknownImmortality.filter(index => (
    state.players[index]?._vritraImmortalReveal
      || result.statEvents?.some(event => event.target === index && event.vritraImmortalReveal)
  ));
  if (uncertainImmortalTargets.length) {
    state._aiPreviewIncomplete = true;
    state._aiUnresolvedRisk = (state._aiUnresolvedRisk || 0) + uncertainImmortalTargets.length;
    state._aiUncertainImmortalTargets = uncertainImmortalTargets;
  }
  const inspectionTargets = state.players.flatMap((player, index) => (
    player && !player.isDead && player.san < beforeSan[index]
      && player.san > 0 && player.san <= 6 ? [index] : []
  ));
  const wasIncomplete = !!state._aiPreviewIncomplete;
  const priorRisk = state._aiUnresolvedRisk || 0;
  if (noteUnresolved(state, result)) {
    const resolved = resolveAiReactionPreview(state, state._aiObserverIdx);
    Object.assign(state, resolved);
    if (wasIncomplete) {
      state._aiPreviewIncomplete = true;
      state._aiUnresolvedRisk = Math.max(priorRisk, state._aiUnresolvedRisk || 0);
    }
    if (['ETHEREALIZE_DECISION', 'TSG_SLIME_BALANCE'].includes(state.phase)) {
      if (inspectionTargets.length) state._aiPendingInspections = inspectionTargets;
      return true;
    }
  }
  for (const targetIdx of inspectionTargets) {
    // aiPolicy supplies a sample from the public inspection distribution, never
    // the real hidden order. Do not interpret a missing sample as no risk.
    if (!(state.inspectionDeck?.length || state.inspectionDiscard?.length)) {
      state._aiPreviewIncomplete = true;
      state._aiUnresolvedRisk = (state._aiUnresolvedRisk || 0) + 1;
      state._aiPendingInspections = [...(state._aiPendingInspections || []), targetIdx];
      continue;
    }
    const inspection = applyInspectionForSanLoss(
      targetIdx, state.players[targetIdx].san, state.currentTurn,
      state.players, state.deck, state.discard, state.log, makeInspectionMeta(state),
    );
    state.players = inspection.P;
    state.deck = inspection.D;
    state.discard = inspection.Disc;
    state.log = inspection.log;
    Object.assign(state, inspection.inspectionMeta);
    state._aiPreviewIncomplete = true;
    state._aiUnresolvedRisk = (state._aiUnresolvedRisk || 0) + 1;
    if (noteUnresolved(state, inspection.inspectionMeta)) return true;
  }
  return false;
}

function roseThornLossEvents(cards, startOrder = 0) {
  const counts = new Map();
  for (const card of cards) {
    if (card?.roseThornHolderId == null) continue;
    const idx = card.roseThornHolderId;
    counts.set(idx, (counts.get(idx) || 0) + 1);
  }
  return [...counts].map(([targetIdx, count], order) => ({
    targetIdx, lostHp: count * 2, source: '玫瑰倒刺', order: startOrder + order,
  }));
}

/**
 * Preview only. The caller supplies the observation-state clone produced by
 * aiPolicy; real hands, deck order, logs and event counters are never committed.
 * Redirect/slime decisions enumerate legal continuations; exhausted searches
 * remain explicitly unresolved instead of becoming free HP.
 */
export function simulateAiDiscardAction(gs, actorIdx, action) {
  const state = structuredClone(gs);
  state._aiObserverIdx ??= actorIdx;
  state.deck ||= [];
  state.discard ||= [];
  state.log ||= [];
  const player = state.players?.[actorIdx];
  if (!player || player.isDead || !action) return state;
  if (action.type === 'abandon') {
    player.disableSkill = true;
    state.skillUsed = true;
    return state;
  }
  if (action.type === 'hp') {
    submitPreviewLosses(state, [{
      targetIdx: actorIdx, lostHp: action.lostHp ?? 4, source: '同归深渊',
    }]);
    return state;
  }

  // Hold references into this clone so duplicates and cards without ids can be
  // removed in the requested order without reordering any surviving cards.
  const selected = (action.cardIndices || []).map((originalIndex, offset) => {
    const id = action.cardIds?.[offset];
    return id != null
      ? player.hand.find(card => card?.id === id)
      : player.hand[originalIndex];
  });
  const discarded = [];
  for (let offset = 0; offset < selected.length; offset += 1) {
    const currentPlayer = state.players[actorIdx];
    if (currentPlayer.isDead) break;
    if (action.sameAbyssSourceIdx != null && getSameAbyssDiscardCount(
      state, actorIdx, action.sameAbyssSourceIdx, { incomingCardCount: action.incomingCardCount },
    ) === 0) break;
    const selectedCard = selected[offset];
    const index = selectedCard?.id != null
      ? currentPlayer.hand.findIndex(card => card?.id === selectedCard.id)
      : currentPlayer.hand.indexOf(selectedCard);
    const card = currentPlayer.hand[index];
    if (!card || index < 0) continue;
    currentPlayer.hand.splice(index, 1);
    discarded.push(card);
    const entersDiscard = !isVanishingDerivedCard(card)
      && !(action.sameAbyss && isBlankZoneCard(card));
    if (entersDiscard) state.discard.push(card);
    const losses = entersDiscard ? buildBalanceDiscardLossEvents([card], actorIdx) : [];
    // Matching cards must be compared with the same actual damage to the prey.
    // A suicidal match cannot score as a free kill by omitting its own cost.
    if (action.type === 'hunt') {
      losses.push({
        targetIdx: action.targetIdx,
        lostHp: action.lostHp ?? 3 + (player.damageBonus || 0),
        source: '追捕', order: losses.length,
      });
    }
    if (submitPreviewLosses(state, losses)) {
      state._aiPendingDiscardCards = selected.slice(offset + 1).filter(Boolean);
      state._aiPendingRoseThornLosses = roseThornLossEvents(discarded);
      return state;
    }
  }
  if (submitPreviewLosses(state, roseThornLossEvents(discarded))) return state;
  if (!state.players[actorIdx].isDead && action.sameAbyssSourceIdx != null) {
    const stillRequired = getSameAbyssDiscardCount(
      state, actorIdx, action.sameAbyssSourceIdx, { incomingCardCount: action.incomingCardCount },
    );
    if (stillRequired > 0) {
      // A rope death can empty the source's hand during these discards. Finish
      // that new obligation using the same choice framework, without reopening
      // the already-committed HP/discard choice or assuming the old plan suffices.
      const continuations = orderedDiscardActions(state, actorIdx, stillRequired, {
        sameAbyss: true,
        sameAbyssSourceIdx: action.sameAbyssSourceIdx,
        incomingCardCount: action.incomingCardCount,
      });
      return rankDiscardPlans(state, actorIdx, continuations)[0]?.outcome || state;
    }
  }
  return state;
}

function rankDiscardPlans(state, actorIdx, actions) {
  return rankAiActions({
    state, actorIdx, actions,
    simulate: (observation, action) => simulateAiDiscardAction(observation, actorIdx, action),
  });
}

function orderedDiscardActions(state, actorIdx, count, extra = {}) {
  const hand = state.players?.[actorIdx]?.hand || [];
  const required = Math.min(hand.length, Math.max(0, count));
  if (!required) return [discardAction(hand, [], extra)];
  let permutations = 1;
  for (let i = 0; i < required; i += 1) {
    permutations *= hand.length - i;
    if (permutations > EXHAUSTIVE_ACTION_LIMIT) break;
  }
  if (permutations <= EXHAUSTIVE_ACTION_LIMIT) {
    const actions = [];
    const visit = indices => {
      if (indices.length === required) {
        actions.push(discardAction(hand, indices, extra));
        return;
      }
      for (let index = 0; index < hand.length; index += 1) {
        if (!indices.includes(index)) visit([...indices, index]);
      }
    };
    visit([]);
    return actions;
  }

  // Unusually large hands use a bounded search of whole discard sequences.
  // Rank each partial sequence through the same simulator, including deaths,
  // rather than selecting the first N cards or sorting the real hand.
  let beam = [discardAction(hand, [], extra)];
  for (let depth = 0; depth < required; depth += 1) {
    const next = beam.flatMap(plan => hand.flatMap((_, index) => (
      plan.cardIndices.includes(index) ? [] : [discardAction(
        hand, [...plan.cardIndices, index], { ...extra, searchLimited: true },
      )]
    )));
    beam = rankDiscardPlans(state, actorIdx, next)
      .slice(0, DISCARD_BEAM_WIDTH).map(candidate => candidate.action);
  }
  return beam;
}

function getSameAbyssIncomingCount(gs, sourceIdx, options) {
  if (options.incomingCardCount != null) return options.incomingCardCount;
  const abilityData = gs?.abilityData || {};
  const incomingId = abilityData.sameAbyssIncomingCardId;
  const alreadyHeld = incomingId != null
    && gs?.players?.[sourceIdx]?.hand?.some(card => card.id === incomingId);
  return alreadyHeld ? 0 : abilityData.sameAbyssIncomingCount || 0;
}

/** The source's current hand is authoritative; discardCount is never cached. */
export function getSameAbyssDiscardCount(gs, targetIdx, sourceIdx, options = {}) {
  const source = gs?.players?.[sourceIdx];
  const incomingCount = getSameAbyssIncomingCount(gs, sourceIdx, options);
  const sourceCount = source
    ? (source.hand?.length || 0) + (source.isDead ? 0 : incomingCount)
    : (gs?.abilityData?.actorHandCount || 0);
  return Math.max(0, (gs?.players?.[targetIdx]?.hand?.length || 0) - sourceCount);
}

export function chooseAiSameAbyssAction(gs, targetIdx, sourceIdx, options = {}) {
  if (!gs?.players?.[targetIdx] || gs.players[targetIdx].isDead) return null;
  const observation = createAiObservationState(gs, targetIdx);
  const required = getSameAbyssDiscardCount(gs, targetIdx, sourceIdx, options);
  const actions = orderedDiscardActions(observation, targetIdx, required, {
    sameAbyss: true,
    sameAbyssSourceIdx: sourceIdx,
    incomingCardCount: getSameAbyssIncomingCount(gs, sourceIdx, options),
  });
  if (!options.forceDiscard) actions.push({ type: 'hp', lostHp: 4, cardIds: [], cardIndices: [] });
  return chooseAiAction({
    state: observation, actorIdx: targetIdx, actions,
    simulate: (state, action) => simulateAiDiscardAction(state, targetIdx, action),
  });
}

export function getAiHandLimit(player) {
  return Math.max(0, (player?._nyaHandLimit ?? 4) - (player?.handLimitDecrease || 0));
}

export function chooseAiHandLimitDiscardIndex(gs, actorIdx) {
  const player = gs?.players?.[actorIdx];
  if (!player || player.isDead) return -1;
  const required = player.hand.length - getAiHandLimit(player);
  if (required <= 0) return -1;
  const observation = createAiObservationState(gs, actorIdx);
  const actions = orderedDiscardActions(observation, actorIdx, required);
  const chosen = chooseAiAction({
    state: observation, actorIdx, actions,
    simulate: (state, action) => simulateAiDiscardAction(state, actorIdx, action),
  });
  return chosen?.cardIndices?.[0] ?? -1;
}

function matchesHunt(card, revealedCard) {
  if (!card || !revealedCard) return false;
  if ([card, revealedCard].some(c => isBlackGoatYoung(c) || isTsathogguaSlime(c))) return false;
  if (!isZoneCard(revealedCard)) return true;
  if (!isZoneCard(card)) return false;
  return isBlankZoneCard(card) || isBlankZoneCard(revealedCard)
    || card.letter === revealedCard.letter || card.number === revealedCard.number;
}

export function chooseAiHuntDiscardIndex(gs, actorIdx, revealedCard, targetIdx, { allowAbandon = true } = {}) {
  const player = gs?.players?.[actorIdx];
  if (!player || player.isDead || !gs?.players?.[targetIdx] || gs.players[targetIdx].isDead) return -1;
  const observation = createAiObservationState(gs, actorIdx);
  const actions = player.hand.flatMap((card, index) => (
    matchesHunt(card, revealedCard) ? [discardAction(player.hand, [index], {
      type: 'hunt', targetIdx, lostHp: 3 + (player.damageBonus || 0),
    })] : []
  ));
  if (allowAbandon) actions.push({ type: 'abandon', cardIds: [], cardIndices: [] });
  const chosen = chooseAiAction({
    state: observation, actorIdx, actions,
    simulate: (state, action) => simulateAiDiscardAction(state, actorIdx, action),
  });
  return chosen?.cardIndices?.[0] ?? -1;
}
