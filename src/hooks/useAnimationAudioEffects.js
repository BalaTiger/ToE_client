import { useCallback, useEffect, useRef } from 'react';
import { getVolcanoImpactTimes } from '../components/anim/volcanoTiming';
import { getZoneCardPolarity } from '../game/coreUtils';

const ANIMATION_AUDIO_DELAY = {
  APOPHIS_ECLIPSE: 180,
  THROW_STONE_ROLLING: 1040,
};
const CARD_FLIP_TRAVEL_MS = 650;
const CARD_FLIP_POSITIVE_CHIME_DELAY_MS = 640;
const CARD_FLIP_NEGATIVE_BURST_DELAY_MS = 1150;
const CARD_FLIP_GOD_HIGHLIGHT_DELAY_MS = 1260;
const EARTHQUAKE_SHAKE_DURATION_MS = 2500;
const VOLCANO_ANIMATION_DURATION_MS = 2500;
const SINGLE_CARD_MOVE_TYPES = new Set([
  'BURY_TO_DECK',
  'ZHU_HIDE_CARD',
  'HUNT_REVEAL_CARD',
  'GEOMAGNETIC_RESTORE_SHUFFLE',
]);

function getSnakeTrapAttackCount(anim) {
  if (Array.isArray(anim?.assignmentHits) && anim.assignmentHits.length) return anim.assignmentHits.length;
  if (Array.isArray(anim?.assignmentList) && anim.assignmentList.length) {
    return anim.assignmentList.reduce((sum, item) => sum + Math.max(1, item?.count || 1), 0);
  }
  return Math.max(1, anim?.totalLayers || 1);
}

function getCardTransferMoveCount(anim) {
  if (Array.isArray(anim?.transfers) && anim.transfers.length) {
    return anim.transfers.reduce((sum, transfer) => sum + Math.max(1, transfer?.count || 1), 0);
  }
  return Math.max(1, anim?.count || 1);
}

function getDiscardMoveCount(anim) {
  if (Array.isArray(anim?.cards) && anim.cards.length) return anim.cards.length;
  return Math.max(1, anim?.count || 1);
}

function isNegativeDrawCardFlip(anim) {
  if (anim?.type !== 'DRAW_CARD' || !anim.card) return false;
  if (anim.card.isGod) return false;
  if (anim.triggerName === '检定牌') return false;
  return getZoneCardPolarity(anim.card) === 'negative';
}

function isPositiveDrawCardFlip(anim) {
  if (anim?.type !== 'DRAW_CARD' || !anim.card) return false;
  if (anim.card.isGod || anim.triggerName === '检定牌') return false;
  return getZoneCardPolarity(anim.card) === 'positive';
}

function isNeutralDrawCardFlip(anim) {
  if (anim?.type !== 'DRAW_CARD' || !anim.card) return false;
  if (anim.card.isGod || anim.triggerName === '检定牌') return false;
  return getZoneCardPolarity(anim.card) === 'neutral';
}

function getPositiveDrawCardFlipSoundDelay(anim) {
  return (anim?.skipTravel ? 0 : CARD_FLIP_TRAVEL_MS) + CARD_FLIP_POSITIVE_CHIME_DELAY_MS;
}

function getNegativeDrawCardFlipSoundDelay(anim) {
  return (anim?.skipTravel ? 0 : CARD_FLIP_TRAVEL_MS) + CARD_FLIP_NEGATIVE_BURST_DELAY_MS;
}

function getGodHighlightSoundDelay(anim) {
  return (anim?.skipTravel ? 0 : CARD_FLIP_TRAVEL_MS) + CARD_FLIP_GOD_HIGHLIGHT_DELAY_MS;
}

export function useAnimationAudioEffects({
  anim,
  playApophisEclipseSound,
  playThrowStoneThrowSound,
  playThrowStoneRollingSound,
  playEarthquakeSound,
  playGeomagneticReversalSound,
  playStartledBatsSound,
  playNightWindSound,
  playRopeSound,
  playUndergroundSpringDropletSound,
  playVolcanoSound,
  playSemiMaterialSound,
  playBurrowingWormSound,
  playSnakeTrapSound,
  playCthRlyehDreamSound,
  playGodPowerBlockedSound,
  playTsgSlimePopSound,
  playOneCardShiftSound,
  playMultiCardShiftSound,
  playDiceRollSound,
  playTurnStartSound,
  playSkillHuntSound,
  playSkillSwapSound,
  playSkillBewitchSound,
  playGodHighlightSound,
  playVritraImmortalRevealSound,
  playPositiveCardFlipSound,
  playNeutralCardFlipSound,
  playCaveDuelSound,
  playWheelSpinSound,
  playBlackGoatRunSound,
  playBlackGoatPulseSound,
  playNegativeCardFlipSound,
}) {
  const detachedAudioCleanupsRef = useRef({});

  const playDetachedAnimationSound = useCallback((key, play) => {
    detachedAudioCleanupsRef.current[key]?.();
    const cleanup = play?.();
    if (typeof cleanup === 'function') {
      detachedAudioCleanupsRef.current[key] = cleanup;
    } else {
      delete detachedAudioCleanupsRef.current[key];
    }
  }, []);

  useEffect(() => () => {
    Object.values(detachedAudioCleanupsRef.current).forEach(cleanup => {
      try { cleanup?.(); } catch { /* ignore */ }
    });
    detachedAudioCleanupsRef.current = {};
  }, []);

  useEffect(() => {
    if (anim?.type !== 'APOPHIS_ECLIPSE') return undefined;
    const timer = setTimeout(() => playApophisEclipseSound(), ANIMATION_AUDIO_DELAY.APOPHIS_ECLIPSE);
    return () => clearTimeout(timer);
  }, [anim, playApophisEclipseSound]);

  useEffect(() => {
    if (anim?.type !== 'THROW_STONE') return undefined;
    playThrowStoneThrowSound?.();
    const timer = setTimeout(() => {
      playThrowStoneRollingSound?.({ hit: (anim?.damage || 0) > 0 });
    }, ANIMATION_AUDIO_DELAY.THROW_STONE_ROLLING);
    return () => clearTimeout(timer);
  }, [anim, playThrowStoneThrowSound, playThrowStoneRollingSound]);

  useEffect(() => {
    if (anim?.type !== 'EARTHQUAKE') return undefined;
    return playEarthquakeSound?.({ durationMs: EARTHQUAKE_SHAKE_DURATION_MS });
  }, [anim, playEarthquakeSound]);

  useEffect(() => {
    if (anim?.type !== 'GEOMAGNETIC_REVERSAL') return undefined;
    return playGeomagneticReversalSound?.();
  }, [anim, playGeomagneticReversalSound]);

  useEffect(() => {
    if (anim?.type !== 'STARTLED_BATS') return undefined;
    return playStartledBatsSound?.();
  }, [anim, playStartledBatsSound]);

  useEffect(() => {
    if (anim?.type !== 'NIGHT_WIND') return undefined;
    // The wind tail intentionally outlives the 1.65s sandstorm overlay. Keep
    // it detached so unmounting NIGHT_WIND cannot cancel its smooth fade.
    playDetachedAnimationSound('nightWind', playNightWindSound);
    return undefined;
  }, [anim, playNightWindSound, playDetachedAnimationSound]);

  useEffect(() => {
    if (anim?.type !== 'CARD_TRANSFER' || anim?.effect !== 'damageLink') return undefined;
    playRopeSound?.();
    return undefined;
  }, [anim, playRopeSound]);

  useEffect(() => {
    if (!anim) return undefined;
    if (anim.type === 'DISCARD') {
      if (getDiscardMoveCount(anim) > 1) playMultiCardShiftSound?.();
      else playOneCardShiftSound?.();
      return undefined;
    }
    if (SINGLE_CARD_MOVE_TYPES.has(anim.type)) {
      playOneCardShiftSound?.();
      return undefined;
    }
    if (anim.type === 'CARD_TRANSFER' && anim.effect !== 'damageLink' && anim.effect !== 'blackGoat') {
      const count = getCardTransferMoveCount(anim);
      if (count > 1 || (Array.isArray(anim.transfers) && anim.transfers.length > 1)) {
        playMultiCardShiftSound?.();
      } else {
        playOneCardShiftSound?.();
      }
    }
    return undefined;
  }, [anim, playOneCardShiftSound, playMultiCardShiftSound]);

  useEffect(() => {
    if (anim?.type !== 'CARD_TRANSFER' || anim?.effect !== 'blackGoat') return undefined;
    return playBlackGoatRunSound?.({
      fromPid: anim.fromPid,
      toPid: anim.toPid,
      durationMs: anim.durationMs,
      seatCount: anim.players?.length,
    });
  }, [anim, playBlackGoatRunSound]);

  useEffect(() => {
    if (anim?.type !== 'BLACK_GOAT_PULSE') return undefined;
    return playBlackGoatPulseSound?.();
  }, [anim, playBlackGoatPulseSound]);

  useEffect(() => {
    if (anim?.type !== 'DRAW_CARD' || !anim.card?.isGod) return undefined;
    const timer = setTimeout(() => {
      playDetachedAnimationSound('godHighlight', playGodHighlightSound);
    }, getGodHighlightSoundDelay(anim));
    return () => clearTimeout(timer);
  }, [anim, playGodHighlightSound, playDetachedAnimationSound]);

  useEffect(() => {
    if (!isPositiveDrawCardFlip(anim)) return undefined;
    const timer = setTimeout(() => {
      playDetachedAnimationSound('positiveCardFlip', playPositiveCardFlipSound);
    }, getPositiveDrawCardFlipSoundDelay(anim));
    return () => clearTimeout(timer);
  }, [anim, playPositiveCardFlipSound, playDetachedAnimationSound]);

  useEffect(() => {
    if (!isNeutralDrawCardFlip(anim)) return undefined;
    const timer = setTimeout(() => {
      playDetachedAnimationSound('neutralCardFlip', playNeutralCardFlipSound);
    }, getPositiveDrawCardFlipSoundDelay(anim));
    return () => clearTimeout(timer);
  }, [anim, playNeutralCardFlipSound, playDetachedAnimationSound]);

  useEffect(() => {
    if (!isNegativeDrawCardFlip(anim)) return undefined;
    const timer = setTimeout(() => {
      playDetachedAnimationSound('negativeCardFlip', playNegativeCardFlipSound);
    }, getNegativeDrawCardFlipSoundDelay(anim));
    return () => clearTimeout(timer);
  }, [anim, playNegativeCardFlipSound, playDetachedAnimationSound]);

  useEffect(() => {
    if (anim?.type !== 'UNDERGROUND_SPRING') return undefined;
    return playUndergroundSpringDropletSound?.();
  }, [anim, playUndergroundSpringDropletSound]);

  useEffect(() => {
    if (anim?.type !== 'VOLCANO') return undefined;
    return playVolcanoSound?.({
      durationMs: VOLCANO_ANIMATION_DURATION_MS,
      impactTimes: getVolcanoImpactTimes(),
    });
  }, [anim, playVolcanoSound]);

  useEffect(() => {
    if (anim?.type !== 'ETHEREALIZE_GAIN') return undefined;
    return playSemiMaterialSound?.();
  }, [anim, playSemiMaterialSound]);

  useEffect(() => {
    if (anim?.type !== 'BURROWING_WORM') return undefined;
    return playBurrowingWormSound?.();
  }, [anim, playBurrowingWormSound]);

  useEffect(() => {
    if (anim?.type !== 'SNAKE_TRAP') return undefined;
    return playSnakeTrapSound?.({ attackCount: getSnakeTrapAttackCount(anim) });
  }, [anim, playSnakeTrapSound]);

  useEffect(() => {
    if (anim?.type !== 'CAVE_DUEL') return undefined;
    const localInvolved = anim.sourceIdx === 0 || anim.targetIdx === 0;
    const localLost = localInvolved && anim.winnerIdx != null && anim.winnerIdx !== 0;
    // The background and result tracks intentionally outlive the 2.6s visual
    // overlay. Keep the whole sequence detached so its own fade timers can
    // finish instead of being cancelled when CAVE_DUEL leaves the queue.
    playDetachedAnimationSound('caveDuel', () => playCaveDuelSound?.({ localLost }));
    return undefined;
  }, [anim, playCaveDuelSound, playDetachedAnimationSound]);

  useEffect(() => {
    if (anim?.type !== 'RANDOM_TARGET') return undefined;
    return playWheelSpinSound?.();
  }, [anim, playWheelSpinSound]);

  useEffect(() => {
    if (anim?.type !== 'CTH_RLYEH_DREAM') return undefined;
    playDetachedAnimationSound('cthRlyehDream', playCthRlyehDreamSound);
    return undefined;
  }, [anim, playCthRlyehDreamSound, playDetachedAnimationSound]);

  useEffect(() => {
    if (anim?.type !== 'GOD_POWER_BLOCKED') return undefined;
    playDetachedAnimationSound('godPowerBlocked', playGodPowerBlockedSound);
    return undefined;
  }, [anim, playGodPowerBlockedSound, playDetachedAnimationSound]);

  useEffect(() => {
    if (anim?.type !== 'VRI_IMMORTAL_REVEAL') return undefined;
    return playVritraImmortalRevealSound?.();
  }, [anim, playVritraImmortalRevealSound]);

  useEffect(() => {
    if (anim?.type !== 'TSG_SLIME_POP') return undefined;
    return playTsgSlimePopSound?.();
  }, [anim, playTsgSlimePopSound]);

  useEffect(() => {
    if (anim?.type !== 'DICE_ROLL') return undefined;
    return playDiceRollSound?.();
  }, [anim, playDiceRollSound]);

  useEffect(() => {
    if (anim?.type !== 'YOUR_TURN') return undefined;
    playDetachedAnimationSound('turnStart', playTurnStartSound);
    return undefined;
  }, [anim, playTurnStartSound, playDetachedAnimationSound]);

  useEffect(() => {
    if (anim?.type !== 'SKILL_SWAP') return undefined;
    return playSkillSwapSound?.();
  }, [anim, playSkillSwapSound]);

  useEffect(() => {
    if (anim?.type !== 'SKILL_BEWITCH') return undefined;
    playDetachedAnimationSound('skillBewitch', playSkillBewitchSound);
    return undefined;
  }, [anim, playSkillBewitchSound, playDetachedAnimationSound]);

  useEffect(() => {
    if (anim?.type !== 'SKILL_HUNT') return undefined;
    return playSkillHuntSound?.();
  }, [anim, playSkillHuntSound]);

  useEffect(() => {
    // ENDLESS_CORRIDOR_TUNNEL sound is triggered by the tunnel overlay mount,
    // so this hook stays intentionally inert to keep dev HMR hook order stable.
    if (anim?.type !== 'ENDLESS_CORRIDOR_TUNNEL') return undefined;
    return undefined;
  }, [anim]);
}
