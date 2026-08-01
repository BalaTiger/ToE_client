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
  applyHpDamage = null,
  submitDamage = null,
  currentTurn = null,
}) {
  let P = players;
  const D = deck;
  const Disc = discard;
  let L = log;
  const balanceCards = (cards || []).filter(card => isBalanceCard(card));
  if (submitDamage && balanceCards.length && ownerIdx != null && P[ownerIdx] && !P[ownerIdx].isDead) {
    const damage = submitDamage({
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      currentTurn,
      events: balanceCards.map((card, order) => ({
        targetIdx: ownerIdx,
        lostHp: card.type === 'lifeBalance' ? 3 : 0,
        lostSan: card.type === 'soulBalance' ? 3 : 0,
        source: card.name || reason,
        order,
      })),
    });
    balanceCards.forEach(card => {
      const pending = damage.phase === 'ETHEREALIZE_DECISION' ? '即将失去' : '失去';
      L = [...L, `【${card.type === 'lifeBalance' ? '生命天平' : '灵魂天平'}】${P[ownerIdx].name} 因${reason}${pending} 3 ${card.type === 'lifeBalance' ? 'HP' : 'SAN'}`];
    });
    return {
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      damageDecision: damage,
      ...(damage.phase === 'ETHEREALIZE_DECISION' ? { etherealizeDecision: damage.abilityData } : {}),
    };
  }
  (cards || []).forEach(card => {
    if (!isBalanceCard(card) || ownerIdx == null || !P[ownerIdx] || P[ownerIdx].isDead) return;
    if (card.type === 'lifeBalance') {
      if (applyHpDamage) applyHpDamage(P, ownerIdx, 3, Disc, L, currentTurn, D);
      else P[ownerIdx].hp = clamp((P[ownerIdx].hp || 0) - 3);
      L = [...L, `【生命天平】${P[ownerIdx].name} 因${reason}${formatHpLoss(3)}`];
    } else if (card.type === 'soulBalance') {
      P[ownerIdx].san = clamp((P[ownerIdx].san || 0) - 3);
      L = [...L, `【灵魂天平】${P[ownerIdx].name} 因${reason}${formatSanLoss(3)}`];
    }
  });
  return { players: P, deck: D, discard: Disc, log: L };
}
