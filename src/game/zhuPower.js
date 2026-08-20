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

function deckCardIds(deck = []) {
  return new Set(deck.map(card => card?.id).filter(Boolean));
}

export function getZhuLightInvariantViolations(players = [], deck = [], zhuLight = null) {
  if (!zhuLight) return [];
  const violations = [];
  const ownerIdx = findZhuOwner(players);
  const cardIds = zhuLight.cardIds || [];
  const idsInDeck = deckCardIds(deck);
  if (ownerIdx < 0) violations.push('light exists without an eligible ZHU owner');
  if (zhuLight.ownerIdx !== ownerIdx) violations.push('ownerIdx does not match the eligible ZHU owner');
  if ((players[ownerIdx]?.godLevel || 0) !== zhuLight.level) violations.push('level does not match the ZHU owner');
  if (new Set(cardIds).size !== cardIds.length) violations.push('cardIds contains duplicates');
  if (cardIds.some(id => !idsInDeck.has(id))) violations.push('cardIds contains a card outside the deck');
  return violations;
}

function assertValidZhuLight(players, deck, zhuLight) {
  if (!import.meta.env?.DEV) return zhuLight;
  const violations = getZhuLightInvariantViolations(players, deck, zhuLight);
  if (violations.length) throw new Error(`[ZHU invariant] ${violations.join('; ')}`);
  return zhuLight;
}

/**
 * Reconcile the persistent ZHU state without lighting any new cards.
 * This is lifecycle maintenance and is deliberately independent from the
 * turn-start event registry.
 */
export function reconcileZhuLight(players = [], deck = [], previous = null) {
  const ownerIdx = findZhuOwner(players);
  if (ownerIdx < 0) return null;
  const level = players[ownerIdx]?.godLevel || 1;
  const sameOwnerAndLevel = previous?.ownerIdx === ownerIdx && previous?.level === level;
  if (!sameOwnerAndLevel) return null;
  const deckIds = deckCardIds(deck);
  return assertValidZhuLight(players, deck, {
    ownerIdx,
    level,
    cardIds: [...new Set((previous?.cardIds || []).filter(id => deckIds.has(id)))],
    lightNonce: previous?.lightNonce || 0,
  });
}

/**
 * Execute the active owner-turn power: retain this owner's still-lit cards and
 * add the configured deck positions exactly once for this refresh.
 */
export function refreshZhuLightAtOwnerTurn(players = [], deck = [], ownerTurnIdx = -1, previous = null) {
  const ownerIdx = findZhuOwner(players);
  if (ownerIdx < 0 || ownerTurnIdx !== ownerIdx) return reconcileZhuLight(players, deck, previous);
  const level = players[ownerIdx]?.godLevel || 1;
  const deckIds = deckCardIds(deck);
  const previousIds = previous?.ownerIdx === ownerIdx
    ? (previous?.cardIds || []).filter(id => deckIds.has(id))
    : [];
  const newIds = getZhuLightOffsets(level).map(offset => deck[offset]?.id).filter(Boolean);
  return assertValidZhuLight(players, deck, {
    ownerIdx,
    level,
    cardIds: [...new Set([...previousIds, ...newIds])],
    lightNonce: (previous?.lightNonce || 0) + 1,
  });
}

export function getZhuLitDeckCards(zhuLight, deck = []) {
  if (!zhuLight?.cardIds?.length) return [];
  const idSet = new Set(zhuLight.cardIds);
  return deck
    .map((card, deckIndex) => ({ card, deckIndex, lightNonce: zhuLight.lightNonce || 0 }))
    .filter(item => item.card?.id && idSet.has(item.card.id));
}

export function getZhuDrawHiddenCardId(anim, zhuLight) {
  if (anim?.type !== 'DRAW_CARD' || !anim.card?.id || anim.card.effect) return null;
  const sourcePile = anim.sourcePile || 'deck';
  if (sourcePile !== 'deck') return null;
  return zhuLight?.cardIds?.includes(anim.card.id) ? anim.card.id : null;
}

export function removeZhuLightCard(zhuLight, cardOrId) {
  const cardId = typeof cardOrId === 'object' ? cardOrId?.id : cardOrId;
  if (!zhuLight || !cardId) return zhuLight;
  return {
    ...zhuLight,
    cardIds: (zhuLight.cardIds || []).filter(id => id !== cardId),
  };
}

export const ZHU_REVEAL_SOURCE = Object.freeze({
  TURN_DRAW: 'turnDraw',
  TSG_SLIME: 'tsgSlime',
  CTH_REST: 'cthRest',
  SPHINX: 'sphinx',
  PROLIFERATING_Z: 'proliferatingZ',
});

export function getZhuTopGuard(gs = {}, deck = gs.deck || []) {
  // A reveal guard may only reconcile existing light. Refreshing here would
  // light new offsets after every extra draw during the owner's turn.
  const zhuLight = reconcileZhuLight(gs.players || [], deck, gs.zhuLight);
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

/**
 * Shared pre-reveal gateway for every draw that reads from the normal deck.
 * Callers still own the source-specific continuation, but the guard decision
 * and its metadata are created in one place.
 */
export function requestZhuReveal(gs = {}, {
  deck = gs.deck || [],
  drawerIdx = gs.currentTurn ?? 0,
  source = ZHU_REVEAL_SOURCE.TURN_DRAW,
  continuation = null,
  sourcePile = 'deck',
  respectGeomagnetic = true,
} = {}) {
  if (gs?._zhuBypassTopGuard || (respectGeomagnetic && gs?.geomagneticReversalActive) || sourcePile !== 'deck') return null;
  const guard = getZhuTopGuard(gs, deck);
  if (!guard) return null;
  return {
    guard,
    zhuLight: guard.zhuLight,
    decision: {
      ownerIdx: guard.ownerIdx,
      drawerIdx,
      cardId: guard.card?.id || null,
      source,
      continuation: continuation ? { ...continuation } : null,
    },
  };
}

export function buildZhuRevealAbilityData(request, legacyAbilityData = {}) {
  if (!request?.guard) return { ...legacyAbilityData };
  return {
    ...legacyAbilityData,
    zhuGuard: request.guard,
    drawerIdx: request.decision?.drawerIdx,
    zhuDecision: request.decision,
  };
}

export function getZhuRevealDecision(stateLike = {}) {
  const abilityData = stateLike?.abilityData || {};
  if (abilityData.zhuDecision) return abilityData.zhuDecision;
  if (!abilityData.zhuGuard) return null;
  const source = abilityData.fromRest
    ? ZHU_REVEAL_SOURCE.CTH_REST
    : (abilityData.fromTsathogguaSlime ? ZHU_REVEAL_SOURCE.TSG_SLIME : ZHU_REVEAL_SOURCE.TURN_DRAW);
  return {
    ownerIdx: abilityData.zhuGuard.ownerIdx,
    drawerIdx: abilityData.drawerIdx ?? stateLike.currentTurn ?? 0,
    cardId: abilityData.zhuGuard.card?.id || null,
    source,
    continuation: {
      ...(abilityData.fromRest ? { remaining: abilityData.cthDrawsRemaining || 0 } : {}),
      ...(abilityData.fromTsathogguaSlime ? {
        continueTurnStartDraw: !!abilityData.continueTurnStartDraw,
        extraDrawReady: !!abilityData._tsgExtraDrawReady,
        turnOwner: abilityData._turnOwner,
      } : {}),
    },
  };
}

export function moveTopDeckCardToBottom(deck = []) {
  if (!deck.length) return deck;
  const next = [...deck];
  const [top] = next.splice(0, 1);
  next.push(top);
  return next;
}
