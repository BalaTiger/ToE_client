import { ruleRandom, ruleScopedId } from '../runtime.js';
import { copyPlayers, isBlackGoatYoung } from '../game/coreUtils.js';
import { resolveApophisTarget } from '../game/apophisNight.js';
import { deriveEffectDecisionState } from '../game/effectStatePatch.js';
import { buildTargetContinuationState } from '../game/targetContinuation.js';
import { resolveCaveDuelState } from '../game/caveDuel.js';
import { checkWin, getTreasureDeclarationWin } from '../game/victory.js';
import { createBlackGoatYoungCard } from '../constants/card.js';
import { canGodPowerAffect } from '../game/godPowerImmunity.js';
import { appendPublicCardGainTriggers } from '../game/cardGainEvents.js';
import { applyFx } from '../game/effectEngine.js';
import { addDamageLink } from '../game/damageLinks.js';

const sourceFor = (state, kind) => kind === 'shu' ? state.abilityData.shuChooserIdx ?? state.currentTurn
  : state.abilityData[`${kind}Source`] ?? state.currentTurn;
const targetsFor = (state, kind) => kind === 'shu'
  ? state.players.flatMap((player, index) => !player.isDead && canGodPowerAffect(player) ? [index] : [])
  : ['zoneSwap', 'multiply'].includes(kind) ? state.players.flatMap((player, index) => !player.isDead && index !== sourceFor(state, kind) ? [index] : [])
  : (state.abilityData[`${kind}Targets`] || []).filter(index =>
  index !== sourceFor(state, kind) && state.players[index] && !state.players[index].isDead
    && (!['caveDuel', 'peekHand'].includes(kind) || state.players[index].hand.length > 0));
export function finishAuthorityTarget(state) {
  const target = state._authorityTarget;
  if (!target) return state;
  const base = { ...state, _authorityTarget: null };
  if (state.players[target.source]?.isDead || state.players[target.target]?.isDead
    || ['caveDuel', 'peekHand'].includes(target.kind) && (!state.players[target.target]?.hand.length || !state.players[target.source]?.hand.length && target.kind === 'caveDuel')) {
    return buildTargetContinuationState({ baseState: base });
  }
  if (target.kind === 'multiply') {
    const players = copyPlayers(state.players);
    if (!players[target.source].hand.some(isBlackGoatYoung)) return buildTargetContinuationState({ baseState: base });
    const card = createBlackGoatYoungCard(); players[target.target].hand.push(card);
    return buildTargetContinuationState({ baseState: { ...base, multiplyUsed: true }, players,
      extraPatch: appendPublicCardGainTriggers(state, players, target.target, card) });
  }
  if (target.kind === 'zoneSwap') {
    const result = applyFx(state.abilityData.zoneSwapCard, target.source, target.target, state.players,
      state.deck, state.discard, state);
    return buildTargetContinuationState({ baseState: base, players: result.P, deck: result.D, discard: result.Disc,
      log: [...state.log, ...result.msgs], extraPatch: result.statePatch });
  }
  if (target.kind === 'damageLink') {
    const players = copyPlayers(state.players);
    addDamageLink(players, target.source, target.target, { expiryOwner: target.source });
    return buildTargetContinuationState({ baseState: base, players });
  }
  if (target.kind === 'roseThorn') {
    const players = copyPlayers(state.players);
    const cards = players[target.source].hand.splice(0).map(card => ({ ...card, roseThornHolderId: target.target,
      roseThornSourceId: target.source, roseThornSourceName: players[target.source].name }));
    players[target.target].hand.push(...cards);
    return buildTargetContinuationState({ baseState: base, players });
  }
  if (target.kind === 'shu') {
    const players = copyPlayers(state.players), count = target.count;
    const cards = Array.from({ length: count }, () => createBlackGoatYoungCard());
    players[target.target].hand.push(...cards);
    return buildTargetContinuationState({ baseState: base, players,
      extraPatch: appendPublicCardGainTriggers(state, players, target.target, cards) });
  }
  if (target.kind === 'caveDuel') return { ...base, phase: 'CAVE_DUEL_SELECT_CARD',
    abilityData: { ...state.abilityData, caveDuelSource: target.source, caveDuelTarget: target.target },
    _sealedDuel: { id: target.id, source: target.source, target: target.target, choices: {} } };
  if (target.kind === 'peekHand') {
    const player = state.players[target.target], card = player.hand[Math.floor(ruleRandom() * player.hand.length)];
    const players = copyPlayers(state.players), memories = { ...players[target.source].peekMemories };
    memories[target.target] = [{ key: card.key, letter: card.letter ?? null, number: card.number ?? null,
      isGod: !!card.isGod, name: card.name || '' }, ...(memories[target.target] || []).filter(old => old.key !== card.key)].slice(0, 4);
    players[target.source].peekMemories = memories;
    return { ...buildTargetContinuationState({ baseState: base, players }),
      _pendingReadGrants: [...(state._pendingReadGrants || []), { viewerSeat: target.source,
        targetSeat: target.target, cards: [structuredClone(card)] }] };
  }
  throw new Error(`Unmigrated target: ${target.kind}`);
}
function targetAction(kind, phase) {
  return { phases: [phase], payloadKeys: ['targetSeat'],
    authorize: (state, seat) => sourceFor(state, kind) === seat,
    available: (state, seat) => sourceFor(state, kind) === seat,
    describe: state => ({ targetSeats: targetsFor(state, kind) }),
    validate: (state, _seat, payload) => Number.isInteger(payload.targetSeat) && targetsFor(state, kind).includes(payload.targetSeat),
    apply: (state, seat, payload) => {
      const result = resolveApophisTarget({ gs: state, players: copyPlayers(state.players), deck: [...state.deck],
        discard: [...state.discard], log: [...state.log], actorIdx: seat, selectedIdx: payload.targetSeat,
        legalTargets: targetsFor(state, kind), label: kind === 'caveDuel' ? '选择“穴居人战争”目标' : '选择偷看目标' });
      const next = { ...state, ...result.statePatch, players: result.players, deck: result.deck, discard: result.discard,
        log: result.log, _authorityTarget: { kind, source: seat, target: result.targetIdx, id: ruleScopedId('target', 1),
          ...(kind === 'shu' ? { count: state.abilityData.shuOffspringCount } : {}) } };
      const decision = deriveEffectDecisionState(result.statePatch, { baseAbilityData: state.abilityData });
      if (decision.hasDecision) return { ...next, phase: decision.phase, abilityData: decision.abilityData };
      return finishAuthorityTarget(next);
    } };
}
const canSubmit = (state, seat) => !!state._sealedDuel && [state._sealedDuel.source, state._sealedDuel.target].includes(seat)
  && !Object.hasOwn(state._sealedDuel.choices, seat);
export const targetActions = {
  'multiply.begin': { phases: ['ACTION'], payloadKeys: [],
    authorize: (state, seat) => state.currentTurn === seat && !state.skillUsed && !state.restUsed && !state.multiplyUsed
      && state.players[seat].hand.some(isBlackGoatYoung),
    available: (state, seat) => state.currentTurn === seat && !state.skillUsed && !state.restUsed && !state.multiplyUsed
      && state.players[seat].hand.some(isBlackGoatYoung),
    apply: state => ({ ...state, phase: 'MULTIPLY_SELECT_TARGET' }) },
  'multiply.selectTarget': targetAction('multiply', 'MULTIPLY_SELECT_TARGET'),
  'caveDuel.selectTarget': targetAction('caveDuel', 'CAVE_DUEL_SELECT_TARGET'),
  'peek.selectTarget': targetAction('peekHand', 'PEEK_HAND_SELECT_TARGET'),
  'shu.selectTarget': targetAction('shu', 'SHU_SELECT_TARGET'),
  'zoneSwap.selectTarget': targetAction('zoneSwap', 'ZONE_SWAP_SELECT_TARGET'),
  'damageLink.selectTarget': targetAction('damageLink', 'DAMAGE_LINK_SELECT_TARGET'),
  'roseThorn.selectTarget': targetAction('roseThorn', 'ROSE_THORN_SELECT_TARGET'),
  'caveDuel.commit': { phases: ['CAVE_DUEL_SELECT_CARD'], payloadKeys: ['cardIndex'], concurrent: true,
    windowKey: state => state._sealedDuel?.id, authorize: canSubmit, available: canSubmit,
    describe: (state, seat) => ({ cardIndices: state.players[seat].hand.map((_card, index) => index) }),
    validate: (state, seat, payload) => Number.isInteger(payload.cardIndex) && payload.cardIndex >= 0
      && payload.cardIndex < state.players[seat].hand.length,
    apply: (state, seat, payload) => {
      const duel = state._sealedDuel;
      const choices = { ...duel.choices, [seat]: { index: payload.cardIndex, card: structuredClone(state.players[seat].hand[payload.cardIndex]) } };
      if (!Object.hasOwn(choices, duel.source) || !Object.hasOwn(choices, duel.target)) {
        return { ...state, _sealedDuel: { ...duel, choices } };
      }
      const source = choices[duel.source], target = choices[duel.target];
      const result = resolveCaveDuelState(state.players, duel.source, duel.target,
        source.index, target.index, source.card, target.card, state);
      const next = { ...result.nextGs, _sealedDuel: null,
        _pendingPublicEvents: [...(state._pendingPublicEvents || []), { type: 'caveDuelRevealed',
          sourceSeat: duel.source, targetSeat: duel.target, sourceCard: source.card, targetCard: target.card,
          winnerSeat: result.duelCompare > 0 ? duel.source : result.duelCompare < 0 ? duel.target : null }] };
      const winner = result.duelCompare > 0 ? duel.source : result.duelCompare < 0 ? duel.target : null;
      const win = checkWin(next.players, next._isMP) || (winner !== null && getTreasureDeclarationWin(next.players, winner));
      if (win) { next.gameOver = win; if (win.winnerIdx !== undefined) next.players[win.winnerIdx].roleRevealed = true; }
      return next;
    } },
};
