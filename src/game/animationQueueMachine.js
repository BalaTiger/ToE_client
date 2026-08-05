export const ANIMATION_QUEUE_PHASE = Object.freeze({
  IDLE: 'idle',
  PLAYING: 'playing',
  EXITING: 'exiting',
  PAUSED: 'paused',
  COMMITTING: 'committing',
});

export const ANIMATION_QUEUE_EVENT = Object.freeze({
  QUEUE_STARTED: 'QUEUE_STARTED',
  STEP_EXITED: 'STEP_EXITED',
  STEP_ADVANCED: 'STEP_ADVANCED',
  PAUSED: 'PAUSED',
  RESUMED: 'RESUMED',
  COMMIT_STARTED: 'COMMIT_STARTED',
  QUEUE_COMPLETED: 'QUEUE_COMPLETED',
  INTERRUPTED: 'INTERRUPTED',
});

export function createAnimationQueueState() {
  return { phase: ANIMATION_QUEUE_PHASE.IDLE, previousPhase: null };
}

export function transitionAnimationQueue(state = createAnimationQueueState(), event) {
  const type = typeof event === 'string' ? event : event?.type;
  const phase = state?.phase || ANIMATION_QUEUE_PHASE.IDLE;

  if (type === ANIMATION_QUEUE_EVENT.INTERRUPTED) return createAnimationQueueState();
  if (type === ANIMATION_QUEUE_EVENT.QUEUE_STARTED) {
    return { phase: ANIMATION_QUEUE_PHASE.PLAYING, previousPhase: null };
  }
  if (type === ANIMATION_QUEUE_EVENT.PAUSED) {
    if (phase === ANIMATION_QUEUE_PHASE.IDLE || phase === ANIMATION_QUEUE_PHASE.PAUSED) return state;
    return { phase: ANIMATION_QUEUE_PHASE.PAUSED, previousPhase: phase };
  }
  if (type === ANIMATION_QUEUE_EVENT.RESUMED) {
    if (phase !== ANIMATION_QUEUE_PHASE.PAUSED) return state;
    return { phase: state.previousPhase || ANIMATION_QUEUE_PHASE.PLAYING, previousPhase: null };
  }
  if (type === ANIMATION_QUEUE_EVENT.STEP_EXITED && phase === ANIMATION_QUEUE_PHASE.PLAYING) {
    return { phase: ANIMATION_QUEUE_PHASE.EXITING, previousPhase: null };
  }
  if (
    type === ANIMATION_QUEUE_EVENT.STEP_ADVANCED &&
    (phase === ANIMATION_QUEUE_PHASE.PLAYING || phase === ANIMATION_QUEUE_PHASE.EXITING)
  ) {
    return { phase: ANIMATION_QUEUE_PHASE.PLAYING, previousPhase: null };
  }
  if (
    type === ANIMATION_QUEUE_EVENT.COMMIT_STARTED &&
    (phase === ANIMATION_QUEUE_PHASE.PLAYING || phase === ANIMATION_QUEUE_PHASE.EXITING)
  ) {
    return { phase: ANIMATION_QUEUE_PHASE.COMMITTING, previousPhase: null };
  }
  if (type === ANIMATION_QUEUE_EVENT.QUEUE_COMPLETED && phase === ANIMATION_QUEUE_PHASE.COMMITTING) {
    return createAnimationQueueState();
  }
  return state;
}

export function canFireAnimationCue(state, cueKind) {
  if (!cueKind) return false;
  if (state?.phase === ANIMATION_QUEUE_PHASE.PLAYING) return true;
  if (state?.phase !== ANIMATION_QUEUE_PHASE.EXITING) return false;
  return cueKind === 'visual' || cueKind === 'impact' || cueKind === 'advance';
}

