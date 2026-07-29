const EXECUTION_ONLY_FIELDS = [
  '_aiDrawnCard',
  '_aiName',
  '_playersBeforeNextDraw',
  '_aiHuntEvents',
  '_playersBeforeSkillAction',
  '_preSkillLogs',
  '_preSkillDiscard',
  '_animAiDrawnCard',
  '_animDiscardedDrawnCard',
  '_animMultiplyEvent',
  '_animSphinxReveal',
  '_aiTurnIntroShown',
];

const PRESENTATION_ONLY_FIELDS = [
  ...EXECUTION_ONLY_FIELDS,
  '_playersBeforeEndTurnReplay',
  '_discardBeforeEndTurnReplay',
  '_cthRestDraws',
  '_cthRestDrawLogs',
  '_playersBeforeCthDraws',
  '_aiHandLimitDiscards',
  '_aiHandLimitBeforePlayers',
  '_aiHandLimitBeforeDiscard',
  '_aiHandLimitBeforeLog',
];

function omitFields(value, fields) {
  const result = { ...value };
  fields.forEach(field => {
    delete result[field];
  });
  return result;
}

export function stripAiExecutionFields(rawResult) {
  return omitFields(rawResult, EXECUTION_ONLY_FIELDS);
}

export function stripAiPresentationFields(rawResult) {
  return omitFields(rawResult, PRESENTATION_ONLY_FIELDS);
}

export function clearPendingAnimDeathPlayers(players) {
  return (players || []).map(player =>
    player?._pendingAnimDeath
      ? { ...player, _pendingAnimDeath: false }
      : player
  );
}

export function finalizeAiPresentationState(state) {
  if (!state) return state;
  return {
    ...state,
    players: clearPendingAnimDeathPlayers(state.players),
  };
}

export function buildRoseThornSnapshot(players) {
  return (players || []).map((player, idx) => ({
    idx,
    marked: [
      ...(player?.hand || [])
        .filter(card => card?.roseThornHolderId === idx)
        .map(card => card.id),
      ...(player?.godZone || [])
        .filter(card => card?.roseThornHolderId === idx)
        .map(card => card.id),
    ].filter(id => id != null),
  }));
}

export function collectExplicitAiTurnLogs(state, queue) {
  return [
    ...(state?._turnStartLogs || []),
    ...(state?._drawLogs || []),
    ...(state?._statLogs || []),
    ...(queue || []).flatMap(step => Array.isArray(step?.msgs) ? step.msgs : []),
  ];
}

export function buildAiTurnRecoveryState({
  snapshot,
  error,
  stage,
  startNextTurn,
  skillUsed = false,
}) {
  const suffix = error?.message ? `（${error.message}）` : '';
  const actorName = snapshot?.players?.[snapshot.currentTurn]?.name || '该AI';
  const stageText = stage === 'presentation' ? '动画结算异常' : '回合处理异常';
  const safeLog = [
    ...(Array.isArray(snapshot?.log) ? snapshot.log : []),
    `${actorName} 的${stageText}${suffix}，系统强制结束其回合`,
  ];
  return startNextTurn({
    ...snapshot,
    log: safeLog,
    currentTurn: snapshot.currentTurn,
    skillUsed,
    restUsed: false,
    huntAbandoned: [],
  });
}
