const CURRENT_TURN_DECISION_PHASES = new Set([
  'SWAP_SELECT_TARGET',
  'SWAP_STEAL_CARD',
  'SWAP_SELECT_TARGET_CARD',
  'SWAP_GIVE_CARD',
  'HUNT_SELECT_TARGET',
  'HUNT_CONFIRM',
  'HUNT_SELECT_CARD_FROM_PUBLIC',
  'BEWITCH_SELECT_CARD',
  'BEWITCH_SELECT_TARGET',
  'MULTIPLY_SELECT_TARGET',
  'NYA_BORROW',
]);

const TARGET_SELECTION_OWNER_FIELD = {
  ZONE_SWAP_SELECT_TARGET: 'zoneSwapSource',
  PEEK_HAND_SELECT_TARGET: 'peekHandSource',
  CAVE_DUEL_SELECT_TARGET: 'caveDuelSource',
  DAMAGE_LINK_SELECT_TARGET: 'damageLinkSource',
  ROSE_THORN_SELECT_TARGET: 'roseThornSource',
  SHU_SELECT_TARGET: 'shuChooserIdx',
  ETHEREALIZE_SELECT_TARGET: 'targetIdx',
};

const CURRENT_TURN_TARGET_SELECTION_PHASES = [
  'SWAP_SELECT_TARGET',
  'HUNT_SELECT_TARGET',
  'BEWITCH_SELECT_TARGET',
  'MULTIPLY_SELECT_TARGET',
];

export const TARGET_SELECTION_PHASES = new Set([
  ...CURRENT_TURN_TARGET_SELECTION_PHASES,
  ...Object.keys(TARGET_SELECTION_OWNER_FIELD),
]);

const PLAYER_INDEX_DECISION_PHASES = new Set([
  'TORTOISE_ORACLE_SELECT',
  'GRAVE_DIG_SELECT',
  'IGNITE_TORCH_DISCARD',
  'ALBINO_CREATURE_SELECT_CARD',
  'DECIPHER_STONE_CARVING',
  'SPHINX_GUESS',
]);

const PUBLIC_READ_ONLY_PHASES = new Set([
  'DRAW_REVEAL',
  'GOD_CHOICE',
  'TORTOISE_ORACLE_SELECT',
  'FIRST_COME_PICK_SELECT',
  'GRAVE_DIG_SELECT',
  'SAME_ABYSS_SELECT',
  'SPHINX_GUESS',
  'DECIPHER_STONE_CARVING',
]);

function validSeat(index) {
  return Number.isInteger(index) && index >= 0;
}

function uniqueSeats(indices) {
  return [...new Set(indices.filter(validSeat))];
}

export function getDecisionOwnerSeats(gs) {
  if (!gs) return [];
  const phase = gs.phase;
  const ad = gs.abilityData || {};
  const currentTurn = gs.currentTurn;

  if (CURRENT_TURN_DECISION_PHASES.has(phase)) return uniqueSeats([currentTurn]);
  if (phase === 'DRAW_SELECT_TARGET') return uniqueSeats([gs.drawReveal?.drawerIdx ?? ad.drawerIdx ?? currentTurn]);
  if (TARGET_SELECTION_OWNER_FIELD[phase]) {
    return uniqueSeats([ad[TARGET_SELECTION_OWNER_FIELD[phase]] ?? currentTurn]);
  }
  if (PLAYER_INDEX_DECISION_PHASES.has(phase)) return uniqueSeats([ad.playerIndex ?? currentTurn]);

  switch (phase) {
    case 'DRAW_REVEAL':
      return uniqueSeats([gs.drawReveal?.drawerIdx ?? currentTurn]);
    case 'GOD_CHOICE':
      return uniqueSeats([ad.drawerIdx ?? currentTurn]);
    case 'FIRST_COME_PICK_SELECT':
      return uniqueSeats([ad.pickOrder?.[ad.pickIndex || 0]]);
    case 'SAME_ABYSS_SELECT':
    case 'TSG_SLIME_BALANCE':
    case 'ETHEREALIZE_DECISION':
      return uniqueSeats([ad.targetIdx]);
    case 'TREASURE_DODGE_DECISION':
    case 'TREASURE_AOE_DODGE_DECISION':
      return uniqueSeats([gs.drawReveal?.drawerIdx ?? ad.playerIndex ?? currentTurn]);
    case 'BURY_ALIVE_SELECT': {
      if (Array.isArray(ad.buryAliveChoices)) {
        return uniqueSeats((ad.targets || []).filter(index => !ad.buryAliveChoices[index]));
      }
      return uniqueSeats([(ad.targets || [])[ad.targetIndex || 0]]);
    }
    case 'CAVE_DUEL_SELECT_CARD':
    case 'CAVE_DUEL_WAIT_REVEAL':
      return uniqueSeats([
        !ad.sourceCard ? ad.caveDuelSource : null,
        !ad.targetCard ? ad.caveDuelTarget : null,
      ]);
    case 'PLAYER_REVEAL_FOR_HUNT':
      return [0];
    case 'HUNT_WAIT_REVEAL':
      return uniqueSeats([ad.huntTi]);
    case 'ZHU_HIDE_AI_DRAW':
      return uniqueSeats([gs.zhuLight?.ownerIdx ?? currentTurn]);
    case 'DISCARD_PHASE':
      return uniqueSeats([currentTurn]);
    default:
      return [];
  }
}

export function getDecisionContext(gs, { isSpectating = false } = {}) {
  const ownerSeats = getDecisionOwnerSeats(gs);
  const isDecision = ownerSeats.length > 0;
  const localOwnsDecision = ownerSeats.includes(0);
  const localCanAct = isDecision && localOwnsDecision && !isSpectating;
  let presentation = 'hidden';

  if (isDecision) {
    if (localCanAct) presentation = 'interactive';
    else if (PUBLIC_READ_ONLY_PHASES.has(gs?.phase) || isSpectating) presentation = 'readOnly';
    else if (gs?._isMP) presentation = 'waiting';
  }

  return {
    isDecision,
    localCanAct,
    localOwnsDecision,
    ownerSeats,
    presentation,
  };
}

export function isTargetSelectionDecisionPhase(phase) {
  return TARGET_SELECTION_PHASES.has(phase);
}
