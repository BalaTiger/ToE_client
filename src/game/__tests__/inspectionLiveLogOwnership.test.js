import { describe, expect, it, vi } from 'vitest';
import { prepareAnimQueueLogs } from '../animLogs';
import { ROLE_HUNTER } from '../coreUtils';
import { buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { startNextTurn } from '../turnEngine';
import { VISUAL_EVENT } from '../visualEvents';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGs, makePlayer, makeZoneCard } from './factory';

describe('检定即时日志归属', () => {
  it.each([
    { id: 'sleep', name: '昏睡', effect: 'flip', type: 'negative' },
    { id: 'self-harm', name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' },
    { id: 'willpower', name: '超人意志', effect: 'healSAN', value: 1, type: 'positive' },
  ])('AI 鼠群触发揭开真相与$name时，每条消息只随所属检定输出一次', secondInspection => {
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你', san: 7 }),
        makePlayer({ name: '艾伦', san: 9 }),
        makePlayer({ name: '贝拉', san: 9 }),
        makePlayer({ name: '卡洛斯', san: 7 }),
        makePlayer({ name: '黛安娜', san: 9, role: ROLE_HUNTER }),
      ],
      currentTurn: 3,
      deck: [makeZoneCard('D3', 3), makeZoneCard('A2')],
      inspectionDeck: [
        { id: 'truth', name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive' },
        secondInspection,
      ],
      inspectionDiscard: [],
    });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    let next;
    try {
      next = startNextTurn(oldGs);
    } finally {
      randomSpy.mockRestore();
    }

    const inspections = next._visualEvents.filter(event => event.type === VISUAL_EVENT.INSPECTION);
    expect(inspections.map(event => event.card.name)).toEqual(['揭开真相', secondInspection.name]);
    const inspectionMsgs = inspections.flatMap(event => [...event.revealMsgs, ...event.effectMsgs]);
    const { queue } = buildTurnStartDrawReplayQueue({ oldGs, newGs: next });
    const consumed = new Set();
    const shown = prepareAnimQueueLogs(queue, next).map(step => ({
      type: step.type,
      eventId: step.visualEventId,
      msgs: consumeVisualLogEntries(step.logEntries, consumed),
    }));

    expect(shown.filter(step => step.type === 'SAN_DAMAGE').flatMap(step => step.msgs))
      .toEqual(['全体存活角色失去 1 SAN']);
    expect(queue.filter(step => step.triggerName === '检定牌').map(step => step.card.id))
      .toEqual(['truth', secondInspection.id]);
    for (const msg of inspectionMsgs) {
      const owners = shown.filter(step => step.msgs.includes(msg));
      expect(owners, msg).toHaveLength(1);
      expect(inspections.some(event => event.id === owners[0].eventId), msg).toBe(true);
    }
    expect(shown.flatMap(step => step.msgs)).toEqual(next.log);
  });
});
