import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { projectMatch } from '../src/authority/view.js';
import { ruleRandom } from '../src/runtime.js';
const principal={permission:'player',seat:0};
const state=()=>({phase:'DECISION',currentTurn:0,turn:1,players:[
 {name:'a',role:'secret-a',hp:10,san:10,hand:[{id:'private-a',name:'A',key:'C1'}]},
 {name:'b',role:'secret-b',hp:10,san:10,hand:[{id:'private-b',name:'B',key:'D4'}]},
 {name:'dead',isDead:true,hp:0,san:10,hand:[]}],deck:[{id:'deck-secret'}],inspectionDeck:[{id:'inspection-secret'}],
 discard:[],log:['private-b'],abilityData:{takenCard:{id:'taken-secret'}},_visualEvents:[{beforePlayers:'secret'}]});
const make=()=>createPrivateMatch({id:'m',state:state(),seed:42,now:100,durationMs:20});
const command=(match,extra={})=>({version:2,matchId:match.id,revision:match.revision,decisionId:match.decision.id,actionId:'a:1',type:'choose',payload:{},...extra});
const actions={choose:{phases:['DECISION'],payloadKeys:[],authorize:(_gs,seat)=>seat===0,
 available:(_gs,seat)=>seat===0,apply:gs=>({...gs,phase:'DONE',roll:ruleRandom()})}};
test('identity and exact command schema reject state/outcome/roll/resource injection and read-only seats',()=>{
 const match=make(), before=structuredClone(match);
 for(const key of ['gs','state','damage','roll','seed','seat','resources','now'])assert.throws(()=>resolveCommand(match,principal,command(match,{[key]:999}),{now:101,actions}),/invalid_command/);
 assert.throws(()=>resolveCommand(match,principal,command(match,{payload:{roll:6}}),{now:101,actions}),/invalid_command/);
 for(const p of [{permission:'observer',seat:0},{permission:'player',seat:1}])assert.throws(()=>resolveCommand(match,p,command(match),{now:101,actions}),/read_only|not_your_decision/);
 assert.deepEqual(match,before);
});
test('receipt replay is once-only, stale windows and deadline boundary reject without consuming randomness',()=>{
 const match=make(), cmd=command(match), first=resolveCommand(match,principal,cmd,{now:101,actions});
 assert.equal(first.match.revision,1);assert.equal(first.match.random.draws,1);
 const again=resolveCommand(first.match,principal,cmd,{now:500,actions});
 assert.equal(again.match,first.match);assert.equal(again.acknowledgement.duplicate,true);
 for(const extra of [{actionId:'new',revision:0},{actionId:'new',decisionId:'old'},{actionId:'new',type:'unknown'}])assert.throws(()=>resolveCommand(first.match,principal,command(first.match,extra),{now:102,actions}),/stale_|unsupported_/);
 assert.throws(()=>resolveCommand(match,principal,cmd,{now:120,actions}),/expired/);
 assert.equal(match.random.draws,0);
});
test('rule exceptions discard mutations and RNG cursor atomically',()=>{
 const match=make(),before=structuredClone(match);
 const broken={...actions,choose:{...actions.choose,apply:gs=>{gs.players[0].hp=0;ruleRandom();throw Error('rule failed');}}};
 assert.throws(()=>resolveCommand(match,principal,command(match),{now:101,actions:broken}),/rule failed/);
 assert.deepEqual(match,before);
});
test('allowlisted views omit all other hands/decks/seeds/raw logs/private checkpoints and nested event data',()=>{
 const match=make();match.publicEvents=[{id:'e',type:'turnStarted',visibility:'public',seat:0,turn:1,beforePlayers:'poison'}, {type:'message',visibility:'public',text:'private-b'}];
 const host={handleForCard:(seat,id)=>`opaque-${seat}-${id==='private-a'?'one':'two'}`,actions};
 const own=projectMatch(match,principal,host),dead=projectMatch(match,{permission:'player',seat:2},host),spectator=projectMatch(match,{permission:'observer'},host);
 assert.equal(own.players[0].hand[0].name,'A');assert.equal(own.players[1].hand,undefined);
 assert.equal(dead.players[0].hand,undefined);assert.equal(spectator.players[0].role,undefined);
 for(const view of [own,dead,spectator])for(const secret of ['private-a','private-b','deck-secret','inspection-secret','taken-secret','secret-b','beforePlayers','algorithm','draws'])assert.equal(JSON.stringify(view).includes(secret),false,secret);
 assert.equal(spectator.decision.actions.length,0);assert.equal(dead.decision.actions.length,0);
 assert.equal(own.events.length,1);
});
test('explicit public hand and scoped legal peeks are visible only to authorized views',()=>{
 const match=make();match.state.players[1].revealHand=true;
 match.grants=[{viewerSeat:0,targetSeat:1,decisionId:match.decision.id,cards:[{id:'peek',name:'legally seen'}]}];
 const host={handleForCard:()=> 'opaque'};
 assert.equal(projectMatch(match,principal,host).peeks[0].cards[0].name,'legally seen');
 assert.equal(projectMatch(match,{permission:'player',seat:1},host).peeks.length,0);
 assert.equal(projectMatch(match,{permission:'observer'},host).players[1].hand[0].name,'B');
 match.decision.id='new';assert.equal(projectMatch(match,principal,host).peeks.length,0);
});
test('simultaneous replies merge by owned seat with one window and one final transition',()=>{
 const record=make();record.state.answers={};
 const concurrent={reply:{phases:['DECISION'],concurrent:true,payloadKeys:['cardId'],
  windowKey:gs=>gs.phase,authorize:(_gs,seat)=>[0,1].includes(seat),
  validate:(gs,seat,payload)=>!gs.answers[seat]&&gs.players[seat].hand.some(card=>card.id===payload.cardId),
  apply:(gs,seat,payload)=>{gs.answers[seat]=payload.cardId;if(Object.keys(gs.answers).length===2)gs.phase='DONE';return gs;}}};
 const first={...command(record),type:'reply',payload:{cardId:'private-a'}};
 const accepted=resolveCommand(record,principal,first,{now:101,actions:concurrent}).match;
 assert.deepEqual(accepted.decision,record.decision);
 assert.throws(()=>resolveCommand(accepted,{permission:'player',seat:1},{...first,actionId:'spoof',payload:{cardId:'private-a'}},{now:102,actions:concurrent}),/illegal_action/);
 const second={...first,actionId:'second',payload:{cardId:'private-b'}};
 const done=resolveCommand(accepted,{permission:'player',seat:1},second,{now:102,actions:concurrent}).match;
 assert.equal(done.state.phase,'DONE');assert.deepEqual(done.state.answers,{0:'private-a',1:'private-b'});
 assert.equal(done.revision,2);assert.notEqual(done.decision.id,record.decision.id);
 assert.equal(done.decision.deadline,122);
});
