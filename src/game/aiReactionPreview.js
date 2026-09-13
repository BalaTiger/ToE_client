import { createAiObservationState, evaluateAiState, compareAiScores, rankAiActions } from './aiPolicy';
import { resolveHeadlessEtherealize, resolveHeadlessSlimeBalance } from './headlessSimulator';

const REACTION_PHASES = new Set(['ETHEREALIZE_DECISION', 'TSG_SLIME_BALANCE']);
const REACTION_VALUE_KEYS = ['targetIdx', 'lostHp', 'lostSan', 'source', 'order',
  'pendingIndex', '_turnOwner', 'beforeHp', 'beforeSan', 'afterHp', 'afterSan'];

function pickValues(source, keys) {
  return Object.fromEntries(keys.filter(key => (
    typeof source?.[key] === 'number' || typeof source?.[key] === 'string'
  )).map(key => [key, source[key]]));
}

function observedReactionData(data = {}) {
  const result = pickValues(data, REACTION_VALUE_KEYS);
  if (Array.isArray(data.adjacentTargets)) result.adjacentTargets = data.adjacentTargets.filter(Number.isInteger);
  for (const key of ['pendingLosses', 'confirmedLosses', 'deferredDirectLosses', 'pendingSlimeBalanceDecisions']) {
    if (Array.isArray(data[key])) result[key] = data[key].map(observedReactionData);
  }
  if (data.pendingSanInspection) {
    result.pendingSanInspection = pickValues(data.pendingSanInspection, ['targetIndex', 'startIndex', 'reason']);
  }
  if (data.pendingInspectionContinuation) {
    result.pendingInspectionContinuation = {
      ...pickValues(data.pendingInspectionContinuation, ['startIndex']),
      targets: (data.pendingInspectionContinuation.targets || []).filter(Number.isInteger),
    };
  }
  return result;
}

function deferredContinuations(state) {
  const data = state?.abilityData || {};
  const result = [...(state?._aiDeferredContinuations || [])];
  if (data.continueTurnStartDraw || data.fromTsathogguaSlime || data._tsgExtraDrawReady) result.push('turnStartDraw');
  if ((data.cthDrawsRemaining || 0) > 0) result.push('cthRestDraw');
  if (data.fromEndTurnReplay) result.push('endTurnReplay');
  if (data.pendingGodChoice) result.push('godChoice');
  if (data._pendingTurnStartPoison || data._pendingTurnStartLinkHeals?.length || data._pendingTurnStartEventIds?.length) result.push('turnStartEvents');
  if (data.pendingTsathogguaSlime || data.pendingTsathogguaSlimes?.length) result.push('slimeContinuation');
  if (state?._decisionContinuations?.length) result.push('decisionContinuation');
  if (state?.proliferatingZQueue?.length) result.push('proliferatingZDraw');
  for (const queued of data.pendingSlimeBalanceDecisions || []) {
    result.push(...deferredContinuations({ abilityData: queued }));
  }
  return [...new Set(result)];
}

// Preserve public reaction/inspection coordinates, not arbitrary continuation
// snapshots that can contain hidden cards or the authoritative deck order.
export function createAiReactionObservation(state, observerIdx) {
  const observation = createAiObservationState(state, observerIdx);
  observation.abilityData = observedReactionData(state.abilityData);
  observation._aiDeferredContinuations = deferredContinuations(state);
  return observation;
}

function reactionActions(state) {
  const ad = state.abilityData || {};
  if (state.phase === 'TSG_SLIME_BALANCE') return [{ useSlime: false }, { useSlime: true }];
  if (state.phase !== 'ETHEREALIZE_DECISION') return [];
  const actions = [{ useEtherealize: false }];
  if ((state.players[ad.targetIdx]?.etherealizeStacks || 0) > 0) {
    for (const idx of ad.adjacentTargets || []) {
      if (state.players[idx] && !state.players[idx].isDead) actions.push({ useEtherealize: true, redirectTargetIdx: idx });
    }
  }
  return actions;
}

function applyReaction(state, action) {
  const beforeInspection = state._inspectionSeq || 0;
  const beforeLogCount = state.log?.length || 0;
  const clean = { ...state, _aiPreviewIncomplete: false, _aiPendingResolution: null, _aiUnresolvedRisk: 0,
    _aiDeferredContinuations: deferredContinuations(state) };
  const next = state.phase === 'ETHEREALIZE_DECISION'
    ? resolveHeadlessEtherealize(clean, action)
    : resolveHeadlessSlimeBalance(clean, action.useSlime);
  if (!next) return { ...state, _aiPreviewIncomplete: true };
  const unknownImmortalReveal = (state._aiUnknownDeck || state.deckCount > (state.deck?.length || 0)) && (
    next.players?.some(player => player?._vritraImmortalReveal)
    || next._visualEvents?.some(event => event?.type === 'vritraImmortalReveal')
    || next._statEvents?.some(event => event?.vritraImmortalReveal)
    || next.log?.slice(beforeLogCount).some(message => message.includes('【不灭之躯】'))
  );
  if ((next._inspectionSeq || 0) !== beforeInspection || unknownImmortalReveal) {
    next._aiPreviewIncomplete = true;
    next._aiUnresolvedRisk = 1;
    // Hidden-deck immortality and sampled inspections are not proof of a
    // terminal outcome, including gameOver emitted by the live resolver.
    next.gameOver = null;
  }
  if (!REACTION_PHASES.has(next.phase) && !next.gameOver && (
    next.abilityData?.pendingSanInspection || next.abilityData?.pendingInspectionContinuation
    || next._aiDeferredContinuations?.length
  )) {
    next._aiPreviewIncomplete = true;
    next._aiPendingResolution = 'reactionContinuation';
    next._aiUnresolvedRisk = Math.max(1, next._aiUnresolvedRisk || 0);
  }
  return next;
}

function rankReactions(state, observerIdx, budget) {
  const owner = state.abilityData?.targetIdx;
  if (owner == null || !state.players[owner]) return [];
  const knownRole = !!state.players[owner].role;
  const ranked = rankAiActions({
    state, actorIdx: knownRole ? owner : observerIdx,
    actions: reactionActions(state),
    simulate: (snapshot, action) => {
      if (--budget.nodes < 0) return { ...snapshot, _aiPreviewIncomplete: true, _aiUnresolvedRisk: 1 };
      const next = applyReaction(snapshot, action);
      if (!REACTION_PHASES.has(next.phase) || next._aiPreviewIncomplete) return next;
      return rankReactions(next, observerIdx, budget)[0]?.outcome
        || { ...next, _aiPreviewIncomplete: true, _aiUnresolvedRisk: 1 };
    },
  });
  // Unknown allegiances cannot be read from authoritative player objects.
  // A robust preview considers their least favorable legal response.
  if (!knownRole) ranked.sort((a, b) => compareAiScores(
    evaluateAiState(a.outcome, observerIdx), evaluateAiState(b.outcome, observerIdx),
  ));
  return ranked;
}

export function resolveAiReactionPreview(state, observerIdx, { maxNodes = 64 } = {}) {
  if (!REACTION_PHASES.has(state?.phase)) return state;
  return rankReactions(state, observerIdx, { nodes: maxNodes })[0]?.outcome
    || { ...state, _aiPreviewIncomplete: true, _aiUnresolvedRisk: 1 };
}

export function chooseAiDamageReaction(state) {
  const observerIdx = state?.abilityData?.targetIdx;
  if (observerIdx == null || !REACTION_PHASES.has(state?.phase)) return null;
  const observation = createAiReactionObservation(state, observerIdx);
  return rankReactions(observation, observerIdx, { nodes: 64 })[0]?.action || null;
}
