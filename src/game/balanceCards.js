import { clamp, formatHpLoss, formatSanLoss } from './coreUtils';

export function isBalanceCard(card, type = null) {
  if (!card) return false;
  if (type) return card.type === type;
  return card.type === 'lifeBalance' || card.type === 'soulBalance';
}

export function buildBalanceDiscardLossEvents(cards = [], ownerIdx = null, { startOrder = 0, reason = '弃牌' } = {}) {
  if (ownerIdx == null) return [];
  return cards.filter(card => isBalanceCard(card)).map((card, index) => ({
    targetIdx: ownerIdx,
    lostHp: card.type === 'lifeBalance' ? 3 : 0,
    lostSan: card.type === 'soulBalance' ? 3 : 0,
    source: card.name || reason,
    order: startOrder + index,
  }));
}

export function buildBalanceDiscardLogLines(cards = [], playerName = '角色', reason = '弃牌') {
  return cards.filter(card => isBalanceCard(card)).map(card => (
    `【${card.type === 'lifeBalance' ? '生命天平' : '灵魂天平'}】${playerName} 因${reason}失去 3 ${card.type === 'lifeBalance' ? 'HP' : 'SAN'}`
  ));
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
  statEventSeq = null,
  statEventReason = null,
  statEventLogs = [],
  continuation = {},
}) {
  let P = players;
  const D = deck;
  const Disc = discard;
  let L = log;
  const balanceCards = (cards || []).filter(card => isBalanceCard(card));
  if (submitDamage && balanceCards.length && ownerIdx != null && P[ownerIdx] && !P[ownerIdx].isDead) {
    const balanceLines = buildBalanceDiscardLogLines(balanceCards, P[ownerIdx].name, reason);
    const damage = submitDamage({
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      currentTurn,
      statEventSeq,
      statEventReason: statEventReason || reason,
      statEventLogs: Array.isArray(statEventLogs) && statEventLogs.length ? statEventLogs : balanceLines,
      continuation,
      events: buildBalanceDiscardLossEvents(balanceCards, ownerIdx, { reason }),
    });
    balanceLines.forEach(line => {
      L = [...L, damage.phase === 'ETHEREALIZE_DECISION' ? line.replace('失去 3', '即将失去 3') : line];
    });
    return {
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      damageDecision: damage,
      statEvents: damage.statEvents || [],
      statEventSeq: damage.statEventSeq,
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
