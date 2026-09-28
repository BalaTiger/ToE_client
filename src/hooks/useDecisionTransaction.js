import { useCallback, useRef, useState } from 'react';

export const DECISION_TRANSACTION_STATUS = Object.freeze({
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  FAILED: 'failed',
});

const initialState = Object.freeze({
  status: DECISION_TRANSACTION_STATUS.IDLE,
  id: null,
  error: null,
});

/**
 * Coordinates UI decisions whose rule result is committed only after an
 * animation transaction finishes.  The hook deliberately owns only the
 * ephemeral UI lifecycle; the game state remains in the caller until the
 * animation queue commits its prepared next state.
 */
export function useDecisionTransaction() {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(initialState);

  const update = useCallback(next => {
    stateRef.current = next;
    setState(next);
  }, []);

  const begin = useCallback(id => {
    const current = stateRef.current;
    if (current.status === DECISION_TRANSACTION_STATUS.SUBMITTING) return false;
    update({
      status: DECISION_TRANSACTION_STATUS.SUBMITTING,
      id: id || 'decision',
      error: null,
    });
    return true;
  }, [update]);

  const fail = useCallback((id, error) => {
    update({
      status: DECISION_TRANSACTION_STATUS.FAILED,
      id: id || stateRef.current.id || 'decision',
      error: error instanceof Error ? error : new Error(String(error || '决策事务失败')),
    });
  }, [update]);

  const complete = useCallback(() => {
    update(initialState);
  }, [update]);

  return {
    ...state,
    isSubmitting: state.status === DECISION_TRANSACTION_STATUS.SUBMITTING,
    begin,
    fail,
    complete,
  };
}

