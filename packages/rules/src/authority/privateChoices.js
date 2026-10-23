import { resolvePublicChoiceState } from '../game/publicChoiceResolution.js';
import { resolveSameAbyssState } from '../game/sameAbyssResolution.js';
import { getTreasureDeclarationWin } from '../game/victory.js';
import { committedPublicEvent } from './incomeEvents.js';
const stoneOwner = (state, seat) => (state.abilityData.playerIndex ?? state.currentTurn) === seat;
export const privateChoiceActions = {
  'stone.arrange': { phases: ['DECIPHER_STONE_CARVING'], payloadKeys: ['handIndex', 'topIndices', 'bottomIndices'],
    authorize: stoneOwner, available: stoneOwner,
    describe: state => ({ cardIndices: state.abilityData.revealedCards.map((_card, index) => index) }),
    validate: (state, _seat, payload) => {
      if (!Array.isArray(payload.topIndices) || !Array.isArray(payload.bottomIndices)) return false;
      const indices = [payload.handIndex, ...payload.topIndices, ...payload.bottomIndices];
      return indices.length === state.abilityData.revealedCards.length && new Set(indices).size === indices.length
        && indices.every(index => Number.isInteger(index) && index >= 0 && index < indices.length);
    },
    apply: (state, seat, payload) => {
      // The shipped transfer precedes the god-card SAN cost. Capture that
      // presentation boundary, but publish nothing until the moves commit.
      const boundary = committedPublicEvent(state, { type: 'stoneCardsArranged', seat });
      const next = resolvePublicChoiceState(state, payload, { onStoneCardsArranged: (receipt, current) => {
        current._pendingPublicEvents = [...(current._pendingPublicEvents || []), { ...boundary, ...receipt }];
      } });
      const win = next.phase === 'ACTION' ? getTreasureDeclarationWin(next.players, seat) : null;
      if (win) { next.players[seat].roleRevealed = true; next.gameOver = win; }
      return next;
    } },
  'sameAbyss.choose': { phases: ['SAME_ABYSS_SELECT'], payloadKeys: ['choice'],
    authorize: (state, seat) => state.abilityData.targetIdx === seat,
    available: (state, seat) => state.abilityData.targetIdx === seat,
    describe: state => ({ choices: state.abilityData.forceDiscard ? ['discard'] : ['discard', 'damage'], actorSeat: state.abilityData.actorIdx }),
    validate: (state, _seat, payload) => ['discard', 'damage'].includes(payload.choice)
      && (!state.abilityData.forceDiscard || payload.choice === 'discard'),
    apply: (state, _seat, payload) => resolveSameAbyssState(state, payload) },
};
