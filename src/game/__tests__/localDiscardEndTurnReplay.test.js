import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import { derotateGs, isLocalCurrentTurn, rotateGsForViewer } from '../rotateState';
import { buildMpRemoteReplayAction } from '../multiplayerRemoteReplay';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const handlers = [
  'autoDiscardFromRight', 'kickoffEndTurnSeq', 'stepEndTurnSeq',
  'dispatchEndTurnEvent', 'runTsgSlimeGrantEvent', 'advanceEndTurnSeq',
  'finishEndTurnSeq', 'broadcastAnimTransaction', 'broadcastMpStateBeforeLocalReplay',
].map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n');
const effectStart = source.indexOf('  // 执行自动从右侧弃牌');
const discardEffect = source.slice(effectStart, source.indexOf('\n\n  useEffect', effectStart));

function makeContext(initial) {
  const packets = [];
  const queues = [];
  const consumed = new Set();
  const context = {
    ...game, ...animQueueHelpers, derotateGs, isLocalCurrentTurn,
    gs: initial, isMultiplayer: true, effectiveHandLimit: 4,
    endTurnSeqRef: { current: null }, consumedVisualEventIdsRef: { current: consumed },
    myPlayerIndexRef: { current: 0 }, suppressNextBroadcastRef: { current: false },
    roomModal: { roomId: 'discard-slime-regression' },
    withEndTurnReplaySyncEvent: state => state,
    setGs: vi.fn(),
    socketRef: { current: { emit: (name, packet) => {
      expect(name).toBe('mpStateSync');
      packets.push(JSON.parse(JSON.stringify(packet.gs)));
    } } },
    triggerAnimQueue: (queue, next, callback, meta) => {
      const transaction = game.prepareAnimationTransaction({ queue, nextState: next, callback,
        transactionMeta: meta, consumedEventIds: consumed });
      queues.push(transaction.queue);
      transaction.eventIds.forEach(id => consumed.add(id));
      context.finalState = next;
      transaction.callback?.();
    },
    applyNextTurnGs: next => {
      // The UI's next-turn entry is replaced by the shared canonical compiler;
      // rule advance, seed/slime handlers, broadcasts and commit ids are real.
      const transaction = game.compileRuleVisualEventsToAnimTransaction(next, null, { consumedEventIds: consumed });
      context.broadcastAnimTransaction(next, transaction.queue, { context: 'turnStartDraw' });
      context.triggerAnimQueue(transaction.queue, next, undefined, {
        ...game.AUTHORITATIVE_QUEUE_META, eventIds: transaction.eventIds,
      });
    },
  };
  runInNewContext(handlers, context);
  return { context, packets, queues, consumed };
}

describe('multiplayer automatic discard and end-turn replay', () => {
  it.each([false, true])('keeps the timeout command local through discard, slime and next turn (actorTsg=%s)', actorTsg => {
    const players = makeStandardPlayers(3, [{ name: '奥托' }, { name: '索菲' }, { name: '诺亚' }]);
    players[0].hand = ['A1', 'A2', 'A3', 'A4', 'B2'].map(key => makeZoneCard(key));
    players[actorTsg ? 0 : 1].godName = 'TSG';
    players[actorTsg ? 0 : 1].godLevel = 1;
    const initial = makeGs({
      players, _isMP: true, _mpAutoDiscard: true, phase: 'DISCARD_PHASE',
      _turnKey: 4, deck: [makeZoneCard('C2'), makeZoneCard('D2')], _visualEvents: [],
    });
    const { context, packets, queues, consumed } = makeContext(initial);
    context.useEffect = callback => callback();
    context.autoDiscardRef = { current: context.autoDiscardFromRight };
    runInNewContext(discardEffect, context);

    expect(packets).toHaveLength(actorTsg ? 3 : 1);
    expect(context.finalState.currentTurn).toBe(1);
    expect(context.finalState.discard.some(card => card.id === initial.players[0].hand[4].id)).toBe(true);
    expect(packets.every(packet => !packet._mpAutoDiscard)).toBe(true);
    expect(context.finalState._mpAutoDiscard).toBeFalsy();
    if (actorTsg) {
      expect(queues[0][0].type).toBe('DISCARD');
      expect(queues[1].map(step => step.type)).toEqual(['VISUAL_LOCK', 'CARD_TRANSFER', 'STATE_PATCH', 'TURN_BOUNDARY_PAUSE']);
      expect(queues[1].every(step => consumed.has(step.visualEventId))).toBe(true);
      expect(queues[2].some(step => step.type === 'YOUR_TURN')).toBe(true);
    }

    for (const viewer of [1, 2]) {
      let previousGs = rotateGsForViewer(initial, viewer);
      const remoteConsumed = new Set();
      const logIds = new Set();
      const logs = [];
      for (const packet of packets) {
        const rotated = rotateGsForViewer(packet, viewer);
        const action = buildMpRemoteReplayAction({ rotated, previousGs,
          roleRevealed: true, consumedVisualEventIds: remoteConsumed });
        const autoDiscard = vi.fn();
        runInNewContext(discardEffect, { gs: action.maskedGs || action.gs,
          isMultiplayer: true, isLocalCurrentTurn, setGs: vi.fn(),
          autoDiscardRef: { current: autoDiscard }, useEffect: callback => callback() });
        expect(autoDiscard).not.toHaveBeenCalled();
        logs.push(...prepareAnimQueueLogs(action.queue || [], rotated)
          .flatMap(step => consumeVisualLogEntries(step.logEntries, logIds)));
        action.consumedVisualEventIds?.forEach(id => remoteConsumed.add(id));
        previousGs = action.pendingGs || action.gs;
      }
      expect(logs.filter(line => line.startsWith('(超时) 弃置'))).toHaveLength(1);
      expect(logs.filter(line => line.includes('获得1张撒托古亚的赐福黏液'))).toHaveLength(actorTsg ? 1 : 0);
      expect(logs.filter(line => line === '── 索菲 的回合开始 ──')).toHaveLength(1);
      expect(previousGs.players).toEqual(rotateGsForViewer(context.finalState, viewer).players);
    }
  });

  it.each([
    { currentTurn: 1, phase: 'DISCARD_PHASE' },
    { currentTurn: 0, phase: 'ACTION' },
  ])('does not execute an old remote timeout command in %j', state => {
    const autoDiscard = vi.fn();
    runInNewContext(discardEffect, {
      gs: { ...state, _mpAutoDiscard: true }, isMultiplayer: true, isLocalCurrentTurn,
      setGs: vi.fn(), autoDiscardRef: { current: autoDiscard }, useEffect: callback => callback(),
    });
    expect(autoDiscard).not.toHaveBeenCalled();
  });
});
