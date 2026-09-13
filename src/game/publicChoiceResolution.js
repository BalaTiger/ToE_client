import { chooseAiPublicCardIndex, chooseAiTortoiseKey, matchesTortoiseKey, simulateAiPublicCardGain } from './aiPublicChoices';
import { chooseAiStoneCardIndex } from './aiStoneChoice';
import { getBestCaveDuelCardIndex, resolveCaveDuelState } from './caveDuel';
import { cardLogText, makeInspectionMeta } from './coreUtils';
import { deriveEffectDecisionState } from './effectStatePatch';
import { applySanLossToPlayerWithInspection } from './turnEngine';
import { checkWin } from './victory';
import { buildTargetContinuationAbilityData, buildTargetContinuationState } from './targetContinuation';

function finishChoice(state, abilityData, extraPatch = {}) {
  const turnOwner = abilityData._turnOwner ?? state.currentTurn;
  const next = buildTargetContinuationState({
    baseState: state, turnOwner, abilityData, extraPatch,
  });
  if (state._headless && next.phase === 'ACTION') next.phase = 'AI_TURN';
  const win = checkWin(next.players, next._isMP);
  return win ? { ...next, gameOver: win } : next;
}

// Shared non-visual transitions for headless play and disconnected seats.
// Decisions use the same policy as the visible UI, then execute real rules.
export function resolveAiPublicChoiceState(state) {
  const next = structuredClone(state);
  const ad = next.abilityData || {};
  const revealed = ad.revealedCards || [];
  if (next.phase === 'FIRST_COME_PICK_SELECT') {
    const pickIndex = ad.pickIndex || 0;
    const actorIdx = ad.pickOrder?.[pickIndex];
    if (actorIdx == null || !revealed.length) return finishChoice(next, ad);
    const chosenIndex = chooseAiPublicCardIndex({ state: next, actorIdx, cards: revealed });
    const [card] = revealed.splice(chosenIndex, 1);
    simulateAiPublicCardGain(next, actorIdx, card);
    next.log.push(`【先到先得】${next.players[actorIdx].name} 选择了 ${cardLogText(card, { alwaysShowName: true })}`);
    const win = checkWin(next.players, next._isMP);
    if (win) return { ...next, gameOver: win };
    if (pickIndex + 1 >= ad.pickOrder.length || !revealed.length) return finishChoice(next, ad);
    return { ...next, abilityData: { ...ad, revealedCards: revealed, pickIndex: pickIndex + 1 } };
  }
  if (next.phase === 'TORTOISE_ORACLE_SELECT') {
    const actorIdx = ad.playerIndex ?? next.currentTurn;
    const key = chooseAiTortoiseKey({ state: next, actorIdx, revealedCards: revealed, selectableKeys: ad.selectableKeys });
    if (key == null) return finishChoice(next, ad);
    const matched = revealed.filter(card => matchesTortoiseKey(card, key));
    simulateAiPublicCardGain(next, actorIdx, matched);
    next.discard.push(...revealed.filter(card => !matchesTortoiseKey(card, key)));
    next.log.push(`【灵龟卜祝】${next.players[actorIdx].name} 选择编号 ${key}，收入 ${matched.length} 张牌`);
    return finishChoice(next, ad);
  }
  if (next.phase === 'DECIPHER_STONE_CARVING') {
    const actorIdx = ad.playerIndex ?? next.currentTurn;
    if (!revealed.length) return finishChoice(next, ad);
    const chosenIndex = chooseAiStoneCardIndex({ state: next, actorIdx, cards: revealed });
    const [card] = revealed.splice(chosenIndex, 1);
    simulateAiPublicCardGain(next, actorIdx, card);
    next.log.push(`【解读石刻】${next.players[actorIdx].name} 选择将 ${cardLogText(card, { alwaysShowName: true })} 收入手牌`);
    let inspectionPatch = {};
    if (card.isGod) {
      next.log.push(`【解读石刻】${next.players[actorIdx].name} 因选择邪神牌失去 1 SAN`);
      const result = applySanLossToPlayerWithInspection(
        actorIdx, 1, next.currentTurn ?? actorIdx,
        next.players, next.deck, next.discard, next.log, makeInspectionMeta(next), '解读石刻',
      );
      next.players = result.P; next.deck = result.D; next.discard = result.Disc; next.log = result.L;
      inspectionPatch = result.inspectionMeta;
    }
    next.deck.unshift(...revealed);
    if (revealed.length) next.log.push(`【解读石刻】${revealed.length} 张牌放回牌堆顶`);
    const decision = deriveEffectDecisionState(inspectionPatch, {
      baseAbilityData: buildTargetContinuationAbilityData(ad),
      fallbackPhase: next._headless ? 'AI_TURN' : 'ACTION', turnOwner: ad._turnOwner ?? next.currentTurn,
    });
    // A cost reaction must finish before a queued outer decision is resumed.
    // Calling buildTargetContinuationState here would consume that frame early.
    if (decision.hasDecision) {
      return { ...next, ...inspectionPatch, phase: decision.phase, abilityData: decision.abilityData,
        drawReveal: null, selectedCard: null };
    }
    return { ...finishChoice(next, ad, inspectionPatch), drawReveal: null, selectedCard: null };
  }
  if (['CAVE_DUEL_SELECT_CARD', 'CAVE_DUEL_WAIT_REVEAL'].includes(next.phase)) {
    for (const [side, actorIdx, opponentIdx] of [
      ['source', ad.caveDuelSource, ad.caveDuelTarget],
      ['target', ad.caveDuelTarget, ad.caveDuelSource],
    ]) {
      if (ad[`${side}Card`]) continue;
      const hand = next.players[actorIdx]?.hand || [];
      const index = getBestCaveDuelCardIndex(hand, { state: next, actorIdx, opponentIdx });
      if (index < 0) return finishChoice(next, ad);
      ad[`${side}CardIndex`] = index;
      ad[`${side}Card`] = hand[index];
    }
    const result = resolveCaveDuelState(next.players, ad.caveDuelSource, ad.caveDuelTarget,
      ad.sourceCardIndex, ad.targetCardIndex, ad.sourceCard, ad.targetCard, next).nextGs;
    if (state._headless && result.phase === 'ACTION') result.phase = 'AI_TURN';
    const win = checkWin(result.players, result._isMP);
    return win ? { ...result, gameOver: win } : result;
  }
  return null;
}
