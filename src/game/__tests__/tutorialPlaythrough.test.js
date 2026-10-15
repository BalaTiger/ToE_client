import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as identityTransactions from '../identitySkillVisualTransaction';
import { advanceGodEncounter, formatGodEncounterProgress } from '../balancePatches';
import { applyZoneCardIncome } from '../zoneCardIncome';
import { dropSwapTakenTransferStep } from '../animQueueHelpers';
import { GOD_DEFS } from '../../constants/card';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const { TUTORIAL_FLOW: F } = game;
function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

// Run the real action handlers, committing each ordinary animation transaction
// before accepting the next tutorial input.
function playthrough(kind, step) {
  const context = {
    ...game, ...identityTransactions, advanceGodEncounter, formatGodEncounterProgress, applyZoneCardIncome, dropSwapTakenTransferStep, GOD_DEFS,
    resolveApophisTarget: game.resolveApophisTargetWithStats,
    gs: game.createTutorialScenario(kind), tutorialStep: step,
    showTutorial: true, tutorialStepDef: game.getTutorialStep(step), isBlocked: false,
    consumedVisualEventIdsRef: { current: new Set() }, lastInspectionSeqRef: { current: 0 },
    broadcastAnimTransaction: vi.fn(),
    clearTurnDrawReplayHints: game.withClearedReplayAnimFields,
  };
  Object.defineProperties(context, {
    me: { get: () => context.gs.players[0] }, phase: { get: () => context.gs.phase },
  });
  context.setGs = update => { context.gs = typeof update === 'function' ? update(context.gs) : update; };
  context.setTutorialStep = next => {
    context.tutorialStep = next;
    context.tutorialStepDef = game.getTutorialStep(next);
  };
  context.isTutorialActionAllowed = action => game.shouldAllowTutorialAction(context.tutorialStep, action);
  context.getNextTutorialStepForAction = action => game.nextTutorialStepAfterAction(context.tutorialStep, action);
  context.triggerAnimQueue = (queue, state, complete, transactionMeta) => {
    if (!transactionMeta) game.strictActionQueueMeta(state, queue, context.consumedVisualEventIdsRef.current, 'tutorial playthrough');
    for (const event of state._visualEvents || []) context.consumedVisualEventIdsRef.current.add(event.id);
    context.setGs(game.withClearedReplayAnimFields(state));
    complete?.();
  };
  context.finishTutorialActionWithState = (state, next, queue, transactionMeta) => {
    context.triggerAnimQueue(queue, state, () => {
      context.setGs(game.withClearedReplayAnimFields(game.clearTutorialWinState(state, next)));
      context.setTutorialStep(next);
    }, transactionMeta);
  };
  context.setGsWithApophisTargetAnim = context.setGs;
  context.shouldDelayHuntLootSelection = runInNewContext(`${section('function shouldDelayHuntLootSelection(', '// ══════════════════════════════════════════════════════════════\n//  WIN CHECK')}\nshouldDelayHuntLootSelection`, context);
  for (const [start, end] of [
    ['  function useAbility()', '  function swapSelectTarget('],
    ['  function swapSelectTarget(', '  function zoneSwapSelectTarget('],
    ['  function swapSelectTargetCard(', '  function huntSelectTarget('],
    ['  function huntSelectTarget(', '  function huntSelectCardFromPublic('],
    ['  function bewitchSelectCard(', '  function tortoiseOracleSelect('],
    ['  function bewitchSelectTarget(', '  // ── God choice handlers'],
    ['  function godResolvePlayer(', '  // NYA borrow handlers'],
  ]) runInNewContext(section(start, end), context);
  return context;
}

afterEach(() => vi.restoreAllMocks());

describe('tutorial chapter playthroughs using live action handlers', () => {
  it('gates every teaching action to its allowed type, target and card', () => {
    for (const step of game.TUTORIAL_STEPS) {
      const allowed = step.allowedAction;
      if (!allowed) {
        for (const type of ['useSkill', 'handCard', 'selectTarget', 'drawKeep', 'swapSteal', 'godKeepHand', 'dodgeRoll']) {
          expect(game.shouldAllowTutorialAction(step.id, { type }), `${step.id}: ${type}`).toBe(false);
        }
        continue;
      }
      const actions = Array.isArray(allowed.cardId)
        ? allowed.cardId.map(cardId => ({ ...allowed, cardId })) : [allowed];
      for (const action of actions) {
        expect(game.shouldAllowTutorialAction(step.id, action), step.id).toBe(true);
        const next = game.nextTutorialStepAfterAction(step.id, action);
        expect(game.TUTORIAL_STEP_BY_ID[next], `${step.id} has a reachable next step`).toBeDefined();
        expect(game.shouldAllowTutorialAction(step.id, { ...action, type: 'endTurn' })).toBe(false);
        if (action.pid != null) expect(game.shouldAllowTutorialAction(step.id, { ...action, pid: 0 })).toBe(false);
        if (action.cardIndex != null) expect(game.shouldAllowTutorialAction(step.id, { ...action, cardIndex: 1 })).toBe(false);
        if (action.cardId != null) expect(game.shouldAllowTutorialAction(step.id, { ...action, cardId: 'wrong-card' })).toBe(false);
      }
    }
  });

  it('starts a fresh chapter and clears pending tutorial playback when entered again', () => {
    const context = {
      ...game,
      consumedVisualEventIdsRef: { current: new Set(['old-action']) },
      softGuidePrevPlayersRef: { current: ['old-player'] }, queuedSoftGuideIdRef: { current: 'old-guide' },
      roseThornPrevRef: { current: 'old-rose' },
      clearBattleAnimationState: vi.fn(), getVisualDiscardForState: state => state.discard,
    };
    for (const key of ['setTutorialDiceResultPending', 'setTutorialGodPlayerDrawArmed', 'setTutorialOverlayHidden',
      'setPendingSoftGuideId', 'setRoleRevealAnim', 'setShowGodResurrection', 'setShowFullLog', 'setSwapBlindDraw',
      'setMobileArmedGodCardIdx', 'setTutorialStep', 'setShowTutorial', 'restoreVisibleLog', 'setVisualDiscard',
      'setDisplayStats', 'setGs']) context[key] = vi.fn();
    runInNewContext(section('  function _startForTutorial()', '  function cancelAction()'), context);
    context._startForTutorial();
    const first = context.setGs.mock.lastCall[0];
    first.players[0].hand.length = 0;
    first.players[1].isDead = true;
    context._startForTutorial();
    const restarted = context.setGs.mock.lastCall[0];
    expect(restarted).toMatchObject({ phase: 'ACTION', gameOver: null, _isTutorial: true });
    expect(restarted.players[0].hand).toHaveLength(3);
    expect(restarted.players[1].isDead).toBe(false);
    expect(context.consumedVisualEventIdsRef.current.size).toBe(0);
    expect(context.queuedSoftGuideIdRef.current).toBeNull();
    expect(context.softGuidePrevPlayersRef.current).toBeNull();
    expect(context.clearBattleAnimationState).toHaveBeenCalledTimes(2);
    expect(context.setTutorialStep).toHaveBeenLastCalledWith(F.INTRO);
    expect(context.setTutorialDiceResultPending).toHaveBeenLastCalledWith(false);
    expect(context.setTutorialGodPlayerDrawArmed).toHaveBeenLastCalledWith(false);
    expect(context.setTutorialOverlayHidden).toHaveBeenLastCalledWith(false);
    expect(context.setSwapBlindDraw).toHaveBeenLastCalledWith(null);
  });

  it('completes the forced draw, successful dodge and swap without losing any treasure numbers', () => {
    const play = playthrough('treasure', F.TREASURE_DRAW_REVEAL);
    const drawn = game.startNextTurn({ ...play.gs, currentTurn: 1 });
    const dodge = game.resolveTreasureDodge(drawn, drawn.drawReveal, { roll: 6, actorLabel: '你' });
    const presentation = game.buildTreasureDodgeRollPresentation(dodge.transaction);
    play.setGs(game.withClearedReplayAnimFields(presentation.afterState));
    for (const event of play.gs._visualEvents || []) play.consumedVisualEventIdsRef.current.add(event.id);
    play.setTutorialStep(F.TREASURE_USE_SKILL);
    play.useAbility();
    expect(play.tutorialStep).toBe(F.TREASURE_SELECT_TARGET);
    play.swapSelectTarget(1);
    expect(play.gs.phase).toBe('SWAP_STEAL_CARD');
    // The blind hand's shuffle completes before enabling its fixed card.
    play.setTutorialStep(F.TREASURE_STEAL_CARD);
    play.swapSelectTargetCard(0);
    expect(play.tutorialStep).toBe(F.TREASURE_GIVE_CARD);
    play.swapGiveCard(play.me.hand.findIndex(card => card.id === 'tut-treasure-forced-draw'));
    expect(play.tutorialStep).toBe(F.TREASURE_MAP_ANIM);
    expect(play.gs.phase).toBe('PLAYER_WIN_PENDING');
    expect(game.isWinHand(play.me.hand)).toBe(true);
    expect(play.gs.players[1].hand.filter(card => card.id === 'tut-treasure-forced-draw')).toHaveLength(1);
  });

  it.each(['tut-hunter-match-a1', 'tut-hunter-match-d1'])('completes both hunts when the first discard is %s', firstCardId => {
    const play = playthrough('hunter', F.HUNTER_USE_SKILL);
    for (const [cardId, revealStep, confirmStep, resultStep, hp] of [
      [firstCardId, F.HUNTER_REVEAL, F.HUNTER_CONFIRM_CARD, F.HUNTER_SECOND_HUNT_INTRO, 3],
      [firstCardId === 'tut-hunter-match-a1' ? 'tut-hunter-match-d1' : 'tut-hunter-match-a1', F.HUNTER_REVEAL_2, F.HUNTER_CONFIRM_CARD_2, F.HUNTER_RESULT, 0],
    ]) {
      play.useAbility();
      play.huntSelectTarget(1);
      expect(play.tutorialStep).toBe(revealStep);
      expect(play.gs.phase).toBe('HUNT_CONFIRM');
      play.setTutorialStep(confirmStep);
      play.huntConfirm(play.me.hand.findIndex(card => card.id === cardId));
      expect(play.tutorialStep).toBe(resultStep);
      expect(play.gs.players[1].hp).toBe(hp);
      expect(play.gs.gameOver).toBeNull();
      if (hp > 0) play.setTutorialStep(F.HUNTER_USE_SKILL_2);
    }
    expect(play.gs.players[1].isDead).toBe(true);
    expect(play.me.hand.filter(card => card.id.startsWith('tut-hunter-target-'))).toHaveLength(3);
  });

  it('completes the region-card bewitch chapter with SAN zero and one delivered card', () => {
    const play = playthrough('cultistZone', F.CULTIST_ZONE_USE_SKILL);
    play.useAbility();
    play.bewitchSelectCard(play.me.hand.findIndex(card => card.id === 'tut-cult-zone'));
    play.bewitchSelectTarget(1);
    expect(play.tutorialStep).toBe(F.CULTIST_ZONE_RESULT);
    expect(play.gs.players[1].san).toBe(0);
    expect(play.gs.players[1].hand.filter(card => card.id === 'tut-cult-zone')).toHaveLength(1);
    expect(play.gs.gameOver).toBeNull();
  });

  it.each([0, .25, .5, .75, .999999])('completes encounter, conversion, keep and forced faith for random=%s', random => {
    vi.spyOn(Math, 'random').mockReturnValue(random);
    const play = playthrough('cultistGod', F.CULTIST_GOD_KEEP_HAND);
    const encounter = game.startNextTurn(play.gs);
    expect(encounter.phase).toBe('AI_GOD_CHOICE');
    const converted = game.resolveAiGodChoiceTransition(encounter).state;
    expect(converted.players[1]).toMatchObject({ godName: 'VRI', san: 4 });
    // The scripted opponent ends their turn after conversion.
    const localDraw = game.startNextTurn({ ...game.withClearedReplayAnimFields(converted), phase: 'ACTION', abilityData: {} });
    expect(localDraw.phase).toBe('GOD_CHOICE');
    expect(localDraw.abilityData.godCard.id).toBe('tut-cult-god');
    play.setGs(game.withClearedReplayAnimFields(localDraw));
    for (const event of localDraw._visualEvents || []) play.consumedVisualEventIdsRef.current.add(event.id);
    play.godResolvePlayer('keepHand');
    expect(play.tutorialStep).toBe(F.CULTIST_GOD_SELECT_CARD);
    play.useAbility();
    expect(play.gs.phase).toBe('BEWITCH_SELECT_CARD');
    play.bewitchSelectCard(play.me.hand.findIndex(card => card.id === 'tut-cult-god'));
    play.bewitchSelectTarget(1);
    expect(play.tutorialStep).toBe(F.CULTIST_GOD_RESULT);
    expect(play.gs.players[1].san).toBe(0);
    expect(play.gs.gameOver).toBeNull();
  });
});
