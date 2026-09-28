import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiStep } from '../aiTurn';
import { buildOwnedAiHuntEventQueue, scopeAiPreHuntReplayMetadata } from '../aiTurnPresentation';
import { strictActionQueueMeta } from '../animationQueuePolicy';
import { prepareAnimationTransaction } from '../animationTransaction';
import { prepareAnimQueueLogs } from '../animLogs';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { startNextTurn } from '../turnEngine';
import { buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { compileRuleVisualEventsToAnimTransaction } from '../visualEventTransactionCompiler';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

afterEach(() => vi.restoreAllMocks());

function resolveWinningHunts() {
  vi.spyOn(Math, 'random').mockReturnValue(0.8);
  const players = [
    makePlayer({ name: '你', role: ROLE_HUNTER, roleRevealed: true }),
    makePlayer({
      name: '艾伦', role: ROLE_HUNTER, roleRevealed: true,
      hand: ['A2', 'D4', 'A4', 'A3'].map(key => makeZoneCard(key)),
    }),
    makePlayer({
      name: '贝拉', role: ROLE_TREASURE, roleRevealed: true, hp: 3,
      hand: Array.from({ length: 3 }, () => makeZoneCard('C1')),
    }),
    makePlayer({
      name: '卡洛斯', role: ROLE_CULTIST, roleRevealed: true, hp: 3,
      hand: Array.from({ length: 3 }, () => makeZoneCard('A3')),
    }),
    makePlayer({
      name: '黛安娜', role: ROLE_TREASURE, roleRevealed: true, hp: 9,
      godName: 'VRI', godLevel: 1,
      hand: Array.from({ length: 3 }, () => makeZoneCard('A4')),
    }),
  ];
  const beforeTurn = makeGs({
    players, currentTurn: 0,
    deck: [
      makeZoneCard('C2', 0, { name: '地磁反转', type: 'geomagneticReversal' }),
      makeGodCard('NYA'), makeZoneCard('C4'), makeGodCard('CTH'),
      makeZoneCard('D3'), makeZoneCard('A4'), makeZoneCard('B3'),
    ],
  });
  const opened = startNextTurn(beforeTurn);
  expect(opened).toMatchObject({ currentTurn: 1, phase: 'AI_TURN', geomagneticReversalActive: true });
  const result = aiStep(opened);
  expect(result.gameOver).toMatchObject({ winner: ROLE_HUNTER });
  expect(result.log.filter(line => line.includes('【追捕】'))).toHaveLength(5);
  expect(result.log.some(line => line.includes('【不灭之躯】') && line.includes('力量消散'))).toBe(true);
  return { beforeTurn, opened, result };
}

describe('AI 连续追捕获胜的完整播放', () => {
  it('获胜提前返回时仍保留五次追捕的规则事件和行动快照', () => {
    const { opened, result } = resolveWinningHunts();
    expect(result._aiHuntEvents).toHaveLength(5);
    const events = result._visualEvents.filter(event => event.type === 'huntResult');
    expect(events.map(event => event.targetIdx)).toEqual([2, 3, 4, 4, 4]);
    expect(events.every(event => event.transactionId === result._aiActionTransactionId)).toBe(true);
    expect(events[0].beforePlayers).toEqual(opened.players);
    expect(result._playersBeforeNextDraw).toEqual(result.players);
    expect(events.map(event => !!event.terminalBoundary)).toEqual([false, false, false, false, true]);
  });

  it('摸牌后播完全部追捕、死亡、不灭之躯和九张掠夺，再提交终局', () => {
    const { beforeTurn, opened, result } = resolveWinningHunts();
    const intro = buildTurnStartDrawReplayQueue({
      oldGs: beforeTurn, effectOldGs: beforeTurn, newGs: opened,
      consumedVisualEventIds: new Set(),
    }).queue;
    const pre = scopeAiPreHuntReplayMetadata(result, result);
    const preQueue = compileRuleVisualEventsToAnimTransaction(
      { ...result, _visualEvents: pre.visualEvents }, opened,
    )?.queue || [];
    const hunts = buildOwnedAiHuntEventQueue({
      state: result, rawHuntEvents: result._aiHuntEvents, actorName: '艾伦',
    }).queue;
    const actionMeta = strictActionQueueMeta(result, [...preQueue, ...hunts]);
    const callback = vi.fn();
    const transaction = prepareAnimationTransaction({
      queue: [...intro, ...preQueue, ...hunts], nextState: result, callback,
      transactionMeta: actionMeta,
    });
    const queue = transaction.queue;
    expect(queue.filter(step => step.type === 'SKILL_HUNT')).toHaveLength(5);
    expect(queue.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(5);
    expect(queue.filter(step => step.type === 'GUILLOTINE')).toHaveLength(3);
    expect(queue.filter(step => step.type === 'VRI_IMMORTAL_REVEAL')).toHaveLength(1);
    expect(queue.filter(step => step.type === 'HP_DAMAGE')
      .flatMap(step => step.statEvents || []).filter(event => event.target === 4)
      .map(event => event.to.hp)).toEqual([6, 3, 0]);
    const revealIndex = queue.findIndex(step => step.type === 'VRI_IMMORTAL_REVEAL');
    expect(revealIndex).toBeGreaterThan(queue.findLastIndex(step => step.type === 'HP_DAMAGE'));
    expect(revealIndex).toBeLessThan(queue.findLastIndex(step => step.type === 'GUILLOTINE'));
    expect(queue.filter(step => step.type === 'CARD_TRANSFER' && step.dest === 'player'
      && step.toPid === 1 && [2, 3, 4].includes(step.fromPid))
      .reduce((count, step) => count + step.count, 0)).toBe(9);
    expect(queue).toEqual([...intro, ...preQueue, ...hunts]);
    expect(queue.at(-1)).toMatchObject({ type: 'STATE_PATCH', terminalBoundary: true });
    expect(transaction.callback).toBeUndefined();
    const consumed = new Set();
    const liveLogs = prepareAnimQueueLogs(queue, result)
      .flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
    expect(liveLogs.filter(line => line.includes('暗抽了一张'))).toHaveLength(9);
    expect(liveLogs).toEqual(result.log);
  });
});
