import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { aiStep } from '../aiTurn';
import { buildOwnedAiHuntEventQueue, includeAiActionNotices, scopeAiPreHuntReplayMetadata } from '../aiTurnPresentation';
import { prepareAnimQueueLogs } from '../animLogs';
import { strictActionQueueMeta } from '../animationQueuePolicy';
import { ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { compileRuleVisualEventsToAnimTransaction } from '../visualEventTransactionCompiler';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGs, makePlayer, makeZoneCard } from './factory';

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const discardQueueSource = appSource.slice(
  appSource.indexOf('        const handLimitDiscardQueue='),
  appSource.indexOf('        const handLimitDiscardCommitQueue='),
);

describe('AI 连续追捕通知顺序', () => {
  it.each([[false, false], [true, false], [false, true], [true, true]])(
    '按规则顺序划分前奏，放弃通知和上限弃牌保留在第三次亮牌后（黑夜=%s，上限弃牌=%s）',
    (blackNight, needsHandLimit) => {
    const players = [
      makePlayer({ name: '你', role: ROLE_HUNTER, roleRevealed: true }),
      makePlayer({
        name: '卡洛斯', role: ROLE_HUNTER, roleRevealed: true,
        hand: [
          makeZoneCard('C1', 0), makeZoneCard('C2', 0), makeZoneCard('A4', 0),
          ...(needsHandLimit ? Array.from({ length: 4 }, () => makeZoneCard('A4', 0)) : []),
        ],
      }),
      makePlayer({ name: '贝拉', role: ROLE_TREASURE, roleRevealed: true, hand: [makeZoneCard('C3', 0)] }),
    ];
    const gs = makeGs({
      players, currentTurn: 1, phase: 'AI_TURN', log: ['旧日志'],
      skillUsed: false, restUsed: false, multiplyUsed: false,
      ...(blackNight ? { apophisNight: { active: true, count: 0, limit: 12, threshold: 2 } } : {}),
      _apophisTargetSeq: 0,
      deck: [makeZoneCard('B3', 0)],
    });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.8);
    let result;
    try {
      result = aiStep(gs);
    } finally {
      random.mockRestore();
    }

    // The App compiles the action prelude separately before assembling the
    // custom hunt queue. That split must follow event.order, not array order.
    const pre = scopeAiPreHuntReplayMetadata(result, result);
    const preQueue = compileRuleVisualEventsToAnimTransaction(
      { ...result, _visualEvents: pre.visualEvents }, gs,
    )?.queue || [];
    const huntQueue = buildOwnedAiHuntEventQueue({
      rawHuntEvents: result._aiHuntEvents, state: result, actorName: '卡洛斯',
    }).queue;
    // Execute the App's actual tail construction so an unowned manual discard
    // cannot be masked by an accidental copy in the action prelude.
    const handLimitDiscardVisualEvent = result._visualEvents.find(event => event.type === 'handLimitDiscard');
    const handLimitQueue = runInNewContext(`${discardQueueSource}\nhandLimitDiscardQueue;`, {
      handLimitDiscardVisualEvent,
      newGs: result,
      compileRuleVisualEventsToAnimTransaction,
    });
    const queue = includeAiActionNotices([...preQueue, ...huntQueue, ...handLimitQueue], result);
    const consumed = new Set();
    const liveLogs = prepareAnimQueueLogs(queue, result)
      .flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
    const abandonMsg = '卡洛斯（追猎者）放弃追捕 贝拉';
    const revealMsg = '卡洛斯（追猎者）对 贝拉 【追捕】，亮出 [C3]';
    const delta = result.log.slice(gs.log.length);
    const nextTurnIndex = delta.findIndex(line => line.includes('──'));

    expect(preQueue.flatMap(step => step.msgs || [])).not.toContain(abandonMsg);
    expect(preQueue.filter(step => step.visualEventId === handLimitDiscardVisualEvent?.id)).toEqual([]);
    expect(liveLogs).toEqual(nextTurnIndex < 0 ? delta : delta.slice(0, nextTurnIndex));
    expect(liveLogs.filter(line => line === revealMsg)).toHaveLength(3);
    expect(liveLogs.filter(line => line === abandonMsg)).toHaveLength(1);
    if (needsHandLimit) {
      expect(handLimitQueue.filter(step => step.type === 'DISCARD')).toHaveLength(1);
      expect(handLimitQueue.every(step => step.visualEventId === handLimitDiscardVisualEvent.id)).toBe(true);
      expect(liveLogs.filter(line => line.includes('（上限）'))).toEqual(handLimitDiscardVisualEvent.msgs);
      expect(liveLogs.indexOf(abandonMsg)).toBeLessThan(liveLogs.findIndex(line => line.includes('（上限）')));
    } else {
      expect(liveLogs.at(-1)).toBe(abandonMsg);
    }
    expect(() => strictActionQueueMeta(result, queue)).not.toThrow();
  });
});
