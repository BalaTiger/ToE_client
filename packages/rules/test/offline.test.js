import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineRecord, encodeOfflineSave, decodeOfflineSave, storeOfflineSave, loadOfflineSave, dispatchOffline, OFFLINE_SAVE_KEY } from '../src/offline.js';
import { projectMatch } from '../src/authority/view.js';
import { nextRandom } from '../src/runtime.js';
const create=()=>createOfflineRecord({id:'offline:test',seed:32,now:100,expansionKey:'地神的潜影'});
test('offline initialization and save roundtrip need no DOM, socket or network and preserve local RNG cursor',()=>{
 const record=create(),restored=decodeOfflineSave(encodeOfflineSave(record));
 assert.deepEqual(restored,JSON.parse(JSON.stringify(record)));assert.equal(restored.state._isMP,false);
 assert.equal(nextRandom(restored.random),nextRandom(record.random));
});
test('online projections and canonical online records cannot be loaded as offline saves',()=>{
 const record=create(),view=projectMatch(record,{permission:'player',seat:0},{handleForCard:()=> 'opaque'});
 assert.throws(()=>decodeOfflineSave(JSON.stringify(view)),/Unsupported/);
 for(const record of [{...create(),origin:'online'},{...create(),state:{...create().state,_isMP:true}}])assert.throws(()=>decodeOfflineSave(JSON.stringify({schema:'toe.offline-save/v2',record})),/Invalid offline/);
});
test('new local save storage never reads, overwrites or removes an old-format key',()=>{
 const data=new Map([['toe.save','user-old-save-bytes']]);
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
 assert.equal(loadOfflineSave(storage),null);storeOfflineSave(storage,create());
 assert.equal(data.get('toe.save'),'user-old-save-bytes');assert.ok(data.has(OFFLINE_SAVE_KEY));
 assert.equal(loadOfflineSave(storage).origin,'offline');
});
test('offline human decisions do not inherit multiplayer response timeouts',()=>{
 const record=create();record.state.phase='LOCAL_CHOICE';record.state.currentTurn=0;record.state.gameOver=null;
 const actions={local:{phases:['LOCAL_CHOICE'],payloadKeys:[],authorize:(_state,seat)=>seat===0,apply:state=>({...state,phase:'ACTION'})}};
 const next=dispatchOffline(record,0,{type:'local',payload:{}},{now:record.decision.deadline+100000,actions});
 assert.equal(next.state.phase,'ACTION');
});
