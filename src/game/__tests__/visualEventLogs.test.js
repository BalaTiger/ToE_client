import { auditVisualEventLogCoverage, createLogOnlyVisualEvent } from '../visualEvents';
import { describe, expect, it } from 'vitest';
import { consumeVisualLogEntries, createVisualLogEntries } from '../visualEventLogs';
import { prepareAnimQueueLogs } from '../animLogs';
import { bindTurnFlowEvents } from '../turnFlowManager';

describe('visual event log identity', () => {
  it('consumes shared HP/SAN messages once and preserves distinct occurrences', () => {
    const consumed = new Set();
    const queue = prepareAnimQueueLogs([
      { type: 'HP_HEAL', visualEventId: 'heal', msgs: ['heal both'] },
      { type: 'SAN_HEAL', visualEventId: 'heal', msgs: ['heal both'] },
      { type: 'STATE_PATCH', visualEventId: 'next', msgs: ['heal both', 'heal both'] },
    ], { log: [] });
    expect(queue.map(step => consumeVisualLogEntries(step.logEntries, consumed))).toEqual([
      ['heal both'], [], ['heal both', 'heal both'],
    ]);
    expect(consumeVisualLogEntries(createVisualLogEntries('heal', ['heal both']), consumed)).toEqual([]);
  });

  it('captures rule ownership before the state moves to another turn', () => {
    const [event] = bindTurnFlowEvents({ _turnKey: 4, currentTurn: 2, _turnFlowStage: 'action' }, [{ id: 'swap' }]);
    expect(bindTurnFlowEvents({ _turnKey: 5, currentTurn: 0, _turnFlowStage: 'draw' }, [event])[0]).toEqual({
      id: 'swap', turnKey: 4, turnOwner: 2, ruleStage: 'action',
    });
  });
});

  it('audits missing messages in both directions, repeated occurrences and order without repairing events', () => {
    const events=[createLogOnlyVisualEvent({msgs:['second']}),createLogOnlyVisualEvent({msgs:['first','first','extra']})];
    const before=structuredClone(events);
    expect(auditVisualEventLogCoverage(events,['first','second','unclaimed']).map(issue=>issue.code))
      .toEqual(['VISUAL_EVENT_LOG_OUT_OF_ORDER','VISUAL_EVENT_LOG_MISSING','VISUAL_EVENT_LOG_MISSING','RULE_LOG_WITHOUT_VISUAL_EVENT']);
    expect(events).toEqual(before);
    expect(auditVisualEventLogCoverage([createLogOnlyVisualEvent({msgs:['same','same']})],['same','same'])).toEqual([]);
  });

  it('uses event ownership for remote actor wording even after the rule state has entered the local turn', () => {
    const queue=prepareAnimQueueLogs([{type:'STATE_PATCH',visualEventId:'old-action',msgs:['你 选择收入手牌']}],{
      _isMP:true,currentTurn:0,players:[{name:'本地'},{name:'贝拉'}],
      _visualEvents:[{id:'old-action',turnOwner:1,turnKey:8}],log:['── 本地 的回合开始 ──'],
    });
    expect(queue[0]._logChunk).toEqual(['贝拉 选择收入手牌']);
  });
