export const SOFT_GUIDE_STORAGE_KEY = 'cthulhu_soft_guides_v1_done';

export const SOFT_GUIDE_IDS = {
  REST: 'rest',
  FLIP: 'flip',
};

export const SOFT_GUIDE_DEFS = {
  [SOFT_GUIDE_IDS.REST]: {
    title: '',
    eyebrow: '',
    lines: [
      '你可以在行动阶段选择【休息】来回复HP。',
      '先掷出两枚骰子，按照其中更大的点数回复HP，然后将你的角色翻面。',
      '注意：【休息】后会直接结束回合；本回合使用其他技能后不能再【休息】。',
    ],
    confirmText: '知道了，继续行动',
  },
  [SOFT_GUIDE_IDS.FLIP]: {
    title: '',
    eyebrow: '',
    lines: [
      '角色陷入翻面时，会跳过自己的下个回合，然后翻回正常状态。',
    ],
    confirmText: '我知道了',
  },
};

export const ALL_SOFT_GUIDE_IDS = Object.freeze(Object.keys(SOFT_GUIDE_DEFS));

export function parseSoftGuideDone(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function serializeSoftGuideDone(doneMap = {}) {
  const normalized = {};
  ALL_SOFT_GUIDE_IDS.forEach(id => {
    if (doneMap[id]) normalized[id] = true;
  });
  return JSON.stringify(normalized);
}

export function markSoftGuideDone(doneMap = {}, id) {
  if (!SOFT_GUIDE_DEFS[id]) return doneMap;
  return { ...doneMap, [id]: true };
}

export function markAllSoftGuidesDone() {
  return ALL_SOFT_GUIDE_IDS.reduce((acc, id) => ({ ...acc, [id]: true }), {});
}

export function hasNewRestingCharacter(prevPlayers = [], nextPlayers = []) {
  return nextPlayers.some((player, idx) => !!player?.isResting && !prevPlayers[idx]?.isResting);
}

export function getFirstRestingPlayerIndex(players = []) {
  return players.findIndex(player => !!player?.isResting && !player?.isDead);
}

export function getQueuedSoftGuideId({ prevPlayers, nextPlayers, isMultiplayer = false, doneMap = {} } = {}) {
  if (
    prevPlayers &&
    nextPlayers &&
    !isMultiplayer &&
    !doneMap[SOFT_GUIDE_IDS.FLIP] &&
    hasNewRestingCharacter(prevPlayers, nextPlayers)
  ) {
    return SOFT_GUIDE_IDS.FLIP;
  }
  return null;
}

export function shouldTriggerRestSoftGuide(gs, doneMap = {}) {
  const player = gs?.players?.[0];
  return !!(
    gs &&
    !gs._isMP &&
    !gs.gameOver &&
    gs.phase === 'ACTION' &&
    gs.currentTurn === 0 &&
    player &&
    !player.isDead &&
    !player.disableRest &&
    !gs.restUsed &&
    !gs.skillUsed &&
    !gs.multiplyUsed &&
    Number(player.hp) < 10 &&
    !doneMap[SOFT_GUIDE_IDS.REST]
  );
}

export function hasPendingTurnStartPresentation(gs) {
  if (!gs) return false;
  return !!(
    (Array.isArray(gs._turnStartLogs) && gs._turnStartLogs.length > 0) ||
    gs._playersBeforeThisDraw ||
    gs._drawnCard ||
    gs._aiDrawnCard ||
    (gs.phase === 'ACTION' && gs.drawReveal?.card)
  );
}

export function canPresentSoftGuide({
  gs,
  showTutorial = false,
  pendingSoftGuideId = null,
  roleSelectionPending = false,
  roleRevealAnim = null,
  anim = null,
  animExiting = null,
  animQueueLength = 0,
  hasPendingGs = false,
  turnStartPresentationPending = false,
} = {}) {
  return !!(
    gs &&
    !gs._isMP &&
    !gs.gameOver &&
    !showTutorial &&
    !pendingSoftGuideId &&
    !roleSelectionPending &&
    !roleRevealAnim &&
    !anim &&
    !animExiting &&
    animQueueLength <= 0 &&
    !hasPendingGs &&
    !turnStartPresentationPending
  );
}
