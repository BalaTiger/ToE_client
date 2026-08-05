import { describe, expect, it } from 'vitest';
import {
  ANIMATION_QUEUE_EVENT as EVENT,
  canFireAnimationCue,
  createAnimationQueueState,
  transitionAnimationQueue,
} from '../animationQueueMachine';

function applyEvents(...events) {
  return events.reduce(transitionAnimationQueue, createAnimationQueueState());
}

describe('animationQueueMachine', () => {
  it('按播放、退出、推进、提交、完成的合法顺序迁移', () => {
    const playing = applyEvents(EVENT.QUEUE_STARTED);
    const exiting = transitionAnimationQueue(playing, EVENT.STEP_EXITED);
    const nextPlaying = transitionAnimationQueue(exiting, EVENT.STEP_ADVANCED);
    const committing = transitionAnimationQueue(nextPlaying, EVENT.COMMIT_STARTED);
    const idle = transitionAnimationQueue(committing, EVENT.QUEUE_COMPLETED);

    expect([playing.phase, exiting.phase, nextPlaying.phase, committing.phase, idle.phase]).toEqual([
      'playing', 'exiting', 'playing', 'committing', 'idle',
    ]);
  });

  it('暂停后恢复到暂停前阶段', () => {
    const exiting = applyEvents(EVENT.QUEUE_STARTED, EVENT.STEP_EXITED);
    const paused = transitionAnimationQueue(exiting, EVENT.PAUSED);
    const resumed = transitionAnimationQueue(paused, EVENT.RESUMED);

    expect(paused).toEqual({ phase: 'paused', previousPhase: 'exiting' });
    expect(resumed).toEqual({ phase: 'exiting', previousPhase: null });
  });

  it('中断会清空任意活动生命周期', () => {
    expect(applyEvents(EVENT.QUEUE_STARTED, EVENT.PAUSED, EVENT.INTERRUPTED)).toEqual({
      phase: 'idle',
      previousPhase: null,
    });
  });

  it('非法迁移保持原状态，提交完成必须经过 committing', () => {
    const playing = applyEvents(EVENT.QUEUE_STARTED);
    expect(transitionAnimationQueue(playing, EVENT.QUEUE_COMPLETED)).toBe(playing);
    expect(transitionAnimationQueue(createAnimationQueueState(), EVENT.STEP_ADVANCED)).toEqual({
      phase: 'idle',
      previousPhase: null,
    });
  });

  it('cue 只在播放阶段或退出阶段的剩余命中/推进窗口内生效', () => {
    const playing = applyEvents(EVENT.QUEUE_STARTED);
    const exiting = transitionAnimationQueue(playing, EVENT.STEP_EXITED);
    const paused = transitionAnimationQueue(exiting, EVENT.PAUSED);

    expect(canFireAnimationCue(playing, 'exit')).toBe(true);
    expect(canFireAnimationCue(exiting, 'impact')).toBe(true);
    expect(canFireAnimationCue(exiting, 'exit')).toBe(false);
    expect(canFireAnimationCue(paused, 'advance')).toBe(false);
  });
});

