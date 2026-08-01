import { useEffect, useRef, useState } from 'react';
import { startSecondCountdown } from './useMultiplayerTimers';

export function useRoomCountdown(roomModal, playTickSound) {
  const [cdSecondsLeft, setCdSecondsLeft] = useState(null);
  const [cdType, setCdType] = useState(null);
  const cdIntervalRef = useRef(null);

  useEffect(() => {
    if (cdIntervalRef.current) {
      clearInterval(cdIntervalRef.current);
      cdIntervalRef.current = null;
    }
    const cd = roomModal?.countdown;
    if (!cd) {
      setCdSecondsLeft(null);
      setCdType(null);
      return;
    }
    setCdType(cd.type);
    startSecondCountdown({
      seconds: cd.seconds,
      warningAt: 10,
      setSeconds: setCdSecondsLeft,
      intervalRef: cdIntervalRef,
      playTickSound,
    });
    return () => {
      if (cdIntervalRef.current) clearInterval(cdIntervalRef.current);
    };
  // Deliberately keyed by server countdown version: replacing the object alone
  // should not restart the visible countdown.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomModal?.countdown?.version, playTickSound]);

  return { cdSecondsLeft, cdType };
}
