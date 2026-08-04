import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMpTurnTimerMode, hasPendingSharedBuryAliveChoice, shouldAdvanceHoundsTimer, shouldRunMpDiscardTimer, startSecondCountdown } from '../useMultiplayerTimers';

afterEach(() => {
  vi.useRealTimers();
});

describe('startSecondCountdown', () => {
  it('校准频率为 250ms 时每个整数秒只播放一次提示音', () => {
    vi.useFakeTimers();
    const setSeconds = vi.fn();
    const playTickSound = vi.fn();
    const intervalRef = { current: null };

    startSecondCountdown({ seconds: 3, warningAt: 10, setSeconds, intervalRef, playTickSound });
    vi.advanceTimersByTime(1000);
    expect(playTickSound).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(playTickSound).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(playTickSound).toHaveBeenCalledTimes(2);
    expect(setSeconds).toHaveBeenLastCalledWith(0);
  });
});

const isLocalCurrentTurn = gs => gs.currentTurn === 0;

function makeGs(patch = {}) {
  return {
    _isMP: true,
    _turnKey: 1,
    currentTurn: 0,
    phase: 'ACTION',
    gameOver: null,
    ...patch,
  };
}

function getMode(patch = {}, extra = {}) {
  return getMpTurnTimerMode({
    isMultiplayer: true,
    gs: makeGs(patch),
    isLocalCurrentTurn,
    isMpCthDecisionPhase: false,
    isMpDecisionPhase: false,
    isTurnTimerSuspended: false,
    ...extra,
  });
}

describe('getMpTurnTimerMode', () => {
  it('本地 ACTION 阶段才运行回合计时', () => {
    expect(getMode()).toBe('running');
  });

  it('动画队列或 pending 状态期间暂停回合计时', () => {
    expect(getMode({}, { isTurnTimerSuspended: true })).toBe('paused');
  });

  it('追捕亮牌和本地决策阶段暂停而不是重启回合计时', () => {
    expect(getMode({ phase: 'HUNT_WAIT_REVEAL' })).toBe('paused');
    expect(getMode({}, { isMpDecisionPhase: true })).toBe('paused');
  });

  it('弃牌阶段和他人回合不保留行动回合计时', () => {
    expect(getMode({ phase: 'DISCARD_PHASE' })).toBe('stopped');
    expect(getMode({ currentTurn: 1 })).toBe('stopped');
  });

  it('摸牌抉择落到 ACTION 前不启动 45 秒行动计时', () => {
    expect(getMode({ phase: 'DRAW_REVEAL' })).toBe('stopped');
    expect(getMode({ phase: 'GOD_CHOICE' })).toBe('stopped');
  });
});

describe('shouldAdvanceHoundsTimer', () => {
  it('联机时仅在当前角色的行动计时实际运行时推进', () => {
    const base = {
      gs: makeGs(),
      isLocalCurrentTurn,
      isMpCthDecisionPhase: false,
      isMpDecisionPhase: false,
      isTurnTimerSuspended: false,
    };
    expect(shouldAdvanceHoundsTimer(base)).toBe(true);
    expect(shouldAdvanceHoundsTimer({ ...base, isMpDecisionPhase: true })).toBe(false);
    expect(shouldAdvanceHoundsTimer({ ...base, isTurnTimerSuspended: true })).toBe(false);
    expect(shouldAdvanceHoundsTimer({ ...base, gs: makeGs({ phase: 'DRAW_REVEAL' }) })).toBe(false);
    expect(shouldAdvanceHoundsTimer({ ...base, gs: makeGs({ currentTurn: 1 }) })).toBe(false);
  });

  it('单机仍沿用原有猎犬计时规则', () => {
    expect(shouldAdvanceHoundsTimer({ gs: makeGs({ _isMP: false, phase: 'ACTION' }) })).toBe(true);
  });

  it('AI 仅在其 AI_TURN 实际执行期间推进', () => {
    const base = {
      gs: makeGs({ currentTurn: 1, phase: 'AI_TURN' }),
      isAiCurrentTurn: true,
      isMpCthDecisionPhase: false,
      isMpDecisionPhase: false,
      isTurnTimerSuspended: false,
    };
    expect(shouldAdvanceHoundsTimer(base)).toBe(true);
    expect(shouldAdvanceHoundsTimer({ ...base, isTurnTimerSuspended: true })).toBe(false);
    expect(shouldAdvanceHoundsTimer({ ...base, isMpDecisionPhase: true })).toBe(false);
    expect(shouldAdvanceHoundsTimer({ ...base, gs: { ...base.gs, phase: 'CAVE_DUEL_SELECT_CARD' } })).toBe(false);
  });
});

describe('shouldRunMpDiscardTimer', () => {
  it('普通本地弃牌阶段运行弃牌计时', () => {
    expect(shouldRunMpDiscardTimer({
      isMultiplayer: true,
      gs: makeGs({ phase: 'DISCARD_PHASE' }),
      isLocalCurrentTurn,
    })).toBe(true);
  });

  it('结束回合后的弃牌确认完成后停止弃牌计时', () => {
    expect(shouldRunMpDiscardTimer({
      isMultiplayer: true,
      gs: makeGs({ phase: 'DISCARD_PHASE', _mpEndTurnDiscardResolved: true }),
      isLocalCurrentTurn,
    })).toBe(false);
  });
});

describe('hasPendingSharedBuryAliveChoice', () => {
  it('keeps the shared bury-alive timer active while a target has not chosen', () => {
    expect(hasPendingSharedBuryAliveChoice(makeGs({
      phase: 'BURY_ALIVE_SELECT',
      abilityData: { targets: [0, 1], buryAliveChoices: [{ cardId: 'a' }, null] },
    }))).toBe(true);
  });

  it('stops the shared bury-alive timer as soon as every target has chosen', () => {
    expect(hasPendingSharedBuryAliveChoice(makeGs({
      phase: 'BURY_ALIVE_SELECT',
      abilityData: { targets: [0, 1], buryAliveChoices: [{ cardId: 'a' }, { cardId: 'b' }] },
    }))).toBe(false);
  });
});
