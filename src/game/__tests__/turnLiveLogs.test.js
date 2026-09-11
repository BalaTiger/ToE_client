import { afterEach, expect, it, vi } from 'vitest';
import { startNextTurn } from '../turnEngine';
import { buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGs, makePlayer, makeZoneCard } from './factory';

afterEach(() => vi.restoreAllMocks());
it.each(['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4'])('turn live messages survive without the settlement log: %s', key => {
  vi.spyOn(Math, 'random').mockReturnValue(0.2);
  const oldGs=makeGs({ players: [makePlayer({name:'你'}),makePlayer({name:'贝拉', hp:6})],
    deck:[makeZoneCard(key)], debugForceCardKeepPending:'keep', debugForceCardKeepTarget:1 });
  const next=startNextTurn(oldGs,{allAi:true});
  const queue=buildTurnStartDrawReplayQueue({oldGs,newGs:next}).queue;
  const consumed=new Set();
  const actual=prepareAnimQueueLogs(queue).flatMap(step=>consumeVisualLogEntries(step.logEntries, consumed));
  expect(actual).toEqual(next.log);
  const withoutLog={...next,log:[],_turnStartLogs:[],_drawLogs:[],_statLogs:[]};
  expect(buildTurnStartDrawReplayQueue({oldGs,newGs:withoutLog}).queue).toEqual(queue);
});

it('shows skip-draw and expiry notices in their owned stages without a drawn card', () => {
  const oldGs=makeGs({players:[makePlayer({name:'你'}),makePlayer({name:'贝拉',skipNextDraw:true,skipNextDrawReason:'扭伤'})],
    currentTurn:0,globalOnlySwapOwner:1,deck:[makeZoneCard('C3')]});
  const next=startNextTurn(oldGs,{allAi:true});
  const queue=buildTurnStartDrawReplayQueue({oldGs,newGs:{...next,log:[],_drawLogs:[],_statLogs:[]}}).queue;
  const consumed=new Set();
  expect(prepareAnimQueueLogs(queue).flatMap(step=>consumeVisualLogEntries(step.logEntries,consumed))).toEqual(next.log);
  expect(queue.some(step=>step.type==='DRAW_CARD')).toBe(false);
});
