import { useEffect } from 'react';

const ANIMATION_AUDIO_DELAY = {
  APOPHIS_ECLIPSE: 180,
};

export function useAnimationAudioEffects({ anim, playApophisEclipseSound }) {
  useEffect(() => {
    if (anim?.type !== 'APOPHIS_ECLIPSE') return undefined;
    const timer = setTimeout(() => playApophisEclipseSound(), ANIMATION_AUDIO_DELAY.APOPHIS_ECLIPSE);
    return () => clearTimeout(timer);
  }, [anim, playApophisEclipseSound]);
}
