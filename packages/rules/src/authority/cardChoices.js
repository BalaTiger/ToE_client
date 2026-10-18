import { ruleRandom } from '../runtime.js';
import { copyPlayers } from '../game/coreUtils.js';
import { buildTargetContinuationState, buildTargetContinuationAbilityData } from '../game/targetContinuation.js';
import { appendPublicCardGainTriggers } from '../game/cardGainEvents.js';
import { splitKeptDestroyedDiscarded, applyHandDiscardSideEffectsWithAnim } from '../game/handLimitDiscard.js';
import { grantTurnScopedGodPowerImmunity, getCurrentExecutionTurnOwner } from '../game/turnScopedEffects.js';
import { submitLossEvents } from '../game/effectEngine.js';
import { buildStatChangeStatePatch } from '../game/statChangeEngine.js';
import { queueSanInspections } from './loss.js';
const owner = (state, seat) => (state.abilityData.playerIndex ?? state.currentTurn) === seat;
const held = (state, seat, index) => Number.isInteger(index) && index >= 0 && index < state.players[seat].hand.length;
export const cardChoiceActions = {
  'grave.choose': { phases: ['GRAVE_DIG_SELECT'], payloadKeys: ['cardIndex'], authorize: owner, available: owner,
    describe: state => ({ cardIndices: (state.abilityData.godCards || []).map((_card, index) => index) }),
    validate: (state, _seat, payload) => Number.isInteger(payload.cardIndex) && payload.cardIndex >= 0
      && !!state.abilityData.godCards?.[payload.cardIndex]
      && state.discard.some(card => card.id === state.abilityData.godCards[payload.cardIndex].id),
    apply: (state, seat, payload) => {
      const players = copyPlayers(state.players), discard = [...state.discard];
      const index = discard.findIndex(card => card.id === state.abilityData.godCards[payload.cardIndex].id);
      const [card] = discard.splice(index, 1); players[seat].hand.push(card);
      return buildTargetContinuationState({ baseState: state, players, discard,
        extraPatch: appendPublicCardGainTriggers(state, players, seat, card) });
    } },
  'torch.discard': { phases: ['IGNITE_TORCH_DISCARD'], payloadKeys: ['cardIndex'], authorize: owner, available: owner,
    describe: (state, seat) => ({ cardIndices: state.players[seat].hand.map((_card, index) => index) }),
    validate: (state, seat, payload) => held(state, seat, payload.cardIndex),
    apply: (state, seat, payload) => {
      const players = copyPlayers(state.players), [card] = players[seat].hand.splice(payload.cardIndex, 1);
      const { kept } = splitKeptDestroyedDiscarded([card]);
      const result = applyHandDiscardSideEffectsWithAnim({ baseGs: state, players, deck: [...state.deck],
        discard: [...state.discard, ...kept], log: [...state.log], ownerIdx: seat, cards: kept, reason: '引燃火把弃牌' });
      grantTurnScopedGodPowerImmunity(result.players[seat], getCurrentExecutionTurnOwner(state, seat));
      const next = buildTargetContinuationState({ baseState: state, players: result.players, deck: result.deck,
        discard: result.discard, log: result.log, extraPatch: result.statePatch });
      return queueSanInspections(state, next);
    } },
  'albino.reveal': { phases: ['ALBINO_CREATURE_SELECT_CARD'], payloadKeys: ['cardIndex'], authorize: owner, available: owner,
    describe: (state, seat) => ({ cardIndices: state.players[seat].hand.flatMap((card, index) =>
      state.abilityData.fireCardIds.includes(card.id) ? [index] : []) }),
    validate: (state, seat, payload) => held(state, seat, payload.cardIndex)
      && state.abilityData.fireCardIds.includes(state.players[seat].hand[payload.cardIndex].id),
    apply: (state, seat, payload) => {
      const candidates = state.players.flatMap((player, index) => player.isDead ? [] : [index]);
      const target = candidates[Math.floor(ruleRandom() * candidates.length)], players = copyPlayers(state.players);
      const deck = [...state.deck], discard = [...state.discard], log = [...state.log];
      const damage = submitLossEvents({ players, deck, discard, log, currentTurn: state.currentTurn,
        events: [{ targetIdx: target, lostHp: 2, lostSan: 2, source: '白化生物' }],
        continuation: buildTargetContinuationAbilityData(state.abilityData), statEventSeq: (state._statEventSeq || 0) + 1 });
      const next = { ...state, players, deck, discard, log, ...buildStatChangeStatePatch(state, damage),
        phase: damage.phase || 'ACTION', abilityData: damage.abilityData || buildTargetContinuationAbilityData(state.abilityData),
        _pendingPublicEvents: [...(state._pendingPublicEvents || []), { type: 'cardRevealed', seat,
          card: state.players[seat].hand[payload.cardIndex], reason: 'albinoCreature' },
        { type: 'targetSelected', seat, targetSeat: target, reason: 'albinoCreature' }] };
      return queueSanInspections(state, next);
    } },
};
