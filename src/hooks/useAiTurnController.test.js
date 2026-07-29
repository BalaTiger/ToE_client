import { describe, expect, it, vi } from 'vitest';
import {
  executeAiTurnStep,
  scheduleAiTurn,
  shouldScheduleAiTurn,
} from './useAiTurnController';

describe('AI turn controller', () => {
  it('schedules only an unblocked single-player AI turn', () => {
    const base = {
      gs: { phase: 'AI_TURN', gameOver: null },
      hasActiveAnimation: false,
      showTutorial: false,
      softGuidePauseActive: false,
      isMultiplayer: false,
    };
    expect(shouldScheduleAiTurn(base)).toBe(true);
    expect(shouldScheduleAiTurn({ ...base, gs: { phase: 'ACTION' } })).toBe(false);
    expect(shouldScheduleAiTurn({ ...base, hasActiveAnimation: true })).toBe(false);
    expect(shouldScheduleAiTurn({ ...base, showTutorial: true })).toBe(false);
    expect(shouldScheduleAiTurn({ ...base, softGuidePauseActive: true })).toBe(false);
    expect(shouldScheduleAiTurn({ ...base, isMultiplayer: true })).toBe(false);
  });

  it('owns execution/watchdog timers and clears both on cleanup', () => {
    const scheduled = [];
    const cleared = [];
    const setTimer = vi.fn((callback, delay) => {
      const timer = { callback, delay };
      scheduled.push(timer);
      return timer;
    });
    const clearTimer = vi.fn(timer => cleared.push(timer));
    const snapshot = { _turnKey: 4 };
    const onExecute = vi.fn();
    const onTimeout = vi.fn();

    const cleanup = scheduleAiTurn({
      snapshot,
      onExecute,
      onTimeout,
      delayMs: 100,
      watchdogMs: 500,
      setTimer,
      clearTimer,
    });

    expect(scheduled.map(timer => timer.delay)).toEqual([100, 500]);
    scheduled[0].callback();
    scheduled[1].callback();
    expect(onExecute).toHaveBeenCalledWith(snapshot);
    expect(onTimeout).toHaveBeenCalledWith(snapshot);

    cleanup();
    expect(cleared).toEqual(scheduled);
  });

  it('runs aiStep and exposes both cleaned and animation-rich results', () => {
    const rawResult = {
      phase: 'ACTION',
      players: [],
      _aiName: 'Bot',
      _aiHuntEvents: [{ target: 0 }],
    };
    const runAiStep = vi.fn(() => rawResult);
    const result = executeAiTurnStep({
      snapshot: { phase: 'AI_TURN' },
      runAiStep,
      isDebugMode: true,
      startNextTurn: vi.fn(),
    });

    expect(result.ok).toBe(true);
    expect(result.rawResult).toBe(rawResult);
    expect(result.newGs).toEqual({ phase: 'ACTION', players: [] });
    expect(runAiStep).toHaveBeenCalledWith(
      { phase: 'AI_TURN' },
      { isDebugMode: true },
    );
  });

  it('turns aiStep exceptions into a safe next-turn state', () => {
    const recoveryGs = { phase: 'ACTION', recovered: true };
    const startNextTurn = vi.fn(() => recoveryGs);
    const result = executeAiTurnStep({
      snapshot: {
        currentTurn: 1,
        players: [{ name: 'Player' }, { name: 'Bot' }],
        log: ['before'],
      },
      runAiStep: () => { throw new Error('boom'); },
      isDebugMode: false,
      startNextTurn,
    });

    expect(result).toMatchObject({ ok: false, recoveryGs });
    expect(startNextTurn).toHaveBeenCalledWith(expect.objectContaining({
      currentTurn: 1,
      skillUsed: false,
      restUsed: false,
      huntAbandoned: [],
      log: ['before', 'Bot 的回合处理异常（boom），系统强制结束其回合'],
    }));
  });
});
