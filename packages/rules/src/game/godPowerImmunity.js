export function hasGodPowerImmunity(player) {
  return !!player?.godPowerImmuneThisTurn;
}

export function canGodPowerAffect(player) {
  return !hasGodPowerImmunity(player);
}

export function buildGodPowerBlockedLog(playerOrName) {
  const name = typeof playerOrName === 'string'
    ? playerOrName
    : playerOrName?.name || '该角色';
  return `【引燃火把】${name} 本回合不受邪神之力影响`;
}
