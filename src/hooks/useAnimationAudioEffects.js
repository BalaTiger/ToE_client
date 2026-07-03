import { useEffect } from 'react';

const ANIMATION_AUDIO_DELAY = {
  APOPHIS_ECLIPSE: 180,
  THROW_STONE_ROLLING: 1040,
};

export function useAnimationAudioEffects({
  anim,
  playApophisEclipseSound,
  playThrowStoneThrowSound,
  playThrowStoneRollingSound,
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
    // ENDLESS_CORRIDOR_TUNNEL sound is triggered by the tunnel overlay mount,
    // so this hook stays intentionally inert to keep dev HMR hook order stable.
    if (anim?.type !== 'ENDLESS_CORRIDOR_TUNNEL') return undefined;
    return undefined;
  }, [anim]);
}
