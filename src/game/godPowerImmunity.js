export function hasGodPowerImmunity(player) {
  return !!player?.godPowerImmuneThisTurn;
}

export function canGodPowerAffect(player) {
  return !hasGodPowerImmunity(player);
}
