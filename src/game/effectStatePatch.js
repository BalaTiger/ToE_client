const TARGET_DECISIONS = [
  ['peekHandTargets', 'peekHandSource', 'PEEK_HAND_SELECT_TARGET'],
  ['caveDuelTargets', 'caveDuelSource', 'CAVE_DUEL_SELECT_TARGET'],
  ['damageLinkTargets', 'damageLinkSource', 'DAMAGE_LINK_SELECT_TARGET'],
  ['roseThornTargets', 'roseThornSource', 'ROSE_THORN_SELECT_TARGET'],
];

const ABILITY_DECISION_PHASES = {
  tortoiseOracleSelect: 'TORTOISE_ORACLE_SELECT',
  firstComePick: 'FIRST_COME_PICK_SELECT',
  sameAbyssChoice: 'SAME_ABYSS_SELECT',
  sphinxGuess: 'SPHINX_GUESS',
};

export function hasEffectDecisionState(statePatch) {
  if (!statePatch) return false;
  if (statePatch.abilityData?.type && ABILITY_DECISION_PHASES[statePatch.abilityData.type]) return true;
  return TARGET_DECISIONS.some(([targetsKey]) => !!statePatch[targetsKey]);
}

export function deriveEffectDecisionState(statePatch, {
  baseAbilityData = {},
  fallbackPhase = 'ACTION',
  leadingPhase = null,
  leadingAbilityData = {},
  extraAbilityData = {},
  turnOwner = null,
} = {}) {
  const abilityType = statePatch?.abilityData?.type;
  let phase = leadingPhase || fallbackPhase;
  if (!leadingPhase) {
    const targetDecision = TARGET_DECISIONS.find(([targetsKey]) => !!statePatch?.[targetsKey]);
    phase = targetDecision?.[2] || ABILITY_DECISION_PHASES[abilityType] || fallbackPhase;
  }

  const abilityData = {
    ...baseAbilityData,
    ...leadingAbilityData,
    ...(statePatch?.abilityData || {}),
    ...extraAbilityData,
  };

  TARGET_DECISIONS.forEach(([targetsKey, sourceKey]) => {
    if (statePatch?.[targetsKey]) {
      abilityData[targetsKey] = statePatch[targetsKey];
      abilityData[sourceKey] = statePatch[sourceKey];
    }
  });

  if (turnOwner != null && abilityType && ABILITY_DECISION_PHASES[abilityType]) {
    abilityData._turnOwner = turnOwner;
  }

  return { phase, abilityData, hasDecision: phase !== fallbackPhase || hasEffectDecisionState(statePatch) };
}

