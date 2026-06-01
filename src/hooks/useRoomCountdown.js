import { useEffect, useRef, useState } from 'react';

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
    setCdSecondsLeft(cd.seconds);
    cdIntervalRef.current = setInterval(() => {
      setCdSecondsLeft(s => {
        const next = s === null || s <= 1 ? 0 : s - 1;
        if (next === 0) clearInterval(cdIntervalRef.current);
        if (next > 0 && next <= 10) playTickSound();
        return next;
      });
    }, 1000);
    return () => {
      if (cdIntervalRef.current) clearInterval(cdIntervalRef.current);
    };
  // Deliberately keyed by server countdown version: replacing the object alone
  // should not restart the visible countdown.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomModal?.countdown?.version, playTickSound]);

  return { cdSecondsLeft, cdType };
}
