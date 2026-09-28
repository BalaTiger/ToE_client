export function cardIdentity(card) {
  if (!card || typeof card !== 'object') return null;
  return card.id
    || card.uid
    || [card.key, card.godKey, card.name, card.type].filter(Boolean).join(':')
    || null;
}

export function sameCardIdentity(left, right) {
  if (!left || !right) return false;
  const leftStableId = left.id ?? left.uid;
  const rightStableId = right.id ?? right.uid;
  if (leftStableId != null || rightStableId != null) return leftStableId === rightStableId;
  return (left.key ?? left.name ?? left.letter) === (right.key ?? right.name ?? right.letter);
}
