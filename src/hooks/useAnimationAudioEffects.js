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
}
