import { clamp, formatHpLoss, formatSanLoss } from './coreUtils';

export function isBalanceCard(card, type = null) {
  if (!card) return false;
  if (type) return card.type === type;
  return card.type === 'lifeBalance' || card.type === 'soulBalance';
}

export function applyBalanceDiscardSideEffects({
  players,
  deck,
  discard,
  log,
  ownerIdx,
  cards,
  reason = '弃牌',
}) {
  let P = players;
  const D = deck;
  const Disc = discard;
  let L = log;
  (cards || []).forEach(card => {
    if (!isBalanceCard(card) || ownerIdx == null || !P[ownerIdx] || P[ownerIdx].isDead) return;
    if (card.type === 'lifeBalance') {
      P[ownerIdx].hp = clamp((P[ownerIdx].hp || 0) - 3);
      L = [...L, `【生命天平】${P[ownerIdx].name} 因${reason}${formatHpLoss(3)}`];
    } else if (card.type === 'soulBalance') {
      P[ownerIdx].san = clamp((P[ownerIdx].san || 0) - 3);
      L = [...L, `【灵魂天平】${P[ownerIdx].name} 因${reason}${formatSanLoss(3)}`];
    }
  });
  return { players: P, deck: D, discard: Disc, log: L };
}
