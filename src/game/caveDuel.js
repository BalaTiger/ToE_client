import {
  cardLogText,
  compareCaveDuelCards,
  copyPlayers,
} from './coreUtils';
import { appendPublicCardGainTriggers } from './cardGainEvents';
import { buildTargetContinuationState } from './targetContinuation';

export function resolveHandCardSelection(
  player,
  cardIndex,
  selectedCard = null
) {
  const hand = player?.hand || [];
  if (selectedCard?.id != null) {
    const byId = hand.findIndex(card => card?.id === selectedCard.id);
    if (byId >= 0) return { index: byId, card: hand[byId] };
  }
  return { index: cardIndex, card: hand[cardIndex] };
}

export function caveDuelBlindChoiceScore(card) {
  return Number.isFinite(card?.number) ? card.number : 3.5;
}

export function getBestCaveDuelCardIndex(hand = []) {
  if (!hand.length) return -1;
  return hand.reduce((bestIdx, card, index) => (
    caveDuelBlindChoiceScore(card)
      > caveDuelBlindChoiceScore(hand[bestIdx])
      ? index
      : bestIdx
  ), 0);
}

function removeSelectedHandCard(player, cardIndex, selectedCard) {
  const { index } = resolveHandCardSelection(
    player,
    cardIndex,
    selectedCard
  );
  if (index < 0 || index >= (player?.hand || []).length) return null;
  const [removed] = player.hand.splice(index, 1);
  return removed || null;
}

export function resolveCaveDuelOutcome({
  players,
  sourceIdx,
  targetIdx,
  sourceCardIndex,
  targetCardIndex,
  sourceCard,
  targetCard,
}) {
  const nextPlayers = copyPlayers(players);
  const sourcePlayer = nextPlayers[sourceIdx];
  const targetPlayer = nextPlayers[targetIdx];
  const resolvedSource = resolveHandCardSelection(
    sourcePlayer,
    sourceCardIndex,
    sourceCard
  );
  const resolvedTarget = resolveHandCardSelection(
    targetPlayer,
    targetCardIndex,
    targetCard
  );
  const actualSourceCard = resolvedSource.card || sourceCard;
  const actualTargetCard = resolvedTarget.card || targetCard;
  const duelCompare = compareCaveDuelCards(
    actualSourceCard,
    actualTargetCard
  );
  const sourceCardText = cardLogText(actualSourceCard, {
    alwaysShowName: true,
  });
  const targetCardText = cardLogText(actualTargetCard, {
    alwaysShowName: true,
  });

  if (duelCompare > 0) {
    const removedSource = removeSelectedHandCard(
      sourcePlayer,
      resolvedSource.index,
      actualSourceCard
    );
    const removedTarget = removeSelectedHandCard(
      targetPlayer,
      resolvedTarget.index,
      actualTargetCard
    );
    sourcePlayer.hand.push(removedSource, removedTarget);
    return {
      players: nextPlayers,
      duelCompare,
      winnerIdx: sourceIdx,
      gainedCard: removedTarget,
      sourceCard: removedSource,
      targetCard: removedTarget,
      logLine: `【穴居人战争】${sourcePlayer.name} 亮出 ${sourceCardText}，${targetPlayer.name} 亮出 ${targetCardText}，${sourcePlayer.name} 胜出，收下两张牌`,
    };
  }

  if (duelCompare < 0) {
    const removedSource = removeSelectedHandCard(
      sourcePlayer,
      resolvedSource.index,
      actualSourceCard
    );
    const removedTarget = removeSelectedHandCard(
      targetPlayer,
      resolvedTarget.index,
      actualTargetCard
    );
    targetPlayer.hand.push(removedSource, removedTarget);
    return {
      players: nextPlayers,
      duelCompare,
      winnerIdx: targetIdx,
      gainedCard: removedSource,
      sourceCard: removedSource,
      targetCard: removedTarget,
      logLine: `【穴居人战争】${sourcePlayer.name} 亮出 ${sourceCardText}，${targetPlayer.name} 亮出 ${targetCardText}，${targetPlayer.name} 胜出，收下两张牌`,
    };
  }

  return {
    players: nextPlayers,
    duelCompare,
    winnerIdx: null,
    gainedCard: null,
    sourceCard: actualSourceCard,
    targetCard: actualTargetCard,
    logLine: `【穴居人战争】${sourcePlayer.name} 亮出 ${sourceCardText}，${targetPlayer.name} 亮出 ${targetCardText}，平局，各自收回自己的牌`,
  };
}

export function resolveCaveDuelState(
  players,
  sourceIdx,
  targetIdx,
  sourceCardIndex,
  targetCardIndex,
  sourceCard,
  targetCard,
  state,
) {
  const outcome = resolveCaveDuelOutcome({
    players,
    sourceIdx,
    targetIdx,
    sourceCardIndex,
    targetCardIndex,
    sourceCard,
    targetCard,
  });
  const nextPlayers = outcome.players;
  const log = [...state.log, outcome.logLine];
  let proliferatingZPatch = {};
  if (outcome.duelCompare > 0) {
    proliferatingZPatch = appendPublicCardGainTriggers(state, nextPlayers, sourceIdx, outcome.gainedCard);
  } else if (outcome.duelCompare < 0) {
    proliferatingZPatch = appendPublicCardGainTriggers(state, nextPlayers, targetIdx, outcome.gainedCard);
  }
  const nextGs = {
    ...buildTargetContinuationState({
      baseState: state,
      players: nextPlayers,
      deck: state.deck,
      discard: state.discard,
      log,
      abilityData: state.abilityData,
      extraPatch: proliferatingZPatch,
    }),
    ...(Object.prototype.hasOwnProperty.call(state, 'apophisNight') ? { apophisNight: state.apophisNight } : {}),
    ...(state._statEvents ? { _statEvents: state._statEvents, _statEventSeq: state._statEventSeq } : {}),
  };
  return { nextGs, duelCompare: outcome.duelCompare, L: log };
}
