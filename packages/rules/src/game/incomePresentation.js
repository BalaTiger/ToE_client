const STAT_TYPES = new Set(['HP_HEAL', 'SAN_HEAL', 'HP_DAMAGE', 'SAN_DAMAGE']);
const STAT_EVENTS = new Set(['HP_GAIN', 'SAN_GAIN', 'HP_LOSS', 'SAN_LOSS', 'HP_SAN_GAIN', 'HP_SAN_LOSS']);
const sameCard = (a, b) => a?.id != null && b?.id != null && String(a.id) === String(b.id);

// Local presentation only: keep every rule/stat/hand-commit cue in its original
// order. The flight spans the stat tail and lands at the existing hand commit.
export function attachIncomePresentation(queue, { decision = null, nextState = null, stepGapMs = 0 } = {}) {
  const result = [...queue];
  queue.forEach((transfer, end) => {
    if (transfer.type !== 'CARD_TRANSFER' || transfer.dest !== 'player'
      || transfer.transfers?.length || transfer.cards?.length !== 1 || (transfer.count ?? 1) !== 1
      || !['reveal', 'drawReveal', 'godChoice', 'playerArea'].includes(transfer.sourceAnchor)
      || !['draw', 'zoneIncome', 'godKeepHand'].includes(transfer.effect)) return;
    const card = transfer.cards[0];
    if (card.hiddenDraw || card._back || card.effect) return;
    let start = 0;
    let reveal = null;
    for (let i = end - 1; i >= 0; i--) {
      const step = queue[i];
      if ((step.type === 'DRAW_CARD' && !step.card?.effect) || step.type === 'CARD_TRANSFER') {
        if (step.type === 'DRAW_CARD' && !step.travelOnly && sameCard(step.card, card)
          && (step.targetPid ?? 0) === transfer.toPid) {
          start = i + 1;
          reveal = step;
        } else return;
        break;
      }
    }
    if (!reveal && !(sameCard(decision?.card, card) && decision.actorIdx === transfer.toPid)) return;
    const tail = queue.slice(start, end);
    if (!tail.length) return;
    const safe = !nextState?.gameOver && !nextState?.abilityData?.pendingZoneIncome
      && (!nextState?.phase || ['ACTION', 'AI_TURN'].includes(nextState.phase))
      && tail.every(step => STAT_TYPES.has(step.type)
      && step.statEvents?.length && step.statEvents.every(event => STAT_EVENTS.has(event.type)
        && event.target === transfer.toPid && !event.linkDamage && !event.vritraImmortalReveal
        && !event.from?.isDead && !event.to?.isDead && event.from?.hp > 0 && event.to?.hp > 0
        && event.from?.san > 0 && event.to?.san > 0));
    // A transfer's own snapshot determines the landing; never move it earlier.
    const landing = transfer.visualTimeline?.find(point => point.patch?.players?.[transfer.toPid]?.hand?.some(item => sameCard(item, card)));
    const followingCommit = queue[end + 1]?.type === 'STATE_PATCH'
      && queue[end + 1].players?.[transfer.toPid]?.hand?.some(item => sameCard(item, card));
    if (safe && (landing || followingCommit)) {
      const incomeFlight = {
        ...transfer,
        flightDurationMs: tail.reduce((ms, step) => ms + step.durationMs + stepGapMs, 0)
          + (landing ? landing.atMs : transfer.durationMs + stepGapMs),
      };
      for (let i = start; i <= end; i++) result[i] = { ...result[i], incomeFlight };
    } else {
      // Inspections/death/reactions keep their queue order. Retain the source
      // card between effects, but let an inspection draw temporarily take over.
      const incomeReveal = { card: reveal?.card || decision.card, targetPid: transfer.toPid };
      for (let i = start; i < end; i++) result[i] = { ...result[i], incomeReveal };
    }
  });
  return result;
}
