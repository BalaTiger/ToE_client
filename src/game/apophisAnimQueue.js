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
  const builtApophisQueue = buildApophisTargetQueueForState(oldState, nextState, buildQueue);
  if (!builtApophisQueue.length) return queue || [];
  const seq = nextState?._apophisTargetEvent?.seq;
  const statSeq = nextState?._apophisTargetEvent?.statSeq;
  const isTargetStatStep = step => statSeq != null && (
    Array.isArray(step?.statEvents) && step.statEvents.some(event => event?.seq === statSeq)
  );
  // Keep the transaction canonical even when a legacy builder emitted the
  // skill lock before the roll's SAN consequence.
  const apophisQueue = [
    ...builtApophisQueue.filter(step => step?.type === 'DICE_ROLL' && step?.diceMode === 'apophisNight'),
    ...builtApophisQueue.filter(isTargetStatStep),
    ...builtApophisQueue.filter(step => !(
      (step?.type === 'DICE_ROLL' && step?.diceMode === 'apophisNight') || isTargetStatStep(step)
    )),
  ];
  const hasEarlierTargetTransaction = (queue || []).some(step => (
    step?._apophisTargetSeq != null && step._apophisTargetSeq !== seq
  ));
  const canonicalDice = apophisQueue.find(step => step?.type === 'DICE_ROLL' && step?.diceMode === 'apophisNight');
  const canonicalLog = canonicalDice?._logChunk?.[0] || canonicalDice?.msgs?.[0] || null;
  const queueHasTargetStat = statSeq != null && (queue || []).some(step => (
    Array.isArray(step?.statEvents) && step.statEvents.some(event => event?.seq === statSeq)
  ));
  const queuedTargetDiceIndex = (queue || []).findIndex(step => (
    step?.type === 'DICE_ROLL'
    && step?.diceMode === 'apophisNight'
    && step?._apophisTargetSeq === seq
  ));
  const queuedTargetStatIndex = (queue || []).findIndex(isTargetStatStep);
  const targetSkillTypes = new Set(
    apophisQueue
      .filter(step => step?.type?.startsWith('SKILL_'))
      .map(step => step.type)
  );
  const lastEarlierTargetIndex = (queue || []).findLastIndex(step => (
    step?._apophisTargetSeq != null && step._apophisTargetSeq !== seq
  ));
  const targetSearchStart = lastEarlierTargetIndex + 1;
  const relativeTargetActionIndex = (queue || []).slice(targetSearchStart).findIndex(step => (
    targetSkillTypes.size
      ? (
          targetSkillTypes.has(step?.type)
          || (
            step?._apophisTargetSeq === seq
            && !(step?.type === 'DICE_ROLL' && step?.diceMode === 'apophisNight')
          )
        )
      : !(
          step?.type === 'DICE_ROLL'
          && step?.diceMode === 'apophisNight'
          && step?._apophisTargetSeq === seq
        ) && !isTargetStatStep(step)
  ));
  const queuedTargetActionIndex = relativeTargetActionIndex < 0
    ? -1
    : targetSearchStart + relativeTargetActionIndex;
  const alreadyHasCompleteTransaction = apophisQueue.every(step => {
    if (step?.type === 'DICE_ROLL' && step?.diceMode === 'apophisNight') {
      return (queue || []).some(queued => (
        queued?.type === 'DICE_ROLL'
        && queued?.diceMode === 'apophisNight'
        && queued?._apophisTargetSeq === seq
      ));
    }
    if (Array.isArray(step?.statEvents) && step.statEvents.some(event => event?.seq === statSeq)) {
      return queueHasTargetStat;
    }
    if (step?.type?.startsWith('SKILL_')) {
      return (queue || []).some(queued => (
        queued?.type === step.type
        && (queued?._apophisTargetSeq === seq || queued?.targetIdx === step.targetIdx)
      ));
    }
    return false;
  });
  // AI hunt presentation already embeds the target-selection transaction in
  // the composed queue. Rebuilding that same transaction at the final playback
  // boundary can remount its dice step after the hunt has been abandoned.
  // “完整”还必须包含正确的先后关系。蛊惑的内联赠牌队列曾经先放入
  // SKILL_BEWITCH / CARD_TRANSFER，随后才带入同一事务的黑夜骰；仅按
  // 成员去重会把这个错误顺序原样保留下来。
  const alreadyOrdered = queuedTargetDiceIndex >= 0
    && (queuedTargetStatIndex < 0 || queuedTargetDiceIndex <= queuedTargetStatIndex)
    && (queuedTargetActionIndex < 0 || (
      queuedTargetStatIndex >= 0
        ? queuedTargetStatIndex <= queuedTargetActionIndex
        : queuedTargetDiceIndex <= queuedTargetActionIndex
    ));
  if (alreadyHasCompleteTransaction && alreadyOrdered) return queue || [];
  let insertionIndex = null;
  const baseQueue = (queue || []).filter((step, index) => {
    if (step?._apophisTargetSeq === seq) {
      if (insertionIndex == null) insertionIndex = index;
      return false;
    }
    if (isTargetStatStep(step)) {
      if (insertionIndex == null) insertionIndex = index;
      return false;
    }
    // AI 回合可能先把同一黑夜事件放进追捕事件队列，随后又从权威状态
    // 补入一次。旧路径有时丢失 seq，因此再按唯一的黑夜日志去重。
    if (step?.type === 'DICE_ROLL' && step?.diceMode === 'apophisNight' && canonicalLog) {
      const stepLog = step?._logChunk?.[0] || step?.msgs?.[0] || null;
      return stepLog !== canonicalLog;
    }
    return true;
  });

  const queuedTypes = new Set(baseQueue.map(step => step?.type));
  const dedupedApophisQueue = apophisQueue.filter(step => {
    if (step?.type?.startsWith('SKILL_') && queuedTypes.has(step.type)) return false;
    return true;
  });

  // A composed AI turn can already contain several independently-built target
  // transactions. The common playback boundary calls this merge once more for
  // the latest event. Replacing that event at the head reverses its dice roll
  // ahead of all earlier hunts, so preserve the position of the removed event.
  const targetIndex = insertionIndex == null || !hasEarlierTargetTransaction
    ? 0
    : Math.min(insertionIndex, baseQueue.length);
  return [
    ...baseQueue.slice(0, targetIndex),
    ...dedupedApophisQueue,
    ...baseQueue.slice(targetIndex),
  ];
}

