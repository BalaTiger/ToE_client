import { copyPlayers, isTsathogguaSlime, makeInspectionMeta } from '../game/coreUtils.js';
import { playerDrawCard, startNextTurn, grantTsathogguaSlimeAtEndTurn, applySanLossToPlayerWithInspection, continueTurnStartAfterDamageReaction } from '../game/turnEngine.js';
import { checkWin, getTreasureDeclarationWin } from '../game/victory.js';
import { settlePendingZoneIncome } from '../game/zoneCardIncome.js';
import { processInspectionTargets } from '../game/effectEngine.js';
import { resumeSameAbyssContinuation } from '../game/sameAbyssResolution.js';
import { deriveEffectDecisionState } from '../game/effectStatePatch.js';
import { END_TURN_EVENT, getEndTurnEvents, resolveReverseTurnOrderAtEnd } from '../game/endTurnEvents.js';
import { buildEndTurnReplayStartState, getCurrentEndTurnReplayCard, buildEndTurnReplayZoneDraw,
  buildEndTurnReplayGodEncounter, buildEndTurnReplayFinishedState, advanceEndTurnReplayPatch } from '../game/endTurnReplayFlow.js';
import { buildTargetContinuationState } from '../game/targetContinuation.js';
import { enterTurnBoundary } from '../game/turnFlowManager.js';
import { appendPublicCardGainTriggers } from '../game/cardGainEvents.js';
import { hasGodPowerImmunity } from '../game/godPowerImmunity.js';
import { requestZhuReveal, buildZhuRevealAbilityData, getZhuRevealDecision, ZHU_REVEAL_SOURCE } from '../game/zhuPower.js';
import { settleKeptDraw } from './draw.js';
import { finishAuthorityTarget } from './targets.js';
import { thornSnapshot, settleThornLosses } from './thorn.js';
import { finishAuthoritySkillTarget, cancelAuthoritySwap } from './skills.js';
import { finishAuthorityHuntTarget, finishAuthorityHunt } from './hunt.js';
import { finishAuthorityBewitchTarget, finishAuthorityBewitchGod } from './bewitch.js';
import { settleAuthorityBury } from './bury.js';

function decisionOwner(state) {
  const ad = state.abilityData || {};
  if (state.phase === 'DRAW_REVEAL') return state.drawReveal?.drawerIdx ?? state.currentTurn;
  if (state.phase === 'GOD_CHOICE') return ad.drawerIdx ?? state.currentTurn;
  if (state.phase === 'HUNT_WAIT_REVEAL') return ad.huntTi;
  if (state.phase === 'SHU_SELECT_TARGET') return ad.shuChooserIdx ?? state.currentTurn;
  const sourceField = { ZONE_SWAP_SELECT_TARGET: 'zoneSwapSource', CAVE_DUEL_SELECT_TARGET: 'caveDuelSource',
    PEEK_HAND_SELECT_TARGET: 'peekHandSource', DAMAGE_LINK_SELECT_TARGET: 'damageLinkSource', ROSE_THORN_SELECT_TARGET: 'roseThornSource' }[state.phase];
  if (sourceField) return ad[sourceField] ?? state.currentTurn;
  if (state.phase === 'ZHU_HIDE_AI_DRAW') return getZhuRevealDecision(state)?.ownerIdx ?? state.currentTurn;
  if (['TSG_SLIME_BALANCE', 'ETHEREALIZE_DECISION', 'ETHEREALIZE_SELECT_TARGET', 'SAME_ABYSS_SELECT'].includes(state.phase)) return ad.targetIdx;
  if (state.phase === 'FIRST_COME_PICK_SELECT') return ad.pickOrder?.[ad.pickIndex || 0];
  if (['TORTOISE_ORACLE_SELECT', 'DECIPHER_STONE_CARVING', 'GRAVE_DIG_SELECT', 'IGNITE_TORCH_DISCARD', 'ALBINO_CREATURE_SELECT_CARD'].includes(state.phase)) return ad.playerIndex ?? state.currentTurn;
  return state.currentTurn;
}

export function beginAuthorityEndTurn(state) {
  const owner = state.currentTurn;
  return { ...state, phase: 'ACTION', drawReveal: null, abilityData: {},
    _authorityEnd: { owner, events: getEndTurnEvents(state.players, owner), cursor: 0 } };
}
function advanceEnd(state) {
  return { ...state, abilityData: {}, _ruleContinuation: null,
    _authorityEnd: { ...state._authorityEnd, cursor: state._authorityEnd.cursor + 1 } };
}

export function drawAuthorityCard(state, owner, flags = {}, source = ZHU_REVEAL_SOURCE.TURN_DRAW) {
  const request = requestZhuReveal(state, { deck: state.deck, drawerIdx: owner, source,
    continuation: { authorityDraw: true } });
  if (request) return { ...state, zhuLight: request.zhuLight, phase: 'ZHU_HIDE_AI_DRAW',
    drawReveal: null, abilityData: buildZhuRevealAbilityData(request, flags),
    _authorityDraw: { owner, flags, source } };
  const result = playerDrawCard(state.players, state.deck, state.discard, owner, state);
  const base = { ...state, ...result.statePatch, players: result.P, deck: result.D, discard: result.Disc,
    log: [...(state.log || []), ...(result.reshuffleLog ? [result.reshuffleLog] : []), ...(result.effectMsgs || [])],
    drawReveal: null, phase: 'ACTION', abilityData: { ...state.abilityData, ...flags } };
  const decision = deriveEffectDecisionState(result.statePatch, { baseAbilityData: base.abilityData,
    extraAbilityData: flags, fallbackPhase: 'ACTION' });
  if (decision.hasDecision) return { ...base, phase: decision.phase, abilityData: decision.abilityData };
  const win = checkWin(result.P, state._isMP);
  if (win) return { ...base, gameOver: win,
    // Encounter inspections can end the match before the god-choice window.
    // Preserve the reserved card for terminal cleanup even if another seat won.
    ...(result.drawnCard?.isGod ? { abilityData: { ...base.abilityData, godCard: result.drawnCard } } : {}) };
  if (result.needGodChoice) return { ...base, phase: 'GOD_CHOICE', abilityData: {
    ...flags, godCard: result.drawnCard, drawerIdx: owner, godEncounterCost: result.godEncounterCost } };
  if (result.needsDecision) return { ...base, phase: 'DRAW_REVEAL', drawReveal: {
    card: result.drawnCard, drawerIdx: owner, needsDecision: true, forcedKeep: !!result.forcedKeep,
    blindZoneIdentity: !!result.blindZoneIdentity, ...flags } };
  return base;
}

function replayNext(state) {
  while (state._endTurnReplay && state._endTurnReplay.index < state._endTurnReplay.cards.length
    && !getCurrentEndTurnReplayCard(state)) state = { ...state, ...advanceEndTurnReplayPatch(state) };
  const item = getCurrentEndTurnReplayCard(state);
  if (!item) return advanceEnd(buildEndTurnReplayFinishedState({ stateLike: state, players: state.players }));
  const { actorIndex, card, index } = item;
  if (!card.isGod) {
    const next = buildEndTurnReplayZoneDraw({ stateLike: state, players: state.players,
      replay: state._endTurnReplay, actorIndex, index, card, actorName: state.players[actorIndex].name }).state;
    return card.forced ? settleKeptDraw(next) : next;
  }
  const encounter = buildEndTurnReplayGodEncounter({ stateLike: state, players: copyPlayers(state.players),
    replay: state._endTurnReplay, actorIndex, index, card,
    isCultist: (state.players[actorIndex]._nyaBorrow || state.players[actorIndex].role) === '邪祀者',
    actorLabel: state.players[actorIndex].name });
  let P = encounter.players, D = [...state.deck], Disc = [...state.discard],
    L = [...state.log, encounter.effectMsg], meta = state;
  if (encounter.abilityData.godEncounterCost > 0) {
    const result = applySanLossToPlayerWithInspection(actorIndex, encounter.cost, state.currentTurn,
      P, D, Disc, L, state, '邪神遭遇');
    ({ P, D, Disc, L, inspectionMeta: meta } = result);
  }
  const win = checkWin(P, state._isMP);
  const godChoice = { ...encounter.abilityData, godEncounterCost: 0 };
  const secondary = ['tsgSlimeBalance', 'etherealizeRedirect'].includes(meta.abilityData?.type);
  const decision = deriveEffectDecisionState(secondary ? meta : {}, {
    baseAbilityData: secondary ? { pendingGodChoice: godChoice, _turnOwner: state.currentTurn } : godChoice,
    fallbackPhase: 'GOD_CHOICE' });
  return { ...state, ...meta, players: P, deck: D, discard: Disc, log: L, ...encounter.replayPatch,
    drawReveal: null, phase: decision.phase, abilityData: decision.abilityData,
    ...(win ? { gameOver: win } : {}) };
}

function inferContinuation(state) {
  if (state._ruleContinuation) return state;
  const ad = state.abilityData || {}, owner = ad._turnOwner ?? state.currentTurn;
  const kind = ad.fromRest ? 'restDraw' : ad.continueTurnStartDraw ? 'turnStartDraw'
    : ad.fromEndTurnReplay ? 'endTurnReplay' : null;
  return kind ? { ...state, _ruleContinuation: { kind, owner } } : state;
}

// Runs only mandatory rules, never a human/AI choice. The same transactional
// cursor wraps both an intent and its automatic consequences. No animation
// callback, browser timer, or receipt can resume this loop a second time.
export function advanceAutomaticRules(initial, before = null) {
  if (!initial?._intentEngine) return initial;
  let state = initial;
  let previousThorns = before ? thornSnapshot(before) : null;
  for (let steps = 0; steps < 1024; steps++) {
    if (state._huntPending && state.gameOver) state = finishAuthorityHunt(state);
    if (state.gameOver) {
      if (state._privateSwap) state = cancelAuthoritySwap(state);
      if (state.abilityData?.pendingZoneIncome) {
        const players = copyPlayers(state.players), discard = [...state.discard];
        settlePendingZoneIncome(players, discard, state.abilityData.pendingZoneIncome);
        const { pendingZoneIncome: _settled, ...abilityData } = state.abilityData;
        state = { ...state, players, discard, abilityData };
      }
      const reserved = [state.drawReveal?.card, state.abilityData?.godCard, state.abilityData?.pendingGodChoice?.godCard,
        state._authorityBewitchGod?.card, state._clockContinuation?.drawReveal?.card,
        ...(state.abilityData?.revealedCards || []),
        ...(state._decisionContinuations || []).map(frame => frame.abilityData?.godCard)].filter(Boolean);
      const discard = [...state.discard], located = new Set([...state.deck, ...discard,
        ...state.players.flatMap(player => [...player.hand, ...(player.godZone || [])])].map(card => card.id));
      for (const card of reserved) if (card.id != null && !located.has(card.id)) { discard.push(card); located.add(card.id); }
      // The established final result reveals all roles/hands. Presentation
      // can animate that result, but never owns or delays its commitment.
      return { ...state, discard, drawReveal: null, abilityData: {}, _authorityBewitchGod: null, _clockContinuation: null,
        _decisionContinuations: [], _authorityDraw: null, _authorityEnd: null, _ruleContinuation: null, _endTurnReplay: null,
        players: state.players.map(player => ({ ...player, roleRevealed: true, revealHand: true })) };
    }
    state = settleThornLosses(state, previousThorns);
    previousThorns = thornSnapshot(state);
    if (state._privateSwap && (state.players[state._privateSwap.source].isDead || state.players[state._privateSwap.target].isDead)) {
      state = cancelAuthoritySwap(state); continue;
    }
    if (state._sealedDuel && [state._sealedDuel.source, state._sealedDuel.target].some(seat => state.players[seat]?.isDead)) {
      state = buildTargetContinuationState({ baseState: { ...state, _sealedDuel: null } }); continue;
    }
    if (state.phase === 'GOD_CHOICE' && state.abilityData?.fromEndTurnReplay) {
      const seat = state.abilityData.drawerIdx ?? state.currentTurn;
      if (!state.players[seat]?.hand.some(card => card.id === state.abilityData.godCard?.id)) {
        state = buildTargetContinuationState({ baseState: { ...state, ...advanceEndTurnReplayPatch(state) },
          abilityData: state.abilityData }); continue;
      }
    }
    if (state.phase === 'BURY_ALIVE_SELECT') {
      const next = settleAuthorityBury(state);
      if (next.phase !== state.phase) { state = next; continue; }
      state = next;
    }
    if (state.phase === 'FIRST_COME_PICK_SELECT' && state.players[decisionOwner(state)]?.isDead) {
      const ad = state.abilityData, pickIndex = (ad.pickIndex || 0) + 1;
      state = pickIndex < ad.pickOrder.length ? { ...state, abilityData: { ...ad, pickIndex } }
        : buildTargetContinuationState({ baseState: { ...state, discard: [...state.discard, ...(ad.revealedCards || [])] } });
      continue;
    }
    if (state.players[decisionOwner(state)]?.isDead && !['ACTION', 'BURY_ALIVE_SELECT'].includes(state.phase)) {
      const card = state.drawReveal?.card || state.abilityData?.godCard;
      const discard = [...state.discard];
      if (card && !discard.some(item => item.id === card.id) && !state.players.some(player => player.hand.some(item => item.id === card.id))) discard.push(card);
      if (['DECIPHER_STONE_CARVING', 'TORTOISE_ORACLE_SELECT'].includes(state.phase)) {
        for (const revealed of state.abilityData.revealedCards || []) if (!discard.some(item => item.id === revealed.id)) discard.push(revealed);
      }
      if (state.abilityData?.pendingZoneIncome) settlePendingZoneIncome(state.players, discard, state.abilityData.pendingZoneIncome);
      state = { ...state, discard, phase: 'ACTION', drawReveal: null, abilityData: {}, _authorityEnd: null,
        _ruleContinuation: null, _endTurnReplay: null }; continue;
    }
    if (state.phase === 'DRAW_REVEAL' && state.drawReveal?.needsDecision === false
      && !state.drawReveal.fromEndTurnReplay) {
      // Legacy startNextTurn already applied this forced card. It is a public
      // presentation reveal, not permission to apply its effect again.
      state = { ...state, phase: 'ACTION', drawReveal: null };
    }
    if (state.phase !== 'ACTION') return state;
    if (state._clockContinuation) {
      const frame = state._clockContinuation;
      const target = state.players[frame.abilityData?.targetIdx];
      const abilityData = frame.phase === 'TSG_SLIME_BALANCE' && target
        ? { ...frame.abilityData, afterHp: target.hp, afterSan: target.san } : frame.abilityData;
      state = { ...state, ...frame, abilityData, _clockContinuation: null }; continue;
    }
    if (state.abilityData?._pendingTurnStartEventIds?.length || state.abilityData?._pendingTurnStartPoison
      || state.abilityData?._pendingTurnStartLinkHeals?.length) {
      state = continueTurnStartAfterDamageReaction(state); continue;
    }
    if (state.abilityData?.pendingInspectionContinuation?.targets?.length) {
      const pending = state.abilityData.pendingInspectionContinuation;
      const { pendingInspectionContinuation: _completed, ...abilityData } = state.abilityData;
      const targets = pending.targets.filter(seat => state.players[seat] && !state.players[seat].isDead
        && state.players[seat].san > 0 && state.players[seat].san <= 6);
      const result = processInspectionTargets(targets, pending.startIndex ?? state.currentTurn,
        copyPlayers(state.players), [...state.deck], [...state.discard], [...state.log], makeInspectionMeta(state));
      const decision = deriveEffectDecisionState(result.inspectionMeta, { baseAbilityData: abilityData });
      state = { ...state, ...result.inspectionMeta, players: result.P, deck: result.D, discard: result.Disc,
        log: result.log, phase: decision.phase, abilityData: decision.abilityData }; continue;
    }
    if (state._sameAbyssContinuation) { state = resumeSameAbyssContinuation(state); continue; }
    if (state._huntPending) {
      const next = finishAuthorityHunt(state);
      if (next !== state) { state = next; continue; }
    }
    if (state._authorityTarget) { state = finishAuthorityTarget(state); continue; }
    if (state._authoritySkillTarget) { state = finishAuthoritySkillTarget(state); continue; }
    if (state._authorityHuntTarget) { state = finishAuthorityHuntTarget(state); continue; }
    if (state._authorityBewitchTarget) { state = finishAuthorityBewitchTarget(state); continue; }
    if (state._authorityBewitchGod) { state = finishAuthorityBewitchGod(state); continue; }
    if (state._deferredShuTarget) {
      const pending = state._deferredShuTarget;
      return { ...state, _deferredShuTarget: null, phase: 'SHU_SELECT_TARGET',
        abilityData: { ...state.abilityData, shuChooserIdx: pending.chooserIdx, shuOffspringCount: pending.count } };
    }
    if (state.abilityData?.pendingGodChoice) {
      const choice = state.abilityData.pendingGodChoice;
      // Damage reactions can retain both the legacy pending field and a frame
      // for the same response. Promoting one must not leave a second settlement.
      const frames = [...(state._decisionContinuations || [])];
      const index = frames.findLastIndex(frame => frame.phase === 'GOD_CHOICE'
        && frame.abilityData?.godCard?.id === choice.godCard?.id
        && (frame.abilityData.drawerIdx ?? state.currentTurn) === (choice.drawerIdx ?? state.currentTurn));
      if (index >= 0) frames.splice(index, 1);
      state = { ...state, phase: 'GOD_CHOICE', abilityData: choice, _decisionContinuations: frames };
      return state;
    }
    if (state._decisionContinuations?.length) {
      state = buildTargetContinuationState({ baseState: state }); continue;
    }
    if (state._authorityPostDiscard) {
      state = beginAuthorityEndTurn({ ...state, _authorityPostDiscard: false }); continue;
    }
    if (state.abilityData?.pendingZoneIncome) {
      const players = copyPlayers(state.players), discard = [...state.discard];
      const income = settlePendingZoneIncome(players, discard, state.abilityData.pendingZoneIncome);
      const { pendingZoneIncome: _settled, ...abilityData } = state.abilityData;
      const patch = income?.dest === 'player' ? appendPublicCardGainTriggers(state, players, income.drawerIdx, income.card) : {};
      state = { ...state, ...patch, players, discard, abilityData };
      const win = checkWin(players, state._isMP) || (income?.dest === 'player' && getTreasureDeclarationWin(players, income.drawerIdx));
      if (win) {
        if (win.winnerIdx !== undefined) players[win.winnerIdx].roleRevealed = true;
        return { ...state, gameOver: win };
      }
      continue;
    }
    const win = checkWin(state.players, state._isMP);
    if (win) return { ...state, gameOver: win };
    if (state.players[state.currentTurn]?.isDead) {
      state = startNextTurn(enterTurnBoundary({ ...state, _authorityEnd: null, _ruleContinuation: null, abilityData: {} }));
      continue;
    }
    state = inferContinuation(state);
    const pending = state._ruleContinuation;
    if (pending?.kind === 'restDraw') {
      const remaining = state.abilityData?.cthDrawsRemaining || 0;
      if (remaining > 0 && !state.players[pending.owner].isDead) {
        state = drawAuthorityCard(state, pending.owner, { fromRest: true, cthDrawsRemaining: remaining - 1 }, ZHU_REVEAL_SOURCE.CTH_REST);
        continue;
      }
      state = state._authorityEnd ? advanceEnd(state) : { ...state, _ruleContinuation: null, abilityData: {} };
      continue;
    }
    if (pending?.kind === 'turnStartDraw') {
      const owner = pending.owner, players = copyPlayers(state.players), player = players[owner];
      if (!player || player.isDead) {
        state = { ...state, _ruleContinuation: null, abilityData: {} }; continue;
      }
      const index = player.godName === 'TSG' && player.godLevel > 0 && !hasGodPowerImmunity(player)
        ? player.hand.findIndex(isTsathogguaSlime) : -1;
      if (index >= 0) {
        player.hand.splice(index, 1);
        state = drawAuthorityCard({ ...state, players }, owner,
          { fromTsathogguaSlime: true, continueTurnStartDraw: true, _turnOwner: owner }, ZHU_REVEAL_SOURCE.TSG_SLIME);
      } else state = drawAuthorityCard({ ...state, _ruleContinuation: null, abilityData: {} }, owner);
      continue;
    }
    if (pending?.kind === 'endTurnReplay') { state = replayNext(state); continue; }
    if (pending?.kind === 'proliferatingDraw') {
      state = { ...state, _ruleContinuation: null,
        abilityData: { ...state.abilityData, fromProliferatingZ: undefined } };
    }
    if (state.proliferatingZQueue?.length) {
      const [entry, ...queue] = state.proliferatingZQueue;
      state = { ...state, proliferatingZQueue: queue };
      if (!state.players[entry.drawerIdx] || state.players[entry.drawerIdx].isDead) continue;
      state = drawAuthorityCard({ ...state, _ruleContinuation: { kind: 'proliferatingDraw', owner: entry.drawerIdx } },
        entry.drawerIdx, { fromProliferatingZ: true }, ZHU_REVEAL_SOURCE.PROLIFERATING_Z);
      continue;
    }
    const end = state._authorityEnd;
    if (!end) return state;
    const event = end.events[end.cursor];
    if (!event || state.players[end.owner].isDead) {
      state = startNextTurn(enterTurnBoundary({ ...state, _authorityEnd: null, _ruleContinuation: null, abilityData: {} }));
      continue;
    }
    if (event.id === END_TURN_EVENT.CTH_REST_DRAW) {
      state = { ...state, abilityData: { fromRest: true, cthDrawsRemaining: event.drawCount },
        _ruleContinuation: { kind: 'restDraw', owner: end.owner } }; continue;
    }
    if (event.id === END_TURN_EVENT.REVERSE_TURN_ORDER) {
      const result = resolveReverseTurnOrderAtEnd(copyPlayers(state.players), end.owner, state.turnDirection,
        [...state.log], event.reverseCount);
      state = advanceEnd({ ...state, ...result }); continue;
    }
    if (event.id === END_TURN_EVENT.TSG_SLIME_GRANT) {
      const players = copyPlayers(state.players), log = [...state.log];
      const grant = grantTsathogguaSlimeAtEndTurn(players, end.owner, log, []);
      const patch = grant ? appendPublicCardGainTriggers(state, players, end.owner, grant.cards) : {};
      state = advanceEnd({ ...state, ...patch, players, log, _tsgSlimeGrantedAtTurnEnd: true }); continue;
    }
    if (event.id === END_TURN_EVENT.END_TURN_REPLAY_HAND) {
      const replay = buildEndTurnReplayStartState({ baseGs: state, players: state.players, deck: state.deck,
        discard: state.discard, log: state.log, actorIndex: end.owner, actorLabel: state.players[end.owner].name });
      state = replay ? { ...replay, phase: 'ACTION', _ruleContinuation: { kind: 'endTurnReplay', owner: end.owner } }
        : advanceEnd(state); continue;
    }
    throw new Error(`Unmigrated mandatory end-turn event: ${event.id}`);
  }
  throw new Error('Mandatory rule chain exceeded its safety bound');
}
