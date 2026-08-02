export function cardIdentity(card) {
  if (!card || typeof card !== 'object') return null;
  return card.id
    || card.uid
    || [card.key, card.godKey, card.name, card.type].filter(Boolean).join(':')
    || null;
}
