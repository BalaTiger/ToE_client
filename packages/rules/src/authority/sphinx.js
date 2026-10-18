import { ruleRandom } from '../runtime.js';
import { copyPlayers, isZoneCard } from '../game/coreUtils.js';
import { submitLossEvents } from '../game/effectEngine.js';
import { buildStatChangeStatePatch } from '../game/statChangeEngine.js';
import { buildTargetContinuationAbilityData } from '../game/targetContinuation.js';
import { appendPublicCardGainTriggers } from '../game/cardGainEvents.js';
import { getZhuTopGuard, removeZhuLightCard, moveTopDeckCardToBottom } from '../game/zhuPower.js';
const owner = state => state.abilityData.playerIndex ?? state.currentTurn;
function loseSphinxHp(state, seat) {
  const players = copyPlayers(state.players), deck = [...state.deck], discard = [...state.discard], log = [...state.log];
  const abilityData = buildTargetContinuationAbilityData(state.abilityData);
  const damage = submitLossEvents({ players, deck, discard, log, currentTurn: state.currentTurn,
    events: [{ targetIdx: seat, lostHp: 3, source: '斯芬克斯' }], continuation: abilityData,
    statEventSeq: (state._statEventSeq || 0) + 1 });
  return { ...state, players, deck, discard, log, ...buildStatChangeStatePatch(state, damage),
    phase: damage.phase || 'ACTION', abilityData: damage.abilityData || abilityData, _sphinxPending: null };
}
export const sphinxActions = {
  'sphinx.guess': { phases: ['SPHINX_GUESS'], payloadKeys: ['isZone'],
    authorize: (state, seat) => owner(state) === seat && !getZhuTopGuard(state),
    available: (state, seat) => owner(state) === seat && !getZhuTopGuard(state),
    validate: (state, _seat, payload) => typeof payload.isZone === 'boolean' && state.deck.length > 0,
    apply: (state, seat, payload) => {
      const deck = [...state.deck], card = deck.shift(), correct = isZoneCard(card) === payload.isZone;
      const players = copyPlayers(state.players), discard = [...state.discard];
      if (correct) players[seat].hand.push(card); else discard.push(card);
      const patch = correct ? appendPublicCardGainTriggers(state, players, seat, card) : {};
      const next = { ...state, ...patch, players, deck, discard, phase: 'ACTION', drawReveal: null,
        abilityData: buildTargetContinuationAbilityData(state.abilityData),
        _pendingPublicEvents: [...(state._pendingPublicEvents || []), { type: 'sphinxRevealed', seat, correct, card }] };
      if (correct) return next;
      if ((players[seat]._nyaBorrow || players[seat].role) === '寻宝者') return {
        ...next, phase: 'TREASURE_DODGE_DECISION', _sphinxPending: { seat } };
      return loseSphinxHp(next, seat);
    } },
  'sphinx.dodge': { phases: ['TREASURE_DODGE_DECISION'], payloadKeys: ['use'],
    authorize: (state, seat) => state._sphinxPending?.seat === seat,
    available: (state, seat) => state._sphinxPending?.seat === seat,
    validate: (_state, _seat, payload) => typeof payload.use === 'boolean',
    apply: (state, seat, payload) => {
      const roll = payload.use ? 1 + Math.floor(ruleRandom() * 6) : null;
      if (payload.use) state.players[seat].roleRevealed = true;
      const next = { ...state, _pendingPublicEvents: [...(state._pendingPublicEvents || []),
        ...(roll === null ? [] : [{ type: 'diceRolled', seat, roll, purpose: 'sphinxDodge' }])] };
      return roll !== null && roll >= 4 ? { ...next, phase: 'ACTION', _sphinxPending: null } : loseSphinxHp(next, seat);
    } },
  'zhu.hideSphinx': { phases: ['SPHINX_GUESS'], payloadKeys: ['hide'],
    authorize: (state, seat) => getZhuTopGuard(state)?.ownerIdx === seat,
    available: (state, seat) => getZhuTopGuard(state)?.ownerIdx === seat,
    validate: (_state, _seat, payload) => typeof payload.hide === 'boolean',
    apply: (state, _seat, payload) => ({ ...state, zhuLight: removeZhuLightCard(state.zhuLight, state.deck[0]),
      deck: payload.hide ? moveTopDeckCardToBottom(state.deck) : state.deck,
      abilityData: { ...state.abilityData, topCard: undefined } }) },
};
