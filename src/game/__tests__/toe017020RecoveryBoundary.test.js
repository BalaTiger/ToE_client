import {readFileSync,writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {afterAll,afterEach,describe,expect,it,vi} from 'vitest';
import * as game from '../index';
import * as helpers from '../animQueueHelpers';
import * as rotate from '../rotateState';
import * as income from '../zoneCardIncome';
import {getRevealDecision} from '../../components/anim/revealDecision';
import {createTsathogguaSlimeCard,GOD_DEFS,INSPECTION_DECK,FIXED_ZONE_CARD_VARIANTS_BY_KEY} from '../../constants/card';
import {makeGodCard,makeGs,makeStandardPlayers,makeZoneCard} from './factory';

const source=readFileSync(new URL('../../App.jsx',import.meta.url),'utf8');
const handlers=['buildTargetContinuationGs','finishTargetContinuation','resolveTsathogguaSlimeBalance','godResolvePlayer',
 'applyLossDirectly','finishEtherealizeDecision','continueOrSettleEtherealizeChain','settleEtherealizeChain','resolveEtherealizeRedirect'].map(name=>{
 const start=source.indexOf(`  function ${name}(`),closing=/\n {2}}\r?\n/.exec(source.slice(start));
 if(start<0||!closing)throw Error('Missing actual App handler '+name);
 return source.slice(start,start+closing.index+closing[0].length);
}).join('\n');
const clearHints=source.match(/ {2}const clearTurnDrawReplayHints=[\s\S]*?\}\):state;/)?.[0];
const observations=[];
const snapshot=gs=>({phase:gs.phase,currentTurn:gs.currentTurn,inspectionSeq:gs._inspectionSeq||0,
 players:gs.players.map(p=>({id:p.id,name:p.name,hp:p.hp,san:p.san,hand:p.hand.map(c=>({id:c.id,name:c.name}))})),
 decisionContinuations:gs._decisionContinuations,abilityData:gs.abilityData,
 events:game.getVisualEvents(gs).map(e=>({id:e.id,type:e.type,target:e.target}))});
afterEach(()=>vi.restoreAllMocks());
afterAll(()=>{
 const reportPath=globalThis.process?.env?.TOE_RECOVERY_STATE_REPORT;
 if(reportPath)writeFileSync(reportPath,JSON.stringify(observations,null,2));
});

function encounter({hp=8,san=6,slimes=1,inspection='封印松动',neighborEtherealize=false}={}){
 const god=makeGodCard('NYA'),players=makeStandardPlayers(3,[{name:'Recovery-A',role:'寻宝者',hp,san,godEncounters:1,
  hand:Array.from({length:slimes},()=>createTsathogguaSlimeCard())},{name:'Recovery-B',role:'追猎者'},{name:'Recovery-C',role:'邪祀者'}]);
 if(neighborEtherealize)players[1].etherealizeStacks=1;
 const card=INSPECTION_DECK.find(c=>c.name===inspection);
 if(!card)throw Error('Actual inspection card required');
 const before=makeGs({players,currentTurn:0,deck:[god],inspectionDeck:[card],inspectionDiscard:[],_visualEvents:[],_inspectionSeq:0,
  sealLooseningCount:0,_isMP:false,log:[]});
 const draw=game.playerDrawCard(players,before.deck,[],0,before);
 const decision=game.deriveEffectDecisionState(draw.statePatch,{fallbackPhase:'GOD_CHOICE',turnOwner:0});
 const initial={...before,players:draw.P,deck:draw.D,discard:draw.Disc,log:draw.effectMsgs,...draw.statePatch,
  phase:decision.phase,abilityData:decision.abilityData};
 return{initial,god};
}
function bind(initial,label){
 const consumed=new Set(game.getVisualEvents(initial).map(e=>e.id)),submissions=[];
 let completedCount=0;
 const record={label,stages:[{name:'actual-producer',state:snapshot(initial)}],queues:[]};observations.push(record);
 const context={...game,...helpers,...rotate,...income,GOD_DEFS,gs:initial,me:initial.players[0],showTutorial:false,tutorialStepDef:null,
  consumedVisualEventIdsRef:{current:consumed},lastInspectionSeqRef:{current:initial._inspectionSeq||0},markInspectionEventsSeen:vi.fn(),
  broadcastAnimTransaction:vi.fn(()=>false),broadcastEndTurnDecisionAnimTransaction:vi.fn(()=>false),broadcastMpStateBeforeLocalReplay:vi.fn(),
  setGs:state=>{context.gs=typeof state==='function'?state(context.gs):state;context.me=context.gs.players[0];},
  triggerAnimQueue:(queue,nextState,callback,transactionMeta)=>{
   const tx=game.prepareAnimationTransaction({queue,nextState,callback,transactionMeta,consumedEventIds:consumed});
   submissions.push(tx);
   record.queues.push({eventIds:tx.eventIds,steps:tx.queue.map(s=>({type:s.type,visualEventId:s.visualEventId,
    cards:s.cards?.map(c=>c.id),statPresentation:s.statPresentation,statEvents:s.statEvents}))});
  }};
 context.resumeEndTurnSeqOrSetGs=state=>context.setGs(state);
 runInNewContext(`${handlers}\n${clearHints}`,context);
 function complete(){if(completedCount===submissions.length){record.stages.push({name:'direct-state-committed',state:snapshot(context.gs)});return;}
  const tx=submissions[completedCount++];tx.eventIds.forEach(id=>consumed.add(id));
  if(tx.nextState)context.setGs(tx.nextState);tx.callback?.();record.stages.push({name:'queue-committed',state:snapshot(context.gs)});}
 return{context,submissions,consumed,complete,record};
}

describe('Current TOE017/020 SAN/slime recovery boundaries (non-GUI)',()=>{
 it.each([
  {hp:6,san:8,use:true,expectedHp:6,expectedSan:6,inspections:1},
  {hp:8,san:8,use:true,expectedHp:7,expectedSan:7,inspections:0},
  {hp:8,san:8,use:false,expectedHp:8,expectedSan:6,inspections:1},
 ])('rechecks real SAN threshold after slime: hp=$hp san=$san use=$use',p=>{
  const{initial,god}=encounter(p),{context,submissions,complete}=bind(initial,'san-threshold-'+JSON.stringify(p));
  expect(initial.phase).toBe('TSG_SLIME_BALANCE');
  expect(initial.abilityData.pendingSanInspection).toMatchObject({targetIndex:0,startIndex:0,reason:'邪神遭遇'});
  expect(initial._decisionContinuations[0].abilityData.godEncounterCost).toBe(0);
  context.resolveTsathogguaSlimeBalance(p.use);complete();
  expect(context.gs.phase).toBe('GOD_CHOICE');expect(context.gs._inspectionSeq||0).toBe(p.inspections);
  expect(context.gs.players[0]).toMatchObject({hp:p.expectedHp,san:p.expectedSan});
  expect(context.gs.abilityData.pendingSanInspection).toBeUndefined();
  expect(getRevealDecision(context.gs)).toMatchObject({kind:'god-choice',card:god,actorIdx:0});
  expect(submissions[0].queue.filter(s=>s.type==='TSG_SLIME_POP')).toHaveLength(p.use?1:0);
  context.godResolvePlayer('discard');complete();
  expect(context.gs.phase).toBe('ACTION');expect(context.gs.players[0].san).toBe(p.expectedSan);
  expect(context.gs.discard.filter(c=>c.id===god.id)).toHaveLength(1);
  expect(context.gs.players[0].hand.filter(game.isTsathogguaSlime)).toHaveLength(p.use?0:1);
 });

 it.each([true,false])('retains root god choice through secondary self-damage slime (consume=%s)',secondConsume=>{
  const{initial,god}=encounter({hp:8,san:6,slimes:2,inspection:'自残'});
  const{context,submissions,complete,record}=bind(initial,'san-self-damage-second-slime');
  expect(initial.players[0]).toMatchObject({hp:8,san:4});
  context.resolveTsathogguaSlimeBalance(true);complete();
  record.stages.push({name:'expected-secondary-slime-boundary',state:snapshot(context.gs)});
  expect(context.gs.phase).toBe('TSG_SLIME_BALANCE');
  expect(context.gs.abilityData).toMatchObject({type:'tsgSlimeBalance',targetIdx:0,afterHp:4,afterSan:6});
  expect(context.gs._decisionContinuations).toHaveLength(1);
  expect(getRevealDecision(context.gs)).toBeNull();
  expect(context.gs.players[0].hand.filter(game.isTsathogguaSlime)).toHaveLength(1);
  context.resolveTsathogguaSlimeBalance(secondConsume);complete();
  expect(context.gs.phase).toBe('GOD_CHOICE');expect(context.gs.players[0]).toMatchObject(secondConsume?{hp:5,san:5}:{hp:4,san:6});
  expect(context.gs._inspectionSeq).toBe(1);
  expect(context.gs.players[0].hand.filter(game.isTsathogguaSlime)).toHaveLength(secondConsume?0:1);
  expect(submissions.flatMap(tx=>tx.queue).filter(s=>s.type==='TSG_SLIME_POP')).toHaveLength(secondConsume?2:1);
  const inspectionEvents=game.getVisualEvents(context.gs).filter(e=>e.type==='inspection');
  expect(inspectionEvents).toHaveLength(1);
  expect(submissions.flatMap(tx=>tx.eventIds).filter(id=>id===inspectionEvents[0].id)).toHaveLength(1);
  context.godResolvePlayer('discard');complete();
  expect(context.gs.phase).toBe('ACTION');expect(context.gs.players[0].san).toBe(secondConsume?5:6);
  expect(context.gs.discard.filter(c=>c.id===god.id)).toHaveLength(1);
 });

 it('does not manufacture another slime decision when the last slime was consumed',()=>{
  const{initial,god}=encounter({slimes:1,inspection:'自残'}),{context,submissions,complete}=bind(initial,'zero-remaining-slime');
  context.resolveTsathogguaSlimeBalance(true);complete();
  expect(context.gs.phase).toBe('GOD_CHOICE');expect(context.gs._decisionContinuations).toHaveLength(0);
  expect(context.gs.players[0]).toMatchObject({hp:4,san:6});
  expect(context.gs.players[0].hand.filter(game.isTsathogguaSlime)).toHaveLength(0);
  expect(submissions.flatMap(tx=>tx.queue).filter(s=>s.type==='TSG_SLIME_POP')).toHaveLength(1);
  expect(context.gs._inspectionSeq).toBe(1);
  context.godResolvePlayer('discard');complete();
  expect(context.gs.discard.filter(c=>c.id===god.id)).toHaveLength(1);expect(context.gs.phase).toBe('ACTION');
 });

 it('holds root GOD_CHOICE through a real secondary etherealize/deferred-HP inspection response',()=>{
  const{initial,god}=encounter({inspection:'乱抓',neighborEtherealize:true});
  const{context,submissions,complete}=bind(initial,'secondary-inspection-etherealize');
  context.resolveTsathogguaSlimeBalance(true);complete();
  expect(context.gs.phase).toBe('ETHEREALIZE_DECISION');expect(context.gs._decisionContinuations).toHaveLength(1);
  expect(context.gs.abilityData).toMatchObject({type:'etherealizeRedirect',targetIdx:1,
   deferredDirectLosses:[expect.objectContaining({targetIdx:2,lostHp:2})]});
  expect(getRevealDecision(context.gs)).toBeNull();
  expect(context.gs.players[1].hp).toBe(10);expect(context.gs.players[2].hp).toBe(10);
  context.resolveEtherealizeRedirect(false);complete();
  expect(context.gs.phase).toBe('GOD_CHOICE');expect(context.gs._decisionContinuations).toHaveLength(0);
  expect(context.gs.players[1].hp).toBe(8);expect(context.gs.players[2].hp).toBe(8);
  expect(context.gs._inspectionSeq).toBe(1);
  const inspection=game.getVisualEvents(context.gs).find(e=>e.type==='inspection');
  expect(submissions.flatMap(tx=>tx.eventIds).filter(id=>id===inspection.id)).toHaveLength(1);
  context.godResolvePlayer('discard');complete();expect(context.gs.phase).toBe('ACTION');
  expect(context.gs.discard.filter(c=>c.id===god.id)).toHaveLength(1);
 });

 it('terminates a fatal deferred self-damage inspection without exposing the held god choice',()=>{
  const{initial,god}=encounter({hp:2,san:3,slimes:1,inspection:'自残'});
  const{context,submissions,complete}=bind(initial,'terminal-san-self-damage');
  context.resolveTsathogguaSlimeBalance(true);complete();
  expect(context.gs.gameOver).toBeTruthy();expect(context.gs.players[0].isDead).toBe(true);
  expect(context.gs._decisionContinuations).toHaveLength(0);expect(getRevealDecision(context.gs)).toBeNull();
  expect(context.gs.discard.filter(c=>c.id===god.id)).toHaveLength(1);
  expect(context.gs.players[0].hand).toHaveLength(0);
  expect(submissions).toHaveLength(1);
 });

 it('preserves pending zone income across two responses and transfers the source card once before AI resume',()=>{
  const players=makeStandardPlayers(5,[{hp:5,san:8},{hp:6,san:7,hand:[createTsathogguaSlimeCard(),createTsathogguaSlimeCard()]},
   {name:'Recovery-Hunter',role:'追猎者',hp:8,san:6},{hp:6,san:9},{role:'邪祀者',hp:8,san:9}]);
  const mouse=makeZoneCard('D3',FIXED_ZONE_CARD_VARIANTS_BY_KEY.D3.findIndex(c=>c.name==='鼠群'));
  const before=makeGs({players,currentTurn:2,phase:'AI_TURN',deck:[],_isMP:false,_visualEvents:[],_inspectionSeq:0,
   inspectionDeck:[INSPECTION_DECK.find(c=>c.name==='乏力'),INSPECTION_DECK.find(c=>c.name==='自残')],inspectionDiscard:[],log:[]});
  vi.spyOn(Math,'random').mockReturnValue(0.999);
  const effect=game.applyFx(mouse,2,null,players,[],[],before);
  const patch=income.applyZoneCardIncome({players:effect.P,discard:effect.Disc,card:mouse,drawerIdx:2,statePatch:effect.statePatch});
  const decision=game.deriveEffectDecisionState(patch,{fallbackPhase:'AI_TURN',turnOwner:2});
  const initial={...before,players:effect.P,deck:effect.D,discard:effect.Disc,log:effect.msgs,...patch,phase:decision.phase,abilityData:decision.abilityData};
  const{context,submissions,complete}=bind(initial,'secondary-slime-pending-zone-income');
  expect(initial.abilityData.pendingZoneIncome).toMatchObject({card:mouse,ownerId:players[2].id});
  context.resolveTsathogguaSlimeBalance(true);complete();
  expect(context.gs.phase).toBe('TSG_SLIME_BALANCE');
  expect(context.gs.abilityData.pendingZoneIncome).toMatchObject({card:mouse,ownerId:players[2].id});
  expect(context.gs.players[2].hand.some(c=>c.id===mouse.id)).toBe(false);
  context.resolveTsathogguaSlimeBalance(true);complete();
  expect(context.gs.phase).toBe('AI_TURN');expect(context.gs.currentTurn).toBe(2);
  expect(context.gs.players[2].hand.filter(c=>c.id===mouse.id)).toHaveLength(1);
  expect(context.gs.abilityData.pendingZoneIncome).toBeUndefined();
  expect(context.gs.abilityData.pendingInspectionContinuation).toBeUndefined();
  expect(submissions.flatMap(tx=>tx.queue).filter(s=>s.type==='CARD_TRANSFER'&&s.cards?.some(c=>c.id===mouse.id))).toHaveLength(1);
 });

 it('settles actual deferred direct HP losses once, then consumes one slime before local ACTION',()=>{
  const players=makeStandardPlayers(3,[{name:'Recovery-A',hp:10,san:4,hand:[createTsathogguaSlimeCard()]},
   {name:'Recovery-B',hp:10,san:9,etherealizeStacks:1},{name:'Recovery-C',hp:10,san:10}]);
  const before=makeGs({players,currentTurn:0,_isMP:false,_visualEvents:[],log:[],inspectionDeck:[]});
  const damage=game.submitLossEvents({players,deck:[],discard:[],log:[],currentTurn:0,
   events:[{targetIdx:1,lostHp:2,source:'批量HP2',order:0},{targetIdx:0,lostHp:2,source:'批量HP2',order:1}]});
  const initial={...before,phase:damage.phase,abilityData:damage.abilityData};
  expect(initial.phase).toBe('ETHEREALIZE_DECISION');expect(initial.players.map(p=>p.hp)).toEqual([10,10,10]);
  expect(initial.abilityData.deferredDirectLosses).toMatchObject([{targetIdx:0,lostHp:2}]);
  const{context,submissions,complete}=bind(initial,'deferred-direct-hp-before-slime');
  context.resolveEtherealizeRedirect(false);complete();
  expect(context.gs.phase).toBe('TSG_SLIME_BALANCE');expect(context.gs.players.map(p=>p.hp)).toEqual([8,8,10]);
  context.resolveTsathogguaSlimeBalance(true);complete();
  expect(context.gs.phase).toBe('ACTION');expect(context.gs.currentTurn).toBe(0);
  expect(context.gs.players[0]).toMatchObject({hp:6,san:6});expect(context.gs.players[1].hp).toBe(8);
  expect(context.gs.players[0].hand.filter(game.isTsathogguaSlime)).toHaveLength(0);
  expect(submissions.flatMap(tx=>tx.queue).filter(s=>s.type==='TSG_SLIME_POP')).toHaveLength(1);
  expect(context.gs._inspectionSeq||0).toBe(0);
 });
});
