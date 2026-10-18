import { ruleRandom } from '../runtime.js';
import { resolveEndTurn } from '../game/endTurnFlow.js';
import { resolveRestTurnEnd } from '../game/restTurnFlow.js';
import { getRestActionBlockReason } from '../game/interactionAvailability.js';
import { discardCardsFromHand, splitKeptDestroyedDiscarded, applyHandDiscardSideEffectsWithAnim } from '../game/handLimitDiscard.js';
import { beginAuthorityEndTurn } from './automatic.js';
import { queueSanInspections } from './loss.js';
const owner = (state, seat) => state.currentTurn === seat;
const limit = (state, seat) => Math.max(0, (state.players[seat]._nyaHandLimit ?? 4) - (state.players[seat].handLimitDecrease || 0));
const needed = (state, seat) => Math.max(0, state.players[seat].hand.length - limit(state, seat));
const endBoundary = state => beginAuthorityEndTurn(state);
export const turnActions = {
  'turn.end': { phases: ['ACTION'], payloadKeys: [], authorize: owner, available: owner,
    apply: (state, seat) => {
      const result = resolveEndTurn(state, { actorIndex: seat, effectiveHandLimit: limit(state, seat), advanceTurn: endBoundary });
      return result.gs || result.newGs || beginAuthorityEndTurn(result.baseGs);
    } },
  'turn.rest': { phases: ['ACTION'], payloadKeys: [], authorize: owner,
    available: (state, seat) => owner(state, seat) && !getRestActionBlockReason({ phase: state.phase, gs: state, player: state.players[seat] }),
    validate: (state, seat) => !getRestActionBlockReason({ phase: state.phase, gs: state, player: state.players[seat] }),
    apply: (state, seat) => {
      const d1 = 1 + Math.floor(ruleRandom() * 6), d2 = 1 + Math.floor(ruleRandom() * 6);
      const result = resolveRestTurnEnd(state, { actorIndex: seat, effectiveHandLimit: limit(state, seat),
        d1, d2, heal: Math.max(d1, d2), advanceTurn: endBoundary });
      const next = result.gs || result.pendingGs || result.nextGs || beginAuthorityEndTurn(result.afterRest);
      return { ...next, _restRoll: { seat, d1, d2 } };
    } },
  'turn.discard': { phases: ['DISCARD_PHASE'], payloadKeys: ['cardIndices'], authorize: owner,
    available: owner,
    describe: (state, seat) => ({ count: needed(state, seat), cardIndices: state.players[seat].hand.map((_card, index) => index) }),
    validate: (state, seat, payload) => Array.isArray(payload.cardIndices)
      && payload.cardIndices.length === needed(state, seat) && new Set(payload.cardIndices).size === payload.cardIndices.length
      && payload.cardIndices.every(index => Number.isInteger(index) && index >= 0 && index < state.players[seat].hand.length),
    apply: (state, seat, payload) => {
      const { players, discarded } = discardCardsFromHand(state.players, seat, payload.cardIndices);
      const { kept } = splitKeptDestroyedDiscarded(discarded);
      const result = applyHandDiscardSideEffectsWithAnim({ baseGs: state, players, deck: [...state.deck],
        discard: [...state.discard, ...kept], log: [...state.log], ownerIdx: seat, cards: kept, reason: '手牌上限弃牌' });
      const next = { ...state, ...result.statePatch, players: result.players, deck: result.deck,
        discard: result.discard, log: result.log, phase: result.statePatch?.phase || 'ACTION',
        abilityData: result.statePatch?.abilityData || {}, _authorityPostDiscard: true };
      return queueSanInspections(state, next);
    } },
};

export function turnTimeoutIntent(state) {
  const seat = state.currentTurn;
  if (state.phase === 'ACTION') return { seat, type: 'turn.end', payload: {} };
  if (state.phase !== 'DISCARD_PHASE') return null;
  const count = needed(state, seat), length = state.players[seat].hand.length;
  return { seat, type: 'turn.discard', payload: { cardIndices: Array.from({ length: count }, (_value, index) => length - 1 - index) } };
}
