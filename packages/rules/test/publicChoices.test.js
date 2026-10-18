import test from 'node:test';
import assert from 'node:assert/strict';
import { publicChoiceActions } from '../src/authority/publicChoices.js';
import { createPrivateMatch, resolveCommand } from '../src/authority/command.js';
import { projectMatch } from '../src/authority/view.js';
const card=key=>({id:`real-${key}`,name:key,key,isZone:true,letter:key[0],number:Number(key[1])});
function initial(phase,abilityData){return createPrivateMatch({id:'choices',seed:12,now:0,state:{_isMP:true,currentTurn:0,_turnKey:1,turn:1,phase,
 players:['邪祀者','寻宝者','追猎者'].map((role,id)=>({id,name:`P${id}`,role,hp:10,san:10,hand:[],godZone:[],zoneCards:[],peekMemories:{},isDead:false})),
 deck:[],discard:[],inspectionDeck:[],inspectionDiscard:[],abilityData,log:[]}});}
function act(match,seat,type,payload){return resolveCommand(match,{permission:'player',seat},
 {version:2,matchId:match.id,revision:match.revision,decisionId:match.decision.id,actionId:`a${match.revision}`,type,payload},
 {now:1,actions:publicChoiceActions}).match;}
test('public pick applies the exact human card selection and advances only its picker',()=>{
 const record=initial('FIRST_COME_PICK_SELECT',{pickOrder:[1,2],pickIndex:0,revealedCards:[card('A1'),card('B2')],_turnOwner:0});
 assert.throws(()=>act(record,0,'publicPick.choose',{cardIndex:1}),/not_your_decision/);
 assert.throws(()=>act(record,1,'publicPick.choose',{cardIndex:99}),/illegal_action/);
 const next=act(record,1,'publicPick.choose',{cardIndex:1});
 assert.equal(next.state.players[1].hand[0].key,'B2');assert.equal(next.state.players[2].hand.length,0);
 assert.equal(next.state.abilityData.pickIndex,1);assert.equal(next.state.abilityData.revealedCards[0].key,'A1');
 const done=act(next,2,'publicPick.choose',{cardIndex:0});
 assert.equal(done.state.players[2].hand[0].key,'A1');assert.equal(done.state.currentTurn,0);
});
test('tortoise validates the offered key and moves matching cards without triggering their effects',()=>{
 const record=initial('TORTOISE_ORACLE_SELECT',{playerIndex:1,selectableKeys:['A','2'],revealedCards:[card('A1'),card('B2'),card('A4')],_turnOwner:0});
 assert.throws(()=>act(record,1,'tortoise.choose',{key:'D'}),/illegal_action/);
 const next=act(record,1,'tortoise.choose',{key:'A'});
 assert.deepEqual(next.state.players[1].hand.map(c=>c.key),['A1','A4']);assert.equal(next.state.discard[0].key,'B2');
 assert.equal(next.state.players[1].hp,10);
});
test('the authoritative public-gain boundary declares an actual completed treasure hand, never a client result',()=>{
 const record=initial('FIRST_COME_PICK_SELECT',{pickOrder:[1,2],pickIndex:0,revealedCards:[card('A1'),card('A2')],_turnOwner:0});
 record.state.players[1].hand=[card('B2'),card('C3'),card('D4')];
 const next=act(record,1,'publicPick.choose',{cardIndex:0});
 assert.equal(next.state.gameOver.winnerIdx,1);assert.equal(next.state.players[1].roleRevealed,true);
});
test('only explicitly public reveal phases expose the public-card array',()=>{
 const record=initial('TORTOISE_ORACLE_SELECT',{playerIndex:1,selectableKeys:['A'],revealedCards:[card('A1')]});
 const host={actions:publicChoiceActions,handleForCard:()=> 'opaque'};
 assert.equal(projectMatch(record,{permission:'observer'},host).publicReveals[0].key,'A1');
 record.state.phase='DECIPHER_STONE_CARVING';
 assert.equal(projectMatch(record,{permission:'observer'},host).publicReveals,undefined);
});
