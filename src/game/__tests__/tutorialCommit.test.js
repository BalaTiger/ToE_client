import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTutorialScenario, applyTutorialStepState, clearTutorialWinState, getTutorialStep, TUTORIAL_FLOW } from '../tutorialScenario';
import { startNextTurn } from '../turnEngine';
import { resolveAiGodChoiceTransition } from '../aiDecisionState';
import { withClearedReplayAnimFields } from '../turnAnimState';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function appSection(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function convertedTutorialState() {
  const scenario = createTutorialScenario('cultistGod');
  const pending = startNextTurn(scenario);
  return resolveAiGodChoiceTransition(pending).state;
}

function renderedPlayers(gs) {
  // Exercise the actual idle-board selector, including its pre-draw fallback.
  return runInNewContext(`${appSection('  const isAwaitingAiTurnDrawQueue=', '  if(import.meta.env.DEV&&debugMpRenderTraceRef.current)')}\nvisualPlayers`, {
    gs, anim: null, animExiting: false, animQueueRef: { current: [] }, pendingGsRef: { current: null },
    earthquakeVisualPlayers: null, visualPlayersLockRef: { current: null },
  });
}

function tutorialCommitContext(initialState) {
  let committed = initialState;
  const context = {
    useCallback: callback => callback,
    withClearedReplayAnimFields,
    visibleLogRef: { current: initialState.log },
    buildCompleteGameOverLog: vi.fn(),
    getVisualDiscardForState: state => state.discard,
    setVisualDiscard: vi.fn(), setDisplayStats: vi.fn(),
    setGs: update => { committed = typeof update === 'function' ? update(committed) : update; },
  };
  context.normalizeLocalPendingGs = runInNewContext(`${appSection('  const normalizeLocalPendingGs=useCallback(', '  const {\n    anim,')}\nnormalizeLocalPendingGs`, context);
  return { context, current: () => committed };
}

beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(.999999));
afterEach(() => vi.restoreAllMocks());

it('commits the completed faith, skulls and SAN instead of restoring the tutorial pre-draw portrait snapshot', () => {
  const after = convertedTutorialState();
  expect(after.phase).toBe('AI_TURN');
  expect(after.players[1].godName).toBe('VRI');
  expect(renderedPlayers(after)[1].godName).toBe('NYA'); // reproduces the reported idle-board regression
  const commit = tutorialCommitContext(after);
  const applySnapshot = runInNewContext(`${appSection('  const applyTutorialStateSnapshot=useCallback(', '  const advanceTutorialStep=useCallback(')}\napplyTutorialStateSnapshot`, commit.context);
  applySnapshot(after);
  const state = commit.current();
  expect(state).toMatchObject({ _playersBeforeThisDraw: null, _preTurnPlayers: null, _drawnCard: null, _aiDrawnCard: null, _statEvents: [] });
  expect(renderedPlayers(state)).toBe(state.players);
  expect(renderedPlayers(state)[1]).toMatchObject({
    godName: 'VRI', godLevel: after.players[1].godLevel,
    godEncounters: after.players[1].godEncounters, san: after.players[1].san,
  });
  expect(state.log).toEqual(after.log);
  expect(commit.context.setDisplayStats).toHaveBeenLastCalledWith(state.players.map(player => ({ hp: player.hp, san: player.san })));
  expect(after._playersBeforeThisDraw).not.toBeNull(); // cleanup is immutable
});

it('clears completed draw snapshots before advancing to a teaching explanation without resetting its resolved identity', () => {
  const after = convertedTutorialState();
  const commit = tutorialCommitContext(after);
  Object.assign(commit.context, {
    anim: null, animExiting: false, animQueueRef: { current: [] }, pendingGsRef: { current: null },
    clearBattleAnimationState: vi.fn(), setSwapBlindDraw: vi.fn(), setMobileArmedGodCardIdx: vi.fn(),
    setTutorialGodPlayerDrawArmed: vi.fn(), setTutorialStep: vi.fn(), restoreVisibleLog: vi.fn(),
    tutorialStep: TUTORIAL_FLOW.CULTIST_GOD_CONVERT_CHECK,
    TUTORIAL_FLOW, applyTutorialStepState, clearTutorialWinState, getTutorialStep,
  });
  const advance = runInNewContext(`${appSection('  const advanceTutorialStep=useCallback(', '  const isTutorialActionAllowed=useCallback(')}\nadvanceTutorialStep`, commit.context);
  advance(TUTORIAL_FLOW.CULTIST_GOD_PLAYER_DRAW);
  const state = commit.current();
  expect(state._playersBeforeThisDraw).toBeNull();
  expect(state._preTurnPlayers).toBeNull();
  expect(renderedPlayers(state)[1]).toEqual(after.players[1]);
  expect(commit.context.setTutorialStep).toHaveBeenCalledWith(TUTORIAL_FLOW.CULTIST_GOD_PLAYER_DRAW);
  expect(commit.context.restoreVisibleLog).not.toHaveBeenCalled();
  expect(state.phase).toBe('AI_TURN');
  // A chapter's new scenario is the sole reason to restore the log wholesale.
  advance(TUTORIAL_FLOW.HUNTER_INTRO);
  expect(commit.current().players[0].role).toBe('追猎者');
  expect(commit.context.restoreVisibleLog).toHaveBeenCalledOnce();
  expect(commit.context.restoreVisibleLog).toHaveBeenCalledWith(commit.current().log, commit.current());
});
