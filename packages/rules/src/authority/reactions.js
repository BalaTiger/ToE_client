import { resolveHeadlessSlimeBalance, resolveHeadlessEtherealize } from '../game/headlessSimulator.js';
import { isTsathogguaSlime } from '../game/coreUtils.js';
import { shouldAiUseEtherealize, chooseAiEtherealizeRedirectTarget } from '../game/etherealize.js';

const owner = (state, seat) => state.abilityData?.targetIdx === seat;
const hasSlime = (state, seat) => state.players[seat].hand.some(isTsathogguaSlime);
const redirects = (state, seat) => (state.abilityData?.adjacentTargets || [])
  .filter(target => target !== seat && state.players[target] && !state.players[target].isDead);
const canRedirect = (state, seat) => state.players[seat].etherealizeStacks > 0 && redirects(state, seat).length > 0;

// These are human decisions, not AI substitutions. The existing shared pure
// settlement functions receive an explicit choice and preserve interruptions.
export const reactionActions = {
  'slime.answer': {
    phases: ['TSG_SLIME_BALANCE'], payloadKeys: ['use'], authorize: owner, available: owner,
    describe: (state, seat) => ({ choices: hasSlime(state, seat) ? [false, true] : [false],
      afterHp: state.abilityData.afterHp, afterSan: state.abilityData.afterSan }),
    validate: (state, seat, payload) => typeof payload.use === 'boolean' && (!payload.use || hasSlime(state, seat)),
    apply: (state, _seat, payload) => resolveHeadlessSlimeBalance(state, payload.use, { fallbackPhase: 'ACTION' }),
  },
  'etherealize.answer': {
    phases: ['ETHEREALIZE_DECISION'], payloadKeys: ['use'], authorize: owner, available: owner,
    describe: (state, seat) => ({ choices: canRedirect(state, seat) ? [false, true] : [false],
      lostHp: state.abilityData.lostHp, lostSan: state.abilityData.lostSan }),
    validate: (state, seat, payload) => typeof payload.use === 'boolean' && (!payload.use || canRedirect(state, seat)),
    apply: (state, _seat, payload) => payload.use ? { ...state, phase: 'ETHEREALIZE_SELECT_TARGET' }
      : resolveHeadlessEtherealize(state, { useEtherealize: false }, { fallbackPhase: 'ACTION' }),
  },
  'etherealize.redirect': {
    phases: ['ETHEREALIZE_SELECT_TARGET'], payloadKeys: ['targetSeat'], authorize: owner, available: owner,
    describe: (state, seat) => ({ targets: redirects(state, seat) }),
    validate: (state, seat, payload) => Number.isInteger(payload.targetSeat) && canRedirect(state, seat)
      && redirects(state, seat).includes(payload.targetSeat),
    apply: (state, _seat, payload) => resolveHeadlessEtherealize({ ...state, phase: 'ETHEREALIZE_DECISION' },
      { useEtherealize: true, redirectTargetIdx: payload.targetSeat }, { fallbackPhase: 'ACTION' }),
  },
};

export const reactionCoverage = Object.freeze({
  TSG_SLIME_BALANCE: ['slime.answer'],
  ETHEREALIZE_DECISION: ['etherealize.answer'],
  ETHEREALIZE_SELECT_TARGET: ['etherealize.redirect'],
});

export function chooseAiReactionIntent(view) {
  const action = view.decision.actions[0];
  if (!action) return null;
  if (action.type === 'slime.answer') return { type: action.type, payload: { use: false } };
  if (action.type === 'etherealize.answer') return { type: action.type, payload: {
    use: action.choices.includes(true) && shouldAiUseEtherealize({ player: view.players[view.viewerSeat],
      lostHp: action.lostHp || 0, lostSan: action.lostSan || 0 }),
  } };
  if (action.type === 'etherealize.redirect') return { type: action.type, payload: {
    targetSeat: chooseAiEtherealizeRedirectTarget(view.players, action.targets),
  } };
  return null;
}

export function reactionTimeoutIntent(state) {
  if (state.phase === 'TSG_SLIME_BALANCE') return { seat: state.abilityData.targetIdx, type: 'slime.answer', payload: { use: false } };
  if (state.phase === 'ETHEREALIZE_DECISION') return { seat: state.abilityData.targetIdx, type: 'etherealize.answer', payload: { use: false } };
  if (state.phase === 'ETHEREALIZE_SELECT_TARGET') return { seat: state.abilityData.targetIdx, type: 'etherealize.redirect', payload: {
    targetSeat: chooseAiEtherealizeRedirectTarget(state.players, state.abilityData.adjacentTargets),
  } };
  return null;
}
