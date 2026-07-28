import { useEffect, useRef, useState } from 'react';
import { useTimerSet } from './useTimerSet';

const BURROWING_WORM_GLOBAL_SHAKE_MS = 1620;

export function useGlobalShakeEffects({
  anim,
  localDebugMode,
  visibleLogRef,
  visibleLogCountRef,
  setVisibleLog,
}) {
  const [screenShake, setScreenShake] = useState(false);
  const [deathShake, setDeathShake] = useState(false);
  const [sustainedShake, setSustainedShake] = useState(false);
  const { addTimer, clearTimers } = useTimerSet();
  const earthquakeDebugAnimRef = useRef(null);

  useEffect(() => {
    clearTimers();

    if (anim?.type === 'EARTHQUAKE') {
      addTimer(() => {
        setSustainedShake(true);
        if (localDebugMode && earthquakeDebugAnimRef.current !== anim) {
          earthquakeDebugAnimRef.current = anim;
          const debugLine = '[调试动画] 地动山摇动画开始播放';
          visibleLogRef.current = [...visibleLogRef.current, debugLine];
          visibleLogCountRef.current = visibleLogRef.current.length;
          setVisibleLog(visibleLogRef.current);
        }
      }, 0);
      return () => {
        setSustainedShake(false);
        earthquakeDebugAnimRef.current = null;
      };
    }

    earthquakeDebugAnimRef.current = null;

    if (anim?.type === 'BURROWING_WORM') {
      addTimer(() => setSustainedShake(true), 0);
      addTimer(() => setSustainedShake(false), BURROWING_WORM_GLOBAL_SHAKE_MS);
      return () => setSustainedShake(false);
    }

    if (anim?.type === 'HP_DAMAGE' && anim.hitIndices?.length) {
      addTimer(() => setScreenShake(true), 0);
      addTimer(() => setScreenShake(false), 400);
      return () => setScreenShake(false);
    }

    if (anim?.type === 'SAN_DAMAGE' && anim.hitIndices?.length) {
      addTimer(() => setScreenShake(true), 0);
      addTimer(() => setScreenShake(false), 280);
      return () => setScreenShake(false);
    }

    if (anim?.type === 'GUILLOTINE' && anim.hitIndices?.length) {
      addTimer(() => {
        setDeathShake(true);
        addTimer(() => setDeathShake(false), 220);
      }, 120);
      return () => setDeathShake(false);
    }

    return undefined;
  }, [anim, localDebugMode, setVisibleLog, visibleLogCountRef, visibleLogRef, addTimer, clearTimers]);

  return {
    screenShake,
    deathShake,
    earthquakeShake: anim?.type === 'EARTHQUAKE' || sustainedShake,
  };
}
