import {
  EXPANSIONS,
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
} from '../../constants/card';

export const DEBUG_ZONE_CARD_KEYS = LETTERS.flatMap(letter => NUMS.map(number => `${letter}${number}`));

export function getExpansionZoneCards(expansionKey) {
  return DEBUG_ZONE_CARD_KEYS.flatMap(key => (FIXED_ZONE_CARD_VARIANTS_BY_KEY[key] || [])
    .filter(card => card.expansion === expansionKey)
    .map(card => ({ ...card, key })));
}

export function getPlayableExpansionKeys() {
  return Object.entries(EXPANSIONS)
    .filter(([key, expansion]) => {
      const expectedZoneCount = (expansion.zoneSlotCount || 16) * (expansion.zoneCardsPerSlot || 3);
      const expectedGodCount = (expansion.godCardKeys || []).length * (expansion.godCopies || 4);
      return getExpansionZoneCards(key).length === expectedZoneCount && expectedGodCount === 24;
    })
    .map(([key]) => key);
}

export function getDebugExpansionSelection(debugExpansionKey) {
  const playableExpansionKeys = getPlayableExpansionKeys();
  const selectedExpansionKey = playableExpansionKeys.includes(debugExpansionKey)
    ? debugExpansionKey
    : (playableExpansionKeys[0] || '地神的潜影');
  return { playableExpansionKeys, selectedExpansionKey };
}

export function getDebugCardSelection({
  selectedExpansionKey,
  debugForceZoneCardKey,
  debugForceZoneCardName,
  debugForceGodCardKey,
}) {
  const zoneCards = getExpansionZoneCards(selectedExpansionKey);
  const selectedZoneCard = zoneCards.find(card => card.key === debugForceZoneCardKey && card.name === debugForceZoneCardName)
    || zoneCards[0];
  const godKeys = EXPANSIONS[selectedExpansionKey]?.godCardKeys || [];
  const selectedGodKey = godKeys.includes(debugForceGodCardKey) ? debugForceGodCardKey : godKeys[0];
  return {
    zoneCards,
    selectedZoneKey: selectedZoneCard?.key || debugForceZoneCardKey,
    selectedZoneName: selectedZoneCard?.name || debugForceZoneCardName,
    godKeys,
    selectedGodKey,
  };
}

export function encodeDebugZoneCardValue(card) {
  return `zone:${card.key}:${card.name}`;
}

export function encodeDebugGodCardValue(godKey) {
  return `god:${godKey}`;
}

export function decodeDebugCardValue(value) {
  const [kind, key, ...nameParts] = value.split(':');
  return {
    kind,
    key,
    name: nameParts.join(':'),
  };
}

export function getFirstZoneCardForSlot(zoneCards, keyPrefix) {
  return zoneCards.find(card => card.key === keyPrefix)
    || zoneCards.find(card => card.key?.startsWith?.(keyPrefix))
    || null;
}

export function getExpansionDefaults(expansionKey) {
  const zoneCards = getExpansionZoneCards(expansionKey);
  return {
    zoneCard: zoneCards[0] || null,
    godKey: EXPANSIONS[expansionKey]?.godCardKeys?.[0] || null,
  };
}
