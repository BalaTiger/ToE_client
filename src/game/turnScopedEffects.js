export const TURN_SCOPED_EFFECTS = {
  DAMAGE_BONUS: 'damageBonus',
  GOD_POWER_IMMUNITY: 'godPowerImmunity',
};

const EFFECT_FIELDS = {
  [TURN_SCOPED_EFFECTS.DAMAGE_BONUS]: {
    value: 'damageBonus',
    owner: 'damageBonusTurnOwner',
  },
  [TURN_SCOPED_EFFECTS.GOD_POWER_IMMUNITY]: {
    value: 'godPowerImmuneThisTurn',
    owner: 'godPowerImmuneTurnOwner',
  },
};

export function getCurrentExecutionTurnOwner(gs, fallbackIdx = 0) {
  return gs?.currentTurn ?? fallbackIdx;
}

export function grantTurnScopedEffect(player, effect, turnOwner, value = true) {
  if (!player) return player;
  const fields = EFFECT_FIELDS[effect];
  if (!fields) return player;
  player[fields.value] = value;
  player[fields.owner] = turnOwner;
  return player;
}

export function addTurnScopedDamageBonus(player, turnOwner, amount = 1) {
  if (!player) return player;
  return grantTurnScopedEffect(
    player,
    TURN_SCOPED_EFFECTS.DAMAGE_BONUS,
    turnOwner,
    (player.damageBonus || 0) + amount,
  );
}

export function grantTurnScopedGodPowerImmunity(player, turnOwner) {
  return grantTurnScopedEffect(player, TURN_SCOPED_EFFECTS.GOD_POWER_IMMUNITY, turnOwner, true);
}

export function clearExpiredTurnScopedEffects(players = [], endingTurn) {
  return players.map(player => {
    if (!player) return player;
    const next = { ...player };
    Object.values(EFFECT_FIELDS).forEach(fields => {
      if (next[fields.owner] === endingTurn) {
        delete next[fields.value];
        delete next[fields.owner];
      }
    });
    return next;
  });
}
