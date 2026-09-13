import { chooseAiPublicCardIndex, simulateAiPublicCardGain } from './aiPublicChoices';
import { applyInspectionForSanLoss, submitLossEvents } from './effectEngine';
import { makeInspectionMeta } from './coreUtils';

export function previewAiStoneGain(snapshot, actorIdx, card) {
  simulateAiPublicCardGain(snapshot, actorIdx, card);
  if (!card.isGod) return snapshot;
  const loss = submitLossEvents({
    players: snapshot.players, deck: snapshot.deck, discard: snapshot.discard,
    log: snapshot.log, currentTurn: snapshot.currentTurn,
    events: [{ targetIdx: actorIdx, lostSan: 1, source: '解读石刻' }],
  });
  if (loss.abilityData) {
    return { ...snapshot, phase: loss.phase, abilityData: loss.abilityData,
      _aiPreviewIncomplete: true, _aiPendingResolution: loss.abilityData.type };
  }
  const actor = snapshot.players[actorIdx];
  if (actor.isDead || actor.san <= 0 || actor.san > 6) return snapshot;
  const inspected = applyInspectionForSanLoss(
    actorIdx, actor.san, snapshot.currentTurn ?? actorIdx,
    snapshot.players, snapshot.deck, snapshot.discard, snapshot.log,
    makeInspectionMeta(snapshot),
  );
  // The observation contains a sample of the public inspection composition.
  // Its hidden order cannot establish a guaranteed winner or guaranteed death.
  return {
    ...snapshot, ...inspected.inspectionMeta,
    players: inspected.P, deck: inspected.D, discard: inspected.Disc, log: inspected.log,
    _aiPreviewIncomplete: true, _aiPendingResolution: 'sampledInspection',
  };
}

export function chooseAiStoneCardIndex({ state, actorIdx, cards = [] }) {
  return chooseAiPublicCardIndex({
    state, actorIdx, cards,
    simulateGain: (snapshot, { card }) => previewAiStoneGain(snapshot, actorIdx, card),
  });
}
