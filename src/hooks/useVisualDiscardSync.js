import { useEffect } from 'react';

export function useVisualDiscardSync({
  gs,
  anim,
  animQueueRef,
  pendingGsRef,
  getVisualDiscardForState,
  setVisualDiscard,
}) {
  useEffect(() => {
    if (!gs) return;
    if (anim || animQueueRef.current.length > 0 || pendingGsRef.current) return;
    setVisualDiscard(getVisualDiscardForState(gs));
  }, [gs, gs?.discard, anim, getVisualDiscardForState, animQueueRef, pendingGsRef, setVisualDiscard]);
}
