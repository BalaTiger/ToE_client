import {
  cardLogText,
  compareCaveDuelCards,
  copyPlayers,
} from './coreUtils';
import { appendPublicCardGainTriggers } from './cardGainEvents';
import { buildTargetContinuationState } from './targetContinuation';
import {
  chooseAiAction,
  createAiObservationState,
  evaluateAiState,
  rankAiActions,
} from './aiPolicy';

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

export function getBestCaveDuelCardIndex(hand = [], context = {}) {
  if (!hand.length) return -1;
  const hasOpponent = context.state?.players?.[context.opponentIdx];
  const actorIdx = hasOpponent ? context.actorIdx : 0;
  const opponentIdx = hasOpponent ? context.opponentIdx : 1;
  const baseState = hasOpponent ? context.state : {
    players: [
      { name: 'AI', hand, hp: 10, san: 10, role: null, godZone: [] },
      { name: '?', hand: [{ id: 'unknown-duel', _aiUnknown: true }], hp: 10, san: 10, role: null, godZone: [] },
    ],
    deck: [], discard: [], log: [], currentTurn: 0,
  };
  const observation = createAiObservationState(baseState, actorIdx);
  observation.players[actorIdx].hand = [...hand];
  const opponentHand = observation.players[opponentIdx].hand;
  const knownResponses = opponentHand.flatMap((card, cardIndex) => (
    card && !card._aiUnknown ? [{ card, cardIndex, weight: 1 }] : []
  ));
  const unknownIndices = opponentHand.flatMap((card, index) => (
    !card || card._aiUnknown ? [index] : []
  ));
  // Unknown cards use a fixed, deck-independent prior. A sealed choice is never
  // read from abilityData, even after the other participant has selected it.
  const blindResponses = unknownIndices.length ? [1, 2, 3, 4, null].map(number => ({
    card: { id: `duel-prior-${number}`, ...(number != null ? { number } : {}) },
    cardIndex: unknownIndices[0],
    weight: unknownIndices.length / 5,
  })) : [];
  const responses = [...knownResponses, ...blindResponses];
  if (!responses.length) return 0;
  const actions = hand.map((card, cardIndex) => ({
    card,
    cardIndex,
    expectedComparison: responses.reduce((sum, response) => (
      sum + compareCaveDuelCards(card, response.card) * response.weight
    ), 0) / responses.reduce((sum, response) => sum + response.weight, 0),
  }));
  return chooseAiAction({
    state: observation,
    actorIdx,
    actions,
    simulate: (snapshot, candidate) => {
      // Resolve every legal visible reply through the real transfer rules.
      // Use the least favorable reply for public information, and retain that
      // safety check while ranking the blind prior by expected comparison.
      const replies = rankAiActions({
        state: snapshot,
        actorIdx,
        actions: responses,
        allowTreasureDeclaration: true,
        simulate: (replyState, response) => {
          replyState.players[opponentIdx].hand[response.cardIndex] = response.card;
          return resolveCaveDuelState(
            replyState.players, actorIdx, opponentIdx,
            candidate.cardIndex, response.cardIndex,
            candidate.card, response.card, replyState,
          ).nextGs;
        },
      });
      return replies.at(-1)?.outcome || snapshot;
    },
    ...(unknownIndices.length ? {
      evaluate: (outcome, candidate) => [
        candidate.expectedComparison,
        ...evaluateAiState(outcome, actorIdx, { allowTreasureDeclaration: true }).slice(2),
      ],
    } : {}),
    allowTreasureDeclaration: true,
  })?.cardIndex ?? 0;
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
