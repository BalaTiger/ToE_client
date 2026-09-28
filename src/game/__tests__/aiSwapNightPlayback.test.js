import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiStep } from '../aiTurn';
import { authoritativeTurnStartQueueMeta, strictActionQueueMeta } from '../animationQueuePolicy';
import { prepareAnimationTransaction } from '../animationTransaction';
import { normalizeApophisQueueForPlayback } from '../apophisAnimQueue';
import { getApophisNightForLevel } from '../apophisNight';
import { buildTurnStartDrawReplayQueue, getTurnStartDrawBaselineLog } from '../turnAnimState';
import { compileRuleVisualEventsToAnimTransaction } from '../visualEventTransactionCompiler';
import { scopeAiActionReplayMetadata } from '../aiTurnPresentation';
import { makeGs, makePlayer, makeZoneCard } from './factory';

afterEach(() => vi.restoreAllMocks());

describe('AI 掉包后的黑夜播放边界', () => {
  it.each([
    { random: 0.7, changed: false },
    { random: 0.01, changed: true },
  ])('proves both hidden AI-to-AI transfers after the real night target settlement (changed=$changed)', ({ random, changed }) => {
    const players = ['你', '卡洛斯', '黛安娜'].map(name => makePlayer({
      name,
      hand: [makeZoneCard('A1'), makeZoneCard('B1')],
    }));
    // A successful roll selects the other AI directly; a failed roll redirects
    // the original player target to that same AI before resolving the swap.
    if (!changed) players[0].hand = [];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      globalOnlySwapOwner: null,
      apophisNight: getApophisNightForLevel(1),
      _apophisTargetSeq: 0,
      deck: [makeZoneCard('B3'), makeZoneCard('B3')],
    });
    vi.spyOn(Math, 'random').mockReturnValue(random);
    const result = aiStep(gs);
    const metadata = scopeAiActionReplayMetadata(result);
    const state = { ...result, _visualEvents: metadata.visualEvents, _statEvents: metadata.statEvents };
    const swap = metadata.visualEvents.find(event => event.type === 'swapCards');
    expect(swap).toMatchObject({ sourceIdx: 1, targetIdx: 2 });
    expect(metadata.visualEvents.find(event => event.type === 'apophisTarget')).toMatchObject({ changed });
    const queue = compileRuleVisualEventsToAnimTransaction(state, gs, {
      hidePrivateCards: true,
    }).queue;
    const transfers = queue.filter(step => step.type === 'CARD_TRANSFER');
    expect(transfers).toHaveLength(2);
    expect(transfers.every(step => !step.cards?.length)).toBe(true);
    expect(queue.filter(step => step.type === 'DICE_ROLL' && step.diceMode === 'apophisNight')).toHaveLength(1);
    expect(() => strictActionQueueMeta(state, queue, null, 'AI private swap')).not.toThrow();
    expect(() => strictActionQueueMeta(state, queue.filter(step => step !== transfers[1]))).toThrow('missing visual events');
    expect(() => strictActionQueueMeta(state, queue.map(step => step === transfers[1]
      ? { ...step, toPid: 0 }
      : step))).toThrow('missing visual events');
    expect(() => strictActionQueueMeta(state, queue.map(step => step === transfers[1]
      ? { ...step, hiddenCardIdentities: ['wrong-card'] }
      : step))).toThrow('missing visual events');
    const serialized = JSON.parse(JSON.stringify({ state, queue }));
    expect(() => strictActionQueueMeta(serialized.state, serialized.queue)).not.toThrow();
  });

  it.each([
    { actorIdx: 1, random: 0.01, changed: true },
    { actorIdx: 2, random: 0.7, changed: false },
  ])('目标偏移=$changed 时仅在掉包前掷骰一次（AI座位 $actorIdx）', ({ actorIdx, random, changed }) => {
    const players = ['你', '卡洛斯', '黛安娜'].map(name => makePlayer({
      name,
      hand: [makeZoneCard('A1'), makeZoneCard('B1')],
    }));
    const gs = makeGs({
      players,
      currentTurn: actorIdx,
      phase: 'AI_TURN',
      globalOnlySwapOwner: null,
      apophisNight: getApophisNightForLevel(1),
      _apophisTargetSeq: 0,
      log: [`── ${players[actorIdx].name} 的回合开始 ──`],
      deck: [makeZoneCard('B3'), makeZoneCard('B3')],
    });
    vi.spyOn(Math, 'random').mockReturnValue(random);
    const nextGs = aiStep(gs);
    const targetEvent = nextGs._visualEvents.find(event => event.type === 'apophisTarget');
    expect(targetEvent).toMatchObject({ changed });
    expect(nextGs.currentTurn).toBe((actorIdx + 1) % players.length);
    const isNightDice = step => step.type === 'DICE_ROLL' && step.diceMode === 'apophisNight';
    const actionQueue = compileRuleVisualEventsToAnimTransaction(nextGs, gs, {
      visualEventScope: 'action',
    }).queue;
    expect(actionQueue.filter(isNightDice)).toHaveLength(1);
    expect(actionQueue.findIndex(isNightDice)).toBeLessThan(actionQueue.findIndex(step => step.type === 'SKILL_SWAP'));

    const beforeDraw = {
      ...nextGs,
      players: nextGs._playersBeforeNextDraw,
      log: getTurnStartDrawBaselineLog(nextGs),
    };
    const turnStartReplay = buildTurnStartDrawReplayQueue({
      oldGs: beforeDraw,
      effectOldGs: beforeDraw,
      newGs: nextGs,
      consumedVisualEventIds: new Set(),
    });
    expect(turnStartReplay.queue.some(step => step.type === 'YOUR_TURN')).toBe(true);
    expect(turnStartReplay.queue.filter(isNightDice)).toHaveLength(0);

    // AI action and next-turn presentation share nextGs; the callback still
    // closes over the state before the action. Exercise playback normalization
    // as well as queue construction, where the retained target event leaked.
    const transaction = prepareAnimationTransaction({
      queue: turnStartReplay.queue,
      nextState: nextGs,
      transactionMeta: authoritativeTurnStartQueueMeta(nextGs),
    });
    const playbackQueue = normalizeApophisQueueForPlayback(transaction.queue, gs, nextGs, transaction);
    expect(playbackQueue).toEqual(turnStartReplay.queue);
    expect([...actionQueue, ...playbackQueue].filter(isNightDice)).toHaveLength(1);
    const consumedLogs = new Set();
    const liveLogs = prepareAnimQueueLogs([...actionQueue, ...playbackQueue])
      .flatMap(step => consumeVisualLogEntries(step.logEntries, consumedLogs));
    expect(liveLogs).toEqual(nextGs.log.slice(gs.log.length));
    expect(compileRuleVisualEventsToAnimTransaction({ ...nextGs, log: [] }, { ...gs, log: [] }, {
      visualEventScope: 'action',
    }).queue).toEqual(actionQueue);
  });
});
