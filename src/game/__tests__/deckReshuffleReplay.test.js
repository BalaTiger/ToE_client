import { describe, expect, it } from 'vitest';
import { buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { startNextTurn } from '../turnEngine';
import { pruneConsumedVisualEvents, VISUAL_EVENT } from '../visualEvents';
import { makeGs, makePlayer, makeZoneCard } from './factory';

function setupAiTurnStartReshuffle() {
  const discarded = makeZoneCard('D3', 0, { id: 'reshuffled-card' });
  const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
  const oldGs = makeGs({ players, currentTurn: 0, deck: [], discard: [discarded], log: [] });
  const newGs = startNextTurn(oldGs);
  return { oldGs, newGs };
}

function consumePresentedEvents(consumed, newGs, queue) {
  queue.forEach(step => step?.visualEventId && consumed.add(step.visualEventId));
  // 与 submitTurnStartPresentation 一致：回合开始事务提交时消费全部 turnStartStage 事件
  (newGs._visualEvents || []).forEach(event => {
    if (event?.id && event?.turnStartStage) consumed.add(event.id);
  });
}

describe('重洗弃牌堆动画去重', () => {
  it('回合开始重洗已呈现后，再次构建回合开始重播队列不重播（事件仍在日志注册表）', () => {
    const { oldGs, newGs } = setupAiTurnStartReshuffle();
    expect(newGs._drawLogs).toContain('牌堆耗尽，重洗弃牌堆');

    const consumed = new Set();
    const first = buildTurnStartDrawReplayQueue({ oldGs, newGs, consumedVisualEventIds: consumed });
    expect(first.queue.some(step => step.type === 'DECK_RESHUFFLE')).toBe(true);
    consumePresentedEvents(consumed, newGs, first.queue);

    const second = buildTurnStartDrawReplayQueue({ oldGs, newGs, consumedVisualEventIds: consumed });
    expect(second.queue.filter(step => step.type === 'DECK_RESHUFFLE')).toEqual([]);
    expect(second.queue.filter(step => step.type === 'DRAW_CARD')).toEqual([]);
  });

  it('事件已裁剪但 _drawLogs 仍带重洗日志时，不从旧式日志差分重播（联机广播场景）', () => {
    const { oldGs, newGs } = setupAiTurnStartReshuffle();
    const consumed = new Set();
    const first = buildTurnStartDrawReplayQueue({ oldGs, newGs, consumedVisualEventIds: consumed });
    consumePresentedEvents(consumed, newGs, first.queue);

    const pruned = pruneConsumedVisualEvents(newGs, consumed);
    expect(pruned._visualEvents.some(event => event?.type === VISUAL_EVENT.DECK_RESHUFFLE)).toBe(false);
    expect(pruned._drawLogs).toContain('牌堆耗尽，重洗弃牌堆');

    const second = buildTurnStartDrawReplayQueue({ oldGs, newGs: pruned, consumedVisualEventIds: consumed });
    expect(second.queue.filter(step => step.type === 'DECK_RESHUFFLE')).toEqual([]);
    expect(second.queue.filter(step => step.type === 'DRAW_CARD')).toEqual([]);
  });

  it('未消费时旧式日志差分兜底仍正常播放重洗', () => {
    const { oldGs, newGs } = setupAiTurnStartReshuffle();
    const legacyOnly = { ...newGs, _visualEvents: [] };
    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs: legacyOnly, consumedVisualEventIds: new Set() });
    expect(replay.queue.some(step => step.type === 'DECK_RESHUFFLE')).toBe(true);
    expect(replay.queue.some(step => step.type === 'DRAW_CARD')).toBe(true);
  });
});
