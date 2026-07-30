// 可热切换的平衡补丁。默认值会写入每局状态，确保联机各端使用同一规则。
// 若线上需要全量启用，只需将对应默认值改为 true；也可在建局时传入
// options.balancePatches 做按局灰度。
export const BALANCE_PATCH_KEYS = Object.freeze({
  TWO_GOD_ENCOUNTERS_PER_SKULL: 'twoGodEncountersPerSkull',
});

export const DEFAULT_BALANCE_PATCHES = Object.freeze({
  [BALANCE_PATCH_KEYS.TWO_GOD_ENCOUNTERS_PER_SKULL]: false,
});

export function resolveBalancePatches(overrides = null) {
  return {
    ...DEFAULT_BALANCE_PATCHES,
    ...(overrides || {}),
  };
}

export function isTwoGodEncountersPerSkullEnabled(stateLike = null) {
  return stateLike?.balancePatches?.[BALANCE_PATCH_KEYS.TWO_GOD_ENCOUNTERS_PER_SKULL]
    ?? DEFAULT_BALANCE_PATCHES[BALANCE_PATCH_KEYS.TWO_GOD_ENCOUNTERS_PER_SKULL];
}

// godEncounters 保留为 UI 使用的骷髅数；godEncounterCount 记录真实遭遇次数。
export function advanceGodEncounter(player, stateLike = null) {
  const patchEnabled = isTwoGodEncountersPerSkullEnabled(stateLike);
  const previousSkulls = player?.godEncounters || 0;
  const previousEncounterCount = player?.godEncounterCount
    ?? (patchEnabled ? previousSkulls * 2 : previousSkulls);
  const encounterCount = previousEncounterCount + 1;
  const createdSkull = !patchEnabled || encounterCount % 2 === 0;
  const skullCount = previousSkulls + (createdSkull ? 1 : 0);
  const sanLoss = createdSkull ? skullCount : 0;

  player.godEncounterCount = encounterCount;
  player.godEncounters = skullCount;
  player.lastGodEncounterSanLoss = sanLoss;
  player.lastGodEncounterCreatedSkull = createdSkull;
  player.lastGodEncounterPatchEnabled = patchEnabled;

  return {
    encounterCount,
    skullCount,
    sanLoss,
    createdSkull,
    patchEnabled,
  };
}

export function formatGodEncounterProgress(progress) {
  if (!progress?.patchEnabled) return `第${progress?.encounterCount || 0}次`;
  return progress.createdSkull
    ? `第${progress.encounterCount}次，产生第${progress.skullCount}个骷髅头`
    : `第${progress.encounterCount}次，尚未产生骷髅头`;
}

export function getLatestGodEncounterProgress(player, stateLike = null) {
  const patchEnabled = stateLike
    ? isTwoGodEncountersPerSkullEnabled(stateLike)
    : (player?.lastGodEncounterPatchEnabled ?? isTwoGodEncountersPerSkullEnabled());
  const skullCount = player?.godEncounters || 0;
  const encounterCount = player?.godEncounterCount
    ?? (patchEnabled ? skullCount * 2 : skullCount);
  const createdSkull = player?.lastGodEncounterCreatedSkull ?? (!patchEnabled || encounterCount % 2 === 0);
  const sanLoss = player?.lastGodEncounterSanLoss ?? (createdSkull ? skullCount : 0);
  return { encounterCount, skullCount, sanLoss, createdSkull, patchEnabled };
}
