import { copyPlayers, makeInspectionMeta, isRevealedCultist } from '../game/coreUtils.js';
import { advanceGodEncounter } from '../game/balancePatches.js';
import { applySanLossToPlayerWithInspection } from '../game/turnEngine.js';
import { resolveApophisTarget } from '../game/apophisNight.js';
import { deriveEffectDecisionState } from '../game/effectStatePatch.js';
import { applyFx } from '../game/effectEngine.js';
import { applyZoneCardIncome } from '../game/zoneCardIncome.js';
import { resolveGodIntent } from './gods.js';
const own = (state, seat) => state.currentTurn === seat;
const targets = state => state.players.flatMap((player, seat) => seat !== state.currentTurn && !player.isDead ? [seat] : []);
export function finishAuthorityBewitchGod(state) {
  const pending = state._authorityBewitchGod;
  if (!pending) return state;
  const player = state.players[pending.target];
  if (player.isDead || player.san <= 0 || state.gameOver) return {
    ...state, discard: [...state.discard, pending.card], _authorityBewitchGod: null, phase: 'ACTION', abilityData: {} };
  const choice = player.godName === pending.card.godKey ? (player.godLevel < 3 ? 'upgrade' : 'discard') : 'accept';
  const next = resolveGodIntent({ ...state, _authorityBewitchGod: null,
    abilityData: { _turnOwner: state.currentTurn, godCard: pending.card, drawerIdx: pending.target, forcedConvert: true } },
  pending.target, pending.card, choice);
  return { ...next, godTriggeredThisTurn: state.godTriggeredThisTurn };
}
export function finishAuthorityBewitchTarget(state) {
  const pending = state._authorityBewitchTarget;
  if (!pending) return state;
  const source = state.currentTurn, target = pending.target, players = copyPlayers(state.players);
  const index = players[source].hand.findIndex(card => card.id === pending.cardId);
  if (index < 0 || players[source].isDead || players[target].isDead) return {
    ...state, _authorityBewitchTarget: null, phase: 'ACTION', abilityData: {} };
  const [card] = players[source].hand.splice(index, 1); players[source].roleRevealed = true;
  const base = { ...state, players, skillUsed: true, _authorityBewitchTarget: null,
    abilityData: { _turnOwner: source },
    _pendingPublicEvents: [...(state._pendingPublicEvents || []), { type: 'cardRevealed', seat: source, card, reason: 'bewitch' }] };
  if (card.isGod) {
    const progress = advanceGodEncounter(players[target], base);
    let next = { ...base, _authorityBewitchGod: { target, card }, phase: 'ACTION' };
    if (!isRevealedCultist(players[target]) && progress.sanLoss > 0) {
      const result = applySanLossToPlayerWithInspection(target, progress.sanLoss, source, players,
        [...state.deck], [...state.discard], [...state.log], makeInspectionMeta(base), '邪神遭遇');
      const decision = deriveEffectDecisionState(result.inspectionMeta, { baseAbilityData: base.abilityData });
      next = { ...next, ...result.inspectionMeta, players: result.P, deck: result.D, discard: result.Disc,
        log: result.L, phase: decision.phase, abilityData: decision.abilityData };
      if (decision.hasDecision) return next;
    }
    return finishAuthorityBewitchGod(next);
  }
  if (card.type === 'swapAllHands') return { ...base, phase: 'ZONE_SWAP_SELECT_TARGET', abilityData: {
    _turnOwner: source, zoneSwapCard: card, zoneSwapSource: target,
    pendingZoneIncome: { card, ownerId: players[target].id } } };
  const result = applyFx(card, target, target, players, [...state.deck], [...state.discard], base, false, [], false);
  const patch = applyZoneCardIncome({ players: result.P, discard: result.Disc, card, drawerIdx: target, statePatch: result.statePatch });
  const decision = deriveEffectDecisionState(patch, { baseAbilityData: base.abilityData, turnOwner: source });
  return { ...base, ...patch, players: result.P, deck: result.D, discard: result.Disc,
    log: [...state.log, ...result.msgs], phase: decision.phase, abilityData: decision.abilityData };
}
export const bewitchActions = {
  'bewitch.chooseCard': { phases: ['BEWITCH_SELECT_CARD'], payloadKeys: ['cardIndex'], authorize: own, available: own,
    describe: (state, seat) => ({ cardIndices: state.players[seat].hand.map((_card, index) => index) }),
    validate: (state, seat, payload) => Number.isInteger(payload.cardIndex) && payload.cardIndex >= 0
      && payload.cardIndex < state.players[seat].hand.length,
    apply: (state, seat, payload) => ({ ...state, phase: 'BEWITCH_SELECT_TARGET', abilityData: {
      ...state.abilityData, bewitchCardId: state.players[seat].hand[payload.cardIndex].id } }) },
  'bewitch.selectTarget': { phases: ['BEWITCH_SELECT_TARGET'], payloadKeys: ['targetSeat'], authorize: own, available: own,
    describe: state => ({ targetSeats: targets(state) }),
    validate: (state, _seat, payload) => Number.isInteger(payload.targetSeat) && targets(state).includes(payload.targetSeat),
    apply: (state, seat, payload) => {
      const result = resolveApophisTarget({ gs: state, players: copyPlayers(state.players), deck: [...state.deck], discard: [...state.discard],
        log: [...state.log], actorIdx: seat, selectedIdx: payload.targetSeat, legalTargets: targets(state), label: '选择【蛊惑】目标' });
      const next = { ...state, ...result.statePatch, players: result.players, deck: result.deck, discard: result.discard,
        log: result.log, _authorityBewitchTarget: { target: result.targetIdx, cardId: state.abilityData.bewitchCardId } };
      const decision = deriveEffectDecisionState(result.statePatch, { baseAbilityData: state.abilityData });
      return decision.hasDecision ? { ...next, phase: decision.phase, abilityData: decision.abilityData } : finishAuthorityBewitchTarget(next);
    } },
};
