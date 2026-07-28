import { useCallback, useEffect, useRef } from 'react';

export function useTimerSet() {
  const timersRef = useRef(new Set());

  const addTimer = useCallback((fn, delay) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return { addTimer, clearTimers };
}
