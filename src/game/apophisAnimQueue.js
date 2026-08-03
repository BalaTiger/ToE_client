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
  const targetEvent = nextState?._apophisTargetEvent;
  const seq = targetEvent?.seq;
  if (!seq || seq <= (oldState?._apophisTargetSeq || 0)) return [];
  const statSeq = targetEvent?.statSeq;
  return buildQueue(oldState, nextState).filter(step => (
    step?._apophisTargetSeq === seq ||
    (statSeq != null && Array.isArray(step?.statEvents) && step.statEvents.some(event => event?.seq === statSeq))
  ));
}

export function mergeApophisTargetQueue(queue = [], oldState, nextState, buildQueue = buildAnimQueue) {
  const apophisQueue = buildApophisTargetQueueForState(oldState, nextState, buildQueue);
  if (!apophisQueue.length) return queue || [];
  const seq = nextState?._apophisTargetEvent?.seq;
  const statSeq = nextState?._apophisTargetEvent?.statSeq;
  const canonicalDice = apophisQueue.find(step => step?.type === 'DICE_ROLL' && step?.diceMode === 'apophisNight');
  const canonicalLog = canonicalDice?._logChunk?.[0] || canonicalDice?.msgs?.[0] || null;
  const baseQueue = (queue || []).filter(step => {
    if (step?._apophisTargetSeq === seq) return false;
    if (statSeq != null && Array.isArray(step?.statEvents) && step.statEvents.some(event => event?.seq === statSeq)) return false;
    // AI 回合可能先把同一黑夜事件放进追捕事件队列，随后又从权威状态
    // 补入一次。旧路径有时丢失 seq，因此再按唯一的黑夜日志去重。
    if (step?.type === 'DICE_ROLL' && step?.diceMode === 'apophisNight' && canonicalLog) {
      const stepLog = step?._logChunk?.[0] || step?.msgs?.[0] || null;
      return stepLog !== canonicalLog;
    }
    return true;
  });

  const queuedTypes = new Set(baseQueue.map(step => step?.type));
  const dedupedApophisQueue = apophisQueue.filter(step => !(step?.type?.startsWith('SKILL_') && queuedTypes.has(step.type)));

  return [...dedupedApophisQueue, ...baseQueue];
}

