import { chooseAiDamageLinkTarget } from './ai';
import { getBestCaveDuelCardIndex } from './caveDuel';
import { canGodPowerAffect } from './godPowerImmunity';
import { hasHuntRevealableCard } from './coreUtils';
import {
  canLocalActOnTargetSelectionPhase,
  isLocalCurrentTurn,
  isLocalDrawDecisionPhase,
  isLocalFirstComePicker,
  isLocalGodChoicePhase,
  isLocalNyaBorrowPhase,
  isLocalPublicCardPickPhase,
  isLocalSameAbyssTargetPhase,
  isLocalSeatIndex,
  isLocalSphinxGuessPhase,
  isLocalTortoiseSelectPhase,
  isLocalTreasureAoEDodgePhase,
  isLocalTreasureDodgePhase,
  isMultiplayerGame,
} from './rotateState';
import {
  getPendingZhuHideCardForState,
  isLocalZhuHideDecisionPhase,
} from '../multiplayer/multiplayerRemoteReplayExecutor';

export function getMpDecisionKey(state) {
  const ad = state?.abilityData || {};
  return [
    state?.phase || '', state?.currentTurn ?? '', state?._turnKey ?? '',
    state?.drawReveal?.card?.id || '', ad.pickIndex ?? '', ad.swapTi ?? '',
    ad.targetIdx ?? '', ad.caveDuelSource ?? '', ad.caveDuelTarget ?? '',
    ad.huntTi ?? '', ad.roseThornSource ?? '', ad.peekHandSource ?? '',
    ad.damageLinkSource ?? '', ad.targetIndex ?? '', ad.playerIndex ?? '', ad.source ?? '',
    ad.zhuResolved ? 'zhuGodDone' : '',
    state?.drawReveal?.zhuResolved ? 'zhuDrawDone' : '',
    getPendingZhuHideCardForState(state)?.id || '', state?.log?.length ?? 0,
  ].join(':');
}

export function isLocalMpDrawChoicePhase(state) {
  if (!isLocalDrawDecisionPhase(state)) return false;
  const dr = state?.drawReveal;
  if (!dr?.needsDecision || dr.forcedKeep || dr.fromRest) return false;
  return !getPendingZhuHideCardForState(state);
}

export function isLocalMpGodChoicePhase(state) {
  if (!isLocalGodChoicePhase(state)) return false;
  if (state?.abilityData?.fromRest) return false;
  return !getPendingZhuHideCardForState(state);
}

export function getDefaultTargetForMpDecision(state) {
  if (!state) return null;
  const ad = state.abilityData || {};
  const players = state.players || [];
  const firstValid = list => (Array.isArray(list) ? list : [])
    .find(index => players[index] && !players[index].isDead) ?? null;
  if (state.phase === 'SWAP_SELECT_TARGET') return firstValid(players.map((_, i) => i).filter(i => i !== 0 && players[i]?.hand?.length));
  if (state.phase === 'HUNT_SELECT_TARGET') return firstValid(players.map((_, i) => i).filter(i => i !== 0 && hasHuntRevealableCard(players[i]) && !(state.huntAbandoned || []).includes(i)));
  if (state.phase === 'BEWITCH_SELECT_TARGET') return firstValid(players.map((_, i) => i).filter(i => i !== 0));
  if (state.phase === 'ZONE_SWAP_SELECT_TARGET') return firstValid(players.map((_, i) => i).filter(i => i !== 0));
  if (state.phase === 'PEEK_HAND_SELECT_TARGET') return firstValid(ad.peekHandTargets);
  if (state.phase === 'CAVE_DUEL_SELECT_TARGET') return firstValid(ad.caveDuelTargets);
  if (state.phase === 'DAMAGE_LINK_SELECT_TARGET') return chooseAiDamageLinkTarget(players, ad.damageLinkSource, ad.damageLinkTargets) ?? firstValid(ad.damageLinkTargets);
  if (state.phase === 'ROSE_THORN_SELECT_TARGET') return firstValid(ad.roseThornTargets);
  if (state.phase === 'MULTIPLY_SELECT_TARGET') return firstValid(players.map((_, i) => i).filter(i => i !== 0));
  if (state.phase === 'SHU_SELECT_TARGET') return firstValid(players.map((_, i) => i).filter(i => canGodPowerAffect(players[i])));
  if (state.phase === 'ETHEREALIZE_SELECT_TARGET') return firstValid(ad.adjacentTargets);
  if (state.phase === 'IGNITE_TORCH_DISCARD') return firstValid([ad.playerIndex]);
  if (state.phase === 'ALBINO_CREATURE_SELECT_CARD') return firstValid([ad.playerIndex]);
  return null;
}

export function getDefaultHandCardIndexForMpDecision(state) {
  const hand = state?.players?.[0]?.hand || [];
  if (!hand.length) return -1;
  if (state?.phase === 'ALBINO_CREATURE_SELECT_CARD') {
    const fireCardIds = state?.abilityData?.fireCardIds || [];
    return hand.findIndex(card => fireCardIds.includes(card?.id));
  }
  if (state?.phase !== 'CAVE_DUEL_SELECT_CARD' && state?.phase !== 'CAVE_DUEL_WAIT_REVEAL') return 0;
  return getBestCaveDuelCardIndex(hand);
}

export function getBuryAliveLocalPendingTarget(state) {
  const ad = state?.abilityData || {};
  const choices = ad.buryAliveChoices;
  return Array.isArray(choices)
    ? (ad.targets || []).find(index => isLocalSeatIndex(index) && !choices[index])
    : (ad.targets || [])[ad.targetIndex || 0];
}

export function getRandomHandCardIndex(hand = [], random = Math.random) {
  if (!hand.length) return -1;
  return Math.floor(random() * hand.length);
}

export function isLocalCaveDuelCardDecisionPhase(state) {
  if (!state || !['CAVE_DUEL_SELECT_CARD', 'CAVE_DUEL_WAIT_REVEAL'].includes(state.phase)) return false;
  const ad = state.abilityData || {};
  if (isLocalSeatIndex(ad.caveDuelSource)) return !ad.sourceCard;
  if (isLocalSeatIndex(ad.caveDuelTarget)) return !ad.targetCard;
  return false;
}

export function isLocalMpDecisionPhase(state) {
  if (!state || state.gameOver) return false;
  if (isLocalZhuHideDecisionPhase(state)) return true;
  if (isLocalMpDrawChoicePhase(state)) return true;
  if (isLocalMpGodChoicePhase(state)) return true;
  if (isLocalTreasureDodgePhase(state)) return true;
  if (isLocalTreasureAoEDodgePhase(state)) return true;
  if (isLocalNyaBorrowPhase(state)) return true;
  if (isLocalTortoiseSelectPhase(state)) return !!state.abilityData?.selectableKeys?.length;
  if (isLocalFirstComePicker(state)) return true;
  if (state.phase === 'SWAP_STEAL_CARD' && isLocalCurrentTurn(state)) return !!state.players?.[state.abilityData?.swapTi]?.hand?.length;
  if (isLocalPublicCardPickPhase(state)) return true;
  if (state.phase === 'GRAVE_DIG_SELECT' && isLocalSeatIndex(state.abilityData?.playerIndex)) return !!state.abilityData?.godCards?.length;
  if (isLocalSameAbyssTargetPhase(state)) return true;
  if (isLocalSphinxGuessPhase(state)) return true;
  if (state.phase === 'TSG_SLIME_BALANCE') return isLocalSeatIndex(state.abilityData?.targetIdx);
  if (state.phase === 'ETHEREALIZE_DECISION') return isLocalSeatIndex(state.abilityData?.targetIdx);
  if (canLocalActOnTargetSelectionPhase(state)) return getDefaultTargetForMpDecision(state) != null;
  if (state.phase === 'BURY_ALIVE_SELECT') {
    const target = getBuryAliveLocalPendingTarget(state);
    return isLocalSeatIndex(target) && getDefaultHandCardIndexForMpDecision(state) >= 0;
  }
  if (state.phase === 'IGNITE_TORCH_DISCARD' && isLocalSeatIndex(state.abilityData?.playerIndex)) return getDefaultHandCardIndexForMpDecision(state) >= 0;
  if (state.phase === 'ALBINO_CREATURE_SELECT_CARD' && isLocalSeatIndex(state.abilityData?.playerIndex)) return getDefaultHandCardIndexForMpDecision(state) >= 0;
  if (state.phase === 'DECIPHER_STONE_CARVING' && isLocalSeatIndex(state.abilityData?.playerIndex)) return true;
  if (['CAVE_DUEL_SELECT_CARD', 'CAVE_DUEL_WAIT_REVEAL'].includes(state.phase) && isLocalCaveDuelCardDecisionPhase(state)) {
    return getDefaultHandCardIndexForMpDecision(state) >= 0;
  }
  return false;
}

export function isMpBlockingDecisionPhase(state) {
  if (!isMultiplayerGame(state)) return false;
  if (state?.phase === 'BURY_ALIVE_SELECT' && Array.isArray(state.abilityData?.buryAliveChoices)) {
    return (state.abilityData.targets || []).some(index => !state.abilityData.buryAliveChoices[index]);
  }
  if (['CAVE_DUEL_SELECT_CARD', 'CAVE_DUEL_WAIT_REVEAL'].includes(state?.phase)) {
    const ad = state.abilityData || {};
    return !ad.sourceCard || !ad.targetCard;
  }
  return isLocalMpDecisionPhase(state);
}
