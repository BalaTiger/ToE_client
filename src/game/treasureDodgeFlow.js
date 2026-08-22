export function treasureDodgeModeConfig(aoe = false) {
  return aoe
    ? {
        rollContext: 'treasureAoeDodge',
        skipContext: 'treasureAoeDodgeSkip',
        rollerName: '你',
        includeStandardTransfer: false,
        useAbilityDrawer: true,
        supportsTutorialHold: false,
        deriveSkipDecision: false,
        broadcastEndTurnReplayDelta: false,
      }
    : {
        rollContext: 'treasureDodge',
        skipContext: 'treasureDodgeSkip',
        rollerName: null,
        includeStandardTransfer: true,
        useAbilityDrawer: false,
        supportsTutorialHold: true,
        deriveSkipDecision: true,
        broadcastEndTurnReplayDelta: true,
      };
}

export function getTreasureDodgeDrawerIdx(gs, drawReveal, aoe = false) {
  const config = treasureDodgeModeConfig(aoe);
  return config.useAbilityDrawer
    ? (gs?.abilityData?.drawerIdx ?? drawReveal?.drawerIdx ?? 0)
    : (drawReveal?.drawerIdx ?? 0);
}

export function classifyTreasureDodgeRoll(drawReveal, result, aoe = false) {
  if (result?.win) return 'win';
  if (result?.pendingWinGs) return 'pendingWin';
  const canContinue = !result?.hasDecision;
  if (drawReveal?.fromRest && (aoe || canContinue)) return 'rest';
  if (drawReveal?.fromTsathogguaSlime && canContinue) return 'slime';
  return 'standard';
}

export function classifyTreasureDodgeSkip(drawReveal, hasDecision, aoe = false) {
  if (drawReveal?.fromRest && (aoe || !hasDecision)) return 'rest';
  if (drawReveal?.fromTsathogguaSlime && (aoe || !hasDecision)) return 'slime';
  return 'standard';
}
