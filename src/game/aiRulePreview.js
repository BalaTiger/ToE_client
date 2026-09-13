import { applyFx, submitLossEvents } from './effectEngine';
import { advanceGodEncounter } from './balancePatches';
import { isRevealedCultist, isTsathogguaSlime } from './coreUtils';
import { chooseAiSameAbyssAction, simulateAiDiscardAction } from './aiDiscardChoices';
import { getActiveDamageLinksForPlayer } from './damageLinks';
import { hasGodPowerImmunity } from './godPowerImmunity';

// These handlers have no private-card lookup or automatic AI subdecision.
// New complex handlers must supply a decision adapter before claiming that a
// one-step preview is the fully settled result of acquiring the card.
const DIRECT_ZONE_EFFECTS = new Set([
  'blankZone', 'selfHealHP', 'selfHealSAN', 'lifeBalance', 'soulBalance',
  'blindFish', 'proliferatingZ', 'petrifyingFormula', 'allHealHP',
  'selfHealBoth', 'selfHealHPSAN', 'selfHealBoth21', 'selfHealAdjDamageHP',
  'selfHealAdjHealHP', 'adjHealHP', 'selfRevealHandHP', 'selfRevealHandSAN',
  'globalOnlySwap', 'endTurnReplayHand', 'etherealize', 'deadNeighborSkipDraw',
  'selfDamageHP', 'selfDamageSAN', 'selfDamageHPCond', 'selfDamageSANCond',
  'selfDamageHPSAN', 'selfDamageRestHP', 'selfDamageRestSAN',
  'adjDamageHP', 'adjDamageSAN', 'adjDamageBoth', 'allDamageHP',
  'allDamageSAN', 'allDamageBoth', 'adjRest', 'selfHealHPSelfDamageSAN',
  'selfDamageAdjDamageHP', 'selfDamageAdjDamageBoth', 'allHealHPDamageSAN',
  'selfBerserk', 'reverseTurnOrder', 'sameAbyssChoice',
]);

function incomplete(state, reason) {
  return {
    ...state,
    _aiPreviewIncomplete: true,
    _aiPendingResolution: reason,
  };
}

function inspectRuleResult(before, result) {
  const next = {
    ...before,
    ...(result.statePatch || {}),
    players: result.P,
    deck: result.D,
    discard: result.Disc,
    log: [...(before.log || []), ...(result.msgs || [])],
  };
  if (next.players.some(player => player?._pendingDamageLinkBreak)) {
    return incomplete(next, 'damageLinkReaction');
  }
  if ((before._aiUnknownDeck || before.deckCount > before.deck.length) && (
    next._visualEvents?.some(event => event.type === 'vritraImmortalReveal')
    || next._statEvents?.some(event => event.vritraImmortalReveal)
    || next.players.some(player => player?._vritraImmortalReveal)
    // A 1 -> 0 -> 1 revival may have no net HP stat event to own the reveal.
    || result.msgs?.some(message => message.includes('【不灭之躯】'))
  )) return incomplete(next, 'unknownImmortalReveal');
  if (next.abilityData?.type === 'sameAbyssChoice') {
    const { actorIdx, targetIdx, discardCount } = next.abilityData;
    const target = next.players[targetIdx];
    const canReactToHp = (target?.etherealizeStacks || 0) > 0
      || (target?.hand || []).some(isTsathogguaSlime)
      || target?.godName === 'VRI'
      || getActiveDamageLinksForPlayer(next.players, targetIdx).length > 0;
    const freeOpponentDiscard = discardCount === 0 && !canReactToHp;
    if (targetIdx === before._aiObserverIdx || freeOpponentDiscard) {
      const action = freeOpponentDiscard ? { type: 'discard', cardIds: [], cardIndices: [], sameAbyss: true }
        : chooseAiSameAbyssAction(next, targetIdx, actorIdx, { incomingCardCount: 0 });
      if (action) {
        next.abilityData = {};
        return simulateAiDiscardAction(next, targetIdx, action);
      }
    }
    return incomplete(next, 'sameAbyssChoice');
  }
  if (next.abilityData?.type || next.damageLinkTargets?.length) {
    return incomplete(next, next.abilityData?.type || 'damageLink');
  }
  // The inspection pile is sampled public rule content, never the actual
  // private order. A sampled inspection cannot establish a certain winner.
  if ((next._inspectionSeq || 0) !== (before._inspectionSeq || 0)) {
    return incomplete(next, 'sampledInspection');
  }
  return next;
}

function previewGodEncounter(state, card, receiverIdx) {
  const receiver = state.players[receiverIdx];
  const encounter = advanceGodEncounter(receiver, state);
  if (encounter.sanLoss > 0 && !isRevealedCultist(receiver)) {
    const result = submitLossEvents({
      players: state.players, deck: state.deck, discard: state.discard,
      log: state.log, currentTurn: state.currentTurn,
      events: [{ targetIdx: receiverIdx, lostSan: encounter.sanLoss, source: '邪神遭遇' }],
    });
    if (result.abilityData) {
      return incomplete({ ...state, abilityData: result.abilityData }, result.abilityData.type);
    }
  }
  // Faith replacement, inspections and on-worship powers have further
  // settlement stages. Keep them explicit until their adapters are migrated;
  // adding encounter and conversion costs would miss interruption/death.
  return incomplete(state, receiver.san > 0 && receiver.san <= 6
    ? 'godEncounterInspection' : `forcedGodFaith:${card.godKey}`);
}

/**
 * Preview one public/known acquisition on an observation state. The caller
 * chooses the action; this function only applies the actual rule handlers.
 * Call from rankAiActions or runAiPreview to isolate rule event IDs and RNG.
 * A rejected drawn card never enters the hand and has no discard side effect.
 */
export function previewAiZoneAcquisition(observation, {
  card, receiverIdx, giverIdx = null, keep = true,
  avoidNegative = false, avoidNegativeFor = [],
} = {}) {
  const state = structuredClone(observation);
  state.deck ||= [];
  state.discard ||= [];
  state.log = [];
  state.abilityData = {};
  state._visualEvents = [];
  state._statEvents = [];
  state._aiPreview = true;
  const receiver = state.players?.[receiverIdx];
  if (!receiver || receiver.isDead || !card) return state;
  const incoming = structuredClone(card);
  if (!keep) {
    state.discard.push(incoming);
    return state;
  }
  if (giverIdx != null) {
    const giver = state.players[giverIdx];
    const cardIndex = giver?.hand?.findIndex(held => held.id === incoming.id) ?? -1;
    if (cardIndex < 0 || giverIdx === receiverIdx) return incomplete(state, 'invalidGift');
    if (state.apophisNight?.active && state.apophisNight.threshold > 0
      && !hasGodPowerImmunity(giver)
      && state.players.some((player, idx) => idx !== giverIdx && idx !== receiverIdx && !player.isDead)) {
      // Target randomization and its SAN loss happen before the gift. The
      // selected recipient alone cannot establish the result of that action.
      return incomplete(state, 'apophisGiftTarget');
    }
    giver.hand.splice(cardIndex, 1);
    giver.roleRevealed = true;
  }
  if (incoming.isGod) return previewGodEncounter(state, incoming, receiverIdx);
  receiver.hand.push(incoming);
  if (!DIRECT_ZONE_EFFECTS.has(incoming.type)) return incomplete(state, `zoneEffect:${incoming.type}`);
  const result = applyFx(
    incoming, receiverIdx, giverIdx == null ? null : receiverIdx,
    state.players, state.deck, state.discard, state,
    avoidNegative, avoidNegativeFor, false,
  );
  return inspectRuleResult(state, result);
}
