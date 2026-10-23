import { useCallback, useEffect, useState } from 'react';
import { presentationDeadline } from './presentationClock';

/** The server can shorten an opening, never grant a new allowance to an old role animation. */
export function useFreshRoleReveal({ view, freshStart, offline }) {
  const remainingMs = presentationDeadline(view, 0);
  const [opening, setOpening] = useState(() => freshStart && !view.tutorial && view.viewerSeat !== null
    ? { revision: view.revision, batchId: view.presentation?.batchId, deadline: remainingMs === null ? null : performance.now() + remainingMs } : null);
  const active = !!opening && view.viewerSeat !== null && !view.tutorial && (offline || view.revision === opening.revision
    && view.presentation?.batchId === opening.batchId && remainingMs > 0);
  useEffect(() => {
    if (!opening || offline) return;
    const expiresAt = Math.min(opening.deadline ?? -Infinity, performance.now() + (remainingMs ?? 0));
    const timer = setTimeout(() => setOpening(null), active ? Math.max(0, expiresAt - performance.now()) : 0);
    return () => clearTimeout(timer);
  }, [opening, offline, active, remainingMs]);
  const finish = useCallback(() => setOpening(null), []);
  return { active, finish };
}
