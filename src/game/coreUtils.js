import {
  LETTERS,
  NUMS,
} from '../constants/card';

export const ROLE_TREASURE = '寻宝者';
export const ROLE_HUNTER = '追猎者';
export const ROLE_CULTIST = '邪祀者';

export const shuffle = (arr) => {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export const clamp = (value, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, value));

export const copyPlayers = (ps) => ps.map(p => ({
  ...p,
  hand: [...p.hand],
  godZone: [...(p.godZone || [])],
  zoneCards: [...(p.zoneCards || [])],
  peekMemories: Object.fromEntries(Object.entries(p.peekMemories || {}).map(([k, v]) => [k, [...(v || [])]])),
  disableRestNextTurn: !!p.disableRestNextTurn,
  disableSkillNextTurn: !!p.disableSkillNextTurn,
  handLimitDecreaseNextTurn: p.handLimitDecreaseNextTurn || 0
}));

export const isZoneCard = (card) => !!card?.isZone;

export const isBlankZoneCard = (card) => card?.type === 'blankZone';

export const getZoneCardPolarity = (card) => {
  if (!card) return null;
  if (card.polarity) return card.polarity;
  return 'neutral';
};

export const getZoneCardEffectScope = (card) => {
  if (!card) return null;
  if (card.effectScope) return card.effectScope;
  return 'self';
};

export const isNegativeZoneCard = (card) => {
  return getZoneCardPolarity(card) === 'negative';
};

export const isPositiveZoneCard = (card) => {
  return getZoneCardPolarity(card) === 'positive';
};

export const isNeutralZoneCard = (card) => !isPositiveZoneCard(card) && !isNegativeZoneCard(card);

export const zoneCardHasGuaranteedHpLoss = (card) => {
  if (!card?.type) return false;
  return [
    'selfDamageHP', 'selfDamageDiscardHP', 'selfDamageHPSAN', 'selfDamageRestHP', 'selfDamageHPPeek',
    'allDamageHP', 'allDamageBoth', 'adjDamageHP', 'adjDamageBoth',
    'selfDamageAdjDamageHP', 'selfDamageAdjDamageBoth', 'allDamageHPRandomExtra'
  ].includes(card.type);
};

export const zoneCardHasGuaranteedSanLoss = (card) => {
  if (!card?.type) return false;
  return [
    'selfDamageSAN', 'selfDamageDiscardSAN', 'selfDamageHPSAN', 'selfDamageRestSAN',
    'allDamageSAN', 'allDamageBoth', 'adjDamageSAN', 'adjDamageBoth', 'selfDamageAdjDamageBoth'
  ].includes(card.type);
};

export const zoneCardIsSacrificeStyle = (card) => {
  return !!card?.type && (card.type.startsWith('sac') || card.type === 'selfBerserk');
};

export const zoneCardAppliesWidePressure = (card) => {
  const scope = getZoneCardEffectScope(card);
  return scope === 'all' || scope === 'adjacent';
};

export const zoneCardProvidesGuaranteedCardGain = (card) => {
  return !!card?.type && ['placeBlankZone', 'revealTopCards', 'firstComePick', 'drawCard'].includes(card.type);
};

export const zoneCardUsesTargetInteraction = (card) => {
  return !!card?.type && ['swapAllHands', 'caveDuel', 'damageLink', 'roseThornGiftAllHand', 'globalOnlySwap'].includes(card.type);
};

export const isWinHand = (hand) => {
  if (!hand?.length) return false;
  const letters = new Set();
  const numbers = new Set();
  let blankCount = 0;
  for (const c of hand) {
    if (c.isGod) continue;
    if (isBlankZoneCard(c)) {
      blankCount += 1;
      continue;
    }
    if (c.letter) letters.add(c.letter);
    if (c.number) numbers.add(c.number);
  }
  const missingLetters = Math.max(0, LETTERS.length - letters.size);
  const missingNumbers = Math.max(0, NUMS.length - numbers.size);
  return Math.max(missingLetters, missingNumbers) <= blankCount;
};

export const getLivingPlayerOrder = (players, startIdx) => {
  const aliveOrder = [];
  for (let step = 0; step < players.length; step++) {
    const idx = (startIdx + step) % players.length;
    if (players[idx] && !players[idx].isDead) aliveOrder.push(idx);
  }
  return aliveOrder;
};

export const cardLogText = (card, opts = {}) => {
  if (!card) return '???';
  const { alwaysShowName = false } = opts;
  if (!card.isZone) return card.name || '???';
  const codePart = (card.letter || card.number != null) ? `[${card.letter || ''}${card.number || ''}]` : '';
  const namePart = card.name || '';
  if (alwaysShowName) return `${codePart} ${namePart}`.trim() || namePart || '???';
  return codePart || namePart || '???';
};

export const estimateZoneCardKeepScore = (card, ci, players) => {
  let score = 0;
  if (!card) return score;
  const letter = card.letter;
  const number = card.number;
  const letterCount = players.filter(p => p.hand.some(c => c.letter === letter)).length;
  const numberCount = players.filter(p => p.hand.some(c => c.number === number)).length;
  if (card.isGod) score = 10;
  else if (isPositiveZoneCard(card)) score = 8 - letterCount * 2 - numberCount * 2;
  else if (isNegativeZoneCard(card)) score = 3 + letterCount * 3 + numberCount * 3;
  else score = 5;
  if (card.type === 'swapAllHands') score += 3;
  if (card.type === 'caveDuel') score += 2;
  return score;
};

export const removeCardsFromDiscard = (discard, cards) => {
  if (!Array.isArray(discard) || !Array.isArray(cards) || !cards.length) return discard;
  const removeIds = new Set(cards.map(c => c?.id).filter(id => id != null));
  if (!removeIds.size) return discard;
  return discard.filter(c => !removeIds.has(c?.id));
};

export const getPrevLivingIndex = (players, ci) => {
  for (let step = 1; step < players.length; step++) {
    const idx = (ci - step + players.length) % players.length;
    if (idx !== ci && players[idx] && !players[idx].isDead) return idx;
  }
  return null;
};

export const getNextLivingIndex = (players, ci) => {
  for (let step = 1; step < players.length; step++) {
    const idx = (ci + step) % players.length;
    if (idx !== ci && players[idx] && !players[idx].isDead) return idx;
  }
  return null;
};
