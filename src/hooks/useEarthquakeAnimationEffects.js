import { useEffect, useRef } from 'react';

export function useEarthquakeAnimationEffects({
  anim,
  localDebugMode,
  visibleLogRef,
  visibleLogCountRef,
  setVisibleLog,
}) {
  const earthquakeDebugAnimRef = useRef(null);

  useEffect(() => {
    if (anim?.type === 'EARTHQUAKE') {
      if (localDebugMode && earthquakeDebugAnimRef.current !== anim) {
        earthquakeDebugAnimRef.current = anim;
        const debugLine = '[调试动画] 地动山摇动画开始播放';
        visibleLogRef.current = [...visibleLogRef.current, debugLine];
        visibleLogCountRef.current = visibleLogRef.current.length;
        setVisibleLog(visibleLogRef.current);
      }
      return;
    }

    earthquakeDebugAnimRef.current = null;
  }, [anim, localDebugMode, setVisibleLog, visibleLogCountRef, visibleLogRef]);

  return anim?.type === 'EARTHQUAKE';
}
