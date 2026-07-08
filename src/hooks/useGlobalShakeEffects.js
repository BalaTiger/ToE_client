import { useEffect, useRef, useState } from 'react';

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
  const timersRef = useRef(new Set());
  const earthquakeDebugAnimRef = useRef(null);

  useEffect(() => () => {
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  useEffect(() => {
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
    setScreenShake(false);
    setDeathShake(false);
    setSustainedShake(false);

    const addTimer = (fn, delay) => {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        fn();
      }, delay);
      timersRef.current.add(timer);
      return timer;
    };

    if (anim?.type === 'EARTHQUAKE') {
      setSustainedShake(true);
      if (localDebugMode && earthquakeDebugAnimRef.current !== anim) {
        earthquakeDebugAnimRef.current = anim;
        const debugLine = '[调试动画] 地动山摇动画开始播放';
        visibleLogRef.current = [...visibleLogRef.current, debugLine];
        visibleLogCountRef.current = visibleLogRef.current.length;
        setVisibleLog(visibleLogRef.current);
      }
      return undefined;
    }

    earthquakeDebugAnimRef.current = null;

    if (anim?.type === 'BURROWING_WORM') {
      setSustainedShake(true);
      addTimer(() => setSustainedShake(false), BURROWING_WORM_GLOBAL_SHAKE_MS);
      return undefined;
    }

    if (anim?.type === 'HP_DAMAGE' && anim.hitIndices?.length) {
      setScreenShake(true);
      addTimer(() => setScreenShake(false), 400);
      return undefined;
    }

    if (anim?.type === 'SAN_DAMAGE' && anim.hitIndices?.length) {
      setScreenShake(true);
      addTimer(() => setScreenShake(false), 280);
      return undefined;
    }

    if (anim?.type === 'GUILLOTINE' && anim.hitIndices?.length) {
      addTimer(() => {
        setDeathShake(true);
        addTimer(() => setDeathShake(false), 220);
      }, 120);
      return undefined;
    }

    return undefined;
  }, [anim, localDebugMode, setVisibleLog, visibleLogCountRef, visibleLogRef]);

  return {
    screenShake,
    deathShake,
    earthquakeShake: anim?.type === 'EARTHQUAKE' || sustainedShake,
  };
}
