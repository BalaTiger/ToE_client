import {
  LETTERS,
  NUMS,
  GOD_DEFS,
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

export const isBlackGoatYoung = (card) => !!card?.isBlackGoatYoung;

export const separateBlackGoatYoung = (cards) => {
  if (!cards) return { kept: [], destroyed: [] };
  const kept = [];
  const destroyed = [];
  for (const c of cards) {
    if (isBlackGoatYoung(c)) destroyed.push(c);
    else kept.push(c);
  }
  return { kept, destroyed };
};

export function tryVritraImmortal(P, i, currentTurn, D, Disc, L) {
  if (currentTurn == null || D == null || currentTurn === i) return false;
  if (!P[i] || P[i].isDead || P[i].hp > 0) return false;
  if (P[i].godName !== 'VRITRA') return false;
  const count = GOD_DEFS.VRITRA.levels[(P[i].godLevel || 1) - 1]?.immortalCount || 0;
  if (!count) return false;
  const revealed = [];
  const deckCopy = [...D];
  for (let k = 0; k < count && deckCopy.length > 0; k++) {
    revealed.push(deckCopy.shift());
  }
  const hasGod = revealed.some(c => c && c.isGod);
  if (hasGod) {
    Disc.push(...revealed);
    L.push(`【不灭之躯】${P[i].name} 濒死之际激发龙血之力，但翻开的牌中出现了邪神牌，力量消散…`);
    D.length = 0;
    D.push(...deckCopy);
    return false;
  }
  P[i].hp = 1;
  Disc.push(...revealed);
  L.push(`【不灭之躯】${P[i].name} 在濒死之际激发龙血之力，HP恢复至1！`);
  D.length = 0;
  D.push(...deckCopy);
  return true;
}

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
    'selfDamageAdjDamageHP', 'selfDamageAdjDamageBoth', 'allDamageHPRandomExtra', 'sameAbyssChoice'
  ].includes(card.type);
};

export const zoneCardHasGuaranteedSanLoss = (card) => {
  if (!card?.type) return false;
  return [
    'selfDamageSAN', 'selfDamageDiscardSAN', 'selfDamageHPSAN', 'selfDamageRestSAN',
    'allDamageSAN', 'allDamageBoth', 'adjDamageSAN', 'adjDamageBoth', 'selfDamageAdjDamageBoth',
    'allHealHPDamageSAN'
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

export function killPlayerState(P, i, Disc, L) {
  if (i == null || !P[i] || P[i].isDead) return;
  P[i]._pendingAnimDeath = true;
  P[i].isDead = true;
  P[i].roleRevealed = true;
  L.push(`☠ ${P[i].name}（${P[i].role}）倒下了！`);
  const { kept, destroyed } = separateBlackGoatYoung(P[i].hand);
  if (kept.length) Disc.push(...kept);
  if (destroyed.length) L.push(`${P[i].name} 的 ${destroyed.length} 张黑山羊幼仔被销毁`);
  P[i].hand = [];
  if (P[i].godZone?.length) {
    Disc.push(...P[i].godZone);
    P[i].godZone = [];
    P[i].godName = null;
    P[i].godLevel = 0;
  }
}

export function clearPendingAnimDeathFlags(players, preservePid = null) {
  return (players || []).map((p, idx) => {
    if (!p) return p;
    if (p._pendingAnimDeath && idx !== preservePid) return { ...p, _pendingAnimDeath: false };
    return { ...p };
  });
}

export function makeInspectionMeta(gs){
  return {
    inspectionDeck: gs?.inspectionDeck??[],
    inspectionDiscard: gs?.inspectionDiscard??[],
    sealLooseningCount: gs?.sealLooseningCount??0,
    houndsOfTindalosActive: gs?.houndsOfTindalosActive??false,
    houndsOfTindalosTarget: gs?.houndsOfTindalosTarget??null,
    houndsOfTindalosElapsed: gs?.houndsOfTindalosElapsed??0,
    _inspectionSeq: gs?._inspectionSeq||0,
    _inspectionCard: gs?._inspectionCard||null,
    _inspectionTarget: gs?._inspectionTarget??null,
    _inspectionPrevLogLen: gs?._inspectionPrevLogLen??null,
    _inspectionBeforePlayers: gs?._inspectionBeforePlayers??null,
    _inspectionEvents: gs?._inspectionEvents??[],
    _statEvents: gs?._statEvents??[],
    _statEventSeq: gs?._statEventSeq||0,
  };
}

export function sortInspectionTargets(targets,startIndex,totalPlayers){
  const uniq=[...new Set((targets||[]).filter(i=>i!=null))];
  return uniq.sort((a,b)=>(((a-startIndex)+totalPlayers)%totalPlayers)-(((b-startIndex)+totalPlayers)%totalPlayers));
}
