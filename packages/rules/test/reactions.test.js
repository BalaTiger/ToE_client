import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { reactionActions } from '../src/authority/reactions.js';
import { createTsathogguaSlimeCard } from '../src/constants/card.js';
const player=(id,role)=>({id,name:`P${id}`,role,hp:10,san:10,hand:[],godZone:[],zoneCards:[],peekMemories:{},godName:null,godLevel:0,isDead:false});
function base(phase,abilityData){return {_isMP:true,phase,currentTurn:0,turn:1,_turnKey:1,skillUsed:true,
 players:[player(0,'寻宝者'),player(1,'追猎者'),player(2,'邪祀者')],deck:[],discard:[],inspectionDeck:[],inspectionDiscard:[],log:[],abilityData,_visualEvents:[]};}
const match=state=>createPrivateMatch({id:'actual-rules',state,seed:22,now:0,durationMs:20000});
function act(record,seat,type,payload,id='one'){
 return resolveCommand(record,{permission:'player',seat},{version:2,matchId:record.id,revision:record.revision,
 decisionId:record.decision.id,actionId:id,type,payload},{now:1,actions:reactionActions}).match;
}
test('actual slime rule balances only the responding seat and consumes one real slime',()=>{
 const gs=base('TSG_SLIME_BALANCE',{targetIdx:1,afterHp:8,afterSan:2,_turnOwner:0});
 gs.players[1].hp=8;gs.players[1].san=2;gs.players[1].hand=[createTsathogguaSlimeCard()];
 const record=match(gs),next=act(record,1,'slime.answer',{use:true});
 assert.deepEqual([next.state.players[1].hp,next.state.players[1].san],[5,5]);
 assert.equal(next.state.players[1].hand.length,0);assert.equal(next.state.currentTurn,0);assert.equal(next.state.phase,'ACTION');
 assert.equal(record.state.players[1].hand.length,1);
 assert.throws(()=>act(record,0,'slime.answer',{use:true}),/not_your_decision/);
});
test('slime creation or card consumption cannot be forged by payload',()=>{
 const record=match(base('TSG_SLIME_BALANCE',{targetIdx:1,_turnOwner:0}));
 assert.throws(()=>act(record,1,'slime.answer',{use:true}),/illegal_action/);
 assert.throws(()=>act(record,1,'slime.answer',{use:false,card:{isTsathogguaSlime:true}}),/invalid_command/);
});
test('etherealize keeps the target-selection window and consumes the stack only on legal target confirmation',()=>{
 const gs=base('ETHEREALIZE_DECISION',{targetIdx:1,lostHp:3,lostSan:0,adjacentTargets:[0,2],_turnOwner:0});
 gs.players[1].etherealizeStacks=1;
 const pending=act(match(gs),1,'etherealize.answer',{use:true});
 assert.equal(pending.state.phase,'ETHEREALIZE_SELECT_TARGET');assert.equal(pending.state.players[1].etherealizeStacks,1);
 assert.throws(()=>act(pending,1,'etherealize.redirect',{targetSeat:1},'two'),/illegal_action/);
 const done=act(pending,1,'etherealize.redirect',{targetSeat:2},'two');
 assert.equal(done.state.players[1].etherealizeStacks,0);assert.equal(done.state.players[1].hp,10);
 assert.equal(done.state.players[2].hp,7);assert.equal(done.state.currentTurn,0);assert.equal(done.state.phase,'ACTION');
});
