import { useCallback, useEffect, useRef } from 'react';
import { getVolcanoImpactTimes } from '../components/anim/volcanoTiming';

const ANIMATION_AUDIO_DELAY = {
  APOPHIS_ECLIPSE: 180,
  THROW_STONE_ROLLING: 1040,
};
const EARTHQUAKE_SHAKE_DURATION_MS = 2500;
const VOLCANO_ANIMATION_DURATION_MS = 2500;

function getSnakeTrapAttackCount(anim) {
  if (Array.isArray(anim?.assignmentHits) && anim.assignmentHits.length) return anim.assignmentHits.length;
  if (Array.isArray(anim?.assignmentList) && anim.assignmentList.length) {
    return anim.assignmentList.reduce((sum, item) => sum + Math.max(1, item?.count || 1), 0);
  }
  return Math.max(1, anim?.totalLayers || 1);
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
    return playNightWindSound?.();
  }, [anim, playNightWindSound]);

  useEffect(() => {
    if (anim?.type !== 'CARD_TRANSFER' || anim?.effect !== 'damageLink') return undefined;
    playRopeSound?.();
    return undefined;
  }, [anim, playRopeSound]);

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
    // ENDLESS_CORRIDOR_TUNNEL sound is triggered by the tunnel overlay mount,
    // so this hook stays intentionally inert to keep dev HMR hook order stable.
    if (anim?.type !== 'ENDLESS_CORRIDOR_TUNNEL') return undefined;
    return undefined;
  }, [anim]);
}
