import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
import {describe,expect,it,vi} from 'vitest';import * as game from '../index';import * as helpers from '../animQueueHelpers';import {derotateGs} from '../rotateState';import {makeGs,makeStandardPlayers,makeZoneCard} from './factory';
const source=readFileSync(new URL('../../App.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const handler=['resolveSharedBuryAlive','buryAliveSelectCard'].map(name=>{const start=source.indexOf('  function '+name+'(');const close=/\n {2}}\n/.exec(source.slice(start));return source.slice(start,start+close.index+close[0].length);}).join('\n');
function fixture(patch={}){
 const players=makeStandardPlayers(3);players.forEach(p=>{p.hand=[makeZoneCard('A1'),makeZoneCard('B2')];});
 const abilityData={source:1,_turnOwner:1,targets:[0,1,2],buryAliveId:'server-window',buryAliveResolverUuid:'resolver',buryAliveReady:true,buryAliveChoices:players.map(p=>({cardId:p.hand[1].id,cardIndex:1}))};
 const state=makeGs({players,currentTurn:1,_isMP:true,_mpMatchId:'match',phase:'BURY_ALIVE_SELECT',abilityData:{...abilityData,...patch}});
 const context={...game,...helpers,derotateGs,gs:state,playerUUIDRef:{current:'resolver'},myPlayerIndexRef:{current:0},roomModal:{roomId:'room'},socketRef:{current:{emit:vi.fn()}},
 latestGsRef:{current:state},pendingGsRef:{current:null},animQueueRef:{current:[]},setGs:vi.fn(),broadcastMpStateBeforeLocalReplay:vi.fn(),isLocalSeatIndex:i=>i===0,localDisplayName:(_i,name)=>name,broadcastAnimTransaction:vi.fn(),finishTargetContinuation:vi.fn(),buildTargetContinuationGs:args=>({...state,...args,phase:'ACTION',abilityData:{}})};
 runInNewContext(handler,context);return {context,state};
}
describe('server-owned shared response window',()=>{
 it('allows a replacement resolver to finish exactly the locked cards with one receipt',()=>{
  const {context,state}=fixture();expect(context.resolveSharedBuryAlive(state)).toBe(true);
  const result=context.finishTargetContinuation.mock.calls[0][0];expect(result.sharedBuryResolutionId).toBe('server-window');expect(result.nextGs.deck.slice(-3).map(c=>c.id)).toEqual(state.players.map(p=>p.hand[1].id));
  expect(result.nextGs.players.every(p=>p.hand.length===1)).toBe(true);expect(context.broadcastAnimTransaction).not.toHaveBeenCalled();
 });
 it('requests authoritative timeout fill instead of settling a speculative local choice',()=>{
  const {context,state}=fixture({buryAliveReady:false,buryAliveChoices:[null,null,null]});expect(context.resolveSharedBuryAlive(state,true)).toBe(false);
  expect(context.socketRef.current.emit).toHaveBeenCalledWith('mpStateSync',expect.objectContaining({matchId:'match',buryAliveTimeout:true}));expect(context.finishTargetContinuation).not.toHaveBeenCalled();
 });
 it.each([{buryAliveReady:false},{buryAliveId:null},{buryAliveResolverUuid:'other'}])('does not settle an unconfirmed or unowned window %j',patch=>{
  const {context,state}=fixture(patch);context.resolveSharedBuryAlive(state);expect(context.finishTargetContinuation).not.toHaveBeenCalled();
 });
});
describe('late local response cannot roll back canonical settlement',()=>{
 it.each(['resolved','new-window','busy'])('rejects an old callback after %s',mode=>{
  const {context,state}=fixture({buryAliveReady:false,buryAliveChoices:[null,null,null]});
  if(mode==='resolved')context.latestGsRef.current={...state,phase:'ACTION',abilityData:{}};
  if(mode==='new-window')context.latestGsRef.current={...state,abilityData:{...state.abilityData,buryAliveId:'new'}};
  if(mode==='busy')context.pendingGsRef.current={...state,phase:'ACTION'};
  context.buryAliveSelectCard(0);expect(context.setGs).not.toHaveBeenCalled();expect(context.broadcastMpStateBeforeLocalReplay).not.toHaveBeenCalled();
 });
 it('functional commit cannot reopen a window resolved before React applies the update',()=>{
  const {context,state}=fixture({buryAliveReady:false,buryAliveChoices:[null,null,null]});context.buryAliveSelectCard(0);
  const update=context.setGs.mock.calls[0][0];const settled={...state,phase:'ACTION',abilityData:{}};expect(update(settled)).toBe(settled);
 });
});