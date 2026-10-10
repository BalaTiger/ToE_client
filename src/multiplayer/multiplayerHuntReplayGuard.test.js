import { describe, expect, it } from 'vitest';
import {
  claimMpHuntRevealConfirmation,
  isResolvedMpHuntWaitState,
  rememberMpHuntRevealConfirmation,
} from './multiplayerHuntReplayGuard';

const hunt = (phase, huntPromptId = 'hunt:5:0:1:20') => ({
  _turnKey: 5,
  currentTurn: 0,
  phase,
  abilityData: { huntTi: 1, huntPromptId },
});

describe('multiplayer hunt replay guard', () => {
  it('claims a confirmed prompt once and prevents reopening its wait state', () => {
    const completed = new Set();
    expect(isResolvedMpHuntWaitState(hunt('HUNT_WAIT_REVEAL'), completed)).toBe(false);
    expect(claimMpHuntRevealConfirmation(hunt('HUNT_CONFIRM'), completed)).toBe(true);
    expect(claimMpHuntRevealConfirmation(hunt('HUNT_CONFIRM'), completed)).toBe(false);
    expect(isResolvedMpHuntWaitState(hunt('HUNT_WAIT_REVEAL'), completed)).toBe(true);
    // A locally claimed confirmation still needs its own normal replay.
    rememberMpHuntRevealConfirmation(hunt('HUNT_CONFIRM'), completed);
    expect(completed.size).toBe(1);
  });

  it('allows a new prompt for a consecutive hunt against the same seat in the same turn', () => {
    const completed = new Set(['hunt:5:0:1:20']);
    const secondWait = hunt('HUNT_WAIT_REVEAL', 'hunt:5:0:1:23');
    expect(isResolvedMpHuntWaitState(secondWait, completed)).toBe(false);
    expect(claimMpHuntRevealConfirmation({ ...secondWait, phase: 'HUNT_CONFIRM' }, completed)).toBe(true);
    expect(completed.size).toBe(2);
  });

  it('keeps non-hunt takeover and legacy snapshots without an explicit prompt unchanged', () => {
    const completed = new Set();
    for (const state of [
      hunt('ACTION'),
      hunt('DRAW_REVEAL'),
      { phase: 'HUNT_CONFIRM', abilityData: { huntTi: 1 } },
      { phase: 'HUNT_WAIT_REVEAL', abilityData: { huntTi: 1 } },
    ]) {
      expect(claimMpHuntRevealConfirmation(state, completed)).toBe(true);
      expect(isResolvedMpHuntWaitState(state, completed)).toBe(false);
      rememberMpHuntRevealConfirmation(state, completed);
    }
    expect(completed.size).toBe(0);
  });

  it('permits the same wire prompt after the session ledger is reset', () => {
    const completed = new Set();
    rememberMpHuntRevealConfirmation(hunt('HUNT_CONFIRM'), completed);
    completed.clear();
    expect(isResolvedMpHuntWaitState(hunt('HUNT_WAIT_REVEAL'), completed)).toBe(false);
    expect(claimMpHuntRevealConfirmation(hunt('HUNT_CONFIRM'), completed)).toBe(true);
  });
});
