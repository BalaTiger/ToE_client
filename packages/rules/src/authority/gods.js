import { copyPlayers } from '../game/coreUtils.js';
import { resolveGodEncounter } from '../game/turnEngine.js';
import { deriveEffectDecisionState } from '../game/effectStatePatch.js';
import { advanceEndTurnReplayPatch } from '../game/endTurnReplayFlow.js';
import { buildTargetContinuationAbilityData } from '../game/targetContinuation.js';
import { GOD_DEFS } from '../constants/card.js';
import { drawAuthorityCard } from './automatic.js';
const chooser = state => state.abilityData.drawerIdx ?? state.currentTurn;
export function legalGodChoices(state, seat, card = state.abilityData.godCard) {
  const player = state.players[seat];
  if (!card?.isGod || !GOD_DEFS[card.godKey] || !player || player.isDead) return [];
  const same = player.godName === card.godKey;
  if (state.abilityData.forcedConvert) return same && player.godLevel >= 3 ? ['discard'] : ['accept'];
  return [same ? (player.godLevel < 3 ? 'upgrade' : null) : 'worship',
    !same && (player._nyaBorrow || player.role) === '邪祀者' ? 'keepHand' : null, 'discard'].filter(Boolean);
}
export function resolveGodIntent(state, seat, card, choice, { fromHand = false } = {}) {
  const players = copyPlayers(state.players), fromReplay = !!state.abilityData.fromEndTurnReplay;
  if (fromHand || fromReplay) {
    const index = players[seat].hand.findIndex(held => held.id === card.id);
    if (index < 0) throw new Error('Missing held god card');
    players[seat].hand.splice(index, 1);
  }
  const forced = !!state.abilityData.forcedConvert;
  const action = choice === 'keepHand' ? 'hand' : choice === 'accept' ? (players[seat].godName === card.godKey ? 'upgrade' : 'worship')
    : choice === 'worship' && players[seat].godName && players[seat].godName !== card.godKey ? 'convert' : choice;
  const result = resolveGodEncounter(seat, card, players, [...state.deck], [...state.discard], state, forced,
    { explicitAction: action, deferShuTarget: true, fromEndTurnReplay: fromReplay || fromHand });
  const { godCard: _done, drawerIdx: _drawer, godEncounterCost: _cost, forcedConvert: _forced, ...remaining } = state.abilityData;
  const meta = { ...result.inspectionMeta, ...result.statePatch };
  // Reaction data must take priority over the deferred god-power metadata.
  const secondary = ['tsgSlimeBalance', 'etherealizeRedirect'].includes(result.inspectionMeta?.abilityData?.type);
  if (secondary) meta.abilityData = result.inspectionMeta.abilityData;
  const decision = deriveEffectDecisionState(meta, { baseAbilityData: buildTargetContinuationAbilityData(remaining), fallbackPhase: 'ACTION' });
  return { ...state, ...meta, players: result.P, deck: result.D, discard: result.Disc,
    // The pending field and nested frame can describe the same physical
    // encounter. Settling it consumes those aliases, not another future choice.
    _decisionContinuations: (state._decisionContinuations || []).filter(frame => !(frame.phase === 'GOD_CHOICE'
      && frame.abilityData?.godCard?.id === card.id
      && (frame.abilityData.drawerIdx ?? state.currentTurn) === seat)),
    log: [...state.log, ...result.msgs], phase: decision.phase, abilityData: decision.abilityData,
    drawReveal: null, godTriggeredThisTurn: ['worship', 'accept'].includes(choice),
    ...(fromReplay ? advanceEndTurnReplayPatch(state) : {}),
    ...(fromHand ? { godFromHandUsed: true } : {}),
  };
}
export const godActions = {
  'nya.borrow': { phases: ['NYA_BORROW'], payloadKeys: ['targetSeat'],
    authorize: (state, seat) => state.currentTurn === seat,
    available: (state, seat) => state.currentTurn === seat,
    describe: (state, seat) => ({ allowSkip: true, targetSeats: state.players.flatMap((player, index) => index !== seat && player.isDead ? [index] : []) }),
    validate: (state, seat, payload) => payload.targetSeat === null || Number.isInteger(payload.targetSeat)
      && payload.targetSeat !== seat && !!state.players[payload.targetSeat]?.isDead,
    apply: (state, seat, payload) => {
      const players = copyPlayers(state.players);
      if (payload.targetSeat !== null) {
        const level = players[seat].godLevel || 1;
        players[seat]._nyaBorrow = players[payload.targetSeat].role;
        players[seat]._nyaHandLimit = 4 - GOD_DEFS.NYA.levels[level - 1].handPenalty;
      }
      return drawAuthorityCard({ ...state, players, phase: 'ACTION', abilityData: {} }, seat);
    } },
  'god.choose': { phases: ['GOD_CHOICE'], payloadKeys: ['choice'],
    authorize: (state, seat) => chooser(state) === seat,
    available: (state, seat) => chooser(state) === seat,
    describe: (state, seat) => ({ choices: legalGodChoices(state, seat) }),
    validate: (state, seat, payload) => legalGodChoices(state, seat).includes(payload.choice),
    apply: (state, seat, payload) => resolveGodIntent(state, seat, state.abilityData.godCard, payload.choice) },
  'god.useHand': { phases: ['ACTION'], payloadKeys: ['cardIndex'],
    authorize: (state, seat) => state.currentTurn === seat,
    available: (state, seat) => state.currentTurn === seat && state.players[seat].hand.some(card => card.isGod
      && (state.players[seat].godName !== card.godKey || state.players[seat].godLevel < 3)),
    describe: (state, seat) => ({ cardIndices: state.players[seat].hand.flatMap((card, index) => card.isGod
      && (state.players[seat].godName !== card.godKey || state.players[seat].godLevel < 3) ? [index] : []) }),
    validate: (state, seat, payload) => Number.isInteger(payload.cardIndex) && !!state.players[seat].hand[payload.cardIndex]?.isGod
      && (state.players[seat].godName !== state.players[seat].hand[payload.cardIndex].godKey || state.players[seat].godLevel < 3),
    apply: (state, seat, payload) => {
      const card = state.players[seat].hand[payload.cardIndex];
      return resolveGodIntent(state, seat, card, state.players[seat].godName === card.godKey ? 'upgrade' : 'worship', { fromHand: true });
    } },
};
