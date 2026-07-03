import {
  EXPANSIONS,
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
} from '../../constants/card';
import {
  DEFAULT_EXPANSION_KEY,
  EXPANSION_RANDOM_KEY,
  STARS_CALL_KEY,
  TEMPORARY_STARS_CALL_KEY,
} from '../../game/setup';

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

export function getDebugExpansionOptions() {
  const playableExpansionKeys = getPlayableExpansionKeys();
  const options = [
    {
      key: EXPANSION_RANDOM_KEY,
      label: '随机主题',
      deckExpansionKey: DEFAULT_EXPANSION_KEY,
      temporaryStarsCall: false,
    },
    ...playableExpansionKeys.map(key => ({
      key,
      label: EXPANSIONS[key]?.name || key,
      deckExpansionKey: key,
      temporaryStarsCall: false,
    })),
  ];
  if (EXPANSIONS[STARS_CALL_KEY] && playableExpansionKeys.includes(DEFAULT_EXPANSION_KEY)) {
    options.push({
      key: TEMPORARY_STARS_CALL_KEY,
      label: `${EXPANSIONS[STARS_CALL_KEY]?.name || STARS_CALL_KEY}（临时）`,
      deckExpansionKey: DEFAULT_EXPANSION_KEY,
      temporaryStarsCall: true,
    });
  }
  return options;
}

export function getDebugExpansionSelection(debugExpansionKey) {
  const expansionOptions = getDebugExpansionOptions();
  const playableExpansionKeys = expansionOptions.map(option => option.key);
  const selectedOption = expansionOptions.find(option => option.key === debugExpansionKey)
    || expansionOptions.find(option => option.key === DEFAULT_EXPANSION_KEY)
    || expansionOptions[0];
  const selectedExpansionKey = selectedOption?.key || DEFAULT_EXPANSION_KEY;
  const selectedDeckExpansionKey = selectedOption?.deckExpansionKey || (
    playableExpansionKeys.includes(debugExpansionKey)
    ? debugExpansionKey
    : DEFAULT_EXPANSION_KEY
  );
  return { expansionOptions, playableExpansionKeys, selectedExpansionKey, selectedDeckExpansionKey, selectedOption };
}

export function getDebugGodKeysForSelection(selectedExpansionKey, selectedDeckExpansionKey) {
  const deckGodKeys = EXPANSIONS[selectedDeckExpansionKey]?.godCardKeys || [];
  if (selectedExpansionKey === TEMPORARY_STARS_CALL_KEY) {
    return [...new Set([...deckGodKeys, 'CTH'])];
  }
  return deckGodKeys;
}

export function getDebugCardSelection({
  selectedExpansionKey,
  selectedDeckExpansionKey,
  debugForceZoneCardKey,
  debugForceZoneCardName,
  debugForceGodCardKey,
}) {
  const deckExpansionKey = selectedDeckExpansionKey || selectedExpansionKey;
  const zoneCards = getExpansionZoneCards(deckExpansionKey);
  const selectedZoneCard = zoneCards.find(card => card.key === debugForceZoneCardKey && card.name === debugForceZoneCardName)
    || zoneCards[0];
  const godKeys = getDebugGodKeysForSelection(selectedExpansionKey, deckExpansionKey);
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
  const { selectedExpansionKey, selectedDeckExpansionKey } = getDebugExpansionSelection(expansionKey);
  const zoneCards = getExpansionZoneCards(selectedDeckExpansionKey);
  return {
    zoneCard: zoneCards[0] || null,
    godKey: getDebugGodKeysForSelection(selectedExpansionKey, selectedDeckExpansionKey)?.[0] || null,
  };
}
