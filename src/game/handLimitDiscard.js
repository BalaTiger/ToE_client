import { copyPlayers, splitHandDiscardCards } from './coreUtils';
import { applyBalanceDiscardSideEffects } from './balanceCards';
import { applyHpDamageWithLink, submitLossEvents } from './effectEngine';
import { buildStatEvents } from './statEvents';
import { buildAnimQueue } from './animQueueCore';
import { bindAnimLogChunks } from './animLogs';

export function splitKeptDestroyedDiscarded(discarded = []) {
  return splitHandDiscardCards(discarded);
}

export function discardCardsFromHand(players, actorIndex, indices) {
  const P = copyPlayers(players);
  const hand = P[actorIndex]?.hand;
  if (!Array.isArray(hand)) return { players: P, discarded: [] };
  const sorted = [...indices].sort((a, b) => b - a);
  const discarded = [];
  for (const i of sorted) {
    if (i >= 0 && i < hand.length) {
      discarded.push(hand.splice(i, 1)[0]);
    }
  }
  return { players: P, discarded };
}

export function discardCardsFromHandFromRight(players, actorIndex, count) {
  const P = copyPlayers(players);
  const hand = P[actorIndex]?.hand;
  const n = Math.max(0, Math.min(count, Array.isArray(hand) ? hand.length : 0));
  const discarded = [];
  for (let i = 0; i < n; i++) {
    discarded.push(hand.pop());
  }
  return { players: P, discarded };
}

export function applyHandDiscardSideEffectsWithAnim({
  baseGs,
  players,
  deck,
  discard,
  log,
  ownerIdx,
  cards,
  reason = '弃牌',
}) {
  const beforePlayers = copyPlayers(players);
  const beforeLogLength = log.length;
  const result = applyBalanceDiscardSideEffects({ players, deck, discard, log, ownerIdx, cards, reason, applyHpDamage: applyHpDamageWithLink, submitDamage: submitLossEvents, currentTurn: baseGs?.currentTurn });
  const sideLogs = result.log.slice(beforeLogLength);
  if (!sideLogs.length) {
    return { ...result, statePatch: {}, queue: [] };
  }
  const statEventSeq = (baseGs?._statEventSeq || 0) + 1;
  const statEvents = buildStatEvents(beforePlayers, result.players, sideLogs, {
    reason: '天平',
    seq: statEventSeq,
    discardBefore: baseGs?.discard,
    discardAfter: result.discard,
  });
  const statePatch = statEvents.length
    ? { _statEvents: [...(baseGs?._statEvents || []), ...statEvents], _statEventSeq: statEventSeq }
    : {};
  if (result.damageDecision?.phase) {
    statePatch.phase = result.damageDecision.phase;
    statePatch.abilityData = result.damageDecision.abilityData;
  }
  const afterGs = { ...baseGs, players: result.players, deck: result.deck, discard: result.discard, log: result.log, ...statePatch };
  const queue = statEvents.length
    ? bindAnimLogChunks(
        buildAnimQueue({ ...baseGs, players: beforePlayers, deck, discard, log }, afterGs),
        { statLogs: sideLogs }
      ).filter(step => step.type !== 'CARD_TRANSFER')
    : [];
  return { ...result, statePatch, queue };
}
