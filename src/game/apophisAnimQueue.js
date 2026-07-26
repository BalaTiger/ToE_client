import { buildAnimQueue } from './animQueueCore';

export function attachApophisNightTimeline(queue = [], initialNight = null, finalNight = null) {
  const steps = Array.isArray(queue) ? queue : [];
  const hasNightTransition = steps.some(step => (
    Object.prototype.hasOwnProperty.call(step || {}, '_apophisNight') ||
    (step?.type === 'STATE_PATCH' && Object.prototype.hasOwnProperty.call(step, 'apophisNight')) ||
    step?.type === 'APOPHIS_ECLIPSE'
  ));
  let visibleNight = hasNightTransition ? initialNight : finalNight;
  if (visibleNight === undefined) visibleNight = initialNight ?? null;

  return steps.map(step => {
    if (!step) return step;
    if (Object.prototype.hasOwnProperty.call(step, '_apophisNight')) {
      visibleNight = step._apophisNight;
    } else if (step.type === 'STATE_PATCH' && Object.prototype.hasOwnProperty.call(step, 'apophisNight')) {
      visibleNight = step.apophisNight;
    }
    const timedStep = { ...step, _apophisNight: visibleNight };
    // The badge is hidden during the eclipse reveal itself. Any following
    // steps should already use the newly established night state.
    if (step.type === 'APOPHIS_ECLIPSE') visibleNight = finalNight ?? null;
    return timedStep;
  });
}

export function buildApophisTargetQueueForState(oldState, nextState, buildQueue = buildAnimQueue) {
  const seq = nextState?._apophisTargetEvent?.seq;
  if (!seq || seq <= (oldState?._apophisTargetSeq || 0)) return [];
  return buildQueue(oldState, nextState).filter(step => step?._apophisTargetSeq === seq);
}

export function mergeApophisTargetQueue(queue = [], oldState, nextState, buildQueue = buildAnimQueue) {
  const apophisQueue = buildApophisTargetQueueForState(oldState, nextState, buildQueue);
  if (!apophisQueue.length) return queue || [];
  const seq = nextState?._apophisTargetEvent?.seq;
  const statSeq = nextState?._apophisTargetEvent?.statSeq;
  const baseQueue = (queue || []).filter(step => step?._apophisTargetSeq !== seq);

  const queuedTypes = new Set(baseQueue.map(step => step?.type));
  const dedupedApophisQueue = apophisQueue.filter(step => !(step?.type?.startsWith('SKILL_') && queuedTypes.has(step.type)));

  // 把与本次黑夜目标偏移绑定的 SAN/HP 扣减也提到前面，避免和后续蛊惑/追捕效果混在一起
  if (statSeq != null) {
    const statSteps = [];
    const remainingBase = [];
    for (const step of baseQueue) {
      const stepStatEvents = step?.statEvents;
      if (Array.isArray(stepStatEvents) && stepStatEvents.some(ev => ev?.seq === statSeq)) {
        statSteps.push(step);
      } else {
        remainingBase.push(step);
      }
    }
    return [...dedupedApophisQueue, ...statSteps, ...remainingBase];
  }

  return [...dedupedApophisQueue, ...baseQueue];
}

