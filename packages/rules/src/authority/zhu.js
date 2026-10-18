import { getZhuRevealDecision, removeZhuLightCard, moveTopDeckCardToBottom, ZHU_REVEAL_SOURCE } from '../game/zhuPower.js';
import { drawAuthorityCard } from './automatic.js';
const owner = (state, seat) => getZhuRevealDecision(state)?.ownerIdx === seat;
export const zhuActions = {
  'zhu.hide': { phases: ['ZHU_HIDE_AI_DRAW'], payloadKeys: ['hide'], authorize: owner, available: owner,
    validate: (state, _seat, payload) => typeof payload.hide === 'boolean'
      && state.deck[0]?.id === getZhuRevealDecision(state)?.cardId,
    apply: (state, _seat, payload) => {
      const decision = getZhuRevealDecision(state), source = decision.source;
      const { zhuGuard: _guard, zhuDecision: _decision, drawerIdx: _drawer, ...context } = state.abilityData;
      const reserved = state._authorityDraw;
      const flags = reserved?.flags || {
        ...(source === ZHU_REVEAL_SOURCE.TSG_SLIME ? { fromTsathogguaSlime: true, continueTurnStartDraw: true,
          _turnOwner: decision.continuation?.turnOwner ?? decision.drawerIdx } : {}),
        ...(source === ZHU_REVEAL_SOURCE.CTH_REST ? { fromRest: true,
          cthDrawsRemaining: Math.max(0, (decision.continuation?.remaining ?? context.cthDrawsRemaining ?? 1) - 1) } : {}),
        ...(source === ZHU_REVEAL_SOURCE.PROLIFERATING_Z ? { fromProliferatingZ: true } : {}),
      };
      const next = drawAuthorityCard({ ...state, phase: 'ACTION', abilityData: context,
        deck: payload.hide ? moveTopDeckCardToBottom(state.deck) : [...state.deck],
        zhuLight: removeZhuLightCard(state.zhuLight, state.deck[0]), _authorityDraw: null,
        _zhuBypassTopGuard: true }, decision.drawerIdx, flags, source);
      delete next._zhuBypassTopGuard;
      return next;
    } },
};
