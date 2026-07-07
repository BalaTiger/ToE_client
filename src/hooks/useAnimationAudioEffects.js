import { useEffect } from 'react';
import { getVolcanoImpactTimes } from '../components/anim/volcanoTiming';

const ANIMATION_AUDIO_DELAY = {
  APOPHIS_ECLIPSE: 180,
  THROW_STONE_ROLLING: 1040,
};
const EARTHQUAKE_SHAKE_DURATION_MS = 2500;
const VOLCANO_ANIMATION_DURATION_MS = 2500;

export function useAnimationAudioEffects({
  anim,
  playApophisEclipseSound,
  playThrowStoneThrowSound,
  playThrowStoneRollingSound,
  playEarthquakeSound,
  playGeomagneticReversalSound,
  playStartledBatsSound,
  playRopeSound,
  playUndergroundSpringDropletSound,
  playVolcanoSound,
}) {
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
    // ENDLESS_CORRIDOR_TUNNEL sound is triggered by the tunnel overlay mount,
    // so this hook stays intentionally inert to keep dev HMR hook order stable.
    if (anim?.type !== 'ENDLESS_CORRIDOR_TUNNEL') return undefined;
    return undefined;
  }, [anim]);
}
