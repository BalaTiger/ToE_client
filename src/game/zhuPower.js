import { cardLogText } from './coreUtils';
import { hasGodPowerImmunity } from './godPowerImmunity';

export function getZhuLightOffsets(level = 1) {
  if (level >= 3) return [0, 1, 2, 3, 4];
  if (level >= 2) return [1, 2, 3];
  return [2];
}

export function findZhuOwner(players = []) {
  return players.findIndex(p => p && !p.isDead && !hasGodPowerImmunity(p) && p.godName === 'ZHU' && (p.godLevel || 0) > 0);
}

export function buildZhuLight(players = [], deck = [], currentTurn = -1, previous = null) {
  const ownerIdx = findZhuOwner(players);
  if (ownerIdx < 0) return null;
  const level = players[ownerIdx]?.godLevel || 1;
  const deckIds = new Set(deck.map(card => card?.id).filter(Boolean));
  const sameOwnerAndLevel = previous?.ownerIdx === ownerIdx && previous?.level === level;
  if (!sameOwnerAndLevel && currentTurn !== ownerIdx) return null;
  if (currentTurn === ownerIdx || !sameOwnerAndLevel) {
    const cardIds = getZhuLightOffsets(level).map(offset => deck[offset]?.id).filter(Boolean);
    return { ownerIdx, level, cardIds, lightNonce: (previous?.lightNonce || 0) + 1 };
  }
  return {
    ownerIdx,
    level,
    cardIds: (previous?.cardIds || []).filter(id => deckIds.has(id)),
    lightNonce: previous?.lightNonce || 0,
  };
}

export function getZhuLitDeckCards(zhuLight, deck = []) {
  if (!zhuLight?.cardIds?.length) return [];
  const idSet = new Set(zhuLight.cardIds);
  return deck
    .map((card, deckIndex) => ({ card, deckIndex, lightNonce: zhuLight.lightNonce || 0 }))
    .filter(item => item.card?.id && idSet.has(item.card.id));
}

export function removeZhuLightCard(zhuLight, cardOrId) {
  const cardId = typeof cardOrId === 'object' ? cardOrId?.id : cardOrId;
  if (!zhuLight || !cardId) return zhuLight;
  return {
    ...zhuLight,
    cardIds: (zhuLight.cardIds || []).filter(id => id !== cardId),
  };
}

export function getZhuTopGuard(gs = {}, deck = gs.deck || []) {
  const zhuLight = buildZhuLight(gs.players || [], deck, gs.currentTurn, gs.zhuLight);
  const topCard = deck[0];
  if (!topCard?.id || !zhuLight?.cardIds?.includes(topCard.id)) return null;
  return {
    ownerIdx: zhuLight.ownerIdx,
    level: zhuLight.level,
    card: topCard,
    cardText: cardLogText(topCard, { alwaysShowName: true }),
    zhuLight,
  };
}

export function moveTopDeckCardToBottom(deck = []) {
  if (!deck.length) return deck;
  const next = [...deck];
  const [top] = next.splice(0, 1);
  next.push(top);
  return next;
}
