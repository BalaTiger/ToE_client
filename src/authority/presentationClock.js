export function presentationDeadline(view, nowMs) {
  const value = view?.presentation;
  return value && Number.isFinite(value.notBefore) && Number.isFinite(view.serverNow)
    ? nowMs + Math.max(0, value.notBefore - view.serverNow) : null;
}

export function presentationReadyPayload(view) {
  const value = view?.presentation;
  if (!value?.canAck || value.revision !== view.revision || value.decisionId !== view.decision?.id
    || value.phase !== view.phase || !Number.isInteger(view.viewerSeat)
    || !value.requiredSeats?.includes(view.viewerSeat)) return null;
  return { version: 2, matchId: view.matchId, revision: value.revision,
    decisionId: value.decisionId, phase: value.phase, batchId: value.batchId };
}
