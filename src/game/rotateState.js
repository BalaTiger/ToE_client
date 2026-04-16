const ROTATE_GS_TOP_LEVEL_INDEX_FIELDS = ['currentTurn'];
const ROTATE_GS_TOP_LEVEL_INDEX_ARRAY_FIELDS = ['huntAbandoned'];
const ROTATE_GAME_OVER_INDEX_FIELDS = ['winnerIdx', 'winnerIdx2'];
const ROTATE_DRAW_REVEAL_INDEX_FIELDS = ['drawerIdx'];
const ROTATE_ABILITYDATA_INDEX_FIELDS = [
  'drawerIdx',
  'swapTi',
  'huntTi',
  'huntingAI',
  'peekHandSource',
  'caveDuelSource',
  'caveDuelTarget',
  'damageLinkSource',
  'roseThornSource',
  'pickSource',
];
const ROTATE_ABILITYDATA_INDEX_ARRAY_FIELDS = [
  'peekHandTargets',
  'caveDuelTargets',
  'damageLinkTargets',
  'roseThornTargets',
  'pickOrder',
];

function rotateIndexedFields(obj, fields, rotateIndex) {
  if (!obj) return obj;
  let changed = false;
  const next = { ...obj };
  fields.forEach(field => {
    if (next[field] != null) {
      next[field] = rotateIndex(next[field]);
      changed = true;
    }
  });
  return changed ? next : obj;
}

function rotateIndexedArrayFields(obj, fields, rotateIndex) {
  if (!obj) return obj;
  let changed = false;
  const next = { ...obj };
  fields.forEach(field => {
    if (Array.isArray(next[field])) {
      next[field] = next[field].map(rotateIndex);
      changed = true;
    }
  });
  return changed ? next : obj;
}

function rotateAbilityDataForViewer(abilityData, rotateIndex) {
  if (!abilityData) return abilityData;
  const rotatedIndices = rotateIndexedFields(abilityData, ROTATE_ABILITYDATA_INDEX_FIELDS, rotateIndex);
  return rotateIndexedArrayFields(rotatedIndices, ROTATE_ABILITYDATA_INDEX_ARRAY_FIELDS, rotateIndex);
}

function rotateTopLevelGsFieldsForViewer(gs, rotateIndex) {
  if (!gs) return gs;
  const rotatedIndices = rotateIndexedFields(gs, ROTATE_GS_TOP_LEVEL_INDEX_FIELDS, rotateIndex);
  return rotateIndexedArrayFields(rotatedIndices, ROTATE_GS_TOP_LEVEL_INDEX_ARRAY_FIELDS, rotateIndex);
}

function rotateGameOverForViewer(gameOver, rotateIndex) {
  return rotateIndexedFields(gameOver, ROTATE_GAME_OVER_INDEX_FIELDS, rotateIndex);
}

function rotateDrawRevealForViewer(drawReveal, rotateIndex) {
  return rotateIndexedFields(drawReveal, ROTATE_DRAW_REVEAL_INDEX_FIELDS, rotateIndex);
}

export function rotateGsForViewer(gs, myIndex) {
  if (!gs || myIndex === 0) return gs;
  const N = gs.players.length;
  const rotateIndex = i => (i < 0 ? i : (i - myIndex + N) % N);
  const players = [...gs.players.slice(myIndex), ...gs.players.slice(0, myIndex)];
  const rotatedTopLevel = rotateTopLevelGsFieldsForViewer(gs, rotateIndex);
  const gameOver = rotateGameOverForViewer(gs.gameOver, rotateIndex);
  const drawReveal = rotateDrawRevealForViewer(gs.drawReveal, rotateIndex);
  const abilityData = rotateAbilityDataForViewer(gs.abilityData || {}, rotateIndex);
  return { ...rotatedTopLevel, players, gameOver, abilityData, drawReveal };
}

export function derotateGs(gs, myIndex) {
  if (!gs || myIndex === 0) return gs;
  const N = gs.players.length;
  return rotateGsForViewer(gs, (N - myIndex) % N);
}

export function isLocalSeatIndex(idx) {
  return idx === 0;
}

export function isMultiplayerGame(gs) {
  return !!gs?._isMP;
}

export function isAiSeat(gs, idx) {
  return !isMultiplayerGame(gs) && idx != null && !isLocalSeatIndex(idx);
}

export function isLocalCurrentTurn(gs) {
  return isLocalSeatIndex(gs?.currentTurn);
}

export function isAiCurrentTurn(gs) {
  return isAiSeat(gs, gs?.currentTurn);
}

export function localDisplayName(idx, fallbackName = '该角色') {
  return isLocalSeatIndex(idx) ? '你' : fallbackName;
}

export function isLocalActorSeat(gs, idx, fallbackIdx = gs?.currentTurn) {
  return isLocalSeatIndex(idx ?? fallbackIdx);
}

export function isLocalDrawDecisionPhase(gs) {
  return gs?.phase === 'DRAW_REVEAL' && gs.drawReveal?.needsDecision && isLocalActorSeat(gs, gs.drawReveal?.drawerIdx, -1);
}

export function isLocalGodChoicePhase(gs) {
  return gs?.phase === 'GOD_CHOICE' && gs.abilityData?.godCard && isLocalActorSeat(gs, gs.abilityData?.drawerIdx);
}

export function isLocalFirstComePicker(gs) {
  const currentPickerIdx = gs?.abilityData?.pickOrder?.[gs?.abilityData?.pickIndex || 0];
  return gs?.phase === 'FIRST_COME_PICK_SELECT' && isLocalSeatIndex(currentPickerIdx);
}

export function isLocalDamageLinkSourcePhase(gs) {
  return gs?.phase === 'DAMAGE_LINK_SELECT_TARGET' && isLocalActorSeat(gs, gs?.abilityData?.damageLinkSource);
}

export function canLocalActOnTargetSelectionPhase(gs) {
  const phase = gs?.phase;
  return (
    (
      ['SWAP_SELECT_TARGET', 'HUNT_SELECT_TARGET', 'BEWITCH_SELECT_TARGET', 'ZONE_SWAP_SELECT_TARGET', 'PEEK_HAND_SELECT_TARGET', 'CAVE_DUEL_SELECT_TARGET', 'ROSE_THORN_SELECT_TARGET'].includes(phase)
      && isLocalCurrentTurn(gs)
    )
    || isLocalDamageLinkSourcePhase(gs)
  );
}

export function isLocalSwapGivePhase(gs) {
  return gs?.phase === 'SWAP_GIVE_CARD' && isLocalCurrentTurn(gs);
}

export function isLocalBewitchCardPhase(gs) {
  return gs?.phase === 'BEWITCH_SELECT_CARD' && isLocalCurrentTurn(gs);
}

export function isLocalTortoiseSelectPhase(gs) {
  return gs?.phase === 'TORTOISE_ORACLE_SELECT' && isLocalCurrentTurn(gs);
}

export function isLocalHuntConfirmPhase(gs) {
  return gs?.phase === 'HUNT_CONFIRM' && isLocalCurrentTurn(gs);
}

export function isLocalPublicCardPickPhase(gs) {
  return gs?.phase === 'HUNT_SELECT_CARD_FROM_PUBLIC' && isLocalCurrentTurn(gs);
}

export function isLocalHuntTargetSeat(gs) {
  return isLocalSeatIndex(gs?.abilityData?.huntTi);
}

export function isLocalCaveDuelTargetSeat(gs) {
  return isLocalSeatIndex(gs?.abilityData?.caveDuelTarget);
}

export function isLocalNyaBorrowPhase(gs) {
  return gs?.phase === 'NYA_BORROW' && isLocalCurrentTurn(gs);
}

export function isLocalTreasureDodgePhase(gs) {
  return gs?.phase === 'TREASURE_DODGE_DECISION' && isLocalCurrentTurn(gs);
}

export function isLocalTreasureAoEDodgePhase(gs) {
  return gs?.phase === 'TREASURE_AOE_DODGE_DECISION' && isLocalCurrentTurn(gs);
}

export function isLocalWinnerSeat(gameOver) {
  return isLocalSeatIndex(gameOver?.winnerIdx) || isLocalSeatIndex(gameOver?.winnerIdx2);
}
