export const SOFT_GUIDE_STORAGE_KEY = 'cthulhu_soft_guides_v1_done';

export const SOFT_GUIDE_IDS = {
  REST: 'rest',
  FLIP: 'flip',
};

export const SOFT_GUIDE_DEFS = {
  [SOFT_GUIDE_IDS.REST]: {
    title: '休息',
    eyebrow: '软引导',
    lines: [
      '你的 HP 不满时，可以在行动阶段选择【休息】。',
      '休息会掷两枚骰子回复 HP，并让角色进入或离开翻面状态。',
      '这不是强制行动。你仍然可以先使用身份技能、信仰邪神，或直接结束回合。',
    ],
    confirmText: '知道了，继续行动',
  },
  [SOFT_GUIDE_IDS.FLIP]: {
    title: '翻面',
    eyebrow: '软引导',
    lines: [
      '角色陷入翻面时，会跳过自己的下个回合，然后翻回正常状态。',
      '翻面既可能来自休息，也可能来自部分区域牌或邪神之力。',
      '如果翻面的是你，注意手牌上限和回合节奏；如果翻面的是别人，也许正是动手的窗口。',
    ],
    confirmText: '知道了',
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
