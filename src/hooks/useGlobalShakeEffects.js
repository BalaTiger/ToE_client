import { useEffect, useMemo, useRef } from 'react';
import { useTimerSet } from './useTimerSet';
import { getSceneShakeSpec } from '../components/anim/sceneShake';

export function useGlobalShakeEffects({
  anim,
  guillotineReady = true,
  localDebugMode,
  visibleLogRef,
  visibleLogCountRef,
  setVisibleLog,
}) {
  const { addTimer, clearTimers } = useTimerSet();
  const earthquakeDebugAnimRef = useRef(null);

  // A new event restarts the same profile without remounting the board or its cards.
  const sceneShake = useMemo(() => {
    const spec = getSceneShakeSpec(anim, guillotineReady);
    return spec ? { ...spec, event: anim } : null;
  }, [anim, guillotineReady]);

  useEffect(() => {
    clearTimers();

    if (anim?.type === 'EARTHQUAKE' && localDebugMode) {
      addTimer(() => {
        if (earthquakeDebugAnimRef.current !== anim) {
          earthquakeDebugAnimRef.current = anim;
          const debugLine = '[调试动画] 地动山摇动画开始播放';
          visibleLogRef.current = [...visibleLogRef.current, debugLine];
          visibleLogCountRef.current = visibleLogRef.current.length;
          setVisibleLog(visibleLogRef.current);
        }
      }, 0);
    } else if (anim?.type !== 'EARTHQUAKE') {
      earthquakeDebugAnimRef.current = null;
    }

    return clearTimers;
  }, [anim, localDebugMode, setVisibleLog, visibleLogCountRef, visibleLogRef, addTimer, clearTimers]);

  return { sceneShake };
}
