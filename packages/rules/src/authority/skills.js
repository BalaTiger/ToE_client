import { ruleRandom } from '../runtime.js';
import { copyPlayers, isWinHand, hasHuntRevealableCard } from '../game/coreUtils.js';
import { resolveApophisTarget } from '../game/apophisNight.js';
import { deriveEffectDecisionState } from '../game/effectStatePatch.js';
import { checkWin } from '../game/victory.js';
const skillRole = (state, seat) => state.globalOnlySwapOwner != null ? '寻宝者'
  : state.players[seat]._nyaBorrow || state.players[seat].role;
const own = (state, seat) => state.currentTurn === seat;
const canBegin = (state, seat) => own(state, seat) && !state.restUsed && !state.multiplyUsed && !state.players[seat].disableSkill
  && (!state.skillUsed || skillRole(state, seat) === '追猎者');
const targets = state => state.players.flatMap((player, seat) => seat !== state.currentTurn
  && !player.isDead && player.hand.length ? [seat] : []);
export function finishAuthoritySkillTarget(state) {
  const pending = state._authoritySkillTarget;
  if (!pending) return state;
  const next = { ...state, _authoritySkillTarget: null };
  if (state.players[pending.source].isDead || state.players[pending.target].isDead || !state.players[pending.target].hand.length) {
    return { ...next, phase: 'ACTION', abilityData: {} };
  }
  if (pending.kind === 'swap') {
    const players = copyPlayers(state.players);
    if (state.globalOnlySwapOwner == null) players[pending.source].roleRevealed = true;
    return { ...next, players, phase: players[pending.target].revealHand ? 'SWAP_SELECT_TARGET_CARD' : 'SWAP_STEAL_CARD',
      abilityData: { ...state.abilityData, swapTi: pending.target } };
  }
  throw new Error(`Unmigrated skill target: ${pending.kind}`);
}
export function cancelAuthoritySwap(state) {
  const source = state.currentTurn, target = state.abilityData.swapTi;
  const players = copyPlayers(state.players), discard = [...state.discard];
  if (state._privateSwap) {
    const index = players[source].hand.findIndex(card => card.id === state._privateSwap.takenId);
    if (index >= 0) {
      const [card] = players[source].hand.splice(index, 1);
      (players[target]?.isDead ? discard : players[target].hand).push(card);
    }
  }
  if (!players[source].isDead) players[source].roleRevealed = state.abilityData.preSkillRevealed ?? players[source].roleRevealed;
  return { ...state, players, discard, phase: 'ACTION', abilityData: {}, _privateSwap: null };
}
function take(state, index) {
  const source = state.currentTurn, target = state.abilityData.swapTi, players = copyPlayers(state.players);
  const baselineHands = players.map(player => [...player.hand]);
  const [card] = players[target].hand.splice(index, 1); players[source].hand.push(card);
  return { ...state, players, phase: 'SWAP_GIVE_CARD', skillUsed: true,
    _privateSwap: { source, target, takenId: card.id, baselineHands } };
}
export const skillActions = {
  'skill.begin': { phases: ['ACTION'], payloadKeys: [], authorize: canBegin, available: canBegin,
    describe: (state, seat) => ({ role: skillRole(state, seat), targetSeats: state.players.flatMap((player, index) =>
      index !== seat && !player.isDead && (skillRole(state, seat) === '寻宝者' ? player.hand.length > 0
        : skillRole(state, seat) === '追猎者' ? hasHuntRevealableCard(player) && !(state.huntAbandoned || []).includes(index) : true) ? [index] : []) }),
    apply: (state, seat) => ({ ...state, drawReveal: null,
      phase: skillRole(state, seat) === '寻宝者' ? 'SWAP_SELECT_TARGET' : skillRole(state, seat) === '追猎者' ? 'HUNT_SELECT_TARGET' : 'BEWITCH_SELECT_CARD',
      abilityData: { preSkillRevealed: state.players[seat].roleRevealed } }) },
  'skill.cancel': { phases: ['SWAP_SELECT_TARGET', 'SWAP_SELECT_TARGET_CARD', 'SWAP_STEAL_CARD', 'SWAP_GIVE_CARD',
    'HUNT_SELECT_TARGET', 'BEWITCH_SELECT_CARD', 'BEWITCH_SELECT_TARGET', 'MULTIPLY_SELECT_TARGET'], payloadKeys: [], authorize: own, available: own,
    apply: state => cancelAuthoritySwap(state) },
  'swap.selectTarget': { phases: ['SWAP_SELECT_TARGET'], payloadKeys: ['targetSeat'], authorize: own, available: own,
    describe: state => ({ targetSeats: targets(state) }),
    validate: (state, _seat, payload) => Number.isInteger(payload.targetSeat) && targets(state).includes(payload.targetSeat),
    apply: (state, seat, payload) => {
      const result = resolveApophisTarget({ gs: state, players: copyPlayers(state.players), deck: [...state.deck],
        discard: [...state.discard], log: [...state.log], actorIdx: seat, selectedIdx: payload.targetSeat,
        legalTargets: targets(state), label: '选择【掉包】目标' });
      const next = { ...state, ...result.statePatch, players: result.players, deck: result.deck, discard: result.discard,
        log: result.log, _authoritySkillTarget: { kind: 'swap', source: seat, target: result.targetIdx } };
      const decision = deriveEffectDecisionState(result.statePatch, { baseAbilityData: state.abilityData });
      return decision.hasDecision ? { ...next, phase: decision.phase, abilityData: decision.abilityData } : finishAuthoritySkillTarget(next);
    } },
  'swap.takeBlind': { phases: ['SWAP_STEAL_CARD'], payloadKeys: [], authorize: own, available: own,
    validate: state => !state.players[state.abilityData.swapTi].revealHand && state.players[state.abilityData.swapTi].hand.length > 0,
    apply: state => take(state, Math.floor(ruleRandom() * state.players[state.abilityData.swapTi].hand.length)) },
  'swap.takeVisible': { phases: ['SWAP_SELECT_TARGET_CARD'], payloadKeys: ['cardIndex'], authorize: own, available: own,
    describe: state => ({ cardIndices: state.players[state.abilityData.swapTi].hand.map((_card, index) => index) }),
    validate: (state, _seat, payload) => state.players[state.abilityData.swapTi].revealHand
      && Number.isInteger(payload.cardIndex) && payload.cardIndex >= 0 && payload.cardIndex < state.players[state.abilityData.swapTi].hand.length,
    apply: (state, _seat, payload) => take(state, payload.cardIndex) },
  'swap.give': { phases: ['SWAP_GIVE_CARD'], payloadKeys: ['cardIndex'], authorize: own, available: own,
    describe: (state, seat) => ({ cardIndices: state.players[seat].hand.map((_card, index) => index) }),
    validate: (state, seat, payload) => !!state._privateSwap && Number.isInteger(payload.cardIndex) && payload.cardIndex >= 0
      && payload.cardIndex < state.players[seat].hand.length && !state.players[state.abilityData.swapTi].isDead,
    apply: (state, seat, payload) => {
      const players = copyPlayers(state.players), target = state.abilityData.swapTi;
      const [card] = players[seat].hand.splice(payload.cardIndex, 1); players[target].hand.push(card);
      const winners = [seat, target].filter(index => (players[index]._nyaBorrow || players[index].role) === '寻宝者' && isWinHand(players[index].hand)).sort((a, b) => a - b);
      const win = winners.length ? { winner: '寻宝者', winnerIdx: winners[0], ...(winners.length > 1 ? { winnerIdx2: winners[1] } : {}),
        reason: `${winners.map(index => players[index].name).join('、')} 通过掉包集齐了全部编号` } : checkWin(players, state._isMP);
      winners.forEach(index => { players[index].roleRevealed = true; });
      return { ...state, players, phase: 'ACTION', abilityData: {}, skillUsed: true, _privateSwap: null,
        _pendingPublicEvents: [...(state._pendingPublicEvents || []), { type: 'cardsMoved', fromSeat: seat, toSeat: target, count: 1 },
          { type: 'cardsMoved', fromSeat: target, toSeat: seat, count: 1 }],
        ...(win ? { gameOver: win } : {}) };
    } },
};
