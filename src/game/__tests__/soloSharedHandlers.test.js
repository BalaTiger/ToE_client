import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import * as apophisAnimQueue from '../apophisAnimQueue';
import * as animationTiming from '../animationTiming';
import * as queueMachine from '../animationQueueMachine';
import { isAiSeat } from '../rotateState';
import { buildSwapCardsVisualTransaction } from '../identitySkillVisualTransaction';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const queueSource = readFileSync(new URL('../../hooks/useAnimationQueue.js', import.meta.url), 'utf8');
const extract = name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  return source.slice(start, start + closing.index + closing[0].length);
};
const handlers = names => names.map(extract).join('\n');

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function makeContext(initial) {
  const queues = [];
  const consumed = new Set();
  const context = {
    ...game, ...animQueueHelpers, ...apophisAnimQueue, isAiSeat, buildSwapCardsVisualTransaction,
    gs: initial, isMultiplayer: false,
    consumedVisualEventIdsRef: { current: consumed },
    visualStateLocks: { lock: vi.fn(), clear: vi.fn() },
    setGs: next => { context.gs = typeof next === 'function' ? next(context.gs) : next; },
    _cthContinueRestDraws: vi.fn(next => { context.gs = next; }),
    broadcastMpStateBeforeLocalReplay: vi.fn(),
    triggerAnimQueue: (queue, next, callback, meta) => {
      const transaction = game.prepareAnimationTransaction({ queue, nextState: next, callback,
        transactionMeta: meta, consumedEventIds: consumed });
      queues.push(transaction.queue);
      transaction.eventIds.forEach(id => consumed.add(id));
      if (next) context.gs = next;
      transaction.callback?.();
    },
  };
  return { context, queues };
}

describe('single-player shared handlers after multiplayer synchronization', () => {
  it.each([false, true])('keeps swap events local and consumes the night prelude once (night=%s)', night => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const players = makeStandardPlayers(3, [{ name: '你' }, { name: '艾伦' }, { name: '贝拉' }]);
    players.forEach(player => { player.hand = [makeZoneCard('C2')]; });
    if (night) players[0].san = 7;
    const initial = makeGs({ players, phase: 'SWAP_SELECT_TARGET', globalOnlySwapOwner: null,
      deck: [makeZoneCard('B1')], inspectionDiscard: [],
      inspectionDeck: [{ id: 'test-inspect', name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive' }],
      apophisNight: night ? game.getApophisNightForLevel(1) : null, _visualEvents: [] });
    const { context, queues } = makeContext(initial);
    Object.assign(context, { showTutorial: false, tutorialStep: null,
      isTutorialActionAllowed: () => true, getNextTutorialStepForAction: () => null,
      finishTutorialActionWithState: (next, _tutorialNext, queue) => context.triggerAnimQueue(queue, next, undefined, game.AUTHORITATIVE_QUEUE_META),
    });
    runInNewContext(handlers(['swapSelectTarget', 'setGsWithApophisTargetAnim', 'swapSelectTargetCard', 'swapGiveCard', 'broadcastAnimTransaction']), context);
    context.swapSelectTarget(1);
    expect(context.gs.abilityData.swapTi).toBe(night ? 2 : 1);
    expect(context.gs.deck).toHaveLength(night ? 0 : 1);
    context.swapSelectTargetCard(0);
    context.swapGiveCard(0);
    const steps = queues.flat();
    const types = steps.map(step => step.type);
    expect(types.filter(type => type === 'DICE_ROLL')).toHaveLength(night ? 1 : 0);
    expect(types.filter(type => type === 'SKILL_SWAP')).toHaveLength(1);
    if (night) {
      expect(types.indexOf('DICE_ROLL')).toBeLessThan(types.indexOf('SAN_DAMAGE'));
      expect(types.indexOf('SAN_DAMAGE')).toBeLessThan(types.indexOf('DRAW_CARD'));
      expect(types.indexOf('DRAW_CARD')).toBeLessThan(types.indexOf('SKILL_SWAP'));
    }
    const logIds = new Set();
    const logs = prepareAnimQueueLogs(steps, context.gs).flatMap(step => consumeVisualLogEntries(step.logEntries, logIds));
    expect(logs.filter(line => line.startsWith('【黑夜】'))).toHaveLength(night ? 1 : 0);
    expect(context.broadcastMpStateBeforeLocalReplay).not.toHaveBeenCalled();
    expect(context.gs.phase).toBe('ACTION');
  });

  it.each([
    { actor: 0, night: true, fromRest: true },
    { actor: 1, night: false, fromRest: false },
    { actor: 1, night: true, fromRest: true },
  ])('finishes the solo rope target without dropping visual events or routing to MP (%j)', ({ actor, night, fromRest }) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.55);
    const players = makeStandardPlayers(3, [{ name: '你' }, { name: '艾伦' }, { name: '贝拉' }]);
    const target = actor ? 0 : 1;
    const initial = makeGs({ players, currentTurn: actor, phase: 'DAMAGE_LINK_SELECT_TARGET',
      abilityData: { damageLinkSource: actor, damageLinkTargets: [target, 2], ...(fromRest ? { fromRest: true, cthDrawsRemaining: 1 } : {}) },
      apophisNight: night ? game.getApophisNightForLevel(1) : null, _visualEvents: [] });
    const { context, queues } = makeContext(initial);
    runInNewContext(handlers(['damageLinkSelectTarget', 'buildTargetContinuationGs', 'finishTargetContinuation', 'broadcastAnimTransaction']), context);
    context.damageLinkSelectTarget(target);
    const steps = queues.flat();
    expect(steps.filter(step => step.effect === 'damageLink')).toHaveLength(1);
    expect(steps.filter(step => step.type === 'DICE_ROLL')).toHaveLength(night ? 1 : 0);
    if (night) expect(steps.findIndex(step => step.type === 'DICE_ROLL')).toBeLessThan(steps.findIndex(step => step.effect === 'damageLink'));
    expect(game.getAllDamageLinks(context.gs.players)).toHaveLength(1);
    expect(context._cthContinueRestDraws).toHaveBeenCalledTimes(fromRest && !actor ? 1 : 0);
    expect(context.gs.phase).toBe(actor ? 'AI_TURN' : 'ACTION');
    expect(context.broadcastMpStateBeforeLocalReplay).not.toHaveBeenCalled();
    const logIds = new Set();
    const logs = prepareAnimQueueLogs(steps, context.gs).flatMap(step => consumeVisualLogEntries(step.logEntries, logIds));
    expect(logs.filter(line => line.startsWith('【两人一绳】'))).toHaveLength(1);
  });

  it.each([false, true])('manual solo hand-limit discard reaches the next AI turn once (TSG=%s)', tsg => {
    const players = makeStandardPlayers(3, [{ name: '你' }, { name: '艾伦' }, { name: '贝拉' }]);
    players[0].hand = Array.from({ length: 5 }, () => makeZoneCard('A1'));
    if (tsg) { players[0].godName = 'TSG'; players[0].godLevel = 1; }
    const entered = game.resolveEndTurn(makeGs({ players, deck: [makeZoneCard('C2')] }), { effectiveHandLimit: 4 });
    const initial = { ...entered.gs, abilityData: { ...entered.gs.abilityData, discardSelected: [4] } };
    const { context, queues } = makeContext(initial);
    Object.assign(context, {
      latestGsRef: { current: initial }, endTurnSeqRef: { current: null },
      getHandLimitForPlayer: () => 4,
      withEndTurnReplaySyncEvent: state => state,
      applyNextTurnGs: next => {
        const transaction = game.compileRuleVisualEventsToAnimTransaction(next, null, {
          consumedEventIds: context.consumedVisualEventIdsRef.current,
        });
        context.triggerAnimQueue(transaction.queue, next, undefined, {
          ...game.AUTHORITATIVE_QUEUE_META, eventIds: transaction.eventIds,
        });
      },
    });
    runInNewContext(handlers(['confirmDiscard', 'kickoffEndTurnSeq', 'stepEndTurnSeq', 'dispatchEndTurnEvent',
      'runTsgSlimeGrantEvent', 'advanceEndTurnSeq', 'finishEndTurnSeq', 'broadcastAnimTransaction']), context);
    context.confirmDiscard();
    expect(context.gs.currentTurn).toBe(1);
    expect(context.gs._mpAutoDiscard).toBeFalsy();
    expect(context.gs._mpEndTurnDiscardResolved).toBeFalsy();
    expect(context.gs.discard).toContainEqual(initial.players[0].hand[4]);
    expect(context.broadcastMpStateBeforeLocalReplay).not.toHaveBeenCalled();
    const steps = queues.flat();
    expect(steps.filter(step => step.type === 'DISCARD')).toHaveLength(1);
    expect(steps.filter(step => step.type === 'YOUR_TURN')).toHaveLength(1);
    const logIds = new Set();
    const logs = prepareAnimQueueLogs(steps, context.gs).flatMap(step => consumeVisualLogEntries(step.logEntries, logIds));
    expect(logs.filter(line => line.startsWith('弃置：'))).toHaveLength(1);
    expect(logs.filter(line => line.includes('获得1张撒托古亚的赐福黏液'))).toHaveLength(tsg ? 1 : 0);
  });

  it('solo main-menu reset invalidates already scheduled impact and advance cues', () => {
    vi.useFakeTimers();
    const pending = { phase: 'AI_TURN', players: [{ name: '旧角色' }] };
    const oldCallback = vi.fn();
    const context = {
      ...queueMachine, ...animationTiming,
      isMultiplayer: false, paused: false,
      anim: { type: 'HP_DAMAGE', _playbackId: 17, durationMs: 100, impactAtMs: 50,
        visualTimeline: [{ atMs: 50, patch: { players: pending.players } }] },
      ANIM_STEP_GAP: 0, Date, setTimeout, clearTimeout,
      animQueueRef: { current: [{ type: 'YOUR_TURN' }] }, pendingGsRef: { current: pending },
      animCallbackRef: { current: oldCallback }, pendingVisualEventIdsRef: { current: ['old-event'] },
      playbackRef: { current: { id: 17, elapsedMs: 0, runningSinceMs: null, firedCueIds: new Set() } },
      queueLifecycleRef: { current: { phase: 'playing', previousPhase: null } },
      consumedVisualEventIdsRef: { current: new Set(['old-event']) },
      pendingMpRawQueueRef: { current: [pending] }, pendingMpLatestStateRawRef: { current: pending },
      pendingMpAiTakeoverRef: { current: pending }, mpOpeningRoleRevealPendingRef: { current: true },
      endTurnSeqRef: { current: { events: ['old'] } }, latestGsRef: { current: pending },
      roseThornPrevRef: { current: {} },
      useCallback: callback => callback, useEffect: callback => { context.cleanup = callback(); },
      setAnim: vi.fn(), setAnimExiting: vi.fn(), setRoleRevealAnim: vi.fn(),
      setIsSoloPaused: vi.fn(), setPendingRoleSelection: vi.fn(), setGs: vi.fn(),
      clearSkillAnimations: vi.fn(), clearCardTransferAnimations: vi.fn(), clearDamageAnimations: vi.fn(),
      setEarthquakeVisualPlayers: vi.fn(), visualStateLocks: { clear: vi.fn() },
      traceAnimationQueue: vi.fn(), advanceQueue: vi.fn(), applyVisualPatch: vi.fn(),
      setDisplayStats: vi.fn(), revealAnimLogs: vi.fn(),
      sendQueueLifecycleEvent: type => {
        context.queueLifecycleRef.current = queueMachine.transitionAnimationQueue(context.queueLifecycleRef.current, type);
      },
    };
    const resetStart = queueSource.indexOf('  const resetAnimationQueue = useCallback(');
    const resetEnd = queueSource.indexOf('\n\n  function sendQueueLifecycleEvent', resetStart);
    const effectStart = queueSource.indexOf('  useEffect(() => {\n    if (!anim) return;');
    const effectEnd = queueSource.indexOf('\n\n  function playAnimationTransaction', effectStart);
    const clearStart = source.indexOf('  const clearBattleAnimationState=useCallback(');
    const clearEnd = source.indexOf('\n\n  const applyTutorialStateSnapshot', clearStart);
    runInNewContext(`${queueSource.slice(resetStart, resetEnd)}\n${source.slice(clearStart, clearEnd)}\n${extract('returnToMainMenu')}\n${queueSource.slice(effectStart, effectEnd)}`, context);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    context.returnToMainMenu();
    expect(context.setGs).toHaveBeenCalledWith(null);
    expect(context.pendingGsRef.current).toBeNull();
    expect(context.pendingVisualEventIdsRef.current).toEqual([]);
    expect(context.endTurnSeqRef.current).toBeNull();
    expect(context.latestGsRef.current).toBeNull();
    expect(context.playbackRef.current.id).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(context.advanceQueue).not.toHaveBeenCalled();
    expect(context.applyVisualPatch).not.toHaveBeenCalled();
    expect(context.setDisplayStats).not.toHaveBeenCalled();
    expect(context.revealAnimLogs).not.toHaveBeenCalled();
    expect(oldCallback).not.toHaveBeenCalled();
    context.cleanup();
  });
});
