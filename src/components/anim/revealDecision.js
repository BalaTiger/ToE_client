// The rule phase stays a decision. Only its presentation survives the queue;
// retaining an active DRAW_CARD step would block both clicks and remote replay.
export function getRevealDecision(state) {
  if (!state || state.gameOver) return null;
  if (state.phase === 'DRAW_REVEAL' && state.drawReveal?.needsDecision && !state.drawReveal.forcedKeep) {
    const draw = state.drawReveal;
    return draw.card ? {
      kind: 'draw-reveal', card: draw.blindZoneIdentity ? { ...draw.card, blindZoneIdentity: true } : draw.card,
      actorIdx: draw.drawerIdx ?? state.currentTurn ?? 0,
    } : null;
  }
  if (state.phase === 'GOD_CHOICE' && state.abilityData?.godCard) {
    return { kind: 'god-choice', card: state.abilityData.godCard, actorIdx: state.abilityData.drawerIdx ?? state.currentTurn ?? 0 };
  }
  return null;
}

export function matchesRevealDecision(draw, decision) {
  if (!decision || draw?.type !== 'DRAW_CARD' || draw.travelOnly || draw.card?.hiddenDraw || draw.card?.effect) return false;
  if ((draw.targetPid ?? 0) !== decision.actorIdx) return false;
  const a = draw.card, b = decision.card;
  const aId = a?.id ?? a?.uid, bId = b?.id ?? b?.uid;
  return aId != null || bId != null ? aId != null && String(aId) === String(bId)
    : a === b || !!a && a.key === b.key && a.name === b.name && a.godKey === b.godKey;
}

