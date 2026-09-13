import { chooseAiAction, createAiObservationState } from './aiPolicy';
import { appendPublicCardGainTriggers } from './cardGainEvents';
import { isZoneCard } from './coreUtils';

// These effects grant cards without resolving their printed draw effects.
// Callers can extend the gain transition for a separate cost (stone-carving SAN).
export function simulateAiPublicCardGain(state, actorIdx, cards) {
  const gainedCards = Array.isArray(cards) ? cards : [cards];
  state.players[actorIdx].hand.push(...gainedCards.filter(Boolean));
  Object.assign(state, appendPublicCardGainTriggers(
    state, state.players, actorIdx, gainedCards,
  ));
  return state;
}

export function chooseAiPublicCardIndex({
  state,
  actorIdx,
  cards = [],
  simulateGain,
}) {
  if (!state?.players?.[actorIdx] || !cards.length) return -1;
  const observation = createAiObservationState(state, actorIdx);
  const action = chooseAiAction({
    state: observation,
    actorIdx,
    actions: cards.map((card, cardIndex) => ({ card, cardIndex })),
    simulate: (snapshot, candidate) => simulateGain
      ? simulateGain(snapshot, candidate)
      : simulateAiPublicCardGain(snapshot, actorIdx, candidate.card),
    allowTreasureDeclaration: true,
  });
  return action?.cardIndex ?? -1;
}

export function getTortoiseSelectableKeys(hand = []) {
  const letters = new Map();
  const numbers = new Map();
  hand.filter(isZoneCard).forEach(card => {
    const letter = card.letter || card.key?.match(/[A-Z]/)?.[0];
    const number = card.number ?? card.key?.match(/\d/)?.[0];
    if (letter) letters.set(letter, (letters.get(letter) || 0) + 1);
    if (number != null) {
      const key = String(number);
      numbers.set(key, (numbers.get(key) || 0) + 1);
    }
  });
  const mostFrequent = counts => {
    const maximum = Math.max(0, ...counts.values());
    return [...counts].filter(([, count]) => count === maximum).map(([key]) => key);
  };
  return [...mostFrequent(letters), ...mostFrequent(numbers)];
}

export function matchesTortoiseKey(card, key) {
  if (!isZoneCard(card)) return false;
  return /^[A-Z]$/.test(key)
    ? card.letter === key
    : /^\d$/.test(key) && String(card.number) === String(key);
}

export function chooseAiTortoiseKey({
  state,
  actorIdx,
  revealedCards = [],
  selectableKeys = getTortoiseSelectableKeys(state?.players?.[actorIdx]?.hand),
}) {
  if (!state?.players?.[actorIdx]) return null;
  const actions = [...new Set(selectableKeys.map(String))]
    .filter(key => /^[A-Z]$|^\d$/.test(key))
    .map(key => ({ key }));
  return chooseAiAction({
    state: createAiObservationState(state, actorIdx),
    actorIdx,
    actions,
    simulate: (snapshot, { key }) => {
      const matched = revealedCards.filter(card => matchesTortoiseKey(card, key));
      const remaining = revealedCards.filter(card => !matchesTortoiseKey(card, key));
      snapshot.discard = [...(snapshot.discard || []), ...remaining];
      return simulateAiPublicCardGain(snapshot, actorIdx, matched);
    },
    allowTreasureDeclaration: true,
  })?.key ?? null;
}
