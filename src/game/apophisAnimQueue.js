import { buildAnimQueue } from './animQueueCore';

export function buildApophisTargetQueueForState(oldState, nextState, buildQueue = buildAnimQueue) {
  const seq = nextState?._apophisTargetEvent?.seq;
  if (!seq || seq <= (oldState?._apophisTargetSeq || 0)) return [];
  return buildQueue(oldState, nextState).filter(step => step?._apophisTargetSeq === seq);
}

export function mergeApophisTargetQueue(queue = [], oldState, nextState, buildQueue = buildAnimQueue) {
  const apophisQueue = buildApophisTargetQueueForState(oldState, nextState, buildQueue);
  if (!apophisQueue.length) return queue || [];
  const seq = nextState?._apophisTargetEvent?.seq;
  if ((queue || []).some(step => step?._apophisTargetSeq === seq)) return queue || [];

  const queuedTypes = new Set((queue || []).map(step => step?.type));
  const dedupedApophisQueue = apophisQueue.filter(step => !(step?.type?.startsWith('SKILL_') && queuedTypes.has(step.type)));
  return [...dedupedApophisQueue, ...(queue || [])];
}

