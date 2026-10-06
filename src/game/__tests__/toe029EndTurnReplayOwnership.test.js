import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as helpers from '../animQueueHelpers';
import * as animLogs from '../animLogs';
import * as rotateState from '../rotateState';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { applyZoneCardIncome } from '../zoneCardIncome';
import { processIncomingMultiplayerStateSync } from '../../multiplayer/multiplayerRemoteReplayExecutor';
import { useEndTurnReplaySync } from '../../hooks/useEndTurnReplaySync';
import { makeBlankZoneCard, makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const names = ['beginEndTurnReplay', 'continueEndTurnReplay', 'broadcastMpStateBeforeLocalReplay',
  'broadcastAnimTransaction', 'handleDrawKeepResolved', 'handleDrawDiscardResolved', 'godResolvePlayer'];
// The baseline has no bridge; its real handlers provide the failing control.
if (source.includes('  function broadcastEndTurnReplayPresentation(')) names.push('broadcastEndTurnReplayPresentation');
const handlers = names.map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  if (start < 0 || !closing) throw new Error(`Missing App handler: ${name}`);
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n');
const clearHints = source.match(/ {2}const clearTurnDrawReplayHints=[\s\S]*?\}\):state;/)?.[0];

afterEach(() => vi.restoreAllMocks());

function corridor() {
  return makeZoneCard('A3', 3, { id: 'corridor' });
}

function initialState(cards, extra = {}) {
  return makeGs({ _isMP: true, currentTurn: 0, turn: 3, _turnKey: 3, phase: 'ACTION',
    players: [makePlayer({ name: 'actor', role: '追猎者', hp: 10, san: 10, hand: [...cards, corridor()] }),
      makePlayer({ name: 'viewer-b' }), makePlayer({ name: 'viewer-c' })],
    deck: [makeBlankZoneCard({ id: 'next-safe' })], discard: [], _visualEvents: [],
    inspectionDeck: [{ name: '暂时平静', effect: 'nothing', value: 0 }], inspectionDiscard: [],
    ...extra,
  });
}

function bind(initial) {
  const packets = [];
  const submissions = [];
  const consumed = new Set();
  const logIds = new Set();
  const localLogs = [];
  const context = { ...game, ...helpers, ...animLogs, ...rotateState, applyZoneCardIncome, gs: initial, isMultiplayer: true,
    showTutorial: false, tutorialStepDef: null, roomModal: { roomId: 'toe029-local' },
    consumedVisualEventIdsRef: { current: consumed }, lastInspectionSeqRef: { current: 0 },
    myPlayerIndexRef: { current: 0 }, suppressNextBroadcastRef: { current: false },
    inEndTurnSeq: () => false, markInspectionEventsSeen: vi.fn(), appendVisibleLog: vi.fn(),
    mergeApophisTargetQueue: queue => queue,
    setGs: value => { context.gs = typeof value === 'function' ? value(context.gs) : value; },
    socketRef: { current: { emit: (name, packet) => {
      expect(name).toBe('mpStateSync');
      packets.push(JSON.parse(JSON.stringify(packet.gs)));
    } } },
    triggerAnimQueue: (queue, nextState, callback, transactionMeta) => {
      submissions.push({ ...game.prepareAnimationTransaction({ queue, previousState: context.gs,
        nextState, callback, transactionMeta, consumedEventIds: consumed }), nextState });
    },
    applyNextTurnGs: state => {
      // The turn rule and canonical compiler remain real. Only React playback
      // and DOM setters are replaced; the existing App broadcast is exercised.
      const transaction = game.compileRuleVisualEventsToAnimTransaction(state, context.gs,
        { consumedEventIds: consumed });
      context.broadcastAnimTransaction(state, transaction.queue, { context: 'turnStartDraw' });
      context.triggerAnimQueue(transaction.queue, state, undefined,
        { ...game.AUTHORITATIVE_QUEUE_META, eventIds: transaction.eventIds, preserveQueueOrder: true });
    },
  };
  Object.defineProperty(context, 'me', { get: () => context.gs.players[0] });
  function Probe() {
    Object.assign(context, useEndTurnReplaySync({ broadcastState: state => context.broadcastMpStateBeforeLocalReplay(state) }));
    return null;
  }
  renderToString(createElement(Probe));
  runInNewContext(`${handlers}\n${clearHints}`, context);
  let cursor = 0;
  let stats = initial.players.map(({ hp, san }) => ({ hp, san }));
  const complete = () => {
    const submission = submissions[cursor++];
    if (!submission) throw new Error('No submitted transaction');
    for (const step of animLogs.prepareAnimQueueLogs(submission.queue, submission.nextState || context.gs)) {
      localLogs.push(...consumeVisualLogEntries(step.logEntries, logIds));
      stats = game.applyStatAnimationImpact(stats, step);
    }
    submission.eventIds.forEach(id => consumed.add(id));
    if (submission.nextState) context.setGs(submission.nextState);
    submission.callback?.();
    return submission;
  };
  return { context, packets, submissions, consumed, localLogs, complete,
    stats: () => stats, pending: () => submissions.length - cursor,
    begin: () => context.beginEndTurnReplay(initial, game.copyPlayers(initial.players),
      [...initial.deck], [...initial.discard], [...initial.log]) };
}

function assertRemoteViews(initial, runtime) {
  let firstLogs;
  for (const viewer of [1, 2]) {
    let previousGs = rotateState.rotateGsForViewer(initial, viewer);
    const consumed = new Set();
    const logIds = new Set();
    const logs = [];
    let stats = previousGs.players.map(({ hp, san }) => ({ hp, san }));
    const queues = [];
    const context = {
      myPlayerIndexRef: { current: viewer }, latestGsRef: { current: previousGs },
      consumedVisualEventIdsRef: { current: consumed }, mpRoleRevealedRef: { current: true },
      mpOpeningRoleRevealPendingRef: { current: false }, recentMpAnimatedRawSignaturesRef: { current: [] },
      pendingMpRawQueueRef: { current: [] }, pendingMpLatestStateRawRef: { current: null },
      animQueueRef: { current: [] }, pendingGsRef: { current: null },
      receivedGsRef: { current: false }, suppressNextBroadcastRef: { current: false },
      visualStateLocks: { lock: vi.fn() }, markInspectionEventsSeen: vi.fn(),
      setAnimExiting: vi.fn(), clearDamageAnimations: vi.fn(), setAnim: vi.fn(),
      setGs: state => { previousGs = state; context.latestGsRef.current = state; },
      triggerAnimQueue: (queue, state, _callback, meta) => queues.push({ queue, state, meta }),
    };
    for (const packet of runtime.packets) {
      processIncomingMultiplayerStateSync({ rawState: packet, currentState: previousGs, context });
      while (queues.length) {
        const submission = queues.shift();
        for (const step of animLogs.prepareAnimQueueLogs(submission.queue, submission.state)) {
          logs.push(...consumeVisualLogEntries(step.logEntries, logIds));
          stats = game.applyStatAnimationImpact(stats, step);
        }
        submission.meta.eventIds?.forEach(id => consumed.add(id));
        context.setGs(submission.state);
      }
      // Exact repeated socket delivery is filtered by the real executor, even
      // when the pending decision still resembles a compatibility draw hint.
      expect(processIncomingMultiplayerStateSync({ rawState: packet,
        currentState: previousGs, context })).toBe('ignored');
      expect(queues).toEqual([]);
    }
    expect(previousGs.players).toEqual(rotateState.rotateGsForViewer(runtime.context.gs, viewer).players);
    expect(stats).toEqual(previousGs.players.map(({ hp, san }) => ({ hp, san })));
    if (viewer === 1) firstLogs = logs;
  }
  return { logs: firstLogs };
}

describe('TOE029 real App endless-corridor queue ownership', () => {
  it('plays forced falling damage once and commits the physical hand before the next turn', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fall = makeZoneCard('A1', 0, { id: 'fall' });
    const initial = initialState([fall]);
    const runtime = bind(initial);
    expect(runtime.begin()).toBe(true);
    runtime.complete(); // Real opening callback reaches the formerly failing forced branch.
    const forced = runtime.complete();
    expect(forced.queue.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(1);
    expect(runtime.context.gs.players[0].hp).toBe(7);
    expect(runtime.context.gs.discard.filter(card => card.id === fall.id)).toHaveLength(1);
    expect(runtime.context.gs.players[0].hand.filter(card => card.id === fall.id)).toHaveLength(0);
    runtime.complete();
    expect(runtime.context.gs.currentTurn).toBe(1);
    expect(runtime.stats()).toEqual(runtime.context.gs.players.map(({ hp, san }) => ({ hp, san })));
    const wrapper = forced.nextState._visualEvents.find(event => event.type === 'endlessCorridorReplay');
    expect(forced.eventIds).toContain(wrapper.id);
    const nestedIds = wrapper.queue.map(step => step.visualEventId).filter(Boolean);
    expect(nestedIds.length).toBeGreaterThan(0);
    expect(nestedIds.every(id => forced.eventIds.includes(id))).toBe(true);
    const { logs } = assertRemoteViews(initial, runtime);
    expect(logs.filter(line => line.includes('失去 3 HP'))).toHaveLength(1);
    expect(logs.filter(line => line.includes('viewer-b 的回合开始'))).toHaveLength(1);
    expect(() => game.authoritativeEndTurnReplayQueueMeta(forced.nextState,
      forced.queue.filter(step => step.type !== 'HP_DAMAGE'), new Set())).toThrow(/missing visual events/);
  });

  it('keeps an ordinary replay card once, preserving its authored healing and the following turn', () => {
    const heal = makeZoneCard('A2', 0, { id: 'heal' });
    const initial = initialState([heal]);
    initial.players[0].hp = 8;
    const runtime = bind(initial);
    runtime.begin(); runtime.complete(); runtime.complete();
    expect(runtime.context.gs.phase).toBe('DRAW_REVEAL');
    runtime.context.handleDrawKeepResolved();
    runtime.complete();
    runtime.context.continueEndTurnReplay(runtime.context.gs); // Actual idle App effect resumes after the keep queue.
    runtime.complete();
    expect(runtime.context.gs.players[0].hp).toBe(9);
    expect(runtime.context.gs.players[0].hand.filter(card => card.id === heal.id)).toHaveLength(1);
    expect(runtime.context.gs.currentTurn).toBe(1);
    assertRemoteViews(initial, runtime);
  });

  it('does not replay a completed discard when the following forced card creates a fresh delta', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const blank = makeBlankZoneCard({ id: 'ordinary' });
    const fall = makeZoneCard('A1', 0, { id: 'after-discard-fall' });
    const initial = initialState([blank, fall]);
    const runtime = bind(initial);
    runtime.begin(); runtime.complete(); runtime.complete();
    runtime.context.handleDrawDiscardResolved(); runtime.complete();
    runtime.context.continueEndTurnReplay(runtime.context.gs);
    runtime.complete(); runtime.complete();
    const allSteps = runtime.submissions.flatMap(submission => submission.queue);
    expect(allSteps.filter(step => step.type === 'DISCARD' && step.card?.id === blank.id)).toHaveLength(1);
    expect(runtime.context.gs.discard.filter(card => card.id === blank.id)).toHaveLength(1);
    expect(runtime.context.gs.discard.filter(card => card.id === fall.id)).toHaveLength(1);
    expect(runtime.context.gs.players[0].hp).toBe(7);
    const forcedDelta = runtime.packets.find(packet => packet._visualEvents?.some(event =>
      event.type === 'endlessCorridorReplay' && event.queue.some(step => step.type === 'HP_DAMAGE')));
    const freshWrapper = forcedDelta._visualEvents.find(event => event.type === 'endlessCorridorReplay');
    expect(freshWrapper.queue.some(step => step.type === 'DISCARD' && step.card?.id === blank.id)).toBe(false);
    assertRemoteViews(initial, runtime);
  });

  it('retains god SAN loss and its inspection until the real discard decision completes', () => {
    const god = makeGodCard('NYA', { id: 'replayed-nya' });
    const initial = initialState([god]);
    initial.players[0].san = 8; initial.players[0].godEncounters = 1;
    const runtime = bind(initial);
    runtime.begin(); runtime.complete();
    const encounter = runtime.complete();
    expect(runtime.context.gs.phase).toBe('GOD_CHOICE');
    expect(runtime.context.gs.players[0].san).toBe(6);
    expect(encounter.queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
    expect(encounter.queue.filter(step => step.type === 'DRAW_CARD' && step.card?.name === '暂时平静')).toHaveLength(1);
    runtime.context.godResolvePlayer('discard'); runtime.complete(); runtime.complete();
    expect(runtime.context.gs.players[0].godName).toBeNull();
    expect(runtime.context.gs.players[0].hand.some(card => card.id === god.id)).toBe(false);
    expect(runtime.context.gs.discard.filter(card => card.id === god.id)).toHaveLength(1);
    expect(runtime.context.gs.currentTurn).toBe(1);
    assertRemoteViews(initial, runtime);
  });

  it('retains the original single-player queue when there is no multiplayer wrapper', () => {
    const heal = makeZoneCard('A2', 0, { id: 'solo-heal' });
    const initial = initialState([heal], { _isMP: false });
    const runtime = bind(initial);
    runtime.context.isMultiplayer = false;
    runtime.begin(); runtime.complete();
    const reveal = runtime.complete();
    expect(reveal.queue.map(step => step.type)).toEqual(['DRAW_CARD']);
    expect(runtime.context.gs.phase).toBe('DRAW_REVEAL');
    expect(runtime.packets).toEqual([]);
  });
});
