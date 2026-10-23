import { resolvePublicChoiceState } from '../game/publicChoiceResolution.js';
import { getTreasureDeclarationWin } from '../game/victory.js';
import { cardIncomeCommittedEvent, committedPublicEvent } from './incomeEvents.js';

const picker = state => state.abilityData?.pickOrder?.[state.abilityData.pickIndex || 0];
function resolvePublicIncome(state, choice) {
  return resolvePublicChoiceState(state, choice, { onPublicIncomeCommitted: (receipt, current) => {
    current._pendingPublicEvents = [...(current._pendingPublicEvents || []), ...receipt.cards.map(card =>
      committedPublicEvent(current, cardIncomeCommittedEvent({ ...receipt, card })))];
  } });
}
function afterGain(state, seat) {
  if (state.gameOver) return state;
  const win = getTreasureDeclarationWin(state.players, seat);
  if (win) state.players[seat].roleRevealed = true;
  return win ? { ...state, gameOver: win } : state;
}
export const publicChoiceActions = {
  'publicPick.choose': {
    phases: ['FIRST_COME_PICK_SELECT'], payloadKeys: ['cardIndex'],
    authorize: (state, seat) => picker(state) === seat,
    available: (state, seat) => picker(state) === seat,
    // These faces are already explicitly public by the card's rules.
    describe: state => ({ cardIndices: state.abilityData.revealedCards.map((_card, index) => index) }),
    validate: (state, _seat, payload) => Number.isInteger(payload.cardIndex)
      && payload.cardIndex >= 0 && payload.cardIndex < state.abilityData.revealedCards.length,
    apply: (state, seat, payload) => afterGain(resolvePublicIncome(state, { cardIndex: payload.cardIndex }), seat),
  },
  'tortoise.choose': {
    phases: ['TORTOISE_ORACLE_SELECT'], payloadKeys: ['key'],
    authorize: (state, seat) => state.abilityData.playerIndex === seat,
    available: (state, seat) => state.abilityData.playerIndex === seat,
    describe: state => ({ keys: [...state.abilityData.selectableKeys] }),
    validate: (state, _seat, payload) => typeof payload.key === 'string'
      && state.abilityData.selectableKeys.includes(payload.key),
    apply: (state, seat, payload) => afterGain(resolvePublicIncome(state, { key: payload.key }), seat),
  },
};
